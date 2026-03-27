import { NextResponse } from "next/server";
import { runAssistantChat } from "@/lib/ai-assistant-store";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildSessionId() {
  return `web-order-${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeSessionId(value: string) {
  const cleaned = cleanString(value);
  if (!cleaned) return buildSessionId();
  if (cleaned.startsWith("web-order-")) return cleaned;
  return `web-order-${cleaned.replace(/[^a-z0-9-]/gi, "").slice(0, 32) || crypto.randomUUID().slice(0, 8)}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = cleanString(body?.message);
    const sessionId = normalizeSessionId(cleanString(body?.sessionId));
    const hasAttachment = Boolean(body?.attachment && typeof body.attachment === "object");

    if (!message && !hasAttachment) {
      return NextResponse.json({ error: "Message or attachment is required." }, { status: 400 });
    }

    const result = await runAssistantChat(sessionId, message, {
      attachment: hasAttachment ? body.attachment : null,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("ai-assistant:public-chat", error);
    return NextResponse.json({ error: "Failed to process MO AI Order message." }, { status: 500 });
  }
}
