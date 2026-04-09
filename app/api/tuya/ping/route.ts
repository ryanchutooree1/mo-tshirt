import { NextResponse } from "next/server";
import { getConfiguredDeviceIds, getMissingTuyaEnvVars, getTuyaBaseUrl, getTuyaProjectCode, hasTuyaKeys } from "../../../../lib/tuya";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    hasKeys: hasTuyaKeys(),
    baseUrl: getTuyaBaseUrl(),
    projectCode: getTuyaProjectCode(),
    configuredDeviceIdsCount: getConfiguredDeviceIds().length,
    missingEnv: getMissingTuyaEnvVars(),
  });
}
