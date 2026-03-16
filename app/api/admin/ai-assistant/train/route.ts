import { NextResponse } from "next/server";
import { retrainAssistantModel } from "@/lib/ai-assistant-store";
import { isAdminRequest } from "@/lib/admin-request";

export async function POST() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const training = await retrainAssistantModel();
    return NextResponse.json({ ok: true, training });
  } catch (error) {
    console.error("ai-assistant:train", error);
    return NextResponse.json({ error: "Failed to retrain assistant." }, { status: 500 });
  }
}
