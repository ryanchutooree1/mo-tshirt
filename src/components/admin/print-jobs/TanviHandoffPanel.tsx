"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, CircleAlert, CreditCard, FileText, Loader2, Mail, RefreshCw, Send, ShieldCheck } from "lucide-react";
import QuoteProductEditor from "@/components/admin/QuoteProductEditor";
import type { HandoffView, HandoffPreview, HandoffSettings } from "@/lib/print-job-handoff";
import styles from "./tanvi-workflow.module.css";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const money = (amount: number | null | undefined, currency = "Rs") => amount == null ? "Not priced yet" : `${currency} ${new Intl.NumberFormat("en-MU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)}`;

export default function TanviHandoffPanel({ quoteId, onDirtyChange, onBusyChange, onUpdated, onOpenSettings, refreshKey = 0 }: { quoteId: string; onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void; onUpdated?: () => void; onOpenSettings?: () => void; refreshKey?: number }) {
  const [view, setView] = useState<HandoffView | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingStep, setEditingStep] = useState<1 | 2 | null>(null);
  const [priceAgreed, setPriceAgreed] = useState(false);
  const [priceNote, setPriceNote] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [reference, setReference] = useState("");
  const [bankChecked, setBankChecked] = useState(false);
  const [productDirty, setProductDirty] = useState(false);
  const [preview, setPreview] = useState<HandoffPreview | null>(null);
  const [sendChecked, setSendChecked] = useState(false);
  const [sendFailure, setSendFailure] = useState(false);
  const [userId, setUserId] = useState("");
  const busyRef = useRef(false);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  const activeRef = useRef(true);
  const generation = useRef(0);
  const paymentDateBase = useRef(today());
  const controllerRef = useRef<AbortController | null>(null);
  const operations = useRef(new Map<string, string>());
  const dirty = Boolean(priceAgreed || priceNote || amount || reference || bankChecked || productDirty || sendChecked || paymentDate !== paymentDateBase.current);
  const endpoint = `/api/admin/print-jobs/${encodeURIComponent(quoteId)}/handoff`;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { busyCallback.current?.(busy); }, [busy, onBusyChange]);
  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load this job’s next step.");
      const next = (body.view || body) as HandoffView;
      if (next.quoteId !== quoteId) throw new Error("The wrong job was returned. Please reload.");
      if (!controller.signal.aborted && activeRef.current) { setView(next); setError(""); setSendFailure(false); }
    } catch (reason) { if (!controller.signal.aborted && activeRef.current) setError(reason instanceof Error ? reason.message : "Could not load the next step."); }
    finally { if (!controller.signal.aborted && activeRef.current) setLoading(false); }
  }, [endpoint, quoteId]);
  useEffect(() => {
    activeRef.current = true; generation.current += 1; busyRef.current = false; setBusy(false); busyCallback.current?.(false);
    setView(null); setPriceAgreed(false); setPriceNote(""); setAmount(""); setReference(""); setBankChecked(false); setPreview(null); setSendChecked(false); setEditingStep(null); setProductDirty(false);
    paymentDateBase.current = today(); setPaymentDate(paymentDateBase.current);
    void load();
    return () => { activeRef.current = false; generation.current += 1; controllerRef.current?.abort(); };
  }, [load, refreshKey]);
  useEffect(() => { let active = true; void fetch("/api/admin/session", { cache: "no-store" }).then(r => r.json()).then(body => { if (active) setUserId(body.session?.userId || ""); }).catch(() => {}); return () => { active = false; }; }, []);
  const request = async (payload: Record<string, unknown>) => {
    if (busyRef.current || !view || view.quoteId !== quoteId || loading) return;
    const run = generation.current;
    busyRef.current = true; setBusy(true); busyCallback.current?.(true); setError(""); setNotice("");
    const key = JSON.stringify(payload);
    const requestId = operations.current.get(key) || crypto.randomUUID(); operations.current.set(key, requestId);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, requestId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The action could not be completed. Your entries are still here.");
      if (!activeRef.current || run !== generation.current) return;
      const next = (body.view || body) as HandoffView;
      if (next.quoteId !== quoteId) throw new Error("The result could not be verified. Reload before taking another action.");
      setView(next);
      if (payload.action === "confirm-price") { setPriceAgreed(false); setPriceNote(""); setEditingStep(null); setPreview(null); setNotice("Client price confirmed. Next, check the payment received."); }
      if (payload.action === "verify-payment") { setAmount(""); setReference(""); setBankChecked(false); paymentDateBase.current = today(); setPaymentDate(paymentDateBase.current); setEditingStep(null); setPreview(null); setNotice("Received amount verified. The balance stays visible below."); }
      if (payload.action === "preview") { setPreview(body.preview || next.preview); setSendChecked(false); }
      if (payload.action === "send") { setSendChecked(false); setPreview(null); setNotice(next.handoff?.state === "sent" ? "Email sent to the reviewed recipient." : "Delivery is unconfirmed. Check it before sending again."); }
      onUpdated?.();
    } catch (reason) { if (activeRef.current && run === generation.current) { setError(reason instanceof Error ? reason.message : "The result is uncertain. Reload before trying again."); if (payload.action === "send") { setSendFailure(true); setSendChecked(false); setPreview(null); } } }
    finally { if (activeRef.current && run === generation.current) { busyRef.current = false; setBusy(false); busyCallback.current?.(false); } }
  };
  const reload = () => { if (dirty && !window.confirm("Discard these unsaved entries and reload the job?")) return; setPriceAgreed(false); setPriceNote(""); setAmount(""); setReference(""); setBankChecked(false); setPaymentDate(paymentDateBase.current); setPreview(null); setSendChecked(false); void load(); };
  if (!view) return <section className={styles.panel} aria-label="Tanvi production workflow">{loading ? <p className={styles.loading}><Loader2 size={18} className={styles.spin} />Opening the next step…</p> : <><p role="alert" className={styles.error}>{error}</p><button className={styles.secondary} onClick={() => void load()}>Retry</button></>}</section>;
  const gateLocked = view.gates.jobClosed || view.gates.reopenRequired;
  const currentStep = !view.gates.priceAgreed ? 1 : !view.gates.paymentSatisfied ? 2 : 3;
  const step = editingStep || currentStep;
  const currency = view.pricing.currency;
  const balance = view.pricing.quotedTotal === null ? null : Math.max(0, Math.round((view.pricing.quotedTotal - view.payment.verifiedAmount) * 100) / 100);
  const sent = view.handoff?.state === "sent";
  const sendUncertain = sendFailure || view.handoff?.state === "unknown" || view.handoff?.state === "sending";
  return <section className={styles.panel} aria-label="Tanvi production workflow">
    <div className={styles.panelHeading}><div><p className={styles.eyebrow}>TANVI’S NEXT STEP</p><h3>{sent ? "Production email sent" : "Price. Payment. Send."}</h3></div><button className={styles.iconButton} aria-label="Reload handover status" onClick={reload} disabled={busy || productDirty}><RefreshCw size={15} /></button></div>
    <ol className={styles.steps} aria-label="Three steps before printing">{[["Client price", view.gates.priceAgreed], ["Payment received", view.gates.paymentSatisfied], ["Send to production", sent]].map(([label, complete], index) => <li key={String(label)} data-active={step === index + 1} data-done={Boolean(complete)}><span>{complete ? <Check size={13} /> : index + 1}</span><strong>{label}</strong></li>)}</ol>
    <div className={styles.amounts}><div><span>Agreed quote</span><strong>{money(view.pricing.quotedTotal, currency)}</strong></div><div><span>Verified received</span><strong>{money(view.payment.verifiedAmount, currency)}</strong></div><div><span>Balance remaining</span><strong>{money(balance, currency)}</strong></div></div>
    {notice && <p className={styles.notice} role="status"><CheckCircle2 size={15} />{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {gateLocked && <div className={styles.stepBody}><p className={styles.stepLabel}>{view.gates.jobClosed ? "This job is closed" : "Review the latest client response"}</p><p>Use Change job status to record the reviewed or reopened request, then agree the current price again. No production email can be sent yet.</p></div>}
    {!gateLocked && step === 1 && <form className={styles.stepBody} aria-label="Confirm client price" onSubmit={event => { event.preventDefault(); if (!priceAgreed || !view.pricing.quotedTotal) return; void request({ action: "confirm-price", expectedVersion: view.version, pricingFingerprint: view.pricing.fingerprint, agreedTotal: view.pricing.quotedTotal, note: priceNote.trim() || "Client confirmed the current quoted price on WhatsApp." }); }}>
      <p className={styles.stepLabel}>1 · Agree the price with the client</p><p>Check the garments and price, then confirm what the client agreed on WhatsApp.</p>
      <details className={styles.editPrice}><summary>Edit garments & price</summary><QuoteProductEditor key={quoteId} quoteId={quoteId} revision={view.version} userId={userId} blocked={busy || priceAgreed || Boolean(priceNote)} onDirtyChange={setProductDirty} onUpdated={() => { setPreview(null); void load(); onUpdated?.(); }} /></details>
      <a className={styles.documentLink} href={`/api/admin/print-jobs/${encodeURIComponent(quoteId)}/document`} target="_blank" rel="noopener noreferrer"><FileText size={15} />View saved quotation PDF</a>
      <label className={styles.field}>Client agreement note <span>(optional)</span><input value={priceNote} disabled={busy || productDirty} maxLength={1500} onChange={event => setPriceNote(event.target.value)} placeholder="e.g. Agreed on WhatsApp today" /></label>
      <label className={styles.confirm}><input type="checkbox" checked={priceAgreed} disabled={busy || productDirty} onChange={event => setPriceAgreed(event.target.checked)} /><span>The client agreed to this exact quote total: <strong>{money(view.pricing.quotedTotal, currency)}</strong></span></label>
      <button className={styles.primary} type="submit" disabled={busy || productDirty || !priceAgreed || !view.pricing.quotedTotal}>{busy ? <Loader2 size={16} className={styles.spin} /> : <Check size={16} />}Confirm client price</button>
    </form>}
    {!gateLocked && step === 2 && <form className={styles.stepBody} aria-label="Verify received payment" onSubmit={event => { event.preventDefault(); if (!bankChecked || !amount.trim()) return; void request({ action: "verify-payment", expectedVersion: view.version, amountReceived: Number(amount), paymentDate, reference, note: "WhatsApp payment details checked against actual money received.", acknowledgeBankReceipt: true }); }}>
      <p className={styles.stepLabel}>2 · Check the money actually received</p><p>A half or full payment allows printing. Check the WhatsApp payment details against the money received before confirming.</p>
      {view.payment.legacyEvidenceVerified && <p className={styles.hint}><ShieldCheck size={15} />Earlier payment evidence exists. Confirm the actual received total here; an automatic receipt does not count.</p>}
      <label className={styles.field}>Total money received for this job<input type="number" min="0" step="0.01" required value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} placeholder="Enter the actual total received" /><span>Cumulative total so far, including earlier part-payments. Do not add the same payment twice.</span></label>
      <div className={styles.fieldPair}><label className={styles.field}>Payment date<input type="date" required max={today()} value={paymentDate} disabled={busy} onChange={event => setPaymentDate(event.target.value)} /></label><label className={styles.field}>WhatsApp / payment reference<input required maxLength={200} value={reference} disabled={busy} onChange={event => setReference(event.target.value)} placeholder="Receipt or transfer reference" /></label></div>
      <label className={styles.confirm}><input type="checkbox" checked={bankChecked} disabled={busy} onChange={event => setBankChecked(event.target.checked)} /><span>I checked that this money was actually received. A screenshot or accepted quote alone is not confirmation.</span></label>
      <button className={styles.primary} type="submit" disabled={busy || !bankChecked || !amount.trim() || !reference.trim()}>{busy ? <Loader2 size={16} className={styles.spin} /> : <CreditCard size={16} />}Verify received payment</button>
      <button className={styles.textButton} type="button" disabled={busy} onClick={() => { setEditingStep(1); }}>Review the client price</button>
    </form>}
    {!gateLocked && step === 3 && <div className={styles.stepBody}>
      <p className={styles.stepLabel}>3 · Review, then send to production</p>
      <div className={styles.deliveryMode} data-mode={view.delivery.mode}><Mail size={18} /><div><strong>{view.delivery.mode === "test" ? "TEST EMAIL ONLY" : view.delivery.mode === "live" ? `Production: ${view.delivery.partnerName}` : "Sending is not configured"}</strong><span>{view.delivery.recipients.length ? `To: ${view.delivery.recipients.join(", ")}` : "The owner must set a recipient before sending."}</span></div></div>
      {sent ? <p className={styles.notice}><CheckCircle2 size={16} />Sent to {view.handoff?.recipients.join(", ")}. The production status is unchanged.</p> : sendUncertain ? <p className={styles.error}>A send is in progress or its result is unknown. Check delivery manually. Another send is blocked.</p> : <>
        {view.gates.blockers.length > 0 && <div className={styles.blockers}><CircleAlert size={15} /><ul>{view.gates.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></div>}
        {!preview ? <button className={styles.primary} disabled={busy || !view.gates.canPreview} onClick={() => void request({ action: "preview", expectedVersion: view.version })}>{busy ? <Loader2 size={16} className={styles.spin} /> : <Mail size={16} />}{view.delivery.mode === "test" ? "Review test email" : "Review production email"}</button> : <div className={styles.emailPreview} aria-label="Production email preview"><p><strong>To:</strong> {preview.recipients.join(", ")}</p><p><strong>Subject:</strong> {preview.subject}</p><pre>{preview.text}</pre><label className={styles.confirm}><input type="checkbox" checked={sendChecked} disabled={busy} onChange={event => setSendChecked(event.target.checked)} /><span>I checked the recipient, finished design and print files in this preview.</span></label><button className={styles.primary} disabled={busy || !sendChecked} onClick={() => void request({ action: "send", previewId: preview.id, previewFingerprint: preview.fingerprint, acknowledgeSend: true })}>{busy ? <Loader2 size={16} className={styles.spin} /> : <Send size={16} />}{preview.mode === "test" ? "Send this test email" : "Send this job to production"}</button><button className={styles.textButton} disabled={busy} onClick={() => { setPreview(null); setSendChecked(false); }}>Back to review</button></div>}
      </>}
      <div className={styles.reviewActions}><button type="button" disabled={busy} onClick={() => { setEditingStep(1); setPreview(null); setSendChecked(false); }}>Review price</button><button type="button" disabled={busy} onClick={() => { setEditingStep(2); setPreview(null); setSendChecked(false); }}>Update received total</button></div>
    </div>}
    {view.canManageSettings && <button className={styles.settingsLink} onClick={onOpenSettings} disabled={busy || dirty}>Test email setup</button>}
    <p className={styles.safetyNote}>No automatic receipts or emails. Every confirmation is recorded with the staff member and time.</p>
  </section>;
}

export function HandoffSettingsPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [settings, setSettings] = useState<HandoffSettings | null>(null);
  const [recipient, setRecipient] = useState("");
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const settingsActive = useRef(true);
  useEffect(() => { settingsActive.current = true; return () => { settingsActive.current = false; }; }, []);
  useEffect(() => { let active = true; void fetch("/api/admin/print-jobs/handoff-settings", { cache: "no-store" }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Owner access is required."); return body.settings || body; }).then(value => { if (active) { setSettings(value); setRecipient(value.testRecipient || ""); setDate(value.testDate === today() ? value.testDate : today()); } }).catch(reason => { if (active) setError(reason.message); }); return () => { active = false; }; }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!settings || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/print-jobs/handoff-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: settings.version, partnerId: "yan", testEnabled: true, testRecipient: recipient, testDate: date, requiredPaymentPercent: 50, liveEnabled: false }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not save the test settings.");
      if (settingsActive.current) onSaved();
    } catch (reason) { if (settingsActive.current) setError(reason instanceof Error ? reason.message : "The save could not be confirmed. Reload before retrying."); }
    finally { lock.current = false; if (settingsActive.current) setBusy(false); }
  }
  return <section className={styles.settingsPanel} aria-label="Production test email setup"><h2>Test the handover safely</h2><p>Production needs a confirmed price and at least 50% actually received. During this test, emails go only to the address below.</p>
    <form onSubmit={event => void save(event)}><label className={styles.field}>Test recipient email<input type="email" required value={recipient} disabled={!settings || busy} onChange={event => setRecipient(event.target.value)} placeholder="Enter the approved test recipient" /></label><label className={styles.field}>Test date · Mauritius<input type="date" required value={date} disabled={!settings || busy} onChange={event => setDate(event.target.value)} /></label><p className={styles.hint}>Yan’s saved address stays unchanged. Test expiry blocks sending; it never turns on live production email automatically.</p>{error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.setupActions}><button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>Cancel</button><button className={styles.primary} type="submit" disabled={!settings || busy}>{busy ? "Saving…" : "Save test-only setup"}</button></div></form>
  </section>;
}
