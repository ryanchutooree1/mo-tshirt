import { NextResponse } from "next/server";
import {
  PUBLIC_UPLOAD_CHUNK_BYTES,
  normalizePublicUploadSessionId,
  startPublicChunkedUpload,
  storePublicUploadBuffer,
} from "@/lib/public-upload-store";
import {
  isContentLengthWithinLimit,
  isRequestOriginAllowed,
} from "@/lib/request-safety";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_CREATE_REQUEST_BYTES = 16 * 1024;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  if (!isRequestOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      if (!isContentLengthWithinLimit(req.headers, MAX_CREATE_REQUEST_BYTES)) {
        return NextResponse.json({ error: "Upload details are too large." }, { status: 413 });
      }

      const body = (await req.json()) as Record<string, unknown>;
      const size = Number(body.size);
      if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: "File must be 10 MB or smaller." }, { status: 400 });
      }

      const upload = await startPublicChunkedUpload({
        filename: cleanString(body.filename),
        contentType: cleanString(body.contentType),
        size,
        sessionId: cleanString(body.sessionId),
        source: "web-order-chunked-upload",
        maxUploadBytes: MAX_UPLOAD_BYTES,
      });

      return NextResponse.json({
        uploadId: upload.uploadId,
        uploadToken: upload.uploadToken,
        sessionId: upload.sessionId,
        chunkSize: PUBLIC_UPLOAD_CHUNK_BYTES,
      });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const sessionId = normalizePublicUploadSessionId(
      cleanString(formData.get("sessionId")),
      "web-order"
    );

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    if (!file.size || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File must be 10 MB or smaller." }, { status: 400 });
    }

    const upload = await storePublicUploadBuffer({
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      contentType: file.type || null,
      size: file.size || null,
      sessionId,
      source: "web-order-upload",
      maxUploadBytes: MAX_UPLOAD_BYTES,
    });

    return NextResponse.json({
      attachment: {
        name: upload.filename,
        url: upload.url,
        contentType: upload.contentType || null,
        size: upload.size || null,
        uploadedAt: upload.uploadedAt,
      },
      sessionId: upload.sessionId,
    });
  } catch (error) {
    console.error("ai-assistant:public-upload", error);
    return NextResponse.json({ error: "Failed to upload logo." }, { status: 500 });
  }
}
