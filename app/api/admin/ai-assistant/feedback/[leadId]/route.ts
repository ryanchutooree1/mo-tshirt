import { NextResponse } from "next/server";
import { saveAssistantFeedback } from "@/lib/ai-assistant-store";
import { isAdminRequest } from "@/lib/admin-request";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { leadId } = await params;
  if (!leadId) {
    return NextResponse.json({ error: "Missing lead id." }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const verdict = cleanString(body?.verdict);
    const comment = cleanString(body?.comment);

    if (!verdict) {
      return NextResponse.json({ error: "Verdict is required." }, { status: 400 });
    }

    const result = await saveAssistantFeedback(leadId, verdict, comment);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.notFound ? 404 : 400 });
    }

    return NextResponse.json({
      ok: true,
      lead: result.lead,
      training: result.training,
    });
  } catch (error) {
    console.error("ai-assistant:feedback", error);
    return NextResponse.json({ error: "Failed to save feedback." }, { status: 500 });
  }
}
