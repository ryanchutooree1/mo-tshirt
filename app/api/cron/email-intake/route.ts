import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { syncEmailIntake } from "@/lib/email-intake";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET || "";
  const provided = Buffer.from(request.headers.get("authorization") || "");
  // The independent scheduler receives a credential that cannot invoke other cron routes.
  const scoped = createHmac("sha256", secret).update("mo-tshirt:email-intake:v1").digest("hex");
  const authorized = secret && [secret, scoped].some(value => {
    const expected = Buffer.from(`Bearer ${value}`);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
  if (!authorized) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const result = await syncEmailIntake({ maxAnalyses: new URL(request.url).searchParams.get("batch") === "1" ? 1 : 4 });
    return NextResponse.json(result, { status: "failures" in result && Number(result.failures) > 0 ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  }
  catch { return NextResponse.json({ error: "Email intake sync failed. Check the admin enquiry queue." }, { status: 502 }); }
}
