import { NextResponse } from "next/server";
import { getAdminRequestSession } from "@/lib/admin-request";
import { hasAdminPageAccess } from "@/lib/admin-access";
import { isRequestOriginAllowed } from "@/lib/request-safety";
import { listEmailIntake, sendIntakeQuestions, syncEmailIntake } from "@/lib/email-intake";
export const runtime = "nodejs";
export const maxDuration = 300;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function allowed() {
  const session = await getAdminRequestSession();
  return session && ["/admin/inbox", "/admin/quotation-approval"].every(path => hasAdminPageAccess(session.allowedPages, path, session));
}
export async function GET() {
  if (!await allowed()) return json({ error: "Inbox and Quotes & invoices access are required." }, 403);
  try { return json(await listEmailIntake()); } catch { return json({ error: "Could not load enquiries." }, 502); }
}
export async function POST(request: Request) {
  if (!await allowed()) return json({ error: "Inbox and Quotes & invoices access are required." }, 403);
  if (!isRequestOriginAllowed(request)) return json({ error: "Origin not allowed." }, 403);
  try {
    const text = await request.text();
    if (text.length > 2000) return json({ error: "Request too large." }, 413);
    const body = JSON.parse(text);
    if (body.action === "sync") return json(await syncEmailIntake());
    if (body.action === "ask" && typeof body.id === "string" && /^gmail-[a-zA-Z0-9_-]{1,128}$/.test(body.id) && typeof body.version === "string" && /^[a-f0-9]{24}$/.test(body.version)) return json(await sendIntakeQuestions(body.id, body.version));
    return json({ error: "Invalid request." }, 400);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Unable to process the enquiry." }, 502); }
}
