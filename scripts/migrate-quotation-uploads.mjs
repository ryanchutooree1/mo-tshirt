import nextEnv from "@next/env";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { loadEnvConfig } = nextEnv;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
loadEnvConfig(path.resolve(scriptDir, ".."));

const SOURCE_COLLECTION = "aiAssistantUploads";
const DESTINATION_COLLECTION = "quotationUploads";
const LEGACY_PATH = "/api/ai-assistant/uploads/";
const QUOTATION_PATH = "/api/quotation/uploads/";
const REFERENCE_COLLECTIONS = [
  "quotes",
  "aiAssistantSessions",
  "aiAssistantLeads",
  "aiAssistantFeedback",
];
const apiKey =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ||
  "AIzaSyAhNoYB-MsYIy0Sk0sc1zUE_3ctGSvv5nY";
const projectId =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
  "pocket-entreprise-app";
const databaseId =
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID?.trim() || "(default)";
const documentsBase = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;

async function firestoreRequest(pathname, init) {
  const separator = pathname.includes("?") ? "&" : "?";
  const response = await fetch(`${documentsBase}/${pathname}${separator}key=${encodeURIComponent(apiKey)}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `Firestore request failed (${response.status}).`);
  }
  return body;
}

async function listCollection(pathname) {
  const documents = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ pageSize: "300" });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await firestoreRequest(`${pathname}?${query.toString()}`);
    documents.push(...(Array.isArray(page.documents) ? page.documents : []));
    pageToken = typeof page.nextPageToken === "string" ? page.nextPageToken : "";
  } while (pageToken);
  return documents;
}

function documentId(document) {
  return String(document.name || "").split("/").pop() || "";
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
  return results;
}

async function writeDocument(pathname, fields) {
  await firestoreRequest(pathname, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

function replaceLegacyPaths(value) {
  if (!value || typeof value !== "object") return false;
  let changed = false;
  if (typeof value.stringValue === "string" && value.stringValue.includes(LEGACY_PATH)) {
    value.stringValue = value.stringValue.replaceAll(LEGACY_PATH, QUOTATION_PATH);
    changed = true;
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === "object" && replaceLegacyPaths(child)) changed = true;
  }
  return changed;
}

async function migrateUploads(apply) {
  const uploads = await listCollection(SOURCE_COLLECTION);
  const uploadsWithChunks = await mapWithConcurrency(uploads, 12, async (upload) => {
    const id = documentId(upload);
    const chunks = await listCollection(`${SOURCE_COLLECTION}/${encodeURIComponent(id)}/chunks`);
    return { upload, id, chunks };
  });

  if (apply) {
    await mapWithConcurrency(uploadsWithChunks, 6, async ({ upload, id, chunks }) => {
      await writeDocument(`${DESTINATION_COLLECTION}/${encodeURIComponent(id)}`, upload.fields || {});
      await mapWithConcurrency(chunks, 8, (chunk) =>
        writeDocument(
          `${DESTINATION_COLLECTION}/${encodeURIComponent(id)}/chunks/${encodeURIComponent(documentId(chunk))}`,
          chunk.fields || {}
        )
      );
    });
  }

  return {
    uploadCount: uploads.length,
    chunkCount: uploadsWithChunks.reduce((sum, entry) => sum + entry.chunks.length, 0),
  };
}

async function migrateReferences(apply) {
  const collectionUpdates = await Promise.all(REFERENCE_COLLECTIONS.map(async (collectionName) => {
    const documents = await listCollection(collectionName);
    const updates = [];
    for (const document of documents) {
      const fields = structuredClone(document.fields || {});
      if (!replaceLegacyPaths(fields)) continue;
      updates.push({ collectionName, id: documentId(document), fields });
    }
    return { collectionName, scanned: documents.length, updates };
  }));

  for (const entry of collectionUpdates) {
    console.log(`${entry.collectionName}: scanned ${entry.scanned}, pending ${entry.updates.length}`);
  }

  const updates = collectionUpdates.flatMap((entry) => entry.updates);
  if (apply) {
    await mapWithConcurrency(updates, 8, (update) =>
      writeDocument(`${update.collectionName}/${encodeURIComponent(update.id)}`, update.fields)
    );
  }
  return updates.length;
}

async function run() {
  const apply = process.argv.includes("--apply");
  const uploads = await migrateUploads(apply);
  console.log(
    `${SOURCE_COLLECTION}: ${uploads.uploadCount} uploads and ${uploads.chunkCount} chunks to migrate`
  );
  const referenceCount = await migrateReferences(apply);
  console.log(`Saved links needing updates: ${referenceCount}`);

  if (!apply) {
    console.log("Dry run only. Re-run with --apply after the new route is deployed.");
    return;
  }

  console.log(
    `Migration complete. ${DESTINATION_COLLECTION} is now authoritative; legacy data was retained for compatibility.`
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
