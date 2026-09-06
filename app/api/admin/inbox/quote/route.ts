import { NextResponse } from "next/server";
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { getSavedGmailToken } from "@/lib/gmail-connection-store";
import { db } from "@/lib/firebase";
import { getAdminRequestSession } from "@/lib/admin-request";
import { hasAdminPageAccess } from "@/lib/admin-access";
import { readInboxMessage, InboxError } from "@/lib/gmail-inbox";
import { buildEmailQuoteRecord, emailQuoteId, extractEmailQuote, isWebsiteQuotationCopy, normalizeEmailQuoteDraft } from "@/lib/email-quote";
import { isContentLengthWithinLimit, isRequestOriginAllowed } from "@/lib/request-safety";
export const runtime = "nodejs";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  const session = await getAdminRequestSession();
  if (!session || !["/admin/inbox", "/admin/quotation-approval"].every(path => hasAdminPageAccess(session.allowedPages, path, session))) return json({ error: "Inbox and Quotes & invoices access are required." }, 403);
  if (!isRequestOriginAllowed(request)) return json({ error: "Origin not allowed." }, 403);
  if (!isContentLengthWithinLimit(request.headers, 150000)) return json({ error: "Request too large." }, 413);
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 150000) return json({ error: "Request too large." }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: "Invalid request." }, 400); }
    if (!body || typeof body.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.id) || !["preview", "create"].includes(body.action)) return json({ error: "Invalid request." }, 400);
    const message = await readInboxMessage(body.id, await getSavedGmailToken());
    if (isWebsiteQuotationCopy(message)) return json({ error: "This is a website quotation notification. Its enquiry already belongs in Quotes & invoices; do not import the email copy." }, 409);
    const quoteId = emailQuoteId(message);
    const ref = doc(db, "quotes", quoteId);
    const existing = await getDoc(ref);
    if (existing.exists()) return json({ quoteId, existing: true });
    if (body.action === "preview") return json({ draft: extractEmailQuote(message), attachmentNames: message.attachmentNames || [] });
    const draft = normalizeEmailQuoteDraft(body.draft);
    if (!draft.name && !draft.company || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email) || !draft.lines.length) return json({ error: "Enter a client name, valid email and at least one product line." }, 400);
    const record = buildEmailQuoteRecord(message, draft, session.userId);
    const created = await runTransaction(db, async transaction => {
      if ((await transaction.get(ref)).exists()) return false;
      transaction.set(ref, { ...record, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return true;
    });
    return json({ quoteId, existing: !created });
  } catch (error) {
    if (error instanceof InboxError) return json({ error: error.message }, error.status);
    return json({ error: "Could not import this email. Please try again." }, 502);
  }
}
