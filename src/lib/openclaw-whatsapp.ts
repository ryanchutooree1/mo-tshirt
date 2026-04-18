import { setTimeout as delay } from "node:timers/promises";

export const OPENCLAW_WHATSAPP_TRIGGER_MESSAGE = "Hi, analyse all client requests.";
export const OPENCLAW_WHATSAPP_REPLY_TEXT =
  "Done.\n8 client emails drafted.\n15 tasks assigned to your team.\n3 clients need your approval.";
export const OPENCLAW_WHATSAPP_THINKING_MIN_MS = 2_000;
export const OPENCLAW_WHATSAPP_THINKING_MAX_MS = 3_000;

type SupportedProvider = "json" | "twilio" | "meta";
type DeliveryProvider = "mock" | "twilio" | "meta";

export type IncomingWhatsAppMessage = {
  provider: SupportedProvider;
  from: string | null;
  text: string;
  messageSid: string | null;
};

export type ClientRequestSummary = {
  draftedEmails: number;
  assignedTasks: number;
  pendingApprovals: number;
};

export type DispatchResult = {
  provider: DeliveryProvider;
  simulated: boolean;
  messageId: string | null;
};

export function readOpenClawWhatsAppConfig() {
  return {
    triggerMessage: process.env.OPENCLAW_WHATSAPP_TRIGGER_MESSAGE || OPENCLAW_WHATSAPP_TRIGGER_MESSAGE,
    replyTextOverride: process.env.OPENCLAW_WHATSAPP_REPLY_TEXT || "",
    thinkingMinMs: readDurationMs("OPENCLAW_WHATSAPP_THINKING_MIN_MS", OPENCLAW_WHATSAPP_THINKING_MIN_MS),
    thinkingMaxMs: readDurationMs("OPENCLAW_WHATSAPP_THINKING_MAX_MS", OPENCLAW_WHATSAPP_THINKING_MAX_MS),
    typingIndicatorEnabled: process.env.OPENCLAW_WHATSAPP_TYPING_INDICATOR === "1",
  };
}

function readDurationMs(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.round(parsed);
}

export function parseWhatsAppWebhookPayload(payload: unknown): IncomingWhatsAppMessage | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;

  const twilioMessage = parseTwilioPayload(record);
  if (twilioMessage) {
    return twilioMessage;
  }

  const metaMessage = parseMetaPayload(record);
  if (metaMessage) {
    return metaMessage;
  }

  const directText = readString(record.message) || readString(record.text);
  if (!directText) {
    return null;
  }

  return {
    provider: "json",
    from: readString(record.from) || readString(record.sender) || null,
    text: directText,
    messageSid: readString(record.messageSid) || null,
  };
}

function parseTwilioPayload(record: Record<string, unknown>): IncomingWhatsAppMessage | null {
  const body = readString(record.Body);
  const from = readString(record.From);

  if (!body || !from || !from.startsWith("whatsapp:")) {
    return null;
  }

  return {
    provider: "twilio",
    from,
    text: body,
    messageSid: readString(record.MessageSid) || readString(record.SmsMessageSid) || null,
  };
}

function parseMetaPayload(record: Record<string, unknown>): IncomingWhatsAppMessage | null {
  const entries = Array.isArray(record.entry) ? record.entry : [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = Array.isArray((entry as Record<string, unknown>).changes)
      ? ((entry as Record<string, unknown>).changes as unknown[])
      : [];

    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as Record<string, unknown>).value;
      if (!value || typeof value !== "object") continue;

      const messages = Array.isArray((value as Record<string, unknown>).messages)
        ? ((value as Record<string, unknown>).messages as unknown[])
        : [];

      for (const message of messages) {
        if (!message || typeof message !== "object") continue;
        const messageRecord = message as Record<string, unknown>;
        const textBody = readString((messageRecord.text as Record<string, unknown> | undefined)?.body);
        if (!textBody) continue;

        return {
          provider: "meta",
          from: readString(messageRecord.from) || null,
          text: textBody,
          messageSid: readString(messageRecord.id) || null,
        };
      }
    }
  }

  return null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function isMatchingOpenClawCommand(message: string, triggerMessage: string) {
  return message === triggerMessage;
}

export function getThinkingDelayMs(minMs: number, maxMs: number) {
  const safeMin = Math.max(0, Math.min(minMs, maxMs));
  const safeMax = Math.max(safeMin, Math.max(minMs, maxMs));

  if (safeMin === safeMax) {
    return safeMin;
  }

  return safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1));
}

// Future: replace these placeholders with real Openclaw orchestration.
export async function analyseClientRequests() {
  const [draftedEmails, assignedTasks, pendingApprovals] = await Promise.all([
    draftClientEmails(),
    assignTasksToTeam(),
    getPendingApprovals(),
  ]);

  return {
    draftedEmails,
    assignedTasks,
    pendingApprovals,
  };
}

// Future: draft real client emails here.
export async function draftClientEmails() {
  return 8;
}

// Future: inspect requests and decide what work should be dispatched.
export async function assignTasksToTeam() {
  return 15;
}

// Future: pull approvals that still need the owner to sign off.
export async function getPendingApprovals() {
  return 3;
}

export function buildClientRequestReply(summary: ClientRequestSummary) {
  return [
    "Done.",
    `${summary.draftedEmails} client emails drafted.`,
    `${summary.assignedTasks} tasks assigned to your team.`,
    `${summary.pendingApprovals} clients need your approval.`,
  ].join("\n");
}

export async function runDemoThinkingDelay(delayMs: number) {
  await delay(delayMs);
}

export async function dispatchWhatsAppReply({
  incoming,
  replyText,
  enableTypingIndicator,
}: {
  incoming: IncomingWhatsAppMessage;
  replyText: string;
  enableTypingIndicator: boolean;
}): Promise<DispatchResult> {
  const preferredProvider = String(process.env.OPENCLAW_WHATSAPP_PROVIDER || "").trim().toLowerCase();

  if (shouldUseTwilio(preferredProvider) && incoming.from) {
    if (enableTypingIndicator && incoming.messageSid) {
      await sendTwilioTypingIndicator(incoming.messageSid);
    }

    return sendTwilioReply(incoming.from, replyText);
  }

  if (shouldUseMeta(preferredProvider) && incoming.from) {
    return sendMetaReply(incoming.from, replyText);
  }

  return {
    provider: "mock",
    simulated: true,
    messageId: null,
  };
}

function shouldUseTwilio(preferredProvider: string) {
  if (preferredProvider && preferredProvider !== "twilio") {
    return false;
  }

  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM
  );
}

function shouldUseMeta(preferredProvider: string) {
  if (preferredProvider && preferredProvider !== "meta") {
    return false;
  }

  return Boolean(
    process.env.WHATSAPP_CLOUD_API_TOKEN &&
      process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID
  );
}

async function sendTwilioReply(to: string, replyText: string): Promise<DispatchResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const from = process.env.TWILIO_WHATSAPP_FROM || "";
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const body = new URLSearchParams({
    To: ensureTwilioWhatsAppAddress(to),
    From: ensureTwilioWhatsAppAddress(from),
    Body: replyText,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      `Twilio WhatsApp reply failed (${response.status}): ${readString(payload.message) || "Unknown error."}`
    );
  }

  return {
    provider: "twilio",
    simulated: false,
    messageId: readString(payload.sid) || null,
  };
}

async function sendTwilioTypingIndicator(messageSid: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const body = new URLSearchParams({
    messageId: messageSid,
    channel: "whatsapp",
  });

  const response = await fetch("https://messaging.twilio.com/v2/Indicators/Typing.json", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(
      `Twilio typing indicator failed (${response.status}): ${readString(payload.message) || "Unknown error."}`
    );
  }
}

async function sendMetaReply(to: string, replyText: string): Promise<DispatchResult> {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN || "";
  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || "";
  const endpoint = `https://graph.facebook.com/v23.0/${encodeURIComponent(phoneNumberId)}/messages`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizeMetaRecipient(to),
      type: "text",
      text: {
        body: replyText,
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Meta WhatsApp reply failed (${response.status}).`);
  }

  const messages = Array.isArray(payload.messages) ? (payload.messages as Record<string, unknown>[]) : [];

  return {
    provider: "meta",
    simulated: false,
    messageId: readString(messages[0]?.id) || null,
  };
}

function ensureTwilioWhatsAppAddress(value: string) {
  return value.startsWith("whatsapp:") ? value : `whatsapp:${value}`;
}

function normalizeMetaRecipient(value: string) {
  return value.replace(/^whatsapp:/, "").replace(/\D+/g, "");
}
