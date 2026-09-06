import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { getAdminRequestSession } from "@/lib/admin-request";
import { INBOX_EMAIL } from "@/lib/gmail-inbox";
import { saveGmailConnection } from "@/lib/gmail-connection-store";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const finish = (result: string) => {
    const response = NextResponse.redirect(`https://www.mo-tshirt.mu/admin/inbox?gmail=${result}`);
    response.cookies.set("__Host-gmail-oauth", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  if (!(await getAdminRequestSession())?.isOwner) return finish("owner_required");
  const params = new URL(request.url).searchParams;
  const expected = (await cookies()).get("__Host-gmail-oauth")?.value || "";
  const received = params.get("state") || "";
  if (!expected || !/^[A-Za-z0-9_-]{43}$/.test(received) || Buffer.byteLength(expected) !== Buffer.byteLength(received) || !timingSafeEqual(Buffer.from(expected), Buffer.from(received))) return finish("invalid_state");
  const code = params.get("code");
  if (params.get("error") || !code || code.length > 4096) return finish("cancelled");
  try {
    const clientId = (process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_GMAIL_CLIENT_ID || "").trim();
    const clientSecret = (process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_GMAIL_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) return finish("not_configured");
    const exchange = await fetch("https://oauth2.googleapis.com/token", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: "https://www.mo-tshirt.mu/api/admin/inbox/oauth/callback", grant_type: "authorization_code" }) });
    const token = await exchange.json();
    if (!exchange.ok || !token.access_token || !token.refresh_token) return finish("exchange_failed");
    if (!String(token.scope || "").split(" ").includes("https://www.googleapis.com/auth/gmail.readonly")) return finish("scope_required");
    const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { cache: "no-store", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token.access_token}` } });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || profile.emailAddress?.toLowerCase() !== INBOX_EMAIL) return finish("wrong_account");
    const lifetime = Number(token.refresh_token_expires_in);
    await saveGmailConnection({ refreshToken: token.refresh_token, clientId, email: INBOX_EMAIL, connectedAt: new Date().toISOString(), expiresAt: Number.isFinite(lifetime) && lifetime > 0 ? new Date(Date.now() + lifetime * 1000).toISOString() : null });
    return finish("connected");
  } catch { return finish("connection_failed"); }
}
