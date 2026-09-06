import { NextRequest, NextResponse } from "next/server";
import { readSavedGmailConnection } from "@/lib/gmail-connection-store";
import { getAdminRequestSession, isAdminRequest } from "@/lib/admin-request";
import { InboxError, listInbox, readInboxMessage } from "@/lib/gmail-inbox";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!(await isAdminRequest("/api/admin/inbox"))) return json({ error: "Unauthorized" }, 401);
  const canReconnect = Boolean((await getAdminRequestSession())?.isOwner);
  const params = request.nextUrl.searchParams;
  const id = params.get("id");
  const search = (params.get("q") || "").trim();
  const page = params.get("pageToken") || "";
  if ((id !== null && !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) || search.length > 500 || page.length > 2048) return json({ error: "Invalid inbox request." }, 400);
  try {
    const saved = await readSavedGmailConnection();
    return json(id ? { message: await readInboxMessage(id, saved?.refreshToken) } : { ...await listInbox(search, page, saved?.refreshToken), canReconnect, connection: saved ? { connectedAt: saved.connectedAt, expiresAt: saved.expiresAt } : null });
  } catch (error) {
    if (error instanceof InboxError) return json({ error: error.message, configured: error.configured, canReconnect }, error.status);
    return json({ error: "Gmail is temporarily unavailable. Please try again.", canReconnect }, 502);
  }
}
