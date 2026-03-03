import type { NextResponse } from "next/server";

export const ADMIN_AUTH_COOKIE = "admin-auth";

const SESSION_TTL_SECONDS = 60 * 60 * 8;
const encoder = new TextEncoder();

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || process.env.NEXT_ADMIN_PASSWORD || "";
}

function getAdminSessionSecret() {
  const explicitSecret = (process.env.ADMIN_SESSION_SECRET || "").trim();
  return explicitSecret || getAdminPassword();
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

export function getAdminPasswordFromEnv() {
  return getAdminPassword();
}

export async function createAdminSessionToken() {
  const secret = getAdminSessionSecret();
  if (!secret) return null;

  const expiresAt = getNowUnix() + SESSION_TTL_SECONDS;
  const payload = `${expiresAt}.${createNonce()}`;
  const signature = await signValue(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifyAdminSessionToken(token: string | null | undefined) {
  if (!token) return false;

  const secret = getAdminSessionSecret();
  if (!secret) return false;

  const [expiresAtText, nonce, signature, ...rest] = token.split(".");
  if (!expiresAtText || !nonce || !signature || rest.length > 0) return false;

  const expiresAt = Number(expiresAtText);
  if (!Number.isInteger(expiresAt) || expiresAt <= getNowUnix()) return false;

  const expectedSignature = await signValue(`${expiresAtText}.${nonce}`, secret);
  return constantTimeEqual(signature, expectedSignature);
}

export async function hasAdminSession(cookieStore: CookieReader) {
  return verifyAdminSessionToken(cookieStore.get(ADMIN_AUTH_COOKIE)?.value);
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
