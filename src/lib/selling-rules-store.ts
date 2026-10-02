import "server-only";

import { Client } from "pg";
import {
  EMPTY_SELLING_RULES_CONFIG,
  validateSellingRulesConfig,
  validateSellingRulesRevision,
  type SellingRulesConfig,
} from "@/lib/selling-rules";

// A company-wide document, never selected by a request, tenant, or account ID.
const COMPANY_SCOPE = "mo-tshirt-company-selling-rules-v1";
const HISTORY_LIMIT = 10;

export type SellingRulesHistoryEntry = {
  revision: number;
  updatedAt: string;
  updatedBy: string;
};
export type StoredSellingRules = {
  config: SellingRulesConfig;
  revision: number;
  updatedAt: string | null;
  updatedBy: string | null;
  history: SellingRulesHistoryEntry[];
};
export type SellingRulesActor = { userId: string; displayName: string };

export class SellingRulesRevisionConflictError extends Error {
  constructor() {
    super("Selling rules changed in another tab or device. Reload the latest rules before saving; your changes have not overwritten them.");
    this.name = "SellingRulesRevisionConflictError";
  }
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
  if (!databaseUrl) throw new Error("PostgreSQL connection string is not configured.");
  try {
    const url = new URL(databaseUrl);
    if (url.searchParams.get("sslmode") === "require") {
      url.searchParams.set("sslmode", "verify-full");
      return url.toString();
    }
  } catch {}
  return databaseUrl;
}

async function withSellingRulesClient<T>(callback: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: getDatabaseUrl(), connectionTimeoutMillis: 15_000, statement_timeout: 12_000 });
  try {
    await client.connect();
    // Independent tables: no legacy quotation, pricing, or personal data is changed.
    await client.query(`
      create table if not exists selling_rules_configs (
        scope text primary key,
        config jsonb not null,
        revision bigint not null check (revision > 0 and revision <= 9007199254740991),
        updated_at timestamptz not null default now(),
        actor_id text not null,
        updated_by text not null
      )
    `);
    // Immutable application history: only INSERT and SELECT are implemented.
    // Every version keeps its complete snapshot and authenticated actor identity.
    await client.query(`
      create table if not exists selling_rules_versions (
        scope text not null,
        revision bigint not null check (revision > 0 and revision <= 9007199254740991),
        config jsonb not null,
        updated_at timestamptz not null,
        actor_id text not null,
        updated_by text not null,
        primary key (scope, revision)
      )
    `);
    return await callback(client);
  } finally {
    await client.end().catch(() => null);
  }
}

type MetadataRow = { revision: string | number; updated_at: Date | string; updated_by: string };
type ConfigRow = MetadataRow & { config: unknown };

function metadataFromRow(row: MetadataRow): SellingRulesHistoryEntry {
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("Stored selling rules revision is invalid.");
  const date = new Date(row.updated_at);
  if (!Number.isFinite(date.getTime())) throw new Error("Stored selling rules update time is invalid.");
  if (typeof row.updated_by !== "string" || !row.updated_by.trim() || row.updated_by.length > 254) throw new Error("Stored selling rules actor is invalid.");
  return { revision, updatedAt: date.toISOString(), updatedBy: row.updated_by };
}

async function readSnapshot(client: Client, lock = false): Promise<StoredSellingRules> {
  const current = await client.query<ConfigRow>(
    `select config, revision, updated_at, updated_by from selling_rules_configs where scope = $1 limit 1${lock ? " for update" : ""}`,
    [COMPANY_SCOPE],
  );
  const versions = await client.query<MetadataRow>(
    "select revision, updated_at, updated_by from selling_rules_versions where scope = $1 order by revision desc limit $2",
    [COMPANY_SCOPE, HISTORY_LIMIT],
  );
  const history = versions.rows.map(metadataFromRow);
  if (!current.rows[0]) {
    if (history.length) throw new Error("Selling rules document is missing but audited versions remain.");
    return { config: validateSellingRulesConfig(EMPTY_SELLING_RULES_CONFIG), revision: 0, updatedAt: null, updatedBy: null, history: [] };
  }
  const metadata = metadataFromRow(current.rows[0]);
  if (!history[0] || history[0].revision !== metadata.revision || history[0].updatedAt !== metadata.updatedAt || history[0].updatedBy !== metadata.updatedBy) {
    throw new Error("Stored selling rules and audit history are inconsistent.");
  }
  return { config: validateSellingRulesConfig(current.rows[0].config), ...metadata, history };
}

export async function getStoredSellingRules(): Promise<StoredSellingRules> {
  return withSellingRulesClient(async (client) => {
    await client.query("begin isolation level repeatable read read only");
    try {
      const snapshot = await readSnapshot(client);
      await client.query("commit");
      return snapshot;
    } catch (error) {
      await client.query("rollback").catch(() => null);
      throw error;
    }
  });
}

export async function saveStoredSellingRules(
  value: SellingRulesConfig,
  expectedRevision: number,
  actor: SellingRulesActor,
): Promise<StoredSellingRules> {
  const config = validateSellingRulesConfig(value);
  const revision = validateSellingRulesRevision(expectedRevision);
  if (!actor || typeof actor.userId !== "string" || !actor.userId.trim() || actor.userId.length > 254) throw new Error("A valid signed-in actor is required.");
  if (typeof actor.displayName !== "string" || actor.displayName.length > 254) throw new Error("A valid signed-in actor label is required.");
  const actorLabel = actor.displayName.trim() || actor.userId;
  return withSellingRulesClient(async (client) => {
    await client.query("begin");
    try {
      // A failed or invalid current load never turns into an empty replacement.
      const existing = await readSnapshot(client, true);
      if (existing.revision !== revision) throw new SellingRulesRevisionConflictError();
      const result = revision === 0
        ? await client.query<ConfigRow>(`
            insert into selling_rules_configs (scope, config, revision, actor_id, updated_by)
            values ($1, $2::jsonb, 1, $3, $4)
            on conflict (scope) do nothing
            returning config, revision, updated_at, updated_by
          `, [COMPANY_SCOPE, JSON.stringify(config), actor.userId, actorLabel])
        : await client.query<ConfigRow>(`
            update selling_rules_configs
            set config = $2::jsonb, revision = revision + 1, updated_at = now(), actor_id = $4, updated_by = $5
            where scope = $1 and revision = $3
            returning config, revision, updated_at, updated_by
          `, [COMPANY_SCOPE, JSON.stringify(config), revision, actor.userId, actorLabel]);
      if (!result.rows[0]) throw new SellingRulesRevisionConflictError();
      const metadata = metadataFromRow(result.rows[0]);
      const savedConfig = validateSellingRulesConfig(result.rows[0].config);
      await client.query(`
        insert into selling_rules_versions (scope, revision, config, updated_at, actor_id, updated_by)
        values ($1, $2, $3::jsonb, $4, $5, $6)
      `, [COMPANY_SCOPE, metadata.revision, JSON.stringify(savedConfig), metadata.updatedAt, actor.userId, actorLabel]);
      await client.query("commit");
      return { config: savedConfig, ...metadata, history: [metadata, ...existing.history].slice(0, HISTORY_LIMIT) };
    } catch (error) {
      await client.query("rollback").catch(() => null);
      throw error;
    }
  });
}
