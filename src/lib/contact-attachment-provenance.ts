import { collection, doc, getDoc, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  getQuotationUploadUrl,
  LEGACY_QUOTATION_UPLOAD_COLLECTION,
  QUOTATION_UPLOAD_COLLECTION,
} from "@/lib/quotation-upload-paths";
import { SITE_URL } from "@/lib/seo";

const MAX_RETAINED_FILE_BYTES = 5 * 1024 * 1024;
const MAX_RETAINED_TOTAL_BYTES = 15 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml", "image/heic", "image/heif", "application/pdf"]);
const MAX_RETAINED_ATTACHMENTS = 12;
const BACKGROUND_REMOVAL_METHODS = new Set(["already-transparent", "solid-color", "ai"]);

export type ContactAttachmentProvenance = {
  originalUrl?: string;
  originalFilename?: string;
  originalContentType?: string;
  originalSize?: number;
  originalProvenance?: string;
  backgroundRemovalMethod?: string;
};

type Attachment = ContactAttachmentProvenance & {
  role?: string;
  url?: string;
  filename?: string;
  contentType?: string;
  size?: number | null;
};

type CompletedUpload = {
  url: string;
  filename: string;
  contentType: string;
  size: number;
  sessionId: string;
};

export class AttachmentProvenanceError extends Error {
  constructor() {
    super("An original artwork upload could not be verified. Please upload the artwork again.");
  }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function managedUploadId(value: unknown) {
  const raw = clean(value);
  if (!raw || raw.length > 500 || raw.includes("\\")) throw new AttachmentProvenanceError();
  let url: URL;
  try {
    url = new URL(raw, SITE_URL);
  } catch {
    throw new AttachmentProvenanceError();
  }
  if (
    url.origin !== new URL(SITE_URL).origin || url.username || url.password ||
    url.search || url.hash || (!raw.startsWith("/") && !raw.startsWith("https://"))
  ) throw new AttachmentProvenanceError();
  const match = /^\/api\/(?:quotation|ai-assistant)\/uploads\/([a-zA-Z0-9_-]{1,200})$/.exec(url.pathname);
  if (!match) throw new AttachmentProvenanceError();
  return match[1];
}

async function readCompletedUpload(uploadId: string): Promise<CompletedUpload> {
  let snapshot = await getDoc(doc(db, QUOTATION_UPLOAD_COLLECTION, uploadId));
  if (!snapshot.exists()) {
    snapshot = await getDoc(doc(db, LEGACY_QUOTATION_UPLOAD_COLLECTION, uploadId));
  }
  if (!snapshot.exists()) throw new AttachmentProvenanceError();
  const record = snapshot.data() as Record<string, unknown>;
  const size = record.size;
  const filename = clean(record.filename);
  const contentType = clean(record.contentType);
  const sessionId = clean(record.sessionId);
  // Only completed browser uploads have a server-written completion marker. Older
  // direct uploads have no such marker and must not gain provenance retroactively.
  if (
    record.source !== "web-order-chunked-upload" || record.uploadState !== "ready" ||
    record.uploadId !== uploadId || !sessionId || !filename || !ALLOWED_CONTENT_TYPES.has(contentType) ||
    !Number.isSafeInteger(size) || Number(size) <= 0 || Number(size) > MAX_RETAINED_FILE_BYTES ||
    !Number.isSafeInteger(record.chunkCount) || Number(record.chunkCount) <= 0 ||
    record.chunkCount !== Math.ceil(Number(size) / (512 * 1024)) ||
    record.chunkSize !== 512 * 1024 || !clean(record.uploadedAtIso)
  ) throw new AttachmentProvenanceError();
  return { url: getQuotationUploadUrl(uploadId), filename, contentType, size: Number(size), sessionId };
}

function matchesMetadata(upload: CompletedUpload, filename: unknown, contentType: unknown, size: unknown) {
  return upload.filename === clean(filename) && upload.contentType === clean(contentType) &&
    typeof size === "number" && Number.isSafeInteger(size) && upload.size === size;
}

/** Validate storage references; the original/processing distinction is supplied
 * by the browser's untouched-File workflow, not a claim of server-side processing. */
export async function validateContactAttachmentProvenance<T extends Attachment>(
  entries: T[],
  remainingBytes = MAX_RETAINED_TOTAL_BYTES,
): Promise<T[]> {
  if (entries.length > MAX_RETAINED_ATTACHMENTS) throw new AttachmentProvenanceError();
  const pairedSubmission = entries.some((entry) => entry.originalProvenance === "client-upload");
  let retainedBytes = 0;
  const uploads = new Map<string, Promise<CompletedUpload>>();
  const read = (url: unknown) => {
    const id = managedUploadId(url);
    let result = uploads.get(id);
    if (!result) {
      result = readCompletedUpload(id).then((upload) => {
        retainedBytes += upload.size;
        if (retainedBytes > remainingBytes) throw new AttachmentProvenanceError();
        return upload;
      });
      uploads.set(id, result);
    }
    return result;
  };
  const result: T[] = [];
  for (const entry of entries) {
    const safe = { ...entry };
    delete safe.originalUrl;
    delete safe.originalFilename;
    delete safe.originalContentType;
    delete safe.originalSize;
    delete safe.originalProvenance;
    delete safe.backgroundRemovalMethod;
    // Backward-compatible legacy submissions do not acquire a trusted original
    // merely by including an old originalUrl or an unsupported provenance flag.
    if (entry.originalProvenance !== "client-upload") {
      // New paired submissions also count their final mockups and other current
      // uploads toward the existing total. Entirely legacy requests stay unchanged.
      if (pairedSubmission && entry.url) {
        const current = await read(entry.url);
        if (!matchesMetadata(current, entry.filename, entry.contentType, entry.size)) {
          throw new AttachmentProvenanceError();
        }
        safe.url = current.url;
      }
      result.push(safe);
      continue;
    }
    if (entry.role === "final-mockup") throw new AttachmentProvenanceError();
    const original = await read(entry.originalUrl);
    const current = await read(entry.url);
    if (
      original.sessionId !== current.sessionId ||
      !matchesMetadata(original, entry.originalFilename, entry.originalContentType, entry.originalSize) ||
      !matchesMetadata(current, entry.filename, entry.contentType, entry.size)
    ) throw new AttachmentProvenanceError();
    const method = entry.backgroundRemovalMethod;
    if (method && (
      !BACKGROUND_REMOVAL_METHODS.has(method) || !current.contentType.startsWith("image/") ||
      !original.contentType.startsWith("image/") ||
      (original.url === current.url && method !== "already-transparent")
    )) throw new AttachmentProvenanceError();
    result.push({
      ...safe,
      url: current.url,
      originalUrl: original.url,
      originalFilename: original.filename,
      originalContentType: original.contentType,
      originalSize: original.size,
      originalProvenance: "client-upload",
      ...(method ? { backgroundRemovalMethod: method } : {}),
    });
  }
  return result;
}

/** Preserve QuoteForm's submitted/display email attachments after its move to
 * upload links. Read only validated managed storage; never fetch a submitted URL. */
export async function readContactEmailAttachments(entries: Attachment[]) {
  const files: { filename: string; content: Buffer; contentType: string }[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const entry of entries) {
    if (entry.originalProvenance !== "client-upload") continue;
    const id = managedUploadId(entry.url);
    if (seen.has(id)) continue;
    seen.add(id);
    if (seen.size > MAX_RETAINED_ATTACHMENTS) throw new AttachmentProvenanceError();
    const expectedSize = entry.size;
    if (!Number.isSafeInteger(expectedSize) || !expectedSize || expectedSize < 0 || expectedSize > MAX_RETAINED_FILE_BYTES) {
      throw new AttachmentProvenanceError();
    }
    totalBytes += expectedSize;
    if (totalBytes > MAX_RETAINED_TOTAL_BYTES) throw new AttachmentProvenanceError();
    // The validator checked ready/chunked metadata. Bound the read to one more
    // than its expected chunk count so extra/missing data fails closed.
    const expectedCount = Math.ceil(expectedSize / (512 * 1024));
    let chunks = await getDocs(query(
      collection(db, QUOTATION_UPLOAD_COLLECTION, id, "chunks"), orderBy("index", "asc"), limit(expectedCount + 1),
    ));
    if (chunks.empty) {
      chunks = await getDocs(query(
        collection(db, LEGACY_QUOTATION_UPLOAD_COLLECTION, id, "chunks"), orderBy("index", "asc"), limit(expectedCount + 1),
      ));
    }
    if (chunks.docs.length !== expectedCount) throw new AttachmentProvenanceError();
    const buffers = chunks.docs.map((chunk, index) => {
      const data = chunk.data() as Record<string, unknown>;
      const expectedChunkBytes = Math.min(512 * 1024, expectedSize - index * 512 * 1024);
      if (
        data.index !== index || data.byteSize !== expectedChunkBytes ||
        typeof data.data !== "string" || data.data.length !== 4 * Math.ceil(expectedChunkBytes / 3)
      ) throw new AttachmentProvenanceError();
      const buffer = Buffer.from(data.data, "base64");
      if (buffer.byteLength !== expectedChunkBytes) throw new AttachmentProvenanceError();
      return buffer;
    });
    files.push({
      filename: entry.filename || "attachment",
      contentType: entry.contentType || "application/octet-stream",
      content: Buffer.concat(buffers),
    });
  }
  return files;
}
