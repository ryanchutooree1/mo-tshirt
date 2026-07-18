import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "@/lib/seo";

export type QuoteResponseAction = "accept" | "changes" | "reject";

const LINK_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

function getSigningSecret() {
  const secret =
    process.env.QUOTE_RESPONSE_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.SMTP_PASS?.trim();

  if (!secret) {
    throw new Error("QUOTE_RESPONSE_SECRET is not configured.");
  }

  return secret;
}

function signaturePayload(quoteId: string, action: QuoteResponseAction, expires: number) {
  return `${quoteId}.${action}.${expires}`;
}

export function signQuoteResponseLink(
  quoteId: string,
  action: QuoteResponseAction,
  expires = Date.now() + LINK_LIFETIME_MS
) {
  const token = createHmac("sha256", getSigningSecret())
    .update(signaturePayload(quoteId, action, expires))
    .digest("base64url");

  return { expires, token };
}

export function verifyQuoteResponseLink(input: {
  quoteId: string;
  action: string;
  expires: string | number;
  token: string;
}) {
  if (!isQuoteResponseAction(input.action)) return false;

  const expires = Number(input.expires);
  if (!Number.isSafeInteger(expires) || expires <= Date.now()) return false;

  const expected = createHmac("sha256", getSigningSecret())
    .update(signaturePayload(input.quoteId, input.action, expires))
    .digest();

  let supplied: Buffer;
  try {
    supplied = Buffer.from(input.token, "base64url");
  } catch {
    return false;
  }

  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function buildQuoteResponseUrl(quoteId: string, action: QuoteResponseAction) {
  const { expires, token } = signQuoteResponseLink(quoteId, action);
  const url = new URL(`/quotation/${encodeURIComponent(quoteId)}`, SITE_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("token", token);
  return url.toString();
}

export function isQuoteResponseAction(value: unknown): value is QuoteResponseAction {
  return value === "accept" || value === "changes" || value === "reject";
}
