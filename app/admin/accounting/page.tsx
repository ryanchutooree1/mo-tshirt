"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query, Timestamp, where } from "firebase/firestore";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { format, isValid as isValidDateFn } from "date-fns";
import {
  FileText,
  ReceiptText,
  Banknote,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  BookOpen,
  DollarSign,
  PiggyBank,
  Calculator,
  FileUp,
  Search,
  Plus,
  Filter,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

/*
  ACCOUNTING PAGE (Next.js + Tailwind + Recharts)
  -------------------------------------------------
  Features:
  - KPI snapshot (Revenue, Net Profit, Cash, AR Aging, AP)
  - Revenue vs. Expenses (monthly bars) + Net profit line
  - Cashflow area (Operating / Investing / Financing)
  - Expense breakdown (pie) with legend
  - Invoices table with filters, status chips, bulk actions, pagination
  - Quick Invoice drawer (mock) & Receipt upload (drag+drop)
  - VAT / Tax calculator (support inclusive/exclusive)
  - Journal Entry composer (double-entry, live balancing)
  - Bank Reconciliation (imported bank lines vs. books with quick match)
  - Budget vs Actual mini view

  Data: Now backed by Firestore (transactions + account). Fallbacks are applied
  if some collections/fields are missing.
*/

/* ----------------------------- Types ----------------------------- */

type Invoice = {
  id: string;
  date: string; // YYYY-MM-DD
  customer: string;
  amount: number;
  vat: number; // %
  status: "Paid" | "Unpaid" | "Overdue" | "Partially Paid";
};

type BankLine = {
  id: string;
  date: string;
  description: string;
  amount: number;
  matched?: boolean;
};

type LedgerEntry = {
  account: string;
  debit: number | "";
  credit: number | "";
  memo?: string;
};

const monthLabels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const invoicesSeed: Invoice[] = new Array(36).fill(null).map((_, i) => {
  const d = new Date(2025, (i % 12), (i % 27) + 1);
  const amt = 2500 + (i % 7) * 450 + (i % 5) * 120;
  const status: Invoice["status"] = i % 9 === 0 ? "Overdue" : i % 3 === 0 ? "Unpaid" : i % 4 === 0 ? "Partially Paid" : "Paid";
  return {
    id: `INV-${String(1000 + i)}`,
    date: format(d, "yyyy-MM-dd"),
    customer: ["Acme Ltd", "Globex", "Soylent", "Initech", "Umbrella", "Hooli"][i % 6],
    amount: amt,
    vat: 15,
    status,
  };
});

/* --------------------------- Firestore Fetch -------------------------- */

type TxnDoc = {
  id: string;
  invoiceNumber?: string;
  customerName?: string;
  phoneNumber?: string;
  email?: string;
  amount?: number;
  products?: { quantity?: number; unitPrice?: number; price?: number }[];
  status?: string;
  paymentMethod?: string; // Full Payment | Part Payment
  transactionDate?: Date | Timestamp | any;
};

function sumProducts(products?: { quantity?: number; unitPrice?: number; price?: number }[]) {
  if (!products) return 0;
  return products.reduce((acc, p) => acc + (typeof p.price === "number" ? p.price : (p.unitPrice || 0) * (p.quantity || 0)), 0);
}

type AccountDoc = {
  id: string;
  amount?: number;
  type?: "income" | "expense";
  description?: string;
  status?: string; // Paid/Unpaid
  transactionDate?: Date | Timestamp | any;
};

/* ----------------------------- Helpers ------------------------------ */

const currency = (n: number) => `Rs ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function sum(arr: number[]) { return arr.reduce((a, b) => a + b, 0); }

function agingBucket(days: number) {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return ">90";
}

function classNames(...xs: (string | false | undefined)[]) { return xs.filter(Boolean).join(" "); }

/* ------------------------- Subcomponents --------------------------- */

// Error boundary to isolate chart crashes (e.g., malformed data)
class ChartBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch() {}
  render() {
    if (this.state.hasError) {
      return <div className="h-64 flex items-center justify-center text-sm text-gray-500">Chart unavailable</div>;
    }
    return this.props.children as any;
  }
}

function safeFormatDate(input: any, fmt = 'dd MMM yyyy') {
  try {
    const d = input instanceof Date ? input : new Date(input);
    if (!isValidDateFn(d)) return '';
    return format(d, fmt);
  } catch { return ''; }
}

function KPI({ label, value, icon, trend, positive = true }: { label: string; value: string | number; icon: React.ReactNode; trend?: string; positive?: boolean; }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4 flex items-center gap-3">
      <div className="p-3 rounded-xl bg-gray-100">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-gray-500 text-xs uppercase tracking-wide">{label}</div>
        <div className="text-xl font-bold truncate">{value}</div>
        {trend && (
          <div className={classNames("text-xs mt-1 flex items-center gap-1", positive ? "text-emerald-600" : "text-rose-600")}> 
            {positive ? <TrendingUp className="w-3 h-3"/> : <TrendingDown className="w-3 h-3"/>}
            {trend}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ s }: { s: Invoice["status"] }) {
  const map: Record<Invoice["status"], string> = {
    Paid: "bg-emerald-50 text-emerald-700",
    Unpaid: "bg-amber-50 text-amber-700",
    Overdue: "bg-rose-50 text-rose-700",
    "Partially Paid": "bg-blue-50 text-blue-700",
  };
  return <span className={classNames("px-2 py-0.5 rounded-full text-xs font-medium", map[s])}>{s}</span>;
}

/* ---------------------------- Main Page ---------------------------- */

export default function AccountingPage() {
  const today = new Date();
  const yStart = new Date(today.getFullYear(), 0, 1);
  const yEnd = today;

  // Firestore-backed rows
  const [txnRows, setTxnRows] = useState<TxnDoc[]>([]);
  const [accRows, setAccRows] = useState<AccountDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        // Transactions (orders)
        const qTxn = query(
          collection(db, "transactions"),
          where("transactionDate", ">=", Timestamp.fromDate(yStart)),
          where("transactionDate", "<=", Timestamp.fromDate(new Date(yEnd.getFullYear(), yEnd.getMonth(), yEnd.getDate(), 23,59,59))),
          orderBy("transactionDate", "desc")
        );
        // Account rows (income/expense) if present
        const qAcc = query(
          collection(db, "account"),
          where("transactionDate", ">=", Timestamp.fromDate(yStart)),
          where("transactionDate", "<=", Timestamp.fromDate(new Date(yEnd.getFullYear(), yEnd.getMonth(), yEnd.getDate(), 23,59,59))),
          orderBy("transactionDate", "desc")
        );
        const [sTxn, sAcc] = await Promise.allSettled([getDocs(qTxn), getDocs(qAcc)]);

        if (cancelled) return;

        const txns: TxnDoc[] = sTxn.status === 'fulfilled' ? sTxn.value.docs.map(d => ({ id: d.id, ...(d.data() as any) })) : [];
        const accs: AccountDoc[] = sAcc.status === 'fulfilled' ? sAcc.value.docs.map(d => ({ id: d.id, ...(d.data() as any) })) : [];

        setTxnRows(txns);
        setAccRows(accs);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load accounting data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [yStart.getTime(), yEnd.getTime()]);

  // Invoices view (derived from transactions)
  const invoicesDerived: Invoice[] = useMemo(() => {
    return txnRows.map((m) => {
      const dt: Date = (m.transactionDate instanceof Timestamp)
        ? (m.transactionDate as Timestamp).toDate()
        : new Date(m.transactionDate || Date.now());
      const amt = typeof m.amount === 'number' ? m.amount : sumProducts(m.products);
      // status mapping: Paid / Partially Paid / Unpaid / Overdue
      let status: Invoice["status"] = 'Unpaid';
      const pm = (m.paymentMethod || '').toLowerCase();
      const st = (m.status || '').toLowerCase();
      if (pm.includes('full')) status = 'Paid';
      else if (pm.includes('part')) status = 'Partially Paid';
      else if (st === 'completed' || st === 'delivered') status = 'Paid';
      // Overdue if older than 30 days and not paid
      const days = Math.floor((today.getTime() - dt.getTime()) / (1000*60*60*24));
      if (status !== 'Paid' && days > 30) status = 'Overdue';
      return {
        id: (m.invoiceNumber as string) || m.id,
        date: format(dt, 'yyyy-MM-dd'),
        customer: (m.customerName || m.phoneNumber || m.email || 'Unknown') as string,
        amount: Number(amt || 0),
        vat: 15,
        status,
      };
    });
  }, [txnRows, today]);

  // Invoices state (filter/search/pagination)
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  useEffect(() => { setInvoices(invoicesDerived); }, [invoicesDerived]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Invoice["status"] | "All">("All");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const filteredInvoices = useMemo(() => {
    let rows = invoices;
    if (statusFilter !== "All") rows = rows.filter(r => r.status === statusFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter(r => r.customer.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
    }
    return rows;
  }, [invoices, query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
  const pageRows = useMemo(() => filteredInvoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredInvoices, page]);

  // KPI calcs
  const ytdRevenue = useMemo(() => {
    // Prefer account income sum; fallback to transactions total
    const accIncome = accRows.filter(r => (r.type||'') === 'income');
    const revAcc = accIncome.reduce((a, r) => a + (Number(r.amount)||0), 0);
    if (revAcc > 0) return revAcc;
    return invoicesDerived.reduce((a, i) => a + (i.amount||0), 0);
  }, [accRows, invoicesDerived]);
  const ytdExpenses = useMemo(() => accRows.filter(r => (r.type||'') === 'expense').reduce((a, r) => a + (Number(r.amount)||0), 0), [accRows]);
  const netProfitYtd = ytdRevenue - ytdExpenses;

  const ar = useMemo(() => invoices.filter(i => i.status !== "Paid"), [invoices]);
  const arTotal = useMemo(() => sum(ar.map(i => i.amount)), [ar]);
  // AP: expenses in account that are not Paid (if status exists)
  const apTotal = useMemo(() => accRows.filter(r => (r.type||'')==='expense' && (String(r.status||'').toLowerCase() !== 'paid')).reduce((a, r) => a + (Number(r.amount)||0), 0), [accRows]);
  // Cash balance approximation (income - expenses YTD)
  const cashBalance = ytdRevenue - ytdExpenses;

  // AR aging
  const aging = useMemo(() => {
    const buckets: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, ">90": 0 };
    ar.forEach((inv) => {
      const days = Math.floor((today.getTime() - new Date(inv.date).getTime()) / (1000*60*60*24));
      buckets[agingBucket(Math.max(0, days))] += inv.amount;
    });
    return buckets;
  }, [ar, today]);

  // Bank lines (mock) & matching
  const [bankLines, setBankLines] = useState<BankLine[]>([]);
  useEffect(() => {
    // Derive bank lines from account rows (income positive, expense negative)
    const lines: BankLine[] = accRows.slice(0, 50).map((r, idx) => {
      const dt: Date = (r.transactionDate instanceof Timestamp)
        ? (r.transactionDate as Timestamp).toDate()
        : new Date(r.transactionDate || Date.now());
      const amt = Number(r.amount||0);
      return {
        id: r.id || String(idx),
        date: format(dt, 'yyyy-MM-dd'),
        description: (r.description || (r.type==='income'?'Income':'Expense')) as string,
        amount: (r.type === 'expense' ? -Math.abs(amt) : Math.abs(amt)),
        matched: String(r.status||'').toLowerCase() === 'paid',
      };
    });
    setBankLines(lines);
  }, [accRows]);
  const unmatched = bankLines.filter(b => !b.matched);

  // Journal entry composer
  const [entries, setEntries] = useState<LedgerEntry[]>([
    { account: "Cash", debit: 0, credit: "", memo: "" },
    { account: "Sales", debit: "", credit: 0, memo: "" },
  ]);
  const totalDebit = useMemo(() => entries.reduce((a, e) => a + (Number(e.debit) || 0), 0), [entries]);
  const totalCredit = useMemo(() => entries.reduce((a, e) => a + (Number(e.credit) || 0), 0), [entries]);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.001;

  // VAT calculator
  const [vatRate, setVatRate] = useState(15);
  const [vatBase, setVatBase] = useState(1000);
  const [vatMode, setVatMode] = useState<"exclusive" | "inclusive">("exclusive");
  const vatCalc = useMemo(() => {
    const r = vatRate / 100;
    if (vatMode === "exclusive") {
      const vat = vatBase * r;
      return { vat: vat, total: vatBase + vat };
    } else {
      const net = vatBase / (1 + r);
      const vat = vatBase - net;
      return { vat, total: vatBase };
    }
  }, [vatRate, vatBase, vatMode]);

  // Expense pie colors (11-color palette, will repeat if needed)
  const pieColors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf", "#4e79a7"];

  // Monthly aggregations from account rows (real data if available)
  const revExpMonthly = useMemo(() => {
    return monthLabels.map((m, i) => {
      const income = accRows.filter(r => (r.type||'')==='income').reduce((a, r) => {
        const dt = (r.transactionDate instanceof Timestamp) ? (r.transactionDate as Timestamp).toDate() : new Date(r.transactionDate||Date.now());
        return dt.getMonth()===i ? a + (Number(r.amount)||0) : a;
      }, 0);
      const expense = accRows.filter(r => (r.type||'')==='expense').reduce((a, r) => {
        const dt = (r.transactionDate instanceof Timestamp) ? (r.transactionDate as Timestamp).toDate() : new Date(r.transactionDate||Date.now());
        return dt.getMonth()===i ? a + (Number(r.amount)||0) : a;
      }, 0);
      return { month: m, revenue: income, expenses: expense, net: income - expense };
    });
  }, [accRows]);

  const cashflowMonthly = useMemo(() => {
    return monthLabels.map((m, i) => {
      const income = accRows.filter(r => (r.type||'')==='income').reduce((a, r) => {
        const dt = (r.transactionDate instanceof Timestamp) ? (r.transactionDate as Timestamp).toDate() : new Date(r.transactionDate||Date.now());
        return dt.getMonth()===i ? a + (Number(r.amount)||0) : a;
      }, 0);
      const expense = accRows.filter(r => (r.type||'')==='expense').reduce((a, r) => {
        const dt = (r.transactionDate instanceof Timestamp) ? (r.transactionDate as Timestamp).toDate() : new Date(r.transactionDate||Date.now());
        return dt.getMonth()===i ? a + (Number(r.amount)||0) : a;
      }, 0);
      const operating = income - expense;
      return { month: m, operating, investing: 0, financing: 0 };
    });
  }, [accRows]);

  const expenseBreakdownData = useMemo(() => {
    const map = new Map<string, number>();
    accRows.filter(r => (r.type||'')==='expense').forEach(r => {
      const key = (r.description || 'Expense') as string;
      map.set(key, (map.get(key)||0) + (Number(r.amount)||0));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
      .sort((a,b)=>b.value-a.value).slice(0,8);
  }, [accRows]);

  /* ----------------------------- UI -------------------------------- */

  return (
    <main className="min-h-screen px-6 py-8 max-w-7xl mx-auto space-y-8">
      {/* HEADER */}
      <header className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold" style={{ fontFamily: 'var(--font-admin-serif)' }}>Accounting</h1>
            <p className="text-gray-500 mt-1">Today • {format(new Date(), 'dd MMM yyyy')} • {format(new Date(), 'HH:mm')}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/reports" className="px-3 py-2 border border-[#bfa37a] rounded-lg text-[#1a1a1a] hover:bg-[#bfa37a] hover:text-white transition-colors">Reports</Link>
            <Link href="/admin/accounting/settings" className="px-3 py-2 border border-[#bfa37a] rounded-lg text-[#1a1a1a] hover:bg-[#bfa37a] hover:text-white transition-colors">Settings</Link>
          </div>
        </div>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPI label="Revenue YTD" value={currency(ytdRevenue)} icon={<DollarSign className="w-5 h-5" />} trend={undefined} positive />
        <KPI label="Net Profit YTD" value={currency(netProfitYtd)} icon={<Banknote className="w-5 h-5" />} trend={undefined} positive={netProfitYtd>=0} />
        <KPI label="Cash (approx)" value={currency(cashBalance)} icon={<Wallet className="w-5 h-5" />} trend={undefined} />
        <KPI label="A/R Outstanding" value={currency(arTotal)} icon={<ReceiptText className="w-5 h-5" />} trend={undefined} positive={false} />
        <KPI label="A/P (unpaid exp)" value={currency(apTotal)} icon={<FileText className="w-5 h-5" />} trend={undefined} />
      </section>

      {/* CHARTS ROW */}
      <section className="grid lg:grid-cols-3 gap-4">
        {/* Revenue vs Expenses */}
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">Revenue vs Expenses</h3>
            <div className="text-xs text-gray-500">Monthly</div>
          </div>
          <div className="h-64">
            <ChartBoundary>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revExpMonthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(v: any) => currency(Number(v))} />
                  <Bar dataKey="revenue" fill="#16a34a" />
                  <Bar dataKey="expenses" fill="#ef4444" />
                  <Line type="monotone" dataKey="net" stroke="#111827" dot={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartBoundary>
          </div>
        </div>

        {/* Cashflow */}
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">Cashflow</h3>
            <div className="text-xs text-gray-500">Operating / Investing / Financing</div>
          </div>
          <div className="h-64">
            <ChartBoundary>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashflowMonthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(v: any) => currency(Number(v))} />
                  <Area type="monotone" dataKey="operating" stroke="#2563eb" fill="#93c5fd" />
                  <Area type="monotone" dataKey="investing" stroke="#10b981" fill="#a7f3d0" />
                  <Area type="monotone" dataKey="financing" stroke="#f59e0b" fill="#fde68a" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartBoundary>
          </div>
        </div>

        {/* Expense Breakdown */}
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">Expense Breakdown</h3>
            <div className="text-xs text-gray-500">YTD</div>
          </div>
          <div className="h-64">
            <ChartBoundary>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip formatter={(v: any) => currency(Number(v))} />
                  <Pie data={expenseBreakdownData} dataKey="value" nameKey="name" outerRadius={90}>
                    {expenseBreakdownData.map((_, i) => (
                      <Cell key={i} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </ChartBoundary>
          </div>
          <ul className="grid grid-cols-2 gap-2 text-sm mt-2">
            {expenseBreakdownData.map((e, i) => (
              <li key={i} className="flex items-center justify-between border rounded px-2 py-1">
                <span className="inline-flex items-center gap-2 truncate"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: pieColors[i % pieColors.length] }} /> {e.name}</span>
                <span className="font-medium">{currency(e.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* INVOICES & RECEIPTS */}
      <section className="grid lg:grid-cols-3 gap-4">
        {/* Invoices table */}
        <div className="bg-white rounded-2xl shadow p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold">Invoices</h3>
              <p className="text-sm text-gray-500">Manage billing, track status, and record payments.</p>
            </div>
            <div className="flex items-center gap-2">
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }} className="border rounded px-2 py-1 text-sm">
                <option value="All">All</option>
                <option value="Paid">Paid</option>
                <option value="Unpaid">Unpaid</option>
                <option value="Overdue">Overdue</option>
                <option value="Partially Paid">Partially Paid</option>
              </select>
              <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search customer or INV#" className="border rounded px-2 py-1 text-sm" />
              <button className="px-3 py-1.5 bg-black text-white rounded-lg text-sm">
                <Plus className="w-4 h-4 inline -mt-0.5 mr-1"/> New Invoice
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2 pr-2">Invoice</th>
                  <th className="py-2 pr-2">Customer</th>
                  <th className="py-2 pr-2">Amount</th>
                  <th className="py-2 pr-2">VAT</th>
                  <th className="py-2 pr-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((inv) => (
                  <tr key={inv.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-2">{safeFormatDate(inv.date, 'dd MMM yyyy')}</td>
                    <td className="py-2 pr-2 font-medium">{inv.id}</td>
                    <td className="py-2 pr-2">{inv.customer}</td>
                    <td className="py-2 pr-2">{currency(inv.amount)}</td>
                    <td className="py-2 pr-2">{inv.vat}%</td>
                    <td className="py-2 pr-2"><StatusPill s={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3">
            <div className="text-xs text-gray-500">Page {page} of {pageCount}</div>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1.5 border rounded disabled:opacity-50"><ChevronLeft className="w-4 h-4"/></button>
              <button disabled={page === pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} className="px-3 py-1.5 border rounded disabled:opacity-50"><ChevronRight className="w-4 h-4"/></button>
            </div>
          </div>
        </div>

        {/* Receipt Upload + VAT */}
        <div className="bg-white rounded-2xl shadow p-4 space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">Upload Receipts</h3>
            <ReceiptDropzone />
          </div>
          <div className="border-t pt-3">
            <h3 className="text-lg font-semibold mb-2">VAT Calculator</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="flex items-center gap-2">Rate % <input type="number" value={vatRate} onChange={(e)=> setVatRate(Number(e.target.value) || 0)} className="border rounded px-2 py-1 w-20"/></label>
              <label className="flex items-center gap-2">Amount <input type="number" value={vatBase} onChange={(e)=> setVatBase(Number(e.target.value) || 0)} className="border rounded px-2 py-1 w-28"/></label>
              <label className="flex items-center gap-2">Mode
                <select value={vatMode} onChange={(e)=> setVatMode(e.target.value as any)} className="border rounded px-2 py-1">
                  <option value="exclusive">Exclusive</option>
                  <option value="inclusive">Inclusive</option>
                </select>
              </label>
            </div>
            <div className="mt-2 bg-gray-50 rounded p-2 text-sm">
              <div className="flex justify-between"><span>VAT</span><span className="font-semibold">{currency(vatCalc.vat)}</span></div>
              <div className="flex justify-between"><span>Total</span><span className="font-semibold">{currency(vatCalc.total)}</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* JOURNAL & RECON */}
      <section className="grid lg:grid-cols-3 gap-4">
        {/* Journal Entry */}
        <div className="bg-white rounded-2xl shadow p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Journal Entry</h3>
            <button className={classNames("px-3 py-1.5 rounded-lg text-sm", balanced ? "bg-emerald-600 text-white" : "bg-gray-200")} disabled={!balanced}>Post Entry</button>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-2">Account</th>
                <th className="py-2 pr-2">Debit</th>
                <th className="py-2 pr-2">Credit</th>
                <th className="py-2 pr-2">Memo</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => (
                <tr key={idx} className="border-b">
                  <td className="py-2 pr-2"><input value={e.account} onChange={(ev)=> setEntries(rs => rs.map((r,i)=> i===idx?{...r, account: ev.target.value}:r))} className="border rounded px-2 py-1 w-full"/></td>
                  <td className="py-2 pr-2"><input type="number" value={e.debit as any} onChange={(ev)=> setEntries(rs => rs.map((r,i)=> i===idx?{...r, debit: ev.target.value === ''? '': Number(ev.target.value)}:r))} className="border rounded px-2 py-1 w-full text-right"/></td>
                  <td className="py-2 pr-2"><input type="number" value={e.credit as any} onChange={(ev)=> setEntries(rs => rs.map((r,i)=> i===idx?{...r, credit: ev.target.value === ''? '': Number(ev.target.value)}:r))} className="border rounded px-2 py-1 w-full text-right"/></td>
                  <td className="py-2 pr-2"><input value={e.memo || ''} onChange={(ev)=> setEntries(rs => rs.map((r,i)=> i===idx?{...r, memo: ev.target.value}:r))} className="border rounded px-2 py-1 w-full"/></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="flex items-center justify-between mt-2 text-sm">
            <div className="flex gap-2">
              <button onClick={()=> setEntries(rs => [...rs, { account: "", debit: "", credit: "", memo: "" }])} className="px-3 py-1.5 border rounded">Add Line</button>
              <button onClick={()=> setEntries([{ account: "Cash", debit: 0, credit: "", memo: "" }, { account: "Sales", debit: "", credit: 0, memo: "" }])} className="px-3 py-1.5 border rounded">Reset</button>
            </div>
            <div className="bg-gray-50 rounded px-3 py-2">
              <span className="mr-4">Debit: <strong>{currency(totalDebit)}</strong></span>
              <span>Credit: <strong>{currency(totalCredit)}</strong></span>
              <span className={classNames("ml-4 px-2 py-0.5 rounded text-xs", balanced?"bg-emerald-100 text-emerald-700":"bg-rose-100 text-rose-700")}>{balanced?"Balanced":"Out of Balance"}</span>
            </div>
          </div>
        </div>

        {/* Bank Reconciliation */}
        <div className="bg-white rounded-2xl shadow p-4">
          <h3 className="text-lg font-semibold mb-2">Bank Reconciliation</h3>
          <p className="text-sm text-gray-500 mb-3">Match bank statement lines with your books.</p>
          <ul className="space-y-2 max-h-96 overflow-auto">
            {unmatched.map((b) => (
              <li key={b.id} className="flex items-center justify-between border rounded p-2">
                <div>
                  <div className="font-medium">{b.description}</div>
                  <div className="text-xs text-gray-500">{format(new Date(b.date), "dd MMM yyyy")}</div>
                </div>
                <div className={classNames("font-semibold", b.amount < 0 ? "text-rose-600" : "text-emerald-700")}>{currency(Math.abs(b.amount))} {b.amount<0?"out":"in"}</div>
                <div className="flex gap-2">
                  <button onClick={()=> setBankLines(rs => rs.map(x => x.id===b.id?{...x, matched:true}:x))} className="px-3 py-1.5 bg-emerald-600 text-white rounded">Match</button>
                  <button className="px-3 py-1.5 border rounded">Find</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="text-xs text-gray-500 mt-2">Matched: {bankLines.length - unmatched.length}/{bankLines.length}</div>
        </div>
      </section>

      {/* Budget vs Actual */}
      <section className="bg-white rounded-2xl shadow p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">Budget vs Actual (Quarter)</h3>
          <div className="text-xs text-gray-500">Q3 • 2025</div>
        </div>
        <div className="grid md:grid-cols-4 gap-3 text-sm">
          {[
            { name: "Revenue", budget: 420000, actual: 440000 },
            { name: "COGS", budget: 250000, actual: 248000 },
            { name: "Operating Exp", budget: 140000, actual: 138500 },
            { name: "Net Profit", budget: 30000, actual: 53500 },
          ].map((r, i) => {
            const diff = r.actual - r.budget;
            const good = (r.name === "Revenue" || r.name === "Net Profit") ? diff >= 0 : diff <= 0;
            return (
              <div key={i} className="border rounded-xl p-3">
                <div className="text-gray-500">{r.name}</div>
                <div className="font-semibold">{currency(r.actual)} <span className="text-xs text-gray-500">(Budget {currency(r.budget)})</span></div>
                <div className={classNames("text-xs mt-1", good?"text-emerald-700":"text-rose-700")}>{good?"Ahead":"Behind"} by {currency(Math.abs(diff))}</div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

/* -------------------------- Receipt Dropzone ------------------------- */

function ReceiptDropzone() {
  const [drag, setDrag] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const f = Array.from(e.dataTransfer.files || []).filter((x) => x.type.includes("pdf") || x.type.includes("image"));
    if (f.length) setFiles((prev) => [...prev, ...f]);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = Array.from(e.target.files || []).filter((x) => x.type.includes("pdf") || x.type.includes("image"));
    if (f.length) setFiles((prev) => [...prev, ...f]);
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={classNames(
          "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer",
          drag ? "border-emerald-400 bg-emerald-50" : "border-gray-200"
        )}
      >
        <FileUp className="mx-auto mb-2" />
        <div className="text-sm">Drag & drop receipts here, or click to upload</div>
        <input type="file" accept="application/pdf,image/*" multiple onChange={onPick} className="hidden" id="receipt-picker" />
        <label htmlFor="receipt-picker" className="inline-block mt-2 px-3 py-1.5 bg-black text-white rounded-lg text-sm">Choose Files</label>
      </div>
      {files.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between border rounded px-2 py-1">
              <span className="truncate max-w-xs">{f.name}</span>
              <span className="text-gray-500">{Math.round(f.size/1024)} KB</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
