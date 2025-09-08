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
import { Info, TrendingUp, Package, RefreshCcw, Clock, Users, IndianRupee, Plus, Trash2, CheckCircle2, Circle } from "lucide-react";
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

  if (loading) return <main className="min-h-screen bg-slate-950 p-6 text-slate-200">Loading dashboard...</main>;

  return (
    <main className="min-h-screen bg-slate-950 px-4 sm:px-6 py-6 sm:py-8 text-slate-200">
      <div className="max-w-7xl mx-auto space-y-6">
      {/* HERO */}
      <header className="bg-slate-900/80 border border-slate-800 text-white rounded-2xl p-6 sm:p-7 shadow-xl backdrop-blur">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">MO T-SHIRT — Owner Dashboard</h1>
          <p className="mt-2 text-sm text-slate-300">
            {formattedDate} • Primary: <span className="text-blue-400 font-semibold">{numerologyToday.primary}</span> • Secondary: <span className="text-emerald-400 font-semibold">{numerologyToday.secondary}</span>
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Tomorrow ({tomorrowCalc.dateStr}) • Primary: <span className="text-blue-300 font-medium">{tomorrowCalc.primary}</span> • Secondary: <span className="text-emerald-300 font-medium">{tomorrowCalc.secondary}</span>
          </p>
        </div>
        <div className="text-right mt-4 sm:mt-0">
          <div className="text-xs uppercase tracking-wide text-slate-400">Local time</div>
          <div className="text-2xl sm:text-3xl font-extrabold text-blue-400">{timeString}</div>
        </div>
      </header>

      {/* CEO SNAPSHOT */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { label: "Today’s Revenue", value: `Rs ${(global?.todayRevenue ?? todayRevenue).toLocaleString()}`, icon: IndianRupee, href: "/admin/analytics?preset=7d" },
          { label: "Orders Today", value: global?.ordersToday ?? todaysOrdersCount, icon: Package, href: "/admin/orders?range=today" },
          { label: "AOV Today", value: global?.aovToday ? `Rs ${(global?.aovToday ?? aov).toLocaleString()}` : (aov ? `Rs ${aov.toLocaleString()}` : "—"), icon: TrendingUp, href: "/admin/orders?range=today" },
          { label: "Pending Orders", value: global?.pendingOrders ?? pendingOrders, icon: Clock, href: "/admin/orders?status=Pending" },
          { label: "Repeat Clients", value: global?.repeatClientsCount ?? repeatClients, icon: Users, href: "/admin/clients?filter=repeat" },
          { label: "Efficiency", value: `${global?.efficiencyPct ?? efficiencyValue}%`, icon: RefreshCcw, href: "/admin/analytics?view=ev" },
        ].map((s, idx) => {
          const Icon = s.icon;
          return (
            <Link key={idx} href={s.href || "#"} className="group">
              <div className="bg-slate-900/60 border border-slate-800 shadow-lg rounded-xl p-4 flex items-center gap-3 group-hover:border-blue-500/50 group-hover:bg-slate-900/70 transition-colors">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/15">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wide text-slate-400">{s.label}</p>
                  <h2 className="text-xl font-extrabold text-slate-100">{s.value}</h2>
                </div>
              </div>
            </Link>
          );
        })}
      </section>

      {/* INSIGHT */}
      <section className="bg-blue-600 text-white rounded-xl p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="shrink-0"><Info className="w-5 h-5" /></div>
          <div>
            <div className="text-sm font-semibold opacity-90">Smart Insight</div>
            <div className="mt-0.5 font-medium">{insight}</div>
          </div>
        </div>
      </section>

      {/* Daily Checklist */}
      <section className="bg-slate-900/60 border border-slate-800 shadow-lg p-4 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Daily Checklist</h2>
            <p className="text-xs text-slate-400">Streak: <span className="text-emerald-400 font-semibold">{streak}</span> day{streak === 1 ? '' : 's'}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
              placeholder="Add a task..."
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <button onClick={addTask} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm flex items-center gap-1">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Progress</span>
            <span className="text-slate-300 font-medium">{progressPct}%</span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Task list */}
        <ul className="divide-y divide-slate-800">
          {tasks.length === 0 && (
            <li className="text-sm text-slate-400 py-2">No tasks yet. Add your first task above.</li>
          )}
          {tasks.map((t, idx) => (
            <li key={idx} className="flex items-center justify-between py-2">
              <button onClick={() => toggleTask(idx)} className="flex items-center gap-3 text-left group">
                {t.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-500 group-hover:text-slate-300" />
                )}
                <span className={t.completed ? "line-through text-slate-500" : "text-slate-200"}>{t.title}</span>
              </button>
              <button onClick={() => removeTask(idx)} className="text-slate-400 hover:text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Latest Orders */}
      <section className="bg-slate-900/60 border border-slate-800 shadow-lg p-4 rounded-xl">
        <h2 className="text-lg font-bold mb-4 text-slate-100">Latest Orders</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-slate-200">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                <th className="text-left py-2 px-2">Client</th>
                <th className="text-left py-2 px-2">Amount</th>
                <th className="text-left py-2 px-2">Status</th>
                <th className="text-left py-2 px-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {latestOrders.map((order, idx) => (
                <tr key={idx} className="border-b border-slate-800 hover:bg-slate-800/40">
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
      <section className="bg-slate-900/60 border border-slate-800 shadow-lg p-4 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-slate-100">Inventory Snapshot</h2>
          <div className="flex items-center gap-2">
            <input
              placeholder="Search product..."
              value={invSearch}
              onChange={(e) => setInvSearch(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            {lowStock.length > 0 && (
              <div className="text-xs px-3 py-1.5 bg-red-500/15 text-red-300 border border-red-500/30 rounded-full">
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
            <div key={p.id} className="border border-slate-800 bg-slate-900/40 rounded-xl mb-3 overflow-hidden">
              {/* Product row */}
              <div
                onClick={() => setExpandedProduct(expandedProduct === p.id ? null : p.id)}
                className={`cursor-pointer flex justify-between px-3 py-2 ${expandedProduct === p.id ? "bg-slate-800/60" : "bg-slate-900/60"} hover:bg-slate-800/60 transition-colors`}
              >
                <span className="font-medium text-slate-100">{p.productName}</span>
                <span className={totalUnits < 10 ? "text-red-300 font-semibold" : "text-slate-300"}>
                  {totalUnits} units
                </span>
              </div>

              {/* Expand colors */}
              {expandedProduct === p.id && (
                <div className="pl-3 pb-2">
                  {p.colors.map((c, cIdx) => {
                    const colorTotal = Object.values(c.sizes || {}).reduce((a, b) => a + (b || 0), 0);
                    return (
                      <div key={cIdx} className="border-t border-slate-800">
                        <div
                          onClick={() => setExpandedColor(expandedColor === p.id+c.color ? null : p.id+c.color)}
                          className="cursor-pointer flex justify-between px-3 py-2 hover:bg-slate-800/40"
                        >
                          <span className="text-slate-200">• {c.color}</span>
                          <span className={colorTotal < 10 ? "text-red-300 font-semibold" : "text-slate-300"}>
                            {colorTotal} units
                          </span>
                        </div>

                        {/* Expand sizes */}
                        {expandedColor === p.id+c.color && (
                          <div className="ml-4 mr-2 overflow-x-auto">
                            <table className="mb-2 text-sm min-w-[280px] text-slate-200">
                              <thead>
                                <tr className="border-b border-slate-800">
                                  <th className="pr-4 text-left">Size</th>
                                  <th className="text-left">Qty</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(c.sizes || {}).map(([size, qty]) => (
                                  <tr key={size}>
                                    <td className="py-1">{size}</td>
                                    <td className={qty < 10 ? "text-red-300 font-semibold" : "text-slate-300"}>{qty}</td>
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
