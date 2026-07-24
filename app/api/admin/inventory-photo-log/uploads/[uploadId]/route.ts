import { NextResponse } from "next/server";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isAdminRequest } from "@/lib/admin-request";
import { createProductThumbnail } from "@/lib/prepare-product-image";
import { INVENTORY_PHOTO_UPLOADS_COLLECTION } from "@/lib/inventory-photo-log";

function cleanString(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function formatContentDisposition(filename: string) {
  return `inline; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function imageResponse(buffer: Buffer, filename: string, contentType: string) {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": formatContentDisposition(filename),
      "Content-Length": String(buffer.byteLength),
      "Content-Type": contentType,
    },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  if (!(await isAdminRequest("/api/admin/inventory-photo-log/uploads"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { uploadId: rawUploadId } = await params;
  const uploadId = cleanString(rawUploadId, 180);
  if (!uploadId) {
    return NextResponse.json({ error: "Missing upload id." }, { status: 400 });
  }

  try {
    const uploadRef = doc(db, INVENTORY_PHOTO_UPLOADS_COLLECTION, uploadId);
    const uploadSnapshot = await getDoc(uploadRef);
    if (!uploadSnapshot.exists()) {
      return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    }

    const metadata = uploadSnapshot.data() as Record<string, unknown>;
    const filename = cleanString(metadata.filename) || "inventory-photo";
    const contentType =
      cleanString(metadata.contentType) || "application/octet-stream";
    const wantsThumbnail =
      new URL(req.url).searchParams.get("variant") === "thumbnail";
    const cachedThumbnail = cleanString(metadata.thumbnailBase64, 2_000_000);

    if (wantsThumbnail && cachedThumbnail) {
      return imageResponse(
        Buffer.from(cachedThumbnail, "base64"),
        filename,
        cleanString(metadata.thumbnailContentType) || "image/webp"
      );
    }

    const chunkSnapshot = await getDocs(
      query(
        collection(
          db,
          INVENTORY_PHOTO_UPLOADS_COLLECTION,
          uploadId,
          "chunks"
        ),
        orderBy("index", "asc")
      )
    );
    const base64 = chunkSnapshot.docs
      .map((entry) =>
        cleanString(
          (entry.data() as Record<string, unknown>).data,
          1_000_000
        )
      )
      .join("");
    if (!base64) {
      return NextResponse.json(
        { error: "Photo data is missing." },
        { status: 404 }
      );
    }

    const buffer = Buffer.from(base64, "base64");
    if (!wantsThumbnail) {
      return imageResponse(buffer, filename, contentType);
    }

    const thumbnail = await createProductThumbnail(buffer, contentType);
    if (!thumbnail) {
      return imageResponse(buffer, filename, contentType);
    }

    await updateDoc(uploadRef, {
      thumbnailBase64: thumbnail.buffer.toString("base64"),
      thumbnailContentType: thumbnail.contentType,
      thumbnailSize: thumbnail.buffer.byteLength,
    }).catch((error) =>
      console.warn("inventory-photo-log:thumbnail-cache", uploadId, error)
    );

    return imageResponse(
      thumbnail.buffer,
      filename,
      thumbnail.contentType
    );
  } catch (error) {
    console.error("inventory-photo-log:image", error);
    return NextResponse.json(
      { error: "Failed to load the inventory photo." },
      { status: 500 }
    );
  }
}
