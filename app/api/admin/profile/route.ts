import { NextResponse } from "next/server";
import { getAdminRequestSession } from "@/lib/admin-request";
import {
  ADMIN_PROFILE_LIMITS,
  defaultAdminProfile,
  normalizeAdminProfile,
} from "@/lib/admin-profile";
import {
  getStoredAdminProfile,
  saveStoredAdminProfile,
} from "@/lib/admin-profile-store";
import { isContentLengthWithinLimit, isRequestOriginAllowed } from "@/lib/request-safety";

export const runtime = "nodejs";

const MAX_PROFILE_REQUEST_BYTES = 800_000;
const MAX_IMAGE_EDGE = 8_192;
const MAX_IMAGE_PIXELS = 25_000_000;

type ImageDimensions = { width: number; height: number };

function jpegDimensions(bytes: Buffer): ImageDimensions | null {
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;

  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function pngDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.length < 24 || bytes.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  if (bytes.includes(Buffer.from("acTL", "ascii"))) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function readUInt24LE(bytes: Buffer, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function webpDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.length < 30) return null;
  const chunk = bytes.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") {
    if ((bytes[20] & 0x02) !== 0) return null;
    return {
      width: readUInt24LE(bytes, 24) + 1,
      height: readUInt24LE(bytes, 27) + 1,
    };
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
    };
  }
  return null;
}

function imageDimensions(type: string, bytes: Buffer) {
  if (type === "jpeg") return jpegDimensions(bytes);
  if (type === "png") return pngDimensions(bytes);
  return webpDimensions(bytes);
}

function dimensionsAreSafe(dimensions: ImageDimensions | null) {
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return false;
  if (dimensions.width > MAX_IMAGE_EDGE || dimensions.height > MAX_IMAGE_EDGE) return false;
  return dimensions.width * dimensions.height <= MAX_IMAGE_PIXELS;
}

function avatarPayloadIsValid(value: string | null) {
  if (value === null) return true;
  if (value.length > ADMIN_PROFILE_LIMITS.avatarDataUrl) return false;
  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=]+)$/i);
  if (!match) return false;
  try {
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.byteLength <= 0 || bytes.byteLength > 480_000) return false;
    const type = match[1].toLowerCase();
    if (type === "jpeg") {
      if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) return false;
      return dimensionsAreSafe(imageDimensions(type, bytes));
    }
    if (type === "png") {
      if (!bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return false;
      return dimensionsAreSafe(imageDimensions(type, bytes));
    }
    if (!(bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP")) return false;
    return dimensionsAreSafe(imageDimensions(type, bytes));
  } catch {
    return false;
  }
}

async function readLimitedRequestText(request: Request, maxBytes: number) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => null);
      return null;
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks, totalBytes).toString("utf8");
}

export async function GET() {
  const session = await getAdminRequestSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const fallback = defaultAdminProfile({
    displayName: session.displayName,
    isOwner: session.isOwner,
  });

  try {
    const storedProfile = await getStoredAdminProfile(session.userId);
    const profile = storedProfile
      ? normalizeAdminProfile(storedProfile, fallback)
      : fallback;
    return NextResponse.json({ profile });
  } catch (error) {
    console.error("admin-profile:get", error);
    return NextResponse.json({ error: "Could not load your profile." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!isRequestOriginAllowed(request)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }
  if (!isContentLengthWithinLimit(request.headers, MAX_PROFILE_REQUEST_BYTES)) {
    return NextResponse.json({ error: "Profile image is too large." }, { status: 413 });
  }
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Use a JSON profile request." }, { status: 415 });
  }

  const session = await getAdminRequestSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rawBody = await readLimitedRequestText(request, MAX_PROFILE_REQUEST_BYTES);
  if (rawBody === null) {
    return NextResponse.json({ error: "Profile image is too large." }, { status: 413 });
  }
  let body: unknown = null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid profile." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const displayName = typeof record.displayName === "string" ? record.displayName.trim() : "";
  if (displayName.length < 2 || displayName.length > ADMIN_PROFILE_LIMITS.displayName) {
    return NextResponse.json({ error: "Enter your full name." }, { status: 400 });
  }
  for (const [field, limit] of [
    ["headline", ADMIN_PROFILE_LIMITS.headline],
    ["location", ADMIN_PROFILE_LIMITS.location],
    ["bio", ADMIN_PROFILE_LIMITS.bio],
  ] as const) {
    const value = record[field];
    if (typeof value !== "string" || value.length > limit) {
      return NextResponse.json({ error: `Invalid ${field}.` }, { status: 400 });
    }
  }
  const avatarDataUrl = record.avatarDataUrl === null
    ? null
    : typeof record.avatarDataUrl === "string"
      ? record.avatarDataUrl
      : null;
  if (!avatarPayloadIsValid(avatarDataUrl)) {
    return NextResponse.json({ error: "Use a JPG, PNG, or WebP image under 480 KB." }, { status: 400 });
  }

  const fallback = defaultAdminProfile({
    displayName: session.displayName,
    isOwner: session.isOwner,
  });
  const profile = normalizeAdminProfile({ ...record, avatarDataUrl }, fallback);

  try {
    await saveStoredAdminProfile(session.userId, profile);
    return NextResponse.json({ profile });
  } catch (error) {
    console.error("admin-profile:put", error);
    return NextResponse.json({ error: "Could not save your profile." }, { status: 500 });
  }
}
