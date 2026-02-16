import { NextResponse } from "next/server";
import { getMissingTuyaEnvVars, getTuyaBaseUrl, hasTuyaKeys } from "../../../../lib/tuya";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    hasKeys: hasTuyaKeys(),
    baseUrl: getTuyaBaseUrl(),
    missingEnv: getMissingTuyaEnvVars(),
  });
}
