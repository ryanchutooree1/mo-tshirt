import { doc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";

const CHUNK_SIZE = 700_000;
const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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

  await setDoc(doc(db, "aiAssistantUploads", uploadId), {
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
        "aiAssistantUploads",
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
    url: `/api/ai-assistant/uploads/${encodeURIComponent(uploadId)}`,
  };
}
