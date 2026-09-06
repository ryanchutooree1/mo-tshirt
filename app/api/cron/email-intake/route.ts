import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncEmailIntake } from "@/lib/email-intake";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  const provided = Buffer.from(request.headers.get("authorization") || "");
  if (!process.env.CRON_SECRET || provided.length !== expected.length || !timingSafeEqual(provided, expected)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try { return NextResponse.json(await syncEmailIntake(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Email intake sync failed. Check the admin enquiry queue." }, { status: 502 }); }
}
