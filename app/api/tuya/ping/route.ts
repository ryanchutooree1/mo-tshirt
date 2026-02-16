import { NextResponse } from "next/server";
import { getTuyaBaseUrl, hasTuyaKeys } from "../../../../lib/tuya";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    hasKeys: hasTuyaKeys(),
    baseUrl: getTuyaBaseUrl(),
  });
}
