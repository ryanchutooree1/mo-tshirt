import { NextResponse } from "next/server";
import { submitAssistantLeadFromSession } from "@/lib/ai-assistant-store";
import { isAdminRequest } from "@/lib/admin-request";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session id." }, { status: 400 });
  }

  try {
    const result = await submitAssistantLeadFromSession(sessionId);
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          missingFields: result.missingFields || [],
        },
        { status: result.notFound ? 404 : 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      lead: result.lead,
      quoteId: result.quoteId,
    });
  } catch (error) {
    console.error("ai-assistant:submit", error);
    return NextResponse.json({ error: "Failed to submit lead." }, { status: 500 });
  }
}
