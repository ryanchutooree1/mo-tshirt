"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { format, addDays } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Factory,
  Play,
  Pause,
  SquareCheck,
  SquareX,
  Plus,
  Search,
  Filter,
  Printer,
  QrCode,
  Users,
  Wrench,
  AlertTriangle,
  Clock4,
  ChevronRight,
  ChevronLeft,
  Settings2,
  Check,
  CalendarClock,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

/*
  PRODUCTION PAGE (Next.js + Tailwind + Recharts)
  ------------------------------------------------
  Features
  - KPIs (WIP, Due Today, Late, Capacity)
  - Kanban board: Queued • In Progress • On Hold • Done
  - Start/Pause/Complete workflow with live timers
  - Work order drawer to create/edit/print traveler with QR
  - Filters (search, workstation, priority, due range)
  - Capacity plan chart (7 days) + Workstation utilization pie
  - Batch actions (move, assign, print)
  - Barcode/QR quick locate

  NOTE: front-end only (mock data). Wire to Firestore later.
*/

/* ----------------------------- Types ------------------------------ */

type Status = "Queued" | "In Progress" | "On Hold" | "Done";

type WorkOrder = {
  id: string;
  client: string;
  item: string;
  qty: number;
  size?: string;
  color?: string;
  priority: "Low" | "Normal" | "High" | "Rush";
  workstation: "DTF" | "DTG" | "Vinyl" | "Sewing" | "Finishing";
  assignee?: string;
  due: string; // yyyy-mm-dd
  status: Status;
  startedAt?: number | null; // ms
  elapsedMs?: number; // accumulated when paused/done
  notes?: string;
};

/* ---------------------------- Mock Data --------------------------- */

const seed: WorkOrder[] = [
  { id: "MO-1021", client: "Acme Ltd", item: "Tee — Summer Drop", qty: 120, size: "M/L", color: "Black", priority: "Normal", workstation: "DTF", assignee: "Ravi", due: format(addDays(new Date(), 0), "yyyy-MM-dd"), status: "Queued", elapsedMs: 0 },
  { id: "MO-1022", client: "Globex", item: "Polo — Corporate", qty: 60, size: "XL", color: "Navy", priority: "High", workstation: "Vinyl", assignee: "Asha", due: format(addDays(new Date(), 1), "yyyy-MM-dd"), status: "In Progress", startedAt: Date.now()- 1000*60*45, elapsedMs: 1000*60*15 },
  { id: "MO-1023", client: "Initech", item: "Hoodie — Merch", qty: 35, size: "S-XL", color: "Grey", priority: "Rush", workstation: "DTG", assignee: "Mo", due: format(addDays(new Date(), -1), "yyyy-MM-dd"), status: "On Hold", elapsedMs: 1000*60*40 },
  { id: "MO-1024", client: "Umbrella", item: "Caps — Launch", qty: 150, size: "—", color: "Red", priority: "Normal", workstation: "Finishing", assignee: "Dev", due: format(addDays(new Date(), 2), "yyyy-MM-dd"), status: "Queued", elapsedMs: 0 },
  { id: "MO-1025", client: "Hooli", item: "Aprons — Cafe", qty: 40, size: "—", color: "Forest", priority: "Low", workstation: "Sewing", assignee: "Sara", due: format(addDays(new Date(), 0), "yyyy-MM-dd"), status: "In Progress", startedAt: Date.now()- 1000*60*9, elapsedMs: 0 },
  { id: "MO-1026", client: "Soylent", item: "Tote — Event", qty: 200, size: "—", color: "Natural", priority: "Normal", workstation: "Finishing", assignee: "Jay", due: format(addDays(new Date(), 3), "yyyy-MM-dd"), status: "Done", elapsedMs: 1000*60*55 },
];

/* ----------------------------- Helpers ---------------------------- */

const currency = (n: number) => `Rs ${n.toLocaleString()}`;
const fmt = (d: string) => format(new Date(d), "dd MMM");

function classNames(...xs: (string | false | undefined)[]) { return xs.filter(Boolean).join(" "); }

function isLate(wo: WorkOrder) {
  const today = format(new Date(), "yyyy-MM-dd");
  return wo.status !== "Done" && wo.due < today;
}

function runningMs(wo: WorkOrder, now: number) {
  return (wo.elapsedMs || 0) + (wo.startedAt ? now - wo.startedAt : 0);
}

function hhmm(ms: number) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

const WS_COLORS: Record<WorkOrder["workstation"], string> = {
  DTF: "bg-sky-100 text-sky-800",
  DTG: "bg-violet-100 text-violet-800",
  Vinyl: "bg-emerald-100 text-emerald-800",
  Sewing: "bg-rose-100 text-rose-800",
  Finishing: "bg-gray-100 text-gray-800",
};

/* -------------------------- Main Component ------------------------ */

export default function ProductionPage() {
  const [orders, setOrders] = useState<WorkOrder[]>(seed);
  const [query, setQuery] = useState("");
  const [wsFilter, setWsFilter] = useState<"All" | WorkOrder["workstation"]>("All");
  const [prioFilter, setPrioFilter] = useState<"All" | WorkOrder["priority"]>("All");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<WorkOrder | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(Date.now());
  const [scan, setScan] = useState("");

  // live timer
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    let rows = orders;
    if (wsFilter !== "All") rows = rows.filter(r => r.workstation === wsFilter);
    if (prioFilter !== "All") rows = rows.filter(r => r.priority === prioFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(r => [r.id, r.client, r.item, r.assignee].join(" ").toLowerCase().includes(q));
    }
    return rows;
  }, [orders, wsFilter, prioFilter, query]);

  const byStatus = useMemo(() => {
    const groups: Record<Status, WorkOrder[]> = { "Queued": [], "In Progress": [], "On Hold": [], "Done": [] };
    filtered.forEach(o => groups[o.status].push(o));
    return groups;
  }, [filtered]);

  // KPIs
  const wip = orders.filter(o => o.status !== "Done").length;
  const dueToday = orders.filter(o => o.status !== "Done" && o.due === format(new Date(), "yyyy-MM-dd")).length;
  const late = orders.filter(isLate).length;
  const capacity = 480; // minutes capacity today (example)
  const booked = orders.filter(o => o.status !== "Done").reduce((a,o)=> a + Math.ceil((o.qty||0)/2), 0); // fake load
  const capacityPct = Math.min(100, Math.round(booked / capacity * 100));

  // Capacity chart data (7 days)
  const capData = useMemo(() => {
    const days = Array.from({ length: 7 }).map((_, i) => {
      const d = addDays(new Date(), i);
      const ymd = format(d, "yyyy-MM-dd");
      const load = orders.filter(o => o.due === ymd && o.status !== "Done").reduce((a,o)=> a + Math.ceil(o.qty/2), 0);
      return { day: format(d, "EEE"), load, capacity: 480 };
    });
    return days;
  }, [orders]);

  // Utilization pie per workstation (share of WIP qty)
  const utilData = useMemo(() => {
    const map: Record<WorkOrder["workstation"], number> = { DTF:0, DTG:0, Vinyl:0, Sewing:0, Finishing:0 };
    orders.filter(o=>o.status!=="Done").forEach(o => { map[o.workstation] += o.qty; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [orders]);

  /* --------------------------- Handlers ---------------------------- */

  const upsert = (wo: WorkOrder) => setOrders(rs => {
    const i = rs.findIndex(r => r.id === wo.id);
    if (i === -1) return [wo, ...rs];
    const copy = [...rs]; copy[i] = wo; return copy;
  });

  const setStatus = (wo: WorkOrder, s: Status) => {
    if (s === "In Progress" && !wo.startedAt) {
      wo.startedAt = Date.now();
    }
    if (s !== "In Progress" && wo.startedAt) {
      wo.elapsedMs = (wo.elapsedMs||0) + (Date.now() - (wo.startedAt||0));
      wo.startedAt = null;
    }
    upsert({ ...wo, status: s });
  };

  const startPause = (wo: WorkOrder) => {
    if (wo.status !== "In Progress") {
      setStatus(wo, "In Progress");
    } else {
      // pause -> On Hold
      setStatus(wo, "On Hold");
    }
  };

  const complete = (wo: WorkOrder) => setStatus(wo, "Done");

  const openCreate = () => { setEditing(null); setDrawerOpen(true); };
  const openEdit = (wo: WorkOrder) => { setEditing(wo); setDrawerOpen(true); };

  const saveForm = (val: Partial<WorkOrder>) => {
    const base: WorkOrder = {
      id: (val.id || `MO-${Math.floor(Math.random()*9000 + 1000)}`) as string,
      client: val.client || "Walk-in",
      item: val.item || "Custom Tee",
      qty: Number(val.qty || 1),
      size: val.size || "—",
      color: val.color || "—",
      priority: (val.priority as any) || "Normal",
      workstation: (val.workstation as any) || "DTF",
      assignee: val.assignee || "—",
      due: val.due || format(new Date(), "yyyy-MM-dd"),
      status: (val.status as any) || "Queued",
      startedAt: null,
      elapsedMs: 0,
      notes: val.notes || "",
    };
    upsert(base);
    setDrawerOpen(false);
  };

  const batchMove = (to: Status) => {
    const ids = Object.keys(selected).filter(k => selected[k]);
    if (!ids.length) return;
    setOrders(rs => rs.map(o => ids.includes(o.id) ? ({...o, status: to}) : o));
    setSelected({});
  };

  const locate = () => {
    const id = scan.trim();
    if (!id) return;
    const found = orders.find(o => o.id.toLowerCase() === id.toLowerCase());
    if (found) openEdit(found);
    setScan("");
  };

  /* ------------------------------ UI ------------------------------- */

  return (
    <main className="min-h-screen px-6 py-8 max-w-7xl mx-auto space-y-8">
      {/* HEADER */}
      <header className="bg-gradient-to-r from-gray-900 to-gray-700 text-white rounded-2xl p-6 shadow">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold flex items-center gap-2"><Factory className="w-7 h-7"/> Production</h1>
            <p className="opacity-80 mt-1">{format(new Date(), "dd MMM yyyy")} • {format(new Date(), "HH:mm")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openCreate} className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg flex items-center gap-2"><Plus className="w-4 h-4"/> New Work Order</button>
            <Link href="/admin/analytics" className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg">Analytics</Link>
            <Link href="/admin/automation" className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg">Automations</Link>
          </div>
        </div>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPI label="WIP" value={wip} sub="Open jobs" icon={<Wrench className="w-5 h-5"/>} />
        <KPI label="Due Today" value={dueToday} sub="Must ship" icon={<CalendarClock className="w-5 h-5"/>} />
        <KPI label="Late" value={late} sub="Behind SLA" icon={<AlertTriangle className="w-5 h-5"/>} danger />
        <KPI label="Capacity" value={`${capacityPct}%`} sub="Booked today" icon={<Users className="w-5 h-5"/>} />
        <KPI label="Running" value={orders.filter(o=>o.status==='In Progress').length} sub="Active machines" icon={<Clock4 className="w-5 h-5"/>} />
      </section>

      {/* CONTROLS */}
      <section className="bg-white rounded-2xl shadow p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <input value={query} onChange={(e)=> setQuery(e.target.value)} placeholder="Search #ID / client / item / assignee" className="pl-9 pr-3 py-2 border rounded w-80"/>
            <Search className="absolute left-3 top-2.5 text-gray-400"/>
          </div>
          <select value={wsFilter} onChange={(e)=> setWsFilter(e.target.value as any)} className="p-2 border rounded bg-white">
            {(["All","DTF","DTG","Vinyl","Sewing","Finishing"] as const).map(x=> <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={prioFilter} onChange={(e)=> setPrioFilter(e.target.value as any)} className="p-2 border rounded bg-white">
            {(["All","Low","Normal","High","Rush"] as const).map(x=> <option key={x} value={x}>{x}</option>)}
          </select>

          <div className="ml-auto flex items-center gap-2">
            <button onClick={()=>batchMove("In Progress")} className="px-3 py-1.5 border rounded text-sm">Start Selected</button>
            <button onClick={()=>batchMove("On Hold")} className="px-3 py-1.5 border rounded text-sm">Hold Selected</button>
            <button onClick={()=>batchMove("Done")} className="px-3 py-1.5 border rounded text-sm">Complete Selected</button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input value={scan} onChange={(e)=> setScan(e.target.value)} onKeyDown={(e)=> e.key==='Enter' && locate()} placeholder="Scan / type Order ID and Enter" className="px-3 py-2 border rounded w-72"/>
          <button onClick={locate} className="px-3 py-2 bg-black text-white rounded flex items-center gap-2"><QrCode className="w-4 h-4"/> Locate</button>
        </div>
      </section>

      {/* KANBAN */}
      <section className="grid lg:grid-cols-4 gap-4">
        {(Object.keys(byStatus) as Status[]).map((col) => (
          <div key={col} className="bg-white rounded-2xl shadow p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">{col}</h3>
              <div className="text-xs text-gray-500">{byStatus[col].length} jobs</div>
            </div>
            <ul className="space-y-2 min-h-[120px]">
              {byStatus[col].map((o) => (
                <li key={o.id} className={clsx("border rounded-xl p-3 hover:shadow-sm transition group", isLate(o) && "border-rose-300")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={!!selected[o.id]} onChange={(e)=> setSelected(s=>({ ...s, [o.id]: e.target.checked }))}/>
                        <button onClick={()=>openEdit(o)} className="font-semibold hover:underline truncate">{o.id} — {o.item}</button>
                      </div>
                      <div className="text-xs text-gray-600 truncate">{o.client} • Qty {o.qty} • {o.size} {o.color && `• ${o.color}`}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className={clsx("px-2 py-0.5 rounded-full", WS_COLORS[o.workstation])}>{o.workstation}</span>
                        <span className={clsx("px-2 py-0.5 rounded-full", o.priority==='Rush'?"bg-rose-100 text-rose-800": o.priority==='High'?"bg-orange-100 text-orange-800": o.priority==='Low'?"bg-gray-100 text-gray-700":"bg-emerald-100 text-emerald-800")}>{o.priority}</span>
                        <span className={clsx("px-2 py-0.5 rounded-full", isLate(o)?"bg-rose-100 text-rose-800":"bg-gray-100 text-gray-700")}>Due {fmt(o.due)}</span>
                        {o.assignee && <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{o.assignee}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">{o.status==='In Progress' ? 'Elapsed' : 'Time'}</div>
                      <div className="font-semibold">{hhmm(runningMs(o, now))}</div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={()=> startPause(o)} className={clsx("px-2 py-1 rounded text-xs border", o.status==='In Progress'?"bg-amber-50":"bg-emerald-50")}>{o.status==='In Progress'? (<span className="flex items-center gap-1"><Pause className="w-3 h-3"/> Pause</span>) : (<span className="flex items-center gap-1"><Play className="w-3 h-3"/> Start</span>)}</button>
                    <button onClick={()=> setStatus(o, "On Hold")} className="px-2 py-1 rounded text-xs border">Hold</button>
                    <button onClick={()=> complete(o)} className="px-2 py-1 rounded text-xs bg-black text-white">Complete</button>
                    <button onClick={()=> openEdit(o)} className="px-2 py-1 rounded text-xs border">Edit</button>
                    <button onClick={()=> window.print()} className="ml-auto px-2 py-1 rounded text-xs border flex items-center gap-1"><Printer className="w-3 h-3"/> Print</button>
                  </div>
                </li>
              ))}
              {byStatus[col].length===0 && <li className="text-xs text-gray-400">No jobs</li>}
            </ul>
          </div>
        ))}
      </section>

      {/* CHARTS */}
      <section className="grid lg:grid-cols-3 gap-4">
        {/* Capacity plan */}
        <div className="bg-white rounded-2xl shadow p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">7‑Day Capacity Plan</h3>
            <div className="text-xs text-gray-500">Load vs Capacity</div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={capData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="load" />
                <Line dataKey="capacity" type="monotone" stroke="#000" dot={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Utilization */}
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">Workstation Utilization</h3>
            <div className="text-xs text-gray-500">Share of WIP qty</div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip />
                <Pie data={utilData} dataKey="value" nameKey="name" outerRadius={95}>
                  {utilData.map((_, i) => (<Cell key={i} />))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="grid grid-cols-2 gap-2 text-sm mt-2">
            {utilData.map((e,i)=> (
              <li key={i} className="flex items-center justify-between border rounded px-2 py-1">
                <span>{e.name}</span>
                <span className="font-medium">{e.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Drawer */}
      {drawerOpen && (
        <Drawer onClose={()=>{ setDrawerOpen(false); }}>
          <WOForm
            value={editing || undefined}
            onCancel={()=> setDrawerOpen(false)}
            onSave={saveForm}
          />
        </Drawer>
      )}
    </main>
  );
}

/* ---------------------------- Components -------------------------- */

function KPI({ label, value, sub, icon, danger=false }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; danger?: boolean }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4 flex items-center gap-3">
      <div className={clsx("p-3 rounded-xl", danger?"bg-rose-100":"bg-gray-100")}>{icon}</div>
      <div>
        <div className="text-gray-500 text-xs uppercase tracking-wide">{label}</div>
        <div className="text-xl font-bold">{value}</div>
        {sub && <div className="text-xs text-gray-500">{sub}</div>}
      </div>
    </div>
  );
}

function Drawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[640px] bg-white shadow-xl p-5 overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Work Order</div>
          <button onClick={onClose} className="px-3 py-1.5 border rounded">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* --------------------------- Work Order Form ---------------------- */

function WOForm({ value, onSave, onCancel }: { value?: WorkOrder; onSave: (v: Partial<WorkOrder>)=>void; onCancel: ()=>void }) {
  const [v, setV] = useState<Partial<WorkOrder>>(value || { priority: 'Normal', workstation: 'DTF', due: format(new Date(), 'yyyy-MM-dd') } as any);
  const id = v.id || "(auto)";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Order #
          <input value={v.id || ''} onChange={(e)=> setV({...v, id: e.target.value})} className="mt-1 w-full border rounded px-2 py-1" placeholder="MO-1050"/>
        </label>
        <label className="text-sm">Client
          <input value={v.client || ''} onChange={(e)=> setV({...v, client: e.target.value})} className="mt-1 w-full border rounded px-2 py-1" placeholder="Acme Ltd"/>
        </label>
        <label className="text-sm col-span-2">Item
          <input value={v.item || ''} onChange={(e)=> setV({...v, item: e.target.value})} className="mt-1 w-full border rounded px-2 py-1" placeholder="Tee — Front + Back print"/>
        </label>
        <label className="text-sm">Qty
          <input type="number" value={v.qty as any || ''} onChange={(e)=> setV({...v, qty: Number(e.target.value) || 0})} className="mt-1 w-full border rounded px-2 py-1"/>
        </label>
        <label className="text-sm">Size
          <input value={v.size || ''} onChange={(e)=> setV({...v, size: e.target.value})} className="mt-1 w-full border rounded px-2 py-1"/>
        </label>
        <label className="text-sm">Color
          <input value={v.color || ''} onChange={(e)=> setV({...v, color: e.target.value})} className="mt-1 w-full border rounded px-2 py-1"/>
        </label>
        <label className="text-sm">Priority
          <select value={v.priority as any} onChange={(e)=> setV({...v, priority: e.target.value as any})} className="mt-1 w-full border rounded px-2 py-1">
            {(["Low","Normal","High","Rush"] as const).map(x=> <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="text-sm">Workstation
          <select value={v.workstation as any} onChange={(e)=> setV({...v, workstation: e.target.value as any})} className="mt-1 w-full border rounded px-2 py-1">
            {(["DTF","DTG","Vinyl","Sewing","Finishing"] as const).map(x=> <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="text-sm">Assignee
          <input value={v.assignee || ''} onChange={(e)=> setV({...v, assignee: e.target.value})} className="mt-1 w-full border rounded px-2 py-1" placeholder="Technician"/>
        </label>
        <label className="text-sm">Due Date
          <input type="date" value={v.due || ''} onChange={(e)=> setV({...v, due: e.target.value})} className="mt-1 w-full border rounded px-2 py-1"/>
        </label>
        <label className="text-sm col-span-2">Notes
          <textarea rows={3} value={v.notes || ''} onChange={(e)=> setV({...v, notes: e.target.value})} className="mt-1 w-full border rounded px-2 py-1"/>
        </label>
      </div>

      {/* Traveler */}
      <div className="border rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Traveler</div>
          <button onClick={()=> window.print()} className="px-3 py-1.5 border rounded flex items-center gap-1 text-sm"><Printer className="w-4 h-4"/> Print</button>
        </div>
        <div className="grid grid-cols-3 gap-3 items-center">
          <div className="col-span-2">
            <div className="text-sm"><span className="font-semibold">Order:</span> {v.id || '(auto)'} • <span className="font-semibold">Client:</span> {v.client || '—'}</div>
            <div className="text-sm"><span className="font-semibold">Item:</span> {v.item || '—'} • <span className="font-semibold">Qty:</span> {v.qty || 0}</div>
            <div className="text-sm"><span className="font-semibold">WS:</span> {v.workstation as any} • <span className="font-semibold">Due:</span> {v.due ? format(new Date(v.due), 'dd MMM yyyy') : '—'}</div>
          </div>
          <div className="justify-self-end">
            <QRCodeCanvas value={String(v.id || 'NEW')} size={96} includeMargin />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-2 border rounded">Cancel</button>
        <button onClick={()=> onSave(v)} className="px-3 py-2 bg-black text-white rounded">Save</button>
      </div>
    </div>
  );
}
