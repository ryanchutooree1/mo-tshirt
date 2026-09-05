'use client';
import { useEffect, useMemo, useState } from 'react';
import { countInsightValues, summarizeJourney, trafficSources, type InsightEvent } from '@/lib/tracking-insights';
type Conversion = { enquiries: number; converted: number; untracked: number; truncated: boolean; sources: {label:string;count:number}[] };
const rate = (n: number,d: number) => d ? `${Math.round(n/d*100)}%` : '—';
function Ranking({rows, empty}: {rows:{label:string;count:number}[];empty:string}) {
  return rows.length ? <ul className="mt-3 divide-y divide-slate-100">{rows.slice(0,8).map(row=><li key={row.label} className="flex justify-between gap-4 py-2 text-sm"><span className="min-w-0 break-words">{row.label}</span><strong>{row.count}</strong></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">{empty}</p>;
}
export default function TrackingInsights({events,start,end}: {events:InsightEvent[];start:Date;end:Date}) {
  const [conversion,setConversion] = useState<Conversion|null>(null);
  const [error,setError] = useState('');
  useEffect(()=>{
    const controller = new AbortController(); setConversion(null); setError('');
    fetch(`/api/admin/tracking/conversions?${new URLSearchParams({start:start.toISOString(),end:end.toISOString()})}`,{signal:controller.signal})
      .then(async response=>{ const body=await response.json(); if(!response.ok)throw new Error(body.error); return body as Conversion; })
      .then(setConversion).catch(e=>{if(!controller.signal.aborted)setError(e.message || 'Conversions unavailable.');});
    return ()=>controller.abort();
  },[start,end]);
  const quote=useMemo(()=>summarizeJourney(events,'quote'),[events]);
  const design=useMemo(()=>summarizeJourney(events,'design'),[events]);
  const sources=useMemo(()=>trafficSources(events),[events]);
  const products=useMemo(()=>{
    const seen=new Set<string>();
    return countInsightValues(events.filter(e=>{
      if(e.name!=='product_interest')return false;
      const key=`${e.sessionId}:${e.params.product_id}`;if(seen.has(key))return false;seen.add(key);return true;
    }).map(e=>String(e.params.product_name || e.params.product_id || 'Unknown')));
  },[events]);
  const panel='rounded-2xl border border-slate-200 bg-white p-5';
  return <section aria-label="Customer journey insights" className="space-y-4">
    <div><h2 className="text-lg font-semibold">Customer journey</h2><p className="mt-1 text-sm text-slate-500">New journey tracking starts from this update. Figures use the loaded event sample and selected date range.</p></div>
    <div className="grid gap-4 md:grid-cols-2">
      <div className={panel}><h3 className="font-semibold">Quote completion</h3><p className="mt-2 text-2xl font-semibold">{rate(quote.completed,quote.started)}</p><p className="mt-1 text-sm text-slate-500">{quote.completed} successful submissions / {quote.started} forms started</p><p className="mt-2 text-xs text-slate-500">Starts on the first field change. Design requests are measured separately.</p></div>
      <div className={panel}><h3 className="font-semibold">Design abandonment · estimated</h3><p className="mt-2 text-2xl font-semibold">{rate(design.abandoned,design.started-design.active)}</p><p className="mt-1 text-sm text-slate-500">{design.abandoned} inactive · {design.completed} submitted · {design.active} still active</p><p className="mt-2 text-xs text-slate-500">No successful submission after 30 minutes without tracked interaction. Active attempts are excluded from the rate. Last recorded steps:</p><Ranking rows={design.steps} empty="No inactive designs in this sample." /></div>
      <div className={panel}><h3 className="font-semibold">Product interest</h3><p className="mt-1 text-xs text-slate-500">Unique sessions interacting with each product, not purchases or passive views.</p><Ranking rows={products} empty="Product interactions will appear here." /></div>
      <div className={panel}><h3 className="font-semibold">Traffic sources</h3><p className="mt-1 text-xs text-slate-500">Sessions by first-touch UTM source or referring website. Older events without attribution remain unknown.</p><Ranking rows={sources} empty="No attributed sessions yet." /></div>
      <div className={`${panel} md:col-span-2`}><h3 className="font-semibold">Enquiry-to-sale conversion</h3>{error ? <p role="status" className="mt-2 text-sm text-amber-700">{error}</p> : conversion ? <><p className="mt-2 text-2xl font-semibold">{rate(conversion.converted,conversion.enquiries)}</p><p className="mt-1 text-sm text-slate-500">{conversion.converted} linked orders / {conversion.enquiries} tracked website enquiries created in this period</p><p className="mt-2 text-xs text-slate-500">A sale here means a linked CRM order, excluding drafts, cancellations and rejections; it does not imply payment. Orders may be created after the enquiry period. {conversion.untracked} older or untracked enquiries are excluded.{conversion.truncated ? ' Limited to 500 enquiries; narrow the date range for a complete result.' : ''}</p><Ranking rows={conversion.sources} empty="No linked sales yet." /></> : <p className="mt-2 text-sm text-slate-500">Loading CRM conversions…</p>}</div>
    </div>
    <p className="text-sm text-slate-500">WhatsApp opens count clicks that attempt to open WhatsApp. They do not confirm a message, enquiry, or sale.</p>
  </section>;
}
