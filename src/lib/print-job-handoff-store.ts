import { randomUUID } from "node:crypto";
import { collection, doc, getDoc, getDocs, limit, query, runTransaction, where } from "firebase/firestore";
import { db } from "./firebase";
import {
  HandoffError, buildHandoffView, cents, emailAddress, getHandoffRecord, handoffHash, handoffLifecycleFingerprint,
  mauritiusDate, parseHandoffSettings, prepareHandoffPreview, quotePricing, record, text,
  validateHandoffSettings, type HandoffAction, type HandoffActor, type HandoffDelivery,
  type HandoffPaymentRecord, type HandoffPreview, type HandoffOrder,
} from "./print-job-handoff";

const settingsRef = () => doc(db, "adminSettings", "printJobHandoff");
const registryRef = () => doc(db, "adminSettings", "printPartners");
const quoteRef = (id: string) => doc(db, "quotes", id);
const eventRef = (id: string, eventId: string) => doc(db, "quotes", id, "handoffEvents", eventId);
function assertQuoteId(id: string) { if (!id || id.length > 180 || /[\/\\\u0000-\u001f]/.test(id) || id === "." || id === "..") throw new HandoffError("Invalid quote ID."); }
async function readLinkedOrder(id: string, quote: Record<string, unknown>, read: typeof getDoc): Promise<HandoffOrder | undefined> {
  const explicit = text(quote.orderTransactionId);
  if (explicit && !/[\/\\\u0000-\u001f]/.test(explicit) && explicit.length <= 180) {
    const snapshot = await read(doc(db, "transactions", explicit));
    if (snapshot.exists() && (!snapshot.data().quoteId || snapshot.data().quoteId === id)) return { id: explicit, data: snapshot.data() };
  }
  const matches = await getDocs(query(collection(db, "transactions"), where("quoteId", "==", id), limit(1)));
  const reverseId = matches.docs[0]?.id;
  if (reverseId) {
    const snapshot = await read(doc(db, "transactions", reverseId));
    if (snapshot.exists() && snapshot.data().quoteId === id) return { id: reverseId, data: snapshot.data() };
  }
  return undefined;
}
export async function readHandoffSettings() {
  const snapshot = await getDoc(settingsRef());
  return { settings: parseHandoffSettings(snapshot.data()), today: mauritiusDate() };
}
export async function writeHandoffSettings(value: unknown, actor: HandoffActor) {
  const input = validateHandoffSettings(value), now = new Date().toISOString();
  return runTransaction(db, async (transaction) => {
    const ref = settingsRef(), snapshot = await transaction.get(ref), current = parseHandoffSettings(snapshot.data());
    if (current.version !== input.expectedVersion) throw new HandoffError("Settings changed. Reload before saving.", 409);
    if (input.liveEnabled && !current.liveEnabled && !input.acknowledgeLiveMode) throw new HandoffError("Explicitly confirm switching on live production-partner delivery.");
    const settings = { configured: true, version: current.version + 1, partnerId: input.partnerId, testEnabled: input.testEnabled, testRecipient: input.testRecipient, testDate: input.testDate, requiredPaymentPercent: input.requiredPaymentPercent, liveEnabled: input.liveEnabled, updatedAtIso: now };
    transaction.set(ref, { ...settings, updatedBy: actor });
    transaction.set(doc(db, "adminSettings", "printJobHandoff", "audit", randomUUID()), { beforeVersion: current.version, settings, actor, atIso: now });
    return { settings, today: mauritiusDate() };
  });
}
export async function readJobHandoff(id: string, origin: string, canManageSettings: boolean) {
  assertQuoteId(id);
  const [quote, settings, registry] = await Promise.all([getDoc(quoteRef(id)), getDoc(settingsRef()), getDoc(registryRef())]);
  if (!quote.exists()) throw new HandoffError("Quotation not found. Create the quotation before handing it to production.", 404);
  const order = await readLinkedOrder(id, quote.data(), getDoc);
  return buildHandoffView(id, quote.data(), parseHandoffSettings(settings.data()), registry.data(), origin, canManageSettings, Date.now(), order);
}
function assertVersion(actual: number, expected: number) { if (actual !== expected) throw new HandoffError("This job changed. Reload it before saving.", 409); }
function smtpConfiguration() {
  const host = process.env.SMTP_HOST?.trim(), user = process.env.SMTP_USER?.trim(), pass = process.env.SMTP_PASS;
  const missing = [!host && "SMTP_HOST", !user && "SMTP_USER", !pass?.trim() && "SMTP_PASS"].filter(Boolean);
  if (missing.length) throw new HandoffError(`The email server is not fully configured: missing ${missing.join(", ")}. No handoff was sent.`, 503);
  const rawSender = process.env.SMTP_FROM?.trim() || user || "";
  const bracket = rawSender.match(/^[^<>\r\n]*<([^<>\r\n]+)>$/);
  // Match the existing quotation sender's fallback for legacy display-name-only
  // or empty-angle-bracket SMTP_FROM values. Use only the configured mailbox;
  // never invent a sender address or accept multiple addresses/header content.
  const address = emailAddress(bracket?.[1] || rawSender) || emailAddress(user);
  if (!address) throw new HandoffError("The email server is not fully configured: SMTP_FROM must contain one valid sender email, or SMTP_USER must be an email address. No handoff was sent.", 503);
  const port = Number(process.env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new HandoffError("The email server is not fully configured: SMTP_PORT must be an integer from 1 to 65535. No handoff was sent.", 503);
  return { host, port, secure: String(process.env.SMTP_SECURE || "true") === "true", auth: { user, pass }, address };
}
async function sendPreview(preview: HandoffPreview, id: string, requestId: string) {
  const smtp = smtpConfiguration();
  // Never choose recipients from a browser-provided address or a hardcoded default.
  // The immutable approved preview contains exactly the server-resolved destination.
  // @ts-expect-error This project uses nodemailer without separate type declarations.
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, auth: smtp.auth, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 45000 });
  const messageId = `<handoff-${handoffHash({ id, requestId })}@${smtp.address.split("@")[1]}>`;
  if (preview.mode === "test" && mauritiusDate(Date.parse(preview.createdAtIso)) !== mauritiusDate()) throw new HandoffError("The test window expired before delivery.", 409);
  const result = await transport.sendMail({ from: smtp.address, to: preview.recipients, envelope: { from: smtp.address, to: preview.recipients }, subject: preview.subject, text: preview.text, messageId, headers: { "X-Auto-Response-Suppress": "All", "X-Entity-Ref-ID": `print-job-${id}` } });
  const accepted = Array.isArray(result.accepted) ? result.accepted.map((address: unknown) => emailAddress(address)) : [];
  if (preview.recipients.some((address) => !accepted.includes(address)) || Array.isArray(result.rejected) && result.rejected.length) throw new HandoffError("Delivery to every approved recipient could not be confirmed.", 502);
  return messageId;
}
export async function performJobHandoff(id: string, input: HandoffAction, actor: HandoffActor, origin: string, canManageSettings: boolean) {
  assertQuoteId(id);
  const inputHash = handoffHash(input), now = Date.now(), atIso = new Date(now).toISOString();
  const outcome = await runTransaction(db, async (transaction) => {
    const ref = quoteRef(id), audit = eventRef(id, `request-${input.requestId}`);
    const [quoteSnap, settingsSnap, registrySnap, auditSnap] = await Promise.all([transaction.get(ref), transaction.get(settingsRef()), transaction.get(registryRef()), transaction.get(audit)]);
    if (!quoteSnap.exists()) throw new HandoffError("Quotation not found.", 404);
    const quote = quoteSnap.data(), settings = parseHandoffSettings(settingsSnap.data()), registry = registrySnap.data(), stored = getHandoffRecord(quote);
    if (auditSnap.exists()) {
      const old = auditSnap.data();
      if (old.inputHash !== inputHash || record(old.actor).userId !== actor.userId) throw new HandoffError("This request ID has already been used for a different action.", 409);
      if (input.action === "send" && stored.delivery?.requestId === input.requestId && stored.delivery.state !== "sent") throw new HandoffError("Delivery remains in progress or unconfirmed. Do not send again; check it manually.", 409);
      return { send: null as HandoffPreview | null, replayed: true };
    }
    if (stored.delivery?.state === "sending" || stored.delivery?.state === "unknown") throw new HandoffError("Delivery is in progress or unconfirmed. Do not repeat the handoff; check it manually.", 409);
    const order = await readLinkedOrder(id, quote, transaction.get.bind(transaction) as typeof getDoc);
    const view = buildHandoffView(id, quote, settings, registry, origin, canManageSettings, now, order);
    const next = { ...stored, version: stored.version + 1 };
    if (input.action === "confirm-price") {
      if (view.gates.reopenRequired || !view.gates.activeJob) throw new HandoffError("This job must be explicitly reopened after reviewing its closure or client response before a new price agreement can be confirmed.", 409);
      assertVersion(stored.version, input.expectedVersion);
      const pricing = quotePricing(quote);
      if (input.pricingFingerprint !== pricing.fingerprint || pricing.quotedTotal === null || pricing.quotedTotal <= 0 || cents(input.agreedTotal) !== cents(pricing.quotedTotal)) throw new HandoffError("The agreed amount must match the current quotation total. Refresh the price first.", 409);
      next.priceConfirmation = { id: input.requestId, pricingFingerprint: pricing.fingerprint, lifecycleFingerprint: handoffLifecycleFingerprint(quote, order), workflowVersionAtAgreement: Number(record(quote.printJobWorkflow).version) || 0, agreedTotal: pricing.quotedTotal, currency: pricing.currency, note: input.note, confirmedAtIso: atIso, actor };
      next.preview = null;
    } else if (input.action === "verify-payment") {
      if (!view.gates.priceAgreed) throw new HandoffError("Confirm the current quotation price before recording received money.", 409);
      const duplicate = stored.payments.find((entry) => entry.reference.trim().toLowerCase() === input.reference.trim().toLowerCase() || Boolean(input.evidenceId && entry.evidenceId === input.evidenceId));
      if (duplicate) {
        if (cents(duplicate.amountReceived) === cents(input.amountReceived) && duplicate.paymentDate === input.paymentDate && duplicate.currency === view.pricing.currency) return { send: null as HandoffPreview | null, replayed: true };
        throw new HandoffError("That payment reference or evidence was already used with different details. Add a distinct correction reference and note after checking the money.", 409);
      }
      assertVersion(stored.version, input.expectedVersion);
      if (input.evidenceId && input.evidenceId !== text(record(quote.paymentEvidence).uploadId)) throw new HandoffError("The selected evidence does not belong to this quotation.");
      if (input.amountReceived < view.payment.verifiedAmount && !input.note) throw new HandoffError("Explain the correction when reducing the verified received total.");
      const payment: HandoffPaymentRecord = { id: input.requestId, amountReceived: input.amountReceived, currency: view.pricing.currency, paymentDate: input.paymentDate, reference: input.reference, evidenceId: input.evidenceId, note: input.note, confirmedAtIso: atIso, actor };
      next.payments = [...stored.payments, payment];
      next.preview = null;
    } else if (input.action === "preview") {
      assertVersion(stored.version, input.expectedVersion);
      next.preview = prepareHandoffPreview(id, quote, settings, registry, origin, input.requestId, now, order);
    } else {
      // Credential validation performs no SMTP call and happens before the send lock.
      smtpConfiguration();
      const oldPreview = stored.preview;
      if (!oldPreview || oldPreview.id !== input.previewId || oldPreview.fingerprint !== input.previewFingerprint || !Number.isFinite(Date.parse(oldPreview.expiresAtIso)) || Date.parse(oldPreview.expiresAtIso) <= now) throw new HandoffError("The reviewed preview is missing, changed or expired. Preview this job again.", 409);
      const currentPreview = prepareHandoffPreview(id, quote, settings, registry, origin, oldPreview.id, now, order);
      if (currentPreview.fingerprint !== oldPreview.fingerprint) throw new HandoffError("The job, payment, settings or recipient changed after preview. Review a new preview before sending.", 409);
      next.delivery = { state: "sending", requestId: input.requestId, previewId: oldPreview.id, previewFingerprint: oldPreview.fingerprint, mode: oldPreview.mode, recipients: oldPreview.recipients, claimedAtIso: atIso };
    }
    transaction.update(ref, { printJobHandoff: next });
    transaction.set(audit, { action: input.action, inputHash, actor, atIso, version: next.version, details: input.action === "confirm-price" ? next.priceConfirmation : input.action === "verify-payment" ? next.payments.at(-1) : input.action === "preview" ? next.preview : next.delivery });
    return { send: input.action === "send" ? next.preview : null, replayed: false };
  });
  if (outcome.send) {
    let state: "sent" | "unknown" = "unknown", messageId = "";
    try { messageId = await sendPreview(outcome.send, id, input.requestId); state = "sent"; }
    catch (error) { console.error("print-job-handoff:delivery-unconfirmed", error instanceof Error ? error.name : "unknown"); }
    try {
      await runTransaction(db, async (transaction) => {
        const ref = quoteRef(id), snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new HandoffError("Job disappeared while recording delivery.", 409);
        const current = getHandoffRecord(snapshot.data());
        if (current.delivery?.requestId !== input.requestId || current.delivery.state !== "sending") throw new HandoffError("The delivery lock changed unexpectedly.", 409);
        const delivery: HandoffDelivery = { ...current.delivery, state, completedAtIso: new Date().toISOString(), ...(messageId ? { messageId } : {}) };
        transaction.update(ref, { printJobHandoff: { ...current, version: current.version + 1, delivery } });
        transaction.set(eventRef(id, `result-${input.requestId}`), { action: "delivery-result", actor, atIso: delivery.completedAtIso, details: delivery });
      });
    } catch { throw new HandoffError("Delivery could not be recorded safely. Do not send again; check the existing handoff manually.", 502); }
    if (state === "unknown") throw new HandoffError("Delivery could not be confirmed. Do not send again; check the existing handoff manually.", 502);
  }
  const view = await readJobHandoff(id, origin, canManageSettings);
  return { ok: true, replayed: outcome.replayed, ...view };
}
