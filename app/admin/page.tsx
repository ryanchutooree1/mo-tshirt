"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import { format } from "date-fns";
import { Info, TrendingUp, Package, RefreshCcw, Clock, Users, Plus, Trash2, CheckCircle2, Circle } from "lucide-react";
import { useAdminMetrics } from "@/admin/AdminDataContext";

// ---------- Types ----------
type SizeMap = Record<string, number>;
type ColorBlock = { color: string; sizes: SizeMap };
type Product = { id: string; productName: string; colors: ColorBlock[] };
type Order = { client?: string; amount?: number; status?: string; date?: string };

// ---------- Numerology helpers ----------
function sumDigits(n: number) {
  return n.toString().split("").map((d) => Number(d)).reduce((a, b) => a + b, 0);
}
function sumDigitsOfString(s: string) {
  return s.split("").reduce((acc, ch) => acc + (/\d/.test(ch) ? Number(ch) : 0), 0);
}
function reduceToMaster(n: number) {
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) n = sumDigits(n);
  return n;
}
function secondaryFromDay(day: number) {
  if ([2, 20, 11, 22, 33].includes(day)) return day;
  return reduceToMaster(sumDigits(day));
}
function calcNumerology(date: Date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return {
    primary: reduceToMaster(sumDigitsOfString(dd + mm + yyyy)),
    secondary: secondaryFromDay(date.getDate()),
  };
}

// ---------- Dashboard ----------
export default function OwnerDashboard() {
  // Local inline icon for Mauritian Rupees ("Rs")
  const RsIcon = (props: any) => (
    <span
      className={`${props?.className || ""} inline-flex items-center justify-center font-semibold`}
    >
      Rs
    </span>
  );
  const adminId = "mo-owner";
  const global = useAdminMetrics();
  const todayIso = format(new Date(), "yyyy-MM-dd");

  // Live clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const numerologyToday = useMemo(() => calcNumerology(now), [now]);
  const tomorrowCalc = useMemo(() => {
    const d = new Date(now); d.setDate(d.getDate() + 1);
    return { dateStr: format(d, "dd/MM/yyyy"), ...calcNumerology(d) };
  }, [now]);
  const formattedDate = format(now, "dd/MM/yyyy");
  const timeString = format(now, "HH:mm:ss");

  // Checklist
  const [tasks, setTasks] = useState<{ title: string; completed: boolean }[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  // Stats
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [repeatClients, setRepeatClients] = useState(0);
  const [deliveredToday, setDeliveredToday] = useState(0);
  const [latestOrders, setLatestOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [efficiencyValue, setEfficiencyValue] = useState(0);

  // Pricing & profitability studio
  const [pricingModel, setPricingModel] = useState({
    blankTee: 180,
    blankPolo: 300,
    blankCap: 200,
    screenSetupPerColor: 600,
    screenInkPerColor: 25,
    dtfPerPrint: 90,
    dtgPerPrint: 160,
    embroideryPerItem: 140,
    digitizeFee: 800,
    laborPerUnit: 40,
    overheadPerOrder: 200,
    personalizationPerItem: 60,
    targetMargin: 0.5,
    rushPct: 0.2,
  });
  const [quote, setQuote] = useState({
    itemType: "T-Shirt",
    method: "Screen",
    qty: 48,
    colors: 2,
    locations: 1,
    rush: false,
    personalization: false,
    artworkFee: 0,
    quotedUnitPrice: 0,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem("mo-pricing-v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.model) setPricingModel((m) => ({ ...m, ...parsed.model }));
      if (parsed?.quote) setQuote((q) => ({ ...q, ...parsed.quote }));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("mo-pricing-v1", JSON.stringify({ model: pricingModel, quote }));
    } catch {}
  }, [pricingModel, quote]);

  const progressPct = tasks.length ? Math.round((tasks.filter((t) => t.completed).length / tasks.length) * 100) : 0;

  const { todaysOrdersCount, aov } = useMemo(() => {
    const todays = latestOrders.filter((o) => o.date === todayIso);
    const count = todays.length || 0;
    const rev = todays.reduce((sum, o) => sum + (o.amount || 0), 0);
    return { todaysOrdersCount: count, aov: count ? Math.round(rev / count) : 0 };
  }, [latestOrders, todayIso]);

  const panelClass = "rounded-3xl border border-slate-200/70 bg-white/90 shadow-sm backdrop-blur";
  const progressDeg = Math.min(100, Math.max(0, progressPct)) * 3.6;
  const kpiCards = [
    { label: "Today’s Revenue", value: `Rs ${(global?.todayRevenue ?? todayRevenue).toLocaleString()}`, icon: RsIcon, href: "/admin/analytics?preset=7d", tone: "sky", sub: "Live revenue" },
    { label: "Orders Today", value: global?.ordersToday ?? todaysOrdersCount, icon: Package, href: "/admin/orders?range=today", tone: "emerald", sub: "Order velocity" },
    { label: "AOV Today", value: global?.aovToday ? `Rs ${(global?.aovToday ?? aov).toLocaleString()}` : (aov ? `Rs ${aov.toLocaleString()}` : "—"), icon: TrendingUp, href: "/admin/orders?range=today", tone: "amber", sub: "Average order value" },
    { label: "Pending Orders", value: global?.pendingOrders ?? pendingOrders, icon: Clock, href: "/admin/orders?status=Pending", tone: "rose", sub: "Need attention" },
    { label: "Repeat Clients", value: global?.repeatClientsCount ?? repeatClients, icon: Users, href: "/admin/clients?filter=repeat", tone: "violet", sub: "Returning customers" },
    { label: "Efficiency", value: `${global?.efficiencyPct ?? efficiencyValue}%`, icon: RefreshCcw, href: "/admin/analytics?view=ev", tone: "slate", sub: "Fulfillment pace" },
  ] as const;
  const toneMap = {
    sky: {
      border: "border-sky-100",
      bg: "from-sky-50 via-white to-white",
      accent: "bg-sky-100 text-sky-700",
      glow: "bg-sky-200/40",
    },
    emerald: {
      border: "border-emerald-100",
      bg: "from-emerald-50 via-white to-white",
      accent: "bg-emerald-100 text-emerald-700",
      glow: "bg-emerald-200/40",
    },
    amber: {
      border: "border-amber-100",
      bg: "from-amber-50 via-white to-white",
      accent: "bg-amber-100 text-amber-700",
      glow: "bg-amber-200/40",
    },
    rose: {
      border: "border-rose-100",
      bg: "from-rose-50 via-white to-white",
      accent: "bg-rose-100 text-rose-700",
      glow: "bg-rose-200/40",
    },
    violet: {
      border: "border-violet-100",
      bg: "from-violet-50 via-white to-white",
      accent: "bg-violet-100 text-violet-700",
      glow: "bg-violet-200/40",
    },
    slate: {
      border: "border-slate-200",
      bg: "from-slate-50 via-white to-white",
      accent: "bg-slate-100 text-slate-700",
      glow: "bg-slate-200/40",
    },
  } as const;
  const money = (v: number) => `Rs ${Math.round(v || 0).toLocaleString()}`;
  const pricingFieldClass =
    "bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-200";

  const pricing = useMemo(() => {
    const qty = Math.max(1, Number(quote.qty) || 1);
    const colors = Math.max(1, Number(quote.colors) || 1);
    const locations = Math.max(1, Number(quote.locations) || 1);
    const blankCost = quote.itemType === "Polo"
      ? pricingModel.blankPolo
      : quote.itemType === "Cap"
      ? pricingModel.blankCap
      : pricingModel.blankTee;

    let printUnit = 0;
    let setupFee = 0;
    let extraFixed = 0;

    if (quote.method === "Screen") {
      printUnit = pricingModel.screenInkPerColor * colors * locations;
      setupFee = pricingModel.screenSetupPerColor * colors * locations;
    } else if (quote.method === "DTF") {
      printUnit = pricingModel.dtfPerPrint * locations;
    } else if (quote.method === "DTG") {
      printUnit = pricingModel.dtgPerPrint * locations;
    } else {
      printUnit = pricingModel.embroideryPerItem;
      extraFixed = pricingModel.digitizeFee;
    }

    const personalization = quote.personalization ? pricingModel.personalizationPerItem : 0;
    const unitVar = blankCost + printUnit + pricingModel.laborPerUnit + personalization;
    const fixed = pricingModel.overheadPerOrder + setupFee + extraFixed + (Number(quote.artworkFee) || 0);
    const unitCost = (unitVar * qty + fixed) / qty;
    const margin = Math.min(0.9, Math.max(0, pricingModel.targetMargin));
    const suggestedBase = unitCost / (1 - margin || 1);
    const rushMultiplier = quote.rush ? 1 + pricingModel.rushPct : 1;
    const suggestedUnit = suggestedBase * rushMultiplier;
    const quotedUnit = Number(quote.quotedUnitPrice) > 0 ? Number(quote.quotedUnitPrice) : suggestedUnit;
    const totalRevenue = quotedUnit * qty;
    const totalCost = unitVar * qty + fixed;
    const profit = totalRevenue - totalCost;
    const marginPct = totalRevenue ? profit / totalRevenue : 0;
    const breakEvenQty = quotedUnit > unitVar ? Math.ceil(fixed / (quotedUnit - unitVar)) : null;
    return {
      qty,
      colors,
      locations,
      blankCost,
      printUnit,
      unitVar,
      fixed,
      unitCost,
      suggestedUnit,
      quotedUnit,
      totalRevenue,
      totalCost,
      profit,
      marginPct,
      breakEvenQty,
      rushMultiplier,
    };
  }, [pricingModel, quote]);

  const priceBreaks = useMemo(() => {
    const tiers = [24, 50, 100, 250];
    return tiers.map((tierQty) => {
      const qty = Math.max(1, tierQty);
      const colors = Math.max(1, Number(quote.colors) || 1);
      const locations = Math.max(1, Number(quote.locations) || 1);
      const blankCost = quote.itemType === "Polo"
        ? pricingModel.blankPolo
        : quote.itemType === "Cap"
        ? pricingModel.blankCap
        : pricingModel.blankTee;
      let printUnit = 0;
      let setupFee = 0;
      let extraFixed = 0;
      if (quote.method === "Screen") {
        printUnit = pricingModel.screenInkPerColor * colors * locations;
        setupFee = pricingModel.screenSetupPerColor * colors * locations;
      } else if (quote.method === "DTF") {
        printUnit = pricingModel.dtfPerPrint * locations;
      } else if (quote.method === "DTG") {
        printUnit = pricingModel.dtgPerPrint * locations;
      } else {
        printUnit = pricingModel.embroideryPerItem;
        extraFixed = pricingModel.digitizeFee;
      }
      const personalization = quote.personalization ? pricingModel.personalizationPerItem : 0;
      const unitVar = blankCost + printUnit + pricingModel.laborPerUnit + personalization;
      const fixed = pricingModel.overheadPerOrder + setupFee + extraFixed + (Number(quote.artworkFee) || 0);
      const unitCost = (unitVar * qty + fixed) / qty;
      const margin = Math.min(0.9, Math.max(0, pricingModel.targetMargin));
      const suggestedBase = unitCost / (1 - margin || 1);
      const rushMultiplier = quote.rush ? 1 + pricingModel.rushPct : 1;
      const suggestedUnit = suggestedBase * rushMultiplier;
      return { qty, unitCost, suggestedUnit };
    });
  }, [pricingModel, quote]);

  const methodHint = useMemo(() => {
    if (quote.qty <= 24 && quote.method === "Screen") {
      return "Small runs usually favor DTF/DTG to avoid screen setup overhead.";
    }
    if (quote.qty >= 100 && (quote.method === "DTF" || quote.method === "DTG")) {
      return "Large runs with simple designs typically favor screen printing once setup is done.";
    }
    return "Match method to volume + design: screen for large repeats, DTF/DTG for small or photo-heavy jobs.";
  }, [quote.qty, quote.method]);

  // Checklist init
  useEffect(() => {
    (async () => {
      try {
        const ref = doc(db, "users", adminId, "checklists", todayIso);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setTasks(data?.tasks || []);
          setStreak(data?.streak || 0);
        } else {
          await setDoc(ref, { tasks: [], streak: 0 });
        }
      } catch (err) {
        console.error("checklist init error", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [adminId, todayIso]);

  // Orders fetch
  useEffect(() => {
    (async () => {
      try {
        const qy = query(collection(db, "orders"), orderBy("date", "desc"), limit(20));
        const qs = await getDocs(qy);
        let revenueToday = 0, pendingCount = 0, deliveredCount = 0, completedCount = 0, totalCount = 0;
        const ordersList: Order[] = [], clientSet = new Set<string>();

        qs.forEach((d) => {
          const data = d.data();
          ordersList.push(data);
          if (data.client) clientSet.add(String(data.client));
          if (data.date === todayIso) {
            revenueToday += data.amount || 0;
            if (data.status === "Pending") pendingCount++;
            if (data.status === "Delivered") deliveredCount++;
          }
          if (data.status === "Delivered") completedCount++;
          totalCount++;
        });

        setLatestOrders(ordersList);
        setTodayRevenue(revenueToday);
        setPendingOrders(pendingCount);
        setDeliveredToday(deliveredCount);
        setRepeatClients(clientSet.size);
        setEfficiencyValue(totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0);
      } catch (err) {
        console.error("orders fetch error", err);
      }
    })();
  }, [todayIso]);

  // Products fetch (with colors & sizes)
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "products"));
        const list: Product[] = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Product, "id">),
        }));
        setProducts(list);
      } catch (err) {
        console.error("products fetch error", err);
      }
    })();
  }, []);

  // Checklist actions/state
  const [newTask, setNewTask] = useState("");
  const checklistRef = useMemo(() => doc(db, "users", adminId, "checklists", todayIso), [adminId, todayIso]);

  async function persistChecklist(updatedTasks: { title: string; completed: boolean }[], nextStreak = streak) {
    try {
      await setDoc(checklistRef, { tasks: updatedTasks, streak: nextStreak }, { merge: true });
    } catch (err) {
      console.error("checklist persist error", err);
    }
  }

  const addTask = async () => {
    const title = newTask.trim();
    if (!title) return;
    const updated = [...tasks, { title, completed: false }];
    setTasks(updated);
    setNewTask("");
    await persistChecklist(updated, streak);
  };

  const toggleTask = async (idx: number) => {
    const updated = tasks.map((t, i) => (i === idx ? { ...t, completed: !t.completed } : t));
    setTasks(updated);
    const wasAllDone = tasks.length > 0 && tasks.every((t) => t.completed);
    const isAllDone = updated.length > 0 && updated.every((t) => t.completed);
    let nextStreak = streak;
    if (!wasAllDone && isAllDone) nextStreak = streak + 1;
    setStreak(nextStreak);
    await persistChecklist(updated, nextStreak);
  };

  const removeTask = async (idx: number) => {
    const updated = tasks.filter((_, i) => i !== idx);
    setTasks(updated);
    await persistChecklist(updated, streak);
  };

  // Search + low stock
  const [invSearch, setInvSearch] = useState("");
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [expandedColor, setExpandedColor] = useState<string | null>(null);

  const filteredProducts = products.filter((p) =>
    !invSearch.trim() || p.productName.toLowerCase().includes(invSearch.toLowerCase())
  );

  const lowStock = useMemo(() => {
    const lows: string[] = [];
    products.forEach((p) => {
      p.colors.forEach((c) => {
        const total = Object.values(c.sizes || {}).reduce((a, b) => a + (b || 0), 0);
        if (total > 0 && total < 10) lows.push(`${p.productName} • ${c.color}`);
      });
    });
    return lows.slice(0, 3);
  }, [products]);

  const insight = useMemo(() => {
    if (pendingOrders > deliveredToday) return "⚠️ Fulfilment lagging — clear the queue.";
    if (aov > 0 && aov >= 1500) return "💡 High AOV today — consider upsell bundles.";
    if (progressPct < 50) return "🚀 Push your checklist past 50% to keep streak alive.";
    if (lowStock.length) return `📦 Low stock: ${lowStock.join(", ")}`;
    return "✅ Systems normal. Keep compounding.";
  }, [pendingOrders, deliveredToday, aov, progressPct, lowStock]);

  if (loading) return <main className="min-h-screen bg-[#F5F5F7] p-6 text-[#1a1a1a] grid place-items-center">Loading dashboard...</main>;

  return (
    <main className="relative min-h-screen bg-[#F5F5F7] text-[#1a1a1a]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-12rem] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.35),transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10rem] top-48 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.25),transparent_70%)] blur-3xl"
      />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-10 px-4 sm:px-6 py-10">
        {/* HERO */}
        <header className={`${panelClass} relative overflow-hidden p-8`} style={{ animation: "fadeUp 0.6s ease-out both" }}>
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_60%)]"
          />
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-600">Owner Dashboard</p>
              <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">MO T-SHIRT — Owner Dashboard</h1>
              <p className="mt-2 text-sm text-slate-600">
                {formattedDate} • Primary: <span className="text-sky-600 font-semibold">{numerologyToday.primary}</span> • Secondary: <span className="text-emerald-600 font-semibold">{numerologyToday.secondary}</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Tomorrow ({tomorrowCalc.dateStr}) • Primary: <span className="text-sky-400 font-medium">{tomorrowCalc.primary}</span> • Secondary: <span className="text-emerald-400 font-medium">{tomorrowCalc.secondary}</span>
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href="/admin/pos" className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800">
                  Open POS
                </Link>
                <Link href="/admin/orders" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
                  Orders
                </Link>
                <Link href="/admin/clients" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
                  Clients
                </Link>
                <Link href="/admin/shops" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
                  Shops
                </Link>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Local time</div>
                <div className="mt-2 text-3xl font-semibold text-slate-900">{timeString}</div>
                <div className="mt-1 text-xs text-slate-500">Live sync • Mauritius</div>
              </div>
              <div className="rounded-3xl border border-slate-200/70 bg-slate-900 p-5 text-white shadow-sm">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5" />
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Smart Insight</div>
                    <div className="mt-2 text-sm">{insight}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* KPI Snapshot */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6" style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.08s" }}>
          {kpiCards.map((s, idx) => {
            const Icon = s.icon;
            const tone = toneMap[s.tone];
            return (
              <Link key={idx} href={s.href || "#"} className="group">
                <div className={`relative overflow-hidden rounded-3xl border ${tone.border} bg-gradient-to-br ${tone.bg} p-5 shadow-sm transition hover:shadow-md`}>
                  <div className="flex items-center justify-between">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-full ${tone.accent}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Live</span>
                  </div>
                  <div className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-500">{s.label}</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{s.value}</div>
                  <div className="mt-2 text-xs text-slate-500">{s.sub}</div>
                  <div aria-hidden className={`pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full blur-2xl ${tone.glow}`} />
                </div>
              </Link>
            );
          })}
        </section>

        {/* Pricing & Profitability Studio */}
        <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]" style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.14s" }}>
          <div className={`${panelClass} p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Pricing & Profitability Studio</h2>
                <p className="text-xs text-slate-500">Model quotes for custom tees, polos, and caps with real margin targets.</p>
              </div>
              <button
                onClick={() => {
                  setQuote((q) => ({ ...q, quotedUnitPrice: 0 }));
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              >
                Use suggested price
              </button>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Order Inputs</div>
                <div className="mt-3 grid gap-3 text-xs font-semibold text-slate-600">
                  <label className="grid gap-1">
                    Item type
                    <select
                      value={quote.itemType}
                      onChange={(e) => setQuote((q) => ({ ...q, itemType: e.target.value }))}
                      className={pricingFieldClass}
                    >
                      <option value="T-Shirt">T-Shirt</option>
                      <option value="Polo">Polo</option>
                      <option value="Cap">Cap</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    Decoration method
                    <select
                      value={quote.method}
                      onChange={(e) => setQuote((q) => ({ ...q, method: e.target.value }))}
                      className={pricingFieldClass}
                    >
                      <option value="Screen">Screen printing</option>
                      <option value="DTF">DTF</option>
                      <option value="DTG">DTG</option>
                      <option value="Embroidery">Embroidery</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="grid gap-1">
                      Qty
                      <input
                        type="number"
                        min={1}
                        value={quote.qty}
                        onChange={(e) => setQuote((q) => ({ ...q, qty: Number(e.target.value) }))}
                        className={pricingFieldClass}
                      />
                    </label>
                    <label className="grid gap-1">
                      Colors
                      <input
                        type="number"
                        min={1}
                        value={quote.colors}
                        onChange={(e) => setQuote((q) => ({ ...q, colors: Number(e.target.value) }))}
                        className={pricingFieldClass}
                      />
                    </label>
                    <label className="grid gap-1">
                      Locations
                      <input
                        type="number"
                        min={1}
                        value={quote.locations}
                        onChange={(e) => setQuote((q) => ({ ...q, locations: Number(e.target.value) }))}
                        className={pricingFieldClass}
                      />
                    </label>
                  </div>
                  <label className="grid gap-1">
                    Artwork fee (Rs)
                    <input
                      type="number"
                      min={0}
                      value={quote.artworkFee}
                      onChange={(e) => setQuote((q) => ({ ...q, artworkFee: Number(e.target.value) }))}
                      className={pricingFieldClass}
                    />
                  </label>
                  <label className="grid gap-1">
                    Quoted unit price (Rs)
                    <input
                      type="number"
                      min={0}
                      value={quote.quotedUnitPrice}
                      onChange={(e) => setQuote((q) => ({ ...q, quotedUnitPrice: Number(e.target.value) }))}
                      className={pricingFieldClass}
                    />
                  </label>
                  <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-600">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={quote.rush}
                        onChange={(e) => setQuote((q) => ({ ...q, rush: e.target.checked }))}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900"
                      />
                      Rush order
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={quote.personalization}
                        onChange={(e) => setQuote((q) => ({ ...q, personalization: e.target.checked }))}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900"
                      />
                      Personalization
                    </label>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Cost Model</div>
                <div className="mt-3 grid gap-3 text-xs font-semibold text-slate-600">
                  <div className="grid grid-cols-3 gap-3">
                    <label className="grid gap-1">
                      Tee blank
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={pricingModel.blankTee}
                      onChange={(e) => setPricingModel((m) => ({ ...m, blankTee: Number(e.target.value) }))}
                      className={pricingFieldClass}
                    />
                    </label>
                    <label className="grid gap-1">
                      Polo blank
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={pricingModel.blankPolo}
                      onChange={(e) => setPricingModel((m) => ({ ...m, blankPolo: Number(e.target.value) }))}
                      className={pricingFieldClass}
                    />
                    </label>
                    <label className="grid gap-1">
                      Cap blank
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={pricingModel.blankCap}
                      onChange={(e) => setPricingModel((m) => ({ ...m, blankCap: Number(e.target.value) }))}
                      className={pricingFieldClass}
                    />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1">
                      Screen setup / color
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={pricingModel.screenSetupPerColor}
                      onChange={(e) => setPricingModel((m) => ({ ...m, screenSetupPerColor: Number(e.target.value) }))}
                      className={pricingFieldClass}
                    />
                    </label>
                    <label className="grid gap-1">
                      Screen ink / color
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={pricingModel.screenInkPerColor}
                      onChange={(e) => setPricingModel((m) => ({ ...m, screenInkPerColor: Number(e.target.value) }))}
                      className={pricingFieldClass}
                    />
                    </label>
                    <label className="grid gap-1">
                      DTF / print
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={pricingModel.dtfPerPrint}
                      onChange={(e) => setPricingModel((m) => ({ ...m, dtfPerPrint: Number(e.target.value) }))}
                      className={pricingFieldClass}
                    />
                    </label>
                    <label className="grid gap-1">
                      DTG / print
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={pricingModel.dtgPerPrint}
                      onChange={(e) => setPricingModel((m) => ({ ...m, dtgPerPrint: Number(e.target.value) }))}
                      className={pricingFieldClass}
                    />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1">
                      Embroidery / item
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={pricingModel.embroideryPerItem}
                      onChange={(e) => setPricingModel((m) => ({ ...m, embroideryPerItem: Number(e.target.value) }))}
                      className={pricingFieldClass}
                    />
                    </label>
                    <label className="grid gap-1">
                      Digitize fee
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={pricingModel.digitizeFee}
                      onChange={(e) => setPricingModel((m) => ({ ...m, digitizeFee: Number(e.target.value) }))}
                      className={pricingFieldClass}
                    />
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="grid gap-1">
                      Labor / unit
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={pricingModel.laborPerUnit}
                      onChange={(e) => setPricingModel((m) => ({ ...m, laborPerUnit: Number(e.target.value) }))}
                      className={pricingFieldClass}
                    />
                    </label>
                    <label className="grid gap-1">
                      Overhead / order
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={pricingModel.overheadPerOrder}
                      onChange={(e) => setPricingModel((m) => ({ ...m, overheadPerOrder: Number(e.target.value) }))}
                      className={pricingFieldClass}
                    />
                    </label>
                    <label className="grid gap-1">
                      Personalization
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={pricingModel.personalizationPerItem}
                      onChange={(e) => setPricingModel((m) => ({ ...m, personalizationPerItem: Number(e.target.value) }))}
                      className={pricingFieldClass}
                    />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1">
                      Target margin %
                    <input
                      type="number"
                      min={0}
                      max={90}
                      step="1"
                      value={Math.round(pricingModel.targetMargin * 100)}
                      onChange={(e) => setPricingModel((m) => ({ ...m, targetMargin: Number(e.target.value) / 100 }))}
                      className={pricingFieldClass}
                    />
                    </label>
                    <label className="grid gap-1">
                      Rush fee %
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="1"
                      value={Math.round(pricingModel.rushPct * 100)}
                      onChange={(e) => setPricingModel((m) => ({ ...m, rushPct: Number(e.target.value) / 100 }))}
                      className={pricingFieldClass}
                    />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Unit cost</div>
                <div className="mt-2 text-xl font-semibold text-slate-900">{money(pricing.unitCost)}</div>
                <div className="text-xs text-slate-500">Includes setup + overhead</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Suggested unit price</div>
                <div className="mt-2 text-xl font-semibold text-slate-900">{money(pricing.suggestedUnit)}</div>
                <div className="text-xs text-slate-500">Target margin {Math.round(pricingModel.targetMargin * 100)}%</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Quote total</div>
                <div className="mt-2 text-xl font-semibold text-slate-900">{money(pricing.totalRevenue)}</div>
                <div className="text-xs text-slate-500">{pricing.qty} units • {Math.round(pricing.marginPct * 100)}% margin</div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              {methodHint}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className={`${panelClass} p-6`}>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Quote Summary</div>
              <div className="mt-4 grid gap-3 text-sm">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  Total cost: <span className="font-semibold text-slate-800">{money(pricing.totalCost)}</span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  Profit: <span className={`font-semibold ${pricing.profit >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{money(pricing.profit)}</span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  Break-even qty: <span className="font-semibold text-slate-800">{pricing.breakEvenQty ?? "—"}</span>
                </div>
              </div>
              <div className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Price breaks</div>
                <div className="mt-3 grid gap-2">
                  {priceBreaks.map((tier) => (
                    <div key={tier.qty} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                      <span>{tier.qty} units</span>
                      <span className="font-semibold text-slate-900">{money(tier.suggestedUnit)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Pricing Playbook</div>
              <div className="mt-3 space-y-2 text-sm text-white/80">
                <div>Proof approval is the gate — delays here shift delivery dates.</div>
                <div>Screen printing setup costs get cheaper per unit at higher volumes.</div>
                <div>DTF/DTG shines on small runs or photo-heavy designs.</div>
                <div>Rush jobs need a premium to protect margin.</div>
              </div>
            </div>
          </div>
        </section>

        {/* Momentum + Checklist */}
        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]" style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.2s" }}>
          <div className={`${panelClass} p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Daily Checklist</h2>
                <p className="text-xs text-slate-500">Streak: <span className="text-emerald-600 font-semibold">{streak}</span> day{streak === 1 ? "" : "s"}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addTask(); }}
                  placeholder="Add a task..."
                  className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
                <button onClick={addTask} className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 border border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white transition-colors">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[120px_1fr]">
              <div className="flex flex-col items-center justify-center">
                <div className="relative h-28 w-28">
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{ background: `conic-gradient(#0ea5e9 ${progressDeg}deg, #e2e8f0 0deg)` }}
                  />
                  <div className="absolute inset-3 rounded-full bg-white flex items-center justify-center text-xl font-semibold text-slate-900">
                    {progressPct}%
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-500">Progress</div>
              </div>
              <div>
                <ul className="divide-y divide-slate-200">
                  {tasks.length === 0 && (
                    <li className="text-sm text-slate-500 py-2">No tasks yet. Add your first task above.</li>
                  )}
                  {tasks.map((t, idx) => (
                    <li key={idx} className="flex items-center justify-between py-2">
                      <button onClick={() => toggleTask(idx)} className="flex items-center gap-3 text-left group">
                        {t.completed ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <Circle className="w-5 h-5 text-slate-400 group-hover:text-slate-600" />
                        )}
                        <span className={t.completed ? "line-through text-slate-400" : "text-slate-700"}>{t.title}</span>
                      </button>
                      <button onClick={() => removeTask(idx)} className="text-slate-400 hover:text-rose-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className={`${panelClass} p-6`}>
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Today Focus</h3>
              <div className="mt-4 flex flex-col gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Orders today: <span className="font-semibold">{global?.ordersToday ?? todaysOrdersCount}</span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Pending to clear: <span className="font-semibold">{global?.pendingOrders ?? pendingOrders}</span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Low stock signals: <span className="font-semibold">{lowStock.length}</span>
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-sm">
              <div className="text-xs uppercase tracking-[0.2em] text-white/60">Command Pulse</div>
              <div className="mt-3 text-lg font-semibold">Stay ruthless on execution today.</div>
              <div className="mt-2 text-sm text-white/70">Next 90 minutes: clear pending queue, confirm top 5 clients, and restock low tees.</div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-white/10 px-3 py-1">Ops</span>
                <span className="rounded-full bg-white/10 px-3 py-1">Sales</span>
                <span className="rounded-full bg-white/10 px-3 py-1">Inventory</span>
              </div>
            </div>
          </div>
        </section>

        {/* Orders + Inventory */}
        <section className="grid gap-6 lg:grid-cols-2" style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.26s" }}>
          <div className={`${panelClass} p-6`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-900">Latest Orders</h2>
              <Link href="/admin/orders" className="text-xs font-semibold text-slate-600 hover:text-slate-900">View all</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-700">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.2em] text-slate-500">
                    <th className="text-left py-2 px-2">Client</th>
                    <th className="text-left py-2 px-2">Amount</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-left py-2 px-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {latestOrders.map((order, idx) => {
                    const status = order.status || "—";
                    const statusClass = status === "Delivered" || status === "Completed"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : status === "Pending"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-slate-200 bg-slate-50 text-slate-600";
                    return (
                      <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="py-2 px-2 font-semibold text-slate-800">{order.client}</td>
                        <td className="py-2 px-2">Rs {order.amount}</td>
                        <td className="py-2 px-2">
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass}`}>{status}</span>
                        </td>
                        <td className="py-2 px-2 text-slate-500">{order.date}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`${panelClass} p-6`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Inventory Snapshot</h2>
              <div className="flex items-center gap-2">
                <input
                  placeholder="Search product..."
                  value={invSearch}
                  onChange={(e) => setInvSearch(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
                {lowStock.length > 0 && (
                  <div className="text-xs px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full">
                    Low: {lowStock.join(", ")}
                  </div>
                )}
              </div>
            </div>

            {filteredProducts.map((p) => {
              const totalUnits = p.colors.reduce(
                (acc, c) => acc + Object.values(c.sizes || {}).reduce((a, b) => a + (b || 0), 0), 0
              );
              return (
                <div key={p.id} className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {/* Product row */}
                  <div
                    onClick={() => setExpandedProduct(expandedProduct === p.id ? null : p.id)}
                    className={`cursor-pointer flex justify-between px-3 py-2 ${expandedProduct === p.id ? "bg-slate-50" : "bg-white"} hover:bg-slate-50 transition-colors`}
                  >
                    <span className="font-medium text-slate-800">{p.productName}</span>
                    <span className={totalUnits < 10 ? "text-rose-700 font-semibold" : "text-slate-500"}>
                      {totalUnits} units
                    </span>
                  </div>

                  {/* Expand colors */}
                  {expandedProduct === p.id && (
                    <div className="pl-3 pb-2">
                      {p.colors.map((c, cIdx) => {
                        const colorTotal = Object.values(c.sizes || {}).reduce((a, b) => a + (b || 0), 0);
                        return (
                          <div key={cIdx} className="border-t border-slate-200">
                            <div
                              onClick={() => setExpandedColor(expandedColor === p.id + c.color ? null : p.id + c.color)}
                              className="cursor-pointer flex justify-between px-3 py-2 hover:bg-slate-50"
                            >
                              <span className="text-slate-700">• {c.color}</span>
                              <span className={colorTotal < 10 ? "text-rose-700 font-semibold" : "text-slate-500"}>
                                {colorTotal} units
                              </span>
                            </div>

                            {/* Expand sizes */}
                            {expandedColor === p.id + c.color && (
                              <div className="ml-4 mr-2 overflow-x-auto">
                                <table className="mb-2 text-sm min-w-[280px] text-slate-700">
                                  <thead>
                                    <tr className="border-b border-slate-200">
                                      <th className="pr-4 text-left">Size</th>
                                      <th className="text-left">Qty</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {Object.entries(c.sizes || {}).map(([size, qty]) => (
                                      <tr key={size}>
                                        <td className="py-1">{size}</td>
                                        <td className={qty < 10 ? "text-rose-700 font-semibold" : "text-slate-500"}>{qty}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
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
