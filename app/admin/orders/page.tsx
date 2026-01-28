"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  doc,
  getDoc,
  runTransaction,
  updateDoc,
  deleteDoc,
  Query,
  QueryDocumentSnapshot,
  DocumentData,
  Timestamp,
  QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  FiSearch,
  FiPrinter,
  FiCheckCircle,
  FiTrash2,
  FiRefreshCw,
  FiDollarSign,
  FiClock,
  FiUsers,
  FiTrendingUp,
  FiShield,
} from "react-icons/fi";
import jsPDF from "jspdf";

type ProductLine = {
  product: string;
  color?: string;
  size?: string;
  quantity: number;
  unitPrice?: number;
  price?: number;
};

type Txn = {
  invoiceNumber?: string;
  customerName?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  transactionDate?: Timestamp;
  status?: "In Process" | "Urgent" | "Completed" | "Pending" | string;
  paymentMethod?: "Full Payment" | "Part Payment" | string;
  products?: ProductLine[];
  amount?: number;
};

const PAGE_SIZE = 20;
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin";

function OrdersPageInner() {
  const searchParams = useSearchParams();
  // filters / ui
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [paymentFilter, setPaymentFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>(""); // yyyy-mm-dd
  const [dateTo, setDateTo] = useState<string>(""); // yyyy-mm-dd
  const [activeTab, setActiveTab] = useState<"all" | "completed">("all");

  // list + paging
  const [rows, setRows] = useState<QueryDocumentSnapshot<DocumentData>[]>([]);
  const [lastDocSnap, setLastDocSnap] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // summary
  const [summary, setSummary] = useState({
    todayRevenue: 0,
    pendingOrders: 0,
    deliveredToday: 0,
    repeatClients: 0,
    efficiencyValue: 0,
  });

  // local UI overrides (e.g., status/payment changed without refetch)
  const [overrides, setOverrides] = useState<Record<string, Partial<Txn>>>({});

  // per-row expand state
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editTxnId, setEditTxnId] = useState<string | null>(null);
  const [editIndex, setEditIndex] = useState<number>(-1);
  const [editValue, setEditValue] = useState<ProductLine | null>(null);

  // toast
  const [toast, setToast] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(t: { type: "ok" | "err"; text: string }) {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current!);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  // debounce search
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim().toLowerCase()), 350);
    return () => clearTimeout(id);
  }, [search]);

  const formatIsoDate = (date: Date) => date.toISOString().slice(0, 10);
  const applyQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    if (days > 0) start.setDate(end.getDate() - (days - 1));
    setDateFrom(formatIsoDate(start));
    setDateTo(formatIsoDate(end));
  };

  const activeFilters = useMemo(() => {
    const list: string[] = [];
    if (search.trim()) list.push(`Search: ${search.trim()}`);
    if (statusFilter) list.push(`Status: ${statusFilter}`);
    if (paymentFilter) list.push(`Payment: ${paymentFilter}`);
    if (dateFrom || dateTo) {
      const from = dateFrom || "Any";
      const to = dateTo || "Any";
      list.push(`Dates: ${from} → ${to}`);
    }
    if (activeTab === "completed") list.push("Tab: Completed");
    return list;
  }, [search, statusFilter, paymentFilter, dateFrom, dateTo, activeTab]);

  // initialize filters from URL (status, range)
  useEffect(() => {
    const s = searchParams?.get("status");
    const range = searchParams?.get("range");
    if (s) setStatusFilter(s);
    if (range === "today") {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const iso = `${yyyy}-${mm}-${dd}`;
      setDateFrom(iso);
      setDateTo(iso);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // initial + whenever filters change
  useEffect(() => {
    (async () => {
      setLoading(true);
      setRows([]);
      setLastDocSnap(null);
      setHasMore(true);
      await loadMore(true);
      setLoading(false);
      fetchSummaryApprox();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, statusFilter, paymentFilter, dateFrom, dateTo, activeTab]);

  async function loadMore(reset = false) {
    if (!hasMore && !reset) return;
    setLoadingMore(true);
    try {
      const q = buildQuery(reset);
      const snap = await getDocs(q);
      const docs = snap.docs;

      if (reset) {
        setRows(docs);
      } else {
        setRows((prev) => [...prev, ...docs]);
      }

      if (docs.length < PAGE_SIZE) setHasMore(false);
      setLastDocSnap(docs.length ? docs[docs.length - 1] : null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Load failed";
      showToast({ type: "err", text: msg });
    } finally {
      setLoadingMore(false);
    }
  }

  function buildQuery(reset: boolean): Query<DocumentData> {
    const col = collection(db, "transactions");
    const parts: QueryConstraint[] = [orderBy("transactionDate", "desc")];

    // server-side filters possible for status / payment
    if (statusFilter) parts.push(where("status", "==", statusFilter));
    if (paymentFilter) parts.push(where("paymentMethod", "==", paymentFilter));

    // date range (if set)
    if (dateFrom) {
      parts.push(
        where("transactionDate", ">=", Timestamp.fromDate(new Date(dateFrom)))
      );
    }
    if (dateTo) {
      // include end day
      const end = new Date(dateTo);
      end.setDate(end.getDate() + 1);
      parts.push(where("transactionDate", "<", Timestamp.fromDate(end)));
    }

    // base query with limit
    if (!reset && lastDocSnap) {
      return query(col, ...parts, startAfter(lastDocSnap), limit(PAGE_SIZE));
    }
    return query(col, ...parts, limit(PAGE_SIZE));
  }

  // client-side filter for search + tab
  const visibleRows = useMemo(() => {
    const filtered = rows.filter((d) => {
      const m = d.data() as Txn;
      const matchesTab = activeTab === "all" ? true : m.status === "Completed";
      if (!matchesTab) return false;
      if (!debounced) return true;
      const bag = `${m.customerName ?? ""} ${m.phoneNumber ?? ""} ${
        m.email ?? ""
      }`.toLowerCase();
      return bag.includes(debounced);
    });
    return filtered;
  }, [rows, debounced, activeTab]);

  // summary (approx: last 100 docs)
  async function fetchSummaryApprox() {
    try {
      const snap = await getDocs(
        query(
          collection(db, "transactions"),
          orderBy("transactionDate", "desc"),
          limit(100)
        )
      );
      let rev = 0,
        pending = 0,
        deliveredToday = 0,
        completed = 0,
        total = 0;
      const clients = new Set<string>();
      const todayStr = new Date().toISOString().slice(0, 10);

      snap.forEach((d) => {
        const m = d.data() as Txn;
        const amount =
          typeof m.amount === "number"
            ? m.amount
            : Array.isArray(m.products)
            ? m.products.reduce((s: number, p: ProductLine) => s + (p.price || 0), 0)
            : 0;
        rev += amount;

        if (m.status === "Pending") pending++;
        if (m.status === "Delivered") completed++;

        const date = (m.transactionDate?.toDate?.() as Date) || new Date();
        const ds = date.toISOString().slice(0, 10);
        if (m.status === "Delivered" && ds === todayStr) deliveredToday++;

        const who = m.customerName || m.phoneNumber || m.email;
        if (who) clients.add(String(who));
        total++;
      });

      setSummary({
        todayRevenue: rev,
        pendingOrders: pending,
        deliveredToday,
        repeatClients: clients.size,
        efficiencyValue: total ? Math.round((completed / total) * 100) : 0,
      });
    } catch {
      /* ignore */
    }
  }

  // helpers
  function currency(n: number) {
    return `Rs ${n.toFixed(2)}`;
  }

  async function confirmPassword(): Promise<boolean> {
    // quick inline prompt; replace with a fancy modal if you like
    const pw = window.prompt("Enter admin password to confirm");
    return (pw || "") === ADMIN_PASSWORD;
  }

  // actions: delete (txn + account)
  async function deleteTxn(id: string) {
    const ok = await confirmPassword();
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "transactions", id));
      await deleteDoc(doc(db, "account", id));
      setRows((prev) => prev.filter((d) => d.id !== id));
      showToast({ type: "ok", text: "Transaction deleted" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      showToast({ type: "err", text: msg });
    }
  }

  // actions: update status/payment on both collections if account doc exists
  async function updateStatus(id: string, status: string) {
    try {
      await updateDoc(doc(db, "transactions", id), { status });
      const accRef = doc(db, "account", id);
      const acc = await getDoc(accRef);
      if (acc.exists()) await updateDoc(accRef, { status });
      showToast({ type: "ok", text: "Status updated" });
      setOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), status } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Update failed";
      showToast({ type: "err", text: msg });
    }
  }

  async function updatePayment(id: string, paymentMethod: string) {
    try {
      await updateDoc(doc(db, "transactions", id), { paymentMethod });
      const accRef = doc(db, "account", id);
      const acc = await getDoc(accRef);
      if (acc.exists()) await updateDoc(accRef, { paymentMethod });
      showToast({ type: "ok", text: "Payment updated" });
      setOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), paymentMethod } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Update failed";
      showToast({ type: "err", text: msg });
    }
  }

  // actions: mark completed & adjust inventory (supports simple qty OR colors->sizes)
  async function markCompletedAndAdjust(id: string) {
    try {
      await runTransaction(db, async (t) => {
        const txnRef = doc(db, "transactions", id);
        const txSnap = await t.get(txnRef);
        if (!txSnap.exists()) throw new Error("Transaction missing");
        const data = txSnap.data() as Txn;
        const products = data.products || [];

        for (const p of products) {
          const { product, color, size, quantity } = p;
          if (!product || !quantity) continue;
          const prodRef = doc(db, "products", product);
          const prodSnap = await t.get(prodRef);
          if (!prodSnap.exists()) continue;
          const prod = prodSnap.data() as DocumentData;

          if (Array.isArray(prod.colors)) {
            const idx = prod.colors.findIndex((c: { color: string }) => c.color === color);
            if (idx === -1)
              throw new Error(`Color ${color} not found for ${product}`);
            const sizes = { ...(prod.colors[idx].sizes || {}) } as Record<string, number>;
            if (!(size! in sizes))
              throw new Error(`Size ${size} not found for ${product}`);
            const current = Number(sizes[size!]) || 0;
            if (current < quantity)
              throw new Error(
                `Insufficient stock for ${product} ${color}/${size}`
              );
            sizes[size!] = current - quantity;
            prod.colors[idx] = { ...prod.colors[idx], sizes };
            t.update(prodRef, { colors: prod.colors });
          } else if (typeof prod.qty === "number") {
            const current = Number(prod.qty) || 0;
            if (current < quantity)
              throw new Error(`Insufficient stock for ${product}`);
            t.update(prodRef, { qty: current - quantity });
          }
        }

        t.update(txnRef, { status: "Completed" });
        const accRef = doc(db, "account", id);
        const acc = await t.get(accRef);
        if (acc.exists()) t.update(accRef, { status: "Completed" });
      });

      showToast({ type: "ok", text: "Marked completed & inventory adjusted" });
      setOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), status: "Completed" } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not complete";
      showToast({ type: "err", text: msg });
    }
  }

  // edit product line modal
  function openEditLine(txnId: string, index: number, line: ProductLine) {
    setEditTxnId(txnId);
    setEditIndex(index);
    setEditValue({
      ...line,
      unitPrice:
        line.unitPrice ??
        (line.price && line.quantity ? line.price / line.quantity : 0),
    });
    setEditOpen(true);
  }

  async function saveEditLine() {
    if (!editTxnId || editIndex < 0 || !editValue) return;
    const updated = {
      ...editValue,
      price: (editValue.unitPrice || 0) * (editValue.quantity || 0),
    };
    try {
      await runTransaction(db, async (t) => {
        const txnRef = doc(db, "transactions", editTxnId);
        const txSnap = await t.get(txnRef);
        if (!txSnap.exists()) throw new Error("Transaction missing");
        const tx = txSnap.data() as Partial<Txn>;
        const products: ProductLine[] = Array.isArray(tx.products)
          ? [...tx.products]
          : [];
        const old = products[editIndex];
        const oldQty = old?.quantity || 0;
        const newQty = updated.quantity || 0;
        const diff = newQty - oldQty; // +diff means we need to take more stock

        // adjust inventory for the (possibly new) product document
        if (updated.product) {
          const prodRef = doc(db, "products", updated.product);
          const prodSnap = await t.get(prodRef);
          if (prodSnap.exists()) {
            const prod = prodSnap.data() as DocumentData;
            if (Array.isArray(prod.colors)) {
              const idx = prod.colors.findIndex(
                (c: { color: string }) => c.color === updated.color
              );
              if (idx === -1) throw new Error("Color not found");
              const sizes = { ...(prod.colors[idx].sizes || {}) } as Record<string, number>;
              if (!(updated.size! in sizes)) throw new Error("Size not found");
              const current = Number(sizes[updated.size!]) || 0;
              const newStock = current - diff; // subtract positive diff, add back negative
              if (newStock < 0) throw new Error("Insufficient stock for edit");
              sizes[updated.size!] = newStock;
              prod.colors[idx] = { ...prod.colors[idx], sizes };
              t.update(prodRef, { colors: prod.colors });
            } else if (typeof prod.qty === "number") {
              const current = Number(prod.qty) || 0;
              const newStock = current - diff;
              if (newStock < 0) throw new Error("Insufficient stock for edit");
              t.update(prodRef, { qty: newStock });
            }
          }
        }

        products[editIndex] = updated;
        t.update(txnRef, { products });
      });

      showToast({ type: "ok", text: "Product updated" });
      setEditOpen(false);
      setEditTxnId(null);
      setEditIndex(-1);
      setEditValue(null);
      // refresh just that doc in UI
      setRows((prev) => prev.map((d) => (d.id === editTxnId ? d : d)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Update failed";
      showToast({ type: "err", text: msg });
    }
  }

  // PDF – lightweight invoice (client-side)
  function printInvoice(data: Txn) {
    const docPdf = new jsPDF();
    const title = "MO T-SHIRT — INVOICE";
    docPdf.setFontSize(16);
    docPdf.text(title, 14, 18);

    docPdf.setFontSize(10);
    docPdf.text(`Invoice #${data.invoiceNumber || ""}`, 14, 26);
    const dt = data.transactionDate?.toDate?.() as Date | undefined;
    if (dt) docPdf.text(`${dt.toDateString()}`, 14, 31);

    docPdf.text(
      `Customer: ${
        data.customerName || data.phoneNumber || data.email || "Unknown"
      }`,
      14,
      38
    );

    // Column positions
    const descX = 14;
    const qtyX = 135;
    const unitX = 165;
    const totalX = 195;

    // Table header
    let y = 48;
    docPdf.setFont("helvetica", "bold");
    docPdf.text("Description", descX, y);
    docPdf.text("Qty", qtyX, y, { align: "right" });
    docPdf.text("Unit", unitX, y, { align: "right" });
    docPdf.text("Total", totalX, y, { align: "right" });
    docPdf.setFont("helvetica", "normal");
    y += 6;

    const ps = docPdf.internal.pageSize as unknown as {
      getHeight?: () => number;
      height?: number;
    };
    const pageHeight = ps.getHeight?.() || ps.height || 297;
    const lineHeight = 6;
    const maxY = pageHeight - 20;
    const wrapWidth = unitX - descX - 6;
    const money = (n: number) => `Rs ${n.toFixed(2)}`;

    const products: ProductLine[] = Array.isArray(data.products) ? data.products : [];
    let grand = 0;

    products.forEach((p) => {
      const qty = Number(p?.quantity ?? 0);
      const unitRaw =
        p?.unitPrice != null
          ? Number(p.unitPrice)
          : p?.price && qty
          ? Number(p.price) / qty
          : 0;
      const unit = Number.isFinite(unitRaw) ? unitRaw : 0;
      const total = p?.price != null ? Number(p.price) : Number(unit * qty);
      grand += total;

      const name = `${p?.product ?? "Item"}${
        p?.color || p?.size
          ? ` (${[p?.color, p?.size].filter(Boolean).join("/")})`
          : ""
      }`;

      // Wrap long names
      const lines = docPdf.splitTextToSize(name, wrapWidth);

      // Page break if needed
      if (y + lines.length * lineHeight > maxY) {
        docPdf.addPage();
        y = 20;
      }

      // Description
      lines.forEach((ln: string, i: number) => {
        docPdf.text(ln, descX, y + i * lineHeight);
      });

      // Numbers on first line
      docPdf.text(String(qty), qtyX, y, { align: "right" });
      docPdf.text(money(unit), unitX, y, { align: "right" });
      docPdf.text(money(total), totalX, y, { align: "right" });

      y += lines.length * lineHeight + 2;
    });

    // Total row
    if (y > maxY) {
      docPdf.addPage();
      y = 20;
    }
    docPdf.setFont("helvetica", "bold");
    docPdf.text(`Total: ${money(grand)}`, totalX, y, { align: "right" });
    docPdf.setFont("helvetica", "normal");

    docPdf.output("dataurlnewwindow"); // open in new tab
  }

  // bulk actions
  async function bulkDelete() {
    const ok = await confirmPassword();
    if (!ok) return;
    for (const id of Array.from(selectedIds)) {
      try {
        await deleteDoc(doc(db, "transactions", id));
        await deleteDoc(doc(db, "account", id));
      } catch {
        /* continue */
      }
    }
    setRows((prev) => prev.filter((d) => !selectedIds.has(d.id)));
    setSelectedIds(new Set());
    setSelectMode(false);
    showToast({ type: "ok", text: "Bulk delete done" });
  }

  async function bulkComplete() {
    for (const id of Array.from(selectedIds)) {
      try {
        await markCompletedAndAdjust(id);
      } catch {
        /* continue */
      }
    }
    setSelectedIds(new Set());
    setSelectMode(false);
  }

  function exportVisibleToCSV() {
    const headers = [
      "invoiceNumber",
      "customer",
      "amount",
      "status",
      "payment",
      "date",
    ];
    const rowsCsv = visibleRows.map((d) => {
      const m = d.data() as Txn;
      const dt = (m.transactionDate?.toDate?.() as Date | undefined)?.toISOString?.()?.slice(0, 10) || "";
      const customer = m.customerName || m.phoneNumber || m.email || "";
      const amount = (typeof m.amount === "number"
        ? m.amount
        : Array.isArray(m.products)
        ? m.products.reduce((s, p) => s + (p.price || 0), 0)
        : 0
      ).toFixed(2);
      const vals = [
        m.invoiceNumber || "",
        customer,
        amount,
        m.status || "",
        m.paymentMethod || "",
        dt,
      ];
      return vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const csv = [headers.join(","), ...rowsCsv].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders_visible_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-12rem] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_top,rgba(255,115,0,0.35),transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10rem] top-40 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_top,rgba(14,116,144,0.25),transparent_70%)] blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl space-y-6">
        {/* Header & quick nav */}
        <section
          className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm backdrop-blur"
          style={{ animation: "fadeUp 0.6s ease-out both" }}
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,115,0,0.08),transparent_60%)]"
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-600">
                Order Management
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">
                Order Command Center
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Track, update, and fulfill orders with inventory-safe workflows and clean client handoffs.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-orange-100/70 px-3 py-1 text-xs font-semibold text-orange-700">
                  <FiShield className="h-4 w-4" /> Inventory-safe fulfillment
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  Live status updates
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Clean invoice exports
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/pos"
                className="inline-flex items-center justify-center rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600"
              >
                Open POS
              </Link>
              <Link
                href="/admin/dms"
                className="inline-flex items-center justify-center rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
              >
                DMS
              </Link>
              <button
                onClick={exportVisibleToCSV}
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                Export CSV
              </button>
            </div>
          </div>
        </section>

        {/* Summary Cards */}
        <section
          className="grid grid-cols-2 gap-4 md:grid-cols-5"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.08s" }}
        >
          <Stat label="Today Revenue" value={currency(summary.todayRevenue)} tone="amber" icon={<FiDollarSign className="h-4 w-4" />} />
          <Stat label="Pending Orders" value={summary.pendingOrders} tone="sky" icon={<FiClock className="h-4 w-4" />} />
          <Stat label="Delivered Today" value={summary.deliveredToday} tone="emerald" icon={<FiCheckCircle className="h-4 w-4" />} />
          <Stat label="Repeat Clients" value={summary.repeatClients} tone="violet" icon={<FiUsers className="h-4 w-4" />} />
          <Stat label="Efficiency" value={`${summary.efficiencyValue}%`} tone="slate" icon={<FiTrendingUp className="h-4 w-4" />} />
        </section>

        {/* Filters */}
        <section
          className="sticky top-20 z-10 rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm backdrop-blur"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.14s" }}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <FiSearch className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  placeholder="Search customer, phone, or invoice..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Quick range</span>
                <button
                  onClick={() => applyQuickRange(1)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Today
                </button>
                <button
                  onClick={() => applyQuickRange(7)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  7 days
                </button>
                <button
                  onClick={() => applyQuickRange(30)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  30 days
                </button>
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setSearch("");
                    setDateFrom("");
                    setDateTo("");
                    setStatusFilter("");
                    setPaymentFilter("");
                    setActiveTab("all");
                  }}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                  title="Reset filters"
                >
                  Reset
                </button>
                <button
                  onClick={() => {
                    setActiveTab("all");
                  }}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold shadow-sm transition ${
                    activeTab === "all"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => {
                    setActiveTab("completed");
                  }}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold shadow-sm transition ${
                    activeTab === "completed"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  Completed
                </button>
                <button
                  onClick={() => {
                    setSelectMode((s) => !s);
                    if (selectMode) setSelectedIds(new Set());
                  }}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold shadow-sm transition ${
                    selectMode
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {selectMode ? "Cancel Select" : "Select"}
                </button>
                {selectMode && (
                  <>
                    <button
                      onClick={() => setSelectedIds(new Set(visibleRows.map((d) => d.id)))}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500">From</label>
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500">To</label>
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500">Status</label>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All</option>
                  <option>In Process</option>
                  <option>Urgent</option>
                  <option>Completed</option>
                  <option>Pending</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500">Payment</label>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                >
                  <option value="">All</option>
                  <option>Full Payment</option>
                  <option>Part Payment</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                Showing {visibleRows.length} of {rows.length} loaded
                {hasMore && " • more available"}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeFilters.length === 0 ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                    No filters active
                  </span>
                ) : (
                  activeFilters.map((filter) => (
                    <span key={filter} className="rounded-full border border-slate-200 bg-white px-3 py-1">
                      {filter}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Toast */}
        {toast && (
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-sm ${
              toast.type === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {toast.text}
          </div>
        )}

        {/* List */}
        <div
          className="rounded-3xl border border-slate-200/70 bg-white/90 shadow-sm backdrop-blur"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.2s" }}
        >
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                  <div className="mt-2 h-3 bg-slate-100 rounded w-1/4" />
                </div>
              ))}
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <FiSearch className="h-5 w-5" />
              </div>
              <div className="mt-3 text-base font-semibold text-slate-700">No transactions found.</div>
              <p className="mt-1 text-sm text-slate-500">Try adjusting filters or create a new order.</p>
              <div className="mt-4">
                <Link
                  href="/admin/pos"
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Create a new order in POS
                </Link>
              </div>
            </div>
          ) : (
            <ul className="space-y-3 p-3">
              {visibleRows.map((d) => {
                const base = d.data() as Txn;
                const m = { ...base, ...(overrides[d.id] || {}) } as Txn;
                const id = d.id;
                const dt = m.transactionDate?.toDate?.() as Date | undefined;
                const when = dt
                  ? `${dt.toLocaleDateString()} • ${dt.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : "";
                const total =
                  typeof m.amount === "number"
                    ? m.amount
                    : Array.isArray(m.products)
                    ? m.products.reduce((s, p) => s + (p.price || 0), 0)
                    : 0;

                return (
                  <li
                    key={id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-orange-200 hover:shadow-md"
                    data-row-id={id}
                    data-row={JSON.stringify({
                      invoiceNumber: m.invoiceNumber,
                      customer: m.customerName || m.phoneNumber || m.email || "",
                      amount: (typeof m.amount === "number"
                        ? m.amount
                        : Array.isArray(m.products)
                        ? m.products.reduce((s, p) => s + (p.price || 0), 0)
                        : 0
                      ).toFixed(2),
                      status: m.status,
                      paymentMethod: m.paymentMethod,
                      date: when,
                    })}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex items-start gap-4">
                        {selectMode && (
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-200"
                            checked={selectedIds.has(id)}
                            onChange={(e) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(id); else next.delete(id);
                                return next;
                              });
                            }}
                          />
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">
                              Invoice #{m.invoiceNumber || ""}
                            </span>
                            <span className="text-xs text-slate-400">{when}</span>
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {m.customerName || m.phoneNumber || m.email || "Unknown Customer"}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {StatusBadge(m.status || "")}
                            {PaymentBadge(m.paymentMethod || "")}
                            <span className="text-xs text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full bg-slate-50">
                              Items: {Array.isArray(m.products) ? m.products.length : 0}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">
                          {currency(total)}
                        </span>
                        <select
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                          value={m.status || "Select Status"}
                          onChange={(e) => updateStatus(id, e.target.value)}
                        >
                          {[
                            "Select Status",
                            "In Process",
                            "Urgent",
                            "Completed",
                            "Pending",
                          ].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <select
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                          value={m.paymentMethod || "Select Payment Status"}
                          onChange={(e) => updatePayment(id, e.target.value)}
                        >
                          {[
                            "Select Payment Status",
                            "Full Payment",
                            "Part Payment",
                          ].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>

                        <button
                          title="Print / Share"
                          onClick={() => printInvoice(m)}
                          className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          <FiPrinter />
                        </button>
                        <button
                          title={expanded.has(id) ? "Hide items" : "Show items"}
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return next;
                            })
                          }
                          className={`rounded-full border px-3 py-1.5 text-sm font-semibold shadow-sm transition ${
                            expanded.has(id)
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          {expanded.has(id) ? "Hide" : "Items"}
                        </button>
                        <button
                          title="Mark Completed & adjust stock"
                          onClick={() => markCompletedAndAdjust(id)}
                          className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100"
                        >
                          <FiCheckCircle />
                        </button>
                        <button
                          title="Delete"
                          onClick={() => deleteTxn(id)}
                          className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 p-2 text-rose-600 shadow-sm transition hover:border-rose-300 hover:bg-rose-100"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>

                    {/* products */}
                    {expanded.has(id) && Array.isArray(m.products) && m.products.length > 0 && (
                      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="text-left px-3 py-2">Product</th>
                              <th className="text-left px-3 py-2">Color/Size</th>
                              <th className="text-left px-3 py-2">Qty</th>
                              <th className="text-left px-3 py-2">Unit</th>
                              <th className="text-left px-3 py-2">Total</th>
                              <th className="text-right px-3 py-2">Edit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {m.products.map((p, idx) => {
                              const qty = p.quantity || 0;
                              const unit =
                                p.unitPrice != null
                                  ? p.unitPrice!
                                  : p.price && qty
                                  ? p.price / qty
                                  : 0;
                              const tot = p.price != null ? p.price! : unit * qty;
                              return (
                                <tr key={idx} className="text-slate-700">
                                  <td className="px-3 py-2">
                                    {p.product || "Item"}
                                  </td>
                                  <td className="px-3 py-2">
                                    {[p.color, p.size]
                                      .filter(Boolean)
                                      .join(" / ")}
                                  </td>
                                  <td className="px-3 py-2">{qty}</td>
                                  <td className="px-3 py-2">
                                    Rs {unit.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-2">
                                    Rs {tot.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <button
                                      onClick={() => openEditLine(id, idx, p)}
                                      className="text-sky-600 font-semibold hover:underline"
                                    >
                                      Edit
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Load more */}
        {(hasMore || loadingMore) && !loading && (
          <div className="py-6 text-center">
            <button
              onClick={() => loadMore(false)}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FiRefreshCw /> {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        )}

        {/* Bulk bar */}
        {selectMode && (
          <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-slate-200 bg-white/90 px-4 py-2 shadow-lg backdrop-blur">
            <span className="text-sm font-semibold text-slate-700">{selectedIds.size} selected</span>
            <button
              onClick={bulkDelete}
              className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700"
            >
              Delete
            </button>
            <button
              onClick={bulkComplete}
              className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              Mark Completed
            </button>
          </div>
        )}

        {/* Edit modal */}
        {editOpen && editValue && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-base font-semibold text-slate-900">Edit Product Line</div>
                <button
                  onClick={() => {
                    setEditOpen(false);
                  }}
                  className="rounded-full border border-slate-200 px-2 py-1 text-slate-500 hover:bg-slate-50"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-slate-600">
                  Product
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    value={editValue.product}
                    onChange={(e) =>
                      setEditValue((v) => ({ ...v!, product: e.target.value }))
                    }
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Color
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    value={editValue.color || ""}
                    onChange={(e) =>
                      setEditValue((v) => ({ ...v!, color: e.target.value }))
                    }
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Size
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    value={editValue.size || ""}
                    onChange={(e) =>
                      setEditValue((v) => ({ ...v!, size: e.target.value }))
                    }
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Quantity
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    value={editValue.quantity}
                    onChange={(e) =>
                      setEditValue((v) => ({
                        ...v!,
                        quantity: Math.max(1, parseInt(e.target.value || "1")),
                      }))
                    }
                  />
                </label>
                <label className="col-span-2 text-sm text-slate-600">
                  Unit Price (Rs)
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    value={editValue.unitPrice ?? 0}
                    onChange={(e) =>
                      setEditValue((v) => ({
                        ...v!,
                        unitPrice: parseFloat(e.target.value || "0"),
                      }))
                    }
                  />
                </label>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  onClick={() => setEditOpen(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEditLine}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
        <style jsx>{`
          @keyframes fadeUp {
            from {
              opacity: 0;
              transform: translateY(14px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    </main>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center text-sm text-slate-500">Loading…</main>}>
      <OrdersPageInner />
    </Suspense>
  );
}

function Stat({
  label,
  value,
  tone = "slate",
  icon,
}: {
  label: string;
  value: string | number;
  tone?: "amber" | "sky" | "emerald" | "violet" | "slate";
  icon?: React.ReactNode;
}) {
  const tones = {
    amber: {
      border: "border-amber-100",
      bg: "from-amber-50 via-white to-white",
      accent: "bg-amber-100 text-amber-700",
      glow: "bg-amber-200/40",
      value: "text-slate-900",
    },
    sky: {
      border: "border-sky-100",
      bg: "from-sky-50 via-white to-white",
      accent: "bg-sky-100 text-sky-700",
      glow: "bg-sky-200/40",
      value: "text-slate-900",
    },
    emerald: {
      border: "border-emerald-100",
      bg: "from-emerald-50 via-white to-white",
      accent: "bg-emerald-100 text-emerald-700",
      glow: "bg-emerald-200/40",
      value: "text-slate-900",
    },
    violet: {
      border: "border-violet-100",
      bg: "from-violet-50 via-white to-white",
      accent: "bg-violet-100 text-violet-700",
      glow: "bg-violet-200/40",
      value: "text-slate-900",
    },
    slate: {
      border: "border-slate-200",
      bg: "from-slate-50 via-white to-white",
      accent: "bg-slate-100 text-slate-700",
      glow: "bg-slate-200/40",
      value: "text-slate-900",
    },
  } as const;
  const theme = tones[tone] ?? tones.slate;
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${theme.border} bg-gradient-to-br ${theme.bg} p-4 shadow-sm`}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </div>
        {icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${theme.accent}`}>
            {icon}
          </span>
        )}
      </div>
      <div className={`mt-3 text-2xl font-semibold ${theme.value}`}>{value}</div>
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full blur-2xl ${theme.glow}`}
      />
    </div>
  );
}

// UI helpers
function StatusBadge(status: string) {
  const map: Record<string, string> = {
    Pending: "bg-amber-50 text-amber-700 border-amber-200",
    "In Process": "bg-sky-50 text-sky-700 border-sky-200",
    Urgent: "bg-rose-50 text-rose-700 border-rose-200",
    Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  const cls = map[status] || "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${cls}`}>{status || "—"}</span>
  );
}

function PaymentBadge(method: string) {
  const map: Record<string, string> = {
    "Full Payment": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Part Payment": "bg-violet-50 text-violet-700 border-violet-200",
  };
  const cls = map[method] || "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${cls}`}>{method || "—"}</span>
  );
}
