"use client";
import { useEffect, useState } from "react";
import { BarChart3, Download, Info, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WhatsAppInsights } from "@/lib/whatsapp-insights";
import styles from "./whatsapp-insights.module.css";

type Insights = Omit<WhatsAppInsights, "cohorts">;
type Filters = { start: string; end: string; product: string };
const productOptions = [{ id: "all", label: "All products" }, { id: "tshirts", label: "T-shirts" },
  { id: "polos", label: "Polo shirts" }, { id: "caps", label: "Caps" }, { id: "hoodies", label: "Hoodies" },
  { id: "mugs", label: "Mugs" }, { id: "bags", label: "Bags" }];
const count = (value: number) => value.toLocaleString("en-GB");
const pct = (value: number | null) => value === null ? "—" : `${Math.round(value * 100)}%`;
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Indian/Mauritius" }).format(new Date(value));
const hours = (value: number | null) => value === null ? "—" : value < 1 ? `${Math.round(value * 60)} min` : value >= 48 ? `${(value / 24).toFixed(1)} days` : `${value.toFixed(1)} hrs`;

function Bars({ rows, total, tone = "green", onSelect }: { rows: { id?: string; label: string; count: number }[]; total: number; tone?: "green" | "amber"; onSelect?: (id: string) => void }) {
  const max = Math.max(1, ...rows.map(row => row.count));
  return <div className={styles.bars}>{rows.map(row => <div key={row.label} className={styles.barRow}>
    <div className={styles.barHeading}>{onSelect && row.id ? <button className={styles.barLink} onClick={() => onSelect(row.id!)}>{row.label}</button> : <span>{row.label}</span>}<strong>{count(row.count)} <small>{pct(total ? row.count / total : null)}</small></strong></div>
    <div className={styles.track} role="img" aria-label={`${row.label}: ${row.count} of ${total} conversations`}><div className={tone === "amber" ? styles.amberFill : styles.fill} style={{ width: `${row.count / max * 100}%` }} /></div>
  </div>)}</div>;
}

function Values({ rows }: { rows: { label: string; count: number }[] }) {
  return <details className={styles.values}><summary>View values</summary><table><thead><tr><th scope="col">Category</th><th scope="col">Conversations</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><td>{row.label}</td><td>{count(row.count)}</td></tr>)}</tbody></table></details>;
}

export default function WhatsAppInsightsPage() {
  const [data, setData] = useState<Insights | null>(null);
  const [filters, setFilters] = useState<Filters>({ start: "", end: "", product: "all" });
  const [draft, setDraft] = useState<Filters>({ start: "", end: "", product: "all" });
  const [preset, setPreset] = useState("year");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [empty, setEmpty] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    fetch(`/api/admin/whatsapp?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to load insights."); return result; })
      .then(result => { setEmpty(Boolean(result.empty)); setData(result.empty ? null : result); if (!result.empty) setDraft(result.filters); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, revision]);
  function choosePeriod(value: string, product = filters.product) {
    setPreset(value);
    if (value === "custom" || !data) return;
    const end = new Date(Date.parse(data.asOf) + 4 * 3600000).toISOString().slice(0, 10);
    const start = value === "year" ? `${end.slice(0, 4)}-01-01` : value === "all" ? (data.source.firstMessageAt || data.asOf).slice(0, 10)
      : new Date(Date.parse(end) - (Number(value) - 1) * 86400000).toISOString().slice(0, 10);
    const next = { start, end, product }; setDraft(next); setFilters(next);
  }
  function chooseProduct(product: string) {
    const next = { ...(data?.filters || filters), product }; setDraft(next); setFilters(next);
  }
  const exportUrl = `/api/admin/whatsapp?${new URLSearchParams({ ...(data?.filters || filters), download: "metrics" })}`;
  const total = data?.kpis.enquiries || 0;
  const months = data?.months.map(row => ({ ...row, label: new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(`${row.month}-15T12:00:00Z`)), fullLabel: row.month })) || [];
  return <main className={styles.page}>
    <header className={styles.header}><div><h1><BarChart3 size={27} aria-hidden /> WhatsApp insights</h1><p>Demand, service patterns and decisions from your business messages</p></div>
      <div className={styles.headerActions}><button onClick={() => setRevision(value => value + 1)} disabled={loading} aria-label="Refresh dashboard"><RefreshCw size={16} /></button>{data && <a download href={exportUrl}><Download size={15} /> Export metrics</a>}</div></header>
    <form className={styles.filters} onSubmit={event => { event.preventDefault(); setPreset("custom"); setFilters({ ...draft }); }}>
      <label>Period<select value={preset} disabled={!data || loading} onChange={event => choosePeriod(event.target.value)}><option value="year">This year in snapshot</option><option value="90">Last 90 days</option><option value="30">Last 30 days</option><option value="all">All stored history</option><option value="custom">Custom dates</option></select></label>
      <label>From<input type="date" aria-label="Start date" value={draft.start} max={draft.end || undefined} onChange={event => { setPreset("custom"); setDraft(value => ({ ...value, start: event.target.value })); }} required /></label>
      <label>To<input type="date" aria-label="End date" value={draft.end} min={draft.start || undefined} onChange={event => { setPreset("custom"); setDraft(value => ({ ...value, end: event.target.value })); }} required /></label>
      <label>Product<select value={draft.product} onChange={event => setDraft(value => ({ ...value, product: event.target.value }))}>{productOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <button type="submit" disabled={loading}>Apply filters</button>
    </form>
    {error ? <div role="alert" className={styles.notice}><h2>Insights unavailable</h2><p>{error}</p><button onClick={() => setRevision(value => value + 1)}>Try again</button></div>
      : loading ? <div role="status" className={styles.loading}>Calculating the selected view…</div>
      : empty ? <div className={styles.notice}>No WhatsApp snapshot has been imported yet.</div>
      : data && <>
        <div className={styles.scope}><span>{date(data.filters.start)} – {date(data.filters.end)} · {productOptions.find(option => option.id === data.filters.product)?.label}</span><span>Snapshot: {date(data.asOf)}</span></div>
        <p className={styles.caveat}><Info size={15} aria-hidden /> Enquiry classifications are provisional. This covers history stored on the Mac; missing phone, call and email replies can affect the response figures.</p>
        <section className={styles.kpis} aria-label="Key measures">
          <article><span>Enquiry conversations</span><strong>{count(total)}</strong><p>Incoming request signals in {count(data.kpis.incomingMessages)} text/caption records.</p></article>
          <article><span>Non-template reply within 24h</span><strong>{pct(data.kpis.replyWithin24hRate)}</strong><p>{count(data.kpis.repliedWithin24h)} of {count(data.kpis.matureEnquiries)} conversations observed for at least 24 hours.</p></article>
          <article><span>Median non-template reply</span><strong>{hours(data.kpis.medianReplyHours)}</strong><p>Among {count(data.kpis.replied)} conversations with a recorded reply. Calendar time.</p></article>
          <article className={styles.attention}><span>No non-template reply recorded</span><strong>{count(data.kpis.noNonTemplateReply)}</strong><p>Since the first request in the period. Followed through snapshot time.</p></article>
        </section>
        {!total ? <div className={styles.notice}><h2>No matching enquiry signals</h2><p>Choose another date range or product. An empty selection does not establish zero business activity.</p><button onClick={() => choosePeriod("year", "all")}>Reset dates and product</button></div> : <>
          <div className={styles.primaryGrid}>
            <section className={styles.panel} aria-labelledby="activity-title"><div className={styles.panelTitle}><h2 id="activity-title">Recorded enquiry activity</h2><span>Conversations / month</span></div>
              <div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart accessibilityLayer data={months} margin={{ top: 10, right: 10, left: -20, bottom: 2 }}><CartesianGrid vertical={false} stroke="#e9eee9" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#738175" }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#738175" }} /><Tooltip cursor={{ fill: "#f0f5ef" }} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel || "Month"} /><Bar dataKey="count" name="Enquiry conversations" fill="#398366" radius={[4, 4, 0, 0]} maxBarSize={45} /></BarChart></ResponsiveContainer></div>
              <p className={styles.note}>Returning conversations can count in several months. The latest month is partial; changes can reflect incomplete stored history.</p><Values rows={data.months.map(row => ({ label: row.month, count: row.count }))} />
            </section>
            <section className={styles.panel}><div className={styles.panelTitle}><h2>After the first enquiry</h2><span>{count(total)} conversations</span></div><Bars rows={data.responseBuckets} total={total} /><p className={styles.note}>A non-template reply is a recorded text or media reply, excluding long messages repeated across three or more conversations. It is not proof of an order.</p></section>
          </div>
          <div className={styles.twoColumns}>
            <section className={styles.panel}><div className={styles.panelTitle}><h2>Product interest</h2><span>Incoming mentions</span></div><Bars rows={data.products} total={total} onSelect={chooseProduct} /><p className={styles.note}>One conversation can mention several products. Select a product to filter the entire dashboard. Outgoing price lists are excluded.</p></section>
            <section className={styles.panel}><div className={styles.panelTitle}><h2>Questions and requirements</h2><span>Incoming mentions</span></div><Bars rows={data.topics} total={total} /><p className={styles.note}>Overlapping topics, counted once per conversation. These show what needs explaining during enquiry intake.</p></section>
          </div>
          <div className={styles.twoColumns}>
            <section className={styles.panel}><div className={styles.panelTitle}><h2>How long replies take</h2><span>{count(data.kpis.replied)} replied conversations</span></div><Bars rows={data.latency} total={data.kpis.replied} tone="amber" /><p className={styles.note}>Only conversations with a recorded non-template reply. The {count(data.kpis.noNonTemplateReply)} without one are excluded from these timing bars and the median.</p></section>
            <section className={styles.panel}><div className={styles.panelTitle}><h2>Customer friction signals</h2><span>Text-based indicators</span></div><Bars rows={data.friction} total={total} tone="amber" /><p className={styles.note}>These are detected mentions, not verified final outcomes or a loss rate. A zero means no phrase matched the current rules.</p></section>
          </div>
          <section className={styles.decisions} aria-labelledby="decision-title"><div className={styles.sectionHeader}><h2 id="decision-title">Decisions supported by this view</h2><span>Recommendations to test</span></div><div className={styles.decisionGrid}>{data.insights.map((insight, index) => <article key={insight.title}><span className={styles.decisionNumber}>{String(index + 1).padStart(2, "0")}</span><div><h3>{insight.title}</h3><p className={styles.evidence}>{insight.evidence}</p><p>{insight.decision}</p>{insight.caution && <small>{insight.caution}</small>}</div></article>)}</div></section>
          <section className={styles.panel}><div className={styles.panelTitle}><h2>When first enquiries arrive</h2><span>Mauritius time</span></div><div className={styles.hours}>{data.hourBuckets.map(row => <div key={row.label}><strong>{count(row.count)}</strong><span>{row.label}</span><div className={styles.track}><div className={styles.fill} style={{ width: `${row.count / Math.max(1, ...data.hourBuckets.map(item => item.count)) * 100}%` }} /></div></div>)}</div><p className={styles.note}>First qualifying incoming request per conversation in the selected period. Use this as a starting point for coverage planning, alongside staffing and opening hours.</p></section>
        </>}
        <section className={styles.financial}><h2>What still needs order and payment data</h2><p>Revenue, conversion rate, profit margin and confirmed lost sales cannot be established from these chats alone. There are {data.kpis.paymentMentions} conversations with an explicit payment-sent claim in this view; those claims have not been reconciled with payments.</p></section>
        <details className={styles.sources}><summary><Info size={16} /> Sources, definitions and coverage</summary><p>Source: WhatsApp desktop content databases · {count(data.source.sourceConversations)} conversation records and {count(data.source.sourceMessages)} message records · {data.source.mediaOriginals} messages have a locally stored original.</p><p>Excluded from the current view: {data.source.exclusions.personalOrInternal} reviewed personal/internal conversations; {data.source.exclusions.automatedOrBroadcast} automated/broadcast; {data.source.exclusions.supplierOrRecruitment} supplier/recruitment; {data.source.exclusions.noEnquirySignal} without an enquiry signal; {data.source.exclusions.outsidePeriod} outside the period; {data.source.exclusions.productFilter} outside the product filter.</p><ol>{data.methodology.map(item => <li key={item}>{item}</li>)}</ol><p>Calculation version: {data.version}. Export metrics saves the same filtered aggregate values and definitions shown here.</p></details>
      </>}
  </main>;
}
