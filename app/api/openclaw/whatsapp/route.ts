import { NextResponse } from "next/server";
import {
  analyseClientRequests,
  buildClientRequestReply,
  dispatchWhatsAppReply,
  getThinkingDelayMs,
  isMatchingOpenClawCommand,
  parseWhatsAppWebhookPayload,
  readOpenClawWhatsAppConfig,
  runDemoThinkingDelay,
} from "@/lib/openclaw-whatsapp";
import {
  API_RATE_LIMIT,
  evaluateRequestRateLimit,
  getRateLimitHeaders,
  isContentLengthWithinLimit,
} from "@/lib/request-safety";

export const runtime = "nodejs";

const MAX_OPENCLAW_WHATSAPP_REQUEST_BYTES = 32_768;

function readVerifyToken() {
  return String(process.env.OPENCLAW_WHATSAPP_VERIFY_TOKEN || "").trim();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  const token = url.searchParams.get("hub.verify_token");
  const expectedToken = readVerifyToken();

  if (mode === "subscribe" && challenge && expectedToken && token === expectedToken) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ ok: true, message: "OpenClaw WhatsApp webhook ready." });
}

export async function POST(req: Request) {
  if (!isContentLengthWithinLimit(req.headers, MAX_OPENCLAW_WHATSAPP_REQUEST_BYTES)) {
    return NextResponse.json(
      { ok: false, error: "Payload too large." },
      { status: 413 }
    );
  }

  const rateLimit = evaluateRequestRateLimit(req.headers, {
    ...API_RATE_LIMIT,
    scope: "openclaw-whatsapp",
    maxRequests: 60,
    windowMs: 60_000,
    blockDurationMs: 5 * 60_000,
  });
  const rateLimitHeaders = getRateLimitHeaders(rateLimit);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many OpenClaw WhatsApp requests." },
      { status: 429, headers: rateLimitHeaders }
    );
  }

  try {
    const payload = await parseWebhookRequest(req);
    const incomingMessage = parseWhatsAppWebhookPayload(payload);

    if (!incomingMessage) {
      return NextResponse.json(
        { ok: true, handled: false, reason: "No inbound WhatsApp text message found." },
        { headers: rateLimitHeaders }
      );
    }

    console.info("[openclaw-whatsapp] incoming message", {
      provider: incomingMessage.provider,
      from: incomingMessage.from,
      text: incomingMessage.text,
    });

    const config = readOpenClawWhatsAppConfig();
    const commandMatched = isMatchingOpenClawCommand(incomingMessage.text, config.triggerMessage);

    if (!commandMatched) {
      return NextResponse.json(
        {
          ok: true,
          handled: false,
          matched: false,
          reason: "Message did not match the OpenClaw demo trigger.",
        },
        { headers: rateLimitHeaders }
      );
    }

    console.info("[openclaw-whatsapp] command match", {
      triggerMessage: config.triggerMessage,
    });

    const thinkingDelayMs = getThinkingDelayMs(config.thinkingMinMs, config.thinkingMaxMs);
    console.info("[openclaw-whatsapp] thinking delay started", { delayMs: thinkingDelayMs });

    await runDemoThinkingDelay(thinkingDelayMs);

    const report = await analyseClientRequests();
    const replyText = config.replyTextOverride || buildClientRequestReply(report);
    const dispatchResult = await dispatchWhatsAppReply({
      incoming: incomingMessage,
      replyText,
      enableTypingIndicator: config.typingIndicatorEnabled,
    });

    console.info("[openclaw-whatsapp] reply sent", {
      provider: dispatchResult.provider,
      simulated: dispatchResult.simulated,
      messageId: dispatchResult.messageId,
    });

    return NextResponse.json(
      {
        ok: true,
        handled: true,
        matched: true,
        delayMs: thinkingDelayMs,
        replyText,
        provider: dispatchResult.provider,
        simulated: dispatchResult.simulated,
        messageId: dispatchResult.messageId,
      },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process OpenClaw WhatsApp webhook.";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: rateLimitHeaders }
    );
  }
}

async function parseWebhookRequest(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  const rawBody = await req.text();

  if (!rawBody) {
    return {};
  }

  if (contentType.includes("application/json")) {
    return JSON.parse(rawBody) as unknown;
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }
}
