import { NextResponse } from "next/server";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { getAdminRequestSession } from "@/lib/admin-request";
import { canUseProductionWorkspace } from "@/lib/admin-access";
import { db } from "@/lib/firebase";
import { buildEmailQuoteRecord, normalizeEmailQuoteDraft } from "@/lib/email-quote";
import { getMissingDetails, type EmailIntake, type IntakeItem } from "@/lib/email-intake-model";
import { enquiryProductionBlockers, enquiryProductionGarments } from "@/lib/email-enquiry-production";
import { isWorkspaceEnquiry, workspaceEnquiry } from "@/lib/print-job-workspace-access";
import { isContentLengthWithinLimit, isRequestOriginAllowed } from "@/lib/request-safety";

const MAX_BYTES = 100 * 1024;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
class EnquiryError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const fields = ["name", "email", "phone", "company", "address", "brn", "vat", "deadline", "printMethod", "delivery", "notes", "lines"];
const itemFields = ["product", "quantity", "colour", "sizes", "printMethod", "placement", "artwork"];
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const unexpected = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).some(key => !allowed.includes(key));
function readItems(value: unknown): IntakeItem[] {
  if (!Array.isArray(value) || value.length > 50) throw new EnquiryError("Provide up to 50 product lines.");
  return value.map(value => {
    const item = record(value);
    if (unexpected(item, itemFields)) throw new EnquiryError("Only production enquiry fields can be edited.");
    const text = (key: string) => typeof item[key] === "string" ? item[key].trim().slice(0, 1000) : "";
    const quantity = Number(item.quantity);
    if (item.quantity !== "" && item.quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000)) throw new EnquiryError("Product quantities must be whole numbers between 1 and 100000.");
    return { product: text("product"), quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : "", colour: text("colour"), sizes: text("sizes"), printMethod: text("printMethod"), placement: text("placement"), artwork: text("artwork") };
  });
}
async function readBody(request: Request) {
  if (!request.body) throw new EnquiryError("Provide enquiry details.");
  const reader = request.body.getReader(), decoder = new TextDecoder();
  let text = "", bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new EnquiryError("Enquiry update is too large.", 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return record(JSON.parse(text)); } catch { throw new EnquiryError("Provide valid JSON enquiry details."); }
}

/** No Gmail calls, arbitrary message IDs, sync, send, pricing or finance actions.
 * Only an existing, extracted client enquiry can be corrected and promoted. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminRequestSession();
  if (!session) return json({ error: "Please sign in again." }, 401);
  if (!canUseProductionWorkspace(session.allowedPages, session)) return json({ error: "Production enquiry workspace access is required." }, 403);
  if (!isRequestOriginAllowed(request)) return json({ error: "Origin not allowed." }, 403);
  if (!isContentLengthWithinLimit(request.headers, MAX_BYTES)) return json({ error: "Enquiry update is too large." }, 413);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Use JSON enquiry details." }, 415);
  const { id } = await params;
  if (!/^gmail-[a-zA-Z0-9_-]{1,128}$/.test(id)) return json({ error: "Invalid enquiry ID." }, 400);
  try {
    const body = await readBody(request);
    if (unexpected(body, ["action", "version", "updatedAtIso", "draft", "items"]) || !["save", "promote"].includes(String(body.action)) || typeof body.version !== "string" || typeof body.updatedAtIso !== "string") throw new EnquiryError("Only save or promote of a reviewed enquiry is supported.");
    if (unexpected(record(body.draft), fields)) throw new EnquiryError("Only production enquiry fields can be edited.");
    const items = readItems(body.items);
    // Prices are not accepted, including nested fields smuggled into draft lines.
    if (Array.isArray(record(body.draft).lines) && (record(body.draft).lines as unknown[]).some(line => unexpected(record(line), ["description", "quantity"]))) throw new EnquiryError("Pricing is edited after creating the quotation.");
    const draft = normalizeEmailQuoteDraft(body.draft);
    // Structured product facts are the single source for the quotation lines.
    draft.lines = items.map(item => ({ description: [item.product, item.colour, item.sizes, item.printMethod, item.placement, item.artwork].filter(Boolean).join(" · "), quantity: item.quantity }));
    const result = await runTransaction(db, async transaction => {
      const intakeRef = doc(db, "emailIntake", id), quoteRef = doc(db, "quotes", id);
      const snapshot = await transaction.get(intakeRef);
      if (!snapshot.exists()) throw new EnquiryError("Saved client enquiry not found.", 404);
      const current = snapshot.data() as EmailIntake & { printJobWorkflow?: unknown; printJobWorkflowHistory?: unknown[] };
      if (!isWorkspaceEnquiry(current)) throw new EnquiryError("Saved client enquiry not found.", 404);
      if (current.id !== id || current.threadId !== id.slice(6)) throw new EnquiryError("The saved enquiry source could not be verified.", 409);
      if (current.quoteId && current.quoteId !== id) throw new EnquiryError("This enquiry already belongs to another quotation. Reload the workspace.", 409);
      const existingQuote = await transaction.get(quoteRef);
      if (existingQuote.exists()) return { quoteId: id, existing: true };
      if (current.quoteId || current.version !== body.version || current.updatedAtIso !== body.updatedAtIso) throw new EnquiryError("This enquiry changed. Reload it before saving your corrections.", 409);
      const missing = getMissingDetails(draft, items, current.language);
      if (body.action === "promote" && (missing.length || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email))) throw new EnquiryError("Complete the contact, product, printing and delivery details before creating the quotation.");
      if (body.action === "promote" && enquiryProductionBlockers(items).length) throw new EnquiryError("Record one size per product row with its exact quantity before creating the quotation. Split mixed sizes into separate rows.");
      const updatedAtIso = new Date(Math.max(Date.now(), (Date.parse(current.updatedAtIso) || 0) + 1)).toISOString();
      const next: EmailIntake = { ...current, draft, items, missing, classification: "enquiry", status: missing.length ? "needs_details" : "review", updatedAtIso };
      if (body.action === "promote") {
        const source = { ...current.lastMessage, threadId: current.threadId, text: current.originalText, attachmentNames: current.attachmentNames };
        const quote = buildEmailQuoteRecord(source, draft, session.userId);
        transaction.set(quoteRef, { ...quote, garments: enquiryProductionGarments(items), ...(current.printJobWorkflow ? { printJobWorkflow: current.printJobWorkflow } : {}), ...(Array.isArray(current.printJobWorkflowHistory) ? { printJobWorkflowHistory: current.printJobWorkflowHistory } : {}), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        next.quoteId = id; next.status = "ready";
      }
      transaction.update(intakeRef, { draft, items, missing, classification: next.classification, status: next.status, updatedAtIso, ...(next.quoteId ? { quoteId: next.quoteId } : {}) });
      return { intake: workspaceEnquiry(next), ...(next.quoteId ? { quoteId: next.quoteId, existing: false } : {}) };
    });
    return json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EnquiryError) return json({ error: error.message }, error.status);
    console.error("print-jobs:enquiry", error);
    return json({ error: "Enquiry details could not be saved. Reload and try again." }, 500);
  }
}
