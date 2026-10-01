import "server-only";

import { Client } from "pg";
import {
  EMPTY_AI_EARNINGS_LEDGER,
  validateAiEarningsLedger,
  type AiEarningsLedger,
} from "@/lib/ai-earnings";

export type StoredAiEarningsLedger = {
  ledger: AiEarningsLedger;
  revision: number;
};

export class AiEarningsRevisionConflictError extends Error {
  constructor() {
    super(
      "Your ledger changed in another tab or device. Reload the latest version before saving again; your changes have not overwritten it.",
    );
    this.name = "AiEarningsRevisionConflictError";
  }
}

function getDatabaseUrl() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    "";
  if (!databaseUrl)
    throw new Error("PostgreSQL connection string is not configured.");
  try {
    const url = new URL(databaseUrl);
    if (url.searchParams.get("sslmode") === "require") {
      url.searchParams.set("sslmode", "verify-full");
      return url.toString();
    }
  } catch {}
  return databaseUrl;
}

async function withAiEarningsClient<T>(callback: (client: Client) => Promise<T>) {
  const client = new Client({
    connectionString: getDatabaseUrl(),
    connectionTimeoutMillis: 15_000,
    statement_timeout: 12_000,
  });
  try {
    await client.connect();
    // This document is independent of all legacy X5/Firestore collections.
    await client.query(`
      create table if not exists ai_earnings_ledgers (
        user_id text primary key,
        ledger jsonb not null,
        revision bigint not null check (revision > 0 and revision <= 9007199254740991),
        updated_at timestamptz not null default now()
      )
    `);
    return await callback(client);
  } finally {
    await client.end().catch(() => null);
  }
}

type LedgerRow = { ledger: unknown; revision: string | number };

function fromRow(row: LedgerRow): StoredAiEarningsLedger {
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw new Error("Stored ledger revision is invalid.");
  return { ledger: validateAiEarningsLedger(row.ledger), revision };
}

function validateUserId(userId: string) {
  if (typeof userId !== "string" || !userId.trim() || userId.length > 254) {
    throw new Error("A valid session user is required.");
  }
}

export async function getStoredAiEarningsLedger(
  userId: string,
): Promise<StoredAiEarningsLedger> {
  validateUserId(userId);
  return withAiEarningsClient(async (client) => {
    const result = await client.query<LedgerRow>(
      "select ledger, revision from ai_earnings_ledgers where user_id = $1 limit 1",
      [userId],
    );
    return result.rows[0]
      ? fromRow(result.rows[0])
      : { ledger: validateAiEarningsLedger(EMPTY_AI_EARNINGS_LEDGER), revision: 0 };
  });
}

export async function saveStoredAiEarningsLedger(
  userId: string,
  value: AiEarningsLedger,
  revision: number,
): Promise<StoredAiEarningsLedger> {
  validateUserId(userId);
  if (
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    revision >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error("Use a valid ledger revision.");
  }
  const ledger = validateAiEarningsLedger(value);
  return withAiEarningsClient(async (client) => {
    // Both first-save and later updates are atomic compare-and-swap operations.
    // A missing/stale document is never recreated or overwritten by an old tab.
    const result =
      revision === 0
        ? await client.query<LedgerRow>(
            `
          insert into ai_earnings_ledgers (user_id, ledger, revision)
          values ($1, $2::jsonb, 1)
          on conflict (user_id) do nothing
          returning ledger, revision
        `,
            [userId, JSON.stringify(ledger)],
          )
        : await client.query<LedgerRow>(
            `
          update ai_earnings_ledgers
          set ledger = $2::jsonb, revision = revision + 1, updated_at = now()
          where user_id = $1 and revision = $3
          returning ledger, revision
        `,
            [userId, JSON.stringify(ledger), revision],
          );
    if (!result.rows[0]) {
      // A lost response can safely retry exactly the same stable-ID document.
      const current = await client.query<LedgerRow>(
        "select ledger, revision from ai_earnings_ledgers where user_id = $1 limit 1", [userId],
      );
      if (current.rows[0]) {
        const saved = fromRow(current.rows[0]);
        if (JSON.stringify(saved.ledger) === JSON.stringify(ledger)) return saved;
      }
      throw new AiEarningsRevisionConflictError();
    }
    return fromRow(result.rows[0]);
  });
}
