import { createHash } from "node:crypto";
import { buildPrintJobs, safePrintJobUrl } from "./print-job-workflow";

export type HandoffActor = { userId: string; displayName: string; email: string };
export type HandoffSettings = {
  version: number; configured: boolean; partnerId: "yan"; testEnabled: boolean;
  testRecipient: string; testDate: string; requiredPaymentPercent: number | null;
  liveEnabled: boolean; updatedAtIso: string;
};
export type HandoffOrder = { id: string; data: Record<string, unknown> };
export type HandoffPriceConfirmation = {
  id: string; pricingFingerprint: string; lifecycleFingerprint?: string; workflowVersionAtAgreement?: number; agreedTotal: number; currency: string;
  note: string; confirmedAtIso: string; actor: HandoffActor;
};
export type HandoffPaymentRecord = {
  id: string; amountReceived: number; currency: string; paymentDate: string;
  reference: string; evidenceId: string; note: string; confirmedAtIso: string; actor: HandoffActor;
};
export type HandoffPreview = {
  id: string; fingerprint: string; pricingFingerprint: string; configVersion: number;
  mode: "test" | "live"; recipients: string[]; partnerName: string;
  subject: string; text: string; artwork: { name: string; url: string }[];
  createdAtIso: string; expiresAtIso: string;
};
export type HandoffDelivery = {
  state: "sending" | "sent" | "unknown"; requestId: string; previewId: string;
  previewFingerprint: string; mode: "test" | "live"; recipients: string[];
  claimedAtIso: string; completedAtIso?: string; messageId?: string;
};
export type HandoffRecord = {
  version: number; priceConfirmation: HandoffPriceConfirmation | null;
  payments: HandoffPaymentRecord[]; preview: HandoffPreview | null; delivery: HandoffDelivery | null;
};
export type HandoffView = {
  quoteId: string; version: number; canManageSettings: boolean; documentUrl: string;
  pricing: { fingerprint: string; quotedTotal: number | null; currency: string };
  priceConfirmation: (HandoffPriceConfirmation & { current: boolean }) | null;
  payment: { verifiedAmount: number; balance: number | null; records: HandoffPaymentRecord[]; legacyEvidenceVerified: boolean };
  gates: { requiredPaymentPercent: number | null; requiredAmount: number | null; priceAgreed: boolean; paymentSatisfied: boolean; canPreview: boolean; activeJob: boolean; jobClosed: boolean; reopenRequired: boolean; blockers: string[] };
  delivery: { mode: "test" | "live" | "disabled"; recipients: string[]; partnerName: string; testDate: string };
  handoff: HandoffDelivery | null; preview: HandoffPreview | null; artwork: { name: string; url: string }[];
};
export class HandoffError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = "HandoffError"; }
}
export const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const finite = (value: unknown): number | null => (typeof value === "number" || typeof value === "string" && value.trim() !== "") && Number.isFinite(Number(value)) ? Number(value) : null;
export const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const singleLine = (value: unknown, max = 500) => text(value).replace(/[\r\n\u0000-\u001f]+/g, " ").slice(0, max);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}
export function handoffHash(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
export function mauritiusDate(now = Date.now()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function validCalendarDate(value: string) { const time = Date.parse(`${value}T12:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value; }
export function emailAddress(value: unknown) {
  const address = text(value).toLowerCase();
  return address.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(address) ? address : "";
}
function boundedString(value: unknown, label: string, max: number, required = false) {
  if (value !== undefined && typeof value !== "string") throw new HandoffError(`Invalid ${label}.`);
  const result = text(value);
  if ((required && !result) || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) throw new HandoffError(`Enter a valid ${label}.`);
  return result;
}
function requireKeys(raw: Record<string, unknown>, keys: string[]) {
  const allowed = new Set(keys);
  if (Object.keys(raw).some((key) => !allowed.has(key))) throw new HandoffError("Unsupported handoff field.");
}
function version(value: unknown) { if (!Number.isSafeInteger(value) || Number(value) < 0) throw new HandoffError("Reload this job before saving."); return Number(value); }
export function requestId(value: unknown) { const id = text(value); if (!/^[A-Za-z0-9_-]{8,100}$/.test(id)) throw new HandoffError("A valid request ID is required."); return id; }
export function parseHandoffSettings(value: unknown): HandoffSettings {
  const raw = record(value);
  return {
    version: Number.isSafeInteger(raw.version) && Number(raw.version) > 0 ? Number(raw.version) : 0,
    configured: raw.configured === true && raw.partnerId === "yan", partnerId: "yan",
    testEnabled: raw.testEnabled === true, testRecipient: emailAddress(raw.testRecipient), testDate: text(raw.testDate),
    requiredPaymentPercent: raw.requiredPaymentPercent === undefined || raw.requiredPaymentPercent === 50 ? 50 : null,
    liveEnabled: raw.liveEnabled === true, updatedAtIso: text(raw.updatedAtIso),
  };
}
export function validateHandoffSettings(value: unknown) {
  const raw = record(value);
  requireKeys(raw, ["expectedVersion", "partnerId", "testEnabled", "testRecipient", "testDate", "requiredPaymentPercent", "liveEnabled", "acknowledgeLiveMode"]);
  const expectedVersion = version(raw.expectedVersion);
  if (raw.partnerId !== "yan" || typeof raw.testEnabled !== "boolean" || typeof raw.liveEnabled !== "boolean") throw new HandoffError("Choose the production partner and delivery mode.");
  if (raw.testEnabled && raw.liveEnabled) throw new HandoffError("Test mode and live partner sending cannot both be enabled.");
  const testRecipient = text(raw.testRecipient) ? emailAddress(raw.testRecipient) : "";
  if (text(raw.testRecipient) && !testRecipient || raw.testEnabled && !testRecipient) throw new HandoffError("Enter one valid test recipient email.");
  const testDate = boundedString(raw.testDate, "test date", 10);
  if (testDate && !validCalendarDate(testDate) || raw.testEnabled && !testDate) throw new HandoffError("Choose a valid test date in Mauritius time.");
  if (raw.requiredPaymentPercent !== null && raw.requiredPaymentPercent !== 50) throw new HandoffError("The agreed production-release threshold is 50%, or disable release by leaving the policy unset.");
  return { expectedVersion, partnerId: "yan" as const, testEnabled: raw.testEnabled, testRecipient, testDate, requiredPaymentPercent: raw.requiredPaymentPercent as number | null, liveEnabled: raw.liveEnabled, acknowledgeLiveMode: raw.acknowledgeLiveMode === true };
}
export function getHandoffRecord(quote: Record<string, unknown>): HandoffRecord {
  const raw = record(quote.printJobHandoff);
  return { version: Number.isSafeInteger(raw.version) && Number(raw.version) >= 0 ? Number(raw.version) : 0, priceConfirmation: Object.keys(record(raw.priceConfirmation)).length ? raw.priceConfirmation as HandoffPriceConfirmation : null, payments: Array.isArray(raw.payments) ? raw.payments as HandoffPaymentRecord[] : [], preview: Object.keys(record(raw.preview)).length ? raw.preview as HandoffPreview : null, delivery: Object.keys(record(raw.delivery)).length ? raw.delivery as HandoffDelivery : null };
}
/** Fingerprint only actual prices, quantities and charge terms. A receipt, payment
 * label, staff attribution or unrelated UI edit must not look like a price change. */
export function quotePricing(quote: Record<string, unknown>) {
  const draft = record(quote.quote);
  const quotedTotal = finite(draft.total), currency = text(draft.currency) || "Rs";
  const lines = Array.isArray(draft.lines) ? draft.lines.map((value) => {
    const line = record(value);
    return { description: text(line.description), quantity: finite(line.quantity), unitPrice: finite(line.unitPrice), includeInTotals: line.includeInTotals !== false };
  }) : [];
  const fingerprint = handoffHash({ currency, total: quotedTotal, lines, subtotal: finite(draft.subtotal), deliveryFee: finite(draft.deliveryFee), discount: finite(draft.discount), tax: finite(draft.tax), taxRate: finite(draft.taxRate), vatRate: finite(draft.vatRate) });
  return { fingerprint, quotedTotal: quotedTotal !== null ? cents(quotedTotal) / 100 : null, currency };
}
export function resolvePrivatePartner(value: unknown) {
  const raw = record(value), entries = Array.isArray(raw.partners) ? raw.partners : Object.values(record(raw.partners));
  const partner = entries.map(record).find((entry) => entry.id === "yan");
  const candidates = partner && Array.isArray(partner.emails) && partner.emails.length ? partner.emails : partner && text(partner.email) ? [partner.email] : [];
  const valid = candidates.map(emailAddress);
  return { name: singleLine(partner?.name) || "Production partner", configured: Boolean(partner && partner.active !== false && valid.length && valid.every(Boolean) && valid.length <= 10), recipients: valid.every(Boolean) ? [...new Set(valid)] : [] };
}
function absoluteArtwork(quoteId: string, quote: Record<string, unknown>, origin: string) {
  const [job] = buildPrintJobs([{ id: quoteId, data: quote }], []);
  // Use the same source-proven visuals shown during review, plus every original
  // download attachment (including PDFs). Never substitute blank productImages.
  const visualLabel = (kind: string, side: string, name: string) => `${side === "front" ? "Front " : side === "back" ? "Back " : ""}${kind} · ${name}`;
  const files = [
    ...job.mockups.map((file) => ({ name: visualLabel("final mockup", file.side, file.name), url: file.url })),
    ...job.artworks.map((file) => ({ name: visualLabel("print artwork", file.side, file.name), url: file.url })),
    ...job.artwork.map((file) => ({ name: `Attachment · ${file.name}`, url: file.url })),
  ];
  const seen = new Set<string>();
  return files.flatMap((file) => {
    const safe = safePrintJobUrl(file.url);
    if (!safe) return [];
    const url = safe.startsWith("/") ? new URL(safe, origin).href : safe;
    if (!safePrintJobUrl(url) || seen.has(url)) return [];
    seen.add(url);
    return [{ name: singleLine(file.name), url }];
  });
}
function requiresArtwork(quote: Record<string, unknown>) {
  const method = text(quote.printMethod) || text(record(quote.designBrief).printMethod);
  if (/^(?:plain|blank|none|no print(?:ing)?|sans impression|sans personnalisation)(?:\b|$)/i.test(method)) return false;
  return /\b(?:print(?:ing)?|dtf|dtg|vinyl|screen|sublimation|embroidery|embroid|broderie|impression|sérigraphie)\b/i.test(method);
}
function lifecycleTime(value: unknown): string {
  const raw = record(value);
  try {
    const time = typeof raw.toMillis === "function" ? (raw.toMillis as () => number).call(value) : typeof raw.seconds === "number" ? raw.seconds * 1000 : value instanceof Date ? value.getTime() : Date.parse(text(value));
    return Number.isFinite(time) ? new Date(time).toISOString() : "";
  } catch { return ""; }
}
function clientEventTime(quote: Record<string, unknown>): string {
  return [lifecycleTime(quote.clientDecisionAtIso), lifecycleTime(quote.clientDecisionAt), ...(Array.isArray(quote.clientResponseHistory) ? quote.clientResponseHistory.map((entry) => lifecycleTime(record(entry).submittedAtIso)) : [])].filter(Boolean).sort().at(-1) || "";
}
/** Agreement is renewed explicitly after an adverse client response or a manual
 * lifecycle revision. Payment records and automatic receipts cannot renew it. */
export function handoffLifecycleFingerprint(quote: Record<string, unknown>, order?: HandoffOrder) {
  const workflow = record(quote.printJobWorkflow);
  return handoffHash({
    clientDecision: text(quote.clientDecision), clientDecisionAtIso: clientEventTime(quote), clientDecisionComment: text(quote.clientDecisionComment),
    adverseResponses: (Array.isArray(quote.clientResponseHistory) ? quote.clientResponseHistory : []).map(record).filter((entry) => ["rejected", "changes_requested"].includes(text(entry.decision)) || ["reject", "changes"].includes(text(entry.action))).map((entry) => ({ id: text(entry.id), decision: text(entry.decision), action: text(entry.action), atIso: lifecycleTime(entry.submittedAtIso), comment: text(entry.comment) })),
    workflowVersion: workflow.version ?? 0, workflowStage: text(workflow.stage), workflowAtIso: lifecycleTime(workflow.updatedAtIso),
    orderId: order?.id || "", orderStatus: text(order?.data.status).toLowerCase(), orderStatusAtIso: lifecycleTime(order?.data.statusChangedAt) || lifecycleTime(order?.data.statusUpdatedAt) || lifecycleTime(order?.data.workflowDoneAt),
  });
}
export function handoffJobEligibility(quoteId: string, quote: Record<string, unknown>, order?: HandoffOrder) {
  const [job] = buildPrintJobs([{ id: quoteId, data: quote }], order ? [order] : []);
  const productionClosed = ["delivered", "cancelled", "canceled"].includes(text(order?.data.status).toLowerCase());
  const closed = productionClosed || job.stage === "completed" || job.stage === "declined";
  const adverse = ["rejected", "changes_requested"].includes(text(quote.clientDecision));
  const baseline = job.workflow?.basisSnapshot;
  const responseReviewed = Boolean(job.workflow && !job.workflowOverridden && baseline?.clientDecision === text(quote.clientDecision) && baseline.clientEventAtIso === clientEventTime(quote));
  const previousAgreement = getHandoffRecord(quote).priceConfirmation;
  const unreviewedAdverseRevision = Boolean(adverse && previousAgreement?.lifecycleFingerprint && previousAgreement.lifecycleFingerprint !== handoffLifecycleFingerprint(quote, order) && Number(job.workflow?.version || 0) <= Number(previousAgreement.workflowVersionAtAgreement || 0));
  const reopenRequired = closed || adverse && !responseReviewed || unreviewedAdverseRevision;
  return { activeJob: !closed, reopenRequired };
}
export function buildHandoffView(quoteId: string, quote: Record<string, unknown>, settings: HandoffSettings, registry: unknown, origin: string, canManageSettings: boolean, now = Date.now(), order?: HandoffOrder): HandoffView {
  const stored = getHandoffRecord(quote), pricing = quotePricing(quote), partner = resolvePrivatePartner(registry), artwork = absoluteArtwork(quoteId, quote, origin);
  const eligibility = handoffJobEligibility(quoteId, quote, order);
  const price = stored.priceConfirmation;
  const priceAgreed = Boolean(price && price.lifecycleFingerprint === handoffLifecycleFingerprint(quote, order) && !eligibility.reopenRequired && pricing.quotedTotal !== null && pricing.quotedTotal > 0 && price.pricingFingerprint === pricing.fingerprint && cents(price.agreedTotal) === cents(pricing.quotedTotal) && price.currency === pricing.currency);
  const lastPayment = stored.payments.at(-1);
  const verifiedAmount = lastPayment && lastPayment.currency === pricing.currency && Number.isFinite(lastPayment.amountReceived) && lastPayment.amountReceived >= 0 ? cents(lastPayment.amountReceived) / 100 : 0;
  const requiredAmount = settings.requiredPaymentPercent !== null && pricing.quotedTotal !== null && pricing.quotedTotal > 0 ? Math.ceil(cents(pricing.quotedTotal) * settings.requiredPaymentPercent / 100) / 100 : null;
  const paymentSatisfied = requiredAmount !== null && verifiedAmount >= requiredAmount;
  const mode = settings.testEnabled ? "test" : settings.liveEnabled ? "live" : "disabled";
  const recipients = mode === "test" ? (settings.testRecipient ? [settings.testRecipient] : []) : mode === "live" ? partner.recipients : [];
  const blockers: string[] = [];
  if (!eligibility.activeJob) blockers.push("This job or its production order is completed, declined or cancelled. Reopen it explicitly before confirming a new agreement or sending anything.");
  else if (eligibility.reopenRequired) blockers.push("Review the client rejection or requested changes, then explicitly reopen this job and confirm a renewed price agreement.");
  if (!settings.configured) blockers.push("The owner must configure the handoff settings.");
  if (settings.testEnabled && settings.liveEnabled) blockers.push("Delivery modes conflict. Ask the owner to correct the settings.");
  if (settings.requiredPaymentPercent === null) blockers.push("The required payment policy has not been decided.");
  if (!priceAgreed) blockers.push("Confirm the current quotation price with the client first.");
  if (requiredAmount !== null && !paymentSatisfied) blockers.push(`Verify at least ${pricing.currency} ${requiredAmount.toFixed(2)} actually received for this job.`);
  if (!partner.configured) blockers.push("A verified production partner contact must be saved in private settings.");
  if (mode === "disabled") blockers.push("Production sending is disabled.");
  if (mode === "test" && settings.testDate !== mauritiusDate(now)) blockers.push("The test date is not today in Mauritius. Sending stays disabled until the owner changes the settings.");
  if (!recipients.length) blockers.push("No valid recipient is configured for this mode.");
  if (requiresArtwork(quote) && !artwork.length) blockers.push("This printed job needs an accessible artwork file before handoff.");
  if (stored.delivery?.state === "sending" || stored.delivery?.state === "unknown") blockers.push("A previous delivery is in progress or unconfirmed. Do not send again; check it manually.");
  if (stored.delivery?.state === "sent" && !(stored.delivery.mode === "test" && mode === "live")) blockers.push("This job has already been handed off in this mode.");
  return { quoteId, version: stored.version, canManageSettings, documentUrl: ["quotation", "invoice"].includes(text(record(quote.quote).documentType) || "quotation") ? `/api/admin/print-jobs/${encodeURIComponent(quoteId)}/document` : "", pricing, priceConfirmation: price ? { ...price, current: priceAgreed } : null, payment: { verifiedAmount, balance: pricing.quotedTotal === null ? null : Math.max(0, cents(pricing.quotedTotal) - cents(verifiedAmount)) / 100, records: stored.payments, legacyEvidenceVerified: record(quote.paymentEvidence).verificationStatus === "confirmed" }, gates: { requiredPaymentPercent: settings.requiredPaymentPercent, requiredAmount, priceAgreed, paymentSatisfied, canPreview: blockers.length === 0, activeJob: eligibility.activeJob, jobClosed: !eligibility.activeJob, reopenRequired: eligibility.reopenRequired, blockers }, delivery: { mode, recipients, partnerName: partner.name, testDate: settings.testDate }, handoff: stored.delivery, preview: stored.preview, artwork };
}
export type HandoffAction =
  | { action: "confirm-price"; expectedVersion: number; requestId: string; pricingFingerprint: string; agreedTotal: number; note: string }
  | { action: "verify-payment"; expectedVersion: number; requestId: string; amountReceived: number; paymentDate: string; reference: string; evidenceId: string; note: string; acknowledgeBankReceipt: true }
  | { action: "preview"; expectedVersion: number; requestId: string }
  | { action: "send"; requestId: string; previewId: string; previewFingerprint: string; acknowledgeSend: true };
export function validateHandoffAction(value: unknown, now = Date.now()): HandoffAction {
  const raw = record(value), id = requestId(raw.requestId);
  if (raw.action === "confirm-price") {
    requireKeys(raw, ["action", "expectedVersion", "requestId", "pricingFingerprint", "agreedTotal", "note"]);
    const amount = finite(raw.agreedTotal), fingerprint = text(raw.pricingFingerprint);
    if (amount === null || amount <= 0 || amount > 1e9 || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new HandoffError("Confirm a valid positive current quotation price.");
    return { action: raw.action, expectedVersion: version(raw.expectedVersion), requestId: id, pricingFingerprint: fingerprint, agreedTotal: cents(amount) / 100, note: boundedString(raw.note, "client agreement note", 1500, true) };
  }
  if (raw.action === "verify-payment") {
    requireKeys(raw, ["action", "expectedVersion", "requestId", "amountReceived", "paymentDate", "reference", "evidenceId", "note", "acknowledgeBankReceipt"]);
    const amount = finite(raw.amountReceived), date = text(raw.paymentDate);
    if (amount === null || amount < 0 || amount > 1e9) throw new HandoffError("Enter the total amount actually received for this job.");
    if (!validCalendarDate(date) || date > mauritiusDate(now)) throw new HandoffError("Enter the actual received-payment date, not a future date.");
    if (raw.acknowledgeBankReceipt !== true) throw new HandoffError("Confirm that you checked the money was actually received, not just a screenshot or receipt.");
    return { action: raw.action, expectedVersion: version(raw.expectedVersion), requestId: id, amountReceived: cents(amount) / 100, paymentDate: date, reference: boundedString(raw.reference, "payment reference", 200, true), evidenceId: boundedString(raw.evidenceId, "evidence ID", 500), note: boundedString(raw.note, "verification note", 1500), acknowledgeBankReceipt: true };
  }
  if (raw.action === "preview") { requireKeys(raw, ["action", "expectedVersion", "requestId"]); return { action: raw.action, expectedVersion: version(raw.expectedVersion), requestId: id }; }
  if (raw.action === "send") {
    requireKeys(raw, ["action", "requestId", "previewId", "previewFingerprint", "acknowledgeSend"]);
    if (!/^[a-f0-9]{64}$/.test(text(raw.previewFingerprint)) || raw.acknowledgeSend !== true) throw new HandoffError("Review the current preview and explicitly confirm sending it.");
    return { action: raw.action, requestId: id, previewId: requestId(raw.previewId), previewFingerprint: text(raw.previewFingerprint), acknowledgeSend: true };
  }
  throw new HandoffError("Choose a supported handoff action.");
}
export function prepareHandoffPreview(quoteId: string, quote: Record<string, unknown>, settings: HandoffSettings, registry: unknown, origin: string, id: string, now = Date.now(), order?: HandoffOrder): HandoffPreview {
  const view = buildHandoffView(quoteId, quote, settings, registry, origin, false, now, order);
  if (!view.gates.canPreview) throw new HandoffError(view.gates.blockers[0], 409);
  const [job] = buildPrintJobs([{ id: quoteId, data: quote }], []);
  const mode = view.delivery.mode as "test" | "live";
  const prefix = mode === "test" ? "TEST ONLY — DO NOT PRODUCE: " : "Production handoff: ";
  const subject = `${prefix}${singleLine(job.reference, 120)}`;
  const lines = job.lines.map((line) => `- ${singleLine(line.description)}${line.color ? ` · ${singleLine(line.color)}` : ""}${line.size ? ` · ${singleLine(line.size)}` : ""}: ${line.quantity} pieces`);
  const method = singleLine(quote.printMethod || record(quote.designBrief).printMethod) || "Confirm with the team";
  const placement = singleLine(record(quote.partner).printPlacement || record(quote.designBrief).printPlacement) || "See the approved artwork / confirm with the team";
  const body = [mode === "test" ? "TEST DELIVERY ONLY. This message is a workflow test; do not begin production." : "Please review this selected MO T-SHIRT production job.", "", `Job reference: ${singleLine(job.reference, 120)}`, `Quantity: ${job.quantity || "To confirm"}`, ...lines, `Print method: ${method}`, `Print placement: ${placement}`, `Requested date: ${singleLine(job.deadline) || "To confirm"}`, "", "Artwork files:", ...(view.artwork.length ? view.artwork.map((file) => `- ${file.name}: ${file.url}`) : ["No artwork files attached to this job."]), "", "Please confirm any missing production details with the team before printing."].join("\n");
  const fingerprint = handoffHash({ quoteId, pricingFingerprint: view.pricing.fingerprint, priceId: getHandoffRecord(quote).priceConfirmation?.id, paymentId: getHandoffRecord(quote).payments.at(-1)?.id, configVersion: settings.version, requiredPaymentPercent: settings.requiredPaymentPercent, mode, testDate: settings.testDate, recipients: view.delivery.recipients, subject, text: body });
  return { id, fingerprint, pricingFingerprint: view.pricing.fingerprint, configVersion: settings.version, mode, recipients: view.delivery.recipients, partnerName: view.delivery.partnerName, subject, text: body, artwork: view.artwork, createdAtIso: new Date(now).toISOString(), expiresAtIso: new Date(now + 15 * 60000).toISOString() };
}
