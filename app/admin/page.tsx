"use client";

import Image from "next/image";
import Link from "next/link";
import { Manrope } from "next/font/google";
import { useEffect, useMemo, useState } from "react";
import {
  CirclePercent,
  Globe2,
  Printer,
  ShoppingBag,
  TrendingUp,
  Truck,
} from "lucide-react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { format, subDays } from "date-fns";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { db } from "@/lib/firebase";
import { normalizeInventoryColors } from "@/lib/inventory-stock";
import { formatWholeMoney } from "@/lib/money";
import { useAdminTheme } from "@/admin/AdminThemeContext";

const font = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const RANGE_DAYS = 30;
const LOW_STOCK_THRESHOLD = 10;
const PRODUCT_IMAGES = [
  "/mockups/tshirt-front.png",
  "/mockups/polo-front.png",
  "/mockups/hoodie-front.png",
  "/mockups/tshirt-back.png",
];

type OrderLine = {
  name: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  price: number;
};

type DashboardOrder = {
  id: string;
  client: string;
  amount: number;
  status: string;
  paymentMethod: string;
  deliveryMethod: string;
  date: Date | null;
  lines: OrderLine[];
};

type DashboardProduct = {
  id: string;
  productName: string;
  colors: Array<{ color: string; sizes: Record<string, number> }>;
};

type TrackingEvent = {
  id: string;
  name: string;
  sessionId: string;
  createdAt: Date;
};

function asNumber(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && value !== null) {
    const timestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof timestamp.toDate === "function") return timestamp.toDate();
    if (typeof timestamp.seconds === "number") return new Date(timestamp.seconds * 1000);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapOrderLines(value: unknown): OrderLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const line = entry as Record<string, unknown>;
    const quantity = Math.max(0, asNumber(line.quantity));
    const unitPrice = Math.max(0, asNumber(line.unitPrice));
    return [{
      name: String(line.product || line.productName || line.description || "Custom item"),
      color: String(line.color || ""),
      size: String(line.size || ""),
      quantity,
      unitPrice,
      price: Math.max(0, asNumber(line.price, quantity * unitPrice)),
    }];
  });
}

function sumOrderLines(lines: OrderLine[]) {
  return lines.reduce((total, line) => total + (line.price || line.quantity * line.unitPrice), 0);
}

function dayKey(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function sumDigits(value: number) {
  return String(value).split("").reduce((total, digit) => total + Number(digit), 0);
}

function reduceToMaster(value: number) {
  let next = value;
  while (next > 9 && next !== 11 && next !== 22 && next !== 33) next = sumDigits(next);
  return next;
}

function calculateNumerology(date: Date) {
  const total = format(date, "ddMMyyyy").split("").reduce((sum, digit) => sum + Number(digit), 0);
  const day = date.getDate();
  return {
    primary: reduceToMaster(total),
    secondary: [2, 11, 20, 22, 33].includes(day) ? day : reduceToMaster(sumDigits(day)),
  };
}

function statusTone(status: string, isDark: boolean) {
  const value = status.toLowerCase();
  if (value.includes("deliver") || value.includes("complete")) return isDark ? "bg-emerald-400/12 text-emerald-300 ring-emerald-400/20" : "bg-emerald-50 text-emerald-700 ring-emerald-600/10";
  if (value.includes("cancel") || value.includes("refund")) return isDark ? "bg-rose-400/12 text-rose-300 ring-rose-400/20" : "bg-rose-50 text-rose-700 ring-rose-600/10";
  if (value.includes("print") || value.includes("process")) return isDark ? "bg-blue-400/12 text-blue-300 ring-blue-400/20" : "bg-blue-50 text-blue-700 ring-blue-600/10";
  return isDark ? "bg-amber-400/12 text-amber-300 ring-amber-400/20" : "bg-amber-50 text-amber-700 ring-amber-600/10";
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { theme } = useAdminTheme();
  return (
    <section className={`min-w-0 max-w-full rounded-xl border ${
      theme === "dark"
        ? "border-[#1b3d28] bg-[#07150d] shadow-[0_10px_32px_rgba(0,0,0,0.28)]"
        : "border-slate-200/80 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.035)]"
    } ${className}`}>
      {children}
    </section>
  );
}

export default function AdminDashboard() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";
  const [now, setNow] = useState(new Date());
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [events, setEvents] = useState<TrackingEvent[]>([]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const ordersQuery = query(collection(db, "transactions"), orderBy("transactionDate", "desc"), limit(500));
    return onSnapshot(ordersQuery, (snapshot) => {
      setOrders(snapshot.docs.map((row) => {
        const data = row.data() as Record<string, unknown>;
        const lines = mapOrderLines(data.products);
        return {
          id: row.id,
          client: String(data.customerName || data.client || data.phoneNumber || data.email || "Walk-in customer"),
          amount: typeof data.amount === "number" ? data.amount : sumOrderLines(lines),
          status: String(data.status || "Pending"),
          paymentMethod: String(data.paymentMethod || data.payment || "Not set"),
          deliveryMethod: String(data.deliveryMethod || data.delivery || "Mauritius"),
          date: asDate(data.transactionDate || data.date),
          lines,
        };
      }));
    }, () => setOrders([]));
  }, []);

  useEffect(() => {
    const productsQuery = query(collection(db, "products"), orderBy("productName"), limit(200));
    return onSnapshot(productsQuery, (snapshot) => {
      setProducts(snapshot.docs.map((row) => {
        const data = row.data() as Record<string, unknown>;
        return {
          id: row.id,
          productName: String(data.productName || "Unnamed product"),
          colors: normalizeInventoryColors(data.colors).map((entry) => ({ color: entry.color, sizes: entry.sizes })),
        };
      }));
    }, () => setProducts([]));
  }, []);

  useEffect(() => {
    const trackingQuery = query(collection(db, "websiteTrackingEvents"), orderBy("createdAt", "desc"), limit(1000));
    return onSnapshot(trackingQuery, (snapshot) => {
      setEvents(snapshot.docs.map((row) => {
        const data = row.data() as Record<string, unknown>;
        return {
          id: row.id,
          name: String(data.name || "page_view"),
          sessionId: String(data.sessionId || ""),
          createdAt: asDate(data.createdAt) || new Date(0),
        };
      }));
    }, () => setEvents([]));
  }, []);

  const rangeStart = useMemo(() => {
    const value = subDays(now, RANGE_DAYS - 1);
    value.setHours(0, 0, 0, 0);
    return value;
  }, [now]);

  const ordersInRange = useMemo(
    () => orders.filter((order) => order.date && order.date >= rangeStart),
    [orders, rangeStart]
  );
  const eventsInRange = useMemo(
    () => events.filter((event) => event.createdAt >= rangeStart),
    [events, rangeStart]
  );

  const metrics = useMemo(() => {
    const revenue = ordersInRange.reduce((total, order) => total + order.amount, 0);
    const pending = orders.filter((order) => /pending|print|process|production/i.test(order.status)).length;
    const delivered = ordersInRange.filter((order) => /deliver|complete/i.test(order.status)).length;
    const pageViews = eventsInRange.filter((event) => event.name === "page_view").length;
    const sessions = new Set(eventsInRange.map((event) => event.sessionId).filter(Boolean)).size;
    const leads = eventsInRange.filter((event) => event.name === "generate_lead" || event.name === "shop_order_submit").length;
    const conversion = pageViews ? (leads / pageViews) * 100 : 0;
    return { revenue, pending, delivered, pageViews, sessions, leads, conversion };
  }, [eventsInRange, orders, ordersInRange]);

  const salesTrend = useMemo(() => {
    const rows = Array.from({ length: RANGE_DAYS }, (_, index) => {
      const date = subDays(now, RANGE_DAYS - 1 - index);
      return { key: dayKey(date), label: format(date, "d MMM"), revenue: 0, orders: 0 };
    });
    const byDay = new Map(rows.map((row) => [row.key, row]));
    ordersInRange.forEach((order) => {
      if (!order.date) return;
      const row = byDay.get(dayKey(order.date));
      if (!row) return;
      row.revenue += order.amount;
      row.orders += 1;
    });
    return rows;
  }, [now, ordersInRange]);

  const trafficTrend = useMemo(() => {
    const rows = Array.from({ length: RANGE_DAYS }, (_, index) => {
      const date = subDays(now, RANGE_DAYS - 1 - index);
      return { key: dayKey(date), label: format(date, "d MMM"), visitors: new Set<string>(), pageViews: 0 };
    });
    const byDay = new Map(rows.map((row) => [row.key, row]));
    eventsInRange.forEach((event) => {
      const row = byDay.get(dayKey(event.createdAt));
      if (!row) return;
      if (event.name === "page_view") row.pageViews += 1;
      if (event.sessionId) row.visitors.add(event.sessionId);
    });
    return rows.map((row) => ({ label: row.label, visitors: row.visitors.size, pageViews: row.pageViews }));
  }, [eventsInRange, now]);

  const productPerformance = useMemo(() => {
    const totals = new Map<string, { quantity: number; revenue: number }>();
    ordersInRange.forEach((order) => order.lines.forEach((line) => {
      const current = totals.get(line.name) || { quantity: 0, revenue: 0 };
      current.quantity += line.quantity || 1;
      current.revenue += line.price || line.quantity * line.unitPrice;
      totals.set(line.name, current);
    }));
    return Array.from(totals.entries())
      .map(([name, values]) => ({ name, ...values }))
      .sort((left, right) => right.quantity - left.quantity);
  }, [ordersInRange]);

  const productMix = useMemo(() => {
    const top = productPerformance.slice(0, 5);
    const total = top.reduce((sum, item) => sum + item.quantity, 0) || 1;
    return top.map((item) => ({ ...item, percent: Math.round((item.quantity / total) * 100) }));
  }, [productPerformance]);

  const inventory = useMemo(() => {
    const lines: Array<{ id: string; name: string; color: string; quantity: number }> = [];
    let totalUnits = 0;
    products.forEach((product) => product.colors.forEach((color, index) => {
      const quantity = Object.values(color.sizes).reduce((sum, value) => sum + value, 0);
      totalUnits += quantity;
      lines.push({ id: `${product.id}-${index}`, name: product.productName, color: color.color, quantity });
    }));
    const alerts = lines.filter((line) => line.quantity < LOW_STOCK_THRESHOLD).sort((a, b) => a.quantity - b.quantity);
    return { totalUnits, alerts, lines };
  }, [products]);

  const productionQueue = useMemo(
    () => orders.filter((order) => /pending|print|process|production/i.test(order.status)).slice(0, 5),
    [orders]
  );
  const maxProductionQuantity = Math.max(
    1,
    ...productionQueue.map((order) => order.lines.reduce((sum, line) => sum + line.quantity, 0))
  );

  const numerology = useMemo(() => calculateNumerology(now), [now]);
  const pieColors = isDark
    ? ["#7cff45", "#38bdf8", "#818cf8", "#fb923c", "#94a3b8"]
    : ["#111827", "#374151", "#6b7280", "#9ca3af", "#d1d5db"];
  const chartGrid = isDark ? "#1b3d28" : "#eef0f3";
  const chartMuted = isDark ? "#8da596" : "#94a3b8";
  const chartPrimary = isDark ? "#7cff45" : "#111827";
  const chartSecondary = isDark ? "#7f93a5" : "#94a3b8";
  const tooltipStyle = {
    borderRadius: 12,
    border: `1px solid ${isDark ? "#28553a" : "#e2e8f0"}`,
    background: isDark ? "#0a1b11" : "#ffffff",
    color: isDark ? "#f7fff3" : "#0f172a",
    fontSize: 11,
    boxShadow: "0 14px 40px rgba(0,0,0,0.16)",
  };
  const kpis = [
    { label: "Orders", value: ordersInRange.length.toLocaleString(), meta: "Last 30 days", Icon: ShoppingBag, tone: "violet" },
    { label: "Revenue", value: formatWholeMoney(metrics.revenue), meta: "Mauritian Rupees · 30 days", Icon: TrendingUp, tone: "green" },
    { label: "Pending Prints", value: metrics.pending.toLocaleString(), meta: "Live production queue", Icon: Printer, tone: "orange" },
    { label: "Delivered Orders", value: metrics.delivered.toLocaleString(), meta: "Last 30 days", Icon: Truck, tone: "blue" },
    { label: "Website Traffic", value: metrics.pageViews.toLocaleString(), meta: `${metrics.sessions.toLocaleString()} Mauritius sessions`, Icon: Globe2, tone: "rose" },
    { label: "Conversion Rate", value: `${metrics.conversion.toFixed(1)}%`, meta: `${metrics.leads} tracked leads`, Icon: CirclePercent, tone: "teal" },
  ];
  const toneClasses: Record<string, string> = isDark
    ? {
        violet: "bg-violet-400/10 text-violet-300 ring-violet-400/20",
        green: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
        orange: "bg-orange-400/10 text-orange-300 ring-orange-400/20",
        blue: "bg-blue-400/10 text-blue-300 ring-blue-400/20",
        rose: "bg-rose-400/10 text-rose-300 ring-rose-400/20",
        teal: "bg-teal-400/10 text-teal-300 ring-teal-400/20",
      }
    : {
        violet: "bg-violet-50 text-violet-600 ring-violet-100",
        green: "bg-emerald-50 text-emerald-600 ring-emerald-100",
        orange: "bg-orange-50 text-orange-600 ring-orange-100",
        blue: "bg-blue-50 text-blue-600 ring-blue-100",
        rose: "bg-rose-50 text-rose-600 ring-rose-100",
        teal: "bg-teal-50 text-teal-600 ring-teal-100",
      };
  const accentLinkClass = isDark ? "text-[#7cff45] hover:text-[#a6ff7f]" : "text-blue-600 hover:text-blue-700";
  const mutedTextClass = isDark ? "text-[#81978a]" : "text-slate-400";
  const dividerClass = isDark ? "border-[#1b3d28]" : "border-slate-100";

  return (
    <div className={`${font.className} admin-dashboard-shell min-h-[calc(100dvh-4rem)] w-full min-w-0 max-w-full overflow-x-clip ${isDark ? "bg-[#020805] text-[#f7fff3]" : "bg-[#f7f8fa] text-slate-950"}`}>
      <main className="admin-dashboard-main min-w-0 max-w-full p-3 sm:p-5 lg:p-6">
          <div className="mb-4 flex min-w-0 items-end justify-between gap-3 sm:mb-5 sm:gap-4">
            <div>
              <h1 className="text-lg font-extrabold tracking-[-0.03em] sm:text-xl">Mauritius Business Dashboard</h1>
              <p className={`mt-1 text-[11px] sm:text-xs ${isDark ? "text-[#9fb3a6]" : "text-slate-500"}`}>Live operational data · {format(now, "EEEE, d MMMM yyyy")}</p>
              <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold sm:hidden ${isDark ? "bg-white/[0.07] text-[#b9cbbf]" : "bg-white text-slate-500 shadow-sm"}`}>Numerology {numerology.primary}/{numerology.secondary}</span>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <span className={`rounded-full px-3 py-1.5 text-[10px] font-semibold ${isDark ? "bg-white/[0.07] text-[#b9cbbf]" : "bg-white text-slate-500 shadow-sm"}`}>Numerology {numerology.primary}/{numerology.secondary}</span>
              <span className={`text-[11px] ${isDark ? "text-[#809488]" : "text-slate-400"}`}>Live Firestore sources</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {kpis.map(({ label, value, meta, Icon, tone }) => (
              <Panel key={label} className="p-4">
                <div className="flex items-start gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${toneClasses[tone]}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className={`text-[11px] font-semibold ${isDark ? "text-[#b7c8bc]" : "text-slate-600"}`}>{label}</div>
                    <div className="mt-1 truncate text-xl font-extrabold tracking-[-0.04em]">{value}</div>
                  </div>
                </div>
                <div className={`mt-3 truncate text-[10px] ${isDark ? "text-[#81978a]" : "text-slate-400"}`}>{meta}</div>
              </Panel>
            ))}
          </div>

          <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,.9fr)_minmax(0,1.15fr)]">
            <Panel className="min-h-[280px] overflow-hidden p-3 sm:min-h-[290px] sm:p-4">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <h2 className="min-w-0 text-sm font-extrabold">Sales Trend</h2>
                <span className={`shrink-0 rounded-md border px-2.5 py-1 text-[10px] ${isDark ? "border-[#28553a] text-[#9fb3a6]" : "border-slate-200 text-slate-500"}`}>Last 30 days</span>
              </div>
              <div className="mt-4 h-[220px] w-full min-w-0 overflow-hidden sm:h-[225px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={salesTrend} margin={{ top: 5, right: 6, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={chartGrid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: chartMuted }} interval={6} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: chartMuted }} axisLine={false} tickLine={false} tickFormatter={(value) => `Rs ${Math.round(value / 1000)}k`} />
                    <Tooltip formatter={(value) => formatWholeMoney(Number(value))} labelStyle={{ fontWeight: 700 }} contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="revenue" stroke={chartPrimary} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel className="min-h-[290px] overflow-hidden p-3 sm:p-4">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <h2 className="min-w-0 text-sm font-extrabold">Orders by Product</h2>
                <span className={`shrink-0 text-[10px] ${isDark ? "text-[#81978a]" : "text-slate-400"}`}>Real order lines</span>
              </div>
              {productMix.length ? (
                <div className="mt-3 grid min-w-0 grid-cols-1 items-center gap-2 sm:mt-4 sm:grid-cols-[145px_minmax(0,1fr)] sm:gap-3">
                  <div className="mx-auto h-[150px] w-full max-w-[190px] sm:h-[190px]">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <PieChart>
                        <Pie data={productMix} dataKey="quantity" nameKey="name" innerRadius={40} outerRadius={68} paddingAngle={1} stroke={isDark ? "#07150d" : "#ffffff"} strokeWidth={2}>
                          {productMix.map((item, index) => <Cell key={item.name} fill={pieColors[index % pieColors.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="min-w-0 space-y-2.5 sm:space-y-3">
                    {productMix.map((item, index) => (
                      <div key={item.name} className="flex min-w-0 items-center justify-between gap-2 text-[10px]">
                        <span className="flex min-w-0 flex-1 items-center gap-2"><i className="h-2 w-2 shrink-0 rounded-full" style={{ background: pieColors[index] }} /><span className="truncate">{item.name}</span></span>
                        <strong className="shrink-0">{item.percent}%</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <div className="grid h-[225px] place-items-center text-xs text-slate-400">Waiting for product order lines</div>}
            </Panel>

            <Panel className="min-h-[280px] overflow-hidden p-3 sm:min-h-[290px] sm:p-4">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <h2 className="min-w-0 truncate text-sm font-extrabold">Mauritius Website Traffic</h2>
                <span className={`shrink-0 rounded-md border px-2.5 py-1 text-[10px] ${isDark ? "border-[#28553a] text-[#9fb3a6]" : "border-slate-200 text-slate-500"}`}>Last 30 days</span>
              </div>
              <div className="mt-4 h-[220px] w-full min-w-0 overflow-hidden sm:h-[225px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={trafficTrend} margin={{ top: 5, right: 6, left: -26, bottom: 0 }}>
                    <CartesianGrid stroke={chartGrid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: chartMuted }} interval={6} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: chartMuted }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="pageViews" name="Page views" stroke={chartSecondary} strokeWidth={1.6} strokeDasharray="5 4" dot={false} />
                    <Line type="monotone" dataKey="visitors" name="Visitors" stroke={chartPrimary} strokeWidth={2.4} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2 2xl:grid-cols-[minmax(0,1.65fr)_minmax(0,.72fr)_minmax(0,.72fr)_minmax(0,.78fr)]">
            <Panel className="overflow-hidden xl:col-span-2 2xl:col-span-1">
              <div className={`flex items-center justify-between border-b px-3 py-3 sm:px-4 ${dividerClass}`}>
                <h2 className="text-sm font-extrabold">Recent Orders</h2>
                <Link href="/admin/orders" className={`text-[10px] font-bold ${accentLinkClass}`}>View all orders</Link>
              </div>
              <div className="space-y-2 p-3 sm:hidden">
                {orders.slice(0, 6).map((order) => (
                  <Link
                    key={order.id}
                    href="/admin/orders"
                    className={`block min-w-0 rounded-xl border p-3 ${isDark ? "border-[#1b3d28] bg-white/[0.025]" : "border-slate-200 bg-slate-50/70"}`}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <span className={`truncate text-[10px] font-bold ${accentLinkClass}`}>#{order.id.slice(0, 8).toUpperCase()}</span>
                      <span className="shrink-0 text-xs font-bold">{formatWholeMoney(order.amount)}</span>
                    </div>
                    <div className="mt-2 truncate text-xs font-semibold">{order.client}</div>
                    <div className={`mt-0.5 truncate text-[10px] ${mutedTextClass}`}>{order.lines[0]?.name || "Custom order"}</div>
                    <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                      <span className={`min-w-0 truncate rounded-md px-2 py-1 text-[9px] font-semibold ring-1 ring-inset ${statusTone(order.status, isDark)}`}>{order.status}</span>
                      <span className={`shrink-0 text-[9px] ${mutedTextClass}`}>{order.date ? format(order.date, "d MMM yyyy") : "No date"}</span>
                    </div>
                  </Link>
                ))}
                {!orders.length ? <div className={`py-8 text-center text-xs ${mutedTextClass}`}>No recent orders.</div> : null}
              </div>
              <div className="hidden min-w-0 max-w-full overflow-x-auto overscroll-x-contain sm:block">
                <table className="w-[650px] min-w-[650px] max-w-none table-fixed text-left text-[10px] lg:w-full lg:min-w-[650px]">
                  <thead className={isDark ? "bg-white/[0.035] text-[#9fb3a6]" : "bg-slate-50/70 text-slate-500"}>
                    <tr>{["Order ID", "Customer", "Product", "Amount", "Status", "Delivery", "Date"].map((label) => <th key={label} className="px-3 py-2.5 font-semibold">{label}</th>)}</tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? "divide-[#1b3d28]" : "divide-slate-100"}`}>
                    {orders.slice(0, 6).map((order) => (
                      <tr key={order.id} className={isDark ? "hover:bg-white/[0.025]" : "hover:bg-slate-50/70"}>
                        <td className={`px-3 py-3 font-bold ${accentLinkClass}`}>#{order.id.slice(0, 8).toUpperCase()}</td>
                        <td className="px-3 py-3 font-semibold">{order.client}</td>
                        <td className="max-w-[150px] truncate px-3 py-3">{order.lines[0]?.name || "Custom order"}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold">{formatWholeMoney(order.amount)}</td>
                        <td className="px-3 py-3"><span className={`whitespace-nowrap rounded-md px-2 py-1 font-semibold ring-1 ring-inset ${statusTone(order.status, isDark)}`}>{order.status}</span></td>
                        <td className="px-3 py-3">{order.deliveryMethod}</td>
                        <td className={`whitespace-nowrap px-3 py-3 ${isDark ? "text-[#9fb3a6]" : "text-slate-500"}`}>{order.date ? format(order.date, "d MMM yyyy") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel className="p-3 sm:p-4">
              <div className="flex items-center justify-between"><h2 className="text-sm font-extrabold">Top Products</h2><Link href="/admin/analytics" className={`text-[10px] font-bold ${accentLinkClass}`}>View all</Link></div>
              <div className="mt-4 space-y-3">
                {productPerformance.slice(0, 5).map((item, index) => (
                  <div key={item.name} className="flex min-w-0 items-center gap-2.5">
                    <span className="w-3 shrink-0 text-[10px] font-bold">{index + 1}</span>
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-[#f2f4f7]"><Image src={PRODUCT_IMAGES[index % PRODUCT_IMAGES.length]} alt="" fill className="object-contain p-1" sizes="36px" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-bold">{item.name}</span><span className={`text-[9px] ${mutedTextClass}`}>{item.quantity} sold</span></span>
                  </div>
                ))}
                {!productPerformance.length ? <div className={`text-[10px] ${mutedTextClass}`}>No product sales in this period.</div> : null}
              </div>
            </Panel>

            <Panel className="p-3 sm:p-4">
              <div className="flex items-center justify-between"><h2 className="text-sm font-extrabold">Inventory</h2><Link href="/admin/inventory" className={`text-[10px] font-bold ${accentLinkClass}`}>View all</Link></div>
              <div className={`mt-3 rounded-lg p-3 text-center ${isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}><div className="text-2xl font-extrabold">{inventory.totalUnits.toLocaleString()}</div><div className={`text-[9px] ${mutedTextClass}`}>units tracked in Mauritius</div></div>
              <div className="mt-3 space-y-2">
                {inventory.alerts.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex min-w-0 items-center justify-between gap-2 text-[10px]"><span className="min-w-0 flex-1 truncate">{item.name} · {item.color}</span><strong className={`shrink-0 ${item.quantity === 0 ? (isDark ? "text-rose-300" : "text-rose-600") : (isDark ? "text-amber-300" : "text-amber-600")}`}>{item.quantity}</strong></div>
                ))}
              </div>
              <div className={`mt-4 flex items-center justify-between rounded-lg px-3 py-2 text-[10px] font-semibold ${isDark ? "bg-rose-400/10 text-rose-300" : "bg-rose-50 text-rose-700"}`}><span>Low stock alert</span><span>{inventory.alerts.length} items</span></div>
            </Panel>

            <Panel className="p-3 sm:p-4">
              <div className="flex items-center justify-between"><h2 className="text-sm font-extrabold">Print Queue</h2><Link href="/admin/production" className={`text-[10px] font-bold ${accentLinkClass}`}>View all</Link></div>
              <div className="mt-4 space-y-4">
                {productionQueue.map((order, index) => {
                  const quantity = order.lines.reduce((sum, line) => sum + line.quantity, 0);
                  const quantityWidth = Math.max(8, (quantity / maxProductionQuantity) * 100);
                  return (
                    <div key={order.id}>
                      <div className="flex items-center gap-2">
                        <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-[#f2f4f7]"><Image src={PRODUCT_IMAGES[index % PRODUCT_IMAGES.length]} alt="" fill className="object-contain p-1" sizes="36px" /></span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-bold">{order.lines[0]?.name || order.client}</span><span className={`text-[9px] ${mutedTextClass}`}>{order.status} · Qty {quantity}</span></span>
                      </div>
                      <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${isDark ? "bg-white/[0.08]" : "bg-slate-100"}`} title={`${quantity} items`}><div className="h-full rounded-full bg-[#ff6400]" style={{ width: `${quantityWidth}%` }} /></div>
                    </div>
                  );
                })}
                {!productionQueue.length ? <div className={`rounded-lg px-3 py-2 text-[10px] font-semibold ${isDark ? "bg-emerald-400/10 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}>Production queue is clear.</div> : null}
              </div>
            </Panel>
          </div>

          <footer className={`mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-[10px] ${isDark ? "border-[#1b3d28] text-[#81978a]" : "border-slate-200 text-slate-400"}`}>
            <span>© {now.getFullYear()} Mo T-Shirt · Ryan Chutooree</span>
            <span>Made with ♥ in Mauritius</span>
          </footer>
      </main>
    </div>
  );
}
