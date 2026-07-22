import { NextResponse } from "next/server";
import { doc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { isAdminRequest } from "@/lib/admin-request";
import { db } from "@/lib/firebase";
import { createProductThumbnail, prepareProductImage } from "@/lib/prepare-product-image";

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const UPLOAD_CHUNK_SIZE = 700_000;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
]);

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function createUploadId() {
  return `shop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function chunkString(value: string, size: number) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }
  return chunks;
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Only JPG, PNG, WEBP, GIF, AVIF, or SVG images are allowed." }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "Image file is empty." }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Image must be 6 MB or smaller." }, { status: 400 });
    }

    const uploadId = createUploadId();
    const prepared = await prepareProductImage(file);
    const thumbnail = await createProductThumbnail(prepared.buffer, prepared.contentType);
    const base64 = prepared.buffer.toString("base64");
    const chunks = chunkString(base64, UPLOAD_CHUNK_SIZE);

    await setDoc(doc(db, "shopUploads", uploadId), {
      uploadId,
      filename: prepared.filename,
      contentType: prepared.contentType,
      size: prepared.buffer.byteLength,
      thumbnailBase64: thumbnail?.buffer.toString("base64") || null,
      thumbnailContentType: thumbnail?.contentType || null,
      thumbnailSize: thumbnail?.buffer.byteLength || null,
      chunkCount: chunks.length,
      createdAt: serverTimestamp(),
      createdAtIso: new Date().toISOString(),
    });

    const batch = writeBatch(db);
    chunks.forEach((chunk, index) => {
      batch.set(doc(db, "shopUploads", uploadId, "chunks", String(index).padStart(4, "0")), {
        index,
        data: chunk,
      });
    });
    await batch.commit();

    return NextResponse.json({
      ok: true,
      uploadId,
      url: `/api/shops/uploads/${encodeURIComponent(uploadId)}`,
      thumbnailDataUrl: thumbnail
        ? `data:${thumbnail.contentType};base64,${thumbnail.buffer.toString("base64")}`
        : null,
    });
  } catch (error) {
    console.error("shops:admin:upload", error);
    const message = error instanceof Error ? error.message : "Failed to upload image.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
