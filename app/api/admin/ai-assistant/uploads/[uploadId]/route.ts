import { NextResponse } from "next/server";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { isAdminRequest } from "@/lib/admin-request";
import { db } from "@/lib/firebase";

type FirestoreLike = Record<string, unknown>;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatContentDisposition(filename: string) {
  return `inline; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { uploadId } = await params;
  const cleanedUploadId = cleanString(uploadId);

  if (!cleanedUploadId) {
    return NextResponse.json({ error: "Missing upload id." }, { status: 400 });
  }

  try {
    const metaSnap = await getDoc(doc(db, "aiAssistantUploads", cleanedUploadId));
    if (!metaSnap.exists()) {
      return NextResponse.json({ error: "Upload not found." }, { status: 404 });
    }

    const meta = metaSnap.data() as FirestoreLike;
    const filename = cleanString(meta.filename) || "upload";
    const contentType = cleanString(meta.contentType) || "application/octet-stream";

    const chunksSnap = await getDocs(
      query(collection(db, "aiAssistantUploads", cleanedUploadId, "chunks"), orderBy("index", "asc"))
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

    return new NextResponse(buffer, {
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": formatContentDisposition(filename),
        "Content-Length": String(buffer.byteLength),
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("ai-assistant:upload:get", error);
    return NextResponse.json({ error: "Failed to load upload." }, { status: 500 });
  }
}
