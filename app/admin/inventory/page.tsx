"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";

// ---------- Types ----------
type SizeMap = Record<string, number>;
type MinMap = Record<string, number>;
type Color = { color: string; sizes: SizeMap; minStock?: MinMap };
type Product = {
  id: string;
  productName: string;
  imageUrl?: string;
  price?: number;
  colors: Color[];
};

// ---------- Small helpers ----------
const money = (v: number) => `Rs ${Number(v || 0).toLocaleString()}`;
const sum = (obj: Record<string, number> = {}) =>
  Object.values(obj).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const LOW_FALLBACK = 5;

// ---------- Page ----------
export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  // UI state
  const [search, setSearch] = useState("");
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [showOutOnly, setShowOutOnly] = useState(false);

  // Modals
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showColorModal, setShowColorModal] = useState<{ productId: string } | null>(null);
  const [showBulkModal, setShowBulkModal] = useState<{ productId: string; colorIdx: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ scope: "product"|"color"|"size"; productId: string; colorIdx?: number; sizeKey?: string } | null>(null);

  // Live data
  useEffect(() => {
    const qy = query(collection(db, "products"), orderBy("productName"));
    const unsub = onSnapshot(qy, (snap) => {
      const list: Product[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Product, "id">) }));
      setProducts(list);
    });
    return () => unsub();
  }, []);

  // Filtering
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      const matches = !term || p.productName.toLowerCase().includes(term);
      if (!matches) return false;

      const allSizes = p.colors.flatMap((c) =>
        Object.entries(c.sizes).map(([k, v]) => {
          const min = c.minStock?.[k] ?? LOW_FALLBACK;
          return { qty: v, min };
        })
      );
      const hasOut = allSizes.some((s) => (s.qty || 0) <= 0);
      const hasLow = allSizes.some((s) => s.qty > 0 && s.qty <= s.min);

      if (showOutOnly && !hasOut) return false;
      if (showLowOnly && !hasLow) return false;
      return true;
    });
  }, [products, search, showLowOnly, showOutOnly]);

  // ---------- Derived metrics ----------
  const totals = (p: Product) => {
    const totalUnits = p.colors.reduce((acc, c) => acc + sum(c.sizes), 0);
    const totalValue = (p.price || 0) * totalUnits;
    const lowCount = p.colors.reduce(
      (acc, c) =>
        acc +
        Object.entries(c.sizes).reduce((a, [k, v]) => {
          const min = c.minStock?.[k] ?? LOW_FALLBACK;
          return a + (v > 0 && v <= min ? 1 : 0);
        }, 0),
      0
    );
    const outCount = p.colors.reduce(
      (acc, c) => acc + Object.values(c.sizes).filter((v) => (v || 0) <= 0).length,
      0
    );
    return { totalUnits, totalValue, lowCount, outCount };
  };

  const productStatus = (p: Product) => {
    const { lowCount, outCount } = totals(p);
    if (outCount > 0) return { label: "Out of stock", cls: "bg-rose-100 text-rose-700" };
    if (lowCount > 0) return { label: "Low stock", cls: "bg-amber-100 text-amber-700" };
    return { label: "In stock", cls: "bg-emerald-100 text-emerald-700" };
  };

  // ---------- Mutations ----------
  const deleteItem = async () => {
    if (!confirmDelete) return;
    const { scope, productId, colorIdx, sizeKey } = confirmDelete;
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const ref = doc(db, "products", productId);

    if (scope === "product") {
      await deleteDoc(ref);
    } else {
      const colors = JSON.parse(JSON.stringify(product.colors)) as Color[];
      if (scope === "color" && typeof colorIdx === "number") {
        colors.splice(colorIdx, 1);
        await updateDoc(ref, { colors });
      }
      if (scope === "size" && typeof colorIdx === "number" && sizeKey) {
        delete colors[colorIdx].sizes[sizeKey];
        if (colors[colorIdx].minStock) delete colors[colorIdx].minStock![sizeKey];
        await updateDoc(ref, { colors });
      }
    }
    setConfirmDelete(null);
  };

  // ---------- Render ----------
  return (
    <main className="min-h-screen px-6 py-10 max-w-7xl mx-auto bg-gray-50">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">📦 Inventory</h1>
          <p className="text-gray-500">Manage products, colors, sizes & alerts.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product…"
            className="border rounded-lg px-3 py-2 w-64"
          />
          <label className="flex items-center gap-1 text-sm border rounded-lg px-3 py-2 bg-white hover:bg-gray-50">
            <input type="checkbox" checked={showLowOnly} onChange={(e) => setShowLowOnly(e.target.checked)} /> Low stock
          </label>
          <label className="flex items-center gap-1 text-sm border rounded-lg px-3 py-2 bg-white hover:bg-gray-50">
            <input type="checkbox" checked={showOutOnly} onChange={(e) => setShowOutOnly(e.target.checked)} /> Out of stock
          </label>
          <button className="border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50">⬇️ Export CSV</button>
          <button onClick={() => setShowAddProduct(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-2">➕ Add Product</button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((p) => {
          const { totalUnits, totalValue } = totals(p);
          const status = productStatus(p);
          return (
            <div key={p.id} className="bg-white border rounded-2xl shadow-sm">
              <div className="p-4 border-b flex gap-3 items-center">
                <div className="w-14 h-14 bg-gray-100 rounded-md flex items-center justify-center">
                  {p.imageUrl ? <img src={p.imageUrl} alt={p.productName} /> : <span>👕</span>}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{p.productName}</h2>
                    <span className={`text-xs px-2 py-1 rounded-full ${status.cls}`}>{status.label}</span>
                  </div>
                  <p className="text-sm text-gray-500">Units: {totalUnits} • Stock value: {money(totalValue)}</p>
                </div>
              </div>

              <div className="p-4">
                {p.colors.map((c, idx) => (
                  <div key={idx} className="mb-4 border rounded-lg">
                    <div className="flex justify-between items-center bg-gray-50 px-3 py-2">
                      <span className="font-medium">{c.color}</span>
                      <div className="flex gap-2">
                        <button className="border px-2 py-1 rounded text-gray-700 hover:bg-gray-100">✎ Edit</button>
                        <button
                          className="border border-rose-300 text-rose-700 px-2 py-1 rounded hover:bg-rose-50"
                          onClick={() => setConfirmDelete({ scope: "color", productId: p.id, colorIdx: idx })}
                        >
                          🗑 Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between p-4 border-t">
                <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="border px-3 py-1 rounded hover:bg-gray-50">
                  {expanded === p.id ? "Collapse" : "Expand"}
                </button>
                <button
                  className="border border-rose-300 text-rose-700 px-3 py-1 rounded hover:bg-rose-50"
                  onClick={() => setConfirmDelete({ scope: "product", productId: p.id })}
                >
                  🗑 Delete product
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {confirmDelete && (
        <Modal title="Confirm delete" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-gray-600 mb-4">Type <strong>DELETE</strong> to confirm.</p>
          <ConfirmDelete onCancel={() => setConfirmDelete(null)} onConfirm={deleteItem} />
        </Modal>
      )}
    </main>
  );
}

// ---------- Reusable Modal ----------
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white w-full max-w-md rounded-xl shadow-lg">
        <div className="flex justify-between items-center border-b px-4 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function ConfirmDelete({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const [code, setCode] = useState("");
  return (
    <div className="flex items-center gap-2">
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="DELETE" className="border rounded px-3 py-2" />
      <button onClick={onCancel} className="border px-3 py-2 rounded hover:bg-gray-50">Cancel</button>
      <button disabled={code !== "DELETE"} onClick={onConfirm} className="bg-red-600 text-white rounded px-3 py-2 disabled:opacity-50">
        Delete
      </button>
    </div>
  );
}
