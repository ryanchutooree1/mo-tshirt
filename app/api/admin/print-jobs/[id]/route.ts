import { NextResponse } from "next/server";
import { arrayUnion, collection, doc, getDocs, limit, query, runTransaction, where } from "firebase/firestore";
import { getAdminRequestSession } from "@/lib/admin-request";
import { canUseProductionWorkspace, hasAdminPageAccess } from "@/lib/admin-access";
import { db } from "@/lib/firebase";
import { isContentLengthWithinLimit, isRequestOriginAllowed } from "@/lib/request-safety";
import { buildPrintJobWorkflowUpdate, PrintJobWorkflowError, validatePrintJobUpdate } from "@/lib/print-job-workflow";
import { isWorkspaceEnquiry } from "@/lib/print-job-workspace-access";
import type { EmailIntake } from "@/lib/email-intake-model";

const MAX_BYTES = 16 * 1024;
async function readBody(req: Request) {
  if (!req.body) throw new PrintJobWorkflowError("Provide a stage update.");
  const reader = req.body.getReader(), decoder = new TextDecoder();
  let text = "", bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new PrintJobWorkflowError("Stage update is too large.", 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(text) as unknown; } catch { throw new PrintJobWorkflowError("Provide a valid JSON stage update."); }
}
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers });
  const session = await getAdminRequestSession();
  if (!session) return json({ error: "Please sign in again." }, 401);
  if (!hasAdminPageAccess(session.allowedPages, "/admin/quotation-approval", session)) return json({ error: "Quote workspace access required." }, 403);
  if (!isRequestOriginAllowed(req)) return json({ error: "Origin not allowed." }, 403);
  if (!isContentLengthWithinLimit(req.headers, MAX_BYTES)) return json({ error: "Stage update is too large." }, 413);
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Use a JSON stage update." }, 415);
  const { id } = await params;
  if (!id || id.length > 180 || /[\/\\\u0000-\u001f]/.test(id) || id === "." || id === "..") return json({ error: "Invalid quote ID." }, 400);
  try {
    const input = validatePrintJobUpdate(await readBody(req));
    const isIntake = input.targetType === "intake";
    const canProductionWorkspace = canUseProductionWorkspace(session.allowedPages, session);
    const canInbox = hasAdminPageAccess(session.allowedPages, "/admin/inbox", session);
    if (isIntake && !canInbox && !canProductionWorkspace) return json({ error: "Saved enquiry workspace access is required." }, 403);
    const quoteRef = doc(db, isIntake ? "emailIntake" : "quotes", id), updatedAtIso = new Date().toISOString();
    const updatedBy = { userId: session.userId, displayName: session.displayName || "Team", email: session.email || "" };
    const canOrders = hasAdminPageAccess(session.allowedPages, "/admin/orders", session) || canProductionWorkspace;
    const result = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(quoteRef);
      if (!snapshot.exists()) throw new PrintJobWorkflowError("Quotation not found. Create a quotation before assigning its workflow stage.", 404);
      const quote = snapshot.data() as Record<string, unknown>;
      if (isIntake && !canInbox && !isWorkspaceEnquiry(quote as EmailIntake)) throw new PrintJobWorkflowError("Saved client enquiry not found.", 404);
      if (isIntake && quote.quoteId) throw new PrintJobWorkflowError("This enquiry now has a quotation. Reload and update the quotation instead.", 409);
      let order: Record<string, unknown> | undefined;
      // Resolve either legacy link direction, then read the selected order inside
      // this transaction so its current state is included in the save's baseline.
      if (!isIntake && canOrders) {
        const explicitId = typeof quote.orderTransactionId === "string" && !/[\/\\]/.test(quote.orderTransactionId) ? quote.orderTransactionId : "";
        if (explicitId) {
          const orderSnap = await transaction.get(doc(db, "transactions", explicitId));
          if (orderSnap.exists()) {
            const candidate = orderSnap.data();
            if (!candidate.quoteId || candidate.quoteId === id) order = candidate;
          }
        }
        // The explicit link may be stale or conflict with the order's own quote.
        // Match GET's fallback instead of silently deriving a quote-only baseline.
        if (!order) {
          const linked = await getDocs(query(collection(db, "transactions"), where("quoteId", "==", id), limit(1)));
          const reverseId = linked.docs[0]?.id;
          if (reverseId) {
            const reverseSnap = await transaction.get(doc(db, "transactions", reverseId));
            if (reverseSnap.exists() && reverseSnap.data().quoteId === id) order = reverseSnap.data();
          }
        }
      }
      const next = buildPrintJobWorkflowUpdate(isIntake ? { ...quote, intake: quote } : quote, input, updatedBy, updatedAtIso, order);
      if (!next.replayed) transaction.update(quoteRef, {
        printJobWorkflow: next.workflow,
        printJobWorkflowHistory: arrayUnion(next.historyEntry),
      });
      return next;
    });
    return json({ ok: true, quoteId: isIntake ? null : id, intakeId: isIntake ? id : null, workflow: result.workflow, historyEntry: result.historyEntry, replayed: result.replayed, message: "Workspace stage saved. Client decisions, payments and production records are unchanged." });
  } catch (error) {
    if (error instanceof PrintJobWorkflowError) return json({ error: error.message }, error.status);
    console.error("print-jobs:workflow", error);
    return json({ error: "The stage could not be saved. Reload and try again." }, 500);
  }
}
