import "server-only";

import { Client } from "pg";
import {
  EMPTY_AURA_WORKSPACE,
  validateAuraWorkspace,
  type AuraWorkspace,
} from "@/lib/aura";

export type StoredAuraWorkspace = {
  workspace: AuraWorkspace;
  revision: number;
};

export class AuraRevisionConflictError extends Error {
  constructor() {
    super(
      "Your workspace changed in another tab or device. Reload the latest version before saving again; your changes have not overwritten it.",
    );
    this.name = "AuraRevisionConflictError";
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

async function withAuraClient<T>(callback: (client: Client) => Promise<T>) {
  const client = new Client({
    connectionString: getDatabaseUrl(),
    connectionTimeoutMillis: 15_000,
    statement_timeout: 12_000,
  });
  try {
    await client.connect();
    // This document is independent of all legacy X5/Firestore collections.
    await client.query(`
      create table if not exists aura_workspaces (
        user_id text primary key,
        workspace jsonb not null,
        revision bigint not null check (revision > 0 and revision <= 9007199254740991),
        updated_at timestamptz not null default now()
      )
    `);
    return await callback(client);
  } finally {
    await client.end().catch(() => null);
  }
}

type WorkspaceRow = { workspace: unknown; revision: string | number };

function fromRow(row: WorkspaceRow): StoredAuraWorkspace {
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw new Error("Stored workspace revision is invalid.");
  return { workspace: validateAuraWorkspace(row.workspace), revision };
}

function validateUserId(userId: string) {
  if (typeof userId !== "string" || !userId.trim() || userId.length > 254) {
    throw new Error("A valid session user is required.");
  }
}

export async function getStoredAuraWorkspace(
  userId: string,
): Promise<StoredAuraWorkspace> {
  validateUserId(userId);
  return withAuraClient(async (client) => {
    const result = await client.query<WorkspaceRow>(
      "select workspace, revision from aura_workspaces where user_id = $1 limit 1",
      [userId],
    );
    return result.rows[0]
      ? fromRow(result.rows[0])
      : { workspace: validateAuraWorkspace(EMPTY_AURA_WORKSPACE), revision: 0 };
  });
}

export async function saveStoredAuraWorkspace(
  userId: string,
  value: AuraWorkspace,
  revision: number,
): Promise<StoredAuraWorkspace> {
  validateUserId(userId);
  if (
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    revision >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error("Use a valid workspace revision.");
  }
  const workspace = validateAuraWorkspace(value);
  return withAuraClient(async (client) => {
    // Both first-save and later updates are atomic compare-and-swap operations.
    // A missing/stale document is never recreated or overwritten by an old tab.
    const result =
      revision === 0
        ? await client.query<WorkspaceRow>(
            `
          insert into aura_workspaces (user_id, workspace, revision)
          values ($1, $2::jsonb, 1)
          on conflict (user_id) do nothing
          returning workspace, revision
        `,
            [userId, JSON.stringify(workspace)],
          )
        : await client.query<WorkspaceRow>(
            `
          update aura_workspaces
          set workspace = $2::jsonb, revision = revision + 1, updated_at = now()
          where user_id = $1 and revision = $3
          returning workspace, revision
        `,
            [userId, JSON.stringify(workspace), revision],
          );
    if (!result.rows[0]) throw new AuraRevisionConflictError();
    return fromRow(result.rows[0]);
  });
}
