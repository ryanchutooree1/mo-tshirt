import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, "").split("=");
    return [key, value.join("=") || true];
  }),
);

const projectId = String(args.get("project") || "pocket-entreprise-app");
const sourceDatabase = String(args.get("source") || "(default)");
const targetDatabase = String(args.get("target") || "modatabase");
const execute = args.has("execute");
const pageSize = 300;
const maxBatchDocuments = 350;
const maxBatchBytes = 7_500_000;
const firestoreApi = "https://firestore.googleapis.com/v1";

if (sourceDatabase === targetDatabase) {
  throw new Error("Source and target databases must be different.");
}

function readFirebaseCliToken() {
  const configPath = path.join(
    os.homedir(),
    ".config",
    "configstore",
    "firebase-tools.json",
  );

  if (!fs.existsSync(configPath)) {
    throw new Error("Firebase CLI credentials were not found. Run `firebase login` first.");
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const accessToken = config.tokens?.access_token;
  if (!accessToken || Number(config.tokens?.expires_at || 0) <= Date.now()) {
    throw new Error(
      "The Firebase CLI access token is expired. Run `firebase projects:list`, then retry.",
    );
  }
  return accessToken;
}

const accessToken = readFirebaseCliToken();
const databaseResource = (database) =>
  `projects/${projectId}/databases/${database}`;
const databaseRoot = (database) =>
  `${firestoreApi}/${databaseResource(database)}`;
const documentsRoot = (database) => `${databaseRoot(database)}/documents`;
const encodeDocumentPath = (documentPath) =>
  documentPath.split("/").map(encodeURIComponent).join("/");

async function firestoreRequest(url, options = {}) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          ...options.headers,
        },
      });
      const body = await response.text();
      if (response.ok) return body ? JSON.parse(body) : {};
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`${response.status} ${response.statusText}: ${body}`);
      }
      if (attempt === 6) {
        throw new Error(`${response.status} ${response.statusText}: ${body}`);
      }
    } catch (error) {
      if (attempt === 6 || (/^\d{3} /.test(error.message) && !/^429 |^5\d\d /.test(error.message))) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
  }
}

async function listCollectionIds(database, parentDocumentPath = "") {
  const ids = [];
  let pageToken;
  do {
    const suffix = parentDocumentPath
      ? `/${encodeDocumentPath(parentDocumentPath)}:listCollectionIds`
      : ":listCollectionIds";
    const result = await firestoreRequest(`${documentsRoot(database)}${suffix}`, {
      method: "POST",
      body: JSON.stringify({ pageSize: 1_000, pageToken }),
    });
    ids.push(...(result.collectionIds || []));
    pageToken = result.nextPageToken;
  } while (pageToken);
  return ids.sort();
}

async function listCollectionDocuments(database, collectionPath) {
  const segments = collectionPath.split("/");
  const collectionId = segments.pop();
  const parentPath = segments.join("/");
  const url = new URL(
    `${documentsRoot(database)}${parentPath ? `/${encodeDocumentPath(parentPath)}` : ""}/${encodeURIComponent(collectionId)}`,
  );
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("showMissing", "true");

  const documents = [];
  let pageToken;
  do {
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    else url.searchParams.delete("pageToken");
    const result = await firestoreRequest(url);
    documents.push(...(result.documents || []));
    pageToken = result.nextPageToken;
  } while (pageToken);
  return documents;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function relativeDocumentPath(documentName) {
  return documentName.slice(documentName.indexOf("/documents/") + "/documents/".length);
}

function rewriteReferences(value) {
  if (Array.isArray(value)) return value.map(rewriteReferences);
  if (!value || typeof value !== "object") return value;

  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "referenceValue" && typeof child === "string") {
      result[key] = child.replace(
        `/databases/${sourceDatabase}/documents/`,
        `/databases/${targetDatabase}/documents/`,
      );
    } else {
      result[key] = rewriteReferences(child);
    }
  }
  return result;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function scanDatabase(database) {
  const documents = new Map();
  const collectionQueue = (await listCollectionIds(database)).map((id) => id);

  while (collectionQueue.length) {
    const collectionPaths = collectionQueue.splice(0, 20);
    const collectionResults = await Promise.all(
      collectionPaths.map((collectionPath) =>
        listCollectionDocuments(database, collectionPath),
      ),
    );
    const collectionDocuments = collectionResults.flat();
    for (const document of collectionDocuments) {
      const documentPath = relativeDocumentPath(document.name);
      if (document.createTime) {
        documents.set(documentPath, document.fields || {});
      }
    }
    const subcollectionResults = await mapWithConcurrency(
      collectionDocuments,
      30,
      (document) =>
        listCollectionIds(database, relativeDocumentPath(document.name)),
    );
    for (let index = 0; index < collectionDocuments.length; index += 1) {
      const documentPath = relativeDocumentPath(collectionDocuments[index].name);
      for (const subcollection of subcollectionResults[index]) {
        collectionQueue.push(`${documentPath}/${subcollection}`);
      }
    }
  }
  return documents;
}

async function getKnownDocuments(database, documentPaths) {
  const chunks = [];
  for (let index = 0; index < documentPaths.length; index += 200) {
    chunks.push(documentPaths.slice(index, index + 200));
  }
  const responses = await mapWithConcurrency(chunks, 5, (chunk) =>
    firestoreRequest(`${documentsRoot(database)}:batchGet`, {
      method: "POST",
      body: JSON.stringify({
        documents: chunk.map(
          (documentPath) =>
            `${databaseResource(database)}/documents/${documentPath}`,
        ),
      }),
    }),
  );
  const documents = new Map();
  for (const response of responses.flat()) {
    if (response.found) {
      documents.set(
        relativeDocumentPath(response.found.name),
        response.found.fields || {},
      );
    }
  }
  return documents;
}

async function commitWrites(writes) {
  if (!writes.length) return;
  await firestoreRequest(`${documentsRoot(targetDatabase)}:commit`, {
    method: "POST",
    body: JSON.stringify({ writes }),
  });
}

async function copyDocuments(sourceDocuments, targetDocuments) {
  const pendingDocuments = [...sourceDocuments].filter(([documentPath, fields]) =>
    canonicalJson(rewriteReferences(fields)) !==
    canonicalJson(targetDocuments.get(documentPath)),
  );
  let writes = [];
  let bytes = 0;
  let copied = 0;

  console.log(`Copying ${pendingDocuments.length} missing or changed documents.`);
  for (const [documentPath, fields] of pendingDocuments) {
    const write = {
      update: {
        name: `${databaseResource(targetDatabase)}/documents/${documentPath}`,
        fields: rewriteReferences(fields),
      },
    };
    const writeBytes = Buffer.byteLength(JSON.stringify(write));
    if (writes.length && (writes.length >= maxBatchDocuments || bytes + writeBytes > maxBatchBytes)) {
      await commitWrites(writes);
      copied += writes.length;
      console.log(`Copied ${copied}/${pendingDocuments.length} documents`);
      writes = [];
      bytes = 0;
    }
    writes.push(write);
    bytes += writeBytes;
  }
  await commitWrites(writes);
  copied += writes.length;
  console.log(`Copied ${copied}/${pendingDocuments.length} documents`);
}

function verify(sourceDocuments, targetDocuments) {
  const missing = [];
  const different = [];
  const unexpected = [];

  for (const [documentPath, sourceFields] of sourceDocuments) {
    if (!targetDocuments.has(documentPath)) missing.push(documentPath);
    else if (
      canonicalJson(rewriteReferences(sourceFields)) !==
      canonicalJson(targetDocuments.get(documentPath))
    ) {
      different.push(documentPath);
    }
  }
  for (const documentPath of targetDocuments.keys()) {
    if (!sourceDocuments.has(documentPath)) unexpected.push(documentPath);
  }

  if (missing.length || different.length || unexpected.length) {
    throw new Error(
      `Verification failed: ${missing.length} missing, ${different.length} different, ${unexpected.length} unexpected documents.`,
    );
  }
}

console.log(`Scanning ${projectId}/${sourceDatabase}...`);
const sourceDocuments = await scanDatabase(sourceDatabase);
console.log(`Found ${sourceDocuments.size} source documents.`);

const sourceDocumentPaths = [...sourceDocuments.keys()];
const initialTargetDocuments = await getKnownDocuments(
  targetDatabase,
  sourceDocumentPaths,
);
console.log(`Found ${initialTargetDocuments.size} matching target document paths.`);
if (initialTargetDocuments.size > 0 && !args.has("allow-nonempty-target")) {
  throw new Error("Target database is not empty. Pass --allow-nonempty-target to update it.");
}

if (!execute) {
  console.log("Dry run complete. Add --execute to copy and verify the documents.");
  process.exit(0);
}

await copyDocuments(sourceDocuments, initialTargetDocuments);
console.log(`Scanning ${projectId}/${targetDatabase} for verification...`);
const targetDocuments = await getKnownDocuments(targetDatabase, sourceDocumentPaths);
verify(sourceDocuments, targetDocuments);
console.log(`Verified ${targetDocuments.size} documents successfully.`);
