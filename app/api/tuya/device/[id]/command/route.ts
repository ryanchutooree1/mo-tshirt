import { NextResponse } from "next/server";
import { hasTuyaKeys, sendDeviceCommand } from "../../../../../../lib/tuya";

export const runtime = "nodejs";

function isAllowedValue(value: unknown): value is boolean | number | string {
  return (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  );
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const id = String(params?.id || "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "Device id is required." }, { status: 400 });
  }

  if (!hasTuyaKeys()) {
    return NextResponse.json({ ok: false, error: "Tuya keys missing" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body?.code ?? "").trim();
  const value = body?.value;

  if (!code) {
    return NextResponse.json({ ok: false, error: "Command code is required." }, { status: 400 });
  }

  if (!isAllowedValue(value)) {
    return NextResponse.json(
      { ok: false, error: "Value must be boolean, number, or string." },
      { status: 400 }
    );
  }

  try {
    const result = await sendDeviceCommand(id, code, value);
    return NextResponse.json({
      ok: true,
      id,
      result: result.result ?? null,
      code: result.code ?? null,
      msg: result.msg ?? null,
      tid: result.tid ?? null,
      t: result.t ?? null,
    });
  } catch (error) {
    console.error("tuya:command", error);
    const message = error instanceof Error ? error.message : "Failed to send command.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
