import { NextResponse } from "next/server";
import { getDeviceStatus, hasTuyaKeys } from "../../../../../../lib/tuya";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = String(rawId || "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "Device id is required." }, { status: 400 });
  }

  if (!hasTuyaKeys()) {
    return NextResponse.json({ ok: false, error: "Tuya keys missing" }, { status: 400 });
  }

  try {
    const status = await getDeviceStatus(id);
    return NextResponse.json({
      ok: true,
      id,
      status,
      lastFetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("tuya:status", error);
    const message = error instanceof Error ? error.message : "Failed to fetch device status.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
