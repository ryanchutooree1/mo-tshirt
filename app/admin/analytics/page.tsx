'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

type AccountDoc = {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  description?: string;
  customerName?: string;
  phoneNumber?: string;
  email?: string;
  status?: string;
  paymentMethod?: string;
  transactionDate: Date; // normalized to Date in mapper
};

type ProductLine = {
  product?: string;
  color?: string;
  size?: string;
  quantity?: number;
  unitPrice?: number;
  price?: number;
};

type TxnDoc = {
  id: string;
  amount?: number; // may be missing; then sum(products.price)
  products?: ProductLine[];
  status?: string; // In Process / Urgent / Completed
  paymentMethod?: string; // Full Payment / Part Payment
  customerName?: string;
  phoneNumber?: string;
  email?: string;
  transactionDate: Date;
};

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

const pretty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const prettyMoney = (n: number) => `Rs ${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

function startEndForPreset(preset: '7d' | '30d' | '90d' | 'ytd') {
  const now = new Date();
  if (preset === 'ytd') return { start: new Date(now.getFullYear(), 0, 1), end: now };
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  const start = new Date(now);
  start.setDate(now.getDate() - (days - 1));
  return { start, end: now };
}

function dayKey(d: Date) { return format(d, 'yyyy-MM-dd'); }
function weekdayShort(d: Date) { return format(d, 'EEE'); }

function sumProducts(p?: ProductLine[]) {
  if (!p || !Array.isArray(p)) return 0;
  return p.reduce((acc, it) => acc + (typeof it.price === 'number' ? it.price : ((it.unitPrice || 0) * (it.quantity || 0))), 0);
}

// ------------------------------------------------------------
// Main Component
// ------------------------------------------------------------

export default function AnalysisPage() {
  const [{ start, end }, setRange] = useState(() => startEndForPreset('30d'));
  const [loading, setLoading] = useState(true);
  const [accountRows, setAccountRows] = useState<AccountDoc[]>([]);
  const [txnRows, setTxnRows] = useState<TxnDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetch Firestore (account + transactions) within date range
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        // account
        const qAcc = query(
          collection(db, 'account'),
          where('transactionDate', '>=', Timestamp.fromDate(start)),
          where('transactionDate', '<=', Timestamp.fromDate(new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59))),
          orderBy('transactionDate', 'asc')
        );
        const [accSnap, txnSnap] = await Promise.all([
          getDocs(qAcc),
          // transactions
          getDocs(
            query(
              collection(db, 'transactions'),
              where('transactionDate', '>=', Timestamp.fromDate(start)),
              where('transactionDate', '<=', Timestamp.fromDate(new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59))),
              orderBy('transactionDate', 'asc')
            )
          ),
        ]);

        if (cancelled) return;

        const accMapped: AccountDoc[] = accSnap.docs.map((d) => {
          const m = d.data() as any;
          const dt: Date = (m.transactionDate instanceof Timestamp)
            ? (m.transactionDate as Timestamp).toDate()
            : new Date(m.transactionDate);
          return {
            id: d.id,
            amount: Number(m.amount) || 0,
            type: m.type === 'expense' ? 'expense' : 'income',
            description: m.description || '',
            customerName: m.customerName || '',
            phoneNumber: m.phoneNumber || '',
            email: m.email || '',
            status: m.status || '',
            paymentMethod: m.paymentMethod || '',
            transactionDate: dt,
          };
        });

        const txMapped: TxnDoc[] = txnSnap.docs.map((d) => {
          const m = d.data() as any;
          const dt: Date = (m.transactionDate instanceof Timestamp)
            ? (m.transactionDate as Timestamp).toDate()
            : new Date(m.transactionDate);
          return {
            id: d.id,
            amount: typeof m.amount === 'number' ? m.amount : undefined,
            products: Array.isArray(m.products) ? m.products : [],
            status: m.status || '',
            paymentMethod: m.paymentMethod || '',
            customerName: m.customerName || '',
            phoneNumber: m.phoneNumber || '',
            email: m.email || '',
            transactionDate: dt,
          };
        });

        setAccountRows(accMapped);
        setTxnRows(txMapped);
      } catch (e: any) {
        console.error(e);
        setError(e?.message || 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [start.getTime(), end.getTime()]);

  // ----------------------------------------------------------
  // KPIs & Aggregations
  // ----------------------------------------------------------

  const metrics = useMemo(() => {
    const income = accountRows.filter((r) => r.type === 'income');
    const expense = accountRows.filter((r) => r.type === 'expense');
    const revenue = income.reduce((acc, r) => acc + r.amount, 0);
    const expenses = expense.reduce((acc, r) => acc + r.amount, 0);
    const net = revenue - expenses;

    // Orders + totals from transactions
    const orderTotals = txnRows.map((t) => (typeof t.amount === 'number' ? t.amount : sumProducts(t.products)));
    const ordersCount = txnRows.length;
    const ordersRevenue = orderTotals.reduce((a, b) => a + b, 0);
    const aov = ordersCount ? ordersRevenue / ordersCount : 0;

    // Repeat clients
    const byClient = new Map<string, number>();
    txnRows.forEach((t) => {
      const key = (t.customerName || t.phoneNumber || t.email || 'Unknown') as string;
      byClient.set(key, (byClient.get(key) || 0) + 1);
    });
    let repeatClients = 0;
    byClient.forEach((n) => { if (n > 1) repeatClients += 1; });
    const repeatRate = byClient.size ? Math.round((repeatClients / byClient.size) * 100) : 0;

    // EV = Completed / Total
    const completed = txnRows.filter((t) => (t.status || '').toLowerCase() === 'completed').length;
    const ev = ordersCount ? Math.round((completed / ordersCount) * 100) : 0;

    return { revenue, expenses, net, ordersCount, aov, repeatRate, ev, ordersRevenue };
  }, [accountRows, txnRows]);

  // Revenue trend (daily)
  const trendDaily = useMemo(() => {
    // seed map for each day in range
    const map = new Map<string, number>();
    const cursor = new Date(start);
    while (cursor <= end) {
      map.set(dayKey(cursor), 0);
      cursor.setDate(cursor.getDate() + 1);
    }
    accountRows.filter(r => r.type === 'income').forEach((r) => {
      const k = dayKey(r.transactionDate);
      if (map.has(k)) map.set(k, (map.get(k) || 0) + r.amount);
    });
    return Array.from(map.entries()).map(([date, value]) => ({ date: format(new Date(date), 'd MMM'), value }));
  }, [accountRows, start, end]);

  // Orders by status (bar)
  const statusData = useMemo(() => {
    const buckets: Record<string, number> = {};
    txnRows.forEach((t) => {
      const key = (t.status || 'Unknown');
      buckets[key] = (buckets[key] || 0) + 1;
    });
    return Object.entries(buckets).map(([name, count]) => ({ name, count }));
  }, [txnRows]);

  // Payment split (pie)
  const paymentData = useMemo(() => {
    const buckets: Record<string, number> = {};
    txnRows.forEach((t) => {
      const key = (t.paymentMethod || 'Unknown');
      buckets[key] = (buckets[key] || 0) + 1;
    });
    return Object.entries(buckets).map(([name, value]) => ({ name, value }));
  }, [txnRows]);

  // Weekday revenue
  const weekdayData = useMemo(() => {
    const buckets: Record<string, number> = { Mon:0, Tue:0, Wed:0, Thu:0, Fri:0, Sat:0, Sun:0 };
    accountRows.filter(r => r.type === 'income').forEach((r) => {
      const wd = weekdayShort(r.transactionDate);
      buckets[wd] = (buckets[wd] || 0) + r.amount;
    });
    const order = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    return order.map((d) => ({ day: d, value: buckets[d] || 0 }));
  }, [accountRows]);

  // Top products (from transactions)
  const topProducts = useMemo(() => {
    const m = new Map<string, number>();
    txnRows.forEach((t) => {
      (t.products || []).forEach((p) => {
        const key = (p.product || 'Item') as string;
        const v = (typeof p.price === 'number' ? p.price : (p.unitPrice || 0) * (p.quantity || 0));
        m.set(key, (m.get(key) || 0) + v);
      });
    });
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [txnRows]);

  // Top customers
  const topCustomers = useMemo(() => {
    const m = new Map<string, number>();
    txnRows.forEach((t) => {
      const key = (t.customerName || t.phoneNumber || t.email || 'Unknown') as string;
      const v = (typeof t.amount === 'number' ? t.amount : sumProducts(t.products));
      m.set(key, (m.get(key) || 0) + v);
    });
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [txnRows]);

  // Insight bullets (simple rules)
  const insights = useMemo(() => {
    const list: string[] = [];
    // Momentum: compare last 7 days vs previous 7
    const last7End = end;
    const last7Start = new Date(end);
    last7Start.setDate(end.getDate() - 6);
    const prev7Start = new Date(last7Start);
    prev7Start.setDate(prev7Start.getDate() - 7);
    const prev7End = new Date(last7Start);
    prev7End.setDate(prev7End.getDate() - 1);

    const revIn = (s: Date, e: Date) => accountRows
      .filter(r => r.type==='income' && r.transactionDate >= s && r.transactionDate <= new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23,59,59))
      .reduce((a, r) => a + r.amount, 0);

    const last7 = revIn(last7Start, last7End);
    const prev7 = revIn(prev7Start, prev7End);
    if (prev7 > 0) {
      const pct = Math.round(((last7 - prev7) / prev7) * 100);
      list.push(pct >= 0
        ? `Revenue up ${pct}% vs previous week. Keep pushing your winning offers!`
        : `Revenue down ${Math.abs(pct)}% vs previous week. Consider a promo or outreach push.`);
    }

    if (metrics.repeatRate >= 35) list.push(`Strong loyalty: ${metrics.repeatRate}% of customers are repeat buyers.`);
    if (metrics.ev >= 80) list.push(`Excellent fulfillment: EV at ${metrics.ev}%.`);

    const unpaid = txnRows.filter(t => (t.paymentMethod||'') === 'Part Payment').length;
    if (unpaid > 0) list.push(`${unpaid} open part‑payment orders – follow up to close the cash gap.`);

    if (topProducts[0]) list.push(`Top product: ${topProducts[0].name} — ${prettyMoney(topProducts[0].value)} in this range.`);

    return list;
  }, [accountRows, end, metrics.ev, metrics.repeatRate, topProducts, txnRows]);

  // ----------------------------------------------------------
  // Export helpers
  // ----------------------------------------------------------

  async function exportCsv() {
    const rows: string[] = [];
    rows.push(['Date','Type','Amount','Description','Customer','Status','Payment'].join(','));
    accountRows.forEach(r => {
      rows.push([
        format(r.transactionDate,'yyyy-MM-dd'),
        r.type,
        String(r.amount),
        (r.description||'').replaceAll(',', ' '),
        (r.customerName||'').replaceAll(',', ' '),
        (r.status||''),
        (r.paymentMethod||'')
      ].join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `analysis_${format(start,'yyyyMMdd')}_${format(end,'yyyyMMdd')}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function setPreset(p: '7d'|'30d'|'90d'|'ytd') { setRange(startEndForPreset(p)); }

  // ----------------------------------------------------------
  // UI
  // ----------------------------------------------------------

  return (
    <main className="min-h-screen px-6 py-8 max-w-7xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">📈 Business Analysis</h1>
          <p className="text-gray-600">Deep insights powered by your Firestore data</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-500 mr-2">Range:</div>
          <button onClick={() => setPreset('7d')} className="px-3 py-1.5 rounded-full border hover:bg-gray-50">7D</button>
          <button onClick={() => setPreset('30d')} className="px-3 py-1.5 rounded-full border hover:bg-gray-50">30D</button>
          <button onClick={() => setPreset('90d')} className="px-3 py-1.5 rounded-full border hover:bg-gray-50">90D</button>
          <button onClick={() => setPreset('ytd')} className="px-3 py-1.5 rounded-full border hover:bg-gray-50">YTD</button>
          <div className="ml-3 text-sm text-gray-500">{format(start,'d MMM yyyy')} — {format(end,'d MMM yyyy')}</div>
          <button onClick={exportCsv} className="ml-3 px-3 py-1.5 rounded-lg bg-black text-white hover:bg-gray-800">Export CSV</button>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded">{error}</div>
      )}

      {/* KPI cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[{
          label: "Revenue",
          value: prettyMoney(metrics.revenue),
          sub: `${pretty(metrics.ordersRevenue)} via orders`,
        },{
          label: "Expenses",
          value: prettyMoney(metrics.expenses),
          sub: "Cash out",
        },{
          label: "Net",
          value: prettyMoney(metrics.net),
          sub: metrics.net >= 0 ? 'Profit' : 'Loss',
        },{
          label: "Orders",
          value: pretty(metrics.ordersCount),
          sub: `AOV ${prettyMoney(Math.round(metrics.aov||0))}`,
        }].map((c, i) => (
          <motion.div
            key={i}
            initial={{ opacity:0, y: 10 }}
            animate={{ opacity:1, y:0 }}
            transition={{ delay: i*0.06 }}
            className="bg-white rounded-2xl shadow p-5"
          >
            <div className="text-sm text-gray-500">{c.label}</div>
            <div className="text-2xl font-bold">{c.value}</div>
            <div className="text-xs text-gray-400 mt-1">{c.sub}</div>
          </motion.div>
        ))}
      </section>

      {/* EV + Repeat */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow p-5 col-span-1 md:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Revenue Trend</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendDaily} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(v: any) => prettyMoney(Number(v))} />
                <Area type="monotone" dataKey="value" stroke="#f97316" fill="url(#grad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <h3 className="font-semibold mb-2">Operational Health</h3>
          <div className="space-y-4">
            <Gauge label="EV (Efficiency)" value={metrics.ev} />
            <Gauge label="Repeat Rate" value={metrics.repeatRate} />
          </div>
        </div>
      </section>

      {/* Status + Payment */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow p-5">
          <h3 className="font-semibold mb-2">Orders by Status</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#0ea5e9" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <h3 className="font-semibold mb-2">Payment Methods</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={paymentData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                  {paymentData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Weekday + Top products */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow p-5">
          <h3 className="font-semibold mb-2">Revenue by Weekday</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weekdayData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip formatter={(v: any) => prettyMoney(Number(v))} />
                <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <h3 className="font-semibold mb-2">Top Products</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip formatter={(v: any) => prettyMoney(Number(v))} />
                <Bar dataKey="value" fill="#f59e0b" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-sm text-gray-500 flex flex-wrap gap-2">
            {topProducts.map((p, i) => (
              <span key={i} className="px-2 py-1 rounded bg-gray-100">
                {p.name} · {prettyMoney(Math.round(p.value))}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Top Customers + Insights */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow p-5">
          <h3 className="font-semibold mb-2">Top Customers</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCustomers} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} />
                <Tooltip formatter={(v: any) => prettyMoney(Number(v))} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0,6,6,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <h3 className="font-semibold mb-2">Smart Insights</h3>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            {insights.length === 0 && <li>No anomalies detected. Keep up the steady growth 🚀</li>}
            {insights.map((s, i) => (<li key={i}>{s}</li>))}
          </ul>
        </div>
      </section>

      {loading && (
        <div className="fixed inset-x-0 bottom-4 flex justify-center">
          <span className="px-3 py-1.5 bg-black text-white rounded-full shadow">Loading fresh numbers…</span>
        </div>
      )}
    </main>
  );
}

// ------------------------------------------------------------
// Small components
// ------------------------------------------------------------

const PIE_COLORS = ['#0ea5e9','#10b981','#f59e0b','#ef4444','#6366f1','#14b8a6'];

function Gauge({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="p-3 border rounded-2xl">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-gray-500">{label}</div>
        <div className="font-semibold">{clamped}%</div>
      </div>
      <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
        <div className="h-2 bg-emerald-500" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
