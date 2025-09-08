"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
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
const LOW_FALLBACK = 5;

// ---------- Page ----------
export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [showOutOnly, setShowOutOnly] = useState(false);
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

  // ---------- Metrics ----------
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

  const overallTotals = useMemo(() => {
    let totalUnits = 0, totalValue = 0, low = 0, out = 0;
    products.forEach((p) => {
      const { totalUnits: u, totalValue: v, lowCount, outCount } = totals(p);
      totalUnits += u;
      totalValue += v;
      low += lowCount;
      out += outCount;
    });
    return { totalUnits, totalValue, low, out };
  }, [products]);

  const productStatus = (p: Product) => {
    const { lowCount, outCount } = totals(p);
    if (outCount > 0) return { label: "Out", cls: "bg-rose-100 text-rose-700" };
    if (lowCount > 0) return { label: "Low", cls: "bg-amber-100 text-amber-700" };
    return { label: "OK", cls: "bg-emerald-100 text-emerald-700" };
  };

  // ---------- Mutations ----------
  const updatePrice = async (productId: string, newPrice: number) => {
    const ref = doc(db, "products", productId);
    await updateDoc(ref, { price: newPrice });
  };

  const updateSizeQty = async (productId: string, colorIdx: number, sizeKey: string, newQty: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const colors = JSON.parse(JSON.stringify(product.colors)) as Color[];
    colors[colorIdx].sizes[sizeKey] = newQty;
    const ref = doc(db, "products", productId);
    await updateDoc(ref, { colors });
  };

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
      {/* Totals summary */}
      <div className="mb-6 p-4 bg-white rounded-xl shadow-sm border flex gap-6 text-sm">
        <span>👕 Total: <strong>{overallTotals.totalUnits}</strong></span>
        <span>💰 Value: <strong>{money(overallTotals.totalValue)}</strong></span>
        <span className="text-amber-600">⚠️ Low: {overallTotals.low}</span>
        <span className="text-rose-600">❌ Out: {overallTotals.out}</span>
      </div>

      {/* Controls */}
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Inventory</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product…"
            className="border rounded-lg px-3 py-2 w-64 text-sm"
          />
          <label className="flex items-center gap-1 text-xs border rounded-lg px-2 py-1 bg-white hover:bg-gray-50">
            <input type="checkbox" checked={showLowOnly} onChange={(e) => setShowLowOnly(e.target.checked)} /> Low
          </label>
          <label className="flex items-center gap-1 text-xs border rounded-lg px-2 py-1 bg-white hover:bg-gray-50">
            <input type="checkbox" checked={showOutOnly} onChange={(e) => setShowOutOnly(e.target.checked)} /> Out
          </label>
        </div>
      </header>

      {/* Product cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((p) => {
          const { totalUnits, totalValue } = totals(p);
          const status = productStatus(p);
          return (
            <div key={p.id} className="bg-white border rounded-2xl shadow-sm">
              <div className="p-4 border-b flex gap-3 items-center">
                <div className="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center">
                  {p.imageUrl ? <img src={p.imageUrl} alt={p.productName} /> : <span>👕</span>}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-medium">{p.productName}</h2>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
                  </div>
                  <p className="text-xs text-gray-500">Units: {totalUnits} • {money(totalValue)}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs">
                    <span>Price:</span>
                    <input
                      type="number"
                      defaultValue={p.price || 0}
                      className="border rounded px-2 py-0.5 w-20 text-xs"
                      onBlur={(e) => updatePrice(p.id, Number(e.target.value))}
                    />
                  </div>
                </div>
                <button
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  className="ml-2 text-gray-500 hover:text-gray-800 text-sm"
                >
                  {expanded === p.id ? "▲" : "▼"}
                </button>
              </div>

              {expanded === p.id && (
                <div className="p-3 text-xs">
                  {p.colors.map((c, idx) => (
                    <div key={idx} className="mb-3 border rounded">
                      <div className="flex justify-between items-center bg-gray-50 px-2 py-1">
                        <span>{c.color}</span>
                        <div className="flex gap-1">
                          <button className="px-1 text-xs hover:text-blue-600">✎</button>
                          <button
                            className="px-1 text-xs text-rose-600"
                            onClick={() => setConfirmDelete({ scope: "color", productId: p.id, colorIdx: idx })}
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                      <div className="px-2 py-1">
                        {Object.entries(c.sizes).map(([size, qty]) => (
                          <div key={size} className="flex justify-between items-center py-0.5 border-b last:border-0">
                            <span>{size}</span>
                            <input
                              type="number"
                              defaultValue={qty}
                              className="border rounded px-1 py-0.5 w-16 text-xs text-right"
                              onBlur={(e) =>
                                updateSizeQty(p.id, idx, size, Number(e.target.value))
                              }
                            />
                            <button
                              className="ml-1 text-rose-500"
                              onClick={() =>
                                setConfirmDelete({ scope: "size", productId: p.id, colorIdx: idx, sizeKey: size })
                              }
                            >
                              ❌
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 p-2 border-t text-xs">
                <button className="px-2 py-1 border rounded hover:bg-gray-50">📄 Duplicate</button>
                <button className="px-2 py-1 border rounded hover:bg-gray-50">📦 Archive</button>
                <button
                  className="px-2 py-1 border border-rose-300 text-rose-600 rounded hover:bg-rose-50"
                  onClick={() => setConfirmDelete({ scope: "product", productId: p.id })}
                >
                  🗑 Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm Delete */}
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
        <div className="flex justify-between items-center border-b px-4 py-2 text-sm">
          <h3 className="font-medium">{title}</h3>
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
    <div className="flex items-center gap-2 text-sm">
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="DELETE" className="border rounded px-2 py-1" />
      <button onClick={onCancel} className="border px-2 py-1 rounded hover:bg-gray-50">Cancel</button>
      <button disabled={code !== "DELETE"} onClick={onConfirm} className="bg-red-600 text-white rounded px-2 py-1 disabled:opacity-50">
        Delete
      </button>
    </div>
  );
}
