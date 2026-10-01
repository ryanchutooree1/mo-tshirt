"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, Archive, Check, LockKeyhole, Plus, RotateCcw, Save, Wallet } from "lucide-react";
import {
  CURRENCIES, EMPTY_AI_EARNINGS_LEDGER, TRACKING_START, entryTotals, formatEarningsMoney,
  moneyToMinor, summarizeAiEarnings, todayInMauritius, validateAiEarningsLedger,
  type AiEarningEntry, type AiEarningsLedger, type EarningsCurrency, type MoneyEvent,
} from "@/lib/ai-earnings";
import styles from "./ai-earnings.module.css";

type Snapshot = { ledger: AiEarningsLedger; revision: number; accountScope: string };
type DraftEvent = Omit<MoneyEvent, "amountMinor"> & { amount: string };
type Draft = Omit<AiEarningEntry, "agreedAmountMinor" | "payments" | "costs"> & { agreedAmount: string; payments: DraftEvent[]; costs: DraftEvent[] };
const API = "/api/admin/ai-earnings";
// Survives only same-tab SPA Back/Forward. Never persisted to browser storage.
// A fresh authenticated GET must match both account and revision before resuming.
let recoverableDraft: { draft: Draft; accountScope: string; revision: number } | null = null;
const minorText = (amount: number) => (amount / 100).toFixed(2);
function draftOf(entry: AiEarningEntry): Draft {
  const { agreedAmountMinor, payments, costs, ...rest } = entry;
  const rows = (events: MoneyEvent[]) => events.map(({ amountMinor, ...event }) => ({ ...event, amount: minorText(amountMinor) }));
  return { ...rest, agreedAmount: agreedAmountMinor === null ? "" : minorText(agreedAmountMinor), payments: rows(payments), costs: rows(costs) };
}
function entryOf(draft: Draft): AiEarningEntry {
  const { agreedAmount, payments, costs, ...rest } = draft;
  const rows = (events: DraftEvent[], label: string) => events.map(({ amount, ...event }) => {
    const amountMinor = moneyToMinor(amount);
    if (amountMinor === null || amountMinor === 0) throw new Error(`${label}: enter a positive amount with at most two decimal places.`);
    return { ...event, amountMinor };
  });
  const agreedAmountMinor = agreedAmount.trim() ? moneyToMinor(agreedAmount) : null;
  if (agreedAmount.trim() && agreedAmountMinor === null) throw new Error("Agreed total: enter a valid amount with at most two decimal places, or leave it blank.");
  return { ...rest, agreedAmountMinor, payments: rows(payments, "Payment"), costs: rows(costs, "Direct cost") };
}
async function readSnapshot(response: Response): Promise<Snapshot> {
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || "The ledger could not be opened."), { status: response.status, code: body.code });
  if (typeof body.accountScope !== "string" || !body.accountScope || !Number.isSafeInteger(body.revision) || body.revision < 0) throw new Error("The server returned an invalid ledger. Please retry.");
  return { ...body, ledger: validateAiEarningsLedger(body.ledger) };
}

async function sessionMatches(accountScope: string) {
  const response = await fetch("/api/admin/session", { cache: "no-store" });
  if (response.status === 401 || response.status === 403) return false;
  if (!response.ok) throw new Error("Your signed-in account could not be verified. Please retry.");
  const body = await response.json();
  return body.session?.userId === accountScope;
}

export default function AiEarnings() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const current = useRef<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);
  const generation = useRef(0);
  const [conflict, setConflict] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftBaseRevision = useRef<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [today, setToday] = useState(todayInMauritius);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const forget = useCallback(() => {
    generation.current += 1;
    recoverableDraft = null;
    draftBaseRevision.current = null;
    current.current = null;
    setSnapshot(null); setDraft(null); setNotice(""); setConflict(false); setLoading(false);
    setError("Your signed-in account changed or your session expired. Open the current account’s ledger to continue. No draft was copied to another account.");
  }, []);
  const load = useCallback(async () => {
    const run = ++generation.current;
    const scope = current.current?.accountScope;
    setLoading(true); setError("");
    try {
      const result = await readSnapshot(await fetch(API, { cache: "no-store" }));
      if (run !== generation.current) return;
      if (scope && scope !== result.accountScope) { forget(); return; }
      const identityMatches = await sessionMatches(result.accountScope);
      if (run !== generation.current) return;
      if (!identityMatches) { forget(); return; }
      current.current = result; setSnapshot(result); setConflict(false);
      if (recoverableDraft?.accountScope === result.accountScope) {
        draftBaseRevision.current = recoverableDraft.revision;
        setDraft(recoverableDraft.draft);
        if (recoverableDraft.revision !== result.revision) {
          setConflict(true);
          setError("Your unsaved draft was recovered, but the saved ledger changed while you were away. Load the latest saved ledger before editing again.");
        } else setNotice("Your unsaved draft was recovered. Review it, then save or cancel.");
      } else recoverableDraft = null;
    } catch (e) {
      if (run === generation.current) {
        const failure = e as Error & { status?: number };
        if (failure.status === 401 || failure.status === 403) { forget(); return; }
        setError(failure.message || "Could not load your ledger.");
      }
    } finally { if (run === generation.current) setLoading(false); }
  }, [forget]);
  useEffect(() => { void load(); return () => { generation.current += 1; }; }, [load]);
  const draftId = draft?.id;
  useEffect(() => {
    if (draftId) editorHeading.current?.focus();
  }, [draftId]);
  useEffect(() => {
    if (!draftId && snapshot && !saving && !loading && !conflict && restoreFocus.current) {
      restoreFocus.current = false;
      newButton.current?.focus();
    }
  }, [draftId, snapshot, saving, loading, conflict]);
  useEffect(() => {
    const update = () => setToday(todayInMauritius());
    const timer = window.setInterval(update, 60_000);
    const check = async () => {
      update();
      const scope = current.current?.accountScope;
      // An initial request may have started with the previous account's cookie.
      // Supersede it before it can expose a stale response after focus returns.
      if (!scope) { void load(); return; }
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        if (current.current?.accountScope !== scope) return;
        if (response.status === 401 || response.status === 403) { forget(); return; }
        if (response.ok) {
          const body = await response.json();
          if (current.current?.accountScope === scope && body.session?.userId !== scope) forget();
        }
      } catch { /* A temporary connection error must not discard an unsaved draft. */ }
    };
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", check); document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", visible); };
  }, [forget, load]);
  useEffect(() => {
    if (draft && current.current && draftBaseRevision.current !== null) recoverableDraft = { draft, accountScope: current.current.accountScope, revision: draftBaseRevision.current };
  }, [draft]);
  useEffect(() => {
    if (!draft && !saving) return;
    const guardLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (saving || !window.confirm("Leave and discard this unsaved project draft?")) {
        event.preventDefault(); event.stopPropagation();
      } else recoverableDraft = null;
    };
    document.addEventListener("click", guardLink, true);
    return () => document.removeEventListener("click", guardLink, true);
  }, [draft, saving]);
  useEffect(() => {
    if (!draft) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [draft]);
  async function save(ledger: AiEarningsLedger, message: string) {
    const base = current.current;
    if (!base || savingLock.current || conflict) return false;
    savingLock.current = true; setSaving(true); setError(""); setNotice("");
    const run = ++generation.current;
    try {
      const result = await readSnapshot(await fetch(API, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ledger, revision: base.revision, accountScope: base.accountScope }),
      }));
      if (run !== generation.current) return false;
      if (result.accountScope !== base.accountScope) { forget(); return false; }
      const identityMatches = await sessionMatches(result.accountScope);
      if (run !== generation.current) return false;
      if (!identityMatches) { forget(); return false; }
      current.current = result; setSnapshot(result); setNotice(message);
      return true;
    } catch (e) {
      if (run !== generation.current) return false;
      const failure = e as Error & { status?: number; code?: string };
      if (failure.code === "ACCOUNT_CHANGED" || failure.status === 401 || failure.status === 403) { forget(); return false; }
      if (failure.status === 409) setConflict(true);
      setError(failure.message || "Save interrupted. Your draft is still here; retry to save it.");
      return false;
    } finally { savingLock.current = false; setSaving(false); }
  }
  function begin(entry?: AiEarningEntry) {
    draftBaseRevision.current = current.current?.revision ?? null;
    setError(""); setNotice("");
    setDraft(entry ? draftOf(entry) : { id: crypto.randomUUID(), project: "", client: "", description: "", aiContribution: "", currency: "MUR", agreedAmount: "", costsComplete: false, archived: false, payments: [], costs: [] });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || !current.current || savingLock.current) return;
    try {
      const entry = entryOf(draft);
      const exists = current.current.ledger.entries.some((value) => value.id === entry.id);
      const ledger = validateAiEarningsLedger({ schemaVersion: 1, entries: exists ? current.current.ledger.entries.map((value) => value.id === entry.id ? entry : value) : [...current.current.ledger.entries, entry] });
      if (await save(ledger, "Project saved. Your totals now use the recorded payments and costs.")) { recoverableDraft = null; restoreFocus.current = true; setDraft(null); }
    } catch (e) { setError(e instanceof Error ? e.message : "Check the project details."); }
  }
  function cancelDraft() {
    if (!saving && window.confirm("Discard this unsaved project draft? Saved records will stay unchanged.")) { recoverableDraft = null; restoreFocus.current = true; setDraft(null); setError(""); if (conflict) void load(); }
  }
  function reloadLatest() {
    if (draft && !window.confirm("Discard this unsaved draft and load the latest saved ledger? You can edit that version afterward.")) return;
    recoverableDraft = null; setDraft(null); setNotice(""); void load();
  }
  async function archive(entry: AiEarningEntry) {
    if (!current.current) return;
    const archived = !entry.archived;
    if (archived && !window.confirm("Archive this project? Its payments and costs will be excluded from totals. You can restore it in Archived projects.")) return;
    await save({ ...current.current.ledger, entries: current.current.ledger.entries.map((value) => value.id === entry.id ? { ...value, archived } : value) }, archived ? "Project archived. You can restore it below." : "Project restored to your totals.");
  }
  function eventRows(kind: "payments" | "costs") {
    if (!draft) return null;
    const payment = kind === "payments";
    const label = payment ? "Payment" : "Direct cost";
    const update = (id: string, values: Partial<DraftEvent>) => setDraft((value) => value && ({ ...value, [kind]: value[kind].map((row) => row.id === id ? { ...row, ...values } : row) }));
    return <section className={styles.events} aria-label={payment ? "Received payments" : "Direct costs"}>
      <div className={styles.sectionHead}><div><h3>{payment ? "Received payments" : "Direct costs"}</h3><p>{payment ? "Only money actually received. Add each partial payment once." : "Record costs attributable to this work. Missing costs stay unknown."}</p></div></div>
      {draft[kind].map((row, index) => <fieldset className={styles.event} key={row.id}><legend>{label} {index + 1}</legend>
        <label>{label} date<input required type="date" min="2000-01-01" max={today} value={row.date} onChange={(e) => update(row.id, { date: e.target.value })} /></label>
        <label>{label} amount ({draft.currency})<input required inputMode="decimal" placeholder="0.00" value={row.amount} onChange={(e) => update(row.id, { amount: e.target.value })} /></label>
        <label className={styles.eventNote}>Reference or note<input maxLength={500} placeholder={payment ? "Invoice / payment reference" : "Tool, materials or service"} value={row.note} onChange={(e) => update(row.id, { note: e.target.value })} /></label>
        <button type="button" className={styles.remove} aria-label={`Remove ${label.toLowerCase()} ${index + 1}`} onClick={() => setDraft((value) => value && ({ ...value, [kind]: value[kind].filter((item) => item.id !== row.id) }))}>Remove</button>
      </fieldset>)}
      <button className={styles.secondary} type="button" disabled={draft[kind].length >= 100} onClick={() => setDraft((value) => value && ({ ...value, [kind]: [...value[kind], { id: crypto.randomUUID(), date: today, amount: "", note: "" }] }))}><Plus size={15} /> Add {payment ? "received payment" : "direct cost"}</button>
    </section>;
  }
  const ledger = snapshot?.ledger ?? EMPTY_AI_EARNINGS_LEDGER;
  const summaries = summarizeAiEarnings(ledger, today);
  const entries = ledger.entries.filter((entry) => entry.archived === showArchived);
  const locked = saving || loading || !snapshot || conflict;
  return <div className={styles.workspace}>
    <header className={styles.topbar}><Link href="/admin/x5-execution"><ArrowLeft size={16} /> X5 Aura Farming</Link><span><LockKeyhole size={13} /> Private to your signed-in account</span></header>
    <main className={styles.content}>
      <section className={styles.hero}><div><span className={styles.eyebrow}>AI INTO REAL INCOME</span><h1>AI <em>Earnings.</em></h1><p>Track what your AI-assisted work actually earns.<br />Real payments. Clear costs. Evidence over estimates.</p><div className={styles.period}>Tracking from 1 October 2026 · Mauritius time (UTC+04)</div></div><div className={styles.heroAside}><Wallet size={32} /><span>YOUR PERSONAL LEDGER</span><p>Manually record each project, then add payments as they arrive.</p><button ref={newButton} className={styles.primary} disabled={locked || !!draft || ledger.entries.length >= 500} onClick={() => begin()}><Plus size={17} /> New project</button></div></section>
      <div role="status" aria-live="polite" className={notice ? styles.notice : undefined}>{notice && <><Check size={16} /> {notice}</>}</div>
      {error && <div className={styles.error} role="alert"><p>{error}</p>{conflict ? <button className={styles.secondary} disabled={saving} onClick={reloadLatest}><RotateCcw size={15} /> Load latest saved ledger</button> : !snapshot && !loading ? <button className={styles.secondary} onClick={() => void load()}>Open current account’s ledger</button> : null}</div>}
      {loading ? <div className={styles.empty} role="status">Opening your private ledger…</div> : !snapshot ? null : <>
        {summaries.length > 0 && <section className={styles.summarySection} aria-label="AI earnings totals">
          {summaries.map((summary) => <div className={styles.currencyGroup} key={summary.currency}><div className={styles.sectionHead}><h2>{summary.currency} overview</h2><span>{summary.entryCount} active {summary.entryCount === 1 ? "project" : "projects"}</span></div><div className={styles.metrics}>
            <div><span>Confirmed receipts</span><strong>{formatEarningsMoney(summary.receivedMinor, summary.currency)}</strong><small>Received since 1 October</small></div>
            <div><span>Pending agreed balance</span><strong>{formatEarningsMoney(summary.pendingMinor, summary.currency)}</strong><small>Agreed total less all receipts to date</small></div>
            <div><span>Recorded direct costs</span><strong>{formatEarningsMoney(summary.costMinor, summary.currency)}</strong><small>{summary.costsComplete ? "All direct costs marked complete" : "Costs incomplete or unknown"}</small></div>
            <div className={styles.net}><span>Net after recorded costs</span><strong>{formatEarningsMoney(summary.netMinor, summary.currency)}</strong><small>{summary.costsComplete ? "Cash-basis net · not full business profit" : "Provisional · complete profit not known"}</small></div>
          </div></div>)}
          <p className={styles.caption}>Receipts and costs cover {TRACKING_START} through {today}. Pending balances also deduct earlier receipts. Currencies stay separate; there is no exchange-rate conversion. Quotes, estimates and time savings are never received income.</p>
        </section>}
        {draft && <form className={styles.editor} onSubmit={submit} aria-label="AI earnings project form">
          <div className={styles.sectionHead}><div><span className={styles.eyebrow}>RECORD THE EVIDENCE</span><h2 ref={editorHeading} tabIndex={-1}>{ledger.entries.some((entry) => entry.id === draft.id) ? "Edit project" : "New project"}</h2></div><span>Required fields are marked *</span></div>
          <fieldset disabled={saving || conflict} className={styles.formFields}>
            <div className={styles.formGrid}><label>Project name *<input required maxLength={160} value={draft.project} onChange={(e) => setDraft({ ...draft, project: e.target.value })} /></label><label>Client or customer label<input maxLength={160} value={draft.client} onChange={(e) => setDraft({ ...draft, client: e.target.value })} /></label><label>What was sold *<textarea required rows={3} maxLength={2000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label><label>How AI helped *<textarea required rows={3} maxLength={2000} placeholder="The specific AI contribution to this work" value={draft.aiContribution} onChange={(e) => setDraft({ ...draft, aiContribution: e.target.value })} /></label><label>Currency<select disabled={draft.payments.length + draft.costs.length > 0} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value as EarningsCurrency })}>{CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select><small>One currency per project. Set before adding payments or costs.</small></label><label>Agreed total ({draft.currency}, optional)<input inputMode="decimal" placeholder="Leave blank if not agreed" value={draft.agreedAmount} onChange={(e) => setDraft({ ...draft, agreedAmount: e.target.value })} /><small>Use a confirmed agreement, not a quote. This never counts as received.</small></label></div>
            {eventRows("payments")}{eventRows("costs")}
            <label className={styles.checkbox}><input type="checkbox" checked={draft.costsComplete} onChange={(e) => setDraft({ ...draft, costsComplete: e.target.checked })} /><span>I’ve recorded all direct costs for this project<small>Leave unchecked if any costs are unknown or still missing. If there were no direct costs, check this to confirm.</small></span></label>
          </fieldset>
          <div className={styles.formActions}><p>Your project is saved only when you choose Save project.</p><button type="button" className={styles.secondary} disabled={saving} onClick={cancelDraft}>Cancel</button><button type="submit" className={styles.primary} disabled={saving || conflict}><Save size={16} /> {saving ? "Saving…" : "Save project"}</button></div>
        </form>}
        <section className={styles.projects} aria-label="AI earnings projects"><div className={styles.sectionHead}><div><span className={styles.eyebrow}>YOUR WORK, ACCOUNTED FOR</span><h2>{showArchived ? "Archived projects" : "Projects & payments"}</h2></div><button className={styles.secondary} disabled={!!draft || saving} onClick={() => setShowArchived(!showArchived)}><Archive size={15} /> {showArchived ? "Show active projects" : `Archived (${ledger.entries.filter((entry) => entry.archived).length})`}</button></div>
          {entries.length === 0 ? <div className={styles.empty}><span className={styles.emptyIcon}><Wallet size={28} /></span><h3>{showArchived ? "No archived projects" : ledger.entries.length ? "No active projects" : "Your first earnings record starts here"}</h3><p>{showArchived ? "Archived projects remain recoverable and are excluded from totals." : "No payments recorded here yet. This is an empty ledger, not a claim about your past earnings."}</p>{!showArchived && <button className={styles.primary} disabled={locked || !!draft || ledger.entries.length >= 500} onClick={() => begin()}><Plus size={16} /> Add your first project</button>}</div> : <div className={styles.projectList}>{entries.map((entry) => { const totals = entryTotals(entry, today); return <article className={styles.project} key={entry.id}><div className={styles.projectTitle}><div><span className={styles.eyebrow}>{entry.client || "PERSONAL PROJECT"} · {entry.currency}</span><h3>{entry.project}</h3></div><span className={entry.costsComplete ? styles.complete : styles.incomplete}>{entry.costsComplete ? "Costs complete" : "Costs not complete"}</span></div><p>{entry.description}</p><p className={styles.aiNote}><span>AI contribution</span> {entry.aiContribution}</p><dl className={styles.projectAmounts}><div><dt>Received since 1 Oct</dt><dd>{formatEarningsMoney(totals.receivedMinor, entry.currency)}</dd></div><div><dt>Recorded costs since 1 Oct</dt><dd>{formatEarningsMoney(totals.costMinor, entry.currency)}</dd></div><div><dt>Net after recorded costs</dt><dd>{formatEarningsMoney(totals.netMinor, entry.currency)}</dd></div><div><dt>Pending agreed balance</dt><dd>{entry.agreedAmountMinor === null ? "Not agreed / unknown" : formatEarningsMoney(totals.pendingMinor, entry.currency)}</dd></div></dl><details><summary>{entry.payments.length} {entry.payments.length === 1 ? "payment" : "payments"} · {entry.costs.length} cost records</summary><ul>{[...entry.payments.map((event) => ({ ...event, kind: "Received" })), ...entry.costs.map((event) => ({ ...event, kind: "Cost" }))].sort((a, b) => a.date.localeCompare(b.date)).map((event) => <li key={event.id}><span>{event.date} · {event.kind}</span><strong>{formatEarningsMoney(event.amountMinor, entry.currency)}</strong><span>{event.note}</span></li>)}</ul></details><div className={styles.projectActions}><small>Reference: {entry.id}</small><button className={styles.secondary} disabled={locked || !!draft} onClick={() => void archive(entry)}>{entry.archived ? <RotateCcw size={14} /> : <Archive size={14} />}{entry.archived ? "Restore" : "Archive"}</button><button className={styles.secondary} disabled={locked || !!draft} onClick={() => begin(entry)}>Edit & add payments <ArrowUpRight size={14} /></button></div></article>; })}</div>}
        </section><footer className={styles.footer}><LockKeyhole size={13} /><span>Private to this account · Separate from business accounting · {snapshot.revision ? `Saved ledger v${snapshot.revision}` : "No records saved yet"}</span></footer>
      </>}
    </main>
  </div>;
}
