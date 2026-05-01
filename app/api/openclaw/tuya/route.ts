import { NextResponse } from "next/server";
import { executeOpenClawTuyaPowerCommand, OpenClawTuyaError } from "../../../../lib/tuya-openclaw";
import { isOpenClawEnabled } from "@/lib/openclaw-availability";
import {
  API_RATE_LIMIT,
  evaluateRequestRateLimit,
  getRateLimitHeaders,
  isContentLengthWithinLimit,
} from "@/lib/request-safety";

export const runtime = "nodejs";

const MAX_OPENCLAW_REQUEST_BYTES = 4_096;

function readOpenClawSecret() {
  return String(process.env.OPENCLAW_TUYA_SECRET || process.env.OPENCLAW_SECRET || "").trim();
}

function isAuthorized(req: Request) {
  const secret = readOpenClawSecret();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const auth = req.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) {
    return true;
  }

  const xSecret = req.headers.get("x-openclaw-secret") || "";
  return xSecret === secret;
}

export async function POST(req: Request) {
  if (!isOpenClawEnabled()) {
    return NextResponse.json(
      { ok: false, error: "OpenClaw is currently disabled." },
      { status: 503 }
    );
  }

  if (!isContentLengthWithinLimit(req.headers, MAX_OPENCLAW_REQUEST_BYTES)) {
    return NextResponse.json(
      { ok: false, error: "Payload too large." },
      { status: 413 }
    );
  }

  const secret = readOpenClawSecret();
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Server is missing OPENCLAW_TUYA_SECRET." },
      { status: 500 }
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized OpenClaw request." },
      { status: 401 }
    );
  }

  const rateLimit = evaluateRequestRateLimit(req.headers, {
    ...API_RATE_LIMIT,
    scope: "openclaw-tuya",
    maxRequests: 30,
    windowMs: 60_000,
    blockDurationMs: 5 * 60_000,
  });
  const rateLimitHeaders = getRateLimitHeaders(rateLimit);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many OpenClaw Tuya requests." },
      { status: 429, headers: rateLimitHeaders }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const result = await executeOpenClawTuyaPowerCommand(body);
    return NextResponse.json(result, { headers: rateLimitHeaders });
  } catch (error) {
    if (error instanceof OpenClawTuyaError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        { status: error.statusCode, headers: rateLimitHeaders }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to process OpenClaw Tuya request.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: rateLimitHeaders }
    );
  }
}
