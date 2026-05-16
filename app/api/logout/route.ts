import { NextResponse } from "next/server";
import { clearAdminSessionCookie } from "@/lib/admin-auth";
import { clearPartnerSessionCookie } from "@/lib/partner-auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearAdminSessionCookie(res);
  clearPartnerSessionCookie(res);
  return res;
}
