// app/admin/orders/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  FiSearch,
  FiPrinter,
  FiCheckCircle,
  FiTrash2,
  FiRefreshCw,
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

export default function OrdersPage() {
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
  const toastTimer = useRef<any>(null);
  function showToast(t: { type: "ok" | "err"; text: string }) {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  // debounce search
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim().toLowerCase()), 350);
    return () => clearTimeout(id);
  }, [search]);

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
    } catch (e: any) {
      showToast({ type: "err", text: e?.message || "Load failed" });
    } finally {
      setLoadingMore(false);
    }
  }

  function buildQuery(reset: boolean): Query<DocumentData> {
    const col = collection(db, "transactions");
    const parts: any[] = [orderBy("transactionDate", "desc")];

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
        const m = d.data() as any;
        const amount =
          typeof m.amount === "number"
            ? m.amount
            : Array.isArray(m.products)
            ? m.products.reduce((s: number, p: any) => s + (p.price || 0), 0)
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
    } catch (e: any) {
      showToast({ type: "err", text: e?.message || "Delete failed" });
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
      setRows((prev) =>
        prev.map((d) =>
          d.id === id
            ? new Proxy(d, {
                get(target, prop) {
                  if (prop === "data")
                    return () => ({ ...(target.data() as any), status });
                  // @ts-ignore
                  return target[prop];
                },
              })
            : d
        )
      );
    } catch (e: any) {
      showToast({ type: "err", text: e?.message || "Update failed" });
    }
  }

  async function updatePayment(id: string, paymentMethod: string) {
    try {
      await updateDoc(doc(db, "transactions", id), { paymentMethod });
      const accRef = doc(db, "account", id);
      const acc = await getDoc(accRef);
      if (acc.exists()) await updateDoc(accRef, { paymentMethod });
      showToast({ type: "ok", text: "Payment updated" });
      setRows((prev) =>
        prev.map((d) =>
          d.id === id
            ? new Proxy(d, {
                get(target, prop) {
                  if (prop === "data")
                    return () => ({ ...(target.data() as any), paymentMethod });
                  // @ts-ignore
                  return target[prop];
                },
              })
            : d
        )
      );
    } catch (e: any) {
      showToast({ type: "err", text: e?.message || "Update failed" });
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
          const prod = prodSnap.data() as any;

          if (Array.isArray(prod.colors)) {
            const idx = prod.colors.findIndex((c: any) => c.color === color);
            if (idx === -1)
              throw new Error(`Color ${color} not found for ${product}`);
            const sizes = { ...(prod.colors[idx].sizes || {}) };
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
      setRows((prev) =>
        prev.map((d) =>
          d.id === id
            ? new Proxy(d, {
                get(target, prop) {
                  if (prop === "data")
                    return () => ({
                      ...(target.data() as any),
                      status: "Completed",
                    });
                  // @ts-ignore
                  return target[prop];
                },
              })
            : d
        )
      );
    } catch (e: any) {
      showToast({ type: "err", text: e?.message || "Could not complete" });
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
        const tx = txSnap.data() as any;
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
            const prod = prodSnap.data() as any;
            if (Array.isArray(prod.colors)) {
              const idx = prod.colors.findIndex(
                (c: any) => c.color === updated.color
              );
              if (idx === -1) throw new Error("Color not found");
              const sizes = { ...(prod.colors[idx].sizes || {}) };
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
    } catch (e: any) {
      showToast({ type: "err", text: e?.message || "Update failed" });
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

    const pageHeight =
      (docPdf.internal.pageSize as any).getHeight?.() ||
      (docPdf.internal.pageSize as any).height;
    const lineHeight = 6;
    const maxY = pageHeight - 20;
    const wrapWidth = unitX - descX - 6;
    const money = (n: number) => `Rs ${n.toFixed(2)}`;

    const products: any[] = Array.isArray(data.products) ? data.products : [];
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

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header & quick nav */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Order Management</h1>
          <p className="text-gray-600">
            Track, update, and fulfill orders with inventory safety checks
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/pos"
            className="px-3 py-2 bg-orange-500 text-white rounded"
          >
            POS
          </Link>
          <Link
            href="/admin/dms"
            className="px-3 py-2 bg-sky-600 text-white rounded"
          >
            DMS
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label="Today Revenue" value={currency(summary.todayRevenue)} />
        <Stat label="Pending Orders" value={summary.pendingOrders} />
        <Stat label="Delivered Today" value={summary.deliveredToday} />
        <Stat label="Repeat Clients" value={summary.repeatClients} />
        <Stat label="Efficiency" value={`${summary.efficiencyValue}%`} />
      </div>

      {/* Filters */}
      <div className="bg-white p-3 rounded shadow mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative">
            <input
              className="pl-9 pr-3 py-2 border rounded w-64"
              placeholder="Search name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <FiSearch className="absolute left-3 top-2.5 text-gray-400" />
          </div>

          <div>
            <label className="block text-xs text-gray-500">From</label>
            <input
              type="date"
              className="border rounded px-2 py-2"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">To</label>
            <input
              type="date"
              className="border rounded px-2 py-2"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500">Status</label>
            <select
              className="border rounded px-2 py-2"
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
            <label className="block text-xs text-gray-500">Payment</label>
            <select
              className="border rounded px-2 py-2"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
            >
              <option value="">All</option>
              <option>Full Payment</option>
              <option>Part Payment</option>
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                setActiveTab("all");
              }}
              className={`px-3 py-2 rounded border ${
                activeTab === "all" ? "bg-black text-white" : "bg-white"
              }`}
            >
              All
            </button>
            <button
              onClick={() => {
                setActiveTab("completed");
              }}
              className={`px-3 py-2 rounded border ${
                activeTab === "completed" ? "bg-black text-white" : "bg-white"
              }`}
            >
              Completed
            </button>

            <button
              onClick={() => {
                setSelectMode((s) => !s);
                if (selectMode) setSelectedIds(new Set());
              }}
              className={`px-3 py-2 rounded border ${
                selectMode ? "bg-gray-900 text-white" : "bg-white"
              }`}
            >
              {selectMode ? "Cancel Select" : "Select"}
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`mb-3 inline-block px-3 py-2 rounded ${
            toast.type === "ok"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">Loading...</div>
        ) : visibleRows.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No transactions found.
          </div>
        ) : (
          <ul className="divide-y">
            {visibleRows.map((d) => {
              const m = d.data() as Txn;
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
                <li key={id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {selectMode && (
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedIds.has(id)}
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(id) : next.delete(id);
                              return next;
                            });
                          }}
                        />
                      )}
                      <div>
                        <div className="font-semibold">
                          Invoice #{m.invoiceNumber || ""}
                        </div>
                        <div className="text-sm text-gray-600">
                          {m.customerName ||
                            m.phoneNumber ||
                            m.email ||
                            "Unknown Customer"}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{when}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {currency(total)}
                      </span>
                      <select
                        className="border rounded px-2 py-1 text-sm"
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
                        className="border rounded px-2 py-1 text-sm"
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
                        className="p-2 hover:bg-gray-100 rounded"
                      >
                        <FiPrinter />
                      </button>
                      <button
                        title="Mark Completed & adjust stock"
                        onClick={() => markCompletedAndAdjust(id)}
                        className="p-2 hover:bg-gray-100 rounded text-green-700"
                      >
                        <FiCheckCircle />
                      </button>
                      <button
                        title="Delete"
                        onClick={() => deleteTxn(id)}
                        className="p-2 hover:bg-gray-100 rounded text-red-600"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </div>

                  {/* products */}
                  {Array.isArray(m.products) && m.products.length > 0 && (
                    <div className="mt-3 border rounded">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-3 py-2">Product</th>
                            <th className="text-left px-3 py-2">Color/Size</th>
                            <th className="text-left px-3 py-2">Qty</th>
                            <th className="text-left px-3 py-2">Unit</th>
                            <th className="text-left px-3 py-2">Total</th>
                            <th className="text-right px-3 py-2">Edit</th>
                          </tr>
                        </thead>
                        <tbody>
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
                              <tr key={idx} className="border-t">
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
                                    className="text-blue-600 hover:underline"
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
        <div className="py-4 text-center">
          <button
            onClick={() => loadMore(false)}
            disabled={loadingMore}
            className="px-4 py-2 bg-black text-white rounded inline-flex items-center gap-2"
          >
            <FiRefreshCw /> {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}

      {/* Bulk bar */}
      {selectMode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white shadow-lg border rounded px-4 py-2 flex items-center gap-3">
          <span className="text-sm">{selectedIds.size} selected</span>
          <button
            onClick={bulkDelete}
            className="px-3 py-1 bg-red-600 text-white rounded"
          >
            Delete
          </button>
          <button
            onClick={bulkComplete}
            className="px-3 py-1 bg-green-600 text-white rounded"
          >
            Mark Completed
          </button>
        </div>
      )}

      {/* Edit modal */}
      {editOpen && editValue && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-lg rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Edit Product Line</div>
              <button
                onClick={() => {
                  setEditOpen(false);
                }}
                className="px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Product
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={editValue.product}
                  onChange={(e) =>
                    setEditValue((v) => ({ ...v!, product: e.target.value }))
                  }
                />
              </label>
              <label className="text-sm">
                Color
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={editValue.color || ""}
                  onChange={(e) =>
                    setEditValue((v) => ({ ...v!, color: e.target.value }))
                  }
                />
              </label>
              <label className="text-sm">
                Size
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={editValue.size || ""}
                  onChange={(e) =>
                    setEditValue((v) => ({ ...v!, size: e.target.value }))
                  }
                />
              </label>
              <label className="text-sm">
                Quantity
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={editValue.quantity}
                  onChange={(e) =>
                    setEditValue((v) => ({
                      ...v!,
                      quantity: Math.max(1, parseInt(e.target.value || "1")),
                    }))
                  }
                />
              </label>
              <label className="text-sm col-span-2">
                Unit Price (Rs)
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 w-full border rounded px-2 py-1"
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

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setEditOpen(false)}
                className="px-3 py-2 border rounded"
              >
                Cancel
              </button>
              <button
                onClick={saveEditLine}
                className="px-3 py-2 bg-blue-600 text-white rounded"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white p-4 rounded shadow text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 font-bold">{value}</div>
    </div>
  );
}
