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

  if (loading) return <main className="p-6">Loading dashboard...</main>;

  return (
    <main className="min-h-screen px-6 py-8 max-w-7xl mx-auto space-y-8">
      {/* HERO */}
      <header className="bg-gradient-to-r from-black to-gray-800 text-white rounded-2xl p-6 shadow flex justify-between">
        <div>
          <h1 className="text-3xl font-extrabold">MO T-SHIRT — Owner Dashboard</h1>
          <p className="opacity-80 mt-1 text-sm">
            {formattedDate} • Primary: <span className="text-emerald-400 font-bold">{numerologyToday.primary}</span> • Secondary: <span className="text-sky-400 font-bold">{numerologyToday.secondary}</span>
          </p>
          <p className="opacity-80 mt-1 text-xs">
            Tomorrow ({tomorrowCalc.dateStr}) • Primary: <span className="text-emerald-300 font-semibold">{tomorrowCalc.primary}</span> • Secondary: <span className="text-sky-300 font-semibold">{tomorrowCalc.secondary}</span>
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-300">Local time</div>
          <div className="text-2xl font-bold">{timeString}</div>
        </div>
      </header>

      {/* CEO SNAPSHOT */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[{ label: "Today’s Revenue", value: `Rs ${todayRevenue.toLocaleString()}` },
          { label: "Orders Today", value: todaysOrdersCount },
          { label: "AOV Today", value: aov ? `Rs ${aov.toLocaleString()}` : "—" },
          { label: "Pending Orders", value: pendingOrders },
          { label: "Repeat Clients", value: repeatClients },
          { label: "Efficiency", value: `${efficiencyValue}%` }].map((s, idx) => (
          <div key={idx} className="bg-white shadow p-4 rounded-lg text-center">
            <p className="text-gray-500 text-sm">{s.label}</p>
            <h2 className="text-xl font-bold">{s.value}</h2>
          </div>
        ))}
      </section>

      {/* INSIGHT */}
      <section className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4">
        <div className="text-sm font-semibold">Smart Insight</div>
        <div className="mt-1">{insight}</div>
      </section>

      {/* Latest Orders */}
      <section className="bg-white shadow p-4 rounded-xl">
        <h2 className="text-lg font-bold mb-4">Latest Orders</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b"><th>Client</th><th>Amount</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              {latestOrders.map((order, idx) => (
                <tr key={idx} className="border-b">
                  <td>{order.client}</td>
                  <td>Rs {order.amount}</td>
                  <td>{order.status}</td>
                  <td>{order.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Inventory Snapshot */}
      <section className="bg-white shadow p-4 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Inventory Snapshot</h2>
          <div className="flex items-center gap-2">
            <input
              placeholder="Search product..."
              value={invSearch}
              onChange={(e) => setInvSearch(e.target.value)}
              className="border rounded px-3 py-1 text-sm"
            />
            {lowStock.length > 0 && (
              <div className="text-xs px-3 py-1 bg-red-100 text-red-700 rounded-full">
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
            <div key={p.id} className="border rounded-lg mb-2">
              {/* Product row */}
              <div
                onClick={() => setExpandedProduct(expandedProduct === p.id ? null : p.id)}
                className="cursor-pointer flex justify-between px-3 py-2 bg-gray-50"
              >
                <span>{p.productName}</span>
                <span className={totalUnits < 10 ? "text-red-600 font-semibold" : ""}>
                  {totalUnits} units
                </span>
              </div>

              {/* Expand colors */}
              {expandedProduct === p.id && (
                <div className="pl-4">
                  {p.colors.map((c, cIdx) => {
                    const colorTotal = Object.values(c.sizes || {}).reduce((a, b) => a + (b || 0), 0);
                    return (
                      <div key={cIdx} className="border-t">
                        <div
                          onClick={() => setExpandedColor(expandedColor === p.id+c.color ? null : p.id+c.color)}
                          className="cursor-pointer flex justify-between px-3 py-2"
                        >
                          <span>• {c.color}</span>
                          <span className={colorTotal < 10 ? "text-red-600 font-semibold" : ""}>
                            {colorTotal} units
                          </span>
                        </div>

                        {/* Expand sizes */}
                        {expandedColor === p.id+c.color && (
                          <div className="ml-4 mr-2 overflow-x-auto">
                            <table className="mb-2 text-sm min-w-[280px]">
                              <thead><tr><th className="pr-4">Size</th><th>Qty</th></tr></thead>
                              <tbody>
                                {Object.entries(c.sizes || {}).map(([size, qty]) => (
                                  <tr key={size}>
                                    <td>{size}</td>
                                    <td className={qty < 10 ? "text-red-600 font-semibold" : ""}>{qty}</td>
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
    </main>
  );
}
