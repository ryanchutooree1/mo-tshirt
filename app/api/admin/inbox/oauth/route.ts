import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getAdminRequestSession } from "@/lib/admin-request";
import { INBOX_EMAIL } from "@/lib/gmail-inbox";
export const runtime = "nodejs";
export async function GET() {
  if (!(await getAdminRequestSession())?.isOwner) return NextResponse.json({ error: "Only the website owner can reconnect Gmail." }, { status: 403 });
  const clientId = (process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_GMAIL_CLIENT_ID || "").trim();
  if (!clientId) return NextResponse.json({ error: "Gmail OAuth client is not configured." }, { status: 503 });
  const state = randomBytes(32).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  Object.entries({ client_id: clientId, redirect_uri: "https://www.mo-tshirt.mu/api/admin/inbox/oauth/callback", response_type: "code", scope: "https://www.googleapis.com/auth/gmail.readonly", access_type: "offline", prompt: "consent", login_hint: INBOX_EMAIL, state }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.set("__Host-gmail-oauth", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return response;
}
