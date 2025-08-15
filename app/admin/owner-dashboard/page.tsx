'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import {
  doc, setDoc, getDoc, updateDoc, collection,
  query, orderBy, limit, getDocs,
} from 'firebase/firestore';
import { format } from 'date-fns';

type InvItem = { id?: string; size?: string; qty?: number };

export default function OwnerDashboard() {
  const adminId = 'mo-owner';
  const today = format(new Date(), 'yyyy-MM-dd');

  // Checklist
  const [tasks, setTasks] = useState<{ title: string; completed: boolean }[]>([]);
  const [streak, setStreak] = useState(0);
  const [newTask, setNewTask] = useState('');
  const [loading, setLoading] = useState(true);

  // Stats
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [repeatClients, setRepeatClients] = useState(0);
  const [deliveredToday, setDeliveredToday] = useState(0);
  const [latestOrders, setLatestOrders] = useState<any[]>([]);
  const [inventory, setInventory] = useState<InvItem[]>([]);
  const [efficiencyValue, setEfficiencyValue] = useState(0);

  // Derived
  const progressPct = tasks.length
    ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100)
    : 0;

  // CEO-ish derived numbers
  const { todaysOrdersCount, aov } = useMemo(() => {
    const todays = latestOrders.filter(o => o.date === today);
    const count = todays.length || 0;
    const rev = todays.reduce((sum, o) => sum + (o.amount || 0), 0);
    return { todaysOrdersCount: count, aov: count ? Math.round(rev / count) : 0 };
  }, [latestOrders, today]);

  const lowStock = useMemo(
    () => inventory.filter(i => (i.qty ?? 0) > 0 && (i.qty as number) < 10).slice(0, 3),
    [inventory]
  );

  // INIT: tasks doc
  useEffect(() => {
    (async () => {
      const ref = doc(db, 'users', adminId, 'checklists', today);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setTasks(data?.tasks || []);
        setStreak(data?.streak || 0);
      } else {
        await setDoc(ref, { tasks: [], streak: 0 });
      }
      setLoading(false);
    })();
  }, [adminId, today]);

  // Orders + EV snapshot
  useEffect(() => {
    (async () => {
      const ordersRef = collection(db, 'orders');
      const qy = query(ordersRef, orderBy('date', 'desc'), limit(20));
      const qs = await getDocs(qy);

      let revenueToday = 0;
      let pendingCount = 0;
      let deliveredCount = 0;
      let completedCount = 0;
      let totalCount = 0;
      const ordersList: any[] = [];
      const clientSet = new Set<string>();

      qs.forEach((d) => {
        const data = d.data();
        ordersList.push(data);
        if (data.client) clientSet.add(String(data.client));
        if (data.date === today) {
          revenueToday += data.amount || 0;
          if (data.status === 'Pending') pendingCount++;
          if (data.status === 'Delivered') deliveredCount++;
        }
        if (data.status === 'Delivered') completedCount++;
        totalCount++;
      });

      setLatestOrders(ordersList);
      setTodayRevenue(revenueToday);
      setPendingOrders(pendingCount);
      setDeliveredToday(deliveredCount);
      setRepeatClients(clientSet.size);
      setEfficiencyValue(totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0);
    })();
  }, [today]);

  // Inventory snapshot
  useEffect(() => {
    (async () => {
      const invRef = collection(db, 'inventory');
      const snap = await getDocs(invRef);
      const list: InvItem[] = [];
      snap.forEach((docSnap) => list.push({ id: docSnap.id, ...(docSnap.data() as any) }));
      setInventory(list);
    })();
  }, []);

  // Checklist helpers
  const saveTasks = async (updatedTasks: typeof tasks, updatedStreak = streak) => {
    setTasks(updatedTasks);
    const refDoc = doc(db, 'users', adminId, 'checklists', today);
    await updateDoc(refDoc, { tasks: updatedTasks, streak: updatedStreak });
  };
  const toggleTask = async (index: number) => {
    const updated = [...tasks];
    updated[index].completed = !updated[index].completed;
    let newStreak = streak;
    if (updated.length > 0 && updated.every(t => t.completed)) {
      newStreak += 1;
      setStreak(newStreak);
    }
    await saveTasks(updated, newStreak);
  };
  const addTask = async () => {
    if (!newTask.trim()) return;
    const updated = [...tasks, { title: newTask.trim(), completed: false }];
    setNewTask('');
    await saveTasks(updated);
  };
  const removeTask = async (index: number) => {
    await saveTasks(tasks.filter((_, i) => i !== index));
  };
  const markAllDone = async () => {
    if (!tasks.length) return;
    const updated = tasks.map(t => ({ ...t, completed: true }));
    const newStreak = streak + 1;
    setStreak(newStreak);
    await saveTasks(updated, newStreak);
  };
  const quickAdd = async (title: string) => {
    const updated = [...tasks, { title, completed: false }];
    await saveTasks(updated);
  };

  // “Smart” one-liner insight
  const insight = useMemo(() => {
    if (pendingOrders > deliveredToday) return '⚠️ Fulfilment lagging vs. completions — clear the queue.';
    if (aov > 0 && aov >= 1500) return '💡 High AOV today — consider upsell bundles.';
    if (progressPct < 50) return '🚀 Push your daily checklist past 50% to keep the streak hot.';
    if (lowStock.length) return `📦 Low stock: ${lowStock.map(i => i.size ?? i.id).join(', ')}`;
    return '✅ Systems normal. Keep compounding.';
  }, [pendingOrders, deliveredToday, aov, progressPct, lowStock]);

  if (loading) return <main className="p-6">Loading dashboard...</main>;

  return (
    <main className="min-h-screen px-6 py-8 max-w-7xl mx-auto space-y-8">
      {/* HERO */}
      <header className="bg-gradient-to-r from-black to-gray-800 text-white rounded-2xl p-6 shadow">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">MO T-SHIRT — Owner Dashboard</h1>
            <p className="opacity-80 mt-1">{today} • Built for a future CEO</p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/pos" className="px-4 py-2 bg-orange-500 rounded-lg hover:bg-orange-600">🛒 New Sale</Link>
            <Link href="/admin/dms" className="px-4 py-2 bg-sky-500 rounded-lg hover:bg-sky-600">📂 Upload Doc</Link>
          </div>
        </div>
      </header>

      {/* DAILY COMMAND CENTER — TASKS AT THE TOP */}
      <section className="bg-white rounded-xl shadow p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold">Daily Command Center</h2>
            <p className="text-sm text-gray-500">Checklist • Streak: <span className="font-semibold">{streak} days</span></p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => quickAdd('Call suppliers')}
                    className="text-xs px-3 py-1 border rounded-lg hover:bg-gray-50">+ Call suppliers</button>
            <button onClick={() => quickAdd('Post on Instagram')}
                    className="text-xs px-3 py-1 border rounded-lg hover:bg-gray-50">+ Post on Instagram</button>
            <button onClick={() => quickAdd('Confirm deliveries')}
                    className="text-xs px-3 py-1 border rounded-lg hover:bg-gray-50">+ Confirm deliveries</button>
            <button onClick={markAllDone}
                    className="text-xs px-3 py-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">Mark all done</button>
          </div>
        </div>

        {/* Progress */}
        <div className="w-full bg-gray-200 rounded-full overflow-hidden mb-3" style={{ height: 12 }}>
          <div
            style={{ width: `${progressPct}%` }}
            className={`h-full transition-all ${progressPct === 100 ? 'bg-emerald-500' : 'bg-orange-500'}`}
          />
        </div>
        <p className="text-xs mb-4">{progressPct}% complete today</p>

        {/* Add Task */}
        <div className="flex gap-2 mb-4">
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Add a new task..."
            className="flex-1 border rounded-lg px-3 py-2"
          />
          <button onClick={addTask} className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800">
            Add
          </button>
        </div>

        {/* Tasks list */}
        <ul className="space-y-2">
          {tasks.length === 0 && <li className="text-sm text-gray-500">No tasks yet. Add your first above.</li>}
          {tasks.map((task, i) => (
            <li key={i} className="flex items-center gap-3 p-3 border rounded-lg hover:shadow-sm transition">
              <input type="checkbox" checked={task.completed} onChange={() => toggleTask(i)} className="w-5 h-5" />
              <span className={`flex-1 ${task.completed ? 'line-through text-gray-500' : ''}`}>{task.title}</span>
              <button onClick={() => removeTask(i)} className="text-red-500 text-sm hover:underline">Remove</button>
            </li>
          ))}
        </ul>
      </section>

      {/* QUICK NAV (CEO flow) */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Link href="/admin/pos" className="group bg-gradient-to-r from-orange-500 to-orange-400 text-white rounded-xl p-4 text-center shadow hover:from-orange-600 hover:to-orange-500">
            <div className="text-3xl">🛒</div><div className="font-semibold mt-1">POS</div>
          </Link>
          <Link href="/admin/inventory" className="group bg-white border rounded-xl p-4 text-center shadow hover:shadow-md">
            <div className="text-3xl">📦</div><div className="font-semibold mt-1">Inventory</div>
          </Link>
          <Link href="/admin/orders" className="group bg-white border rounded-xl p-4 text-center shadow hover:shadow-md">
            <div className="text-3xl">🧾</div><div className="font-semibold mt-1">Orders</div>
          </Link>
          <Link href="/admin/clients" className="group bg-white border rounded-xl p-4 text-center shadow hover:shadow-md">
            <div className="text-3xl">👥</div><div className="font-semibold mt-1">Clients</div>
          </Link>
          <Link href="/admin/analytics" className="group bg-white border rounded-xl p-4 text-center shadow hover:shadow-md">
            <div className="text-3xl">📊</div><div className="font-semibold mt-1">Analytics</div>
          </Link>
          <Link href="/admin/dms" className="group bg-gradient-to-r from-sky-500 to-sky-400 text-white rounded-xl p-4 text-center shadow hover:from-sky-600 hover:to-sky-500">
            <div className="text-3xl">📂</div><div className="font-semibold mt-1">DMS</div>
          </Link>
        </div>
      </section>

      {/* CEO SNAPSHOT */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Today’s Revenue', value: `Rs ${todayRevenue.toLocaleString()}` },
          { label: 'Orders Today', value: todaysOrdersCount },
          { label: 'AOV Today', value: aov ? `Rs ${aov.toLocaleString()}` : '—' },
          { label: 'Pending Orders', value: pendingOrders },
          { label: 'Efficiency', value: `${efficiencyValue}%` },
        ].map((s, idx) => (
          <div key={idx} className="bg-white shadow p-4 rounded-lg text-center">
            <p className="text-gray-500 text-sm">{s.label}</p>
            <h2 className="text-xl font-bold">{s.value as any}</h2>
          </div>
        ))}
      </section>

      {/* INSIGHT CARD */}
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
              <tr className="border-b">
                <th className="py-2 text-left">Client</th>
                <th className="py-2 text-left">Amount</th>
                <th className="py-2 text-left">Status</th>
                <th className="py-2 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {latestOrders.map((order, idx) => (
                <tr key={idx} className="border-b">
                  <td className="py-2">{order.client}</td>
                  <td className="py-2">Rs {order.amount}</td>
                  <td className="py-2">{order.status}</td>
                  <td className="py-2">{order.date}</td>
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
          {lowStock.length > 0 && (
            <div className="text-xs px-3 py-1 bg-red-100 text-red-700 rounded-full">
              Low stock: {lowStock.map(i => i.size ?? i.id).join(', ')}
            </div>
          )}
        </div>
        <ul>
          {inventory.map((item, idx) => (
            <li key={item.id ?? idx} className="flex justify-between border-b py-2">
              <span>{item.size ?? item.id}</span>
              <span>{(item.qty ?? 0).toString()} pcs</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
