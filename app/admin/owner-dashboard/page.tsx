'use client';

import { useState, useEffect } from 'react';
import { db, storage } from '@/lib/firebase';
import {
  doc, setDoc, getDoc, updateDoc, collection,
  query, orderBy, limit, getDocs, addDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { format } from 'date-fns';

export default function OwnerDashboard() {
  const adminId = 'mo-owner';
  const today = format(new Date(), 'yyyy-MM-dd');

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
  const [inventory, setInventory] = useState<{ size: string; qty: number }[]>([]);
  const [efficiencyValue, setEfficiencyValue] = useState(0);

  // POS
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [saleData, setSaleData] = useState({ client: '', amount: '', items: '', payment: 'Cash' });

  // DMS
  const [file, setFile] = useState<File | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string, url: string }[]>([]);

  // Fetch all data
  useEffect(() => {
    const fetchData = async () => {
      const checklistRef = doc(db, 'users', adminId, 'checklists', today);
      const checklistSnap = await getDoc(checklistRef);

      if (checklistSnap.exists()) {
        setTasks(checklistSnap.data().tasks || []);
        setStreak(checklistSnap.data().streak || 0);
      } else {
        await setDoc(checklistRef, { tasks: [], streak: 0 });
      }

      // Load Orders & Inventory in Parallel
      const ordersRef = collection(db, 'orders');
      const invRef = collection(db, 'inventory');
      const [ordersSnap, invSnap] = await Promise.all([
        getDocs(query(ordersRef, orderBy('date', 'desc'), limit(10))),
        getDocs(invRef)
      ]);

      let revenueToday = 0;
      let pendingCount = 0;
      let deliveredCount = 0;
      let completedCount = 0;
      let totalCount = 0;
      let clientSet = new Set();

      const ordersList: any[] = [];
      ordersSnap.forEach((docSnap) => {
        const data = docSnap.data();
        ordersList.push(data);
        clientSet.add(data.client);

        if (data.date === today) {
          revenueToday += data.amount || 0;
          if (data.status === 'Pending') pendingCount++;
          if (data.status === 'Delivered') deliveredCount++;
        }
        if (data.status === 'Delivered') completedCount++;
        totalCount++;
      });

      const invList: any[] = [];
      invSnap.forEach((docSnap) => invList.push(docSnap.data()));

      setLatestOrders(ordersList);
      setTodayRevenue(revenueToday);
      setPendingOrders(pendingCount);
      setDeliveredToday(deliveredCount);
      setRepeatClients(clientSet.size);
      setInventory(invList);
      setEfficiencyValue(totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0);

      setLoading(false);
    };

    fetchData();
  }, [today]);

  // Save tasks
  const saveTasks = async (updatedTasks: typeof tasks, updatedStreak = streak) => {
    setTasks(updatedTasks);
    const refDoc = doc(db, 'users', adminId, 'checklists', today);
    await updateDoc(refDoc, { tasks: updatedTasks, streak: updatedStreak });
  };

  // POS - Add Sale
  const handleAddSale = async () => {
    if (!saleData.client || !saleData.amount) return;
    await addDoc(collection(db, 'orders'), {
      client: saleData.client,
      amount: Number(saleData.amount),
      items: saleData.items,
      payment: saleData.payment,
      date: today,
      status: 'Pending'
    });
    setSaleModalOpen(false);
    setSaleData({ client: '', amount: '', items: '', payment: 'Cash' });
  };

  // DMS - Upload File
  const handleFileUpload = async () => {
    if (!file) return;
    const fileRef = ref(storage, `documents/${file.name}`);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);
    setUploadedFiles((prev) => [...prev, { name: file.name, url }]);
    setFile(null);
  };

  if (loading) return <main className="p-6">Loading dashboard...</main>;

  return (
    <main className="min-h-screen px-6 py-10 max-w-7xl mx-auto space-y-8">
      <header className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">MO T-SHIRT — Owner Dashboard</h1>
        <button
          onClick={() => setSaleModalOpen(true)}
          className="bg-green-500 text-white px-4 py-2 rounded-lg shadow hover:bg-green-600"
        >
          ➕ New Sale
        </button>
      </header>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Today’s Revenue", value: `Rs ${todayRevenue.toLocaleString()}` },
          { label: "Pending Orders", value: pendingOrders },
          { label: "Repeat Clients", value: repeatClients },
          { label: "Delivered Today", value: deliveredToday },
          { label: "Efficiency", value: `${efficiencyValue}%` }
        ].map((stat, idx) => (
          <div key={idx} className="bg-white shadow p-4 rounded-lg text-center">
            <p className="text-gray-500 text-sm">{stat.label}</p>
            <h2 className="text-xl font-bold">{stat.value}</h2>
          </div>
        ))}
      </div>

      {/* Orders Table */}
      <section className="bg-white p-4 rounded-lg shadow">
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
                <td>{order.client}</td>
                <td>Rs {order.amount}</td>
                <td>{order.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Inventory Snapshot */}
      <section className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-4">Inventory</h2>
        <ul>
          {inventory.map((item, idx) => (
            <li key={idx} className="flex justify-between border-b py-2">
              <span>{item.size}</span>
              <span>{item.qty} pcs</span>
            </li>
          ))}
        </ul>
      </section>

      {/* DMS */}
      <section className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-4">Document Management</h2>
        <div className="flex gap-2 mb-4">
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button
            onClick={handleFileUpload}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
          >
            Upload
          </button>
        </div>
        <ul>
          {uploadedFiles.map((f, i) => (
            <li key={i}>
              <a href={f.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">{f.name}</a>
            </li>
          ))}
        </ul>
      </section>

      {/* POS Modal */}
      {saleModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-lg font-bold mb-4">New Sale</h2>
            <input
              placeholder="Client Name"
              value={saleData.client}
              onChange={(e) => setSaleData({ ...saleData, client: e.target.value })}
              className="w-full border p-2 mb-2 rounded"
            />
            <input
              placeholder="Amount"
              type="number"
              value={saleData.amount}
              onChange={(e) => setSaleData({ ...saleData, amount: e.target.value })}
              className="w-full border p-2 mb-2 rounded"
            />
            <input
              placeholder="Items"
              value={saleData.items}
              onChange={(e) => setSaleData({ ...saleData, items: e.target.value })}
              className="w-full border p-2 mb-2 rounded"
            />
            <select
              value={saleData.payment}
              onChange={(e) => setSaleData({ ...saleData, payment: e.target.value })}
              className="w-full border p-2 mb-4 rounded"
            >
              <option>Cash</option>
              <option>Bank Transfer</option>
              <option>Card</option>
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSaleModalOpen(false)} className="px-4 py-2 border rounded">Cancel</button>
              <button onClick={handleAddSale} className="px-4 py-2 bg-green-500 text-white rounded">Save</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
