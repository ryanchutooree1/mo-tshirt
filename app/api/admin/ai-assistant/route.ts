import { NextResponse } from "next/server";
import { getAssistantOverview } from "@/lib/ai-assistant-store";
import { isAdminRequest } from "@/lib/admin-request";

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const overview = await getAssistantOverview();
    return NextResponse.json(overview);
  } catch (error) {
    console.error("ai-assistant:overview", error);
    return NextResponse.json({ error: "Failed to load AI assistant overview." }, { status: 500 });
  }
}
