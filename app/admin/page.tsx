"use client";

import Image from "next/image";
import Link from "next/link";
import { Manrope } from "next/font/google";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  CirclePercent,
  ExternalLink,
  FileStack,
  Globe2,
  LayoutDashboard,
  Menu,
  MessageSquare,
  PackageCheck,
  Paintbrush,
  Printer,
  Search,
  Settings,
  ShoppingBag,
  TrendingUp,
  Truck,
  Users,
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

function statusTone(status: string) {
  const value = status.toLowerCase();
  if (value.includes("deliver") || value.includes("complete")) return "bg-emerald-50 text-emerald-700 ring-emerald-600/10";
  if (value.includes("cancel") || value.includes("refund")) return "bg-rose-50 text-rose-700 ring-rose-600/10";
  if (value.includes("print") || value.includes("process")) return "bg-blue-50 text-blue-700 ring-blue-600/10";
  return "bg-amber-50 text-amber-700 ring-amber-600/10";
}

const navItems = [
  { label: "Dashboard", href: "/admin", Icon: LayoutDashboard },
  { label: "Orders", href: "/admin/orders", Icon: ShoppingBag },
  { label: "Products", href: "/admin/shops", Icon: Boxes },
  { label: "Custom Designs", href: "/admin/design-studio", Icon: Paintbrush },
  { label: "Customers", href: "/admin/clients", Icon: Users },
  { label: "Inventory", href: "/admin/inventory", Icon: PackageCheck },
  { label: "Delivery", href: "/admin/logistics", Icon: Truck },
  { label: "Production", href: "/admin/production", Icon: Printer },
  { label: "Analytics", href: "/admin/analytics", Icon: BarChart3 },
  { label: "Settings", href: "/admin/settings", Icon: Settings },
];

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200/80 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.035)] ${className}`}>{children}</section>;
}

export default function AdminDashboard() {
  const [now, setNow] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState("");
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
  const filteredOrders = useMemo(() => {
    const queryValue = searchTerm.trim().toLowerCase();
    if (!queryValue) return orders;
    return orders.filter((order) =>
      [order.id, order.client, order.status, order.deliveryMethod, ...order.lines.map((line) => line.name)]
        .join(" ")
        .toLowerCase()
        .includes(queryValue)
    );
  }, [orders, searchTerm]);

  const numerology = useMemo(() => calculateNumerology(now), [now]);
  const pieColors = ["#111827", "#374151", "#6b7280", "#9ca3af", "#d1d5db"];
  const kpis = [
    { label: "Orders", value: ordersInRange.length.toLocaleString(), meta: "Last 30 days", Icon: ShoppingBag, tone: "violet" },
    { label: "Revenue", value: formatWholeMoney(metrics.revenue), meta: "Mauritian Rupees · 30 days", Icon: TrendingUp, tone: "green" },
    { label: "Pending Prints", value: metrics.pending.toLocaleString(), meta: "Live production queue", Icon: Printer, tone: "orange" },
    { label: "Delivered Orders", value: metrics.delivered.toLocaleString(), meta: "Last 30 days", Icon: Truck, tone: "blue" },
    { label: "Website Traffic", value: metrics.pageViews.toLocaleString(), meta: `${metrics.sessions.toLocaleString()} Mauritius sessions`, Icon: Globe2, tone: "rose" },
    { label: "Conversion Rate", value: `${metrics.conversion.toFixed(1)}%`, meta: `${metrics.leads} tracked leads`, Icon: CirclePercent, tone: "teal" },
  ];
  const toneClasses: Record<string, string> = {
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
    green: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    orange: "bg-orange-50 text-orange-600 ring-orange-100",
    blue: "bg-blue-50 text-blue-600 ring-blue-100",
    rose: "bg-rose-50 text-rose-600 ring-rose-100",
    teal: "bg-teal-50 text-teal-600 ring-teal-100",
  };

  return (
    <div className={`${font.className} min-h-screen bg-[#f7f8fa] text-slate-950`}>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[228px] flex-col bg-[#071015] text-white lg:flex">
        <Link href="/admin" className="flex h-[84px] items-center gap-3 border-b border-white/5 px-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white">
            <Image src="/logo_transparent.png" alt="MO T-SHIRT" width={80} height={80} className="h-10 w-10 object-contain" />
          </span>
          <span>
            <span className="block text-xl font-extrabold tracking-[-0.03em]">Mo T-Shirt</span>
            <span className="block text-[10px] text-white/55">Wear Your Creativity</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Dashboard navigation">
          {navItems.map(({ label, href, Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${
                href === "/admin" ? "bg-white text-slate-950 shadow-sm" : "text-white/72 hover:bg-white/8 hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="m-4 rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <div className="relative h-24 overflow-hidden rounded-lg bg-white/5">
            <Image src="/all_products.jpg" alt="MO T-SHIRT products in Mauritius" fill className="object-cover opacity-75" sizes="190px" />
          </div>
          <div className="mt-3 text-sm font-bold">Create. Print. Impress.</div>
          <div className="mt-1 text-[11px] leading-4 text-white/55">Premium custom T-shirts, printed in Mauritius.</div>
          <Link href="/" className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold hover:bg-white/10">
            Visit Store <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[228px]">
        <header className="sticky top-0 z-30 flex h-[64px] items-center gap-4 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-xl sm:px-6">
          <Menu className="h-5 w-5 text-slate-700" />
          <div className="relative hidden max-w-[520px] flex-1 sm:block">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Search admin"
              placeholder="Search orders, customers, products, designs..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-11 pr-4 text-xs outline-none transition placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>
          <div className="ml-auto flex items-center gap-3 sm:gap-5">
            <div className="hidden items-center gap-2 border-r border-slate-200 pr-5 text-xs font-medium sm:flex">
              <span className="text-lg" aria-hidden>🇲🇺</span> Mauritius
            </div>
            <div className="hidden items-center rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600 md:flex">
              Numerology {numerology.primary}/{numerology.secondary}
            </div>
            <button className="relative text-slate-700" aria-label="Notifications">
              <Bell className="h-[18px] w-[18px]" />
              {metrics.pending > 0 ? <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white">{Math.min(metrics.pending, 99)}</span> : null}
            </button>
            <MessageSquare className="hidden h-[18px] w-[18px] text-slate-700 sm:block" />
            <div className="hidden h-8 w-px bg-slate-200 sm:block" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-[11px] font-bold text-white">RC</div>
              <div className="hidden leading-tight xl:block">
                <div className="text-xs font-bold">Ryan Chutooree</div>
                <div className="text-[10px] text-slate-500">Administrator · Mauritius</div>
              </div>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 xl:block" />
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-extrabold tracking-[-0.03em]">Mauritius Business Dashboard</h1>
              <p className="mt-1 text-xs text-slate-500">Live operational data · {format(now, "EEEE, d MMMM yyyy")}</p>
            </div>
            <span className="hidden text-[11px] text-slate-400 sm:block">Sources: transactions, inventory and website tracking</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {kpis.map(({ label, value, meta, Icon, tone }) => (
              <Panel key={label} className="p-4">
                <div className="flex items-start gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${toneClasses[tone]}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-600">{label}</div>
                    <div className="mt-1 truncate text-xl font-extrabold tracking-[-0.04em]">{value}</div>
                  </div>
                </div>
                <div className="mt-3 truncate text-[10px] text-slate-400">{meta}</div>
              </Panel>
            ))}
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.9fr_1.15fr]">
            <Panel className="min-h-[290px] p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold">Sales Trend</h2>
                <span className="rounded-md border border-slate-200 px-2.5 py-1 text-[10px] text-slate-500">Last 30 days</span>
              </div>
              <div className="mt-4 h-[225px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesTrend} margin={{ top: 5, right: 6, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#eef0f3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={6} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(value) => `Rs ${Math.round(value / 1000)}k`} />
                    <Tooltip formatter={(value) => formatWholeMoney(Number(value))} labelStyle={{ fontWeight: 700 }} />
                    <Line type="monotone" dataKey="revenue" stroke="#111827" strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel className="min-h-[290px] p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold">Orders by Product</h2>
                <span className="text-[10px] text-slate-400">Real order lines</span>
              </div>
              {productMix.length ? (
                <div className="mt-4 grid grid-cols-[145px_1fr] items-center gap-3">
                  <div className="h-[190px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={productMix} dataKey="quantity" nameKey="name" innerRadius={43} outerRadius={70} paddingAngle={1} stroke="white" strokeWidth={2}>
                          {productMix.map((item, index) => <Cell key={item.name} fill={pieColors[index % pieColors.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    {productMix.map((item, index) => (
                      <div key={item.name} className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="flex min-w-0 items-center gap-2"><i className="h-2 w-2 shrink-0 rounded-full" style={{ background: pieColors[index] }} /><span className="truncate">{item.name}</span></span>
                        <strong>{item.percent}%</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <div className="grid h-[225px] place-items-center text-xs text-slate-400">Waiting for product order lines</div>}
            </Panel>

            <Panel className="min-h-[290px] p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold">Mauritius Website Traffic</h2>
                <span className="rounded-md border border-slate-200 px-2.5 py-1 text-[10px] text-slate-500">Last 30 days</span>
              </div>
              <div className="mt-4 h-[225px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trafficTrend} margin={{ top: 5, right: 6, left: -26, bottom: 0 }}>
                    <CartesianGrid stroke="#eef0f3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={6} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="pageViews" name="Page views" stroke="#94a3b8" strokeWidth={1.6} strokeDasharray="5 4" dot={false} />
                    <Line type="monotone" dataKey="visitors" name="Visitors" stroke="#111827" strokeWidth={2.4} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.65fr_0.72fr_0.72fr_0.78fr]">
            <Panel className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-extrabold">Recent Orders</h2>
                <Link href="/admin/orders" className="text-[10px] font-bold text-blue-600">View all orders</Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-[10px]">
                  <thead className="bg-slate-50/70 text-slate-500">
                    <tr>{["Order ID", "Customer", "Product", "Amount", "Status", "Delivery", "Date"].map((label) => <th key={label} className="px-3 py-2.5 font-semibold">{label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.slice(0, 6).map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-3 font-bold text-blue-600">#{order.id.slice(0, 8).toUpperCase()}</td>
                        <td className="px-3 py-3 font-semibold">{order.client}</td>
                        <td className="max-w-[150px] truncate px-3 py-3">{order.lines[0]?.name || "Custom order"}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold">{formatWholeMoney(order.amount)}</td>
                        <td className="px-3 py-3"><span className={`whitespace-nowrap rounded-md px-2 py-1 font-semibold ring-1 ring-inset ${statusTone(order.status)}`}>{order.status}</span></td>
                        <td className="px-3 py-3">{order.deliveryMethod}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-500">{order.date ? format(order.date, "d MMM yyyy") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel className="p-4">
              <div className="flex items-center justify-between"><h2 className="text-sm font-extrabold">Top Products</h2><Link href="/admin/analytics" className="text-[10px] font-bold text-blue-600">View all</Link></div>
              <div className="mt-4 space-y-3">
                {productPerformance.slice(0, 5).map((item, index) => (
                  <div key={item.name} className="flex items-center gap-2.5">
                    <span className="w-3 text-[10px] font-bold">{index + 1}</span>
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-slate-100"><Image src={PRODUCT_IMAGES[index % PRODUCT_IMAGES.length]} alt="" fill className="object-contain p-1" sizes="36px" /></span>
                    <span className="min-w-0"><span className="block truncate text-[10px] font-bold">{item.name}</span><span className="text-[9px] text-slate-400">{item.quantity} sold</span></span>
                  </div>
                ))}
                {!productPerformance.length ? <div className="text-[10px] text-slate-400">No product sales in this period.</div> : null}
              </div>
            </Panel>

            <Panel className="p-4">
              <div className="flex items-center justify-between"><h2 className="text-sm font-extrabold">Inventory</h2><Link href="/admin/inventory" className="text-[10px] font-bold text-blue-600">View all</Link></div>
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-center"><div className="text-2xl font-extrabold">{inventory.totalUnits.toLocaleString()}</div><div className="text-[9px] text-slate-400">units tracked in Mauritius</div></div>
              <div className="mt-3 space-y-2">
                {inventory.alerts.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 text-[10px]"><span className="truncate">{item.name} · {item.color}</span><strong className={item.quantity === 0 ? "text-rose-600" : "text-amber-600"}>{item.quantity}</strong></div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-[10px] font-semibold text-rose-700"><span>Low stock alert</span><span>{inventory.alerts.length} items</span></div>
            </Panel>

            <Panel className="p-4">
              <div className="flex items-center justify-between"><h2 className="text-sm font-extrabold">Print Queue</h2><Link href="/admin/production" className="text-[10px] font-bold text-blue-600">View all</Link></div>
              <div className="mt-4 space-y-4">
                {productionQueue.map((order, index) => {
                  const quantity = order.lines.reduce((sum, line) => sum + line.quantity, 0);
                  const quantityWidth = Math.max(8, (quantity / maxProductionQuantity) * 100);
                  return (
                    <div key={order.id}>
                      <div className="flex items-center gap-2">
                        <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-slate-100"><Image src={PRODUCT_IMAGES[index % PRODUCT_IMAGES.length]} alt="" fill className="object-contain p-1" sizes="36px" /></span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-bold">{order.lines[0]?.name || order.client}</span><span className="text-[9px] text-slate-400">{order.status} · Qty {quantity}</span></span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" title={`${quantity} items`}><div className="h-full rounded-full bg-slate-950" style={{ width: `${quantityWidth}%` }} /></div>
                    </div>
                  );
                })}
                {!productionQueue.length ? <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[10px] font-semibold text-emerald-700">Production queue is clear.</div> : null}
              </div>
            </Panel>
          </div>

          <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 text-[10px] text-slate-400">
            <span>© {now.getFullYear()} Mo T-Shirt · Ryan Chutooree</span>
            <span>Made with ♥ in Mauritius</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
