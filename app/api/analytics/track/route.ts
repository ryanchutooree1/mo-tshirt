import { NextResponse } from "next/server";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  TRACKING_RATE_LIMIT,
  evaluateRequestRateLimit,
  getRateLimitHeaders,
  isContentLengthWithinLimit,
  isRequestOriginAllowed,
} from "@/lib/request-safety";

const MAX_TRACKING_REQUEST_BYTES = 8 * 1024;
const MAX_TEXT_LENGTH = 200;
const MAX_PARAM_KEYS = 24;
const ALLOWED_EVENT_NAMES = new Set([
  "quote_start",
  "design_start",
  "design_progress",
  "product_interest",
  "page_view",
  "whatsapp_click",
  "generate_lead",
  "service_page_view",
  "shop_order_submit",
]);

type TrackingPayload = {
  name?: unknown;
  params?: unknown;
  path?: unknown;
  referrer?: unknown;
  sessionId?: unknown;
  clientTimestamp?: unknown;
};

function sanitizeText(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function sanitizeParams(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const entries: [string, string | number | boolean][] = [];

  Object.entries(value as Record<string, unknown>)
    .slice(0, MAX_PARAM_KEYS)
    .forEach(([key, raw]) => {
      const safeKey = sanitizeText(key, 40);
      if (!safeKey) return;

      if (typeof raw === "string") {
        entries.push([safeKey, sanitizeText(raw)]);
        return;
      }

      if (typeof raw === "number" && Number.isFinite(raw)) {
        entries.push([safeKey, raw]);
        return;
      }

      if (typeof raw === "boolean") {
        entries.push([safeKey, raw]);
      }
    });

  return Object.fromEntries(entries);
}

export async function POST(req: Request) {
  const rateLimitResult = evaluateRequestRateLimit(req.headers, TRACKING_RATE_LIMIT);
  const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
  const json = (body: Record<string, unknown>, status: number) =>
    NextResponse.json(body, { status, headers: rateLimitHeaders });

  if (!rateLimitResult.allowed) {
    return json({ error: "Too many tracking requests." }, 429);
  }

  if (!isRequestOriginAllowed(req)) {
    return json({ error: "Origin not allowed." }, 403);
  }

  if (!isContentLengthWithinLimit(req.headers, MAX_TRACKING_REQUEST_BYTES)) {
    return json({ error: "Payload too large." }, 413);
  }

  try {
    const payload = (await req.json()) as TrackingPayload;
    const name = sanitizeText(payload.name, 50);

    if (!ALLOWED_EVENT_NAMES.has(name)) {
      return json({ error: "Unsupported event." }, 400);
    }

    await addDoc(collection(db, "websiteTrackingEvents"), {
      name,
      path: sanitizeText(payload.path),
      referrer: sanitizeText(payload.referrer),
      sessionId: sanitizeText(payload.sessionId, 80),
      clientTimestamp: sanitizeText(payload.clientTimestamp, 80),
      params: sanitizeParams(payload.params),
      userAgent: sanitizeText(req.headers.get("user-agent") || ""),
      createdAt: serverTimestamp(),
    });

    return json({ ok: true }, 200);
  } catch {
    return json({ error: "Invalid payload." }, 400);
  }
}
