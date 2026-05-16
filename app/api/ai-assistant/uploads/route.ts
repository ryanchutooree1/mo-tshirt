import { NextResponse } from "next/server";
import {
  normalizePublicUploadSessionId,
  storePublicUploadBuffer,
} from "@/lib/public-upload-store";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  try {
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
