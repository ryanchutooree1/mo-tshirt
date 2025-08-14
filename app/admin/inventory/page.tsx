'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

export default function InventoryPage() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [category, setCategory] = useState('');
  const [size, setSize] = useState('');
  const [qty, setQty] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Fetch inventory
  const fetchInventory = async () => {
    setLoading(true);
    const invRef = collection(db, 'inventory');
    const snap = await getDocs(invRef);
    const list: any[] = [];
    snap.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() });
    });
    setInventory(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  // Add or Update item
  const addItem = async () => {
    if (!category.trim() || !size.trim() || qty <= 0) return;

    const id = `${category}-${size}`;
    const itemRef = doc(db, 'inventory', id);

    await setDoc(itemRef, {
      category,
      size,
      qty
    });
    setCategory('');
    setSize('');
    setQty(0);
    fetchInventory();
  };

  // Delete item
  const removeItem = async (id: string) => {
    await deleteDoc(doc(db, 'inventory', id));
    fetchInventory();
  };

  // Update quantity
  const updateQuantity = async (id: string, newQty: number) => {
    await updateDoc(doc(db, 'inventory', id), { qty: newQty });
    fetchInventory();
  };

  return (
    <main className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Inventory Management</h1>
      <p className="text-gray-600 mb-6">Manage your stock levels by category and size.</p>

      {/* Add Item Form */}
      <div className="bg-white shadow p-4 rounded-lg mb-6">
        <h2 className="text-lg font-bold mb-4">Add / Update Item</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (e.g. T-Shirt)"
            className="border rounded-lg px-3 py-2"
          />
          <input
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="Size (e.g. M)"
            className="border rounded-lg px-3 py-2"
          />
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            placeholder="Quantity"
            className="border rounded-lg px-3 py-2"
          />
          <button
            onClick={addItem}
            className="bg-black text-white rounded-lg px-4 py-2 hover:bg-gray-800"
          >
            Save
          </button>
        </div>
      </div>

      {/* Inventory List */}
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-4">Current Inventory</h2>
        {loading ? (
          <p>Loading...</p>
        ) : inventory.length === 0 ? (
          <p>No inventory found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left">Category</th>
                <th className="py-2 text-left">Size</th>
                <th className="py-2 text-left">Quantity</th>
                <th className="py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-2">{item.category}</td>
                  <td className="py-2">{item.size}</td>
                  <td className="py-2">
                    <input
                      type="number"
                      value={item.qty}
                      onChange={(e) => updateQuantity(item.id, Number(e.target.value))}
                      className="w-16 border rounded px-2 py-1"
                    />
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-red-500 hover:underline text-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
