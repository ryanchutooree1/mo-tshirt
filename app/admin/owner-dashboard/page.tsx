'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
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
} from 'firebase/firestore';
import { format } from 'date-fns';

export default function OwnerDashboard() {
  const adminId = 'mo-owner';
  const today = format(new Date(), 'yyyy-MM-dd');

  const [tasks, setTasks] = useState<{ title: string; completed: boolean }[]>(
    []
  );
  const [streak, setStreak] = useState(0);
  const [newTask, setNewTask] = useState('');
  const [loading, setLoading] = useState(true);

  // Stats
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [repeatClients, setRepeatClients] = useState(0);
  const [deliveredToday, setDeliveredToday] = useState(0);
  const [latestOrders, setLatestOrders] = useState<any[]>([]);
  const [inventory, setInventory] = useState<{ size?: string; qty: number }[]>(
    []
  );
  const [efficiencyValue, setEfficiencyValue] = useState(0);

  // Fetch tasks
  useEffect(() => {
    const fetchData = async () => {
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
    };
    fetchData();
  }, [adminId, today]);

  // Fetch orders, revenue, and EV
  useEffect(() => {
    const fetchOrders = async () => {
      const ordersRef = collection(db, 'orders');
      const q = query(ordersRef, orderBy('date', 'desc'), limit(5));
      const querySnapshot = await getDocs(q);

      let revenueToday = 0;
      let pendingCount = 0;
      let deliveredCount = 0;
      let completedCount = 0;
      let totalCount = 0;
      const ordersList: any[] = [];

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        ordersList.push(data);
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
      const ev = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
      setEfficiencyValue(ev);
    };

    fetchOrders();
  }, [today]);

  // Fetch inventory
  useEffect(() => {
    const fetchInventory = async () => {
      const invRef = collection(db, 'inventory');
      const invSnap = await getDocs(invRef);
      const invList: any[] = [];
      invSnap.forEach((docSnap) => {
        // include id so lists and POS can act on it later
        invList.push({ id: docSnap.id, ...docSnap.data() });
      });
      setInventory(invList);
    };
    fetchInventory();
  }, []);

  const saveTasks = async (
    updatedTasks: typeof tasks,
    updatedStreak = streak
  ) => {
    setTasks(updatedTasks);
    const ref = doc(db, 'users', adminId, 'checklists', today);
    await updateDoc(ref, { tasks: updatedTasks, streak: updatedStreak });
  };

  const toggleTask = async (index: number) => {
    const updated = [...tasks];
    updated[index].completed = !updated[index].completed;
    let newStreak = streak;
    if (updated.every((t) => t.completed)) {
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

  const progressPct = tasks.length
    ? Math.round((tasks.filter((t) => t.completed).length / tasks.length) * 100)
    : 0;

  if (loading) {
    return <main className="p-6">Loading dashboard...</main>;
  }

  return (
    <main className="min-h-screen px-6 py-10 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">MO T-SHIRT — Owner Dashboard</h1>
          <p className="text-gray-600">Your business control center.</p>
        </div>
      </div>

      {/* Big Navigation Buttons (including POS + DMS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <Link
          href="/admin/inventory"
          className="group block bg-white border rounded-lg p-6 text-center shadow hover:shadow-md transition"
          aria-label="Go to Inventory"
        >
          <div className="text-4xl">📦</div>
          <div className="mt-2 font-bold text-xl">Inventory</div>
          <div className="text-sm text-gray-500 mt-1">Manage sizes, colors, stock</div>
        </Link>

        <Link
          href="/admin/orders"
          className="group block bg-white border rounded-lg p-6 text-center shadow hover:shadow-md transition"
          aria-label="Go to Orders"
        >
          <div className="text-4xl">🧾</div>
          <div className="mt-2 font-bold text-xl">Orders</div>
          <div className="text-sm text-gray-500 mt-1">View & update orders</div>
        </Link>

        <Link
          href="/admin/clients"
          className="group block bg-white border rounded-lg p-6 text-center shadow hover:shadow-md transition"
          aria-label="Go to Clients"
        >
          <div className="text-4xl">👥</div>
          <div className="mt-2 font-bold text-xl">Clients</div>
          <div className="text-sm text-gray-500 mt-1">CRM & contact history</div>
        </Link>

        <Link
          href="/admin/analytics"
          className="group block bg-white border rounded-lg p-6 text-center shadow hover:shadow-md transition"
          aria-label="Go to Analytics"
        >
          <div className="text-4xl">📊</div>
          <div className="mt-2 font-bold text-xl">Analytics</div>
          <div className="text-sm text-gray-500 mt-1">Sales, EV, trends</div>
        </Link>

        <Link
          href="/admin/pos"
          className="group block bg-gradient-to-r from-orange-500 to-orange-400 text-white rounded-lg p-6 text-center shadow-lg hover:from-orange-600 hover:to-orange-500 transition"
          aria-label="Go to POS"
        >
          <div className="text-4xl">🛒</div>
          <div className="mt-2 font-bold text-xl">POS</div>
          <div className="text-sm mt-1 opacity-90">Record sales — updates inventory</div>
        </Link>

        <Link
          href="/admin/dms"
          className="group block bg-gradient-to-r from-sky-500 to-sky-400 text-white rounded-lg p-6 text-center shadow-lg hover:from-sky-600 hover:to-sky-500 transition"
          aria-label="Go to Document Management"
        >
          <div className="text-4xl">📂</div>
          <div className="mt-2 font-bold text-xl">DMS</div>
          <div className="text-sm mt-1 opacity-90">Upload and manage documents</div>
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white shadow p-4 rounded-lg text-center">
          <p className="text-gray-500 text-sm">Today’s Revenue</p>
          <h2 className="text-xl font-bold">Rs {todayRevenue.toLocaleString()}</h2>
        </div>
        <div className="bg-white shadow p-4 rounded-lg text-center">
          <p className="text-gray-500 text-sm">Pending Orders</p>
          <h2 className="text-xl font-bold">{pendingOrders}</h2>
        </div>
        <div className="bg-white shadow p-4 rounded-lg text-center">
          <p className="text-gray-500 text-sm">Repeat Clients</p>
          <h2 className="text-xl font-bold">{repeatClients}</h2>
        </div>
        <div className="bg-white shadow p-4 rounded-lg text-center">
          <p className="text-gray-500 text-sm">Delivered Today</p>
          <h2 className="text-xl font-bold">{deliveredToday}</h2>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full overflow-hidden mb-4" style={{ height: 20 }}>
        <div
          style={{
            width: `${progressPct}%`,
            background: progressPct === 100 ? '#22c55e' : '#f97316',
            borderRadius: '9999px'
          }}
          className="h-full transition-all"
        />
      </div>
      <p className="text-sm mb-6">{progressPct}% Complete • Streak: {streak} days</p>

      {/* Add Task */}
      <div className="flex gap-2 mb-6">
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="Add a new task..."
          className="flex-1 border rounded-lg px-3 py-2"
        />
        <button
          onClick={addTask}
          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
        >
          Add
        </button>
      </div>

      {/* Tasks */}
      <ul className="space-y-3 mb-10">
        {tasks.map((task, i) => (
          <li key={i} className="flex items-center gap-3 p-3 border rounded-lg hover:shadow-sm transition">
            <input type="checkbox" checked={task.completed} onChange={() => toggleTask(i)} className="w-5 h-5" />
            <span className={`flex-1 ${task.completed ? 'line-through text-gray-500' : ''}`}>{task.title}</span>
            <button onClick={() => removeTask(i)} className="text-red-500 text-sm hover:underline">Remove</button>
          </li>
        ))}
      </ul>

      {/* Order Overview */}
      <div className="bg-white shadow p-4 rounded-lg mb-8">
        <h2 className="text-lg font-bold mb-4">Latest Orders</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 text-left">Client</th>
              <th className="py-2 text-left">Amount</th>
              <th className="py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {latestOrders.map((order, idx) => (
              <tr key={idx} className="border-b">
                <td className="py-2">{order.client}</td>
                <td className="py-2">Rs {order.amount}</td>
                <td className="py-2">{order.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inventory Snapshot */}
      <div className="bg-white shadow p-4 rounded-lg mb-8">
        <h2 className="text-lg font-bold mb-4">Inventory Snapshot</h2>
        <ul>
          {inventory.map((item, idx) => (
            <li key={idx} className="flex justify-between border-b py-2">
              <span>{item.size ?? item.id}</span>
              <span>{item.qty} pcs</span>
            </li>
          ))}
        </ul>
      </div>

      {/* EV Metric */}
      <div className="bg-white shadow p-4 rounded-lg text-center">
        <p className="text-gray-500 text-sm">Efficiency Value</p>
        <h2 className="text-2xl font-bold">{efficiencyValue}%</h2>
      </div>
    </main>
  );
}
