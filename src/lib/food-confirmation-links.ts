import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "@/lib/seo";

const LINK_LIFETIME_MS = 20 * 60 * 60 * 1_000;
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function getSigningSecret() {
  const secret =
    process.env.FOOD_CONFIRMATION_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.SMTP_PASS?.trim();

  if (!secret) throw new Error("FOOD_CONFIRMATION_SECRET is not configured.");
  return secret;
}

function signaturePayload(dayKey: string, expires: number) {
  return `${dayKey}.${expires}`;
}

export function signFoodConfirmationLink(
  dayKey: string,
  expires = Date.now() + LINK_LIFETIME_MS
) {
  if (!DAY_KEY_RE.test(dayKey)) throw new Error("Invalid food confirmation date.");
  const token = createHmac("sha256", getSigningSecret())
    .update(signaturePayload(dayKey, expires))
    .digest("base64url");
  return { expires, token };
}

export function verifyFoodConfirmationLink(input: {
  dayKey: string;
  expires: string | number;
  token: string;
}) {
  if (!DAY_KEY_RE.test(input.dayKey)) return false;
  const expires = Number(input.expires);
  if (!Number.isSafeInteger(expires) || expires <= Date.now()) return false;

  const expected = createHmac("sha256", getSigningSecret())
    .update(signaturePayload(input.dayKey, expires))
    .digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(input.token, "base64url");
  } catch {
    return false;
  }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function buildFoodConfirmationUrl(dayKey: string) {
  const { expires, token } = signFoodConfirmationLink(dayKey);
  const url = new URL("/food-confirmation", SITE_URL);
  url.searchParams.set("day", dayKey);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("token", token);
  return url.toString();
}
