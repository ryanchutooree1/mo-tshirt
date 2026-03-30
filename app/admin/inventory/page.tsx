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
  FiChevronDown,
  FiChevronUp,
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

function getStockTone(qty: number, min: number) {
  if (qty <= 0) {
    return {
      label: "Out",
      badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
      cardClass: "border-rose-200 bg-rose-50/50",
    };
  }
  if (qty <= min) {
    return {
      label: "Low",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
      cardClass: "border-amber-200 bg-amber-50/60",
    };
  }
  return {
    label: "Healthy",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    cardClass: "border-[#eadfd1] bg-white",
  };
}

function getColorMetrics(color: Color) {
  const entries = sortSizeMapEntries(color.sizes);
  return entries.reduce(
    (acc, [size, qty]) => {
      const min = color.minStock?.[size] ?? LOW_FALLBACK;
      acc.totalUnits += qty || 0;
      acc.sizeCount += 1;
      if ((qty || 0) <= 0) acc.outCount += 1;
      else if (qty <= min) acc.lowCount += 1;
      return acc;
    },
    { totalUnits: 0, sizeCount: 0, lowCount: 0, outCount: 0 }
  );
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
    if (outCount > 0) {
      return {
        label: "Out",
        cls: "border border-rose-200 bg-rose-50 text-rose-700",
      };
    }
    if (lowCount > 0) {
      return {
        label: "Low",
        cls: "border border-amber-200 bg-amber-50 text-amber-700",
      };
    }
    return {
      label: "Healthy",
      cls: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    };
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
  const hasActiveFilters =
    Boolean(search.trim()) || showLowOnly || showOutOnly || showArchived;

  return (
    <main className="relative min-h-screen bg-[#f6f2ea]">
      <div className="relative mx-auto max-w-[1400px] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-[36px] border border-[#eadfd1] bg-[linear-gradient(135deg,#ffffff_0%,#fff8f1_58%,#f3ebdf_100%)] p-6 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.45)]"
          style={{ animation: "fadeUp 0.6s ease-out both" }}
        >
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,_rgba(255,56,92,0.12),_transparent_55%)]" />
          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_360px]">
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6a5946]">
                Inventory
              </p>
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                Inventory Control
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Designed for faster stock work: scan what needs attention, open one product, then edit each color in a clean size grid instead of chasing controls across the page.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#eadfd1] bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                  <FiLayers className="h-4 w-4" /> Live stock levels
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-[#eadfd1] bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                  <FiAlertTriangle className="h-4 w-4" /> Low stock alerts
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-[#eadfd1] bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                  Bulk edit workspace
                </span>
              </div>
            </div>
            <div className="rounded-[30px] border border-[#eadfd1] bg-white/90 p-5 shadow-[0_20px_70px_-50px_rgba(15,23,42,0.55)] backdrop-blur">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Quick actions
              </div>
              <div className="mt-4 grid gap-2">
                <button
                  onClick={() => setShowAddProduct(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1f2937] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#111827]"
                >
                  <FiPlus className="h-4 w-4" /> Add product
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={exportCSV}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[#eadfd1] bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#d7c7b4] hover:bg-[#fffaf4]"
                  >
                    <FiDownload className="h-4 w-4" /> Export
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
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[#eadfd1] bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#d7c7b4] hover:bg-[#fffaf4]"
                  >
                    <FiUpload className="h-4 w-4" /> Import
                  </button>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[#efe3d6] bg-[#fcf8f2] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Visible now
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{filtered.length}</div>
                </div>
                <div className="rounded-2xl border border-[#efe3d6] bg-[#fcf8f2] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Needs action
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">
                    {overall.low + overall.out}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.08s" }}
        >
          <StatCard
            label="Products"
            value={filtered.length}
            hint="Visible in current view"
            icon={<FiPackage className="h-4 w-4" />}
            tone="bg-[#fff5ef] text-[#c2410c]"
          />
          <StatCard
            label="Total Units"
            value={overall.totalUnits}
            hint="Across all visible products"
            icon={<FiLayers className="h-4 w-4" />}
            tone="bg-[#f5f7ff] text-[#4338ca]"
          />
          <StatCard
            label="Stock Value"
            value={money(overall.totalValue)}
            hint="Live quantity × unit price"
            icon={<FiDollarSign className="h-4 w-4" />}
            tone="bg-[#effcf6] text-[#047857]"
          />
          <StatCard
            label="Low Stock"
            value={overall.low}
            hint="Above zero but below min"
            icon={<FiAlertTriangle className="h-4 w-4" />}
            tone="bg-[#fff8eb] text-[#b45309]"
          />
          <StatCard
            label="Out of Stock"
            value={overall.out}
            hint="Zero quantity sizes"
            icon={<FiXCircle className="h-4 w-4" />}
            tone="bg-[#fff1f2] text-[#be123c]"
          />
        </section>

        {/* Filters */}
        <section
          className="sticky top-20 z-10 rounded-[32px] border border-[#eadfd1] bg-white/95 p-4 shadow-[0_20px_80px_-60px_rgba(15,23,42,0.55)] backdrop-blur"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.14s" }}
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative min-w-[260px] flex-1">
                <FiSearch className="absolute left-4 top-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search product or scan to the next item"
                  className="w-full rounded-full border border-[#eadfd1] bg-[#fcfaf7] py-3 pl-11 pr-4 text-sm shadow-sm focus:border-[#d7c7b4] focus:outline-none focus:ring-4 focus:ring-[#f7ebdc]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={showLowOnly}
                  onClick={() => setShowLowOnly((v) => !v)}
                  className={togglePill(showLowOnly, "border-amber-200 bg-amber-50 text-amber-700")}
                >
                  <FiAlertTriangle className="h-4 w-4" /> Low stock
                </button>
                <button
                  type="button"
                  aria-pressed={showOutOnly}
                  onClick={() => setShowOutOnly((v) => !v)}
                  className={togglePill(showOutOnly, "border-rose-200 bg-rose-50 text-rose-700")}
                >
                  <FiXCircle className="h-4 w-4" /> Out of stock
                </button>
                <button
                  type="button"
                  aria-pressed={showArchived}
                  onClick={() => setShowArchived((v) => !v)}
                  className={togglePill(showArchived, "border-[#d8c6b4] bg-[#fcf6ef] text-[#6a5946]")}
                >
                  <FiArchive className="h-4 w-4" /> Archived
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-[#eadfd1] bg-[#fcfaf7] px-4 py-2 text-xs font-semibold text-slate-500">
                Showing {filtered.length} of {products.length} products
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setShowLowOnly(false);
                    setShowOutOnly(false);
                    setShowArchived(false);
                  }}
                  className="rounded-full border border-[#eadfd1] bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#d7c7b4] hover:bg-[#fffaf4]"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Products */}
        <section
          className="space-y-5"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.2s" }}
        >
          {filtered.map((p) => {
            const { totalUnits, totalValue, lowCount, outCount } = totals(p);
            const status = productStatus(p);

            return (
              <article
                key={p.id}
                className="overflow-hidden rounded-[32px] border border-[#eadfd1] bg-white shadow-[0_30px_90px_-70px_rgba(15,23,42,0.55)] transition hover:border-[#d8c6b4]"
              >
                <div className="grid gap-5 border-b border-[#f1e5d8] p-5 lg:p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[22px] border border-[#eadfd1] bg-[#fcfaf7]">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.productName} className="h-full w-full object-cover" />
                        ) : (
                          <FiBox className="h-5 w-5 text-slate-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <input
                            defaultValue={p.productName}
                            className="w-full rounded-2xl bg-transparent px-1 text-xl font-semibold tracking-tight text-slate-900 outline-none transition focus:bg-[#fcfaf7] sm:w-auto"
                            onBlur={(e) => e.target.value !== p.productName && editProductName(p.id, e.target.value)}
                          />
                          <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] ${status.cls}`}>
                            {status.label}
                          </span>
                          {p.archived && (
                            <span className="rounded-full border border-[#d8c6b4] bg-[#fcf6ef] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#6a5946]">
                              Archived
                            </span>
                          )}
                        </div>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                          {p.colors.length} color variants tracked. Edit names and price inline, then open the inventory section below to adjust each size card or launch bulk edit for one full color.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-[24px] border border-[#efe3d6] bg-[#fcfaf7] p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Units
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-slate-900">{totalUnits}</div>
                      </div>
                      <div className="rounded-[24px] border border-[#efe3d6] bg-[#fcfaf7] p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Colors
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-slate-900">{p.colors.length}</div>
                      </div>
                      <div className="rounded-[24px] border border-[#efe3d6] bg-[#fcfaf7] p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Stock value
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-slate-900">{money(totalValue)}</div>
                      </div>
                      <div className="rounded-[24px] border border-[#efe3d6] bg-[#fcfaf7] p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Alerts
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-slate-900">
                          {lowCount + outCount}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {lowCount} low · {outCount} out
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[30px] border border-[#efe3d6] bg-[#fcfaf7] p-4 lg:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Product actions
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        Price saves when you leave the field.
                      </p>
                    </div>
                  </div>
                  <label className="mt-4 block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Unit price (Rs)
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      onKeyDown={blockInvalidNumberKey}
                      defaultValue={p.price ?? ""}
                      placeholder="0"
                      className="mt-2 w-full rounded-2xl border border-[#eadfd1] bg-white px-4 py-3 text-base shadow-sm focus:border-[#d7c7b4] focus:outline-none focus:ring-4 focus:ring-[#f7ebdc]"
                      onBlur={(e) => editProductPrice(p.id, e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </label>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      className="rounded-full border border-[#eadfd1] bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#d7c7b4] hover:bg-[#fffaf4]"
                      onClick={() => duplicateProduct(p)}
                      title="Duplicate"
                    >
                      Copy
                    </button>
                    <button
                      className="rounded-full border border-[#eadfd1] bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#d7c7b4] hover:bg-[#fffaf4]"
                      onClick={() => toggleArchive(p)}
                      title={p.archived ? "Unarchive" : "Archive"}
                    >
                      {p.archived ? "Unarchive" : "Archive"}
                    </button>
                    <button
                      className="rounded-full border border-[#eadfd1] bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#d7c7b4] hover:bg-[#fffaf4]"
                      onClick={() => resetStock(p)}
                      title="Reset stock"
                    >
                      Reset
                    </button>
                    <button
                      className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                      onClick={() => setConfirmDelete({ scope: "product", productId: p.id })}
                      title="Delete product"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="p-5 lg:p-6">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Inventory breakdown
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        Open a product once, then every color shows its full size inventory without another extra toggle.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                          expanded === p.id
                            ? "bg-[#1f2937] text-white"
                            : "border border-[#eadfd1] bg-white text-slate-700 hover:border-[#d7c7b4] hover:bg-[#fffaf4]"
                        }`}
                        aria-label="Toggle details"
                      >
                        {expanded === p.id ? (
                          <FiChevronUp className="h-4 w-4" />
                        ) : (
                          <FiChevronDown className="h-4 w-4" />
                        )}
                        {expanded === p.id ? "Collapse inventory" : "Open inventory"}
                      </button>
                      <button
                        className="rounded-full border border-[#eadfd1] bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#d7c7b4] hover:bg-[#fffaf4]"
                        onClick={() => setShowColorModal({ productId: p.id })}
                      >
                        Add color
                      </button>
                    </div>
                  </div>

                  {expanded === p.id && (
                    <div className="mt-5 space-y-4">
                      {p.colors.length === 0 && (
                        <div className="rounded-[28px] border border-dashed border-[#d8c6b4] bg-[#fcfaf7] p-8 text-sm text-slate-500">
                          No colors yet. Add the first color to start tracking sizes with the new layout.
                        </div>
                      )}

                      {p.colors.length > 0 && (
                        <div className="grid gap-4 xl:grid-cols-2">
                          {p.colors.map((c, cIdx) => {
                            const colorMetrics = getColorMetrics(c);
                            const colorTone =
                              colorMetrics.outCount > 0
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : colorMetrics.lowCount > 0
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700";

                            return (
                              <section
                                key={`${p.id}-${c.color}`}
                                className="rounded-[28px] border border-[#eadfd1] bg-[#fffdfa] p-4 shadow-[0_24px_70px_-60px_rgba(15,23,42,0.5)]"
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="rounded-full bg-[#f5ede4] px-3 py-1 text-sm font-semibold text-slate-800">
                                        {c.color}
                                      </span>
                                      <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] ${colorTone}`}>
                                        {colorMetrics.outCount > 0
                                          ? "Needs restock"
                                          : colorMetrics.lowCount > 0
                                            ? "Running low"
                                            : "Healthy"}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                                      <span className="rounded-full border border-[#eadfd1] bg-white px-3 py-1">
                                        {colorMetrics.sizeCount} sizes
                                      </span>
                                      <span className="rounded-full border border-[#eadfd1] bg-white px-3 py-1">
                                        {colorMetrics.totalUnits} units
                                      </span>
                                      <span className="rounded-full border border-[#eadfd1] bg-white px-3 py-1">
                                        {colorMetrics.lowCount} low
                                      </span>
                                      <span className="rounded-full border border-[#eadfd1] bg-white px-3 py-1">
                                        {colorMetrics.outCount} out
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      className="rounded-full border border-[#eadfd1] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#d7c7b4] hover:bg-[#fffaf4]"
                                      onClick={() => setShowBulkModal({ productId: p.id, colorIdx: cIdx })}
                                      title="Bulk edit"
                                    >
                                      Bulk edit
                                    </button>
                                    <button
                                      className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                                      onClick={() => setConfirmDelete({ scope: "color", productId: p.id, colorIdx: cIdx })}
                                      title="Delete color"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                                  {sortSizeMapEntries(c.sizes).map(([size, qty]) => {
                                    const min = c.minStock?.[size] ?? LOW_FALLBACK;
                                    const tone = getStockTone(qty, min);
                                    return (
                                      <div
                                        key={`${p.id}-${c.color}-${size}`}
                                        className={`rounded-[24px] border p-3 ${tone.cardClass}`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="text-sm font-semibold text-slate-900">{size}</div>
                                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${tone.badgeClass}`}>
                                            {tone.label}
                                          </span>
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                          <InventoryInlineNumberInput
                                            label="Qty"
                                            value={qty}
                                            ariaLabel={`${p.productName} ${c.color} ${size} quantity`}
                                            onCommit={(next) => updateQty(p.id, cIdx, size, next)}
                                          />
                                          <InventoryInlineNumberInput
                                            label="Min"
                                            value={min}
                                            ariaLabel={`${p.productName} ${c.color} ${size} minimum stock`}
                                            onCommit={(next) => updateMin(p.id, cIdx, size, next)}
                                          />
                                        </div>
                                        <div className="mt-3 flex justify-end">
                                          <button
                                            className="rounded-full border border-[#eadfd1] bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-[#d7c7b4] hover:bg-[#fffaf4]"
                                            onClick={() =>
                                              setConfirmDelete({ scope: "size", productId: p.id, colorIdx: cIdx, sizeKey: size })
                                            }
                                          >
                                            Remove size
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </section>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        {filtered.length === 0 && (
          <div className="rounded-[32px] border border-dashed border-[#d8c6b4] bg-white/90 p-10 text-center text-slate-500">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#fcfaf7] text-slate-500">
              <FiSearch className="h-5 w-5" />
            </div>
            <div className="mt-3 text-base font-semibold text-slate-700">No products match your filters.</div>
            <p className="mt-1 text-sm text-slate-500">Try clearing filters or add a new product.</p>
            <button
              onClick={() => setShowAddProduct(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#1f2937] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#111827]"
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
                  className="mt-1 w-full rounded-2xl border border-[#eadfd1] bg-[#fcfaf7] px-4 py-3 text-sm focus:border-[#d7c7b4] focus:outline-none focus:ring-4 focus:ring-[#f7ebdc]"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-600">Image URL (optional)</span>
                <input
                  value={npImage}
                  onChange={(e) => setNpImage(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-[#eadfd1] bg-[#fcfaf7] px-4 py-3 text-sm focus:border-[#d7c7b4] focus:outline-none focus:ring-4 focus:ring-[#f7ebdc]"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-600">Unit price (Rs)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  onKeyDown={blockInvalidNumberKey}
                  value={npPrice}
                  onChange={(e) => setNpPrice(parseEditableNumber(e.target.value))}
                  className="mt-1 w-full rounded-2xl border border-[#eadfd1] bg-[#fcfaf7] px-4 py-3 text-sm focus:border-[#d7c7b4] focus:outline-none focus:ring-4 focus:ring-[#f7ebdc]"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-full border border-[#eadfd1] px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-[#fffaf4]" onClick={() => setShowAddProduct(false)}>
                Cancel
              </button>
              <button className="rounded-full bg-[#1f2937] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#111827]" onClick={addProduct}>
                Save
              </button>
            </div>
          </Modal>
        )}

        {/* Add Color / Sizes */}
        {showColorModal && (
          <Modal
            onClose={() => setShowColorModal(null)}
            title="Add color and sizes"
            panelClassName="max-w-5xl"
          >
            <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
              <div className="rounded-[28px] border border-[#eadfd1] bg-[#fcfaf7] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Color setup
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Add a new color, then seed only the sizes you need. Leave others blank to skip them.
                </p>
                <label className="mt-4 block">
                  <span className="text-sm font-semibold text-slate-600">Color</span>
                  <input
                    value={ncColor}
                    onChange={(e) => setNcColor(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[#eadfd1] bg-white px-4 py-3 text-sm focus:border-[#d7c7b4] focus:outline-none focus:ring-4 focus:ring-[#f7ebdc]"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {DEFAULT_SIZES.map((s) => (
                  <div key={s} className="rounded-[24px] border border-[#eadfd1] bg-white p-3">
                    <div className="mb-3 text-sm font-semibold text-slate-900">{s}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="pl-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Qty
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          onKeyDown={blockInvalidNumberKey}
                          placeholder="0"
                          value={ncSizes[s].qty}
                          onChange={(e) =>
                            setNcSizes((prev) => ({ ...prev, [s]: { ...prev[s], qty: parseEditableNumber(e.target.value) } }))
                          }
                          className="w-full rounded-2xl border border-[#eadfd1] bg-[#fcfaf7] px-3 py-2 text-sm focus:border-[#d7c7b4] focus:outline-none focus:ring-4 focus:ring-[#f7ebdc]"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="pl-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Min
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          onKeyDown={blockInvalidNumberKey}
                          placeholder="0"
                          value={ncSizes[s].min}
                          onChange={(e) =>
                            setNcSizes((prev) => ({ ...prev, [s]: { ...prev[s], min: parseEditableNumber(e.target.value) } }))
                          }
                          className="w-full rounded-2xl border border-[#eadfd1] bg-[#fcfaf7] px-3 py-2 text-sm focus:border-[#d7c7b4] focus:outline-none focus:ring-4 focus:ring-[#f7ebdc]"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-full border border-[#eadfd1] px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-[#fffaf4]" onClick={() => setShowColorModal(null)}>
                Cancel
              </button>
              <button className="rounded-full bg-[#1f2937] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#111827]" onClick={() => addColorOrSizes(showColorModal.productId)}>
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
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-[#eadfd1] bg-white p-4 shadow-[0_24px_70px_-60px_rgba(15,23,42,0.5)]">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </div>
        {icon && (
          <span className={`flex h-10 w-10 items-center justify-center rounded-full ${tone || "bg-[#fcfaf7] text-slate-700"}`}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-sm text-slate-500">{hint}</div>}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-md">
      <div
        className={`w-full rounded-[32px] border border-[#eadfd1] bg-[#fffdfa] shadow-[0_40px_120px_-50px_rgba(15,23,42,0.5)] ${
          panelClassName || "max-w-2xl"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#f1e5d8] px-5 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full border border-[#eadfd1] px-2 py-1 text-slate-500 hover:bg-[#fffaf4]"
          >
            ✕
          </button>
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
        className="rounded-full border border-[#eadfd1] bg-white px-3 py-2 text-sm focus:border-[#d7c7b4] focus:outline-none focus:ring-4 focus:ring-[#f7ebdc]"
      />
      <button className="rounded-full border border-[#eadfd1] px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-[#fffaf4]" onClick={onCancel}>
        Cancel
      </button>
      <button
        className="rounded-full bg-[#1f2937] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#111827] disabled:opacity-60"
        disabled={code !== REQUIRED}
        onClick={onConfirm}
      >
        Delete
      </button>
    </div>
  );
}

function InventoryInlineNumberInput({
  label,
  value,
  ariaLabel,
  onCommit,
}: {
  label: string;
  value: number;
  ariaLabel: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <label className="flex flex-col gap-1">
      <span className="pl-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={draft}
        aria-label={ariaLabel}
        onKeyDown={(event) => {
          blockInvalidNumberKey(event);
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "") {
            setDraft("");
            return;
          }
          if (!/^\d+$/.test(next)) return;
          setDraft(String(Math.max(0, Number.parseInt(next, 10))));
        }}
        onBlur={() => {
          const next = draft === "" ? 0 : Math.max(0, Number.parseInt(draft, 10) || 0);
          setDraft(String(next));
          if (next !== value) onCommit(next);
        }}
        className="w-full rounded-2xl border border-[#eadfd1] bg-white px-3 py-2 text-base font-medium text-slate-800 shadow-sm focus:border-[#d7c7b4] focus:outline-none focus:ring-4 focus:ring-[#f7ebdc]"
      />
    </label>
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
  const summary = useMemo(() => {
    return DEFAULT_SIZES.reduce(
      (acc, size) => {
        const qty = typeof local[size].qty === "number" ? local[size].qty : 0;
        const min = typeof local[size].min === "number" ? local[size].min : 0;
        acc.totalUnits += qty;
        acc.sizeCount += 1;
        if (qty <= 0) acc.outCount += 1;
        else if (qty <= min) acc.lowCount += 1;
        return acc;
      },
      { totalUnits: 0, sizeCount: 0, lowCount: 0, outCount: 0 }
    );
  }, [local]);

  if (!p || !color) return null;

  return (
    <Modal
      onClose={onClose}
      title={`Bulk edit • ${p.productName} • ${color.color}`}
      panelClassName="max-w-6xl"
    >
      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-[#eadfd1] bg-[#fcfaf7] p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Bulk workspace
          </div>
          <h4 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            {p.productName}
          </h4>
          <div className="mt-1 inline-flex rounded-full bg-[#f5ede4] px-3 py-1 text-sm font-semibold text-slate-700">
            {color.color}
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Edit the whole color in one pass. Nothing saves until you click
            <span className="font-semibold text-slate-800"> Save all</span>.
          </p>
          <div className="mt-5 grid gap-3">
            <div className="rounded-2xl border border-[#eadfd1] bg-white p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Total units
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{summary.totalUnits}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[#eadfd1] bg-white p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Low
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{summary.lowCount}</div>
              </div>
              <div className="rounded-2xl border border-[#eadfd1] bg-white p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Out
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{summary.outCount}</div>
              </div>
            </div>
            <div className="rounded-2xl border border-[#eadfd1] bg-white p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Sizes in edit
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{summary.sizeCount}</div>
            </div>
          </div>
          <div className="mt-5 space-y-2 text-sm text-slate-500">
            <p><span className="font-semibold text-slate-700">Qty</span> is current stock.</p>
            <p><span className="font-semibold text-slate-700">Min</span> controls low-stock alerts.</p>
            <p>Negative values are blocked. Inventory stays between 0 and unlimited.</p>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
            <span className="rounded-full border border-[#eadfd1] bg-[#fcfaf7] px-3 py-1.5">
              Set one color at a time
            </span>
            <span className="rounded-full border border-[#eadfd1] bg-[#fcfaf7] px-3 py-1.5">
              Save only when ready
            </span>
          </div>
          <div className="max-h-[62vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DEFAULT_SIZES.map((s) => {
                const qty = typeof local[s].qty === "number" ? local[s].qty : 0;
                const min = typeof local[s].min === "number" ? local[s].min : 0;
                const tone = getStockTone(qty, min);
                return (
                  <div key={s} className={`rounded-[24px] border p-4 ${tone.cardClass}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-base font-semibold text-slate-900">{s}</div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${tone.badgeClass}`}>
                        {tone.label}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="pl-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Qty
                        </span>
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
                          className="w-full rounded-2xl border border-[#eadfd1] bg-white px-3 py-3 text-base focus:border-[#d7c7b4] focus:outline-none focus:ring-4 focus:ring-[#f7ebdc]"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="pl-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Min
                        </span>
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
                          className="w-full rounded-2xl border border-[#eadfd1] bg-white px-3 py-3 text-base focus:border-[#d7c7b4] focus:outline-none focus:ring-4 focus:ring-[#f7ebdc]"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="rounded-full border border-[#eadfd1] px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-[#fffaf4]" onClick={onClose}>
          Cancel
        </button>
        <button
          className="rounded-full bg-[#1f2937] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#111827]"
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
