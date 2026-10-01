import { requestSource, type RequestSource } from "./quotation-inbox";
import { buildPrintJobVisuals, buildPrintJobGarmentSummary, type PrintJobVisual } from "./print-job-visuals";
import type { EmailIntake } from "./email-intake-model";

/** Operational stages are intentionally independent of client decisions and payment. */
export type PrintJobStage = "new" | "needs_details" | "awaiting_client" | "confirmed" | "production" | "ready" | "completed" | "declined";
export type PrintJobClosureKind = "shop_declined" | "client_declined" | "cancelled";
export type PrintJobSource = { id: string; data: Record<string, unknown> };
export type PrintJobActor = { userId: string; displayName: string; email: string };
export type PrintJobLine = { description: string; color: string; size: string; quantity: number; unitPrice: number | null };
export type PrintJobDocument = { kind: "quotation" | "invoice" | "proforma" | "receipt" | "order"; reference: string; url: string; generatedAutomatically: boolean };
export type PrintJobPayment = {
  status: "verified" | "pending_verification" | "unverified" | "not_recorded";
  label: string; detail: string; verified: boolean; evidenceUrl: string;
  recordedLabel: string; hasAutomaticReceipt: boolean;
};
export type PrintJobBasisSnapshot = {
  version: 1; derivedStage: PrintJobStage; clientDecision: string; clientEventAtIso: string;
  quoteStatus: string; sentAtIso: string; orderStatus: string | null;
  partnerStatus: string; intakeVersion: string; intakeStatus: string;
};
export type PrintJobWorkflow = {
  stage: PrintJobStage; reason: string; nextAction: string; followUpDate: string;
  closureKind: PrintJobClosureKind | null; updatedAtIso: string; updatedBy: PrintJobActor; version: number; basisSnapshot: PrintJobBasisSnapshot | null;
};
export type PrintJobWorkflowHistory = PrintJobWorkflow & {
  id: string; fromStage: PrintJobStage; requestId: string; expectedVersion: number;
  acknowledgeCompletion: boolean;
};
export type PrintJobHistoryEntry = {
  id: string; kind: "created" | "sent" | "client" | "production" | "workflow" | "payment";
  label: string; detail: string; atIso: string; actor: string; stage?: PrintJobStage;
};
/** Read-only, source-backed details for the authorized admin job workspace. */
export type PrintJobProduct = { description: string; color: string; size: string; quantity: number | null; printMethod: string; printPlacement: string; printDimensions: string };
export type PrintJobDetails = {
  summary: string;
  customer: { name: string; company: string; email: string; phone: string; address: string };
  delivery: { method: string; recipient: string; phone: string; address: string; postCode: string; deadline: string };
  products: PrintJobProduct[]; garmentQuantity: number | null;
  printMethod: string; printPlacement: string; printDimensions: string;
  artworkRequests: { label: string; product: string; color: string; size: string; quantity: number | null; placement: string; dimensions: string; instructions: string }[];
  pricingSource: "Order" | "Quotation" | ""; pricingCurrency: string;
  pricingLines: { description: string; quantity: number | null; unitPrice: number | null; lineTotal: number | null; included: boolean }[];
  deliveryFee: number | null; discount: number | null;
  notes: { label: string; text: string }[];
  attachments: { name: string; url: string; originalName: string; originalUrl: string; description: string }[];
};
export type PrintJob = {
  key: string; quoteId: string | null; orderId: string | null; intakeId: string | null; name: string; reference: string;
  source: RequestSource; stage: PrintJobStage; status: string; action: string; reason: string;
  derivedStage: PrintJobStage; derivedReason: string; closureKind: PrintJobClosureKind | null;
  attention: boolean; overdue: boolean; followUpDue: boolean; urgent: boolean;
  deadline: string; followUpDate: string; createdAt: number; lastActivity: number;
  email: string; phone: string; delivery: string; address: string; message: string;
  total: number | null; currency: string; quantity: number; garmentSummary: string; lines: PrintJobLine[];
  payment: PrintJobPayment; artwork: { name: string; url: string }[]; thumbnail: { name: string; url: string } | null; mockups: PrintJobVisual[]; artworks: PrintJobVisual[]; documents: PrintJobDocument[];
  workflow: PrintJobWorkflow | null; workflowOverridden: boolean; history: PrintJobHistoryEntry[]; productionNote: string;
  editable: boolean; automaticPrice: boolean; details?: PrintJobDetails;
};
export const PRINT_JOB_STAGES: { id: PrintJobStage; label: string; description: string }[] = [
  { id: "new", label: "New enquiry", description: "Review the request and prepare a quote" },
  { id: "needs_details", label: "Needs details", description: "Missing artwork, sizes or other information" },
  { id: "awaiting_client", label: "Awaiting client", description: "Quote or questions sent; waiting for a reply" },
  { id: "confirmed", label: "Confirmed", description: "Client agreed; review payment and prepare the job" },
  { id: "production", label: "In production", description: "Artwork, printing and production work" },
  { id: "ready", label: "Ready", description: "Printing complete; arrange collection or delivery" },
  { id: "completed", label: "Completed", description: "Collected, delivered or explicitly closed by the team" },
  { id: "declined", label: "Declined / cancelled", description: "Closed with a recorded reason" },
];
export function stageLabel(stage: PrintJobStage) { return PRINT_JOB_STAGES.find((entry) => entry.id === stage)?.label || stage; }
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === "string" ? value.trim() : "";
const number = (value: unknown): number | null => (typeof value === "number" || typeof value === "string" && value.trim() !== "") && Number.isFinite(Number(value)) ? Number(value) : null;
function millis(value: unknown): number {
  const raw = object(value);
  try {
    const time = typeof raw.toMillis === "function" ? (raw.toMillis as () => number).call(value)
      : typeof raw.seconds === "number" ? raw.seconds * 1000
      : value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(string(value));
    return Number.isFinite(time) ? time : 0;
  } catch { return 0; }
}
const iso = (value: unknown) => { const time = millis(value); return time ? new Date(time).toISOString() : ""; };
export function safePrintJobUrl(value: unknown): string {
  const raw = string(value);
  // Reject browser-normalized protocol-relative/backslash and control-character URLs.
  if (!raw || /[\\\u0000-\u001f\u007f]/.test(raw)) return "";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try { const url = new URL(raw); return url.protocol === "https:" && !url.username && !url.password ? raw : ""; } catch { return ""; }
}
const THUMBNAIL_IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|gif|avif|svg|bmp|ico|tiff?|heic|heif)$/i;
const NON_IMAGE_EXTENSION = /\.(?:pdf|ai|eps|ps|psd|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z|mp4|mov|webm)$/i;
function imagePath(url: string): string {
  try { return decodeURIComponent(new URL(url, "https://local.invalid").pathname); }
  catch { return ""; }
}
function imageThumbnailCandidate(urlValue: unknown, filename: string, contentType: unknown): { name: string; url: string } | null {
  const url = safePrintJobUrl(urlValue);
  if (!url) return null;
  const mime = string(contentType).toLowerCase().split(";", 1)[0], pathname = imagePath(url);
  // A PDF/document must not become an <img> merely because another piece of
  // attachment metadata mentions a logo or an image filename.
  if (NON_IMAGE_EXTENSION.test(filename) || NON_IMAGE_EXTENSION.test(pathname)) return null;
  if (mime && !mime.startsWith("image/") && !["application/octet-stream", "binary/octet-stream"].includes(mime)) return null;
  if (!mime.startsWith("image/") && !THUMBNAIL_IMAGE_EXTENSION.test(filename) && !THUMBNAIL_IMAGE_EXTENSION.test(pathname)) return null;
  return { name: filename || "Artwork", url };
}
function artworkThumbnail(attachments: unknown[]): { name: string; url: string } | null {
  const candidates = attachments.flatMap((value, index) => {
    const file = object(value);
    const filename = string(file.filename) || string(file.name);
    const originalFilename = string(file.originalFilename);
    const searchable = [string(file.label), string(file.description), filename, originalFilename].join(" ");
    const isMockup = file.role === "final-mockup" || /(?:^|[^a-z])(?:final[\s_-]*)?mockup(?:[^a-z]|$)/i.test(searchable);
    const isLogo = /(?:^|[^a-z])(?:logo|artwork)(?:[^a-z]|$)/i.test(searchable);
    const priority = isMockup ? 3 : file.role === "print-artwork" ? 0 : isLogo ? 1 : 2;
    const original = imageThumbnailCandidate(file.originalUrl, originalFilename, file.originalContentType);
    const current = imageThumbnailCandidate(file.url, filename, file.contentType);
    const candidate = original || current;
    return candidate ? [{ ...candidate, priority, index }] : [];
  });
  candidates.sort((a, b) => a.priority - b.priority || a.index - b.index);
  const first = candidates[0];
  return first ? { name: first.name, url: first.url } : null;
}
function isStage(value: unknown): value is PrintJobStage { return PRINT_JOB_STAGES.some((entry) => entry.id === value); }
function closureKind(value: unknown): PrintJobClosureKind | null { return value === "shop_declined" || value === "client_declined" || value === "cancelled" ? value : null; }
function actor(value: unknown): PrintJobActor {
  const raw = object(value);
  return { userId: string(raw.userId), displayName: string(raw.displayName) || "Team", email: string(raw.email) };
}
export function readPrintJobWorkflow(value: unknown): PrintJobWorkflow | null {
  const raw = object(value);
  if (!isStage(raw.stage) || !Number.isSafeInteger(raw.version) || Number(raw.version) < 1) return null;
  return { stage: raw.stage, reason: string(raw.reason), nextAction: string(raw.nextAction), followUpDate: string(raw.followUpDate), closureKind: closureKind(raw.closureKind), updatedAtIso: iso(raw.updatedAtIso), updatedBy: actor(raw.updatedBy), version: Number(raw.version), basisSnapshot: readBasisSnapshot(raw.basisSnapshot) };
}
function mapLines(value: unknown): PrintJobLine[] {
  return Array.isArray(value) ? value.slice(0, 200).map((entry) => {
    const line = object(entry), quantity = Math.max(0, number(line.quantity) || 0);
    return { description: string(line.description) || string(line.product) || string(line.productName) || string(line.garment) || "Custom garment", color: string(line.color) || string(line.colour), size: string(line.size), quantity, unitPrice: number(line.unitPrice) ?? (number(line.price) !== null && quantity > 0 ? Number(line.price) / quantity : null) };
  }) : [];
}
function payment(quote: Record<string, unknown>, order: Record<string, unknown>): PrintJobPayment {
  const draft = object(quote.quote), profile = object(order.documentProfile), evidence = object(quote.paymentEvidence);
  const rawLabel = string(order.paymentMethod) || string(profile.paymentStatus) || string(draft.paymentStatus);
  const recordedLabel = rawLabel === "Select Payment Status" ? "" : rawLabel;
  const evidenceUrl = safePrintJobUrl(evidence.url);
  const hasAutomaticReceipt = Boolean(Object.keys(object(quote.paymentReceipt)).length);
  const verified = string(evidence.verificationStatus) === "confirmed";
  if (verified) return { status: "verified", label: "Payment verified", detail: "Payment evidence was explicitly confirmed by the team.", verified, evidenceUrl, recordedLabel, hasAutomaticReceipt };
  if (evidenceUrl || string(evidence.uploadId) || string(evidence.verificationStatus) === "pending_manual_confirmation") return { status: "pending_verification", label: "Proof to verify", detail: "Payment proof is recorded but has not been verified.", verified, evidenceUrl, recordedLabel, hasAutomaticReceipt };
  if (recordedLabel || hasAutomaticReceipt) return { status: "unverified", label: /^(paid|cash|juice|bank transfer|card|mcb juice)$/i.test(recordedLabel) ? "Payment recorded · unverified" : recordedLabel || "Payment unverified", detail: hasAutomaticReceipt ? "An automatic receipt exists. It does not prove payment was received or verified." : "This is the document or order payment label. No verified payment evidence is recorded.", verified, evidenceUrl, recordedLabel, hasAutomaticReceipt };
  return { status: "not_recorded", label: "Payment not recorded", detail: "No verified payment evidence is recorded.", verified, evidenceUrl, recordedLabel, hasAutomaticReceipt };
}
function derived(quote: Record<string, unknown>, order?: Record<string, unknown>): { stage: PrintJobStage; reason: string; closureKind: PrintJobClosureKind | null } {
  const decision = string(quote.clientDecision), partner = object(quote.partner), intake = object(quote.intake);
  if (order) {
    const status = string(order.status).toLowerCase();
    if (status === "delivered") return { stage: "completed", reason: "The production order is marked Delivered.", closureKind: null };
    if (status === "cancelled" || status === "canceled") return { stage: "declined", reason: "The production order is cancelled.", closureKind: "cancelled" };
    if (status === "completed") return { stage: "ready", reason: "Printing is complete. Collection or delivery still needs arranging.", closureKind: null };
    if (status === "in process" || status === "in progress" || status === "production") return { stage: "production", reason: "The production order is in progress.", closureKind: null };
    return { stage: "confirmed", reason: "A production order exists. Review readiness before starting production.", closureKind: null };
  }
  if (decision === "rejected") return { stage: "declined", reason: string(quote.clientDecisionComment) || "The client declined this quotation.", closureKind: "client_declined" };
  if (decision === "changes_requested") return { stage: "needs_details", reason: string(quote.clientDecisionComment) || "The client requested changes.", closureKind: null };
  if (decision === "accepted") {
    if (["completed", "will_post_tomorrow", "ryan_to_collect"].includes(string(partner.productionStatus))) return { stage: "ready", reason: "The production partner marked the job ready. Customer handover is not yet recorded.", closureKind: null };
    if (["in_progress", "in_production", "printing"].includes(string(partner.productionStatus))) return { stage: "production", reason: "The production partner reports work in progress.", closureKind: null };
    return { stage: "confirmed", reason: "Client acceptance is recorded. Payment and production are tracked separately.", closureKind: null };
  }
  if (string(intake.status) === "waiting") return { stage: "awaiting_client", reason: "Questions were sent. Waiting for the client’s details.", closureKind: null };
  if (string(intake.status) === "needs_details") return { stage: "needs_details", reason: string(intake.summary) || "Details are needed before a quotation can be prepared.", closureKind: null };
  if (string(quote.status) === "sent") return { stage: "awaiting_client", reason: "The quotation was sent. Waiting for the client’s response.", closureKind: null };
  return { stage: "new", reason: string(quote.status) === "approved" ? "A quotation is prepared for review; client acceptance is not recorded." : "Review the enquiry and prepare the quotation.", closureKind: null };
}
function readBasisSnapshot(value: unknown): PrintJobBasisSnapshot | null {
  const raw = object(value);
  if (raw.version !== 1 || !isStage(raw.derivedStage)) return null;
  return { version: 1, derivedStage: raw.derivedStage, clientDecision: string(raw.clientDecision), clientEventAtIso: iso(raw.clientEventAtIso), quoteStatus: string(raw.quoteStatus), sentAtIso: iso(raw.sentAtIso), orderStatus: typeof raw.orderStatus === "string" ? raw.orderStatus.toLowerCase() : null, partnerStatus: string(raw.partnerStatus), intakeVersion: string(raw.intakeVersion), intakeStatus: string(raw.intakeStatus) };
}
function clientEventTime(quote: Record<string, unknown>): number {
  return Math.max(millis(quote.clientDecisionAtIso), millis(quote.clientDecisionAt), ...(Array.isArray(quote.clientResponseHistory) ? quote.clientResponseHistory.map((entry) => millis(object(entry).submittedAtIso)) : []));
}
function basisSnapshot(quote: Record<string, unknown>, order?: Record<string, unknown>): PrintJobBasisSnapshot {
  const intake = object(quote.intake);
  return { version: 1, derivedStage: derived(quote, order).stage, clientDecision: string(quote.clientDecision), clientEventAtIso: iso(clientEventTime(quote)), quoteStatus: string(quote.status), sentAtIso: iso(quote.sentAt), orderStatus: order ? string(order.status).toLowerCase() : null, partnerStatus: string(object(quote.partner).productionStatus), intakeVersion: string(intake.version), intakeStatus: string(intake.status) };
}
const ORDER_LIFECYCLE_STATUSES = new Set(["pending", "in process", "in progress", "production", "completed", "delivered", "cancelled", "canceled", "urgent"]);
const PARTNER_LIFECYCLE_STATUSES = new Set(["not_started", "in_progress", "in_production", "printing", "completed", "will_post_tomorrow", "ryan_to_collect"]);
/** An explicit closure remains closed. Open work can follow later client/production
 * evidence; payment labels, receipts and generic updatedAt timestamps never qualify. */
function workflowWasSuperseded(workflow: PrintJobWorkflow | null, quote: Record<string, unknown>, order?: Record<string, unknown>): boolean {
  if (!workflow || workflow.stage === "completed" || workflow.stage === "declined") return false;
  const before = workflow.basisSnapshot, now = basisSnapshot(quote, order);
  const hasClientDecision = ["accepted", "rejected", "changes_requested"].includes(now.clientDecision);
  if (before) {
    if (hasClientDecision && (now.clientDecision !== before.clientDecision || Boolean(now.clientEventAtIso && millis(now.clientEventAtIso) > millis(before.clientEventAtIso)))) return true;
    // A missing order is not evidence of a change: it may be outside this user's
    // permission scope or the currently loaded window.
    if (now.orderStatus !== null && ORDER_LIFECYCLE_STATUSES.has(now.orderStatus) && now.orderStatus !== before.orderStatus) return true;
    if (PARTNER_LIFECYCLE_STATUSES.has(now.partnerStatus) && now.partnerStatus !== before.partnerStatus) return true;
    if (now.quoteStatus === "sent" && (before.quoteStatus !== "sent" || Boolean(now.sentAtIso && millis(now.sentAtIso) > millis(before.sentAtIso)))) return true;
    if (now.intakeVersion && now.intakeVersion !== before.intakeVersion) return true;
    // Promotion replaces the pending-intake source with a real quotation. Its
    // inherited open hold must not hide that completed-details handover.
    if (before.intakeVersion && !now.intakeVersion && string(object(quote.emailImport).threadId)) return true;
    if (now.intakeStatus && ["needs_details", "waiting", "ready", "review"].includes(now.intakeStatus) && now.intakeStatus !== before.intakeStatus) return true;
    return false;
  }
  // Legacy metadata did not save a baseline. Only lifecycle-specific timestamps
  // can safely establish that evidence is newer; an edited payment must not do so.
  const savedAt = millis(workflow.updatedAtIso);
  if (!savedAt) return false;
  if (hasClientDecision && clientEventTime(quote) > savedAt) return true;
  if (now.quoteStatus === "sent" && millis(quote.sentAt) > savedAt) return true;
  const intake = object(quote.intake);
  if (now.intakeVersion && millis(intake.lastReplyAt) > savedAt) return true;
  const partner = object(quote.partner);
  if (PARTNER_LIFECYCLE_STATUSES.has(now.partnerStatus) && Math.max(millis(partner.productionStatusUpdatedAt), millis(partner.productionStatusUpdatedAtIso)) > savedAt) return true;
  if (order && now.orderStatus && ORDER_LIFECYCLE_STATUSES.has(now.orderStatus)) {
    const lifecycleAt = Math.max(millis(order.statusChangedAt), millis(order.statusUpdatedAt), millis(order.deliveredAt), millis(order.completedAt), millis(order.inventoryAdjustedAt), millis(order.workflowDoneAt), millis(order.transactionDate));
    if (lifecycleAt > savedAt) return true;
  }
  return false;
}
function defaultAction(stage: PrintJobStage): string {
  return { new: "Review enquiry", needs_details: "Resolve missing details", awaiting_client: "Follow up with client", confirmed: "Review payment & prepare job", production: "Check production", ready: "Arrange collection / delivery", completed: "View completed job", declined: "Review closure" }[stage];
}
function documents(quote: PrintJobSource | undefined, order: PrintJobSource | undefined): PrintJobDocument[] {
  const result: PrintJobDocument[] = [], draft = object(quote?.data.quote), receipt = object(quote?.data.paymentReceipt), profile = object(order?.data.documentProfile);
  const docKind = (value: unknown): PrintJobDocument["kind"] => string(value) === "partial_receipt" ? "receipt" : ["quotation", "invoice", "proforma", "receipt"].includes(string(value)) ? value as PrintJobDocument["kind"] : "quotation";
  if (quote && Object.keys(draft).length) result.push({ kind: docKind(draft.documentType), reference: string(draft.documentNumber) || quote.id.slice(-8).toUpperCase(), url: `/admin/quotation-approval?quoteId=${encodeURIComponent(quote.id)}`, generatedAutomatically: false });
  if (quote && Object.keys(receipt).length) result.push({ kind: "receipt", reference: string(receipt.documentNumber) || "Automatic receipt", url: `/admin/quotation-approval?quoteId=${encodeURIComponent(quote.id)}`, generatedAutomatically: true });
  if (order) result.push({ kind: "order", reference: string(order.data.invoiceNumber) || string(profile.documentNumber) || order.id.slice(-8).toUpperCase(), url: `/admin/orders?orderId=${encodeURIComponent(order.id)}`, generatedAutomatically: false });
  return result;
}
function history(quote: PrintJobSource | undefined, order: PrintJobSource | undefined): PrintJobHistoryEntry[] {
  const q = quote?.data || {}, o = order?.data || {}, result: PrintJobHistoryEntry[] = [];
  const add = (entry: PrintJobHistoryEntry) => { if (entry.atIso) result.push(entry); };
  add({ id: "created", kind: "created", label: "Enquiry created", detail: "Original source record", atIso: iso(q.createdAt || o.transactionDate), actor: "" });
  add({ id: "sent", kind: "sent", label: "Quotation sent", detail: "Recorded in the quotation", atIso: iso(q.sentAt), actor: "" });
  const responses = Array.isArray(q.clientResponseHistory) ? q.clientResponseHistory : [];
  for (const [index, response] of responses.entries()) {
    const raw = object(response), decision = string(raw.decision) || string(raw.action);
    add({ id: `client:${string(raw.id) || index}`, kind: "client", label: decision === "accepted" || decision === "accept" ? "Client accepted" : decision === "rejected" || decision === "reject" ? "Client declined" : "Client requested changes", detail: string(raw.comment), atIso: iso(raw.submittedAtIso), actor: string(object(raw.recordedBy).displayName) || "Client" });
  }
  if (!responses.length && string(q.clientDecision)) add({ id: "client-decision", kind: "client", label: string(q.clientDecision) === "accepted" ? "Client accepted" : string(q.clientDecision) === "rejected" ? "Client declined" : "Client requested changes", detail: string(q.clientDecisionComment), atIso: iso(q.clientDecisionAtIso || q.clientDecisionAt), actor: string(object(q.clientDecisionRecordedBy).displayName) || "Client" });
  if (order) add({ id: "production-record", kind: "production", label: `Production order: ${string(o.status) || "recorded"}`, detail: "Current production record; operational stage changes do not change this order.", atIso: iso(o.updatedAt || o.transactionDate), actor: "" });
  const evidence = object(q.paymentEvidence);
  add({ id: "payment-proof", kind: "payment", label: "Payment proof submitted", detail: "Proof was uploaded; uploading alone does not confirm receipt of funds.", atIso: iso(evidence.submittedAtIso), actor: string(object(evidence.uploadedBy).displayName) });
  if (string(evidence.verificationStatus) === "confirmed") add({ id: "payment-confirmed", kind: "payment", label: "Payment evidence confirmed", detail: "Explicit payment verification is recorded.", atIso: iso(evidence.confirmedAtIso || evidence.confirmedAt || evidence.verifiedAtIso), actor: string(object(evidence.verifiedBy).displayName) });
  for (const entry of Array.isArray(q.printJobWorkflowHistory) ? q.printJobWorkflowHistory : []) {
    const raw = object(entry), workflow = readPrintJobWorkflow(raw);
    if (!workflow) continue;
    add({ id: `workflow:${string(raw.id) || workflow.version}`, kind: "workflow", label: `Stage set to ${stageLabel(workflow.stage)}`, detail: [workflow.reason, workflow.nextAction, workflow.followUpDate ? `Follow up: ${workflow.followUpDate}` : ""].filter(Boolean).join(" · "), atIso: workflow.updatedAtIso, actor: workflow.updatedBy.displayName, stage: workflow.stage });
  }
  return result.sort((a, b) => millis(b.atIso) - millis(a.atIso));
}
const detailRows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.slice(0, 200).map(object) : [];
const detailUnique = (values: string[]) => [...new Set(values.filter(Boolean))];
const detailFirst = (...values: unknown[]) => values.map(string).find(Boolean) || "";
const detailQuantity = (value: unknown) => { const result = number(value); return result !== null && result >= 0 ? result : null; };
function detailPlacement(value: unknown): string {
  const raw = string(value);
  const labels: Record<string, string> = { small_front_only: "Small front", small_back_only: "Small back", large_front_only: "Large front", back_only: "Large back", front_back: "Front + back", small_front_back: "Small front + small back", small_front_large_back: "Small front + large back", large_front_small_back: "Large front + small back", large_front_large_back: "Large front + large back", logo_only: "Logo only", logo_front_back: "Logo front + back", sleeve_only: "Sleeve only", custom: "Custom placement (see notes)", not_set: "" };
  return Object.prototype.hasOwnProperty.call(labels, raw) ? labels[raw] : raw;
}
function detailDimensions(row: Record<string, unknown>): string {
  // Never turn studio canvas scale, text size, garment size, or a file's byte
  // size into physical print dimensions. Only explicitly saved print fields.
  return detailFirst(row.printDimensions, row.printSize);
}
function buildPrintJobDetails(q: Record<string, unknown>, o: Record<string, unknown>): PrintJobDetails {
  const draft = object(q.quote), profile = object(o.documentProfile), brief = object(q.designBrief), intake = object(q.intake), intakeDraft = object(intake.draft);
  const orderProducts = detailRows(o.products), garments = detailRows(q.garments), briefLines = detailRows(brief.lineItems), selectedSizes = detailRows(brief.selectedSizes), quoteLines = detailRows(draft.lines), intakeItems = detailRows(intake.items);
  const printMethod = detailFirst(q.printMethod, brief.printMethod, intakeDraft.printMethod);
  const printPlacement = detailPlacement(q.printPlacement) || detailPlacement(brief.printPlacement) || detailUnique(briefLines.map(row => detailPlacement(row.printPlacement))).join(" · ");
  const printDimensions = detailDimensions(q) || detailDimensions(brief);
  const product = (row: Record<string, unknown>): PrintJobProduct => ({
    description: detailFirst(row.garment, row.product, row.productName, row.description), color: detailFirst(row.color, row.colour), size: detailFirst(row.size, row.sizes), quantity: detailQuantity(row.quantity),
    printMethod: string(row.printMethod), printPlacement: detailPlacement(row.printPlacement) || detailPlacement(row.placement), printDimensions: detailDimensions(row),
  });
  let products: PrintJobProduct[];
  if (garments.length && !(garments.length === 1 && /^mixed$/i.test(string(garments[0].size)) && selectedSizes.length)) products = garments.map(product);
  else if (selectedSizes.length) products = selectedSizes.map(row => product({ ...row, garment: detailFirst(brief.product, garments[0]?.garment), color: detailFirst(brief.color, brief.colour, garments[0]?.color) }));
  else if (briefLines.length) products = briefLines.map(product);
  else if (orderProducts.length) products = orderProducts.map(product);
  else if (intakeItems.length) products = intakeItems.map(product);
  else if (quoteLines.length) products = quoteLines.map(product);
  else if (detailRows(intakeDraft.lines).length) products = detailRows(intakeDraft.lines).map(product);
  else if (detailFirst(q.garment, brief.product)) products = [product({ garment: detailFirst(q.garment, brief.product), color: detailFirst(q.color, brief.color, brief.colour), size: q.size, quantity: q.quantity ?? brief.totalQty })];
  else products = [];
  const hasGarmentEvidence = garments.length > 0 || selectedSizes.length > 0 || briefLines.length > 0 || orderProducts.length > 0 || intakeItems.length > 0 || Boolean(detailFirst(q.garment, brief.product));
  const garmentQuantity = hasGarmentEvidence && products.length > 0 && products.every(row => row.quantity !== null) ? products.reduce((total, row) => total + (row.quantity ?? 0), 0) : null;
  const pricingSource = orderProducts.length || detailRows(profile.lines).length ? "Order" : quoteLines.length ? "Quotation" : "";
  const priceRows = orderProducts.length ? orderProducts : detailRows(profile.lines).length ? detailRows(profile.lines) : quoteLines;
  const pricingLines = priceRows.map(row => {
    const quantity = detailQuantity(row.quantity), unitPrice = number(row.unitPrice);
    const savedTotal = number(row.lineTotal) ?? (orderProducts.length ? number(row.price) : null);
    const computed = quantity !== null && unitPrice !== null ? quantity * unitPrice : null;
    const lineTotal = savedTotal ?? (computed !== null && Number.isFinite(computed) ? Math.round((computed + Number.EPSILON) * 100) / 100 : null);
    return { description: detailFirst(row.description, row.product, row.productName, row.garment), quantity, unitPrice, lineTotal, included: row.includeInTotals !== false };
  });
  const notes: PrintJobDetails["notes"] = [];
  const addNote = (label: string, value: unknown) => { const text = string(value); if (text && !notes.some(note => note.text === text)) notes.push({ label, text }); };
  addNote("Customer message", q.message); addNote("Customer notes", q.notes); addNote("Design notes", brief.clientNotes); addNote("Quotation notes", draft.notes); addNote("Order notes", profile.notes); addNote("Order instructions", o.notes); addNote("Enquiry notes", intakeDraft.notes);
  addNote("Front print instructions", brief.frontLogoDescription); addNote("Back print instructions", brief.backLogoDescription); addNote("Front text", brief.frontText); addNote("Back text", brief.backText);
  const artworkRequests = detailRows(brief.artwork).map((row, index) => ({ label: string(row.label) || `Artwork ${index + 1}`, product: detailFirst(row.product, row.garment), color: detailFirst(row.color, row.colour), size: string(row.size), quantity: detailQuantity(row.quantity), placement: detailPlacement(row.printPlacement), dimensions: detailDimensions(row), instructions: [string(row.description), string(row.frontLogoDescription) ? `Front: ${string(row.frontLogoDescription)}` : "", string(row.backLogoDescription) ? `Back: ${string(row.backLogoDescription)}` : ""].filter(Boolean).join("\n") }));
  const rawAttachments = detailRows(q.attachments).length ? detailRows(q.attachments) : q.attachment ? [object(q.attachment)] : [];
  const attachments: PrintJobDetails["attachments"] = rawAttachments.map(file => ({ name: detailFirst(file.label, file.filename, file.name) || "Attachment", url: safePrintJobUrl(file.url), originalName: string(file.originalFilename), originalUrl: safePrintJobUrl(file.originalUrl), description: string(file.description) }));
  const attachmentNames = Array.isArray(intake.attachmentNames) ? intake.attachmentNames : Array.isArray(object(q.emailImport).attachmentNames) ? object(q.emailImport).attachmentNames as unknown[] : [];
  for (const name of attachmentNames.map(string).filter(Boolean)) if (!attachments.some(file => file.name === name || file.originalName === name)) attachments.push({ name, url: "", originalName: "", originalUrl: "", description: "" });
  const names = detailUnique(products.map(row => row.description));
  const colors = detailUnique(products.map(row => row.color));
  const sizeSummary = detailUnique(products.filter(row => row.size).map(row => `${row.size}${row.quantity !== null ? ` × ${row.quantity}` : ""}`));
  const concise = (values: string[], limit: number) => [...values.slice(0, limit), ...(values.length > limit ? [`+${values.length - limit} more`] : [])].join(", ");
  return {
    summary: [concise(names, 2), concise(colors, 3), concise(sizeSummary, 5)].filter(Boolean).join(" · "),
    customer: { name: detailFirst(o.customerName, profile.clientName, q.name, intakeDraft.name), company: detailFirst(profile.clientCompany, draft.clientCompany, intakeDraft.company), email: detailFirst(o.email, profile.clientEmail, q.email, intakeDraft.email), phone: detailFirst(o.phoneNumber, profile.clientPhone, q.phone, intakeDraft.phone), address: detailFirst(profile.clientAddress, draft.clientAddress, o.address, intakeDraft.address) },
    delivery: { method: detailFirst(o.deliveryMethod, q.delivery, brief.delivery, intakeDraft.delivery), recipient: string(q.deliveryName), phone: string(q.deliveryPhone), address: detailFirst(o.address, q.deliveryAddress, intakeDraft.address), postCode: string(q.deliveryPostCode), deadline: detailFirst(q.deadline, o.deadline, brief.deadline, intakeDraft.deadline) },
    products, garmentQuantity, printMethod: printMethod || detailUnique(products.map(row => row.printMethod)).join(" · "), printPlacement: printPlacement || detailUnique([...products.map(row => row.printPlacement), ...artworkRequests.map(row => row.placement)]).join(" · "), printDimensions: printDimensions || detailUnique([...products.map(row => row.printDimensions), ...artworkRequests.map(row => row.dimensions)]).join(" · "),
    artworkRequests, pricingSource, pricingCurrency: pricingSource === "Order" ? detailFirst(profile.currency, o.currency) || "Rs" : string(draft.currency) || "Rs", pricingLines, deliveryFee: number(pricingSource === "Order" ? profile.deliveryFee : draft.deliveryFee), discount: number(pricingSource === "Order" ? profile.discount : draft.discount), notes, attachments,
  };
}

function todayAt(now: number) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function buildPrintJobs(quotes: PrintJobSource[], orders: PrintJobSource[], now = Date.now()): PrintJob[] {
  const orderMap = new Map(orders.map((entry) => [entry.id, entry])), usedOrders = new Set<string>();
  const byQuote = new Map<string, PrintJobSource[]>();
  for (const order of orders) { const id = string(order.data.quoteId); if (id) byQuote.set(id, [...(byQuote.get(id) || []), order]); }
  const pairs: { quote?: PrintJobSource; order?: PrintJobSource }[] = quotes.map((quote) => {
    // Never merge an explicit link that conflicts with the order’s own quote reference.
    const explicit = orderMap.get(string(quote.data.orderTransactionId));
    const valid = explicit && (!string(explicit.data.quoteId) || explicit.data.quoteId === quote.id) && !usedOrders.has(explicit.id) ? explicit : undefined;
    const order = valid || byQuote.get(quote.id)?.find((entry) => !usedOrders.has(entry.id));
    if (order) usedOrders.add(order.id);
    return { quote, order };
  });
  for (const order of orders) if (!usedOrders.has(order.id)) pairs.push({ order });
  const today = todayAt(now);
  return pairs.map(({ quote, order }): PrintJob => {
    const q = quote?.data || {}, o = order?.data || {}, draft = object(q.quote), profile = object(o.documentProfile), intake = object(q.intake);
    const basis = derived(q, order?.data), workflow = readPrintJobWorkflow(q.printJobWorkflow);
    const workflowOverridden = workflowWasSuperseded(workflow, q, order?.data);
    const stage = workflow && !workflowOverridden ? workflow.stage : basis.stage;
    const closed = stage === "completed" || stage === "declined", deadline = string(q.deadline) || string(o.deadline);
    const followUpDate = workflow?.followUpDate || "", overdue = !closed && isCalendarDate(deadline) && deadline < today, followUpDue = !closed && isCalendarDate(followUpDate) && followUpDate <= today;
    const lines = mapLines([o.products, draft.lines, q.garments, object(intake.draft).lines].find((value) => Array.isArray(value) && value.length));
    const lineTotal = order && lines.length && lines.every((line) => line.unitPrice !== null) ? lines.reduce((sum, line) => sum + line.quantity * (line.unitPrice || 0), 0) : null;
    let total = number(o.amount) ?? (order ? lineTotal : number(draft.total));
    // Legacy linked jobs may use quote lines when no order products exist.
    // Keep the currency with the actual amount/line source selected above.
    const orderMoney = number(o.amount) !== null || Boolean(order && Array.isArray(o.products) && o.products.length);
    const currency = orderMoney ? string(profile.currency) || string(o.currency) || "Rs" : string(draft.currency) || (order ? string(profile.currency) : "") || "Rs";
    if (!order && total === 0 && ["new", "review"].includes(string(q.status)) && !string(q.clientDecision)) total = null;
    const visuals = buildPrintJobVisuals(q);
    const rawArtwork = Array.isArray(q.attachments) && q.attachments.length ? q.attachments : q.attachment ? [q.attachment] : [];
    const artwork = rawArtwork.map((entry) => { const file = object(entry); return { name: string(file.filename) || string(file.name) || "Artwork", url: safePrintJobUrl(file.url) || safePrintJobUrl(file.originalUrl) }; }).filter((file) => file.url);
    const events = history(quote, order), createdAt = Math.max(millis(q.createdAt), millis(o.transactionDate)), sentAt = millis(q.sentAt);
    const lastActivity = Math.max(createdAt, millis(q.updatedAt), millis(o.updatedAt), millis(intake.updatedAtIso), millis(q.clientDecisionAtIso), millis(workflow?.updatedAtIso), ...events.map((entry) => millis(entry.atIso)));
    const reason = workflow && !workflowOverridden ? workflow.reason || `The team set the workspace stage to ${stageLabel(workflow.stage)}.` : basis.reason;
    const quantity = lines.reduce((sum, line) => sum + line.quantity, 0) || number(q.quantity) || 0;
    return {
      key: quote ? `quote:${quote.id}` : `order:${order!.id}`, quoteId: quote?.id || null, orderId: order?.id || null, intakeId: null,
      name: string(o.customerName) || string(profile.clientName) || string(q.name) || "Unnamed customer",
      reference: string(o.invoiceNumber) || string(draft.documentNumber) || (quote?.id || order!.id).slice(-8).toUpperCase(),
      source: requestSource(string(q.source) || (order ? "team" : "")), stage, status: string(o.status) || string(q.status) || "new",
      action: !workflowOverridden && workflow?.nextAction || defaultAction(stage), reason, derivedStage: basis.stage, derivedReason: basis.reason,
      closureKind: workflow && !workflowOverridden ? workflow.closureKind : stage === "declined" ? basis.closureKind : null,
      attention: !closed && (overdue || followUpDue || ["new", "needs_details", "confirmed", "ready"].includes(stage) || stage === "awaiting_client" && Boolean(sentAt && now - sentAt >= 3 * 86400000)),
      overdue, followUpDue, urgent: string(o.status).toLowerCase() === "urgent", deadline, followUpDate, createdAt, lastActivity,
      email: string(o.email) || string(q.email), phone: string(o.phoneNumber) || string(q.phone), delivery: string(o.deliveryMethod) || string(q.delivery),
      address: string(o.address) || string(q.deliveryAddress) || string(draft.clientAddress), message: string(q.message) || string(q.notes),
      total, currency, quantity,
      garmentSummary: buildPrintJobGarmentSummary(q) || [...new Set(lines.map((line) => line.description))].slice(0, 3).join(" · ") || "Garments to confirm", lines,
      payment: payment(q, o), artwork, thumbnail: artworkThumbnail(rawArtwork), mockups: visuals.mockups, artworks: visuals.artworks, documents: documents(quote, order), workflow, workflowOverridden, history: events,
      productionNote: order ? `Production record: ${string(o.status) || "status not recorded"}. Changing this workspace stage leaves the production order unchanged.` : "",
      editable: Boolean(quote) && !Object.keys(intake).length,
      details: buildPrintJobDetails(q, o),
      automaticPrice: Boolean(string(object(q.automaticPricing).source) || number(object(q.automaticPricing).pricedLineCount) !== null),
    };
  }).sort((a, b) => Number(b.urgent) - Number(a.urgent) || Number(b.overdue) - Number(a.overdue) || Number(b.followUpDue) - Number(a.followUpDue) || Number(b.attention) - Number(a.attention) || b.lastActivity - a.lastActivity);
}

export type PrintJobEmailIntake = EmailIntake & { printJobWorkflow?: unknown; printJobWorkflowHistory?: unknown };
export function buildPendingEmailJobs(enquiries: PrintJobEmailIntake[], existingQuoteIds: Iterable<string> = [], now = Date.now()): PrintJob[] {
  const known = new Set(existingQuoteIds);
  const pending = enquiries.filter((entry) => entry.status !== "ignored" && !entry.quoteId && !known.has(entry.id));
  return pending.map((entry) => {
    const [job] = buildPrintJobs([{ id: entry.id, data: {
      name: entry.draft.name || entry.email, email: entry.email, phone: entry.draft.phone,
      source: "Gmail", status: "review", message: entry.summary || entry.subject,
      createdAt: entry.lastReplyAt, updatedAt: entry.updatedAtIso, deadline: entry.draft.deadline,
      delivery: entry.draft.delivery, deliveryAddress: entry.draft.address, intake: entry,
      printJobWorkflow: entry.printJobWorkflow, printJobWorkflowHistory: entry.printJobWorkflowHistory,
    } }], [], now);
    return { ...job, key: `intake:${entry.id}`, quoteId: null, intakeId: entry.id, reference: entry.subject || entry.id.slice(-8).toUpperCase(), editable: true };
  });
}

export class PrintJobWorkflowError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = "PrintJobWorkflowError"; }
}
export type PrintJobUpdateInput = {
  stage: PrintJobStage; reason: string; nextAction: string; followUpDate: string;
  closureKind: PrintJobClosureKind | null; expectedVersion: number; requestId: string; acknowledgeCompletion: boolean; targetType?: "quote" | "intake";
};
function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function validatePrintJobUpdate(value: unknown): PrintJobUpdateInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PrintJobWorkflowError("Provide a stage update.");
  const raw = object(value), keys = new Set(["stage", "reason", "nextAction", "followUpDate", "closureKind", "expectedVersion", "requestId", "acknowledgeCompletion", "targetType"]);
  if (Object.keys(raw).some((key) => !keys.has(key))) throw new PrintJobWorkflowError("Unsupported workflow field.");
  if (!isStage(raw.stage)) throw new PrintJobWorkflowError("Choose a valid job stage.");
  if (raw.targetType !== undefined && raw.targetType !== "quote" && raw.targetType !== "intake") throw new PrintJobWorkflowError("Choose a valid workflow target.");
  if (!Number.isSafeInteger(raw.expectedVersion) || Number(raw.expectedVersion) < 0) throw new PrintJobWorkflowError("Reload the job before saving its stage.");
  const field = (key: string, max: number) => {
    if (raw[key] !== undefined && typeof raw[key] !== "string") throw new PrintJobWorkflowError(`Invalid ${key}.`);
    const result = string(raw[key]);
    if (result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) throw new PrintJobWorkflowError(`${key} is too long or contains invalid characters.`);
    return result;
  };
  const reason = field("reason", 1500), nextAction = field("nextAction", 500), followUpDate = field("followUpDate", 10), requestId = field("requestId", 100);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) throw new PrintJobWorkflowError("A valid save request ID is required.");
  if (followUpDate && !isCalendarDate(followUpDate)) throw new PrintJobWorkflowError("Choose a valid follow-up date.");
  if (["needs_details", "declined"].includes(raw.stage) && !reason) throw new PrintJobWorkflowError("Add a reason for this stage.");
  const kind = closureKind(raw.closureKind);
  if (raw.closureKind != null && !kind) throw new PrintJobWorkflowError("Choose a valid closure reason type.");
  if (raw.stage === "declined" && !kind) throw new PrintJobWorkflowError("Choose whether the shop declined, the client declined, or the job was cancelled.");
  if (raw.stage !== "declined" && kind) throw new PrintJobWorkflowError("A closure type is only used for declined or cancelled jobs.");
  if (raw.acknowledgeCompletion !== undefined && typeof raw.acknowledgeCompletion !== "boolean") throw new PrintJobWorkflowError("Invalid completion acknowledgement.");
  if (raw.stage === "completed" && raw.acknowledgeCompletion !== true) throw new PrintJobWorkflowError("Confirm that this job is ready to be closed as completed.");
  return { stage: raw.stage, reason, nextAction, followUpDate, closureKind: kind, expectedVersion: Number(raw.expectedVersion), requestId, acknowledgeCompletion: raw.acknowledgeCompletion === true, targetType: raw.targetType === "intake" ? "intake" : "quote" };
}
export function buildPrintJobWorkflowUpdate(quote: Record<string, unknown>, input: PrintJobUpdateInput, updatedBy: PrintJobActor, updatedAtIso: string, order?: Record<string, unknown>): { workflow: PrintJobWorkflow; historyEntry: PrintJobWorkflowHistory; replayed: boolean } {
  // Validate here as well so non-HTTP callers cannot bypass the contract.
  input = validatePrintJobUpdate(input);
  const current = readPrintJobWorkflow(quote.printJobWorkflow), version = current?.version || 0;
  const entries = Array.isArray(quote.printJobWorkflowHistory) ? quote.printJobWorkflowHistory : [];
  const previous = entries.map(object).find((entry) => entry.requestId === input.requestId);
  if (previous) {
    const matching = previous.expectedVersion === input.expectedVersion && previous.stage === input.stage && string(previous.reason) === input.reason && string(previous.nextAction) === input.nextAction && string(previous.followUpDate) === input.followUpDate && closureKind(previous.closureKind) === input.closureKind && previous.acknowledgeCompletion === input.acknowledgeCompletion && object(previous.updatedBy).userId === updatedBy.userId;
    const saved = readPrintJobWorkflow(previous);
    if (!matching || !saved) throw new PrintJobWorkflowError("This save request ID was already used. Reload and try again.", 409);
    return { workflow: current || saved, historyEntry: previous as PrintJobWorkflowHistory, replayed: true };
  }
  if (version !== input.expectedVersion) throw new PrintJobWorkflowError("Someone updated this job. Reload it before saving your changes.", 409);
  const fromStage = current && !workflowWasSuperseded(current, quote, order) ? current.stage : derived(quote, order).stage;
  const orderOf = (stage: PrintJobStage) => PRINT_JOB_STAGES.findIndex((entry) => entry.id === stage);
  const isReopen = fromStage !== input.stage && (fromStage === "completed" || fromStage === "declined");
  if ((isReopen || orderOf(input.stage) < orderOf(fromStage)) && !input.reason) throw new PrintJobWorkflowError("Add a reason when reopening a job or moving it back.");
  const workflow: PrintJobWorkflow = { stage: input.stage, reason: input.reason, nextAction: input.nextAction, followUpDate: input.followUpDate, closureKind: input.closureKind, version: version + 1, updatedAtIso, updatedBy: actor(updatedBy), basisSnapshot: basisSnapshot(quote, order) };
  const historyEntry: PrintJobWorkflowHistory = { ...workflow, id: input.requestId, requestId: input.requestId, fromStage, expectedVersion: input.expectedVersion, acknowledgeCompletion: input.acknowledgeCompletion };
  return { workflow, historyEntry, replayed: false };
}
