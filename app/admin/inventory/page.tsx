"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  archived?: boolean;
  colors: Color[];
};

// ---------- Small helpers ----------
const money = (v: number) => `Rs ${Number(v || 0).toLocaleString()}`;
const sum = (obj: Record<string, number> = {}) =>
  Object.values(obj).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const LOW_FALLBACK = 5;

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// ---------- Page ----------
export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  // UI state
  const [search, setSearch] = useState("");
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [showOutOnly, setShowOutOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Modals
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [addColorTarget, setAddColorTarget] = useState<Product | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ scope: "product"|"color"|"size"; productId: string; colorIdx?: number; sizeKey?: string } | null>(null);

  // CSV import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live data
  useEffect(() => {
    const qy = query(collection(db, "products"), orderBy("productName"));
    const unsub = onSnapshot(qy, (snap) => {
      const list: Product[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Product, "id">) }));
      setProducts(list);
    });
    return () => unsub();
  }, []);

  // Derived
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      if (!showArchived && p.archived) return false;
      if (showArchived && !p.archived && term === "__archived_only__") return false;
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
  }, [products, search, showLowOnly, showOutOnly, showArchived]);

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

  const overall = useMemo(() => {
    let totalUnits = 0, totalValue = 0, low = 0, out = 0;
    filtered.forEach((p) => {
      const t = totals(p);
      totalUnits += t.totalUnits;
      totalValue += t.totalValue;
      low += t.lowCount;
      out += t.outCount;
    });
    return { totalUnits, totalValue, low, out };
  }, [filtered]);

  const productStatus = (p: Product) => {
    const { lowCount, outCount } = totals(p);
    if (outCount > 0) return { label: "Out", cls: "bg-rose-100 text-rose-700" };
    if (lowCount > 0) return { label: "Low", cls: "bg-amber-100 text-amber-700" };
    return { label: "OK", cls: "bg-emerald-100 text-emerald-700" };
  };

  // ---------- Mutations ----------
  async function updatePrice(productId: string, newPrice: number) {
    const ref = doc(db, "products", productId);
    await updateDoc(ref, { price: Number.isFinite(newPrice) ? newPrice : 0 });
  }

  async function updateSizeQty(productId: string, colorIdx: number, sizeKey: string, newQty: number) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const colors = deepClone(product.colors);
    colors[colorIdx].sizes[sizeKey] = Math.max(0, Math.floor(newQty));
    const ref = doc(db, "products", productId);
    await updateDoc(ref, { colors });
  }

  async function addColorToProduct(product: Product, color: string, initialSizes: SizeMap) {
    const colors = deepClone(product.colors);
    colors.push({ color, sizes: initialSizes });
    await updateDoc(doc(db, "products", product.id), { colors });
  }

  async function duplicateProduct(product: Product) {
    const copy = deepClone(product);
    delete (copy as any).id;
    copy.productName = `${product.productName} Copy`;
    await addDoc(collection(db, "products"), copy);
  }

  async function toggleArchive(product: Product) {
    await updateDoc(doc(db, "products", product.id), { archived: !product.archived });
  }

  async function resetStock(product: Product) {
    const colors = deepClone(product.colors).map((c) => ({
      ...c,
      sizes: Object.fromEntries(Object.entries(c.sizes).map(([k]) => [k, 0])),
    }));
    await updateDoc(doc(db, "products", product.id), { colors });
  }

  async function deleteItem() {
    if (!confirmDelete) return;
    const { scope, productId, colorIdx, sizeKey } = confirmDelete;
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const ref = doc(db, "products", productId);

    if (scope === "product") {
      await deleteDoc(ref);
    } else {
      const colors = deepClone(product.colors);
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
  }

  // ---------- CSV ----------
  function exportCSV() {
    // Columns: Product,Color,Size,Qty,Price
    const rows: string[] = [];
    rows.push(["Product","Color","Size","Qty","Price"].join(","));
    for (const p of filtered) {
      for (const c of p.colors) {
        const sizes = Object.keys(c.sizes).sort((a,b)=>SIZES.indexOf(a)-SIZES.indexOf(b));
        for (const s of sizes) {
          rows.push([
            csvCell(p.productName),
            csvCell(c.color),
            csvCell(s),
            String(c.sizes[s] ?? 0),
            String(p.price ?? 0),
          ].join(","));
        }
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  function csvCell(v: string){ return `"${String(v).replaceAll('"','""')}"`; }

  async function handleImportCSV(file: File) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    // Expect header: Product,Color,Size,Qty,Price
    const data = lines.slice(1).map((line) => {
      const cells = parseCsvLine(line);
      return {
        productName: cells[0] || "",
        color: cells[1] || "",
        size: cells[2] || "",
        qty: Number(cells[3] || 0),
        price: Number(cells[4] || 0),
      };
    });

    // Group by product
    const group = new Map<string, { price?: number; colors: Map<string, Map<string, number>> }>();
    for (const row of data) {
      if (!group.has(row.productName)) group.set(row.productName, { colors: new Map() });
      const g = group.get(row.productName)!;
      if (Number.isFinite(row.price) && row.price > 0) g.price = row.price;
      if (!g.colors.has(row.color)) g.colors.set(row.color, new Map());
      g.colors.get(row.color)!.set(row.size, Math.max(0, Math.floor(row.qty)));
    }

    // Apply
    for (const pName of group.keys()) {
      const existing = products.find((x) => x.productName === pName);
      const g = group.get(pName)!;

      if (!existing) {
        // Create new
        const colors: Color[] = [];
        for (const color of g.colors.keys()) {
          const sizeMap: SizeMap = {};
          for (const size of g.colors.get(color)!.keys()) {
            sizeMap[size] = g.colors.get(color)!.get(size)!;
          }
          colors.push({ color, sizes: sizeMap });
        }
        await addDoc(collection(db, "products"), {
          productName: pName,
          price: g.price ?? 0,
          colors,
        });
      } else {
        // Update existing
        const colors = deepClone(existing.colors);
        for (const color of g.colors.keys()) {
          const idx = colors.findIndex((c) => c.color === color);
          const patch = g.colors.get(color)!;
          if (idx === -1) {
            const sizeMap: SizeMap = {};
            for (const size of patch.keys()) sizeMap[size] = patch.get(size)!;
            colors.push({ color, sizes: sizeMap });
          } else {
            const cur = colors[idx];
            for (const size of patch.keys()) {
              cur.sizes[size] = patch.get(size)!;
            }
          }
        }
        const upd: any = { colors };
        if (g.price !== undefined) upd.price = g.price;
        await updateDoc(doc(db, "products", existing.id), upd);
      }
    }
  }

  function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i=0; i<line.length; i++){
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i+1] === '"'){ cur += '"'; i++; continue; }
        if (ch === '"'){ inQ = false; continue; }
        cur += ch;
      } else {
        if (ch === ','){ out.push(cur); cur=""; continue; }
        if (ch === '"'){ inQ = true; continue; }
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  // ---------- Render ----------
  return (
    <main className="min-h-screen px-6 py-8 max-w-7xl mx-auto bg-gray-50">
      {/* Totals */}
      <div className="mb-6 p-4 bg-white rounded-xl shadow-sm border text-sm flex flex-wrap gap-6">
        <span>Total units: <strong>{overall.totalUnits}</strong></span>
        <span>Stock value: <strong>{money(overall.totalValue)}</strong></span>
        <span className="text-amber-700">Low: {overall.low}</span>
        <span className="text-rose-700">Out: {overall.out}</span>
      </div>

      {/* Controls */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product"
            className="border rounded-lg px-3 py-2 w-72 text-sm bg-white"
          />
          <label className="flex items-center gap-1 text-xs border rounded-lg px-2 py-1 bg-white">
            <input type="checkbox" checked={showLowOnly} onChange={(e) => setShowLowOnly(e.target.checked)} /> Low
          </label>
          <label className="flex items-center gap-1 text-xs border rounded-lg px-2 py-1 bg-white">
            <input type="checkbox" checked={showOutOnly} onChange={(e) => setShowOutOnly(e.target.checked)} /> Out
          </label>
          <label className="flex items-center gap-1 text-xs border rounded-lg px-2 py-1 bg-white">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
          </label>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="border rounded-lg px-3 py-2 text-sm bg-white hover:bg-gray-50">Export CSV</button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                 onChange={async (e) => {
                   const f = e.target.files?.[0];
                   if (f) await handleImportCSV(f);
                   if (fileInputRef.current) fileInputRef.current.value = "";
                 }} />
          <button onClick={() => fileInputRef.current?.click()} className="border rounded-lg px-3 py-2 text-sm bg-white hover:bg-gray-50">Import CSV</button>
          <button onClick={() => setShowAddProduct(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-2 text-sm">Add product</button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((p) => {
          const { totalUnits, totalValue } = totals(p);
          const status = productStatus(p);
          return (
            <div key={p.id} className="bg-white border rounded-2xl shadow-sm">
              <div className="p-4 border-b flex gap-3 items-start">
                <div className="w-12 h-12 bg-gray-100 rounded-md overflow-hidden flex items-center justify-center">
                  {p.imageUrl ? <img src={p.imageUrl} alt={p.productName} className="object-cover w-full h-full" /> : <span className="text-xs text-gray-400">No image</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-medium truncate">{p.productName}</h2>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
                    {p.archived && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">Archived</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Units: {totalUnits} · {money(totalValue)}</p>
                  <div className="flex items-center gap-1 mt-1 text-xs">
                    <span>Price</span>
                    <input
                      type="number"
                      defaultValue={p.price || 0}
                      className="border rounded px-2 py-0.5 w-24 text-xs"
                      onBlur={(e) => updatePrice(p.id, Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <button
                    onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                    className="text-gray-600 hover:text-gray-900 text-sm"
                    aria-label="Expand"
                  >
                    {expanded === p.id ? "▲" : "▼"}
                  </button>
                  <div className="flex gap-1 mt-1">
                    <button
                      className="border px-1.5 py-0.5 rounded text-[11px] hover:bg-gray-50"
                      onClick={() => duplicateProduct(p)}
                      title="Duplicate"
                    >
                      Copy
                    </button>
                    <button
                      className="border px-1.5 py-0.5 rounded text-[11px] hover:bg-gray-50"
                      onClick={() => toggleArchive(p)}
                      title={p.archived ? "Unarchive" : "Archive"}
                    >
                      {p.archived ? "Unarchive" : "Archive"}
                    </button>
                    <button
                      className="border px-1.5 py-0.5 rounded text-[11px] hover:bg-gray-50"
                      onClick={() => resetStock(p)}
                      title="Reset stock"
                    >
                      Reset
                    </button>
                    <button
                      className="border border-rose-300 text-rose-700 px-1.5 py-0.5 rounded text-[11px] hover:bg-rose-50"
                      onClick={() => setConfirmDelete({ scope: "product", productId: p.id })}
                      title="Delete"
                    >
                      Del
                    </button>
                  </div>
                </div>
              </div>

              {expanded === p.id && (
                <div className="p-3 text-xs">
                  <div className="flex justify-end mb-2">
                    <button className="border px-2 py-1 rounded text-xs hover:bg-gray-50"
                            onClick={() => setAddColorTarget(p)}>
                      Add color
                    </button>
                  </div>
                  {p.colors.map((c, idx) => (
                    <div key={idx} className="mb-3 border rounded">
                      <div className="flex justify-between items-center bg-gray-50 px-2 py-1">
                        <span className="font-medium">{c.color}</span>
                        <div className="flex gap-1">
                          <button
                            className="px-1 text-[11px] border rounded hover:bg-gray-100"
                            onClick={() => setConfirmDelete({ scope: "color", productId: p.id, colorIdx: idx })}
                            title="Delete color"
                          >
                            Del
                          </button>
                        </div>
                      </div>
                      <div className="px-2 py-1">
                        {Object.keys(c.sizes)
                          .sort((a, b) => SIZES.indexOf(a) - SIZES.indexOf(b))
                          .map((size) => (
                            <div key={size} className="grid grid-cols-3 items-center py-1 border-b last:border-0">
                              <span>{size}</span>
                              <input
                                type="number"
                                defaultValue={c.sizes[size]}
                                className="justify-self-end border rounded px-2 py-0.5 w-24 text-right"
                                onBlur={(e) => updateSizeQty(p.id, idx, size, Number(e.target.value))}
                              />
                              <div className="justify-self-end">
                                <button
                                  className="text-rose-600 text-[11px]"
                                  onClick={() =>
                                    setConfirmDelete({ scope: "size", productId: p.id, colorIdx: idx, sizeKey: size })
                                  }
                                  title="Remove size"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Product Modal */}
      {showAddProduct && (
        <AddProductModal
          onClose={() => setShowAddProduct(false)}
          onCreate={async (payload) => {
            await addDoc(collection(db, "products"), payload);
            setShowAddProduct(false);
          }}
        />
      )}

      {/* Add Color Modal */}
      {addColorTarget && (
        <AddColorModal
          product={addColorTarget}
          onClose={() => setAddColorTarget(null)}
          onCreate={async (color, sizes) => {
            await addColorToProduct(addColorTarget, color, sizes);
            setAddColorTarget(null);
          }}
        />
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <Modal title="Confirm delete" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-gray-600 mb-4">Type DELETE to confirm.</p>
          <ConfirmDelete onCancel={() => setConfirmDelete(null)} onConfirm={deleteItem} />
        </Modal>
      )}
    </main>
  );
}

// ---------- Modals ----------
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white w-full max-w-md rounded-xl shadow-lg">
        <div className="flex justify-between items-center border-b px-4 py-3">
          <h3 className="font-semibold text-sm">{title}</h3>
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
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="DELETE" className="border rounded px-3 py-2 w-full" />
      <button onClick={onCancel} className="border px-3 py-2 rounded hover:bg-gray-50">Cancel</button>
      <button disabled={code !== "DELETE"} onClick={onConfirm} className="bg-red-600 text-white rounded px-3 py-2 disabled:opacity-50">
        Delete
      </button>
    </div>
  );
}

function AddProductModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (payload: { productName: string; price: number; imageUrl?: string; colors: Color[] }) => Promise<void>;
}) {
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [rows, setRows] = useState<{ color: string; sizes: SizeMap }[]>([
    { color: "", sizes: Object.fromEntries(SIZES.map((s) => [s, 0])) as SizeMap },
  ]);

  function updateSize(rowIdx: number, size: string, val: number) {
    const next = rows.map((r, i) => (i === rowIdx ? { ...r, sizes: { ...r.sizes, [size]: Math.max(0, Math.floor(val)) } } : r));
    setRows(next);
  }

  function addRow() {
    setRows((x) => [...x, { color: "", sizes: Object.fromEntries(SIZES.map((s) => [s, 0])) as SizeMap }]);
  }

  function removeRow(idx: number) {
    setRows((x) => x.filter((_, i) => i !== idx));
  }

  return (
    <Modal title="Add product" onClose={onClose}>
      <div className="space-y-3">
        <input className="border rounded px-3 py-2 w-full text-sm" placeholder="Product name" value={productName} onChange={(e)=>setProductName(e.target.value)} />
        <div className="flex gap-2">
          <input className="border rounded px-3 py-2 w-40 text-sm" placeholder="Price" type="number" value={price} onChange={(e)=>setPrice(Number(e.target.value))} />
          <input className="border rounded px-3 py-2 flex-1 text-sm" placeholder="Image URL (optional)" value={imageUrl} onChange={(e)=>setImageUrl(e.target.value)} />
        </div>
        <div className="border rounded">
          <div className="flex justify-between items-center bg-gray-50 px-3 py-2 text-sm">
            <span>Colors and sizes</span>
            <button className="border px-2 py-1 rounded text-xs hover:bg-gray-100" onClick={addRow}>Add color</button>
          </div>
          <div className="divide-y">
            {rows.map((r, idx) => (
              <div key={idx} className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input className="border rounded px-2 py-1 text-sm w-48" placeholder="Color" value={r.color} onChange={(e)=>{
                    const next = [...rows]; next[idx].color = e.target.value; setRows(next);
                  }} />
                  <button className="ml-auto text-rose-600 text-xs" onClick={()=>removeRow(idx)}>Remove</button>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {SIZES.map((s)=>(
                    <div key={s} className="flex flex-col">
                      <span className="text-[11px] text-gray-600">{s}</span>
                      <input type="number" className="border rounded px-2 py-1 text-sm"
                             value={r.sizes[s]} onChange={(e)=>updateSize(idx, s, Number(e.target.value))}/>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="border px-3 py-2 rounded hover:bg-gray-50 text-sm">Cancel</button>
          <button
            onClick={() =>
              onCreate({
                productName: productName.trim(),
                price: Number.isFinite(price) ? price : 0,
                imageUrl: imageUrl.trim() || undefined,
                colors: rows
                  .filter((r) => r.color.trim())
                  .map((r) => ({ color: r.color.trim(), sizes: r.sizes })),
              })
            }
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded px-3 py-2 text-sm"
          >
            Create
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddColorModal({
  product,
  onClose,
  onCreate,
}: {
  product: Product;
  onClose: () => void;
  onCreate: (color: string, sizes: SizeMap) => Promise<void>;
}) {
  const [color, setColor] = useState("");
  const [sizes, setSizes] = useState<SizeMap>(Object.fromEntries(SIZES.map((s) => [s, 0])) as SizeMap);

  return (
    <Modal title={`Add color to ${product.productName}`} onClose={onClose}>
      <div className="space-y-3">
        <input className="border rounded px-3 py-2 w-full text-sm" placeholder="Color" value={color} onChange={(e)=>setColor(e.target.value)} />
        <div className="grid grid-cols-7 gap-2">
          {SIZES.map((s)=>(
            <div key={s} className="flex flex-col">
              <span className="text-[11px] text-gray-600">{s}</span>
              <input type="number" className="border rounded px-2 py-1 text-sm"
                     value={sizes[s]} onChange={(e)=>setSizes({...sizes, [s]: Math.max(0, Math.floor(Number(e.target.value)))})}/>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="border px-3 py-2 rounded hover:bg-gray-50 text-sm">Cancel</button>
          <button onClick={() => onCreate(color.trim(), sizes)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded px-3 py-2 text-sm">
            Add
          </button>
        </div>
      </div>
    </Modal>
  );
}
