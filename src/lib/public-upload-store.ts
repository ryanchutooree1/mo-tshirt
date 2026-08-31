import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  getQuotationUploadUrl,
  LEGACY_QUOTATION_UPLOAD_COLLECTION,
  QUOTATION_UPLOAD_COLLECTION,
} from "@/lib/quotation-upload-paths";

const CHUNK_SIZE = 700_000;
const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const PUBLIC_UPLOAD_CHUNK_BYTES = 512 * 1024;

type StorePublicUploadInput = {
  buffer: Buffer | Uint8Array;
  filename: string;
  contentType?: string | null;
  size?: number | null;
  sessionId?: string | null;
  sessionPrefix?: string;
  source: string;
  maxUploadBytes?: number;
};

type StartPublicChunkedUploadInput = {
  filename: string;
  contentType?: string | null;
  size: number;
  sessionId?: string | null;
  sessionPrefix?: string;
  source: string;
  maxUploadBytes?: number;
};

type PublicUploadChunkInput = {
  uploadId: string;
  uploadToken: string;
  index: number;
  buffer: Buffer | Uint8Array;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizePublicUploadSessionId(
  value: unknown,
  fallbackPrefix = "web-order"
) {
  const cleaned = cleanString(value);
  const prefix = fallbackPrefix.replace(/[^a-z0-9-]/gi, "") || "web-order";

  if (!cleaned) return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  if (cleaned.startsWith(`${prefix}-`)) return cleaned;

  return `${prefix}-${cleaned.replace(/[^a-z0-9-]/gi, "").slice(0, 32) || crypto.randomUUID().slice(0, 8)}`;
}

function splitIntoChunks(value: string, size: number) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }
  return chunks;
}

async function hashUploadToken(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Buffer.from(digest).toString("hex");
}

async function readAuthorizedChunkedUpload(uploadId: string, uploadToken: string) {
  const cleanedUploadId = cleanString(uploadId);
  const cleanedUploadToken = cleanString(uploadToken);

  if (!cleanedUploadId || !cleanedUploadToken) {
    throw new Error("Invalid upload authorization.");
  }

  const currentUploadRef = doc(db, QUOTATION_UPLOAD_COLLECTION, cleanedUploadId);
  const currentUploadSnap = await getDoc(currentUploadRef);
  let uploadRef = currentUploadRef;
  let uploadSnap = currentUploadSnap;
  if (!currentUploadSnap.exists()) {
    uploadRef = doc(db, LEGACY_QUOTATION_UPLOAD_COLLECTION, cleanedUploadId);
    uploadSnap = await getDoc(uploadRef);
  }
  if (!uploadSnap.exists()) throw new Error("Upload not found.");

  const upload = uploadSnap.data() as Record<string, unknown>;
  const expectedTokenHash = cleanString(upload.uploadTokenHash);
  const suppliedTokenHash = await hashUploadToken(cleanedUploadToken);
  if (!expectedTokenHash || expectedTokenHash !== suppliedTokenHash) {
    throw new Error("Invalid upload authorization.");
  }

  return { upload, uploadRef };
}

export async function startPublicChunkedUpload(
  input: StartPublicChunkedUploadInput
) {
  const maxUploadBytes = input.maxUploadBytes || DEFAULT_MAX_UPLOAD_BYTES;
  const size =
    typeof input.size === "number" && Number.isFinite(input.size)
      ? Math.floor(input.size)
      : 0;

  if (!size || size > maxUploadBytes) {
    throw new Error("Upload is empty or too large.");
  }

  const sessionId = normalizePublicUploadSessionId(
    input.sessionId,
    input.sessionPrefix || "web-order"
  );
  const uploadId = `${sessionId}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const uploadToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const filename = cleanString(input.filename) || "upload";
  const contentType = cleanString(input.contentType) || "application/octet-stream";
  const chunkCount = Math.ceil(size / PUBLIC_UPLOAD_CHUNK_BYTES);
  const nowIso = new Date().toISOString();

  await setDoc(doc(db, QUOTATION_UPLOAD_COLLECTION, uploadId), {
    uploadId,
    sessionId,
    filename,
    contentType,
    size,
    chunkCount,
    chunkSize: PUBLIC_UPLOAD_CHUNK_BYTES,
    source: input.source,
    uploadState: "uploading",
    uploadTokenHash: await hashUploadToken(uploadToken),
    createdAt: serverTimestamp(),
    createdAtIso: nowIso,
  });

  return {
    uploadId,
    uploadToken,
    sessionId,
    filename,
    contentType,
    size,
    chunkCount,
    chunkSize: PUBLIC_UPLOAD_CHUNK_BYTES,
  };
}

export async function storePublicUploadChunk(input: PublicUploadChunkInput) {
  const { upload, uploadRef } = await readAuthorizedChunkedUpload(
    input.uploadId,
    input.uploadToken
  );
  const buffer = Buffer.isBuffer(input.buffer)
    ? input.buffer
    : Buffer.from(input.buffer);
  const chunkCount = Number(upload.chunkCount);
  const index = Number.isInteger(input.index) ? input.index : -1;

  if (upload.uploadState !== "uploading") {
    throw new Error("Upload is no longer accepting data.");
  }
  if (index < 0 || index >= chunkCount) {
    throw new Error("Invalid upload chunk.");
  }
  if (!buffer.byteLength || buffer.byteLength > PUBLIC_UPLOAD_CHUNK_BYTES) {
    throw new Error("Upload chunk is empty or too large.");
  }

  await setDoc(
    doc(uploadRef, "chunks", String(index).padStart(4, "0")),
    {
      index,
      byteSize: buffer.byteLength,
      data: buffer.toString("base64"),
    }
  );

  return { index, byteSize: buffer.byteLength };
}

export async function completePublicChunkedUpload(
  uploadId: string,
  uploadToken: string
) {
  const { upload, uploadRef } = await readAuthorizedChunkedUpload(
    uploadId,
    uploadToken
  );
  const chunksSnap = await getDocs(collection(uploadRef, "chunks"));
  const expectedChunkCount = Number(upload.chunkCount);
  const expectedSize = Number(upload.size);
  const chunks = chunksSnap.docs.map((chunk) => chunk.data() as Record<string, unknown>);
  const indexes = new Set(chunks.map((chunk) => Number(chunk.index)));
  const totalBytes = chunks.reduce((sum, chunk) => sum + Number(chunk.byteSize || 0), 0);

  if (
    upload.uploadState !== "uploading" ||
    chunks.length !== expectedChunkCount ||
    indexes.size !== expectedChunkCount ||
    totalBytes !== expectedSize
  ) {
    throw new Error("Upload is incomplete.");
  }

  const uploadedAt = new Date().toISOString();
  await updateDoc(uploadRef, {
    uploadState: "ready",
    uploadTokenHash: null,
    uploadedAt: serverTimestamp(),
    uploadedAtIso: uploadedAt,
  });

  return {
    uploadId: cleanString(upload.uploadId),
    sessionId: cleanString(upload.sessionId),
    filename: cleanString(upload.filename) || "upload",
    contentType: cleanString(upload.contentType) || "application/octet-stream",
    size: expectedSize,
    uploadedAt,
    url: getQuotationUploadUrl(cleanString(upload.uploadId)),
  };
}

export async function storePublicUploadBuffer(input: StorePublicUploadInput) {
  const buffer = Buffer.isBuffer(input.buffer)
    ? input.buffer
    : Buffer.from(input.buffer);
  const maxUploadBytes = input.maxUploadBytes || DEFAULT_MAX_UPLOAD_BYTES;

  if (!buffer.byteLength || buffer.byteLength > maxUploadBytes) {
    throw new Error("Upload is empty or too large.");
  }

  const sessionId = normalizePublicUploadSessionId(
    input.sessionId,
    input.sessionPrefix || "web-order"
  );
  const uploadId = `${sessionId}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const filename = cleanString(input.filename) || "upload";
  const contentType = cleanString(input.contentType) || "application/octet-stream";
  const size =
    typeof input.size === "number" && Number.isFinite(input.size)
      ? input.size
      : buffer.byteLength;
  const base64 = buffer.toString("base64");
  const chunks = splitIntoChunks(base64, CHUNK_SIZE);
  const nowIso = new Date().toISOString();

  await setDoc(doc(db, QUOTATION_UPLOAD_COLLECTION, uploadId), {
    uploadId,
    sessionId,
    filename,
    contentType,
    size,
    chunkCount: chunks.length,
    source: input.source,
    createdAt: serverTimestamp(),
    createdAtIso: nowIso,
  });

  const batch = writeBatch(db);
  chunks.forEach((chunk, index) => {
    batch.set(
      doc(
        db,
        QUOTATION_UPLOAD_COLLECTION,
        uploadId,
        "chunks",
        String(index).padStart(4, "0")
      ),
      {
        index,
        data: chunk,
      }
    );
  });
  await batch.commit();

  return {
    uploadId,
    sessionId,
    filename,
    contentType,
    size,
    uploadedAt: nowIso,
    url: getQuotationUploadUrl(uploadId),
  };
}
