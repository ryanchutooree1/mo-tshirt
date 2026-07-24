import { NextResponse } from "next/server";
import { runInventoryPhotoRetentionCleanup } from "@/lib/inventory-photo-retention";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isCronAuthorized(req: Request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await runInventoryPhotoRetentionCleanup();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("cron:mob-photo-retention", error);
    return NextResponse.json(
      { error: "Photo retention cleanup failed." },
      { status: 500 }
    );
  }
}
