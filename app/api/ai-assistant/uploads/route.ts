import { NextResponse } from "next/server";
import { doc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const CHUNK_SIZE = 700_000;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSessionId(value: string) {
  const cleaned = cleanString(value);
  if (!cleaned) return `web-order-${crypto.randomUUID().slice(0, 8)}`;
  if (cleaned.startsWith("web-order-")) return cleaned;
  return `web-order-${cleaned.replace(/[^a-z0-9-]/gi, "").slice(0, 32) || crypto.randomUUID().slice(0, 8)}`;
}

function splitIntoChunks(value: string, size: number) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }
  return chunks;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const sessionId = normalizeSessionId(cleanString(formData.get("sessionId")));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    if (!file.size || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File must be 10 MB or smaller." }, { status: 400 });
    }

    const uploadId = `${sessionId}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const chunks = splitIntoChunks(base64, CHUNK_SIZE);
    const metaRef = doc(db, "aiAssistantUploads", uploadId);
    const nowIso = new Date().toISOString();

    await setDoc(metaRef, {
      uploadId,
      sessionId,
      filename: file.name,
      contentType: file.type || null,
      size: file.size || null,
      chunkCount: chunks.length,
      source: "web-order-upload",
      createdAt: serverTimestamp(),
      createdAtIso: nowIso,
    });

    const batch = writeBatch(db);
    chunks.forEach((chunk, index) => {
      batch.set(doc(db, "aiAssistantUploads", uploadId, "chunks", String(index).padStart(4, "0")), {
        index,
        data: chunk,
      });
    });
    await batch.commit();

    return NextResponse.json({
      attachment: {
        name: file.name,
        url: `/api/ai-assistant/uploads/${encodeURIComponent(uploadId)}`,
        contentType: file.type || null,
        size: file.size || null,
        uploadedAt: nowIso,
      },
      sessionId,
    });
  } catch (error) {
    console.error("ai-assistant:public-upload", error);
    return NextResponse.json({ error: "Failed to upload logo." }, { status: 500 });
  }
}
