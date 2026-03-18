"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { format, addDays } from "date-fns";
import {
  ArchiveRestore,
  BadgeAlert,
  BadgeCheck,
  Box,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CloudUpload,
  Coins,
  CreditCard,
  Download,
  FileText,
  Filter,
  PackageOpen,
  Plus,
  Printer,
  RefreshCcw,
  Replace,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  Undo2,
  XCircle,
} from "lucide-react";

/*
  RETURNS (RMA) PAGE — Next.js Client Component
  ------------------------------------------------
  Goals
  - Create/manage RMAs (refund / exchange / repair)
  - QC workflow: Received → Inspect → Decision → Close
  - Restock, fees, refunds, replacements
  - Evidence upload (mocked), printable slip, export CSV
  - Filters, search, pagination, batch actions

  NOTE: This is front‑end only with mock data. Replace the data layer with Firestore later.
*/

/* ------------------------------- Types ------------------------------ */

type RMAStatus =
  | "Requested"
  | "Approved"
  | "In Transit"
  | "Received"
  | "QC Passed"
  | "QC Failed"
  | "Refunded"
  | "Exchanged"
  | "Closed";

type ReturnReason =
  | "Defective"
  | "Wrong Size"
  | "Wrong Item"
  | "Quality Issue"
  | "Changed Mind"
  | "Other";

type ResolutionType = "Refund" | "Exchange" | "Repair" | "Store Credit";

const STATUS_OPTIONS = [
  "Requested",
  "Approved",
  "In Transit",
  "Received",
  "QC Passed",
  "QC Failed",
  "Refunded",
  "Exchanged",
  "Closed",
] as const satisfies readonly RMAStatus[];

const REASON_OPTIONS = [
  "Defective",
  "Wrong Size",
  "Wrong Item",
  "Quality Issue",
  "Changed Mind",
  "Other",
] as const satisfies readonly ReturnReason[];

const RESOLUTION_OPTIONS = ["Refund", "Exchange", "Repair", "Store Credit"] as const satisfies readonly ResolutionType[];

export type RMA = {
  id: string;
  orderId: string;
  customer: string;
  email?: string;
  phone?: string;
  item: string;
  sku?: string;
  qty: number;
  size?: string;
  color?: string;
  reason: ReturnReason;
  notes?: string;
  status: RMAStatus;
  resolution: ResolutionType;
  createdAt: string; // yyyy-mm-dd
  updatedAt: string; // yyyy-mm-dd
  receivedAt?: string;
  refundAmount?: number;
  restockFee?: number; // % or fixed — we treat as fixed amount here
  pictures?: string[]; // object URLs
  exchangeItem?: { item: string; sku?: string; size?: string; color?: string } | null;
  qcChecklist?: { label: string; ok: boolean }[];
  history?: { at: string; text: string }[]; // timeline
};

/* --------------------------- Mock Data ----------------------------- */

const today = format(new Date(), "yyyy-MM-dd");
const y = format(addDays(new Date(), -1), "yyyy-MM-dd");

const seed: RMA[] = [
  {
    id: "RMA-23041",
    orderId: "SO-1012",
    customer: "Samiya B.",
    email: "samiya@example.com",
    item: "Tee — Summer Drop",
    sku: "TEE-SUM-BLK-M",
    qty: 1,
    size: "M",
    color: "Black",
    reason: "Wrong Size",
    status: "Requested",
    resolution: "Exchange",
    createdAt: y,
    updatedAt: y,
    pictures: [],
    qcChecklist: [
      { label: "No wear marks", ok: false },
      { label: "Tags attached", ok: false },
      { label: "No stains", ok: false },
    ],
    history: [{ at: y, text: "Request created by customer" }],
  },
  {
    id: "RMA-23042",
    orderId: "SO-1015",
    customer: "Imran K.",
    email: "imran@example.com",
    item: "Hoodie — Merch",
    sku: "HOOD-MER-GRY-L",
    qty: 1,
    size: "L",
    color: "Grey",
    reason: "Defective",
    status: "Received",
    resolution: "Refund",
    createdAt: y,
    updatedAt: today,
    receivedAt: today,
    pictures: [],
    refundAmount: 1490,
    restockFee: 0,
    qcChecklist: [
      { label: "Zipper functional", ok: true },
      { label: "Seams intact", ok: false },
      { label: "No stains", ok: true },
    ],
    history: [
      { at: y, text: "Approved by staff" },
      { at: today, text: "Package received" },
    ],
  },
  {
    id: "RMA-23043",
    orderId: "SO-1021",
    customer: "Lydia A.",
    email: "lydia@example.com",
    item: "Polo — Corporate",
    sku: "POLO-COR-NAV-XL",
    qty: 3,
    size: "XL",
    color: "Navy",
    reason: "Changed Mind",
    status: "Approved",
    resolution: "Store Credit",
    createdAt: y,
    updatedAt: today,
    pictures: [],
    restockFee: 150,
    qcChecklist: [
      { label: "Unworn", ok: false },
      { label: "Tags attached", ok: false },
      { label: "Packaging intact", ok: false },
    ],
    history: [{ at: y, text: "Approved by staff" }],
  },
];

/* ---------------------------- Utilities ---------------------------- */

const money = (n: number | undefined) => (n == null ? "—" : `Rs ${n.toLocaleString()}`);

function buildSelectedMap(rows: RMA[], checked: boolean) {
  return rows.reduce<Record<string, boolean>>((acc, row) => {
    acc[row.id] = checked;
    return acc;
  }, {});
}

function badgeForStatus(s: RMAStatus) {
  switch (s) {
    case "Requested":
      return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">Requested</span>;
    case "Approved":
      return <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">Approved</span>;
    case "In Transit":
      return <span className="px-2 py-0.5 rounded-full text-xs bg-sky-50 text-sky-700">In Transit</span>;
    case "Received":
      return <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700">Received</span>;
    case "QC Passed":
      return <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800">QC Passed</span>;
    case "QC Failed":
      return <span className="px-2 py-0.5 rounded-full text-xs bg-rose-100 text-rose-800">QC Failed</span>;
    case "Refunded":
      return <span className="px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700">Refunded</span>;
    case "Exchanged":
      return <span className="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700">Exchanged</span>;
    case "Closed":
      return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-200 text-gray-800">Closed</span>;
  }
}

/* --------------------------- Page Component ------------------------ */

export default function ReturnsPage() {
  const [rows, setRows] = useState<RMA[]>(seed);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"All" | RMAStatus>("All");
  const [reason, setReason] = useState<"All" | ReturnReason>("All");
  const [resolution, setResolution] = useState<"All" | ResolutionType>("All");
  const [page, setPage] = useState(1);
  const PAGE = 8;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<RMA | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    let list = rows;
    if (status !== "All") list = list.filter(r => r.status === status);
    if (reason !== "All") list = list.filter(r => r.reason === reason);
    if (resolution !== "All") list = list.filter(r => r.resolution === resolution);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter(r => [r.id, r.orderId, r.customer, r.item, r.email].join(" ").toLowerCase().includes(s));
    }
    return list;
  }, [rows, status, reason, resolution, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const slice = filtered.slice((page - 1) * PAGE, page * PAGE);

  // KPIs
  const openCount = rows.filter(r => !["Refunded","Exchanged","Closed"].includes(r.status)).length;
  const qcPending = rows.filter(r => r.status === "Received").length;
  const refundDue = rows.filter(r => r.status === "QC Passed" && r.resolution === "Refund").length;
  const exchangeDue = rows.filter(r => r.status === "QC Passed" && r.resolution === "Exchange").length;

  /* ------------------------------ Actions -------------------------- */

  const upsert = (rma: RMA) => setRows(prev => {
    const i = prev.findIndex(r => r.id === rma.id);
    if (i === -1) return [rma, ...prev];
    const copy = [...prev]; copy[i] = rma; return copy;
  });

  const create = () => { setEditing(null); setDrawerOpen(true); };
  const edit = (r: RMA) => { setEditing(r); setDrawerOpen(true); };

  const save = (patch: Partial<RMA>) => {
    const base: RMA = {
      id: patch.id || `RMA-${Math.floor(Math.random()*90000+10000)}`,
      orderId: patch.orderId || "SO-0000",
      customer: patch.customer || "Walk-in",
      email: patch.email || "",
      phone: patch.phone || "",
      item: patch.item || "Tee",
      sku: patch.sku || "",
      qty: Number(patch.qty || 1),
      size: patch.size || "—",
      color: patch.color || "—",
      reason: patch.reason || "Other",
      notes: patch.notes || "",
      status: patch.status || "Requested",
      resolution: patch.resolution || "Refund",
      createdAt: patch.createdAt || today,
      updatedAt: today,
      receivedAt: patch.receivedAt,
      refundAmount: patch.refundAmount || 0,
      restockFee: patch.restockFee || 0,
      pictures: patch.pictures || [],
      exchangeItem: patch.exchangeItem || null,
      qcChecklist: patch.qcChecklist || [
        { label: "Unworn", ok: false },
        { label: "Tags attached", ok: false },
        { label: "No stains", ok: false },
      ],
      history: patch.history || [{ at: today, text: "RMA created" }],
    };
    upsert(base);
    setDrawerOpen(false);
  };

  const remove = (r: RMA) => {
    if (!confirm(`Delete ${r.id}?`)) return;
    setRows(prev => prev.filter(x => x.id !== r.id));
  };

  const bulkStatus = (to: RMAStatus) => {
    const ids = Object.keys(selected).filter(k => selected[k]);
    if (!ids.length) return;
    setRows(prev => prev.map(r => ids.includes(r.id) ? { ...r, status: to, updatedAt: today, history: [...(r.history||[]), { at: today, text: `Bulk -> ${to}` }] } : r));
    setSelected({});
  };

  function exportCSV() {
    const cols = [
      "id","orderId","customer","email","phone","item","sku","qty","size","color","reason","status","resolution","createdAt","updatedAt","refundAmount","restockFee",
    ] as const satisfies readonly (keyof RMA)[];
    const lines = [cols.join(",")].concat(filtered.map((row) => cols.map((key) => JSON.stringify(row[key] ?? "")).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `returns_${today}.csv`;
    a.click();
  }

  /* ------------------------------- UI ------------------------------ */

  return (
    <main className="min-h-screen px-6 py-8 max-w-7xl mx-auto space-y-8">
      {/* HEADER */}
      <header className="bg-gradient-to-r from-gray-900 to-gray-700 text-white rounded-2xl p-6 shadow">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold flex items-center gap-2"><PackageOpen className="w-7 h-7"/> Returns</h1>
            <p className="opacity-80 mt-1">Create RMAs, inspect items, and close with refund or exchange</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={create} className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg flex items-center gap-2"><Plus className="w-4 h-4"/> New RMA</button>
            <button onClick={exportCSV} className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg flex items-center gap-2"><Download className="w-4 h-4"/> Export CSV</button>
          </div>
        </div>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPI label="Open" value={openCount} sub="Active RMAs" icon={<ClipboardList className="w-5 h-5"/>} />
        <KPI label="QC Pending" value={qcPending} sub="Awaiting inspection" icon={<BadgeAlert className="w-5 h-5"/>} danger />
        <KPI label="Refunds Due" value={refundDue} sub="Ready to pay" icon={<CreditCard className="w-5 h-5"/>} />
        <KPI label="Exchanges Due" value={exchangeDue} sub="Ship replacements" icon={<Replace className="w-5 h-5"/>} />
        <KPI label="This Month" value={`Rs ${rows.reduce((a,r)=> a + (r.refundAmount||0),0).toLocaleString()}`} sub="Refunded total" icon={<Coins className="w-5 h-5"/>} />
      </section>

      {/* FILTERS */}
      <section className="bg-white rounded-2xl shadow p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <input value={q} onChange={(e)=> setQ(e.target.value)} placeholder="Search RMA / Order / Customer / Item" className="pl-9 pr-3 py-2 border rounded w-96"/>
            <Search className="absolute left-3 top-2.5 text-gray-400"/>
          </div>
          <select value={status} onChange={(e)=> { setStatus(e.target.value as "All" | RMAStatus); setPage(1); }} className="p-2 border rounded bg-white">
            {(["All", ...STATUS_OPTIONS] as const).map(x=> <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={reason} onChange={(e)=> { setReason(e.target.value as "All" | ReturnReason); setPage(1); }} className="p-2 border rounded bg-white">
            {(["All", ...REASON_OPTIONS] as const).map(x=> <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={resolution} onChange={(e)=> { setResolution(e.target.value as "All" | ResolutionType); setPage(1); }} className="p-2 border rounded bg-white">
            {(["All", ...RESOLUTION_OPTIONS] as const).map(x=> <option key={x} value={x}>{x}</option>)}
          </select>

          <div className="ml-auto flex items-center gap-2">
            <button onClick={()=>bulkStatus("Approved")} className="px-3 py-1.5 border rounded text-sm">Approve</button>
            <button onClick={()=>bulkStatus("Received")} className="px-3 py-1.5 border rounded text-sm">Mark Received</button>
            <button onClick={()=>bulkStatus("Closed")} className="px-3 py-1.5 border rounded text-sm">Close</button>
          </div>
        </div>
      </section>

      {/* TABLE */}
      <section className="bg-white rounded-2xl shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="py-2 px-3 text-left"><input type="checkbox" onChange={(e)=> setSelected(buildSelectedMap(slice, e.target.checked))}/></th>
                <th className="py-2 px-3 text-left">RMA</th>
                <th className="py-2 px-3 text-left">Order</th>
                <th className="py-2 px-3 text-left">Customer</th>
                <th className="py-2 px-3 text-left">Item</th>
                <th className="py-2 px-3 text-left">Reason</th>
                <th className="py-2 px-3 text-left">Status</th>
                <th className="py-2 px-3 text-left">Resolution</th>
                <th className="py-2 px-3 text-right">Refund</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.map(r => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3"><input type="checkbox" checked={!!selected[r.id]} onChange={(e)=> setSelected(s=>({ ...s, [r.id]: e.target.checked }))}/></td>
                  <td className="py-2 px-3"><button onClick={()=>edit(r)} className="text-blue-600 hover:underline font-medium">{r.id}</button></td>
                  <td className="py-2 px-3">{r.orderId}</td>
                  <td className="py-2 px-3">{r.customer}</td>
                  <td className="py-2 px-3">{r.item} ×{r.qty}</td>
                  <td className="py-2 px-3">{r.reason}</td>
                  <td className="py-2 px-3">{badgeForStatus(r.status)}</td>
                  <td className="py-2 px-3">{r.resolution}</td>
                  <td className="py-2 px-3 text-right">{money(r.refundAmount)}</td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={()=>edit(r)} className="px-2 py-1 border rounded text-xs">Open</button>
                      <button onClick={()=>remove(r)} className="px-2 py-1 border rounded text-xs text-rose-600">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {slice.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-gray-500">No results</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between p-3">
          <div className="text-xs text-gray-500">{filtered.length} result(s)</div>
          <div className="flex items-center gap-2">
            <button disabled={page<=1} onClick={()=> setPage(p=> Math.max(1, p-1))} className="px-2 py-1 border rounded disabled:opacity-50"><ChevronLeft className="w-4 h-4"/></button>
            <div className="text-sm">Page {page} / {pages}</div>
            <button disabled={page>=pages} onClick={()=> setPage(p=> Math.min(pages, p+1))} className="px-2 py-1 border rounded disabled:opacity-50"><ChevronRight className="w-4 h-4"/></button>
          </div>
        </div>
      </section>

      {/* Drawer */}
      {drawerOpen && (
        <Drawer onClose={()=> setDrawerOpen(false)}>
          <RMAForm value={editing || undefined} onCancel={()=> setDrawerOpen(false)} onSave={save} />
        </Drawer>
      )}
    </main>
  );
}

/* ------------------------------ Components ------------------------- */

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
      <div className="absolute right-0 top-0 h-full w-full sm:w-[720px] bg-white shadow-xl p-5 overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Return (RMA)</div>
          <button onClick={onClose} className="px-3 py-1.5 border rounded">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------ RMA Form --------------------------- */

function RMAForm({ value, onSave, onCancel }: { value?: RMA; onSave: (v: Partial<RMA>)=>void; onCancel: ()=>void }) {
  const [v, setV] = useState<Partial<RMA>>(value || { status: 'Requested', resolution: 'Refund', createdAt: format(new Date(), 'yyyy-MM-dd') });

  const addPic = async (file: File) => {
    const url = URL.createObjectURL(file);
    setV(s => ({ ...s, pictures: [...(s.pictures||[]), url] }));
  };

  const toggleQC = (i: number) => {
    setV(s => ({ ...s, qcChecklist: (s.qcChecklist||[]).map((c, idx)=> idx===i ? { ...c, ok: !c.ok } : c) }));
  };

  const totalRefund = useMemo(() => {
    const amount = Number(v.refundAmount || 0);
    const fee = Number(v.restockFee || 0);
    return Math.max(0, amount - fee);
  }, [v.refundAmount, v.restockFee]);

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">RMA #
          <input value={v.id || ''} onChange={(e)=> setV({...v, id: e.target.value})} className="mt-1 w-full border rounded px-2 py-1" placeholder="RMA-23051"/>
        </label>
        <label className="text-sm">Order #
          <input value={v.orderId || ''} onChange={(e)=> setV({...v, orderId: e.target.value})} className="mt-1 w-full border rounded px-2 py-1" placeholder="SO-1050"/>
        </label>
        <label className="text-sm">Customer
          <input value={v.customer || ''} onChange={(e)=> setV({...v, customer: e.target.value})} className="mt-1 w-full border rounded px-2 py-1" placeholder="Jane Doe"/>
        </label>
        <label className="text-sm">Email
          <input type="email" value={v.email || ''} onChange={(e)=> setV({...v, email: e.target.value})} className="mt-1 w-full border rounded px-2 py-1" placeholder="jane@ex.com"/>
        </label>
        <label className="text-sm">Phone
          <input value={v.phone || ''} onChange={(e)=> setV({...v, phone: e.target.value})} className="mt-1 w-full border rounded px-2 py-1" placeholder="5X XX XX XX"/>
        </label>
      </div>

      {/* Item */}
      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm col-span-2">Item
          <input value={v.item || ''} onChange={(e)=> setV({...v, item: e.target.value})} className="mt-1 w-full border rounded px-2 py-1" placeholder="Tee — Front print"/>
        </label>
        <label className="text-sm">SKU
          <input value={v.sku || ''} onChange={(e)=> setV({...v, sku: e.target.value})} className="mt-1 w-full border rounded px-2 py-1" placeholder="TEE-BLK-M"/>
        </label>
        <label className="text-sm">Qty
          <input type="number" value={v.qty ?? ''} onChange={(e)=> setV({...v, qty: Number(e.target.value)||0})} className="mt-1 w-full border rounded px-2 py-1"/>
        </label>
        <label className="text-sm">Size
          <input value={v.size || ''} onChange={(e)=> setV({...v, size: e.target.value})} className="mt-1 w-full border rounded px-2 py-1"/>
        </label>
        <label className="text-sm">Color
          <input value={v.color || ''} onChange={(e)=> setV({...v, color: e.target.value})} className="mt-1 w-full border rounded px-2 py-1"/>
        </label>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm">Reason
          <select value={v.reason || 'Other'} onChange={(e)=> setV({...v, reason: e.target.value as ReturnReason})} className="mt-1 w-full border rounded px-2 py-1">
            {REASON_OPTIONS.map(x=> <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="text-sm">Status
          <select value={v.status || 'Requested'} onChange={(e)=> setV({...v, status: e.target.value as RMAStatus})} className="mt-1 w-full border rounded px-2 py-1">
            {STATUS_OPTIONS.map(x=> <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="text-sm">Resolution
          <select value={v.resolution || 'Refund'} onChange={(e)=> setV({...v, resolution: e.target.value as ResolutionType})} className="mt-1 w-full border rounded px-2 py-1">
            {RESOLUTION_OPTIONS.map(x=> <option key={x}>{x}</option>)}
          </select>
        </label>
      </div>

      {/* Money */}
      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm">Refund Amount (Rs)
          <input type="number" value={v.refundAmount ?? ''} onChange={(e)=> setV({...v, refundAmount: Number(e.target.value)||0})} className="mt-1 w-full border rounded px-2 py-1"/>
        </label>
        <label className="text-sm">Restock Fee (Rs)
          <input type="number" value={v.restockFee ?? ''} onChange={(e)=> setV({...v, restockFee: Number(e.target.value)||0})} className="mt-1 w-full border rounded px-2 py-1"/>
        </label>
        <div className="text-sm">
          <div className="font-medium">Net to Refund</div>
          <div className="mt-2 text-xl font-bold">{money(totalRefund)}</div>
        </div>
      </div>

      {/* Exchange Item */}
      {v.resolution === 'Exchange' && (
        <div className="border rounded-xl p-3">
          <div className="font-semibold mb-2">Replacement Item</div>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-sm col-span-2">Item
              <input value={v.exchangeItem?.item || ''} onChange={(e)=> setV({...v, exchangeItem: { ...(v.exchangeItem||{}), item: e.target.value }})} className="mt-1 w-full border rounded px-2 py-1" placeholder="Polo — Navy"/>
            </label>
            <label className="text-sm">SKU
              <input value={v.exchangeItem?.sku || ''} onChange={(e)=> setV({...v, exchangeItem: { item: v.exchangeItem?.item ?? '', sku: e.target.value, size: v.exchangeItem?.size, color: v.exchangeItem?.color }})} className="mt-1 w-full border rounded px-2 py-1"/>
            </label>
            <label className="text-sm">Size
              <input value={v.exchangeItem?.size || ''} onChange={(e)=> setV({...v, exchangeItem: { item: v.exchangeItem?.item ?? '', sku: v.exchangeItem?.sku, size: e.target.value, color: v.exchangeItem?.color }})} className="mt-1 w-full border rounded px-2 py-1"/>
            </label>
            <label className="text-sm">Color
              <input value={v.exchangeItem?.color || ''} onChange={(e)=> setV({...v, exchangeItem: { item: v.exchangeItem?.item ?? '', sku: v.exchangeItem?.sku, size: v.exchangeItem?.size, color: e.target.value }})} className="mt-1 w-full border rounded px-2 py-1"/>
            </label>
          </div>
        </div>
      )}

      {/* QC Checklist */}
      <div className="border rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">QC Checklist</div>
          <button onClick={()=> setV(s=> ({...s, qcChecklist: [...(s.qcChecklist||[]), { label: 'Custom check', ok: false }]}))} className="px-2 py-1 text-xs border rounded">+ Add check</button>
        </div>
        <ul className="space-y-2">
          {(v.qcChecklist||[]).map((c,i)=> (
            <li key={i} className="flex items-center gap-2">
              <input type="checkbox" checked={!!c.ok} onChange={()=> toggleQC(i)} />
              <input value={c.label} onChange={(e)=> setV(s=> ({...s, qcChecklist: (s.qcChecklist||[]).map((x,idx)=> idx===i? {...x, label:e.target.value}: x)}))} className="flex-1 border rounded px-2 py-1 text-sm"/>
            </li>
          ))}
          {(v.qcChecklist||[]).length===0 && <li className="text-sm text-gray-500">No checks. Add some.</li>}
        </ul>
      </div>

      {/* Evidence */}
      <div className="border rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Evidence</div>
          <label className="px-2 py-1 border rounded text-xs cursor-pointer flex items-center gap-1"><CloudUpload className="w-3 h-3"/> Upload<input type="file" accept="image/*" hidden onChange={(e)=> e.target.files && addPic(e.target.files[0])} /></label>
        </div>
        {v.pictures && v.pictures.length>0 ? (
          <div className="grid grid-cols-3 gap-2">
            {v.pictures.map((src, i)=> (
              <div key={i} className="relative group">
                <img src={src} alt={`Return evidence ${i + 1}`} className="w-full h-24 object-cover rounded"/>
                <button onClick={()=> setV(s=> ({...s, pictures: (s.pictures||[]).filter((_,idx)=> idx!==i)}))} className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded opacity-0 group-hover:opacity-100"><XCircle className="w-4 h-4"/></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">No files uploaded.</div>
        )}
      </div>

      {/* Notes & Timeline */}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm col-span-1">Notes
          <textarea rows={4} value={v.notes || ''} onChange={(e)=> setV({...v, notes: e.target.value})} className="mt-1 w-full border rounded px-2 py-1"/>
        </label>
        <div className="text-sm col-span-1">
          <div className="font-semibold mb-2">Timeline</div>
          <ul className="space-y-1">
            {(v.history||[]).map((h,i)=> (
              <li key={i} className="text-xs text-gray-600"><span className="font-medium">{format(new Date(h.at), 'dd MMM, HH:mm')}</span> — {h.text}</li>
            ))}
            {(v.history||[]).length===0 && <li className="text-xs text-gray-500">No events yet.</li>}
          </ul>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-2 border rounded">Cancel</button>
        <button onClick={()=> onSave(v)} className="px-3 py-2 bg-black text-white rounded">Save</button>
      </div>
    </div>
  );
}
