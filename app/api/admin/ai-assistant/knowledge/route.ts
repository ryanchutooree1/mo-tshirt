import { NextResponse } from "next/server";
import { saveAssistantKnowledge } from "@/lib/ai-assistant-store";
import { isAdminRequest } from "@/lib/admin-request";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const title = cleanString(body?.title);
    const content = cleanString(body?.content);

    if (!title || !content) {
      return NextResponse.json({ error: "Title and content are required." }, { status: 400 });
    }

    const result = await saveAssistantKnowledge(title, content);
    return NextResponse.json({
      ok: true,
      knowledge: result.knowledge,
      training: result.training,
    });
  } catch (error) {
    console.error("ai-assistant:knowledge", error);
    return NextResponse.json({ error: "Failed to save knowledge." }, { status: 500 });
  }
}
