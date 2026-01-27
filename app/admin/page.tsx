"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
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

  const progressPct = tasks.length ? Math.round((tasks.filter((t) => t.completed).length / tasks.length) * 100) : 0;

  const { todaysOrdersCount, aov } = useMemo(() => {
    const todays = latestOrders.filter((o) => o.date === todayIso);
    const count = todays.length || 0;
    const rev = todays.reduce((sum, o) => sum + (o.amount || 0), 0);
    return { todaysOrdersCount: count, aov: count ? Math.round(rev / count) : 0 };
  }, [latestOrders, todayIso]);

  const panelClass = "rounded-[28px] border border-[#EAEAEA] bg-white shadow-sm";

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
    <main className="min-h-screen bg-[#F5F5F7] px-4 sm:px-6 py-10 text-[#1a1a1a]">
      <div className="mx-auto flex max-w-7xl flex-col gap-10">
      {/* HERO */}
      <header className={`${panelClass} grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] p-8`}>
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">MO T-SHIRT — Owner Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">
            {formattedDate} • Primary: <span className="text-blue-400 font-semibold">{numerologyToday.primary}</span> • Secondary: <span className="text-emerald-400 font-semibold">{numerologyToday.secondary}</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Tomorrow ({tomorrowCalc.dateStr}) • Primary: <span className="text-blue-300 font-medium">{tomorrowCalc.primary}</span> • Secondary: <span className="text-emerald-300 font-medium">{tomorrowCalc.secondary}</span>
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-gray-500">Local time</div>
          <div className="text-2xl sm:text-3xl font-semibold text-[#1a1a1a]">{timeString}</div>
        </div>
      </header>

      {/* CEO SNAPSHOT */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:gap-5">
        {[
          { label: "Today’s Revenue", value: `Rs ${(global?.todayRevenue ?? todayRevenue).toLocaleString()}`, icon: RsIcon, href: "/admin/analytics?preset=7d" },
          { label: "Orders Today", value: global?.ordersToday ?? todaysOrdersCount, icon: Package, href: "/admin/orders?range=today" },
          { label: "AOV Today", value: global?.aovToday ? `Rs ${(global?.aovToday ?? aov).toLocaleString()}` : (aov ? `Rs ${aov.toLocaleString()}` : "—"), icon: TrendingUp, href: "/admin/orders?range=today" },
          { label: "Pending Orders", value: global?.pendingOrders ?? pendingOrders, icon: Clock, href: "/admin/orders?status=Pending" },
          { label: "Repeat Clients", value: global?.repeatClientsCount ?? repeatClients, icon: Users, href: "/admin/clients?filter=repeat" },
          { label: "Efficiency", value: `${global?.efficiencyPct ?? efficiencyValue}%`, icon: RefreshCcw, href: "/admin/analytics?view=ev" },
        ].map((s, idx) => {
          const Icon = s.icon;
          return (
            <Link key={idx} href={s.href || "#"} className="group">
              <div className={`${panelClass} flex items-center gap-3 p-5 transition-all hover:shadow-md`}>
                <div className="p-2 rounded-xl bg-[#F5F5F7] text-[#1a1a1a]">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wide text-gray-500">{s.label}</p>
                  <h2 className="text-xl font-semibold text-[#1a1a1a]">{s.value}</h2>
                </div>
              </div>
            </Link>
          );
        })}
      </section>

      {/* INSIGHT */}
      <section className="rounded-[28px] bg-[#0F172A] p-6 text-white shadow-sm">
        <div className="flex items-start gap-3">
          <div className="shrink-0"><Info className="w-5 h-5" /></div>
          <div>
            <div className="text-sm font-semibold opacity-90">Smart Insight</div>
            <div className="mt-0.5">{insight}</div>
          </div>
        </div>
      </section>

      {/* Daily Checklist */}
      <section className={`${panelClass} p-6`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Daily Checklist</h2>
            <p className="text-xs text-gray-500">Streak: <span className="text-emerald-600 font-semibold">{streak}</span> day{streak === 1 ? '' : 's'}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
              placeholder="Add a task..."
              className="bg-white border border-[#EAEAEA] rounded-xl px-3 py-1.5 text-sm text-[#1a1a1a] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#bfa37a]/50"
            />
            <button onClick={addTask} className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 border border-[#bfa37a] text-[#1a1a1a] hover:bg-[#bfa37a] hover:text-white transition-colors">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span>
            <span className="text-gray-700 font-medium">{progressPct}%</span>
          </div>
          <div className="w-full h-3 rounded-full bg-[#f0f0f0] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#bfa37a] to-[#d8c6a3] transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Task list */}
        <ul className="divide-y divide-[#EAEAEA]">
          {tasks.length === 0 && (
            <li className="text-sm text-gray-500 py-2">No tasks yet. Add your first task above.</li>
          )}
          {tasks.map((t, idx) => (
            <li key={idx} className="flex items-center justify-between py-2">
              <button onClick={() => toggleTask(idx)} className="flex items-center gap-3 text-left group">
                {t.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
                )}
                <span className={t.completed ? "line-through text-gray-500" : "text-[#1a1a1a]"}>{t.title}</span>
              </button>
              <button onClick={() => removeTask(idx)} className="text-gray-400 hover:text-red-600 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Latest Orders */}
      <section className={`${panelClass} p-6`}>
        <h2 className="text-lg font-semibold mb-6">Latest Orders</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-[#1a1a1a]">
            <thead>
              <tr className="border-b border-gray-200 bg-[#f5f5f5]">
                <th className="text-left py-2 px-2">Client</th>
                <th className="text-left py-2 px-2">Amount</th>
                <th className="text-left py-2 px-2">Status</th>
                <th className="text-left py-2 px-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {latestOrders.map((order, idx) => (
                <tr key={idx} className="border-b border-gray-200 hover:bg-[#f5f5f5]">
                  <td className="py-2 px-2">{order.client}</td>
                  <td className="py-2 px-2">Rs {order.amount}</td>
                  <td className="py-2 px-2">{order.status}</td>
                  <td className="py-2 px-2">{order.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Inventory Snapshot */}
      <section className={`${panelClass} p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Inventory Snapshot</h2>
          <div className="flex items-center gap-2">
            <input
              placeholder="Search product..."
              value={invSearch}
              onChange={(e) => setInvSearch(e.target.value)}
              className="bg-white border border-[#EAEAEA] rounded-xl px-3 py-1.5 text-sm text-[#1a1a1a] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#bfa37a]/50"
            />
            {lowStock.length > 0 && (
              <div className="text-xs px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-full">
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
            <div key={p.id} className="mb-3 overflow-hidden rounded-2xl border border-[#EAEAEA] bg-white shadow-sm">
              {/* Product row */}
              <div
                onClick={() => setExpandedProduct(expandedProduct === p.id ? null : p.id)}
                className={`cursor-pointer flex justify-between px-3 py-2 ${expandedProduct === p.id ? "bg-[#f5f5f5]" : "bg-white"} hover:bg-[#f5f5f5] transition-colors`}
              >
                <span className="font-medium text-[#1a1a1a]">{p.productName}</span>
                <span className={totalUnits < 10 ? "text-red-700 font-semibold" : "text-gray-600"}>
                  {totalUnits} units
                </span>
              </div>

              {/* Expand colors */}
              {expandedProduct === p.id && (
                <div className="pl-3 pb-2">
                  {p.colors.map((c, cIdx) => {
                    const colorTotal = Object.values(c.sizes || {}).reduce((a, b) => a + (b || 0), 0);
                    return (
                      <div key={cIdx} className="border-t border-gray-200">
                        <div
                          onClick={() => setExpandedColor(expandedColor === p.id+c.color ? null : p.id+c.color)}
                          className="cursor-pointer flex justify-between px-3 py-2 hover:bg-[#f5f5f5]"
                        >
                          <span className="text-[#1a1a1a]">• {c.color}</span>
                          <span className={colorTotal < 10 ? "text-red-700 font-semibold" : "text-gray-600"}>
                            {colorTotal} units
                          </span>
                        </div>

                        {/* Expand sizes */}
                        {expandedColor === p.id+c.color && (
                          <div className="ml-4 mr-2 overflow-x-auto">
                            <table className="mb-2 text-sm min-w-[280px] text-[#1a1a1a]">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  <th className="pr-4 text-left">Size</th>
                                  <th className="text-left">Qty</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(c.sizes || {}).map(([size, qty]) => (
                                  <tr key={size}>
                                    <td className="py-1">{size}</td>
                                    <td className={qty < 10 ? "text-red-700 font-semibold" : "text-gray-600"}>{qty}</td>
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
      </section>
      </div>
    </main>
  );
}
