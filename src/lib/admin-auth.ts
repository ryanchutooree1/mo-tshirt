import type { NextResponse } from "next/server";
import type { AdminPagePath } from "@/lib/admin-access";

export const ADMIN_AUTH_COOKIE = "admin-auth";

const SESSION_TTL_SECONDS = 60 * 60 * 8;
const SESSION_VERSION = 2;
const encoder = new TextEncoder();

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

export type AdminSession = {
  version: number;
  expiresAt: number;
  nonce: string;
  userId: string;
  displayName: string;
  email: string;
  allowedPages: AdminPagePath[];
  isOwner: boolean;
};

type AdminSessionSeed = {
  userId: string;
  displayName: string;
  email: string;
  allowedPages: AdminPagePath[];
  isOwner: boolean;
};

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || process.env.NEXT_ADMIN_PASSWORD || "";
}

function getAdminSessionSecret() {
  const explicitSecret = (process.env.ADMIN_SESSION_SECRET || "").trim();
  return explicitSecret || getAdminPassword();
}

export function getAdminPasswordFromEnv() {
  return getAdminPassword();
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

export async function createAdminSessionToken(seed: AdminSessionSeed) {
  const secret = getAdminSessionSecret();
  if (!secret) return null;

  const payload = {
    version: SESSION_VERSION,
    expiresAt: getNowUnix() + SESSION_TTL_SECONDS,
    nonce: createNonce(),
    userId: seed.userId,
    displayName: seed.displayName,
    email: seed.email,
    allowedPages: seed.allowedPages,
    isOwner: seed.isOwner,
  } satisfies AdminSession;

  const serializedPayload = JSON.stringify(payload);
  const encodedPayload = toBase64Url(encoder.encode(serializedPayload));
  const signature = await signValue(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function readAdminSessionToken(token: string | null | undefined) {
  if (!token) return null;

  const secret = getAdminSessionSecret();
  if (!secret) return null;

  const [encodedPayload, signature, ...rest] = token.split(".");
  if (!encodedPayload || !signature || rest.length > 0) return null;

  const expectedSignature = await signValue(encodedPayload, secret);
  if (!constantTimeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(
      decodeUtf8(fromBase64Url(encodedPayload))
    ) as Partial<AdminSession>;

    if (payload.version !== SESSION_VERSION) return null;
    if (!Number.isInteger(payload.expiresAt) || Number(payload.expiresAt) <= getNowUnix()) {
      return null;
    }
    if (typeof payload.nonce !== "string" || !payload.nonce) return null;
    if (typeof payload.userId !== "string" || !payload.userId) return null;
    if (typeof payload.displayName !== "string") return null;
    if (typeof payload.email !== "string") return null;
    if (!Array.isArray(payload.allowedPages)) return null;
    if (typeof payload.isOwner !== "boolean") return null;

    return {
      version: SESSION_VERSION,
      expiresAt: Number(payload.expiresAt),
      nonce: payload.nonce,
      userId: payload.userId,
      displayName: payload.displayName,
      email: payload.email,
      allowedPages: payload.allowedPages as AdminPagePath[],
      isOwner: payload.isOwner,
    } satisfies AdminSession;
  } catch {
    return null;
  }
}

export async function readAdminSession(cookieStore: CookieReader) {
  return readAdminSessionToken(cookieStore.get(ADMIN_AUTH_COOKIE)?.value);
}

export async function hasAdminSession(cookieStore: CookieReader) {
  return Boolean(await readAdminSession(cookieStore));
}

export function applyAdminSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(ADMIN_AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set(ADMIN_AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
