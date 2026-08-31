import { NextResponse } from "next/server";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  PUBLIC_UPLOAD_CHUNK_BYTES,
  completePublicChunkedUpload,
  storePublicUploadChunk,
} from "@/lib/public-upload-store";
import {
  LEGACY_QUOTATION_UPLOAD_COLLECTION,
  QUOTATION_UPLOAD_COLLECTION,
} from "@/lib/quotation-upload-paths";
import {
  isContentLengthWithinLimit,
  isRequestOriginAllowed,
} from "@/lib/request-safety";

type FirestoreLike = Record<string, unknown>;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatContentDisposition(filename: string) {
  return `inline; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function getUploadToken(req: Request) {
  return cleanString(req.headers.get("x-upload-token"));
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  if (!isRequestOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }
  if (!isContentLengthWithinLimit(req.headers, PUBLIC_UPLOAD_CHUNK_BYTES)) {
    return NextResponse.json({ error: "Upload chunk is too large." }, { status: 413 });
  }

  const { uploadId } = await params;
  const index = Number(req.headers.get("x-chunk-index"));

  try {
    await storePublicUploadChunk({
      uploadId,
      uploadToken: getUploadToken(req),
      index,
      buffer: Buffer.from(await req.arrayBuffer()),
    });
    return NextResponse.json({ ok: true, index });
  } catch (error) {
    console.error("quotation:public-upload:chunk", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload artwork." },
      { status: 400 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  if (!isRequestOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  const { uploadId } = await params;

  try {
    const upload = await completePublicChunkedUpload(uploadId, getUploadToken(req));
    return NextResponse.json({
      attachment: {
        name: upload.filename,
        url: upload.url,
        contentType: upload.contentType,
        size: upload.size,
        uploadedAt: upload.uploadedAt,
      },
      sessionId: upload.sessionId,
    });
  } catch (error) {
    console.error("quotation:public-upload:complete", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to finish artwork upload." },
      { status: 400 }
    );
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  const { uploadId } = await params;
  const cleanedUploadId = cleanString(uploadId);

  if (!cleanedUploadId) {
    return NextResponse.json({ error: "Missing upload id." }, { status: 400 });
  }

  try {
    const currentMetaSnap = await getDoc(doc(db, QUOTATION_UPLOAD_COLLECTION, cleanedUploadId));
    let metaSnap = currentMetaSnap;
    let uploadCollection = QUOTATION_UPLOAD_COLLECTION;
    if (!currentMetaSnap.exists()) {
      uploadCollection = LEGACY_QUOTATION_UPLOAD_COLLECTION;
      metaSnap = await getDoc(doc(db, uploadCollection, cleanedUploadId));
    }
    if (!metaSnap.exists()) {
      return NextResponse.json({ error: "Upload not found." }, { status: 404 });
    }

    const meta = metaSnap.data() as FirestoreLike;
    if (meta.uploadState === "uploading") {
      return NextResponse.json({ error: "Upload is not ready." }, { status: 409 });
    }
    const filename = cleanString(meta.filename) || "upload";
    const contentType = cleanString(meta.contentType) || "application/octet-stream";

    const chunksSnap = await getDocs(
      query(collection(db, uploadCollection, cleanedUploadId, "chunks"), orderBy("index", "asc"))
    );

    if (chunksSnap.empty) {
      return NextResponse.json({ error: "Upload data is missing." }, { status: 404 });
    }

    const encodedChunks = chunksSnap.docs.map((chunk) =>
      cleanString((chunk.data() as FirestoreLike).data)
    );
    const base64 = encodedChunks.join("");

    if (!base64) {
      return NextResponse.json({ error: "Upload data is empty." }, { status: 404 });
    }

    const buffer =
      meta.uploadState === "ready" && Number(meta.chunkSize) > 0
        ? Buffer.concat(encodedChunks.map((chunk) => Buffer.from(chunk, "base64")))
        : Buffer.from(base64, "base64");

    return new NextResponse(buffer, {
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": formatContentDisposition(filename),
        "Content-Length": String(buffer.byteLength),
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("quotation:public-upload:get", error);
    return NextResponse.json({ error: "Failed to load upload." }, { status: 500 });
  }
}
