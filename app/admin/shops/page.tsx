"use client";

import { useEffect, useMemo, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase";
import {
  DEFAULT_COLLECTION_POINT,
  DEFAULT_PICKUP_POINT,
  formatSizeLabel,
  getSizePrices,
  SIZE_ORDER,
  type ShopItem,
} from "@/lib/shops";
import {
  FiActivity,
  FiBarChart2,
  FiBox,
  FiFilter,
  FiGrid,
  FiImage,
  FiLayers,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSliders,
  FiTag,
  FiTrendingUp,
} from "react-icons/fi";

type SizePriceRow = {
  size: string;
  price: number | "";
  buyingPrice: number | "";
  profit: number | "";
  profitAuto: boolean;
};

const SIZE_ORDER_SET = new Set(SIZE_ORDER);

function buildSizeRows(
  existing: { size: string; price: number; buyingPrice?: number | null; profit?: number | null }[] = []
): SizePriceRow[] {
  const rowMap = new Map<string, { price: number; buyingPrice: number | ""; profit: number | ""; profitAuto: boolean }>();
  existing.forEach((entry) => {
    rowMap.set(entry.size, {
      price: entry.price,
      buyingPrice:
        Number.isFinite(entry.buyingPrice) ? (entry.buyingPrice as number) : "",
      profit: Number.isFinite(entry.profit) ? (entry.profit as number) : "",
      profitAuto: !Number.isFinite(entry.profit),
    });
  });
  const ordered = SIZE_ORDER.map((size) => ({
    size,
    price: rowMap.get(size)?.price ?? "",
    buyingPrice: rowMap.get(size)?.buyingPrice ?? "",
    profit: rowMap.get(size)?.profit ?? "",
    profitAuto: rowMap.get(size)?.profitAuto ?? true,
  }));
  const extras = existing
    .filter((entry) => !SIZE_ORDER_SET.has(entry.size))
    .map((entry) => ({
      size: entry.size,
      price: entry.price,
      buyingPrice:
        Number.isFinite(entry.buyingPrice) ? (entry.buyingPrice as number) : "",
      profit: Number.isFinite(entry.profit) ? (entry.profit as number) : "",
      profitAuto: !Number.isFinite(entry.profit),
    }));
  const merged = [...ordered, ...extras];
  return merged.map((row) => {
    if (row.profitAuto && row.price !== "" && row.buyingPrice !== "") {
      return { ...row, profit: Number(row.price) - Number(row.buyingPrice) };
    }
    return row;
  });
}

type FormState = {
  title: string;
  colors: string;
  sizePrices: SizePriceRow[];
  pickupPoint: string;
  collectionPoint: string;
  photoUrl: string;
  isActive: boolean;
  inStock: boolean;
};

const DEFAULT_SIZE_ROWS: SizePriceRow[] = [
  ...buildSizeRows(),
];

const emptyForm: FormState = {
  title: "",
  colors: "",
  sizePrices: DEFAULT_SIZE_ROWS,
  pickupPoint: DEFAULT_PICKUP_POINT,
  collectionPoint: DEFAULT_COLLECTION_POINT,
  photoUrl: "",
  isActive: true,
  inStock: true,
};

const money = (value: number) => `Rs ${Number(value || 0).toLocaleString()}`;
const UPLOAD_PREFIX = "items";

export default function AdminShopsPage() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const [search, setSearch] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [showInStockOnly, setShowInStockOnly] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/shops");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load shops.");
      const list = Array.isArray(data?.items) ? data.items : [];
      list.sort((a, b) => (b.position || 0) - (a.position || 0));
      setItems(list);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load shops.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === editingId) || null,
    [items, editingId]
  );

  const needsNormalization = useMemo(
    () =>
      items.some(
        (item) =>
          item.sizePrices?.some((entry) => /\s+Old$/i.test(entry.size)) ||
          item.sizes?.some((size) => /\s+Old$/i.test(size))
      ),
    [items]
  );

  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((item) => item.isActive).length;
    const inStock = items.filter((item) => item.inStock).length;
    const hidden = total - active;
    const out = items.filter((item) => !item.inStock).length;
    const attention = items.filter((item) => !item.inStock || !item.isActive).length;
    return { total, active, inStock, hidden, out, attention };
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (term) {
        const blob = `${item.title} ${item.colors?.join(", ") || ""}`.toLowerCase();
        if (!blob.includes(term)) return false;
      }
      if (showActiveOnly && !item.isActive) return false;
      if (showInStockOnly && !item.inStock) return false;
      return true;
    });
  }, [items, search, showActiveOnly, showInStockOnly]);

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm, sizePrices: buildSizeRows() });
    setFile(null);
    setNotice(null);
  }

  function startEdit(item: ShopItem) {
    const sizePrices = getSizePrices(item);
    setEditingId(item.id);
    setForm({
      title: item.title,
      colors: item.colors.join(", "),
      sizePrices: sizePrices.length
        ? buildSizeRows(sizePrices)
        : buildSizeRows(),
      pickupPoint: item.pickupPoint || DEFAULT_PICKUP_POINT,
      collectionPoint: item.collectionPoint || DEFAULT_COLLECTION_POINT,
      photoUrl: item.photoUrl || "",
      isActive: item.isActive,
      inStock: item.inStock,
    });
    setFile(null);
    setNotice(null);
  }

  function computeProfitValue(price: number | "", buyingPrice: number | "") {
    if (price === "" || buyingPrice === "") return "";
    if (!Number.isFinite(price) || !Number.isFinite(buyingPrice)) return "";
    return Number(price) - Number(buyingPrice);
  }

  function updateSizeRow(index: number, patch: Partial<SizePriceRow>) {
    setForm((prev) => {
      const next = prev.sizePrices.slice();
      const current = next[index];
      const merged = { ...current, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "profit")) {
        merged.profitAuto = patch.profit === "";
      }
      if (merged.profitAuto) {
        merged.profit = computeProfitValue(merged.price, merged.buyingPrice);
      }
      next[index] = merged;
      return { ...prev, sizePrices: next };
    });
  }

  function addSizeRow() {
    setForm((prev) => ({
      ...prev,
      sizePrices: [
        ...prev.sizePrices,
        { size: "", price: "", buyingPrice: "", profit: "", profitAuto: true },
      ],
    }));
  }

  function removeSizeRow(index: number) {
    setForm((prev) => {
      const next = prev.sizePrices.filter((_, i) => i !== index);
      return {
        ...prev,
        sizePrices: next.length
          ? next
          : [{ size: "", price: "", buyingPrice: "", profit: "", profitAuto: true }],
      };
    });
  }

  async function uploadPhoto() {
    if (!file) {
      setNotice("Choose a file first.");
      return;
    }
    setNotice(null);
    setError(null);
    try {
      const url = await uploadFileAndGetUrl();
      if (url) {
        setNotice("Photo uploaded. Save the item to apply it.");
      }
    } catch (err: any) {
      setError(err?.message || "Upload failed. Use an image URL instead.");
    }
  }

  async function uploadFileAndGetUrl() {
    if (!file) return form.photoUrl;
    setUploading(true);
    try {
      const pathSafe = file.name.replace(/\s+/g, "-").toLowerCase();
      const storageRef = ref(storage, `${UPLOAD_PREFIX}/${Date.now()}-${pathSafe}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setForm((prev) => ({ ...prev, photoUrl: url }));
      setFile(null);
      return url;
    } catch (err) {
      console.error("upload error", err);
      throw new Error("Photo upload failed. Paste an image URL instead.");
    } finally {
      setUploading(false);
    }
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice(null);
    setError(null);

    try {
      const photoUrl = await uploadFileAndGetUrl();
      const sizePrices = form.sizePrices
        .filter((row) => row.size && row.price !== "" && Number.isFinite(row.price))
        .map((row) => {
          const buyingPrice =
            row.buyingPrice === "" || !Number.isFinite(row.buyingPrice)
              ? null
              : Number(row.buyingPrice);
          const profit =
            row.profit === "" || !Number.isFinite(row.profit)
              ? row.profitAuto && buyingPrice !== null && row.price !== ""
                ? Number(row.price) - Number(buyingPrice)
                : null
              : Number(row.profit);
          return {
            size: row.size,
            price: Number(row.price),
            buyingPrice,
            profit,
          };
        });

      const payload = {
        title: form.title,
        colors: form.colors,
        sizePrices,
        pickupPoint: form.pickupPoint,
        collectionPoint: form.collectionPoint,
        photoUrl,
        isActive: form.isActive,
        inStock: form.inStock,
      };

      const res = await fetch(editingId ? `/api/admin/shops/${editingId}` : "/api/admin/shops", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to save item.");
      await refresh();
      if (!editingId) resetForm();
      setNotice(editingId ? "Item updated." : "Item created.");
    } catch (err: any) {
      setError(err?.message || "Failed to save item.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this item?")) return;
    try {
      const res = await fetch(`/api/admin/shops/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to delete item.");
      await refresh();
      if (editingId === id) resetForm();
    } catch (err: any) {
      setError(err?.message || "Failed to delete item.");
    }
  }

  async function normalizeSizes() {
    if (normalizing) return;
    setNormalizing(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/shops/normalize-sizes", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to normalize sizes.");
      await refresh();
      setNotice(
        Number.isFinite(data?.updated)
          ? `Normalized ${data.updated} item${data.updated === 1 ? "" : "s"}.`
          : "Size labels normalized."
      );
    } catch (err: any) {
      setError(err?.message || "Failed to normalize sizes.");
    } finally {
      setNormalizing(false);
    }
  }

  async function moveItem(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const current = items[index];
    const target = items[targetIndex];
    if (!current || !target) return;

    const currentPos = Number.isFinite(current.position) ? (current.position as number) : index;
    const targetPos = Number.isFinite(target.position) ? (target.position as number) : targetIndex;
    try {
      const res = await fetch("/api/admin/shops/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            { id: current.id, position: targetPos },
            { id: target.id, position: currentPos },
          ],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to reorder item.");
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to reorder item.");
    }
  }

  const togglePill = (active: boolean, activeClass: string) =>
    `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
      active
        ? activeClass
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
    }`;

  return (
    <main className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-12rem] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.35),transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10rem] top-48 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.25),transparent_70%)] blur-3xl"
      />
      <div className="relative mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm backdrop-blur"
          style={{ animation: "fadeUp 0.6s ease-out both" }}
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_60%)]"
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-600">Catalog</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">Shops catalog</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Curate your best-selling blanks with clean price ladders, instant uploads, and sharp reorder control.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  <FiGrid className="h-4 w-4" /> Premium catalog
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <FiLayers className="h-4 w-4" /> Price matrix
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  <FiTrendingUp className="h-4 w-4" /> Profit visibility
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {needsNormalization && (
                <button
                  onClick={normalizeSizes}
                  disabled={normalizing}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FiSliders className="h-4 w-4" />
                  {normalizing ? "Normalizing..." : "Normalize sizes"}
                </button>
              )}
              <button
                onClick={refresh}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <FiRefreshCw className="h-4 w-4" /> Refresh
              </button>
              <button
                onClick={resetForm}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <FiPlus className="h-4 w-4" /> Add item
              </button>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section
          className="grid grid-cols-2 gap-4 md:grid-cols-5"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.08s" }}
        >
          <StatCard label="Total items" value={stats.total} tone="sky" icon={<FiGrid className="h-4 w-4" />} />
          <StatCard label="Active" value={stats.active} tone="emerald" icon={<FiActivity className="h-4 w-4" />} />
          <StatCard label="In stock" value={stats.inStock} tone="slate" icon={<FiBox className="h-4 w-4" />} />
          <StatCard label="Hidden" value={stats.hidden} tone="amber" icon={<FiFilter className="h-4 w-4" />} />
          <StatCard label="Attention" value={stats.attention} tone="rose" icon={<FiBarChart2 className="h-4 w-4" />} />
        </section>

        {/* Filters */}
        <section
          className="sticky top-20 z-10 rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm backdrop-blur"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.14s" }}
        >
          <div className="flex flex-wrap items-start gap-3">
            <div className="relative">
              <FiSearch className="absolute left-3 top-2.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title or color..."
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200 sm:w-64"
              />
            </div>
            <button
              type="button"
              aria-pressed={showActiveOnly}
              onClick={() => setShowActiveOnly((v) => !v)}
              className={togglePill(showActiveOnly, "border-emerald-200 bg-emerald-50 text-emerald-700")}
            >
              <FiActivity className="h-4 w-4" /> Active only
            </button>
            <button
              type="button"
              aria-pressed={showInStockOnly}
              onClick={() => setShowInStockOnly((v) => !v)}
              className={togglePill(showInStockOnly, "border-sky-200 bg-sky-50 text-sky-700")}
            >
              <FiBox className="h-4 w-4" /> In stock
            </button>
            <div className="ml-auto text-xs font-semibold text-slate-500">
              Showing {filteredItems.length} of {items.length}
            </div>
          </div>
        </section>

        <section
          className="grid gap-6 lg:grid-cols-[1.15fr_1fr]"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.2s" }}
        >
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Items</h2>
                <p className="text-xs text-slate-500">Reorder, publish, and price in one view.</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">{filteredItems.length} shown</span>
            </div>

            {loading ? (
              <div className="mt-6 text-sm text-slate-500">Loading items...</div>
            ) : (
              <ul className="mt-6 space-y-4">
                {filteredItems.map((item) => {
                  const sizePrices = getSizePrices(item);
                  const priceValues = sizePrices
                    .map((entry) => entry.price)
                    .filter((price) => Number.isFinite(price)) as number[];
                  const minPrice = priceValues.length ? Math.min(...priceValues) : null;
                  const itemIndex = items.findIndex((entry) => entry.id === item.id);
                  return (
                    <li key={item.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-sky-200 hover:shadow-md">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-5">
                          <div className="h-24 w-24 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-sm">
                            {item.photoUrl ? (
                              <img src={item.photoUrl} alt={item.title} className="h-full w-full object-contain" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                                <FiImage className="h-5 w-5" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.isActive ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-slate-200 bg-slate-100 text-slate-600"}`}>
                                {item.isActive ? "Active" : "Hidden"}
                              </span>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.inStock ? "border border-sky-200 bg-sky-50 text-sky-700" : "border border-rose-200 bg-rose-50 text-rose-700"}`}>
                                {item.inStock ? "In stock" : "Out of stock"}
                              </span>
                              {minPrice !== null && (
                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                  From {money(minPrice)}
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-xs text-slate-500">
                              Colors: {item.colors.join(", ") || "-"}
                            </p>
                            <div className="mt-3 grid gap-2 text-[11px] text-slate-700 sm:grid-cols-[repeat(auto-fit,minmax(96px,1fr))]">
                              {sizePrices.length ? (
                                sizePrices.map((entry) => (
                                  <div
                                    key={entry.size}
                                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center"
                                  >
                                    <div className="text-xs font-semibold text-slate-900">
                                      {formatSizeLabel(entry.size)}
                                    </div>
                                    <div className="text-[11px] font-medium text-slate-500">
                                      {money(entry.price)}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <span className="text-slate-500">No sizes set</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                          <button
                            onClick={() => moveItem(itemIndex, "up")}
                            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                          >
                            Up
                          </button>
                          <button
                            onClick={() => moveItem(itemIndex, "down")}
                            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                          >
                            Down
                          </button>
                          <button
                            onClick={() => startEdit(item)}
                            className="rounded-full border border-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
                {!filteredItems.length && (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                    No shop items yet.
                  </div>
                )}
              </ul>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedItem ? "Edit item" : "New item"}</h2>
                <p className="text-xs text-slate-500">Fields marked with * are required.</p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                <FiTag className="h-4 w-4" /> {selectedItem ? "Editing" : "Draft"}
              </span>
            </div>

            <form className="mt-6 space-y-4" onSubmit={saveItem}>
              <div>
                <label className="text-sm font-semibold text-slate-700">Title *</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="Plain T-Shirt"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Colors *</label>
                  <input
                    required
                    value={form.colors}
                    onChange={(e) => setForm((prev) => ({ ...prev, colors: e.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    placeholder="Black, White, Navy"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">Size prices *</label>
                  <button
                    type="button"
                    onClick={addSizeRow}
                    className="rounded-full border border-slate-900 px-3 py-1 text-xs font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
                  >
                    Add size
                  </button>
                </div>
                <div className="hidden sm:grid grid-cols-[1.1fr_0.85fr_0.85fr_0.85fr_auto] gap-3 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  <span>Size</span>
                  <span>Selling price</span>
                  <span>Buying price</span>
                  <span>Profit</span>
                  <span className="sr-only">Remove</span>
                </div>
                <div className="space-y-3">
                  {form.sizePrices.map((row, index) => (
                    <div
                      key={`${row.size}-${index}`}
                      className="grid grid-cols-2 gap-3 sm:grid-cols-[1.1fr_0.85fr_0.85fr_0.85fr_auto] sm:items-center"
                    >
                      <select
                        value={row.size}
                        onChange={(e) => updateSizeRow(index, { size: e.target.value })}
                        className="col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200 sm:col-span-1"
                        required
                      >
                        <option value="" disabled>
                          Select size
                        </option>
                        {SIZE_ORDER.map((size) => (
                          <option key={size} value={size}>
                            {formatSizeLabel(size)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.price}
                        onChange={(e) =>
                          updateSizeRow(index, {
                            price: e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="Selling price"
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.buyingPrice}
                        onChange={(e) =>
                          updateSizeRow(index, {
                            buyingPrice: e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="Buying price"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={row.profit}
                        onChange={(e) =>
                          updateSizeRow(index, {
                            profit: e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="Profit"
                      />
                      <button
                        type="button"
                        onClick={() => removeSizeRow(index)}
                        className="col-span-2 rounded-full border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 sm:col-span-1"
                        aria-label="Remove size"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500">Leave selling price blank if that size is not available.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Supplier pickup point</label>
                  <input
                    value={form.pickupPoint}
                    onChange={(e) => setForm((prev) => ({ ...prev, pickupPoint: e.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Collection point</label>
                  <input
                    value={form.collectionPoint}
                    onChange={(e) => setForm((prev) => ({ ...prev, collectionPoint: e.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900"
                  />
                  Show on public page
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.inStock}
                    onChange={(e) => setForm((prev) => ({ ...prev, inStock: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900"
                  />
                  In stock
                </label>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Photo</p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3">
                    <input
                      id="shop-photo-upload"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="sr-only"
                    />
                    <label
                      htmlFor="shop-photo-upload"
                      className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      <FiImage className="h-4 w-4" />
                      Choose file
                    </label>
                    <span className="text-xs text-slate-500">
                      {file ? file.name : "No file chosen"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={uploadPhoto}
                    disabled={!file || uploading}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <FiImage className="h-4 w-4" />
                    {uploading ? "Uploading..." : "Upload"}
                  </button>
                </div>
                <input
                  value={form.photoUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, photoUrl: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="Or paste an image URL"
                />
                {(previewUrl || form.photoUrl) && (
                  <div className="h-32 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <img src={previewUrl || form.photoUrl} alt="Preview" className="h-full w-full object-cover" />
                  </div>
                )}
              </div>

              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                  {error}
                </div>
              )}
              {notice && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {notice}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-700"
                >
                  {saving ? "Saving..." : selectedItem ? "Update item" : "Create item"}
                </button>
                {selectedItem && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </section>

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
  tone = "slate",
  icon,
}: {
  label: string;
  value: number;
  tone?: "slate" | "sky" | "emerald" | "amber" | "rose";
  icon?: React.ReactNode;
}) {
  const tones = {
    slate: {
      border: "border-slate-200",
      bg: "from-slate-50 via-white to-white",
      accent: "bg-slate-100 text-slate-700",
      glow: "bg-slate-200/40",
      value: "text-slate-900",
    },
    sky: {
      border: "border-sky-100",
      bg: "from-sky-50 via-white to-white",
      accent: "bg-sky-100 text-sky-700",
      glow: "bg-sky-200/40",
      value: "text-slate-900",
    },
    emerald: {
      border: "border-emerald-100",
      bg: "from-emerald-50 via-white to-white",
      accent: "bg-emerald-100 text-emerald-700",
      glow: "bg-emerald-200/40",
      value: "text-slate-900",
    },
    amber: {
      border: "border-amber-100",
      bg: "from-amber-50 via-white to-white",
      accent: "bg-amber-100 text-amber-700",
      glow: "bg-amber-200/40",
      value: "text-slate-900",
    },
    rose: {
      border: "border-rose-100",
      bg: "from-rose-50 via-white to-white",
      accent: "bg-rose-100 text-rose-700",
      glow: "bg-rose-200/40",
      value: "text-slate-900",
    },
  } as const;
  const theme = tones[tone] ?? tones.slate;

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${theme.border} bg-gradient-to-br ${theme.bg} p-4 shadow-sm`}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </div>
        {icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${theme.accent}`}>
            {icon}
          </span>
        )}
      </div>
      <div className={`mt-3 text-2xl font-semibold ${theme.value}`}>{value.toLocaleString()}</div>
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full blur-2xl ${theme.glow}`}
      />
    </div>
  );
}
