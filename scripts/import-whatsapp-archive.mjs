// Run with Node 22: node --env-file=/secure/server.env scripts/import-whatsapp-archive.mjs /path/to/export [--write]
import { readFile } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { Client } from "pg";
import { encryptArchiveBytes, decryptArchiveBytes } from "../src/lib/whatsapp-archive-crypto.ts";

const folder = process.argv[2];
if (!folder) throw new Error("Supply the extracted archive directory. Add --write to persist it.");
const directory = resolve(folder);
const input = await readFile(resolve(directory, "archive.json"));
const archive = JSON.parse(input);
if (archive.manifest?.schemaVersion !== 1) throw new Error("Unsupported archive schema.");
for (const name of ["chats", "messages", "contacts", "calls", "files"]) {
  if (!Array.isArray(archive[name]) || archive[name].length !== archive.manifest.counts[name]) throw new Error(`Invalid ${name} count.`);
  if (new Set(archive[name].map(row => row.id)).size !== archive[name].length) throw new Error(`Duplicate ${name} IDs.`);
}
const id = createHash("sha256").update(input).digest("hex");
const compressed = gzipSync(input);
const encrypted = encryptArchiveBytes(compressed, `archive:${id}`);
if (!decryptArchiveBytes(encrypted, `archive:${id}`).equals(compressed)) throw new Error("Archive encryption verification failed.");
const files = [];
for (const metadata of archive.files) {
  if (!/^[a-f0-9]{24}$/.test(metadata.id) || basename(metadata.storedName) !== metadata.storedName) throw new Error("Invalid file name.");
  const filePath = resolve(directory, "files", metadata.storedName);
  if (dirname(filePath) !== resolve(directory, "files")) throw new Error("Invalid file path.");
  const content = await readFile(filePath);
  if (content.length !== metadata.bytes || createHash("sha256").update(content).digest("hex") !== metadata.sha256) throw new Error(`File integrity mismatch: ${metadata.id}`);
  files.push({ id: metadata.id, encrypted: encryptArchiveBytes(content, `file:${id}:${metadata.id}`) });
}
if (!process.argv.includes("--write")) {
  console.log(JSON.stringify({ validated: true, archiveId: id, counts: archive.manifest.counts,
    compressedBytes: compressed.length, mode: "dry-run" }));
} else {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA IF NOT EXISTS whatsapp_private");
    await client.query("REVOKE ALL ON SCHEMA whatsapp_private FROM PUBLIC");
    await client.query(`CREATE TABLE IF NOT EXISTS whatsapp_private.review_archives (
      id text PRIMARY KEY, imported_at timestamptz NOT NULL DEFAULT now(), encrypted bytea NOT NULL)`);
    await client.query(`CREATE TABLE IF NOT EXISTS whatsapp_private.review_files (
      archive_id text NOT NULL REFERENCES whatsapp_private.review_archives(id), id text NOT NULL,
      encrypted bytea NOT NULL, PRIMARY KEY (archive_id, id))`);
    await client.query("REVOKE ALL ON ALL TABLES IN SCHEMA whatsapp_private FROM PUBLIC");
    await client.query("ALTER TABLE whatsapp_private.review_archives ENABLE ROW LEVEL SECURITY");
    await client.query("ALTER TABLE whatsapp_private.review_files ENABLE ROW LEVEL SECURITY");
    const inserted = await client.query("INSERT INTO whatsapp_private.review_archives (id, encrypted) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id", [id, encrypted]);
    if (inserted.rowCount) {
      for (let start = 0; start < files.length; start += 20) {
        const batch = files.slice(start, start + 20);
        const values = batch.flatMap(file => [id, file.id, file.encrypted]);
        const tuples = batch.map((_, index) => `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3})`).join(",");
        await client.query(`INSERT INTO whatsapp_private.review_files (archive_id, id, encrypted) VALUES ${tuples}`, values);
      }
    }
    const stored = await client.query("SELECT encrypted FROM whatsapp_private.review_archives WHERE id = $1", [id]);
    if (!decryptArchiveBytes(stored.rows[0].encrypted, `archive:${id}`).equals(compressed)) throw new Error("Stored archive verification failed.");
    const count = await client.query("SELECT count(*)::int AS count FROM whatsapp_private.review_files WHERE archive_id = $1", [id]);
    if (count.rows[0].count !== files.length) throw new Error("Stored file count mismatch.");
    await client.query("COMMIT");
    console.log(JSON.stringify({ imported: true, alreadyPresent: !inserted.rowCount, archiveId: id, counts: archive.manifest.counts }));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    // Do not expose URLs, credentials, or source data in errors.
    console.error(`Archive import failed (${error.code || error.name || "unknown"}). No partial import was committed.`);
    process.exitCode = 1;
  } finally { await client.end(); }
}
