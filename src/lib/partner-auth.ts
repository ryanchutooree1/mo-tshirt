import type { NextResponse } from "next/server";
import {
  getPrintPartner,
  isPrintPartnerId,
  type PrintPartnerId,
} from "@/lib/partners";

export const PARTNER_AUTH_COOKIE = "partner-auth";

const SESSION_TTL_SECONDS = 60 * 60 * 12;
const SESSION_VERSION = 1;
const encoder = new TextEncoder();

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

export type PartnerSession = {
  version: number;
  expiresAt: number;
  nonce: string;
  partnerId: PrintPartnerId;
  displayName: string;
};

function getPartnerPassword(partnerId: PrintPartnerId) {
  if (partnerId === "yan") {
    return (
      process.env.PARTNER_YAN_PASSWORD ||
      process.env.NEXT_PARTNER_YAN_PASSWORD ||
      "Samsam"
    );
  }

  return (
    process.env.PARTNER_SHABANAZ_PASSWORD ||
    process.env.NEXT_PARTNER_SHABANAZ_PASSWORD ||
    "Paulpaul"
  );
}

function getPartnerSessionSecret() {
  const explicitSecret = (process.env.PARTNER_SESSION_SECRET || "").trim();
  if (explicitSecret) return explicitSecret;

  const adminSecret = (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    process.env.NEXT_ADMIN_PASSWORD ||
    ""
  ).trim();
  if (adminSecret) return adminSecret;

  return `${getPartnerPassword("yan")}:${getPartnerPassword("shabanaz")}`;
}

function getNowUnix() {
  return Math.floor(Date.now() / 1000);
}

function toBase64Url(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4 || 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

async function signValue(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(signature);
}

function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function verifyPartnerPassword(
  partnerId: PrintPartnerId,
  password: string
) {
  return constantTimeEqual(password, getPartnerPassword(partnerId));
}

export async function createPartnerSessionToken(partnerId: PrintPartnerId) {
  const partner = getPrintPartner(partnerId);
  const payload = {
    version: SESSION_VERSION,
    expiresAt: getNowUnix() + SESSION_TTL_SECONDS,
    nonce: createNonce(),
    partnerId,
    displayName: partner.name,
  } satisfies PartnerSession;

  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await signValue(encodedPayload, getPartnerSessionSecret());
  return `${encodedPayload}.${signature}`;
}

export async function readPartnerSessionToken(token: string | null | undefined) {
  if (!token) return null;

  const [encodedPayload, signature, ...rest] = token.split(".");
  if (!encodedPayload || !signature || rest.length > 0) return null;

  const expectedSignature = await signValue(
    encodedPayload,
    getPartnerSessionSecret()
  );
  if (!constantTimeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(
      decodeUtf8(fromBase64Url(encodedPayload))
    ) as Partial<PartnerSession>;

    if (payload.version !== SESSION_VERSION) return null;
    if (!Number.isInteger(payload.expiresAt) || Number(payload.expiresAt) <= getNowUnix()) {
      return null;
    }
    if (typeof payload.nonce !== "string" || !payload.nonce) return null;
    if (!isPrintPartnerId(payload.partnerId)) return null;
    if (typeof payload.displayName !== "string") return null;

    return {
      version: SESSION_VERSION,
      expiresAt: Number(payload.expiresAt),
      nonce: payload.nonce,
      partnerId: payload.partnerId,
      displayName: payload.displayName,
    } satisfies PartnerSession;
  } catch {
    return null;
  }
}

export async function readPartnerSession(cookieStore: CookieReader) {
  return readPartnerSessionToken(cookieStore.get(PARTNER_AUTH_COOKIE)?.value);
}

export async function hasPartnerSessionFor(
  cookieStore: CookieReader,
  partnerId: PrintPartnerId
) {
  const session = await readPartnerSession(cookieStore);
  return session?.partnerId === partnerId;
}

export function applyPartnerSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(PARTNER_AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearPartnerSessionCookie(response: NextResponse) {
  response.cookies.set(PARTNER_AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
