"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  INVENTORY_SIZE_ORDER,
  normalizeInventoryColors,
  normalizeInventoryMinMap,
  normalizeInventorySizeMap,
} from "@/lib/inventory-stock";
import { db } from "@/lib/firebase";
import { normalizeSizeLabel, sortSizes } from "@/lib/shops";
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
import {
  FiAlertTriangle,
  FiArchive,
  FiBox,
  FiDollarSign,
  FiDownload,
  FiLayers,
  FiPackage,
  FiPlus,
  FiSearch,
  FiUpload,
  FiXCircle,
} from "react-icons/fi";
import { formatMoney as formatDisplayMoney } from "@/lib/money";

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
type DraftSizeValues = Record<string, { qty: number | ""; min: number | "" }>;
type BulkSizeValues = DraftSizeValues;

// ---------- Small helpers ----------
const money = (v: number) => formatDisplayMoney(v);
const sum = (obj: Record<string, number> = {}) =>
  Object.values(obj).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
const DEFAULT_SIZES = [...INVENTORY_SIZE_ORDER];
const LOW_FALLBACK = 5;
const csvCell = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
const BLOCKED_NUMBER_KEYS = new Set(["-", "+", "e", "E", ".", ","]);

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function buildDraftSizeValues(): DraftSizeValues {
  return Object.fromEntries(DEFAULT_SIZES.map((size) => [size, { qty: "", min: "" }])) as DraftSizeValues;
}

function buildBulkSizeValues(color?: Color): BulkSizeValues {
  if (!color) {
    return Object.fromEntries(
      DEFAULT_SIZES.map((size) => [size, { qty: 0, min: LOW_FALLBACK }])
    ) as BulkSizeValues;
  }
  return Object.fromEntries(
    DEFAULT_SIZES.map((size) => [
      size,
      {
        qty: Number.isFinite(color.sizes[size]) ? color.sizes[size] : 0,
        min: Number.isFinite(color.minStock?.[size] ?? NaN) ? (color.minStock?.[size] as number) : LOW_FALLBACK,
      },
    ])
  ) as BulkSizeValues;
}

function parseEditableNumber(value: string): number | "" {
  if (value === "") return "";
  if (!/^\d+$/.test(value.trim())) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? "" : Math.max(0, parsed);
}

function sortSizeMapEntries(map: Record<string, number>) {
  return sortSizes(Object.keys(map)).map((size) => [size, map[size]] as const);
}

function blockInvalidNumberKey(event: React.KeyboardEvent<HTMLInputElement>) {
  if (BLOCKED_NUMBER_KEYS.has(event.key)) {
    event.preventDefault();
  }
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
  const [ncSizes, setNcSizes] = useState<DraftSizeValues>(buildDraftSizeValues);

  // CSV import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live data
  useEffect(() => {
    const qy = query(collection(db, "products"), orderBy("productName"));
    const unsub = onSnapshot(qy, (snap) => {
      const list: Product[] = snap.docs.map((d) => {
        const data = d.data() as Omit<Product, "id">;
        return {
          id: d.id,
          ...data,
          colors: normalizeInventoryColors(data.colors),
        };
      });
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
    if (outCount > 0) return { label: "Out", cls: "border border-slate-200 bg-white text-slate-700" };
    if (lowCount > 0) return { label: "Low", cls: "border border-slate-200 bg-white text-slate-700" };
    return { label: "OK", cls: "border border-slate-200 bg-white text-slate-700" };
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
    const copy: Omit<Product, "id"> = {
      productName: `${p.productName} Copy`,
      imageUrl: p.imageUrl,
      price: p.price,
      archived: p.archived,
      colors: deepClone(p.colors),
    };
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

    const rawSizesObj: Record<string, number> = {};
    const rawMinObj: Record<string, number> = {};
    Object.entries(ncSizes).forEach(([k, v]) => {
      if (v.qty !== "" || v.min !== "") {
        rawSizesObj[k] = Number(v.qty || 0);
        if (v.min !== "") rawMinObj[k] = Number(v.min);
      }
    });
    const sizesObj = normalizeInventorySizeMap(rawSizesObj);
    const minObj = normalizeInventoryMinMap(rawMinObj);

    if (idx >= 0) {
      copy.colors[idx].sizes = normalizeInventorySizeMap({
        ...copy.colors[idx].sizes,
        ...sizesObj,
      });
      copy.colors[idx].minStock = normalizeInventoryMinMap({
        ...(copy.colors[idx].minStock || {}),
        ...minObj,
      });
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
    setNcSizes(buildDraftSizeValues());
    setShowColorModal(null);
    setExpanded(productId);
  };

  const updateQty = async (productId: string, colorIdx: number, sizeKey: string, qty: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const colors = deepClone(product.colors);
    const normalizedSize = normalizeSizeLabel(sizeKey);
    colors[colorIdx].sizes = normalizeInventorySizeMap({
      ...colors[colorIdx].sizes,
      [normalizedSize]: Math.max(0, Number.isFinite(qty) ? qty : 0),
    });
    await updateDoc(doc(db, "products", productId), { colors });
  };

  const updateMin = async (productId: string, colorIdx: number, sizeKey: string, min: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const colors = deepClone(product.colors);
    const normalizedSize = normalizeSizeLabel(sizeKey);
    colors[colorIdx].minStock = normalizeInventoryMinMap({
      ...(colors[colorIdx].minStock || {}),
      [normalizedSize]: Math.max(0, Number.isFinite(min) ? min : 0),
    });
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
        const normalizedSize = normalizeSizeLabel(sizeKey);
        delete colors[colorIdx].sizes[normalizedSize];
        if (colors[colorIdx].minStock) delete colors[colorIdx].minStock![normalizedSize];
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
        sortSizeMapEntries(c.sizes)
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
        size: normalizeSizeLabel(cells[2] || ""),
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
      if (!r.size) continue;
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
          const rawSizeMap: Record<string, number> = {};
          const rawMinMap: Record<string, number> = {};
          for (const size of g.colors.get(color)!.keys()) {
            const { qty, min } = g.colors.get(color)!.get(size)!;
            rawSizeMap[size] = qty;
            if (min !== undefined) rawMinMap[size] = min;
          }
          const sizeMap = normalizeInventorySizeMap(rawSizeMap);
          const minMap = normalizeInventoryMinMap(rawMinMap);
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
            const rawSizeMap: Record<string, number> = {};
            const rawMinMap: Record<string, number> = {};
            for (const size of patch.keys()) {
              const { qty, min } = patch.get(size)!;
              rawSizeMap[size] = qty;
              if (min !== undefined) rawMinMap[size] = min;
            }
            const sizeMap = normalizeInventorySizeMap(rawSizeMap);
            const minMap = normalizeInventoryMinMap(rawMinMap);
            colors.push({ color, sizes: sizeMap, minStock: Object.keys(minMap).length ? minMap : undefined });
          } else {
            const nextSizes: Record<string, number> = { ...colors[idx].sizes };
            const nextMinStock: Record<string, number> = { ...(colors[idx].minStock || {}) };
            for (const size of patch.keys()) {
              const { qty, min } = patch.get(size)!;
              nextSizes[size] = qty;
              if (min !== undefined) nextMinStock[size] = min;
            }
            colors[idx].sizes = normalizeInventorySizeMap(nextSizes);
            colors[idx].minStock = normalizeInventoryMinMap(nextMinStock);
          }
        }
        const upd: { colors: Color[]; price?: number } = { colors };
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
  const togglePill = (active: boolean, activeClass: string) =>
    `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
      active
        ? activeClass
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
    }`;

  return (
    <main className="relative min-h-screen bg-white">
      <div className="relative mx-auto max-w-7xl space-y-6 px-6 py-8">
        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm"
          style={{ animation: "fadeUp 0.6s ease-out both" }}
        >
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-600">
                Inventory
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">
                Inventory Control
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Monitor stock health, prevent shortages, and keep pricing accurate with live inventory safety checks.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  <FiLayers className="h-4 w-4" /> Live stock levels
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  <FiAlertTriangle className="h-4 w-4" /> Low stock alerts
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  CSV import / export
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={exportCSV}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <FiDownload className="h-4 w-4" /> Export CSV
              </button>
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
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <FiUpload className="h-4 w-4" /> Import CSV
              </button>
              <button
                onClick={() => setShowAddProduct(true)}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <FiPlus className="h-4 w-4" /> Add product
              </button>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section
          className="grid grid-cols-2 gap-4 md:grid-cols-5"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.08s" }}
        >
          <StatCard label="Products" value={filtered.length} icon={<FiPackage className="h-4 w-4" />} />
          <StatCard label="Total Units" value={overall.totalUnits} icon={<FiLayers className="h-4 w-4" />} />
          <StatCard label="Stock Value" value={money(overall.totalValue)} icon={<FiDollarSign className="h-4 w-4" />} />
          <StatCard label="Low Stock" value={overall.low} icon={<FiAlertTriangle className="h-4 w-4" />} />
          <StatCard label="Out of Stock" value={overall.out} icon={<FiXCircle className="h-4 w-4" />} />
        </section>

        {/* Filters */}
        <section
          className="sticky top-20 z-10 rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.14s" }}
        >
          <div className="flex flex-wrap items-start gap-3">
            <div className="relative">
              <FiSearch className="absolute left-3 top-2.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product"
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 sm:w-72"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={showLowOnly}
                onClick={() => setShowLowOnly((v) => !v)}
                className={togglePill(showLowOnly, "border-slate-200 bg-white text-slate-700")}
              >
                <FiAlertTriangle className="h-4 w-4" /> Low stock
              </button>
              <button
                type="button"
                aria-pressed={showOutOnly}
                onClick={() => setShowOutOnly((v) => !v)}
                className={togglePill(showOutOnly, "border-slate-200 bg-white text-slate-700")}
              >
                <FiXCircle className="h-4 w-4" /> Out of stock
              </button>
              <button
                type="button"
                aria-pressed={showArchived}
                onClick={() => setShowArchived((v) => !v)}
                className={togglePill(showArchived, "border-slate-300 bg-slate-100 text-slate-700")}
              >
                <FiArchive className="h-4 w-4" /> Archived
              </button>
            </div>
            <div className="ml-auto text-xs font-semibold text-slate-500">
              Showing {filtered.length} of {products.length} products
            </div>
          </div>
        </section>

        {/* Grid */}
        <section
          className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.2s" }}
        >
          {filtered.map((p) => {
            const { totalUnits, totalValue } = totals(p);
            const status = productStatus(p);

            return (
              <div
                key={p.id}
                className="group overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                {/* Card header */}
                <div className="border-b border-slate-100/80 p-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/80">
                        {p.imageUrl ? (
                           
                          <img src={p.imageUrl} alt={p.productName} className="h-full w-full object-cover" />
                        ) : (
                          <FiBox className="h-5 w-5 text-slate-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            defaultValue={p.productName}
                            className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none sm:w-auto"
                            onBlur={(e) => e.target.value !== p.productName && editProductName(p.id, e.target.value)}
                          />
                          <span className={`text-[10px] font-semibold uppercase tracking-[0.2em] px-2 py-0.5 rounded-full ${status.cls}`}>
                            {status.label}
                          </span>
                          {p.archived && (
                            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-100 text-slate-600">
                              Archived
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Units: <strong>{totalUnits}</strong> · Value: <strong>{money(totalValue)}</strong>
                        </p>
                      </div>

                      <div className="flex flex-col items-start gap-2 sm:items-end">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Unit price
                        </div>
                        <input
                          type="number"
                          defaultValue={p.price ?? ""}
                          placeholder="0"
                          className="w-28 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-right text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                          onBlur={(e) => editProductPrice(p.id, e.target.value === "" ? "" : Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                          expanded === p.id
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                        aria-label="Toggle details"
                      >
                        {expanded === p.id ? "Hide details" : "Show details"}
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                          onClick={() => duplicateProduct(p)}
                          title="Duplicate"
                        >
                          Copy
                        </button>
                        <button
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                          onClick={() => toggleArchive(p)}
                          title={p.archived ? "Unarchive" : "Archive"}
                        >
                          {p.archived ? "Unarchive" : "Archive"}
                        </button>
                        <button
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                          onClick={() => resetStock(p)}
                          title="Reset stock"
                        >
                          Reset
                        </button>
                        <button
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                          onClick={() => setConfirmDelete({ scope: "product", productId: p.id })}
                          title="Delete product"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Colors & Sizes */}
                {expanded === p.id && (
                  <div className="space-y-4 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Colors & sizes
                      </div>
                      <button
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                        onClick={() => setShowColorModal({ productId: p.id })}
                      >
                        Add color
                      </button>
                    </div>

                    {p.colors.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                        No colors yet. Add the first color to start tracking sizes.
                      </div>
                    )}

                    {p.colors.map((c, cIdx) => (
                      <div key={`${p.id}-${c.color}`} className="overflow-hidden rounded-2xl border border-slate-200">
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                              onClick={() => setOpenColors((prev) => ({ ...prev, [`${p.id}-${cIdx}`]: !prev[`${p.id}-${cIdx}`] }))}
                              aria-label="Toggle color"
                            >
                              {openColors[`${p.id}-${cIdx}`] ? "Hide" : "Show"}
                            </button>
                            <div className="font-semibold text-sm text-slate-800">{c.color}</div>
                            <span className="text-xs text-slate-400">
                              {Object.keys(c.sizes).length} sizes
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                              onClick={() => setShowBulkModal({ productId: p.id, colorIdx: cIdx })}
                              title="Bulk edit"
                            >
                              Bulk edit
                            </button>
                            <button
                              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                              onClick={() => setConfirmDelete({ scope: "color", productId: p.id, colorIdx: cIdx })}
                              title="Delete color"
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {openColors[`${p.id}-${cIdx}`] && (
                          <div className="overflow-x-auto bg-white">
                            <table className="w-full text-sm table-fixed">
                              <colgroup>
                                <col className="w-[40%]" />
                                <col className="w-[20%]" />
                                <col className="w-[20%]" />
                                <col className="w-[20%]" />
                              </colgroup>
                              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                  <th className="text-left px-3 py-2">Size</th>
                                  <th className="text-right px-3 py-2">Qty</th>
                                  <th className="text-right px-3 py-2">Min</th>
                                  <th className="px-3 py-2 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {sortSizeMapEntries(c.sizes)
                                  .map(([size, qty]) => {
                                    const min = c.minStock?.[size] ?? LOW_FALLBACK;
                                    const tone = "border-slate-200 text-slate-700";
                                    return (
                                      <tr key={`${p.id}-${c.color}-${size}`} className="text-slate-700">
                                        <td className="px-3 py-2">{size}</td>
                                        <td className="px-3 py-2 text-right align-middle">
                                          <input
                                            type="number"
                                            value={qty}
                                            min={0}
                                            step={1}
                                            onKeyDown={blockInvalidNumberKey}
                                            onChange={(e) => updateQty(p.id, cIdx, size, parseInt(e.target.value) || 0)}
                                            className={`w-24 rounded-lg border px-2 py-1 text-right ${tone} focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200`}
                                          />
                                        </td>
                                        <td className="px-3 py-2 text-right align-middle">
                                          <input
                                            type="number"
                                            value={min}
                                            min={0}
                                            step={1}
                                            onKeyDown={blockInvalidNumberKey}
                                            onChange={(e) => updateMin(p.id, cIdx, size, parseInt(e.target.value) || 0)}
                                            className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                          />
                                        </td>
                                        <td className="px-3 py-2 text-right align-middle">
                                          <button
                                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
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
        </section>

        {filtered.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white/80 p-10 text-center text-slate-500">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <FiSearch className="h-5 w-5" />
            </div>
            <div className="mt-3 text-base font-semibold text-slate-700">No products match your filters.</div>
            <p className="mt-1 text-sm text-slate-500">Try clearing filters or add a new product.</p>
            <button
              onClick={() => setShowAddProduct(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              <FiPlus className="h-4 w-4" /> Add product
            </button>
          </div>
        )}

        {/* ---------- Modals ---------- */}

        {/* Add Product */}
        {showAddProduct && (
          <Modal onClose={() => setShowAddProduct(false)} title="Add product">
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-600">Product name</span>
                <input
                  value={npName}
                  onChange={(e) => setNpName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-600">Image URL (optional)</span>
                <input
                  value={npImage}
                  onChange={(e) => setNpImage(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-600">Unit price (Rs)</span>
                <input
                  type="number"
                  value={npPrice}
                  onChange={(e) => setNpPrice(e.target.value === "" ? "" : Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setShowAddProduct(false)}>
                Cancel
              </button>
              <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800" onClick={addProduct}>
                Save
              </button>
            </div>
          </Modal>
        )}

        {/* Add Color / Sizes */}
        {showColorModal && (
          <Modal onClose={() => setShowColorModal(null)} title="Add color and sizes">
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-600">Color</span>
                <input
                  value={ncColor}
                  onChange={(e) => setNcColor(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {DEFAULT_SIZES.map((s) => (
                  <div key={s} className="flex gap-2 items-center">
                    <span className="w-10 text-sm text-slate-500">{s}</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      onKeyDown={blockInvalidNumberKey}
                      placeholder="Qty"
                      value={ncSizes[s].qty}
                      onChange={(e) =>
                        setNcSizes((prev) => ({ ...prev, [s]: { ...prev[s], qty: parseEditableNumber(e.target.value) } }))
                      }
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                    <input
                      type="number"
                      min={0}
                      step={1}
                      onKeyDown={blockInvalidNumberKey}
                      placeholder="Min"
                      value={ncSizes[s].min}
                      onChange={(e) =>
                        setNcSizes((prev) => ({ ...prev, [s]: { ...prev[s], min: parseEditableNumber(e.target.value) } }))
                      }
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setShowColorModal(null)}>
                Cancel
              </button>
              <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800" onClick={() => addColorOrSizes(showColorModal.productId)}>
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
            <p className="text-sm text-slate-700 mb-4">
              Type <strong>DELETE</strong> to confirm.
            </p>
            <ConfirmDelete onCancel={() => setConfirmDelete(null)} onConfirm={doDelete} />
          </Modal>
        )}
        <style jsx>{`
          @keyframes fadeUp {
            from {
              opacity: 0;
              transform: translateY(14px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </div>
        {icon && (
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

// ---------- Reusable Modal ----------
function Modal({
  title,
  children,
  onClose,
  panelClassName,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  panelClassName?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm">
      <div
        className={`mx-auto my-12 flex max-h-[calc(100vh-6rem)] w-full flex-col rounded-2xl border border-slate-200 bg-white shadow-xl ${
          panelClassName || "max-w-2xl"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 px-2 py-1 text-slate-500 hover:bg-slate-50"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
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
        className="rounded-full border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
      />
      <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={onCancel}>
        Cancel
      </button>
      <button
        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
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

  const [local, setLocal] = useState<BulkSizeValues>(() => buildBulkSizeValues(color));

  if (!p || !color) return null;

  return (
    <Modal
      onClose={onClose}
      title={`Bulk edit • ${p.productName} • ${color.color}`}
      panelClassName="max-w-5xl"
    >
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span><span className="font-semibold text-slate-700">Qty</span> = current stock</span>
        <span><span className="font-semibold text-slate-700">Min</span> = low-stock alert</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {DEFAULT_SIZES.map((s) => (
          <div key={s} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-3 text-sm font-semibold tracking-[0.06em] text-slate-800">{s}</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="pl-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Qty</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={local[s].qty}
                  aria-label={`${s} quantity`}
                  placeholder="Qty"
                  inputMode="numeric"
                  onKeyDown={blockInvalidNumberKey}
                  onChange={(e) =>
                    setLocal((pr) => ({
                      ...pr,
                      [s]: { ...pr[s], qty: parseEditableNumber(e.target.value) },
                    }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="pl-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Min</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={local[s].min}
                  aria-label={`${s} minimum stock`}
                  placeholder="Min"
                  inputMode="numeric"
                  onKeyDown={blockInvalidNumberKey}
                  onChange={(e) =>
                    setLocal((pr) => ({
                      ...pr,
                      [s]: { ...pr[s], min: parseEditableNumber(e.target.value) },
                    }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={onClose}>
          Cancel
        </button>
        <button
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          onClick={async () => {
            const ref = doc(db, "products", p.id);
            const colors = deepClone(p.colors);
            DEFAULT_SIZES.forEach((s) => {
              colors[showBulkModal.colorIdx].sizes[s] =
                typeof local[s].qty === "number" ? Math.max(0, local[s].qty) : 0;
              colors[showBulkModal.colorIdx].minStock = colors[showBulkModal.colorIdx].minStock || {};
              colors[showBulkModal.colorIdx].minStock![s] =
                typeof local[s].min === "number" ? Math.max(0, local[s].min) : 0;
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
