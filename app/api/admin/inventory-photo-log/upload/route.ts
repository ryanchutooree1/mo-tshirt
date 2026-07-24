import { NextResponse } from "next/server";
import {
  doc,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import sharp from "sharp";
import { db } from "@/lib/firebase";
import {
  getAdminRequestSession,
  isAdminRequest,
} from "@/lib/admin-request";
import { prepareProductImage } from "@/lib/prepare-product-image";
import {
  INVENTORY_PHOTO_LOG_COLLECTION,
  INVENTORY_PHOTO_SYSTEM_COLLECTION,
  INVENTORY_PHOTO_UPLOADS_COLLECTION,
  mapInventoryPhotoLogItem,
  parseExifDateTime,
} from "@/lib/inventory-photo-log";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const UPLOAD_CHUNK_SIZE = 700_000;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
]);
const ALLOWED_IMAGE_EXTENSIONS = /\.(avif|heic|heif|jpe?g|png|webp)$/i;

function cleanString(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function chunkString(value: string, size: number) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }
  return chunks;
}

function isAllowedImage(file: File) {
  return (
    ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase()) ||
    ALLOWED_IMAGE_EXTENSIONS.test(file.name)
  );
}

async function prepareInventoryPhoto(
  file: File,
  originalBuffer: Buffer,
  detectedFormat: string | undefined
) {
  if (
    detectedFormat === "heif" ||
    /hei[cf]/i.test(file.type) ||
    /\.(heic|heif)$/i.test(file.name)
  ) {
    const buffer = await sharp(originalBuffer)
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, alphaQuality: 90, effort: 4 })
      .toBuffer();
    const baseName = cleanString(file.name, 240).replace(/\.[^.]+$/, "");
    return {
      buffer,
      contentType: "image/webp",
      filename: `${baseName || "inventory-photo"}.webp`,
    };
  }

  return prepareProductImage(file);
}

async function getNextTemporaryName() {
  const counterRef = doc(
    db,
    INVENTORY_PHOTO_SYSTEM_COLLECTION,
    "temporary-name-counter"
  );

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(counterRef);
    const current = Number(snapshot.data()?.lastNumber);
    const next = Number.isFinite(current) ? Math.floor(current) + 1 : 1;
    transaction.set(
      counterRef,
      {
        lastNumber: next,
        updatedAt: serverTimestamp(),
        updatedAtIso: new Date().toISOString(),
      },
      { merge: true }
    );
    return `Unsorted Item ${String(next).padStart(3, "0")}`;
  });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest("/api/admin/inventory-photo-log/upload"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const session = await getAdminRequestSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const quickName = cleanString(form.get("productName"));

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Choose or take a product photo." },
        { status: 400 }
      );
    }
    if (!isAllowedImage(file)) {
      return NextResponse.json(
        { error: "Use a JPG, PNG, WEBP, AVIF, HEIC, or HEIF photo." },
        { status: 400 }
      );
    }
    if (file.size <= 0) {
      return NextResponse.json(
        { error: "The selected photo is empty." },
        { status: 400 }
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Photo must be 10 MB or smaller." },
        { status: 400 }
      );
    }

    const originalBuffer = Buffer.from(await file.arrayBuffer());
    let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
    try {
      metadata = await sharp(originalBuffer).metadata();
    } catch {
      return NextResponse.json(
        { error: "This photo is damaged or uses an unsupported image format." },
        { status: 400 }
      );
    }
    const exifDateTime = parseExifDateTime(metadata.exif);

    const productName = quickName || (await getNextTemporaryName());
    const isTemporaryName = !quickName;
    const uploadedAtIso = new Date().toISOString();
    const recordId = `photo-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    const uploadId = `inventory-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    const prepared = await prepareInventoryPhoto(
      file,
      originalBuffer,
      metadata.format
    );
    const chunks = chunkString(
      prepared.buffer.toString("base64"),
      UPLOAD_CHUNK_SIZE
    );
    const uploadRef = doc(db, INVENTORY_PHOTO_UPLOADS_COLLECTION, uploadId);
    const recordRef = doc(db, INVENTORY_PHOTO_LOG_COLLECTION, recordId);
    const batch = writeBatch(db);

    batch.set(uploadRef, {
      uploadId,
      filename: prepared.filename,
      originalFilename: cleanString(file.name, 240) || "inventory-photo",
      contentType: prepared.contentType,
      originalContentType: cleanString(file.type, 100),
      size: prepared.buffer.byteLength,
      originalSize: file.size,
      chunkCount: chunks.length,
      createdAt: serverTimestamp(),
      createdAtIso: uploadedAtIso,
    });
    chunks.forEach((chunk, index) => {
      batch.set(
        doc(
          db,
          INVENTORY_PHOTO_UPLOADS_COLLECTION,
          uploadId,
          "chunks",
          String(index).padStart(4, "0")
        ),
        { index, data: chunk }
      );
    });

    const record = {
      uploadId,
      productName,
      isTemporaryName,
      category: "",
      quantity: null,
      sellingPrice: null,
      transactionType: null,
      notes: "",
      photoTakenAt: exifDateTime?.normalized || null,
      photoTakenAtRaw: exifDateTime?.raw || null,
      uploadedAt: serverTimestamp(),
      uploadedAtIso,
      updatedAt: serverTimestamp(),
      updatedAtIso: uploadedAtIso,
      isPending: true,
      createdByUserId: session.userId,
      createdByName: session.displayName,
    };
    batch.set(recordRef, record);
    await batch.commit();

    return NextResponse.json(
      {
        item: mapInventoryPhotoLogItem(recordId, {
          ...record,
          uploadedAtIso,
          updatedAtIso: uploadedAtIso,
        }),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("inventory-photo-log:upload", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save the inventory photo.",
      },
      { status: 500 }
    );
  }
}
