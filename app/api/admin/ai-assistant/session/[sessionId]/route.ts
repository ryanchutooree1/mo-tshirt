import { NextResponse } from "next/server";
import { getAssistantSession } from "@/lib/ai-assistant-store";
import { isAdminRequest } from "@/lib/admin-request";

export async function GET(
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
    const session = await getAssistantSession(sessionId);
    return NextResponse.json({ session });
  } catch (error) {
    console.error("ai-assistant:session:get", error);
    return NextResponse.json({ error: "Failed to load session." }, { status: 500 });
  }
}
