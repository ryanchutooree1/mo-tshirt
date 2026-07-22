import { NextResponse } from "next/server";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import sharp from "sharp";
import { db } from "@/lib/firebase";

type FirestoreLike = Record<string, unknown>;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatContentDisposition(filename: string) {
  return `inline; filename*=UTF-8''${encodeURIComponent(filename)}`;
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
    const metaSnap = await getDoc(doc(db, "shopUploads", cleanedUploadId));
    if (!metaSnap.exists()) {
      return NextResponse.json({ error: "Upload not found." }, { status: 404 });
    }

    const meta = metaSnap.data() as FirestoreLike;
    const filename = cleanString(meta.filename) || "shop-image";
    const contentType = cleanString(meta.contentType) || "application/octet-stream";

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
    const wantsThumbnail = new URL(req.url).searchParams.get("variant") === "thumbnail";
    const responseBuffer = wantsThumbnail && contentType.startsWith("image/") && contentType !== "image/svg+xml" && contentType !== "image/gif"
      ? await sharp(buffer)
          .rotate()
          .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 78, alphaQuality: 88, effort: 3 })
          .toBuffer()
      : buffer;
    const responseContentType = wantsThumbnail && responseBuffer !== buffer ? "image/webp" : contentType;
    const responseBody = new Uint8Array(responseBuffer.byteLength);
    responseBody.set(responseBuffer);

    return new NextResponse(responseBody, {
      headers: {
        "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
        "Content-Disposition": formatContentDisposition(filename),
        "Content-Length": String(responseBuffer.byteLength),
        "Content-Type": responseContentType,
      },
    });
  } catch (error) {
    console.error("shops:upload:get", error);
    return NextResponse.json({ error: "Failed to load upload." }, { status: 500 });
  }
}
