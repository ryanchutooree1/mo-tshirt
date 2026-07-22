import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/admin-auth";

const ALLOWED_IMAGE_HOSTS = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
]);
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

export async function GET(request: Request) {
  if (!(await hasAdminSession(await cookies()))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rawUrl = new URL(request.url).searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing image URL." }, { status: 400 });
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid image URL." }, { status: 400 });
  }

  if (sourceUrl.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(sourceUrl.hostname)) {
    return NextResponse.json({ error: "Image host is not allowed." }, { status: 400 });
  }

  try {
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ error: "Could not download the source image." }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") || "";
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "The source URL is not an image." }, { status: 415 });
    }
    if (contentLength > MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: "The source image is too large." }, { status: 413 });
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: "The source image is too large." }, { status: 413 });
    }

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("shops:image-source", error);
    return NextResponse.json({ error: "Could not download the source image." }, { status: 502 });
  }
}
