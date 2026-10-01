"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, CircleAlert, Clock3, Copy, FileImage, FileText, Inbox, Layers, Loader2, Mail, MessageSquare, PackageCheck, Plus, Printer, RefreshCw, Search, SlidersHorizontal, Truck, X, XCircle } from "lucide-react";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import { PRINT_JOB_STAGES, type PrintJob, type PrintJobStage, type PrintJobClosureKind, stageLabel } from "@/lib/print-job-workflow";
import { REQUEST_SOURCE_LABELS, type RequestSource } from "@/lib/quotation-inbox";
import type { EmailIntake } from "@/lib/email-intake-model";
import EmailEnquiryDetails from "@/components/admin/EmailEnquiryDetails";
import styles from "./print-jobs.module.css";

const EditorLoading = () => <div className={styles.empty}><Loader2 className={styles.spin} size={24} /><p>Opening document workspace…</p></div>;
const QuoteEditor = dynamic(() => import("@/components/admin/QuoteEditorPage"), { loading: EditorLoading });
const NewQuotationDraft = dynamic(() => import("./NewQuotationDraft"), { loading: EditorLoading });
const OrderEditor = dynamic(() => import("@/components/admin/OrdersEditorPage"), { loading: EditorLoading });
type QueueData = { items: PrintJob[]; warnings: string[]; canQuotes: boolean; canOrders: boolean; canInbox?: boolean; updatedAt: number; enquiries?: EmailIntake[]; lastEmailSync?: string | null };
type View = PrintJobStage | "active" | "attention" | "all";
type Editor = { kind: "quote" | "order" | "intake"; id?: string; name: string };
const icons = { new: Inbox, needs_details: MessageSquare, awaiting_client: Clock3, confirmed: Check, production: Printer, ready: Truck, completed: CheckCheck, declined: XCircle };
const closed = (stage: PrintJobStage) => stage === "completed" || stage === "declined";
const money = (item: PrintJob) => item.total === null ? "To price" : `${item.currency || "Rs"} ${new Intl.NumberFormat("en-MU", { maximumFractionDigits: 2 }).format(item.total)}`;
const displayDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+04:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : value;
const relativeDate = (value: number) => !value ? "Date not recorded" : new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const stageDescription = (stage: PrintJobStage) => PRINT_JOB_STAGES.find((entry) => entry.id === stage)?.description || "";
function StageBadge({ stage }: { stage: PrintJobStage }) { return <span className={styles.badge} data-stage={stage}><i />{stageLabel(stage)}</span>; }
function ArtworkThumbnail({ item, large = false }: { item: PrintJob; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const thumbnail = item.thumbnail;
  return <span className={`${styles.artworkThumb} ${large ? styles.artworkLarge : ""}`}>
    {thumbnail && !failed ? <img src={thumbnail.url} alt={`Logo / artwork for ${item.name}`} loading="lazy" onError={() => setFailed(true)} /> : <span className={styles.artworkFallback}><FileImage size={large ? 32 : 23} /><span>{failed ? "Preview unavailable" : item.artwork.length ? "Artwork file" : "No artwork yet"}</span></span>}
  </span>;
}


export default function PrintJobWorkspace({ requestedQuoteId }: { requestedQuoteId?: string } = {}) {
  const { theme } = useAdminTheme();
  const [data, setData] = useState<QueueData | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [view, setView] = useState<View>("active");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<RequestSource | "all">("all");
  const [sort, setSort] = useState("priority");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(30);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editingIntake, setEditingIntake] = useState<EmailIntake | null>(null);
  const [transition, setTransition] = useState<{ item: PrintJob; stage?: PrintJobStage } | null>(null);
  const [notice, setNotice] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const editorOpenerRef = useRef<HTMLElement | null>(null);
  const checkRef = useRef(false);
  const restoredRef = useRef<string | null>(null);
  const navigationRef = useRef({ editor, dirty, transition, dialogDirty: false, dialogSaving: false });
  navigationRef.current.editor = editor;
  navigationRef.current.dirty = dirty;
  navigationRef.current.transition = transition;

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort("timeout"), 25000);
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/print-jobs", { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load the job list.");
      if (!Array.isArray(body.items)) throw new Error("The job list could not be read. Please refresh.");
      if (!controller.signal.aborted) { setData(body); setError(""); }
    } catch (reason) {
      if (!controller.signal.aborted || controller.signal.reason === "timeout") setError(controller.signal.aborted ? "Loading took too long. Please retry." : reason instanceof Error ? reason.message : "Could not load the job list.");
    } finally { clearTimeout(timeout); if (requestRef.current === controller) setRefreshing(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const tick = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = setInterval(tick, 60000);
    document.addEventListener("visibilitychange", tick); window.addEventListener("email-intake-updated", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); window.removeEventListener("email-intake-updated", tick); requestRef.current?.abort(); };
  }, [refresh]);
  useEffect(() => {
    if (!data) return;
    const quoteId = requestedQuoteId || new URLSearchParams(window.location.search).get("quoteId");
    if (!quoteId || restoredRef.current === quoteId) return;
    const item = data.items.find((entry) => entry.quoteId === quoteId);
    if (!data.canQuotes) return;
    restoredRef.current = quoteId;
    if (item) { setView(closed(item.stage) ? item.stage : "active"); setSelectedKey(item.key); }
    const next: Editor = { kind: "quote", id: quoteId, name: item?.name || "Requested quotation" };
    const updateHistory = window.history.state?.printDeskEditor ? window.history.replaceState.bind(window.history) : window.history.pushState.bind(window.history);
    updateHistory({ ...window.history.state, printDeskEditor: next }, "", window.location.href);
    setEditor(next); setDirty(false);
  }, [data, requestedQuoteId]);
  useEffect(() => { if (selectedKey) detailRef.current?.focus({ preventScroll: true }); }, [selectedKey]);
  useEffect(() => { if (editor) backRef.current?.focus({ preventScroll: true }); }, [editor]);
  useEffect(() => {
    if (editor?.kind !== "intake" || dirty) return;
    const latest = data?.enquiries?.find((intake) => intake.id === editor.id);
    if (latest) setEditingIntake(latest);
  }, [data, editor, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const click = (event: MouseEvent) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download") || link.href === window.location.href) return;
      if (!window.confirm("Discard your unsaved document edits and leave?")) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    window.addEventListener("beforeunload", protect); document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", protect); document.removeEventListener("click", click, true); };
  }, [dirty]);
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const current = navigationRef.current;
      const hasUnsaved = current.editor && current.dirty || current.transition && current.dialogDirty;
      if (current.dialogSaving || hasUnsaved && !window.confirm("Discard your unsaved changes and go back?")) {
        window.history.pushState({ ...window.history.state, printDeskEditor: current.editor, printDeskStage: current.transition }, "", window.location.href);
        return;
      }
      const nextEditor = event.state?.printDeskEditor || null;
      const nextTransition = event.state?.printDeskStage || null;
      setEditor(nextEditor); setTransition(nextTransition); setDirty(false);
      current.dialogDirty = false; current.dialogSaving = false;
      if (!nextEditor && !nextTransition) void refresh();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [refresh]);
  const openStage = (next: { item: PrintJob; stage?: PrintJobStage }) => {
    navigationRef.current.dialogDirty = false;
    window.history.pushState({ ...window.history.state, printDeskStage: next }, "", window.location.href);
    setTransition(next);
  };
  const closeStage = () => {
    navigationRef.current.dialogDirty = false; navigationRef.current.dialogSaving = false;
    if (window.history.state?.printDeskStage) {
      window.history.replaceState({ ...window.history.state, printDeskStage: null }, "", window.location.href);
      window.history.back();
    }
    setTransition(null);
  };
  const items = useMemo(() => data?.items || [], [data]);
  const selected = items.find((item) => item.key === selectedKey) || null;
  const counts = useMemo(() => Object.fromEntries(PRINT_JOB_STAGES.map((stage) => [stage.id, items.filter((item) => item.stage === stage.id).length])) as Record<PrintJobStage, number>, [items]);
  const activeCount = items.filter((item) => !closed(item.stage)).length;
  const attentionCount = items.filter((item) => item.attention && !closed(item.stage)).length;
  const followUps = items.filter((item) => !closed(item.stage) && item.followUpDate && item.followUpDate <= today()).length;
  const filtered = useMemo(() => items.filter((item) => {
    const inView = view === "all" ? true : view === "active" ? !closed(item.stage) : view === "attention" ? item.attention && !closed(item.stage) : item.stage === view;
    const term = search.trim().toLowerCase();
    return inView && (source === "all" || item.source === source) && (!term || `${item.name} ${item.reference} ${item.email} ${item.phone} ${item.garmentSummary} ${item.documents.map((doc) => doc.reference).join(" ")}`.toLowerCase().includes(term));
  }).sort((a, b) => sort === "newest" ? b.createdAt - a.createdAt : sort === "oldest" ? a.createdAt - b.createdAt : sort === "name" ? a.name.localeCompare(b.name) : Number(b.attention) - Number(a.attention) || Number(b.overdue) - Number(a.overdue) || b.lastActivity - a.lastActivity), [items, view, source, search, sort]);
  const changeView = (next: View) => { setView(next); setSelectedKey(null); setVisibleCount(30); setNotice(""); };
  const openJob = (item: PrintJob) => { openerRef.current = document.activeElement as HTMLElement; setSelectedKey(item.key); setNotice(""); };
  const closeJob = () => { setSelectedKey(null); requestAnimationFrame(() => openerRef.current?.focus({ preventScroll: true })); };
  const openEditor = (kind: Editor["kind"], item?: PrintJob) => {
    editorOpenerRef.current = document.activeElement as HTMLElement;
    if (kind === "intake") setEditingIntake(data?.enquiries?.find((intake) => intake.id === item?.intakeId) || null);
    const next = { kind, id: kind === "quote" ? item?.quoteId || undefined : kind === "order" ? item?.orderId || undefined : item?.intakeId || undefined, name: item?.name || "New quotation" };
    window.history.pushState({ ...window.history.state, printDeskEditor: next }, "", window.location.href);
    setEditor(next);
    setDirty(false); window.scrollTo({ top: 0, behavior: "instant" });
  };
  const closeEditor = () => {
    if (dirty && !window.confirm("Discard your unsaved document edits and return to jobs?")) return;
    navigationRef.current.dirty = false;
    if (window.history.state?.printDeskEditor) window.history.back();
    setEditor(null); setDirty(false); void refresh(); requestAnimationFrame(() => { if (editorOpenerRef.current?.isConnected) editorOpenerRef.current.focus({ preventScroll: true }); else detailRef.current?.focus({ preventScroll: true }); });
  };
  const checkEmail = async () => {
    if (checkRef.current) return; checkRef.current = true; setChecking(true); setNotice("");
    try {
      const response = await fetch("/api/admin/inbox/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync" }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not check new email.");
      setNotice("Email checked. The job list is up to date."); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not check new email."); }
    finally { checkRef.current = false; setChecking(false); }
  };
  const focusedIntake = editor?.kind === "intake" ? (editingIntake?.id === editor.id ? editingIntake : data?.enquiries?.find((intake) => intake.id === editor.id)) : null;
  const viewTitle = view === "active" ? "All active jobs" : view === "attention" ? "Needs attention" : view === "all" ? "All records" : stageLabel(view);
  const viewDescription = view === "active" ? "Every open enquiry and print job. Closed work stays out of your way." : view === "attention" ? "Requests to review, missing details and recorded follow-ups." : view === "all" ? "Active work and your complete loaded job history." : stageDescription(view);

  return <div className={styles.workspace} data-theme={theme}>
    <div hidden={Boolean(editor)}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}><span className={styles.brandMark}>m.</span> MO T-SHIRT / PRINT DESK</p><h1>Quotes & invoices<span>.</span></h1><p>A clear next step for every job.</p></div>
        <div className={styles.headerActions}>{data?.canInbox && <button className={styles.secondary} onClick={() => void checkEmail()} disabled={checking}><Mail size={16} />{checking ? "Checking email…" : "Check email"}</button>}<button className={styles.primary} onClick={() => openEditor("quote")} disabled={!data?.canQuotes}><Plus size={17} />New quotation</button></div>
      </header>
      <section className={styles.pulse} aria-label="Print shop overview">
        <button onClick={() => changeView("active")}><span className={styles.pulseIcon}><Layers size={18} /></span><strong>{data ? activeCount : "—"}</strong><span>Active jobs</span><ChevronRight size={15} /></button>
        <button onClick={() => changeView("attention")}><span className={styles.pulseIcon} data-tone="orange"><ArrowDownLeft size={18} /></span><strong>{data ? attentionCount : "—"}</strong><span>Need attention</span><ChevronRight size={15} /></button>
        <button onClick={() => changeView("awaiting_client")}><span className={styles.pulseIcon} data-tone="amber"><Clock3 size={18} /></span><strong>{data ? counts.awaiting_client : "—"}</strong><span>Awaiting client</span><ChevronRight size={15} /></button>
        <button onClick={() => changeView("ready")}><span className={styles.pulseIcon} data-tone="green"><PackageCheck size={18} /></span><strong>{data ? counts.ready : "—"}</strong><span>Ready for handover</span><ChevronRight size={15} /></button>
      </section>
      {(error || data?.warnings?.length) ? <div className={styles.warning} role="alert"><CircleAlert size={18} /><div>{error || data?.warnings.join(" ")}{error && data && " Last loaded records are still shown."} <button onClick={() => void refresh()}>Retry</button></div></div> : null}
      {notice && <p className={styles.notice} role="status"><Check size={16} />{notice}</p>}
      <div className={styles.board}>
        <nav className={styles.rail} aria-label="Job categories">
          <button className={view === "active" ? styles.navActive : ""} aria-pressed={view === "active"} onClick={() => changeView("active")}><Layers size={16} /><span>All active</span><b>{data ? activeCount : "—"}</b></button>
          <button className={view === "attention" ? styles.navActive : ""} aria-pressed={view === "attention"} onClick={() => changeView("attention")}><CircleAlert size={16} /><span>Needs attention</span><b>{data ? attentionCount : "—"}</b></button>
          {[["ENQUIRIES", ["new", "needs_details", "awaiting_client"]], ["PRINT & HANDOVER", ["confirmed", "production", "ready"]], ["CLOSED", ["completed", "declined"]]].map(([label, stages]) => <div className={styles.navGroup} key={label as string}><p>{label}</p>{(stages as PrintJobStage[]).map((stage) => { const Icon = icons[stage]; return <button key={stage} className={view === stage ? styles.navActive : ""} data-stage={stage} aria-pressed={view === stage} onClick={() => changeView(stage)}><Icon size={16} /><span>{stageLabel(stage)}</span><b>{data ? counts[stage] : "—"}</b></button>; })}</div>)}
          <button className={`${styles.allRecords} ${view === "all" ? styles.navActive : ""}`} aria-pressed={view === "all"} onClick={() => changeView("all")}><FileText size={16} /><span>All records</span><b>{data ? items.length : "—"}</b></button>
          <p className={styles.railNote}>One job, all its details.<br />Quotes, invoices and artwork stay together.</p>
        </nav>
        <section className={styles.queue} aria-label="Print jobs">
          <div className={styles.queueHeading}><div><div className={styles.headingLine}><h2>{viewTitle}</h2><span>{data ? filtered.length : "—"}</span></div><p>{viewDescription}</p></div><button className={styles.iconButton} onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh job list"><RefreshCw size={17} className={refreshing ? styles.spin : ""} /></button></div>
          <div className={styles.toolbar}>
            <label className={styles.search}><Search size={17} /><input aria-label="Search jobs" placeholder="Search client, job or document…" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(30); }} />{search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={15} /></button>}</label>
            <label className={styles.selectWrap}><SlidersHorizontal size={15} /><select aria-label="Filter by source" value={source} onChange={(event) => { setSource(event.target.value as RequestSource | "all"); setVisibleCount(30); }}><option value="all">All sources</option>{Object.entries(REQUEST_SOURCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <select className={styles.sort} aria-label="Sort jobs" value={sort} onChange={(event) => setSort(event.target.value)}><option value="priority">Action first</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Client A–Z</option></select>
          </div>
          <div className={`${styles.workArea} ${selected ? styles.withDetail : ""}`}>
            <div className={styles.listArea}>
              <div className={styles.columnLabels}><span>Artwork / print job</span><span>Stage</span><span>Next step</span><span>Document / value</span></div>
              {!data && !error ? <div className={styles.empty}><Loader2 size={26} className={styles.spin} /><h3>Getting your jobs in order</h3><p>Loading enquiries, quotes and linked orders.</p></div> : filtered.length ? filtered.slice(0, visibleCount).map((item) => <button className={`${styles.row} ${selectedKey === item.key ? styles.selectedRow : ""}`} key={item.key} onClick={() => openJob(item)} aria-label={`Open job for ${item.name}, ${stageLabel(item.stage)}`} aria-pressed={selectedKey === item.key}>
                <span className={styles.customer}><ArtworkThumbnail key={item.thumbnail?.url || item.key} item={item} /><span><strong className={styles.printTitle}>{item.quantity ? `${item.quantity} pieces · ` : ""}{item.garmentSummary || "Custom printing enquiry"}</strong><span className={styles.clientName}>{item.name}</span><span className={styles.metadata}>{REQUEST_SOURCE_LABELS[item.source]}<i />{relativeDate(item.createdAt)}</span></span></span>
                <span className={styles.rowStage}><StageBadge stage={item.stage} /></span>
                <span className={styles.nextStep}><span className={styles.rowAction} data-stage={item.stage}>{item.action}<ArrowRight size={13} /></span><span className={item.overdue ? styles.overdue : ""}>{item.followUpDate ? `Follow up ${displayDate(item.followUpDate)}` : item.deadline ? `Requested ${displayDate(item.deadline)}` : item.reason}</span></span>
                <span className={styles.value}><strong>{money(item)}</strong><span>{item.reference}</span><ChevronRight size={16} /></span>
              </button>) : <div className={styles.empty}><Inbox size={28} /><h3>{error ? "The job list is unavailable" : search || source !== "all" ? "No matching jobs" : "No jobs in this category"}</h3><p>{error ? "Retry to load your records." : search || source !== "all" ? "Try a different name or clear the source filter." : "Jobs appear here as the work moves forward."}</p><button className={styles.secondary} onClick={() => { setSearch(""); setSource("all"); changeView("active"); }}>View active jobs</button></div>}
              {visibleCount < filtered.length && <button className={styles.loadMore} onClick={() => setVisibleCount((count) => count + 30)}>Show more jobs <span>{filtered.length - visibleCount} remaining</span></button>}
            </div>
            {selected && <aside className={styles.detail} ref={detailRef} tabIndex={-1} aria-label={`Job overview for ${selected.name}`}>
              <div className={styles.detailTop}><button className={styles.backToList} onClick={closeJob}><ArrowLeft size={15} />Job list</button><button className={styles.iconButton} onClick={closeJob} aria-label="Close job overview"><X size={18} /></button></div>
              <p className={styles.eyebrow}>JOB / {selected.reference}</p><div className={styles.artworkHero}><ArtworkThumbnail key={selected.thumbnail?.url || selected.key} item={selected} large />{selected.thumbnail && <a href={selected.thumbnail.url} target="_blank" rel="noopener noreferrer">View full-size artwork<ArrowRight size={13} /></a>}</div><h2>{selected.name}</h2><div className={styles.detailBadges}><StageBadge stage={selected.stage} /><span>{REQUEST_SOURCE_LABELS[selected.source]}</span></div>
              <section className={styles.nextCard} data-stage={selected.stage}><p className={styles.eyebrow}>{closed(selected.stage) ? "CLOSED JOB" : "NEXT STEP"}</p><h3>{selected.action}</h3><p>{selected.reason}</p>{selected.followUpDate && <span className={styles.dateLine}><Clock3 size={14} />Follow up {displayDate(selected.followUpDate)}</span>}
                <div className={styles.nextButtons}>{selected.editable && <button className={styles.primary} onClick={() => openStage({ item: selected })}>{closed(selected.stage) ? "Reopen / change stage" : "Update stage"}<ArrowRight size={15} /></button>}{!selected.editable && selected.orderId && <button className={styles.primary} onClick={() => openEditor("order", selected)}>Open production order<ArrowRight size={15} /></button>}</div>
              </section>
              {selected.editable && !closed(selected.stage) && <div className={styles.quickActions}><button data-action="waiting" onClick={() => openStage({ item: selected, stage: "awaiting_client" })}><Clock3 size={14} />Waiting for client</button><button data-action="decline" onClick={() => openStage({ item: selected, stage: "declined" })}><XCircle size={14} />Unable to fulfil</button></div>}
              <section className={styles.detailSection}><h3><FileText size={16} />Documents & payment</h3><div className={styles.moneyLine}><span>Job value</span><strong>{money(selected)}</strong></div><div className={styles.paymentLine}><span>Payment</span><strong data-verified={selected.payment.verified}>{selected.payment.label}</strong></div><p className={styles.help}>{selected.payment.detail}</p>
                {selected.documents.length ? <div className={styles.documents}>{selected.documents.map((doc, index) => <button key={`${doc.kind}-${index}`} onClick={() => openEditor(doc.kind === "order" ? "order" : "quote", selected)} disabled={doc.kind === "order" ? !selected.orderId : !selected.quoteId}><FileText size={17} /><span><strong>{doc.reference}</strong><span>{doc.kind.replace("_", " ")}{doc.generatedAutomatically ? " · auto-generated" : ""}</span></span><ChevronRight size={15} /></button>)}</div> : <p className={styles.help}>No document has been prepared yet.</p>}
                {selected.quoteId && <button className={styles.fullSecondary} onClick={() => openEditor("quote", selected)}>Open quote & invoice editor<ArrowRight size={15} /></button>}{selected.intakeId && <button className={styles.fullSecondary} onClick={() => openEditor("intake", selected)}>Review enquiry & reply<ArrowRight size={15} /></button>}{selected.orderId && <button className={styles.textButton} onClick={() => openEditor("order", selected)}>Production & delivery record <ArrowRight size={14} /></button>}
              </section>
              <section className={styles.detailSection}><h3><Printer size={16} />Print brief <span>{selected.quantity ? `${selected.quantity} pieces` : "Quantity to confirm"}</span></h3>{selected.lines.slice(0, 4).map((line, index) => <div className={styles.garment} key={index}><strong>{line.description}</strong><span>{[line.color, line.size, line.quantity ? `× ${line.quantity}` : ""].filter(Boolean).join(" · ")}</span></div>)}{selected.lines.length > 4 && <p className={styles.help}>+ {selected.lines.length - 4} more lines in the document</p>}{!selected.lines.length && <p className={styles.help}>Garment details still need to be confirmed.</p>}<dl className={styles.facts}><div><dt>Customer needs it</dt><dd>{selected.deadline ? displayDate(selected.deadline) : "Date to confirm"}</dd></div><div><dt>Handover</dt><dd>{selected.delivery || "To confirm"}</dd></div><div><dt>Artwork</dt><dd>{selected.artwork.length ? `${selected.artwork.length} file${selected.artwork.length === 1 ? "" : "s"} attached` : "Not attached"}</dd></div></dl>{selected.productionNote && <p className={styles.help}>{selected.productionNote}</p>}</section>
              <section className={styles.detailSection}><h3>Customer & conversation</h3>{selected.email && <p className={styles.contact}>{selected.email}</p>}{selected.phone && <p className={styles.contact}>{selected.phone}</p>}{selected.message && <p className={styles.customerNote}>{selected.message}</p>}{selected.artwork.length > 0 && <details className={styles.more}><summary>View artwork files ({selected.artwork.length})</summary>{selected.artwork.map((file, index) => <a href={file.url} target="_blank" rel="noopener noreferrer" key={index}><Layers size={14} />{file.name}<ArrowRight size={13} /></a>)}</details>}
              </section>
              <details className={styles.more}><summary>Stage history & classification</summary><p className={styles.help}>{selected.workflow ? selected.workflowOverridden ? "Newer client or production activity updated this stage. Your earlier team notes remain in the history." : "Stage set by your team. Original quote and order records are preserved." : `Classified from existing records: ${selected.derivedReason}`}</p>{selected.history.length ? <ol className={styles.history}>{selected.history.slice(0, 8).map((entry, index) => <li key={index}><strong>{entry.label}</strong><span>{entry.detail}</span><small>{entry.actor || "Recorded"} · {entry.atIso ? new Date(entry.atIso).toLocaleDateString("en-GB") : ""}</small></li>)}</ol> : <p className={styles.help}>No manual stage changes yet.</p>}</details>
            </aside>}
          </div>
          <footer className={styles.footer}><span>{data ? `${filtered.length} jobs in this view` : "Connecting…"}{followUps > 0 && <b> · {followUps} follow-up{followUps === 1 ? "" : "s"} due</b>}</span><span>{data ? `Updated ${new Date(data.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</span></footer>
        </section>
      </div>
      <p className={styles.assurance}><CheckCheck size={15} />Payment and fulfilment are tracked separately. Closing a job keeps its documents and history.</p>
    </div>
    {editor && <section className={styles.focusView}><header className={styles.focusHeader}><button className={styles.secondary} ref={backRef} onClick={closeEditor}><ArrowLeft size={16} />Back to jobs</button><div><p className={styles.eyebrow}>{editor.kind === "order" ? "PRODUCTION & DELIVERY" : editor.kind === "intake" ? "CUSTOMER ENQUIRY" : "QUOTE, INVOICE & ARTWORK"}</p><h2>{editor.name}</h2></div>{dirty && <span className={styles.unsaved}>Unsaved changes</span>}</header><div className={styles.editor}>{editor.kind === "quote" ? editor.id ? <QuoteEditor key={editor.id} embedded initialQuoteId={editor.id} onDirtyChange={setDirty} /> : <NewQuotationDraft onCreated={(id) => {
      const next: Editor = { kind: "quote", id, name: "Walk-in client" };
      window.history.replaceState({ ...window.history.state, printDeskEditor: next }, "", window.location.href);
      setEditor(next); void refresh();
    }} /> : editor.kind === "order" ? <OrderEditor embedded initialOrderId={editor.id} onDirtyChange={setDirty} /> : focusedIntake ? <EmailEnquiryDetails intake={focusedIntake} isDark={theme === "dark"} onUpdated={refresh} onDirtyChange={setDirty} onOpenQuote={(id) => {
      const next: Editor = { kind: "quote", id, name: data?.items.find((item) => item.quoteId === id)?.name || editor.name };
      window.history.replaceState({ ...window.history.state, printDeskEditor: next }, "", window.location.href);
      setEditor(next); setDirty(false); void refresh();
    }} /> : <div className={styles.empty}><h3>This enquiry has changed</h3><p>Return to jobs and refresh to open the latest record.</p></div>}</div></section>}
    {transition && <StageDialog item={transition.item} initialStage={transition.stage} onClose={closeStage} onStateChange={(isDirty, isSaving) => { navigationRef.current.dialogDirty = isDirty; navigationRef.current.dialogSaving = isSaving; }} onSaved={async (message) => { closeStage(); setNotice(message); await refresh(); }} />}
  </div>;
}

function StageDialog({ item, initialStage, onClose, onSaved, onStateChange }: { item: PrintJob; initialStage?: PrintJobStage; onClose: () => void; onSaved: (message: string) => Promise<void>; onStateChange: (dirty: boolean, saving: boolean) => void }) {
  const [stage, setStage] = useState<PrintJobStage>(initialStage || (closed(item.stage) ? "new" : item.stage));
  const [reason, setReason] = useState(initialStage ? "" : item.workflow?.reason || "");
  const [nextAction, setNextAction] = useState(item.workflow?.nextAction || "");
  const [followUpDate, setFollowUpDate] = useState(item.followUpDate || "");
  const [closureKind, setClosureKind] = useState<PrintJobClosureKind>(item.closureKind || "shop_declined");
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [reply, setReply] = useState("");
  const [replyEdited, setReplyEdited] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  const opener = useRef<HTMLElement | null>(null);
  const firstName = item.name.split(/\s+/)[0] || "there";
  const suggestedReply = closureKind === "shop_declined" ? `Hi ${firstName},\n\nThank you for considering MO T-SHIRT for your order. I’m sorry, but we won’t be able to fulfil this request${reason.trim() ? `: ${reason.trim().replace(/[.!]+$/, "")}` : ""}.\n\nThank you for your understanding.\nMO T-SHIRT` : closureKind === "client_declined" ? `Hi ${firstName},\n\nThank you for letting us know. We’ve noted that you won’t be proceeding with this quotation. Thank you for considering MO T-SHIRT.\n\nKind regards,\nMO T-SHIRT` : `Hi ${firstName},\n\nWe’ve noted the cancellation of this request. Please contact us if there are any outstanding arrangements to discuss.\n\nKind regards,\nMO T-SHIRT`;
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement; dialogRef.current?.focus();
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; opener.current?.focus(); };
  }, []);
  const changed = stage !== (initialStage || (closed(item.stage) ? "new" : item.stage)) || closureKind !== (item.closureKind || "shop_declined") || reason !== (initialStage ? "" : item.workflow?.reason || "") || nextAction !== (item.workflow?.nextAction || "") || followUpDate !== (item.followUpDate || "") || replyEdited || acknowledged;
  useEffect(() => { onStateChange(changed, saving); }, [changed, saving, onStateChange]);
  useEffect(() => {
    if (!changed && !saving) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [changed, saving]);
  const dismiss = () => {
    if (savingRef.current) return;
    if (changed && !window.confirm("Discard this unsaved stage update and reply draft?")) return;
    onClose();
  };
  const copyReply = async () => {
    try { await navigator.clipboard.writeText(replyEdited ? reply : suggestedReply); setCopied(true); }
    catch { setError("Could not copy. Select the draft text and copy it manually."); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (savingRef.current) return;
    if (["declined", "needs_details", "awaiting_client"].includes(stage) && !reason.trim()) { setError("Add a reason so the next person knows what is needed."); return; }
    if (stage === "completed" && !acknowledged) { setError("Confirm that collection or delivery has actually been completed."); return; }
    savingRef.current = true; setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/print-jobs/${encodeURIComponent(item.quoteId || item.intakeId || "")}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: item.intakeId ? "intake" : "quote", stage, reason: reason.trim(), nextAction: closed(stage) ? "" : nextAction.trim(), followUpDate: closed(stage) ? "" : followUpDate, closureKind: stage === "declined" ? closureKind : undefined, acknowledgeCompletion: acknowledged, expectedVersion: item.workflow?.version || 0, requestId: requestId.current }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save this stage.");
      await onSaved(`${item.name} moved to ${stageLabel(stage)}. No customer message was sent.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The save result is uncertain. Refresh the job before making another change."); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <div className={styles.backdrop}><div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="stage-dialog-title" ref={dialogRef} tabIndex={-1} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); dismiss(); }
    if (event.key === "Tab") { const nodes = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'); if (!nodes?.length) return; const first = nodes[0], last = nodes[nodes.length - 1]; if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  }}><header><div><p className={styles.eyebrow}>ORGANISE THIS JOB</p><h2 id="stage-dialog-title">What happens next?</h2><p>{item.name} · {item.reference}</p></div><button className={styles.iconButton} onClick={dismiss} disabled={saving} aria-label="Close stage update"><X size={20} /></button></header>
    <form onSubmit={(event) => void submit(event)} aria-label="Update job stage"><div className={styles.dialogBody}>
      <label className={styles.field}>Job stage<select value={stage} disabled={saving} onChange={(event) => { setStage(event.target.value as PrintJobStage); setAcknowledged(false); setError(""); requestId.current = crypto.randomUUID(); }}>{PRINT_JOB_STAGES.map((entry) => <option value={entry.id} key={entry.id}>{entry.label}</option>)}</select><span>{stageDescription(stage)}</span></label>
      {stage === "declined" && <label className={styles.field}>Outcome<select value={closureKind} disabled={saving} onChange={(event) => { setClosureKind(event.target.value as PrintJobClosureKind); setReplyEdited(false); }}><option value="shop_declined">We’re unable to fulfil it</option><option value="client_declined">Client declined the quotation</option><option value="cancelled">Order / request cancelled</option></select></label>}
      <label className={styles.field}>{stage === "declined" ? "Reason for closing" : stage === "awaiting_client" ? "What are we waiting for?" : stage === "needs_details" ? "Which details are missing?" : "Team note / reason"}<textarea value={reason} disabled={saving} maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder={stage === "awaiting_client" ? "e.g. Customer to approve the artwork and confirm sizes" : stage === "declined" ? "e.g. We cannot meet the requested delivery date" : "Give the team enough context to continue the job"} required={["declined", "needs_details", "awaiting_client"].includes(stage)} /></label>
      {!closed(stage) && <div className={styles.fieldPair}><label className={styles.field}>Next action<input value={nextAction} disabled={saving} maxLength={160} onChange={(event) => setNextAction(event.target.value)} placeholder="e.g. Follow up on artwork approval" /></label><label className={styles.field}>Follow-up date<input type="date" value={followUpDate} disabled={saving} onChange={(event) => setFollowUpDate(event.target.value)} /></label></div>}
      {stage === "completed" && <label className={styles.confirm}><input type="checkbox" checked={acknowledged} disabled={saving} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I have confirmed that the customer collected the job or delivery was completed. Printing finished alone is “Ready for handover”.</span></label>}
      {stage === "declined" && <section className={styles.replyDraft} aria-label="Polite reply draft"><div><h3><MessageSquare size={16} />Reply draft</h3><span>Review before using</span></div><p>This is a draft only. Check that the reason is appropriate to share with the customer.</p><textarea aria-label="Customer reply draft" value={replyEdited ? reply : suggestedReply} onChange={(event) => { setReplyEdited(true); setReply(event.target.value); setCopied(false); }} /><button type="button" className={styles.secondary} onClick={() => void copyReply()}><Copy size={14} />{copied ? "Copied" : "Copy reply draft"}</button></section>}
      <p className={styles.saveScope}><CircleAlert size={15} />This updates the job category and team notes. Payment records and production orders stay unchanged. No message is sent.</p>
      {error && <p className={styles.formError} role="alert">{error}</p>}
    </div><footer><button type="button" className={styles.secondary} onClick={dismiss} disabled={saving}>Cancel</button><button type="submit" className={styles.primary} disabled={saving}>{saving ? <Loader2 size={16} className={styles.spin} /> : <Check size={16} />}{saving ? "Saving stage…" : "Save stage"}</button></footer></form>
  </div></div>;
}
