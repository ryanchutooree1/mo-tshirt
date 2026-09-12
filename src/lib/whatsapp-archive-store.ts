import { Pool } from "pg";
import { gunzipSync } from "node:zlib";
import { decryptArchiveBytes } from "./whatsapp-archive-crypto";
import type { WhatsAppArchive } from "./whatsapp-archive";

let pool: Pool | undefined;
function database() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Archive database is not configured.");
  pool ??= new Pool({ connectionString, max: 2, connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000, statement_timeout: 20_000 });
  return pool;
}

export async function loadWhatsAppArchive() {
  try {
    const result = await database().query<{ id: string; encrypted: Buffer }>(
      "SELECT id, encrypted FROM whatsapp_private.review_archives ORDER BY imported_at DESC, id DESC LIMIT 1");
    const row = result.rows[0];
    if (!row) return null;
    const compressed = decryptArchiveBytes(row.encrypted, `archive:${row.id}`);
    const archive = JSON.parse(gunzipSync(compressed, { maxOutputLength: 100 * 1024 * 1024 }).toString("utf8")) as WhatsAppArchive;
    if (archive.manifest.schemaVersion !== 1) throw new Error("Unsupported archive version.");
    return { id: row.id, archive, compressed };
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return null;
    throw error;
  }
}

