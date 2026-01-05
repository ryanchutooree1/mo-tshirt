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

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-orange-500">Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Shops catalog</h1>
          <p className="text-sm text-neutral-600">Add, edit, and publish plain T-shirt listings.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {needsNormalization && (
            <button
              onClick={normalizeSizes}
              disabled={normalizing}
              className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {normalizing ? "Normalizing..." : "Normalize sizes"}
            </button>
          )}
          <button
            onClick={resetForm}
            className="inline-flex items-center justify-center rounded-full border border-black px-4 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
          >
            Add item
          </button>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-[24px] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Items</h2>
            <span className="text-xs text-neutral-500">{items.length} total</span>
          </div>

          {loading ? (
            <div className="mt-6 text-sm text-neutral-500">Loading items...</div>
          ) : (
            <ul className="mt-6 space-y-4">
              {items.map((item, index) => {
                const sizePrices = getSizePrices(item);
                return (
                  <li key={item.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-4">
                        <div className="h-16 w-16 overflow-hidden rounded-xl bg-white border border-neutral-200">
                          {item.photoUrl ? (
                            <img src={item.photoUrl} alt={item.title} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-400">
                              No photo
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-black">{item.title}</h3>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.isActive ? "bg-green-100 text-green-700" : "bg-neutral-200 text-neutral-600"}`}>
                              {item.isActive ? "Active" : "Hidden"}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.inStock ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
                              {item.inStock ? "In stock" : "Out of stock"}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-neutral-600">
                            Colors: {item.colors.join(", ") || "-"}
                          </p>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-neutral-700 sm:grid-cols-3">
                            {sizePrices.length ? (
                              sizePrices.map((entry) => (
                                <div
                                  key={entry.size}
                                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-2 py-1"
                                >
                                  <span className="font-semibold">{formatSizeLabel(entry.size)}</span>
                                  <span>{money(entry.price)}</span>
                                </div>
                              ))
                            ) : (
                              <span className="text-neutral-500">No sizes set</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => moveItem(index, "up")}
                          className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100"
                        >
                          Up
                        </button>
                        <button
                          onClick={() => moveItem(index, "down")}
                          className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100"
                        >
                          Down
                        </button>
                        <button
                          onClick={() => startEdit(item)}
                          className="rounded-full border border-black px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-black hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="rounded-full border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
              {!items.length && (
                <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-10 text-center text-sm text-neutral-500">
                  No shop items yet.
                </div>
              )}
            </ul>
          )}
        </div>

        <div className="rounded-[24px] border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{selectedItem ? "Edit item" : "New item"}</h2>
          <p className="text-xs text-neutral-500">Fields marked with * are required.</p>

          <form className="mt-6 space-y-4" onSubmit={saveItem}>
            <div>
              <label className="text-sm font-medium text-neutral-800">Title *</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm"
                placeholder="Plain T-Shirt"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-neutral-800">Colors *</label>
                <input
                  required
                  value={form.colors}
                  onChange={(e) => setForm((prev) => ({ ...prev, colors: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm"
                  placeholder="Black, White, Navy"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-neutral-800">Size prices *</label>
                <button
                  type="button"
                  onClick={addSizeRow}
                  className="rounded-full border border-black px-3 py-1 text-xs font-semibold text-black transition hover:bg-black hover:text-white"
                >
                  Add size
                </button>
              </div>
              <div className="hidden sm:grid grid-cols-[1.1fr_0.85fr_0.85fr_0.85fr_auto] gap-3 text-[10px] uppercase tracking-[0.2em] text-neutral-500">
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
                      className="col-span-2 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs sm:col-span-1"
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
                      className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs"
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
                      className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs"
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
                      className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs"
                      placeholder="Profit"
                    />
                    <button
                      type="button"
                      onClick={() => removeSizeRow(index)}
                      className="col-span-2 rounded-full border border-neutral-300 px-3 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-100 sm:col-span-1"
                      aria-label="Remove size"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-neutral-500">Leave selling price blank if that size is not available.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-neutral-800">Supplier pickup point</label>
                <input
                  value={form.pickupPoint}
                  onChange={(e) => setForm((prev) => ({ ...prev, pickupPoint: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-neutral-800">Collection point</label>
                <input
                  value={form.collectionPoint}
                  onChange={(e) => setForm((prev) => ({ ...prev, collectionPoint: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                  className="h-4 w-4 rounded border-neutral-300"
                />
                Show on public page
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                <input
                  type="checkbox"
                  checked={form.inStock}
                  onChange={(e) => setForm((prev) => ({ ...prev, inStock: e.target.checked }))}
                  className="h-4 w-4 rounded border-neutral-300"
                />
                In stock
              </label>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
              <p className="text-sm font-medium text-neutral-800">Photo</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="text-sm"
                />
                <button
                  type="button"
                  onClick={uploadPhoto}
                  disabled={!file || uploading}
                  className="inline-flex items-center justify-center rounded-full border border-black px-4 py-1.5 text-xs font-semibold text-black transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>
              <input
                value={form.photoUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, photoUrl: e.target.value }))}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm"
                placeholder="Or paste an image URL"
              />
              {(previewUrl || form.photoUrl) && (
                <div className="h-32 w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                  <img src={previewUrl || form.photoUrl} alt="Preview" className="h-full w-full object-cover" />
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
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
                className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-700"
              >
                {saving ? "Saving..." : selectedItem ? "Update item" : "Create item"}
              </button>
              {selectedItem && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-5 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
