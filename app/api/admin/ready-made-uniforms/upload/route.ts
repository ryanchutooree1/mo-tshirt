import { NextResponse } from "next/server";
import { doc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import sharp from "sharp";
import { isAdminRequest } from "@/lib/admin-request";
import { db } from "@/lib/firebase";

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const UPLOAD_CHUNK_SIZE = 700_000;
const MAX_STORED_IMAGE_DIMENSION = 1600;
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
  return `uniform-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function chunkString(value: string, size: number) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }
  return chunks;
}

async function prepareStoredImage(file: File) {
  const original = Buffer.from(await file.arrayBuffer());
  const optimizableTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

  if (!optimizableTypes.has(file.type)) {
    return {
      buffer: original,
      contentType: cleanString(file.type) || "application/octet-stream",
      filename: cleanString(file.name) || "uniform-image",
    };
  }

  const optimized = await sharp(original)
    .rotate()
    .resize({
      width: MAX_STORED_IMAGE_DIMENSION,
      height: MAX_STORED_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82, alphaQuality: 90, effort: 4 })
    .toBuffer();

  if (optimized.byteLength >= original.byteLength) {
    return {
      buffer: original,
      contentType: cleanString(file.type) || "application/octet-stream",
      filename: cleanString(file.name) || "uniform-image",
    };
  }

  const baseName = (cleanString(file.name) || "uniform-image").replace(/\.[^.]+$/, "");
  return {
    buffer: optimized,
    contentType: "image/webp",
    filename: `${baseName}.webp`,
  };
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
      return NextResponse.json(
        { error: "Only JPG, PNG, WEBP, GIF, AVIF, or SVG images are allowed." },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "Image file is empty." }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Image must be 6 MB or smaller." }, { status: 400 });
    }

    const uploadId = createUploadId();
    const prepared = await prepareStoredImage(file);
    const base64 = prepared.buffer.toString("base64");
    const chunks = chunkString(base64, UPLOAD_CHUNK_SIZE);

    await setDoc(doc(db, "shopUploads", uploadId), {
      uploadId,
      filename: prepared.filename,
      contentType: prepared.contentType,
      size: prepared.buffer.byteLength,
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
    });
  } catch (error) {
    console.error("ready-made-uniforms:admin:upload", error);
    const message = error instanceof Error ? error.message : "Failed to upload image.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
