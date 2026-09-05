"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, CircleAlert, ClipboardList, Clock3, FileText, Inbox, Layers3, Link2, Loader2, PackageCheck, Plus, Printer, RefreshCw, Search, Truck, X } from "lucide-react";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import { WORK_STAGES, type WorkItem, type WorkStage } from "@/lib/admin-workbench";
import styles from "./workbench.module.css";

const EditorLoading = () => <div className={styles.loading}><Loader2 className={styles.spin} size={24} /> Opening your workspace…</div>;
const QuoteEditor = dynamic(() => import("@/components/admin/QuoteEditorPage"), { loading: EditorLoading });
const OrderEditor = dynamic(() => import("@/components/admin/OrdersEditorPage"), { loading: EditorLoading });
type QueueData = { items: WorkItem[]; warnings: string[]; canQuotes: boolean; canOrders: boolean; updatedAt: number };
type View = WorkStage | "attention" | "active";
type Editor = { kind: "quote" | "order"; id?: string; name: string };
const stageIcons = { requests: FileText, waiting: Clock3, production: Printer, ready: Truck, done: CheckCheck };
const money = (value: number | null) => value === null ? "Price pending" : `Rs ${new Intl.NumberFormat("en-MU", { maximumFractionDigits: 2 }).format(value)}`;
const stageLabel = (stage: WorkStage) => WORK_STAGES.find((s) => s.id === stage)!.label;
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+04:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : value;

export default function AdminWorkbench({ name, canCreateSale }: { name: string; canCreateSale: boolean }) {
  const { theme } = useAdminTheme();
  const [data, setData] = useState<QueueData | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<View>("attention");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [dirty, setDirty] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const selected = data?.items.find((item) => item.key === selectedKey) || null;

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort("timeout"), 25000);
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/workbench", { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load your work.");
      if (!controller.signal.aborted) { setData(body); setError(""); }
    } catch (reason) {
      if (!controller.signal.aborted || controller.signal.reason === "timeout") setError(reason instanceof Error && !controller.signal.aborted ? reason.message : "Loading is taking longer than expected. Please retry.");
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === controller) setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const tick = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = setInterval(tick, 60000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); requestRef.current?.abort(); };
  }, [refresh]);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("mo-admin-daily-view") || "null");
      if (saved && ["attention", "active", ...WORK_STAGES.map((stage) => stage.id)].includes(saved.view)) {
        setView(saved.view);
        if (typeof saved.search === "string") setSearch(saved.search);
        if (typeof saved.selectedKey === "string") setSelectedKey(saved.selectedKey);
      }
    } catch { /* A fresh work list remains usable when browser storage is unavailable. */ }
    setPreferencesReady(true);
  }, []);
  useEffect(() => {
    if (preferencesReady) try { sessionStorage.setItem("mo-admin-daily-view", JSON.stringify({ view, search, selectedKey })); } catch {}
  }, [preferencesReady, view, search, selectedKey]);
  useEffect(() => {
    if (!dirty) return;
    const confirmNavigation = (event: MouseEvent) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (anchor.origin !== window.location.origin || !anchor.pathname.startsWith("/admin") || anchor.href === window.location.href) return;
      if (!window.confirm("You have unsaved edits. Leave this editor and discard those edits?")) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    document.addEventListener("click", confirmNavigation, true);
    return () => document.removeEventListener("click", confirmNavigation, true);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  useEffect(() => {
    if (selectedKey) detailRef.current?.focus({ preventScroll: true });
  }, [selectedKey]);
  useEffect(() => { if (editor) backRef.current?.focus({ preventScroll: true }); }, [editor]);
  const items = useMemo(() => data?.items || [], [data]);
  const counts = useMemo(() => Object.fromEntries(WORK_STAGES.map((stage) => [stage.id, items.filter((item) => item.stage === stage.id).length])) as Record<WorkStage, number>, [items]);
  const attention = items.filter((item) => item.attention && item.stage !== "done").length;
  const active = items.filter((item) => item.stage !== "done").length;
  const filtered = useMemo(() => items.filter((item) => {
    const matchesView = view === "attention" ? item.attention && item.stage !== "done" : view === "active" ? item.stage !== "done" : item.stage === view;
    const query = search.trim().toLowerCase();
    return matchesView && (!query || `${item.name} ${item.reference} ${item.phone} ${item.email} ${item.lines.map((line) => line.description).join(" ")}`.toLowerCase().includes(query));
  }), [items, search, view]);
  const changeView = (next: View) => { setView(next); setVisibleCount(8); setSelectedKey(null); };
  const openEditor = (kind: Editor["kind"], item?: WorkItem) => {
    openerRef.current = document.activeElement as HTMLElement;
    setEditor({ kind, id: kind === "quote" ? item?.quoteId || undefined : item?.orderId || undefined, name: item?.name || "Quotes & invoices" });
    setDirty(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const closeEditor = () => {
    if (dirty && !window.confirm("You have unsaved edits. Leave this editor and discard those edits?")) return;
    setEditor(null); setDirty(false); void refresh();
    requestAnimationFrame(() => { openerRef.current?.focus({ preventScroll: true }); listRef.current?.scrollIntoView({ block: "start" }); });
  };
  return <div className={styles.workspace} data-theme={theme}>
    <div hidden={Boolean(editor)}>
      <header className={styles.heading}>
        <div><p className={styles.eyebrow}>MO T-SHIRT · DAILY WORKSPACE</p><h1>Your day, in order<span>.</span></h1><p>Welcome back, {name.split(" ")[0]}. One place to keep the work moving.</p></div>
        <div className={styles.headerActions}>
          {data?.canQuotes && <button className={styles.secondary} onClick={() => openEditor("quote")}><FileText size={16} /> Quotes & invoices</button>}
          {canCreateSale && <Link className={styles.primary} href="/admin/pos"><Plus size={17} /> New sale</Link>}
        </div>
      </header>
      <div className={styles.overview}>
        <button className={`${styles.focusCard} ${view === "attention" ? styles.cardSelected : ""}`} onClick={() => changeView("attention")} aria-pressed={view === "attention"}>
          <span className={styles.cardTop}><span className={styles.iconTile}><ArrowDownLeft size={21} /></span><ArrowRight size={18} /></span>
          <span className={styles.cardNumber}>{data ? attention : "—"}<span>need your attention</span></span>
          <span className={styles.cardHint}>Requests, changes and next steps</span>
        </button>
        <div className={styles.flowCard}>
          <div className={styles.flowHeading}><span className={styles.eyebrow}>THE WORK, AT A GLANCE</span><span>{data ? active : "—"} active jobs</span></div>
          <div className={styles.flowStages}>{WORK_STAGES.map((stage) => { const Icon = stageIcons[stage.id]; return <button key={stage.id} className={view === stage.id ? styles.stageSelected : ""} onClick={() => changeView(stage.id)} aria-pressed={view === stage.id}><span className={styles.stageIcon}><Icon size={19} /></span><strong>{data ? counts[stage.id] : "—"}</strong><span>{stage.label}</span></button>; })}</div>
        </div>
      </div>
      <div className={styles.queue} ref={listRef}>
        <div className={styles.queueHeading}><div><h2>{view === "attention" ? "Start here" : view === "active" ? "All active work" : stageLabel(view)}</h2><p>{view === "attention" ? "The next useful action, already picked out." : view === "active" ? "Every open request and job, together." : WORK_STAGES.find((s) => s.id === view)?.detail}</p></div><button className={styles.refresh} onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh work list"><RefreshCw size={16} className={refreshing ? styles.spin : ""} />{refreshing ? "Updating" : "Refresh"}</button></div>
        {(error || data?.warnings.length) ? <div className={styles.warning} role="alert"><CircleAlert size={18} /><div>{error || data?.warnings.join(" ")}{error && data && <span> Your last loaded work is still shown.</span>} {error && <button onClick={() => void refresh()}>Retry</button>}</div></div> : null}
        <div className={styles.toolbar}><div className={styles.views}><button onClick={() => changeView("attention")} aria-pressed={view === "attention"}>Needs attention <span>{attention}</span></button><button onClick={() => changeView("active")} aria-pressed={view === "active"}>All active <span>{active}</span></button>{!["active", "attention"].includes(view) && <span className={styles.filterChip}>{stageLabel(view as WorkStage)}<button aria-label="Clear stage filter" onClick={() => changeView("active")}><X size={13} /></button></span>}</div><label className={styles.search}><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(8); }} placeholder="Find a customer, job or product" aria-label="Search work" />{search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={15} /></button>}</label></div>
        <div className={`${styles.workArea} ${selected ? styles.withDetail : ""}`}>
          <div className={styles.list}>
            {!data && !error ? <div className={styles.loading}><Loader2 className={styles.spin} size={24} /> Bringing your requests and jobs together…</div> : filtered.length ? <>
              <div className={styles.listLabels}><span>Customer & job</span><span>Next action</span><span>Value</span><span /></div>
              {filtered.slice(0, visibleCount).map((item) => <button className={`${styles.row} ${selectedKey === item.key ? styles.rowSelected : ""}`} key={item.key} onClick={() => setSelectedKey(item.key)} aria-pressed={selectedKey === item.key} aria-label={`Open ${item.name}, ${item.action}`}>
                <span className={styles.customer}><span className={`${styles.avatar} ${item.overdue ? styles.avatarUrgent : ""}`}>{item.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("")}</span><span><strong>{item.name}</strong><span className={styles.rowMeta}>{item.reference} <span>·</span> {item.quantity || "—"} {item.quantity === 1 ? "piece" : "pieces"} {item.quoteId && item.orderId && <Link2 size={12} aria-label="Linked quote and order" />}</span><span className={styles.product}>{item.lines[0]?.description || "Custom printing request"}</span></span></span>
                <span className={styles.nextAction}><span className={`${styles.status} ${styles[item.stage]}`}>{item.overdue ? "Overdue" : stageLabel(item.stage)}</span><strong>{item.action}</strong><span>{item.deadline ? `Requested ${date(item.deadline)}` : item.reason}</span></span>
                <span className={styles.value}>{money(item.total)}<ChevronRight size={17} /></span>
              </button>)}
              {visibleCount < filtered.length && <button className={styles.loadMore} onClick={() => setVisibleCount((count) => count + 40)}>Show more jobs ({filtered.length - visibleCount} remaining)</button>}
            </> : <div className={styles.empty}><span>{search ? <Search size={28} /> : error || data?.warnings.length ? <CircleAlert size={28} /> : <Inbox size={28} />}</span><h3>{search ? "No matching jobs" : error || data?.warnings.length ? "The work list is incomplete" : view === "attention" ? "Nothing needs your attention here" : "No jobs in this view"}</h3><p>{search ? "Try another name, reference or product." : error || data?.warnings.length ? "Refresh to try loading your records again." : "Use All active to see work already moving."}</p><button className={styles.secondary} onClick={() => { setSearch(""); changeView("active"); }}>View all active work <ArrowRight size={15} /></button></div>}
          </div>
          {selected && <aside ref={detailRef} tabIndex={-1} className={styles.detail} aria-label={`Job details for ${selected.name}`}>
            <div className={styles.detailTop}><span className={styles.eyebrow}>JOB OVERVIEW</span><button onClick={() => setSelectedKey(null)} aria-label="Close job details"><X size={20} /></button></div>
            <h2>{selected.name}</h2><p className={styles.detailRef}>{selected.reference} <span className={`${styles.status} ${styles[selected.stage]}`}>{stageLabel(selected.stage)}</span></p>
            <div className={styles.recommendation}><span className={styles.eyebrow}>NEXT UP</span><h3>{selected.action}</h3><p>{selected.reason}</p><button className={styles.primary} onClick={() => openEditor(selected.orderId ? "order" : "quote", selected)}>{selected.action}<ArrowRight size={17} /></button></div>
            {selected.quoteId && selected.orderId && <div className={styles.linked}><Link2 size={16} /><span>Quote and order linked. Details carried forward.</span></div>}
            <dl className={styles.facts}><div><dt>Order value</dt><dd>{money(selected.total)}</dd></div><div><dt>Payment</dt><dd>{selected.payment}</dd></div>{selected.deadline && <div><dt>Requested date</dt><dd>{date(selected.deadline)}</dd></div>}<div><dt>Delivery</dt><dd>{selected.delivery || "To confirm"}</dd></div></dl>
            <section className={styles.detailSection}><h3><ClipboardList size={16} /> Garments <span>{selected.quantity} {selected.quantity === 1 ? "piece" : "pieces"}</span></h3>{selected.lines.length ? selected.lines.map((line, index) => <div className={styles.line} key={index}><strong>{line.description}</strong><span>{[line.color, line.size, `Qty ${line.quantity}`].filter(Boolean).join(" · ")}</span></div>) : <p>No garment details recorded yet.</p>}{selected.automaticPrice && <p className={styles.autoPrice}><Check size={14} /> Website pricing carried into this request</p>}</section>
            {selected.artwork.length > 0 && <section className={styles.detailSection}><h3><Layers3 size={16} /> Artwork <span>{selected.artwork.length} files</span></h3>{selected.artwork.map((file, index) => <a className={styles.file} href={file.url} key={index} target="_blank" rel="noopener noreferrer"><FileText size={16} /><span>{file.name}</span><ArrowRight size={14} /></a>)}</section>}
            <section className={styles.detailSection}><h3>Customer details</h3>{selected.phone && <p>{selected.phone}</p>}{selected.email && <p>{selected.email}</p>}{selected.address && <p>{selected.address}</p>}{!selected.phone && !selected.email && <p>Contact details not recorded.</p>}</section>
            {selected.message && <section className={styles.detailSection}><h3>Customer notes</h3><p className={styles.notes}>{selected.message}</p></section>}
            {selected.quoteId && selected.orderId && <button className={styles.secondary} onClick={() => openEditor("quote", selected)}><FileText size={16} /> Open linked quote</button>}
          </aside>}
        </div>
        <footer className={styles.queueFooter}><span><span className={styles.liveDot} /> {data ? `${filtered.length} ${filtered.length === 1 ? "job" : "jobs"} in this view` : "Connecting to your records"}</span><span>{data ? `Updated ${new Date(data.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · refreshes every minute` : ""}</span></footer>
      </div>
      <div className={styles.assurance}><PackageCheck size={18} /><p><strong>Enter it once. Keep it with the job.</strong> Customer details, garments and artwork stay connected from request to delivery.</p></div>
    </div>
    {editor && <div className={styles.focusView}><header className={styles.focusHeader}><button ref={backRef} className={styles.secondary} onClick={closeEditor}><ArrowLeft size={17} /> Back to daily work</button><div><span>{editor.kind === "quote" ? "QUOTE & ARTWORK" : "PRODUCTION & DELIVERY"}</span><strong>{editor.name}</strong></div>{dirty && <span className={styles.unsaved}>Unsaved edits</span>}</header><div className={styles.editor}>{editor.kind === "quote" ? <QuoteEditor embedded={Boolean(editor.id)} initialQuoteId={editor.id} onDirtyChange={setDirty} /> : <OrderEditor embedded initialOrderId={editor.id} onDirtyChange={setDirty} />}</div></div>}
  </div>;
}
