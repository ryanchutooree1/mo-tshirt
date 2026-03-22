import { NextResponse } from "next/server";

const ALLOWED_HOSTS = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
  "www.mo-tshirt.mu",
  "mo-tshirt.mu",
]);

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

function sanitizeFilename(input: string) {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return cleaned || "tshirt";
}

function ensureExtension(name: string, contentType: string | null, urlPath: string) {
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  const type = (contentType || "").split(";")[0].trim();
  const fromType = EXT_BY_TYPE[type];
  if (fromType) return `${name}.${fromType}`;
  const match = urlPath.match(/\.[a-z0-9]{2,5}$/i);
  if (match) return `${name}${match[0]}`;
  return `${name}.jpg`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const urlParam = searchParams.get("url");
  const nameParam = searchParams.get("name") || "tshirt";

  if (!urlParam) {
    return NextResponse.json({ error: "Missing url." }, { status: 400 });
  }

  let target: URL;
  if (urlParam.startsWith("/")) {
    if (!urlParam.startsWith("/api/shops/uploads/")) {
      return NextResponse.json({ error: "URL not allowed." }, { status: 400 });
    }
    target = new URL(urlParam, req.url);
  } else {
    try {
      target = new URL(urlParam);
    } catch {
      return NextResponse.json({ error: "Invalid url." }, { status: 400 });
    }
  }

  if (
    !(target.protocol === "https:" || (target.protocol === "http:" && target.hostname === "localhost")) ||
    (!ALLOWED_HOSTS.has(target.hostname) && target.hostname !== new URL(req.url).hostname)
  ) {
    return NextResponse.json({ error: "URL not allowed." }, { status: 400 });
  }

  try {
    const response = await fetch(target.toString(), { cache: "no-store" });
    if (!response.ok || !response.body) {
      return NextResponse.json({ error: "Download failed." }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const safeName = sanitizeFilename(nameParam);
    const filename = ensureExtension(safeName, contentType, target.pathname);

    return new Response(response.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "Download failed." }, { status: 502 });
  }
}
