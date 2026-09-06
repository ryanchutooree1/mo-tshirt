import { createHash, randomUUID } from "node:crypto";
// @ts-expect-error nodemailer is used without separate type declarations in this project.
import nodemailer from "nodemailer";
import { collection, doc, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, setDoc, where } from "firebase/firestore";
import { getSavedGmailToken } from "./gmail-connection-store";
import { db } from "@/lib/firebase";
import { createGmailConnection, INBOX_EMAIL, readGmailThread } from "./gmail-inbox";
import { buildEmailQuoteRecord, isWebsiteQuotationCopy } from "./email-quote";
import { analyseEmailEnquiry } from "./email-intake-ai";
import { mailboxAddress, plainClientText, questionEmail, type EmailIntake } from "./email-intake-model";

const stateRef = () => doc(db, "integrations", "email-intake");
const caseRef = (id: string) => doc(db, "emailIntake", id);
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export async function listEmailIntake() {
  const [records, state] = await Promise.all([
    getDocs(query(collection(db, "emailIntake"), where("status", "in", ["needs_details", "waiting", "ready", "review", "error"]), limit(200))), getDoc(stateRef()),
  ]);
  return { enquiries: records.docs.map(d => d.data() as EmailIntake).sort((a, b) => b.lastReplyAt.localeCompare(a.lastReplyAt)), lastSyncAt: state.data()?.lastSyncAt || null, error: state.data()?.error || "" };
}
export async function syncEmailIntake(options: { maxAnalyses?: number } = {}) {
  const maxAnalyses = options.maxAnalyses === 1 ? 1 : 4;
  const owner = randomUUID();
  const state = await runTransaction(db, async tx => {
    const old = (await tx.get(stateRef())).data() || {};
    if (Number(old.lockUntil) > Date.now()) return null;
    if (Number(old.nextAllowedAt) > Date.now()) return { cooldown: true, nextAllowedAt: old.nextAllowedAt };
    tx.set(stateRef(), { lockOwner: owner, lockUntil: Date.now() + 240000 }, { merge: true });
    return old;
  });
  if (!state) return { busy: true, processed: 0 };
  if (state.cooldown) return { cooldown: true, nextCheckAt: state.nextAllowedAt, processed: 0 };
  let processed = 0;
  let failures = 0;
  let analysisStarted = 0;
  let deferred = false;
  let nextAllowedAt = 0;
  try {
    const get = await createGmailConnection(await getSavedGmailToken());
    const search = `newer_than:90d -in:spam -in:trash -from:${INBOX_EMAIL} -subject:"New Website Quotation"`;
    const params = { q: search, maxResults: "6" };
    const latest = await get<{ threads?: { id: string }[]; nextPageToken?: string }>("/threads", params);
    let backlog = latest;
    if (state.pageToken) {
      try { backlog = await get("/threads", { ...params, pageToken: String(state.pageToken) }); }
      catch { backlog = latest; }
    }
    const ids = [...new Set([...(latest.threads || []), ...(backlog.threads || [])].map(t => t.id))];
    for (let index = 0; index < ids.length; index += 1) {
      await Promise.all(ids.slice(index, index + 1).map(async threadId => {
        const id = `gmail-${threadId}`;
        try {
          const previous = (await getDoc(caseRef(id))).data() as EmailIntake | undefined;
          // Completed quotes are owned by the quote editor. Never overwrite their work.
          if (previous?.status === "ready") return;
          const conversation = await readGmailThread(get, threadId);
          if (conversation.some(isWebsiteQuotationCopy)) return;
          const inbound = conversation.filter(m => mailboxAddress(m.from) !== INBOX_EMAIL && !m.labels?.some(l => ["SENT", "DRAFT", "SPAM", "TRASH"].includes(l)) && !m.listId && (!m.autoSubmitted || m.autoSubmitted === "no") && !/\b(?:no-?reply|mailer-daemon|notifications?)@/i.test(m.from));
          if (!inbound.length) return;
          const sender = mailboxAddress(inbound[0].replyTo || inbound[0].from);
          if (!sender || sender === INBOX_EMAIL) return;
          // Only the original client's messages may fill their enquiry.
          const messages = inbound.filter(m => mailboxAddress(m.replyTo || m.from) === sender);
          const version = createHash("sha256").update(messages.map(m => m.id).join(":")).digest("hex").slice(0, 24);
          if (previous?.version === version && previous.status !== "error") return;
          if (analysisStarted >= maxAnalyses) { deferred = true; return; }
          analysisStarted++;
          const analysis = await analyseEmailEnquiry(messages);
          const lastMessage = messages[messages.length - 1];
          const originalText = messages.map(m => `${m.date}\n${plainClientText(m)}`).join("\n\n---\n\n").slice(0, 80000);
          const attachmentNames = [...new Set(messages.flatMap(m => m.attachmentNames || []))];
          const status: EmailIntake["status"] = analysis.classification === "other" ? "ignored" : analysis.classification === "uncertain" ? "review" : analysis.missing.length ? "needs_details" : "ready";
          const record: EmailIntake = { ...analysis, id, threadId, version, subject: messages[0].subject, email: sender, lastMessage: { ...lastMessage, text: (lastMessage.text || "").slice(0, 20000) }, status, updatedAtIso: new Date().toISOString(), lastReplyAt: new Date(lastMessage.receivedAtMs || Date.now()).toISOString(), originalText, attachmentNames };
          await runTransaction(db, async tx => {
            const current = (await tx.get(caseRef(id))).data() as EmailIntake | undefined;
            const quoteRef = doc(db, "quotes", id);
            const existingQuote = await tx.get(quoteRef);
            if (existingQuote.exists()) { record.status = "ready"; record.quoteId = id; }
            else if (status === "ready") {
              const source = { ...lastMessage, text: originalText, attachmentNames };
              tx.set(quoteRef, { ...buildEmailQuoteRecord(source, analysis.draft, "email-intake"), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
              record.quoteId = id;
            }
            if (current?.sentVersion === version && current.sendState) {
              record.sendState = current.sendState; record.sentVersion = current.sentVersion;
              if (current.sentAtIso) record.sentAtIso = current.sentAtIso;
              if (current.outboundMessageId) record.outboundMessageId = current.outboundMessageId;
              if (record.status === "needs_details" && current.sendState === "sent") record.status = "waiting";
            }
            tx.set(caseRef(id), clean(record));
          });
          processed++;
        } catch (error) {
          failures++;
          const retryAfterMs = (error as Error & { retryAfterMs?: number }).retryAfterMs;
          if (retryAfterMs) { nextAllowedAt = Math.max(nextAllowedAt, Date.now() + retryAfterMs); analysisStarted = maxAnalyses; }
          // Preserve previously extracted information when an external service fails.
          await setDoc(stateRef(), { error: error instanceof Error ? error.message.slice(0, 250) : "An enquiry could not be analysed." }, { merge: true });
        }
      }));
    }
    await setDoc(stateRef(), { pageToken: failures || deferred ? state.pageToken || "" : backlog.nextPageToken || "", lastSyncAt: new Date().toISOString(), ...(!failures ? { error: "" } : {}) }, { merge: true });
    return { processed, failures, scanned: ids.length };
  } catch (error) {
    await setDoc(stateRef(), { error: error instanceof Error ? error.message : "Email sync failed." }, { merge: true });
    throw error;
  } finally {
    await runTransaction(db, async tx => {
      if ((await tx.get(stateRef())).data()?.lockOwner === owner) tx.set(stateRef(), { lockUntil: 0, nextAllowedAt: Math.max(nextAllowedAt, analysisStarted ? Date.now() + 65000 : 0) }, { merge: true });
    });
  }
}

export async function sendIntakeQuestions(id: string, version: string) {
  const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error("Outgoing email is not configured.");
  const intake = (await getDoc(caseRef(id))).data() as EmailIntake | undefined;
  if (!intake || intake.version !== version) throw new Error("This enquiry has changed. Refresh to review the latest questions.");
  if (intake.status !== "needs_details" || !intake.missing.length) throw new Error("This enquiry does not need a new request for details.");
  const preview = questionEmail(intake);
  if (!preview.to || preview.to !== mailboxAddress(intake.lastMessage.replyTo || intake.lastMessage.from) || preview.to === INBOX_EMAIL) throw new Error("The client email could not be verified.");
  const messageId = `<intake-${id}-${version}@mo-tshirt.mu>`;
  await runTransaction(db, async tx => {
    const current = (await tx.get(caseRef(id))).data() as EmailIntake | undefined;
    if (!current || current.version !== version || current.status !== "needs_details" || current.sentVersion === version) throw new Error("These questions were already sent, are being sent, or the enquiry has changed. Refresh the page.");
    tx.update(caseRef(id), { sentVersion: version, sendState: "sending", outboundMessageId: messageId });
  });
  try {
    const transporter = nodemailer.createTransport({ host, port: Number(process.env.SMTP_PORT || 465), secure: String(process.env.SMTP_SECURE || "true") === "true", auth: { user, pass }, connectionTimeout: 15000, socketTimeout: 30000 });
    const result = await transporter.sendMail({ ...preview, from: process.env.SMTP_FROM || user, replyTo: INBOX_EMAIL, messageId, ...(intake.lastMessage.messageIdHeader ? { inReplyTo: intake.lastMessage.messageIdHeader, references: intake.lastMessage.messageIdHeader } : {}) });
    if (!result.accepted?.length) throw new Error("Email was not accepted by the mail server.");
    await runTransaction(db, async tx => {
      const current = (await tx.get(caseRef(id))).data() as EmailIntake;
      if (current.version === version) tx.update(caseRef(id), { status: "waiting", sendState: "sent", sentAtIso: new Date().toISOString() });
    });
    return { sent: true };
  } catch {
    await runTransaction(db, async tx => {
      const current = (await tx.get(caseRef(id))).data() as EmailIntake;
      if (current.version === version) tx.update(caseRef(id), { sendState: "unknown" });
    });
    throw new Error("Sending could not be confirmed. Check Gmail Sent before taking further action; repeat sending is blocked to avoid duplicates.");
  }
}
