import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-request";
import { runAssistantChat } from "@/lib/ai-assistant-store";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildSessionId() {
  return `admin-test-${crypto.randomUUID().slice(0, 8)}`;
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const message = cleanString(body?.message);
    const sessionId = cleanString(body?.sessionId) || buildSessionId();
    const hasAttachment = Boolean(body?.attachment && typeof body.attachment === "object");

    if (!message && !hasAttachment) {
      return NextResponse.json({ error: "Message or attachment is required." }, { status: 400 });
    }

    const result = await runAssistantChat(sessionId, message, {
      attachment: hasAttachment ? body.attachment : null,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("ai-assistant:chat", error);
    return NextResponse.json({ error: "Failed to process Sales AI message." }, { status: 500 });
  }
}
