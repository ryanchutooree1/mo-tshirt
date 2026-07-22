import { NextResponse } from "next/server";
import { collection, doc, getDoc, getDocs, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createProductThumbnail } from "@/lib/prepare-product-image";

type FirestoreLike = Record<string, unknown>;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatContentDisposition(filename: string) {
  return `inline; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function imageResponse(buffer: Buffer, filename: string, contentType: string) {
  const body = new Uint8Array(buffer.byteLength);
  body.set(buffer);
  return new NextResponse(body, {
    headers: {
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
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
  const { uploadId } = await params;
  const cleanedUploadId = cleanString(uploadId);

  if (!cleanedUploadId) {
    return NextResponse.json({ error: "Missing upload id." }, { status: 400 });
  }

  try {
    const metaRef = doc(db, "shopUploads", cleanedUploadId);
    const metaSnap = await getDoc(metaRef);
    if (!metaSnap.exists()) {
      return NextResponse.json({ error: "Upload not found." }, { status: 404 });
    }

    const meta = metaSnap.data() as FirestoreLike;
    const filename = cleanString(meta.filename) || "shop-image";
    const contentType = cleanString(meta.contentType) || "application/octet-stream";
    const wantsThumbnail = new URL(req.url).searchParams.get("variant") === "thumbnail";
    const storedThumbnail = cleanString(meta.thumbnailBase64);
    if (wantsThumbnail && storedThumbnail) {
      return imageResponse(
        Buffer.from(storedThumbnail, "base64"),
        filename,
        cleanString(meta.thumbnailContentType) || "image/webp"
      );
    }

    const chunksSnap = await getDocs(
      query(collection(db, "shopUploads", cleanedUploadId, "chunks"), orderBy("index", "asc"))
    );

    if (chunksSnap.empty) {
      return NextResponse.json({ error: "Upload data is missing." }, { status: 404 });
    }

    const base64 = chunksSnap.docs
      .map((chunk) => cleanString((chunk.data() as FirestoreLike).data))
      .join("");

    if (!base64) {
      return NextResponse.json({ error: "Upload data is empty." }, { status: 404 });
    }

    const buffer = Buffer.from(base64, "base64");
    if (!wantsThumbnail) return imageResponse(buffer, filename, contentType);

    const thumbnail = await createProductThumbnail(buffer, contentType);
    if (!thumbnail) return imageResponse(buffer, filename, contentType);

    await updateDoc(metaRef, {
      thumbnailBase64: thumbnail.buffer.toString("base64"),
      thumbnailContentType: thumbnail.contentType,
      thumbnailSize: thumbnail.buffer.byteLength,
    }).catch((error) => console.warn("shops:thumbnail:cache", cleanedUploadId, error));

    return imageResponse(thumbnail.buffer, filename, thumbnail.contentType);
  } catch (error) {
    console.error("shops:upload:get", error);
    return NextResponse.json({ error: "Failed to load upload." }, { status: 500 });
  }
}
