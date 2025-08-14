'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
} from 'firebase/firestore';

// ---------- Types ----------
type SizeMap = Record<string, number>;
type MinMap = Record<string, number>;
type Color = { color: string; sizes: SizeMap; minStock?: MinMap };
type Product = {
  id: string;
  productName: string;
  imageUrl?: string;
  price?: number; // per-unit sell price (Rs)
  colors: Color[];
};

// ---------- Small helpers ----------
const money = (v: number) => `Rs ${Number(v || 0).toLocaleString()}`;
const sum = (obj: Record<string, number> = {}) =>
  Object.values(obj).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const LOW_FALLBACK = 5;

// ---------- Page ----------
export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  // UI state
  const [search, setSearch] = useState('');
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [showOutOnly, setShowOutOnly] = useState(false);

  // Modals
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showColorModal, setShowColorModal] = useState<{ productId: string } | null>(null);
  const [showBulkModal, setShowBulkModal] = useState<{ productId: string; colorIdx: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ scope: 'product'|'color'|'size'; productId: string; colorIdx?: number; sizeKey?: string } | null>(null);

  // Forms
  const [npName, setNpName] = useState('');
  const [npImage, setNpImage] = useState('');
  const [npPrice, setNpPrice] = useState<number | ''>('');
  const [ncColor, setNcColor] = useState('');
  const [ncSizes, setNcSizes] = useState<Record<string, { qty: number | ''; min: number | '' }>>(
    Object.fromEntries(DEFAULT_SIZES.map(s => [s, { qty: '', min: '' }]))
  );

  // Live data
  useEffect(() => {
    const qy = query(collection(db, 'products'), orderBy('productName'));
    const unsub = onSnapshot(qy, (snap) => {
      const list: Product[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Product, 'id'>) }));
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

      // derive low/out flags
      const allSizes = p.colors.flatMap((c) => Object.entries(c.sizes).map(([k, v]) => {
        const min = c.minStock?.[k] ?? LOW_FALLBACK;
        return { qty: v, min };
      }));
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
    if (outCount > 0) return { badge: '🔴 Out of stock parts', tone: 'text-red-600' };
    if (lowCount > 0) return { badge: '🟠 Low stock', tone: 'text-orange-600' };
    return { badge: '🟢 Healthy', tone: 'text-green-600' };
  };

  // ---------- Mutations ----------
  const addProduct = async () => {
    if (!npName.trim()) return;
    await addDoc(collection(db, 'products'), {
      productName: npName.trim(),
      imageUrl: npImage.trim() || null,
      price: npPrice === '' ? null : Number(npPrice),
      colors: [],
    });
    setNpName(''); setNpImage(''); setNpPrice('');
    setShowAddProduct(false);
  };

  const editProductPrice = async (productId: string, price: number | '') => {
    const ref = doc(db, 'products', productId);
    await updateDoc(ref, { price: price === '' ? null : Number(price) });
  };

  const editProductName = async (productId: string, newName: string) => {
    if (!newName.trim()) return;
    const ref = doc(db, 'products', productId);
    await updateDoc(ref, { productName: newName.trim() });
  };

  const addColorOrSizes = async (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product || !ncColor.trim()) return;

    const ref = doc(db, 'products', productId);
    const copy: Product = JSON.parse(JSON.stringify(product));
    const idx = copy.colors.findIndex((c) => c.color.toLowerCase() === ncColor.trim().toLowerCase());

    const sizesObj: SizeMap = {};
    const minObj: MinMap = {};
    Object.entries(ncSizes).forEach(([k, v]) => {
      if (v.qty !== '' || v.min !== '') {
        sizesObj[k] = Number(v.qty || 0);
        if (v.min !== '') minObj[k] = Number(v.min);
      }
    });

    if (idx >= 0) {
      // merge into existing color
      copy.colors[idx].sizes = { ...copy.colors[idx].sizes, ...sizesObj };
      copy.colors[idx].minStock = { ...(copy.colors[idx].minStock || {}), ...minObj };
    } else {
      copy.colors.push({ color: ncColor.trim(), sizes: sizesObj, minStock: Object.keys(minObj).length ? minObj : undefined });
    }

    await updateDoc(ref, { colors: copy.colors });
    // reset form
    setNcColor('');
    setNcSizes(Object.fromEntries(DEFAULT_SIZES.map(s => [s, { qty: '', min: '' }])) as any);
    setShowColorModal(null);
    setExpanded(productId);
  };

  const updateQty = async (productId: string, colorIdx: number, sizeKey: string, qty: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const ref = doc(db, 'products', productId);
    const colors = JSON.parse(JSON.stringify(product.colors)) as Color[];
    colors[colorIdx].sizes[sizeKey] = Math.max(0, Number.isFinite(qty) ? qty : 0);
    await updateDoc(ref, { colors });
  };

  const updateMin = async (productId: string, colorIdx: number, sizeKey: string, min: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const ref = doc(db, 'products', productId);
    const colors = JSON.parse(JSON.stringify(product.colors)) as Color[];
    colors[colorIdx].minStock = colors[colorIdx].minStock || {};
    colors[colorIdx].minStock![sizeKey] = Math.max(0, Number.isFinite(min) ? min : 0);
    await updateDoc(ref, { colors });
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const { scope, productId, colorIdx, sizeKey } = confirmDelete;
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const ref = doc(db, 'products', productId);

    if (scope === 'product') {
      await deleteDoc(ref);
    } else {
      const colors = JSON.parse(JSON.stringify(product.colors)) as Color[];
      if (scope === 'color' && typeof colorIdx === 'number') {
        colors.splice(colorIdx, 1);
        await updateDoc(ref, { colors });
      }
      if (scope === 'size' && typeof colorIdx === 'number' && sizeKey) {
        delete colors[colorIdx].sizes[sizeKey];
        if (colors[colorIdx].minStock) delete colors[colorIdx].minStock![sizeKey];
        await updateDoc(ref, { colors });
      }
    }
    setConfirmDelete(null);
  };

  // Export CSV (filtered view)
  const exportCSV = () => {
    const rows: string[] = [
      ['Product Name', 'Color', 'Size', 'Qty', 'Min', 'Price (Rs)', 'Total Stock Value (Rs)'].join(','),
    ];

    filtered.forEach((p) => {
      const price = p.price || 0;
      p.colors.forEach((c) => {
        Object.entries(c.sizes).forEach(([size, qty]) => {
          const min = c.minStock?.[size] ?? '';
          const line = [
            csv(p.productName),
            csv(c.color),
            csv(size),
            String(qty),
            String(min),
            String(price),
            String(qty * price),
          ].join(',');
          rows.push(line);
        });
      });
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'inventory_export.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
  const csv = (s: string) => `"${String(s).replace(/"/g, '""')}"`;

  // ---------- Render ----------
  return (
    <main className="min-h-screen px-6 py-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">📦 Inventory</h1>
          <p className="text-gray-600">Enterprise-grade control over products, colors, sizes & alerts.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product…"
              className="border rounded-lg px-3 py-2 w-64"
            />
          </div>
          <label className="flex items-center gap-2 text-sm bg-white border rounded-lg px-3 py-2">
            <input type="checkbox" checked={showLowOnly} onChange={(e) => setShowLowOnly(e.target.checked)} />
            Low stock
          </label>
          <label className="flex items-center gap-2 text-sm bg-white border rounded-lg px-3 py-2">
            <input type="checkbox" checked={showOutOnly} onChange={(e) => setShowOutOnly(e.target.checked)} />
            Out of stock
          </label>
          <button onClick={exportCSV} className="ml-2 bg-gray-900 text-white rounded-lg px-3 py-2">
            ⬇️ Export CSV
          </button>
          <button onClick={() => setShowAddProduct(true)} className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-3 py-2">
            ➕ Add Product
          </button>
        </div>
      </div>

      {/* Product Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((p) => {
          const { totalUnits, totalValue } = totals(p);
          const status = productStatus(p);

          return (
            <div key={p.id} className="bg-white border rounded-2xl shadow-sm overflow-hidden">
              {/* Card header */}
              <div className="p-4 flex gap-4 items-center border-b">
                <div className="w-16 h-16 bg-gray-100 rounded-md overflow-hidden flex items-center justify-center">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.productName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl">👕</span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <input
                      defaultValue={p.productName}
                      className="font-semibold text-lg outline-none"
                      onBlur={(e) => e.target.value !== p.productName && editProductName(p.id, e.target.value)}
                    />
                    <span className={`text-xs px-2 py-0.5 rounded-full ${status.tone} bg-gray-100`}>{status.badge}</span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    Units: <strong>{totalUnits}</strong> • Stock value: <strong>{money(totalValue)}</strong>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Unit price</div>
                  <input
                    type="number"
                    defaultValue={p.price ?? ''}
                    placeholder="0"
                    className="border rounded-md px-2 py-1 w-28"
                    onBlur={(e) => editProductPrice(p.id, e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Colors & Sizes */}
              <div className="p-4 space-y-4">
                {p.colors.map((c, cIdx) => (
                  <div key={`${p.id}-${c.color}`} className="border rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
                      <div className="font-medium">{c.color}</div>
                      <div className="flex items-center gap-2">
                        <button
                          className="text-sm text-blue-600 hover:underline"
                          onClick={() => setShowBulkModal({ productId: p.id, colorIdx: cIdx })}
                        >
                          ✎ Bulk edit
                        </button>
                        <button
                          className="text-sm text-red-600 hover:underline"
                          onClick={() => setConfirmDelete({ scope: 'color', productId: p.id, colorIdx: cIdx })}
                        >
                          Delete color
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="text-left px-3 py-2">Size</th>
                            <th className="text-right px-3 py-2">Qty</th>
                            <th className="text-right px-3 py-2">Min</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(c.sizes)
                            .sort((a, b) => DEFAULT_SIZES.indexOf(a[0]) - DEFAULT_SIZES.indexOf(b[0]))
                            .map(([size, qty]) => {
                              const min = c.minStock?.[size] ?? LOW_FALLBACK;
                              const tone =
                                qty <= 0 ? 'text-red-600' : qty <= min ? 'text-orange-600' : 'text-green-700';
                              return (
                                <tr key={`${p.id}-${c.color}-${size}`} className="border-t">
                                  <td className="px-3 py-2">{size}</td>
                                  <td className="px-3 py-2 text-right">
                                    <input
                                      type="number"
                                      value={qty}
                                      onChange={(e) => updateQty(p.id, cIdx, size, parseInt(e.target.value) || 0)}
                                      className={`w-20 border rounded px-2 py-1 text-right ${tone}`}
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <input
                                      type="number"
                                      value={min}
                                      onChange={(e) => updateMin(p.id, cIdx, size, parseInt(e.target.value) || 0)}
                                      className="w-20 border rounded px-2 py-1 text-right"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <button
                                      className="text-red-600 hover:underline"
                                      onClick={() => setConfirmDelete({ scope: 'size', productId: p.id, colorIdx: cIdx, sizeKey: size })}
                                    >
                                      Delete
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                {/* Add color/size */}
                <div className="flex justify-end">
                  <button
                    className="bg-blue-600 text-white rounded-lg px-3 py-2"
                    onClick={() => { setShowColorModal({ productId: p.id }); setExpanded(p.id); }}
                  >
                    🎨 Add color / sizes
                  </button>
                </div>
              </div>

              {/* Footer actions */}
              <div className="px-4 pb-4 flex items-center justify-between">
                <button
                  className="text-gray-600 hover:underline"
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                >
                  {expanded === p.id ? 'Collapse' : 'Expand details'}
                </button>
                <button
                  className="text-red-600 hover:underline"
                  onClick={() => setConfirmDelete({ scope: 'product', productId: p.id })}
                >
                  Delete product
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-gray-500 text-center mt-12">No products match your filters.</p>
      )}

      {/* ---------- Modals ---------- */}

      {/* Add Product */}
      {showAddProduct && (
        <Modal onClose={() => setShowAddProduct(false)} title="Add Product">
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm text-gray-600">Product name</span>
              <input value={npName} onChange={(e) => setNpName(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Image URL (optional)</span>
              <input value={npImage} onChange={(e) => setNpImage(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Unit price (Rs)</span>
              <input
                type="number"
                value={npPrice}
                onChange={(e) => setNpPrice(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="px-3 py-2" onClick={() => setShowAddProduct(false)}>Cancel</button>
            <button className="bg-orange-600 text-white rounded-lg px-3 py-2" onClick={addProduct}>Save</button>
          </div>
        </Modal>
      )}

      {/* Add Color / Sizes */}
      {showColorModal && (
        <Modal onClose={() => setShowColorModal(null)} title="Add Color & Sizes">
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm text-gray-600">Color</span>
              <input value={ncColor} onChange={(e) => setNcColor(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </label>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {DEFAULT_SIZES.map((s) => (
                <div key={s} className="flex gap-2 items-center">
                  <span className="w-10 text-sm text-gray-600">{s}</span>
                  <input
                    type="number"
                    placeholder="Qty"
                    value={ncSizes[s].qty}
                    onChange={(e) =>
                      setNcSizes((prev) => ({ ...prev, [s]: { ...prev[s], qty: e.target.value === '' ? '' : Number(e.target.value) } }))
                    }
                    className="border rounded px-2 py-1 w-20"
                  />
                  <input
                    type="number"
                    placeholder="Min"
                    value={ncSizes[s].min}
                    onChange={(e) =>
                      setNcSizes((prev) => ({ ...prev, [s]: { ...prev[s], min: e.target.value === '' ? '' : Number(e.target.value) } }))
                    }
                    className="border rounded px-2 py-1 w-20"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="px-3 py-2" onClick={() => setShowColorModal(null)}>Cancel</button>
            <button
              className="bg-blue-600 text-white rounded-lg px-3 py-2"
              onClick={() => addColorOrSizes(showColorModal.productId)}
            >
              Save
            </button>
          </div>
        </Modal>
      )}

      {/* Bulk Edit for a Color */}
      {showBulkModal && (() => {
        const p = products.find(x => x.id === showBulkModal.productId);
        const color = p?.colors[showBulkModal.colorIdx];
        if (!p || !color) return null;
        const [local, setLocal] = useState<Record<string, { qty: number; min: number }>>(
          Object.fromEntries(
            DEFAULT_SIZES.map((s) => [
              s,
              {
                qty: Number.isFinite(color.sizes[s]) ? color.sizes[s] : 0,
                min: Number.isFinite(color.minStock?.[s] ?? NaN) ? (color.minStock?.[s] as number) : LOW_FALLBACK,
              },
            ])
          )
        );
        return (
          <Modal onClose={() => setShowBulkModal(null)} title={`Bulk edit • ${p.productName} • ${color.color}`}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {DEFAULT_SIZES.map((s) => (
                <div key={s} className="flex gap-2 items-center">
                  <span className="w-10 text-sm text-gray-600">{s}</span>
                  <input
                    type="number"
                    value={local[s].qty}
                    onChange={(e) => setLocal((pr) => ({ ...pr, [s]: { ...pr[s], qty: parseInt(e.target.value) || 0 } }))}
                    className="border rounded px-2 py-1 w-20"
                  />
                  <input
                    type="number"
                    value={local[s].min}
                    onChange={(e) => setLocal((pr) => ({ ...pr, [s]: { ...pr[s], min: parseInt(e.target.value) || 0 } }))}
                    className="border rounded px-2 py-1 w-20"
                  />
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="px-3 py-2" onClick={() => setShowBulkModal(null)}>Cancel</button>
              <button
                className="bg-blue-600 text-white rounded-lg px-3 py-2"
                onClick={async () => {
                  const ref = doc(db, 'products', p.id);
                  const colors = JSON.parse(JSON.stringify(p.colors)) as Color[];
                  DEFAULT_SIZES.forEach((s) => {
                    colors[showBulkModal.colorIdx].sizes[s] = local[s].qty;
                    colors[showBulkModal.colorIdx].minStock = colors[showBulkModal.colorIdx].minStock || {};
                    colors[showBulkModal.colorIdx].minStock![s] = local[s].min;
                  });
                  await updateDoc(ref, { colors });
                  setShowBulkModal(null);
                }}
              >
                Save all
              </button>
            </div>
          </Modal>
        );
      })()}

      {/* Confirm Delete */}
      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} title="Confirm delete">
          <p className="text-sm text-gray-700 mb-4">
            Type <strong>DELETE</strong> to confirm this action.
          </p>
          <ConfirmDelete
            onCancel={() => setConfirmDelete(null)}
            onConfirm={doDelete}
          />
        </Modal>
      )}
    </main>
  );
}

// ---------- Reusable Modal ----------
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">✕</button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ---------- Confirm Delete with code ----------
function ConfirmDelete({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const [code, setCode] = useState('');
  const REQUIRED = process.env.NEXT_PUBLIC_DELETE_CODE || 'DELETE';
  return (
    <div className="flex items-center justify-end gap-2">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={REQUIRED}
        className="border rounded-lg px-3 py-2"
      />
      <button className="px-3 py-2" onClick={onCancel}>Cancel</button>
      <button
        className="bg-red-600 text-white rounded-lg px-3 py-2 disabled:opacity-60"
        disabled={code !== REQUIRED}
        onClick={onConfirm}
      >
        Delete
      </button>
    </div>
  );
}
