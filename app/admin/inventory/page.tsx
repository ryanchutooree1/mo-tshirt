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
  price?: number;     // per-unit sell price (Rs)
  archived?: boolean;
  colors: Color[];
};

// ---------- Small helpers ----------
const money = (v: number) => `Rs ${Number(v || 0).toLocaleString()}`;
const sum = (obj: Record<string, number> = {}) =>
  Object.values(obj).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const LOW_FALLBACK = 5;
const csvCell = (s: string) => `"${String(s).replace(/"/g, '""')}"`;

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
  const [showColorModal, setShowColorModal] = useState<{ productId: string } | null>(null);
  const [showBulkModal, setShowBulkModal] = useState<{ productId: string; colorIdx: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    scope: "product" | "color" | "size";
    productId: string;
    colorIdx?: number;
    sizeKey?: string;
  } | null>(null);
  const [openColors, setOpenColors] = useState<Record<string, boolean>>({});

  // Add product form
  const [npName, setNpName] = useState("");
  const [npImage, setNpImage] = useState("");
  const [npPrice, setNpPrice] = useState<number | "">("");

  // Add color form
  const [ncColor, setNcColor] = useState("");
  const [ncSizes, setNcSizes] = useState<Record<string, { qty: number | ""; min: number | "" }>>(
    Object.fromEntries(DEFAULT_SIZES.map((s) => [s, { qty: "", min: "" }])) as any
  );

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

  // Filtered list
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      if (!showArchived && p.archived) return false;
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
    if (outCount > 0) return { label: "Out", cls: "bg-rose-50 text-rose-700" };
    if (lowCount > 0) return { label: "Low", cls: "bg-amber-50 text-amber-700" };
    return { label: "OK", cls: "bg-emerald-50 text-emerald-700" };
  };

  // ---------- Mutations ----------
  const addProduct = async () => {
    if (!npName.trim()) return;
    await addDoc(collection(db, "products"), {
      productName: npName.trim(),
      imageUrl: npImage.trim() || null,
      price: npPrice === "" ? null : Number(npPrice),
      archived: false,
      colors: [],
    });
    setNpName("");
    setNpImage("");
    setNpPrice("");
    setShowAddProduct(false);
  };

  const editProductPrice = async (productId: string, price: number | "") => {
    await updateDoc(doc(db, "products", productId), { price: price === "" ? null : Number(price) });
  };

  const editProductName = async (productId: string, newName: string) => {
    if (!newName.trim()) return;
    await updateDoc(doc(db, "products", productId), { productName: newName.trim() });
  };

  const toggleArchive = async (p: Product) => {
    await updateDoc(doc(db, "products", p.id), { archived: !p.archived });
  };

  const duplicateProduct = async (p: Product) => {
    const copy = deepClone(p);
    delete (copy as any).id;
    copy.productName = `${p.productName} Copy`;
    await addDoc(collection(db, "products"), copy);
  };

  const resetStock = async (p: Product) => {
    const colors = deepClone(p.colors).map((c) => ({
      ...c,
      sizes: Object.fromEntries(Object.keys(c.sizes).map((k) => [k, 0])),
    }));
    await updateDoc(doc(db, "products", p.id), { colors });
  };

  const addColorOrSizes = async (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product || !ncColor.trim()) return;

    const ref = doc(db, "products", productId);
    const copy: Product = deepClone(product);
    const idx = copy.colors.findIndex((c) => c.color.toLowerCase() === ncColor.trim().toLowerCase());

    const sizesObj: SizeMap = {};
    const minObj: MinMap = {};
    Object.entries(ncSizes).forEach(([k, v]) => {
      if (v.qty !== "" || v.min !== "") {
        sizesObj[k] = Number(v.qty || 0);
        if (v.min !== "") minObj[k] = Number(v.min);
      }
    });

    if (idx >= 0) {
      copy.colors[idx].sizes = { ...copy.colors[idx].sizes, ...sizesObj };
      copy.colors[idx].minStock = { ...(copy.colors[idx].minStock || {}), ...minObj };
    } else {
      copy.colors.push({
        color: ncColor.trim(),
        sizes: sizesObj,
        minStock: Object.keys(minObj).length ? minObj : undefined,
      });
    }

    await updateDoc(ref, { colors: copy.colors });

    // reset form
    setNcColor("");
    setNcSizes(Object.fromEntries(DEFAULT_SIZES.map((s) => [s, { qty: "", min: "" }])) as any);
    setShowColorModal(null);
    setExpanded(productId);
  };

  const updateQty = async (productId: string, colorIdx: number, sizeKey: string, qty: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const colors = deepClone(product.colors);
    colors[colorIdx].sizes[sizeKey] = Math.max(0, Number.isFinite(qty) ? qty : 0);
    await updateDoc(doc(db, "products", productId), { colors });
  };

  const updateMin = async (productId: string, colorIdx: number, sizeKey: string, min: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const colors = deepClone(product.colors);
    colors[colorIdx].minStock = colors[colorIdx].minStock || {};
    colors[colorIdx].minStock![sizeKey] = Math.max(0, Number.isFinite(min) ? min : 0);
    await updateDoc(doc(db, "products", productId), { colors });
  };

  const doDelete = async () => {
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
  };

  // ---------- CSV ----------
  const exportCSV = () => {
    const rows: string[] = [["Product", "Color", "Size", "Qty", "Min", "Price", "RowValue"].join(",")];
    filtered.forEach((p) => {
      const price = p.price || 0;
      p.colors.forEach((c) => {
        Object.entries(c.sizes)
          .sort((a, b) => DEFAULT_SIZES.indexOf(a[0]) - DEFAULT_SIZES.indexOf(b[0]))
          .forEach(([size, qty]) => {
            const min = c.minStock?.[size] ?? "";
            rows.push(
              [csvCell(p.productName), csvCell(c.color), csvCell(size), String(qty), String(min), String(price), String(price * (qty || 0))].join(",")
            );
          });
      });
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCSV = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) return;

    // Expect header: Product,Color,Size,Qty,Min,Price
    const recs = lines.slice(1).map((line) => {
      const cells = parseCsvLine(line);
      return {
        productName: cells[0] || "",
        color: cells[1] || "",
        size: cells[2] || "",
        qty: Number(cells[3] || 0),
        min: cells[4] === "" ? undefined : Number(cells[4]),
        price: cells[5] === "" ? undefined : Number(cells[5]),
      };
    });

    // Group by product
    const byProduct = new Map<
      string,
      { price?: number; colors: Map<string, Map<string, { qty: number; min?: number }>> }
    >();

    for (const r of recs) {
      if (!byProduct.has(r.productName)) byProduct.set(r.productName, { colors: new Map() });
      const g = byProduct.get(r.productName)!;
      if (Number.isFinite(r.price!)) g.price = r.price!;
      if (!g.colors.has(r.color)) g.colors.set(r.color, new Map());
      g.colors.get(r.color)!.set(r.size, { qty: Math.max(0, Math.floor(r.qty)), min: r.min });
    }

    // Apply
    for (const pName of byProduct.keys()) {
      const existing = products.find((x) => x.productName === pName);
      const g = byProduct.get(pName)!;

      if (!existing) {
        const colors: Color[] = [];
        for (const color of g.colors.keys()) {
          const sizeMap: SizeMap = {};
          const minMap: MinMap = {};
          for (const size of g.colors.get(color)!.keys()) {
            const { qty, min } = g.colors.get(color)!.get(size)!;
            sizeMap[size] = qty;
            if (min !== undefined) minMap[size] = min;
          }
          colors.push({ color, sizes: sizeMap, minStock: Object.keys(minMap).length ? minMap : undefined });
        }
        await addDoc(collection(db, "products"), {
          productName: pName,
          price: g.price ?? 0,
          archived: false,
          colors,
        });
      } else {
        const colors = deepClone(existing.colors);
        for (const color of g.colors.keys()) {
          const patch = g.colors.get(color)!;
          const idx = colors.findIndex((c) => c.color === color);
          if (idx === -1) {
            const sizeMap: SizeMap = {};
            const minMap: MinMap = {};
            for (const size of patch.keys()) {
              const { qty, min } = patch.get(size)!;
              sizeMap[size] = qty;
              if (min !== undefined) minMap[size] = min;
            }
            colors.push({ color, sizes: sizeMap, minStock: Object.keys(minMap).length ? minMap : undefined });
          } else {
            for (const size of patch.keys()) {
              const { qty, min } = patch.get(size)!;
              colors[idx].sizes[size] = qty;
              colors[idx].minStock = colors[idx].minStock || {};
              if (min !== undefined) colors[idx].minStock![size] = min;
            }
          }
        }
        const upd: any = { colors };
        if (g.price !== undefined) upd.price = g.price;
        await updateDoc(doc(db, "products", existing.id), upd);
      }
    }
  };

  function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
          continue;
        }
        if (ch === '"') {
          inQ = false;
          continue;
        }
        cur += ch;
      } else {
        if (ch === ",") {
          out.push(cur);
          cur = "";
          continue;
        }
        if (ch === '"') {
          inQ = true;
          continue;
        }
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await importCSV(f);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />
          <button onClick={() => fileInputRef.current?.click()} className="border rounded-lg px-3 py-2 text-sm bg-white hover:bg-gray-50">Import CSV</button>
          <button onClick={() => setShowAddProduct(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-2 text-sm">
            Add product
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((p) => {
          const { totalUnits, totalValue } = totals(p);
          const status = productStatus(p);

          return (
            <div key={p.id} className="bg-white border rounded-2xl shadow-sm">
              {/* Card header */}
              <div className="p-4 border-b grid grid-cols-[3rem_1fr_auto_auto] gap-3 items-start">
                <div className="w-12 h-12 bg-gray-100 rounded-md overflow-hidden flex items-center justify-center">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.productName} className="object-cover w-full h-full" />
                  ) : (
                    <div className="text-[11px] text-gray-400">No image</div>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <input
                      defaultValue={p.productName}
                      className="text-sm font-medium outline-none w-full"
                      onBlur={(e) => e.target.value !== p.productName && editProductName(p.id, e.target.value)}
                    />
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
                    {p.archived && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">Archived</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Units: {totalUnits} · {money(totalValue)}</p>
                </div>

                <div className="text-right">
                  <div className="text-[11px] text-gray-500">Unit price</div>
                  <input
                    type="number"
                    defaultValue={p.price ?? ""}
                    placeholder="0"
                    className="border rounded px-2 py-1 w-24 text-right text-sm bg-gray-50 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                    onBlur={(e) => editProductPrice(p.id, e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>

                <div className="flex flex-col items-end gap-1">
                  <button
                    onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                    className="text-gray-600 hover:text-gray-900 text-sm"
                    aria-label="Expand"
                    title={expanded === p.id ? "Collapse" : "Expand"}
                  >
                    {expanded === p.id ? "▲" : "▼"}
                  </button>
                  <div className="flex gap-1">
                    <button className="border px-1.5 py-0.5 rounded text-[11px] hover:bg-gray-50" onClick={() => duplicateProduct(p)} title="Duplicate">
                      Copy
                    </button>
                    <button className="border px-1.5 py-0.5 rounded text-[11px] hover:bg-gray-50" onClick={() => toggleArchive(p)} title={p.archived ? "Unarchive" : "Archive"}>
                      {p.archived ? "Unarchive" : "Archive"}
                    </button>
                    <button className="border px-1.5 py-0.5 rounded text-[11px] hover:bg-gray-50" onClick={() => resetStock(p)} title="Reset stock">
                      Reset
                    </button>
                    <button
                      className="border border-rose-300 text-rose-700 px-1.5 py-0.5 rounded text-[11px] hover:bg-rose-50"
                      onClick={() => setConfirmDelete({ scope: "product", productId: p.id })}
                      title="Delete product"
                    >
                      Del
                    </button>
                  </div>
                </div>
              </div>

              {/* Colors & Sizes (collapsed by default, opens on arrow) */}
              {expanded === p.id && (
                <div className="p-4 space-y-4">
                  <div className="flex justify-end">
                    <button className="border px-2 py-1 rounded text-xs hover:bg-gray-50" onClick={() => setShowColorModal({ productId: p.id })}>
                      Add color
                    </button>
                  </div>

                  {p.colors.map((c, cIdx) => (
                    <div key={`${p.id}-${c.color}`} className="border rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            className="text-gray-600 hover:text-gray-900 text-xs"
                            onClick={() => setOpenColors((prev)=>({ ...prev, [`${p.id}-${cIdx}`]: !prev[`${p.id}-${cIdx}`] }))}
                            aria-label="Toggle color"
                          >
                            {openColors[`${p.id}-${cIdx}`] ? '▾' : '▸'}
                          </button>
                          <div className="font-medium text-sm">{c.color}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            className="text-[11px] border px-2 py-1 rounded hover:bg-gray-100"
                            onClick={() => setShowBulkModal({ productId: p.id, colorIdx: cIdx })}
                            title="Bulk edit"
                          >
                            Edit
                          </button>
                          <button
                            className="text-[11px] border px-2 py-1 rounded hover:bg-rose-50 border-rose-300 text-rose-700"
                            onClick={() => setConfirmDelete({ scope: "color", productId: p.id, colorIdx: cIdx })}
                            title="Delete color"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {openColors[`${p.id}-${cIdx}`] && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm table-fixed">
                          <colgroup>
                            <col className="w-[40%]" />
                            <col className="w-[20%]" />
                            <col className="w-[20%]" />
                            <col className="w-[20%]" />
                          </colgroup>
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="text-left px-3 py-2">Size</th>
                              <th className="text-right px-3 py-2">Qty</th>
                              <th className="text-right px-3 py-2">Min</th>
                              <th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(c.sizes)
                              .sort((a, b) => DEFAULT_SIZES.indexOf(a[0]) - DEFAULT_SIZES.indexOf(b[0]))
                              .map(([size, qty]) => {
                                const min = c.minStock?.[size] ?? LOW_FALLBACK;
                                const tone =
                                  qty <= 0 ? "text-rose-700" : qty <= min ? "text-amber-700" : "text-emerald-700";
                                return (
                                  <tr key={`${p.id}-${c.color}-${size}`} className="border-t">
                                    <td className="px-3 py-2">{size}</td>
                                    <td className="px-3 py-2 text-right align-middle">
                                      <input
                                        type="number"
                                        value={qty}
                                        onChange={(e) => updateQty(p.id, cIdx, size, parseInt(e.target.value) || 0)}
                                        className={`w-24 border rounded px-2 h-8 text-right ${tone}`}
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-right align-middle">
                                      <input
                                        type="number"
                                        value={min}
                                        onChange={(e) => updateMin(p.id, cIdx, size, parseInt(e.target.value) || 0)}
                                        className="w-24 border rounded px-2 h-8 text-right"
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-right align-middle">
                                      <button
                                        className="border border-rose-300 text-rose-700 px-2 py-1 rounded hover:bg-rose-50"
                                        onClick={() =>
                                          setConfirmDelete({ scope: "size", productId: p.id, colorIdx: cIdx, sizeKey: size })
                                        }
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
                      )}
                    </div>
                  ))}
                </div>
              )}
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
        <Modal onClose={() => setShowAddProduct(false)} title="Add product">
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
                onChange={(e) => setNpPrice(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="px-3 py-2" onClick={() => setShowAddProduct(false)}>Cancel</button>
            <button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-2" onClick={addProduct}>Save</button>
          </div>
        </Modal>
      )}

      {/* Add Color / Sizes */}
      {showColorModal && (
        <Modal onClose={() => setShowColorModal(null)} title="Add color and sizes">
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
                      setNcSizes((prev) => ({ ...prev, [s]: { ...prev[s], qty: e.target.value === "" ? "" : Number(e.target.value) } }))
                    }
                    className="border rounded px-2 py-1 w-20"
                  />
                  <input
                    type="number"
                    placeholder="Min"
                    value={ncSizes[s].min}
                    onChange={(e) =>
                      setNcSizes((prev) => ({ ...prev, [s]: { ...prev[s], min: e.target.value === "" ? "" : Number(e.target.value) } }))
                    }
                    className="border rounded px-2 py-1 w-20"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="px-3 py-2" onClick={() => setShowColorModal(null)}>Cancel</button>
            <button className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2" onClick={() => addColorOrSizes(showColorModal.productId)}>
              Save
            </button>
          </div>
        </Modal>
      )}

      {/* Bulk Edit */}
      {showBulkModal && (
        <BulkEditModal
          products={products}
          showBulkModal={showBulkModal}
          onClose={() => setShowBulkModal(null)}
        />
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} title="Confirm delete">
          <p className="text-sm text-gray-700 mb-4">
            Type <strong>DELETE</strong> to confirm.
          </p>
          <ConfirmDelete onCancel={() => setConfirmDelete(null)} onConfirm={doDelete} />
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
          <h3 className="font-semibold text-sm">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">✕</button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ---------- Confirm Delete with code ----------
function ConfirmDelete({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const [code, setCode] = useState("");
  const REQUIRED = process.env.NEXT_PUBLIC_DELETE_CODE || "DELETE";
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

// ---------- Bulk Edit Modal ----------
function BulkEditModal({
  products,
  showBulkModal,
  onClose,
}: {
  products: Product[];
  showBulkModal: { productId: string; colorIdx: number };
  onClose: () => void;
}) {
  const p = products.find((x) => x.id === showBulkModal.productId);
  const color = p?.colors[showBulkModal.colorIdx];

  const [local, setLocal] = useState<Record<string, { qty: number; min: number }>>(() => {
    if (!p || !color)
      return Object.fromEntries(DEFAULT_SIZES.map((s) => [s, { qty: 0, min: LOW_FALLBACK }])) as any;
    return Object.fromEntries(
      DEFAULT_SIZES.map((s) => [
        s,
        {
          qty: Number.isFinite(color.sizes[s]) ? (color.sizes[s] as number) : 0,
          min: Number.isFinite(color.minStock?.[s] ?? NaN) ? (color.minStock?.[s] as number) : LOW_FALLBACK,
        },
      ])
    ) as any;
  });

  if (!p || !color) return null;

  return (
    <Modal onClose={onClose} title={`Bulk edit • ${p.productName} • ${color.color}`}>
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
        <button className="px-3 py-2" onClick={onClose}>Cancel</button>
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2"
          onClick={async () => {
            const ref = doc(db, "products", p.id);
            const colors = deepClone(p.colors);
            DEFAULT_SIZES.forEach((s) => {
              colors[showBulkModal.colorIdx].sizes[s] = local[s].qty;
              colors[showBulkModal.colorIdx].minStock = colors[showBulkModal.colorIdx].minStock || {};
              colors[showBulkModal.colorIdx].minStock![s] = local[s].min;
            });
            await updateDoc(ref, { colors });
            onClose();
          }}
        >
          Save all
        </button>
      </div>
    </Modal>
  );
}
