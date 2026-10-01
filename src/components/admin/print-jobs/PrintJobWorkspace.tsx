"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Clock3, Copy, FileImage, Inbox, Loader2, Mail, MessageSquare, Plus, RefreshCw, Search, X, XCircle } from "lucide-react";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import { PRINT_JOB_STAGES, type PrintJob, type PrintJobStage, type PrintJobClosureKind, stageLabel } from "@/lib/print-job-workflow";
import { type RequestSource } from "@/lib/quotation-inbox";
import type { EmailIntake } from "@/lib/email-intake-model";
import EmailEnquiryDetails from "@/components/admin/EmailEnquiryDetails";
import TanviHandoffPanel, { HandoffSettingsPanel } from "./TanviHandoffPanel";
import JobOrderDetails, { JobListSummary } from "./JobOrderDetails";
import styles from "./print-jobs.module.css";

const EditorLoading = () => <div className={styles.empty}><Loader2 className={styles.spin} size={24} /><p>Opening document workspace…</p></div>;
const NewQuotationDraft = dynamic(() => import("./NewQuotationDraft"), { loading: EditorLoading });
const OrderEditor = dynamic(() => import("@/components/admin/OrdersEditorPage"), { loading: EditorLoading });
type QueueData = { items: PrintJob[]; warnings: string[]; canQuotes: boolean; canOrders: boolean; canInbox?: boolean; updatedAt: number; enquiries?: EmailIntake[]; lastEmailSync?: string | null };
type View = PrintJobStage | "active" | "attention" | "all";
type Editor = { kind: "quote" | "order" | "intake"; id?: string; name: string };
const closed = (stage: PrintJobStage) => stage === "completed" || stage === "declined";
const money = (item: PrintJob) => item.total === null ? "To price" : `${item.currency || "Rs"} ${new Intl.NumberFormat("en-MU", { maximumFractionDigits: 2 }).format(item.total)}`;
const displayDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+04:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : value;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const stageDescription = (stage: PrintJobStage) => PRINT_JOB_STAGES.find((entry) => entry.id === stage)?.description || "";
function StageBadge({ stage }: { stage: PrintJobStage }) { return <span className={styles.badge} data-stage={stage}><i />{stageLabel(stage)}</span>; }

export default function PrintJobWorkspace({ requestedQuoteId, openSetup = false }: { requestedQuoteId?: string; openSetup?: boolean } = {}) {
  const { theme } = useAdminTheme();
  const [data, setData] = useState<QueueData | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [view, setView] = useState<View>("active");
  const [search, setSearch] = useState("");
  const [source] = useState<RequestSource | "all">("all");
  const [sort] = useState("newest");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(30);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editingIntake, setEditingIntake] = useState<EmailIntake | null>(null);
  const [transition, setTransition] = useState<{ item: PrintJob; stage?: PrintJobStage } | null>(null);
  const [notice, setNotice] = useState("");
  const [setupOpen, setSetupOpen] = useState(openSetup);
  const [handoffRevision, setHandoffRevision] = useState(0);
  const [panelBusy, setPanelBusy] = useState(false);
  useEffect(() => { if (openSetup) setSetupOpen(true); }, [openSetup]);
  const requestRef = useRef<AbortController | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const listScrollRef = useRef(0);
  const editorOpenerRef = useRef<HTMLElement | null>(null);
  const checkRef = useRef(false);
  const restoredRef = useRef<string | null>(null);
  const navigationRef = useRef({ editor, dirty, transition, dialogDirty: false, dialogSaving: false, panelBusy: false, selectedKey });
  navigationRef.current.editor = editor;
  navigationRef.current.dirty = dirty;
  navigationRef.current.transition = transition;
  navigationRef.current.panelBusy = panelBusy;
  navigationRef.current.selectedKey = selectedKey;

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
    if (item) { setView(closed(item.stage) ? item.stage : "active"); setSelectedKey(item.key); } else setSelectedKey(null);
    const next: Editor = { kind: "quote", id: quoteId, name: item?.name || "Requested quotation" };
    const updateHistory = window.history.state?.printDeskEditor || window.history.state?.printDeskJob ? window.history.replaceState.bind(window.history) : window.history.pushState.bind(window.history);
    updateHistory({ ...window.history.state, printDeskEditor: next, printDeskJob: item?.key || null }, "", window.location.href);
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
      const hasUnsaved = current.dirty || current.transition && current.dialogDirty;
      if (current.dialogSaving || current.panelBusy || hasUnsaved && !window.confirm("Discard your unsaved changes and go back?")) {
        window.history.pushState({ ...window.history.state, printDeskEditor: current.editor, printDeskStage: current.transition, printDeskJob: current.selectedKey }, "", window.location.href);
        return;
      }
      const nextEditor = event.state?.printDeskEditor || null;
      const nextTransition = event.state?.printDeskStage || null;
      setEditor(nextEditor); setTransition(nextTransition); setDirty(false);
      const nextJob = event.state?.printDeskJob || (nextEditor?.kind === "quote" && nextEditor.id ? `quote:${nextEditor.id}` : null);
      setSelectedKey(nextJob);
      if (!nextJob && !nextEditor) requestAnimationFrame(() => { window.scrollTo({ top: listScrollRef.current, behavior: "instant" }); openerRef.current?.focus({ preventScroll: true }); });
      else if (nextJob && nextJob !== current.selectedKey) window.scrollTo({ top: 0, behavior: "instant" });
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
  const changeView = (next: View) => { setView(next); setVisibleCount(30); setNotice(""); };
  const openJob = (item: PrintJob) => {
    if (navigationRef.current.selectedKey === item.key) return;
    if (panelBusy) { setNotice("Wait for the current action to finish before changing jobs."); return; }
    if (dirty && !window.confirm("Discard your unsaved entries and open another job?")) return;
    if (!navigationRef.current.selectedKey) listScrollRef.current = window.scrollY;
    navigationRef.current.selectedKey = item.key;
    setDirty(false); openerRef.current = document.activeElement as HTMLElement;
    setSelectedKey(item.key); setNotice("");
    window.scrollTo({ top: 0, behavior: "instant" });
    if (item.quoteId) {
      const next: Editor = { kind: "quote", id: item.quoteId, name: item.name };
      const updateHistory = window.history.state?.printDeskEditor || window.history.state?.printDeskJob ? window.history.replaceState.bind(window.history) : window.history.pushState.bind(window.history);
      updateHistory({ ...window.history.state, printDeskEditor: next, printDeskJob: item.key }, "", window.location.href); setEditor(next);
    } else {
      window.history.pushState({ ...window.history.state, printDeskEditor: null, printDeskJob: item.key }, "", window.location.href); setEditor(null);
    }
  };
  const closeJob = () => {
    if (!navigationRef.current.selectedKey || panelBusy || dirty && !window.confirm("Discard your unsaved entries and return to the client list?")) return;
    navigationRef.current.dirty = false;
    navigationRef.current.selectedKey = null;
    setDirty(false);
    // Let popstate reveal the list so a late Back event cannot erase a newer click.
    if (window.history.state?.printDeskEditor || window.history.state?.printDeskJob) { window.history.back(); return; }
    setSelectedKey(null); setEditor(null);
    requestAnimationFrame(() => { window.scrollTo({ top: listScrollRef.current, behavior: "instant" }); openerRef.current?.focus({ preventScroll: true }); });
  };
  const openEditor = (kind: Editor["kind"], item?: PrintJob) => {
    if (panelBusy || dirty && !window.confirm("Discard your unsaved entries and open this view?")) return;
    editorOpenerRef.current = document.activeElement as HTMLElement;
    if (kind === "intake") setEditingIntake(data?.enquiries?.find((intake) => intake.id === item?.intakeId) || null);
    const next = { kind, id: kind === "quote" ? item?.quoteId || undefined : kind === "order" ? item?.orderId || undefined : item?.intakeId || undefined, name: item?.name || "New quotation" };
    const updateHistory = window.history.state?.printDeskEditor || window.history.state?.printDeskJob ? window.history.replaceState.bind(window.history) : window.history.pushState.bind(window.history);
    updateHistory({ ...window.history.state, printDeskEditor: next }, "", window.location.href);
    setEditor(next);
    setDirty(false); window.scrollTo({ top: 0, behavior: "instant" });
  };
  const closeEditor = () => {
    if (panelBusy) return;
    if (dirty && !window.confirm("Discard your unsaved document edits and return to jobs?")) return;
    navigationRef.current.dirty = false;
    if (window.history.state?.printDeskEditor) window.history.back();
    setEditor(null); setSelectedKey(null); setDirty(false); void refresh(); requestAnimationFrame(() => { if (editorOpenerRef.current?.isConnected) editorOpenerRef.current.focus({ preventScroll: true }); else detailRef.current?.focus({ preventScroll: true }); });
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
  const focusView = Boolean(editor && (editor.kind !== "quote" || !editor.id || !selected));
  const statusOptions = [{id:"active",label:`All active (${activeCount})`},{id:"attention",label:`Needs attention (${attentionCount})`},...PRINT_JOB_STAGES.map(stage=>({id:stage.id,label:`${stage.label} (${counts[stage.id]})`})),{id:"all",label:`All records (${items.length})`}];

  return <div className={`${styles.workspace} ${styles.simpleWorkspace}`} data-theme={theme}>
    <div hidden={focusView || setupOpen}>
      <header className={styles.header} hidden={Boolean(selected)}><div><p className={styles.eyebrow}>MO T-SHIRT · QUOTATIONS</p><h1>Quotes & invoices<span>.</span></h1><p>Choose the design. Confirm price, check payment, send to production.</p></div><div className={styles.headerActions}>{data?.canInbox && <button className={styles.secondary} onClick={() => void checkEmail()} disabled={checking || panelBusy}><Mail size={16} />{checking ? "Checking…" : "Check email"}</button>}<button className={styles.primary} onClick={() => openEditor("quote")} disabled={!data?.canQuotes || panelBusy}><Plus size={17} />New quotation</button></div></header>
      {Boolean(error || data?.warnings?.length) && <div className={styles.warning} role="alert"><CircleAlert size={17} /><span>{error || data?.warnings.join(" ")}</span><button onClick={() => void refresh()}>Retry</button></div>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      <div className={styles.simpleDesk}>
        <aside className={styles.clientQueue} hidden={Boolean(selected)} aria-label="Client design list">
          <div className={styles.clientTools}><div><h2>{view === "active" ? "All active jobs" : view === "all" ? "All jobs" : view === "attention" ? "Needs attention" : stageLabel(view)} <span>{filtered.length}</span></h2><button className={styles.iconButton} onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh job list"><RefreshCw size={15} className={refreshing ? styles.spin : ""} /></button></div><label className={styles.search}><Search size={16} /><input aria-label="Search jobs" placeholder="Search client, design or quotation…" value={search} onChange={event => { setSearch(event.target.value); setVisibleCount(30); }} /></label><select className={styles.statusSelect} aria-label="Job status" value={view} onChange={event => changeView(event.target.value as View)}>{statusOptions.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></div>
          <div className={styles.clientList}>{!data && !error ? <div className={styles.empty}><Loader2 className={styles.spin} size={22} /><p>Loading client designs…</p></div> : filtered.slice(0,visibleCount).map(item=><button key={item.key} className={`${styles.clientCard} ${selectedKey === item.key ? styles.clientCardActive : ""}`} onClick={()=>openJob(item)} aria-pressed={selectedKey===item.key} aria-label={`Open job for ${item.name}, ${stageLabel(item.stage)}`}><JobVisuals item={item} compact /><span className={styles.clientCardInfo}><JobListSummary item={item}/><span className={styles.listClientName}>{item.name}</span><span className={styles.listMetadata}>{({studio:"Design studio",form:"Website enquiry",email:"Email",whatsapp:"WhatsApp",team:"Team"})[item.source]} · {item.reference}{item.createdAt ? ` · ${new Date(item.createdAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", timeZone:"Indian/Mauritius" })}` : ""}</span><span className={styles.clientCardBottom}><StageBadge stage={item.stage}/>{item.deadline&&<span>Requested {displayDate(item.deadline)}</span>}</span></span><span className={styles.listValue}><b>{money(item)}</b><span>View job <ArrowRight size={15}/></span></span></button>)}{!filtered.length && data && <div className={styles.empty}><Inbox size={24}/><h3>No matching clients</h3><p>Try another search or status.</p></div>}{visibleCount<filtered.length&&<button className={styles.loadMore} onClick={()=>setVisibleCount(count=>count+30)}>Show more clients</button>}</div>
          <p className={styles.clientFooter}>{data ? `${filtered.length} in this list` : "Connecting…"}{followUps ? ` · ${followUps} follow-ups due` : ""}</p>
        </aside>
        <section className={styles.selectedJob} hidden={!selected} aria-label="Selected client design">
          {selected ? <div ref={detailRef} tabIndex={-1} className={styles.selectedJobBody} aria-label={`Job overview for ${selected.name}`}>
            <div className={styles.selectedHeading}><button className={styles.backToList} disabled={panelBusy} onClick={closeJob}><ArrowLeft size={15}/>Client list</button><div><span>{selected.reference}</span><h2>{selected.name}</h2></div><StageBadge stage={selected.stage}/></div>
            <div className={styles.jobCanvas}><div className={styles.visualColumn}><JobVisuals item={selected}/>
              <div className={styles.secondaryJobActions}>{selected.editable&&<><button disabled={dirty||panelBusy} onClick={()=>openStage({item:selected,stage:"awaiting_client"})}><Clock3 size={14}/>Waiting for client</button><button disabled={dirty||panelBusy} onClick={()=>openStage({item:selected,stage:"declined"})}><XCircle size={14}/>Unable to fulfil</button><button disabled={dirty||panelBusy} onClick={()=>openStage({item:selected})}>Change job status</button></>}</div>
            </div><div className={styles.actionColumn}>{selected.quoteId ? <TanviHandoffPanel key={selected.quoteId} quoteId={selected.quoteId} refreshKey={handoffRevision} onDirtyChange={setDirty} onBusyChange={setPanelBusy} onUpdated={()=>void refresh()} onOpenSettings={()=>setSetupOpen(true)}/> : selected.intakeId ? <div className={styles.enquiryNext}><h3>Complete the enquiry first</h3><p>Review the client’s details, then prepare their quotation. Price, payment and production stay in this same workspace.</p><button className={styles.primary} onClick={()=>openEditor("intake",selected)}>Review enquiry<ArrowRight size={16}/></button></div> : <div className={styles.enquiryNext}><h3>Existing production order</h3><p>{selected.reason}</p><a className={styles.secondary} href={`/admin/orders?orderId=${encodeURIComponent(selected.orderId || "")}`}>Open order record<ArrowRight size={15}/></a></div>}</div></div>
            <JobOrderDetails item={selected}/>
          </div> : <div className={styles.pickDesign}><FileImage size={34}/><h2>Pick the client’s design</h2><p>The finished front and back, print files and the next action appear here.</p><span>1 Price agreed · 2 Payment received · 3 Send to production</span></div>}
        </section>
      </div>
    </div>
    {setupOpen && <HandoffSettingsPanel onClose={()=>setSetupOpen(false)} onSaved={()=>{setSetupOpen(false);setHandoffRevision(value=>value+1);setNotice("Test-only delivery is configured. No email has been sent.");}}/>}
    {focusView && !setupOpen && editor && <section className={styles.focusView}><header className={styles.focusHeader}><button ref={backRef} className={styles.secondary} disabled={panelBusy} onClick={closeEditor}><ArrowLeft size={16}/>Back to clients</button><div><p className={styles.eyebrow}>{editor.kind==="intake"?"CLIENT ENQUIRY":"QUOTATION"}</p><h2>{editor.name}</h2></div>{dirty&&<span className={styles.unsaved}>Unsaved changes</span>}</header><div className={styles.editor}>{editor.kind==="quote" ? editor.id ? <TanviHandoffPanel key={editor.id} quoteId={editor.id} onDirtyChange={setDirty} onBusyChange={setPanelBusy} onUpdated={()=>void refresh()} onOpenSettings={()=>setSetupOpen(true)} refreshKey={handoffRevision}/> : <NewQuotationDraft onCreated={id=>{const next:Editor={kind:"quote",id,name:"New quotation"};window.history.replaceState({...window.history.state,printDeskEditor:next,printDeskJob:`quote:${id}`},"",window.location.href);setEditor(next);setSelectedKey(`quote:${id}`);void refresh();}}/> : editor.kind==="order" ? <OrderEditor embedded initialOrderId={editor.id} onDirtyChange={setDirty}/> : focusedIntake ? <EmailEnquiryDetails intake={focusedIntake} isDark={theme==="dark"} onUpdated={refresh} onDirtyChange={setDirty} onOpenQuote={id=>{const next:Editor={kind:"quote",id,name:editor.name};window.history.replaceState({...window.history.state,printDeskEditor:next,printDeskJob:`quote:${id}`},"",window.location.href);setEditor(next);setSelectedKey(`quote:${id}`);setDirty(false);void refresh();}}/> : <div className={styles.empty}><p>This enquiry changed. Return to the client list and refresh.</p></div>}</div></section>}
    {transition&&<StageDialog item={transition.item} initialStage={transition.stage} onClose={closeStage} onStateChange={(isDirty,isSaving)=>{navigationRef.current.dialogDirty=isDirty;navigationRef.current.dialogSaving=isSaving;}} onSaved={async message=>{closeStage();setNotice(message);await refresh();}}/>}
  </div>;
}

function JobVisuals({item,compact=false}:{item:PrintJob;compact?:boolean}) {
  const mockups=item.mockups||[];const artworks=item.artworks||[];
  const renderImage=(visual:{url:string;name:string;side:string;kind:string},index:number)=>{
    const label=visual.side==="front"?"Front":visual.side==="back"?"Back":visual.name||"Preview";
    return <figure key={`${visual.url}-${index}`} data-kind={visual.kind}><VisualImage url={visual.url} label={`${visual.kind==="mockup"?"Finished product":"Print artwork"} · ${label}`}/>{!compact&&<figcaption>{label}</figcaption>}</figure>;
  };
  if(compact)return <span className={styles.queueVisuals}><span className={styles.queueMockups}>{mockups.length?mockups.slice(0,2).map(renderImage):<span className={styles.visualPlaceholder}><FileImage size={19}/><span>Mockup not saved</span></span>}</span>{artworks.length>0&&<span className={styles.queueArtworks}>{artworks.slice(0,4).map(renderImage)}{artworks.length>4&&<span>+{artworks.length-4}</span>}</span>}</span>;
  return <div className={styles.visualOverview}><div className={styles.garmentGallery}><div className={styles.visualSectionTitle}><h3>Finished product</h3><span>Client’s saved design</span></div><div className={styles.finishedProducts}>{mockups.length?mockups.map(renderImage):<div className={styles.visualPlaceholder}><FileImage size={28}/><p>No finished-product mockup is saved for this request.</p></div>}</div></div><div className={styles.logoGallery}><div className={styles.visualSectionTitle}><h3>Logos & print artwork</h3><span>{artworks.length} image{artworks.length===1?"":"s"}</span></div><div className={styles.printArtworks}>{artworks.length?artworks.map(renderImage):<p className={styles.help}>{item.artwork.length?"The supplied files have no image preview. Open them in the files section below.":"No print artwork attached yet."}</p>}</div></div></div>;
}
function VisualImage({url,label}:{url:string;label:string}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[url]);
  return failed?<span className={styles.visualPlaceholder}><FileImage size={22}/><span>Preview unavailable</span></span>:<img src={url} alt={label} loading="lazy" onError={()=>setFailed(true)}/>;
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
