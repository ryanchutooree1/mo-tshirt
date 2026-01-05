"use client";

import { useEffect, useMemo, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase";
import {
  DEFAULT_COLLECTION_POINT,
  DEFAULT_PICKUP_POINT,
  getDeliveredPrice,
  getMinSizePrice,
  getSizePrices,
  type ShopItem,
} from "@/lib/shops";

type SizePriceRow = { size: string; price: number | "" };

type FormState = {
  title: string;
  colors: string;
  sizePrices: SizePriceRow[];
  deliveryFee: number | "";
  deliveredPrice: number | "";
  pickupPoint: string;
  collectionPoint: string;
  photoUrl: string;
  isActive: boolean;
  inStock: boolean;
};

const DEFAULT_SIZE_ROWS: SizePriceRow[] = [
  { size: "S", price: "" },
  { size: "M", price: "" },
  { size: "L", price: "" },
  { size: "XL", price: "" },
];

const emptyForm: FormState = {
  title: "",
  colors: "",
  sizePrices: DEFAULT_SIZE_ROWS,
  deliveryFee: "",
  deliveredPrice: "",
  pickupPoint: DEFAULT_PICKUP_POINT,
  collectionPoint: DEFAULT_COLLECTION_POINT,
  photoUrl: "",
  isActive: true,
  inStock: true,
};

const money = (value: number) => `Rs ${Number(value || 0).toLocaleString()}`;

export default function AdminShopsPage() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      setItems(Array.isArray(data?.items) ? data.items : []);
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

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm, sizePrices: DEFAULT_SIZE_ROWS.map((row) => ({ ...row })) });
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
        ? sizePrices.map((entry) => ({ size: entry.size, price: entry.price }))
        : DEFAULT_SIZE_ROWS.map((row) => ({ ...row })),
      deliveryFee: item.deliveryFee ?? "",
      deliveredPrice: item.deliveredPrice ?? "",
      pickupPoint: item.pickupPoint || DEFAULT_PICKUP_POINT,
      collectionPoint: item.collectionPoint || DEFAULT_COLLECTION_POINT,
      photoUrl: item.photoUrl || "",
      isActive: item.isActive,
      inStock: item.inStock,
    });
    setFile(null);
    setNotice(null);
  }

  function updateSizeRow(index: number, patch: Partial<SizePriceRow>) {
    setForm((prev) => {
      const next = prev.sizePrices.slice();
      next[index] = { ...next[index], ...patch };
      return { ...prev, sizePrices: next };
    });
  }

  function addSizeRow() {
    setForm((prev) => ({
      ...prev,
      sizePrices: [...prev.sizePrices, { size: "", price: "" }],
    }));
  }

  function removeSizeRow(index: number) {
    setForm((prev) => {
      const next = prev.sizePrices.filter((_, i) => i !== index);
      return { ...prev, sizePrices: next.length ? next : [{ size: "", price: "" }] };
    });
  }

  async function uploadPhoto() {
    if (!file) return;
    setUploading(true);
    setNotice(null);
    try {
      const pathSafe = file.name.replace(/\s+/g, "-").toLowerCase();
      const storageRef = ref(storage, `shops/${Date.now()}-${pathSafe}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setForm((prev) => ({ ...prev, photoUrl: url }));
      setFile(null);
      setNotice("Photo uploaded.");
    } catch (err) {
      console.error("upload error", err);
      setNotice("Upload failed. Use an image URL instead.");
    } finally {
      setUploading(false);
    }
  }

  async function uploadFileAndGetUrl() {
    if (!file) return form.photoUrl;
    setUploading(true);
    try {
      const pathSafe = file.name.replace(/\s+/g, "-").toLowerCase();
      const storageRef = ref(storage, `shops/${Date.now()}-${pathSafe}`);
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
      const payload = {
        title: form.title,
        colors: form.colors,
        sizePrices: form.sizePrices,
        deliveryFee: form.deliveryFee,
        deliveredPrice: form.deliveredPrice,
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

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-orange-500">Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Shops catalog</h1>
          <p className="text-sm text-neutral-600">Add, edit, and publish plain T-shirt listings.</p>
        </div>
        <button
          onClick={resetForm}
          className="inline-flex items-center justify-center rounded-full border border-black px-4 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
        >
          Add item
        </button>
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
              {items.map((item) => {
                const minPrice = getMinSizePrice(item);
                const deliveredPrice = getDeliveredPrice(item, minPrice);
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
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-neutral-700">
                            {sizePrices.length ? (
                              sizePrices.map((entry) => (
                                <span key={entry.size} className="rounded-full border border-neutral-200 px-2 py-1">
                                  {entry.size} {money(entry.price)}
                                </span>
                              ))
                            ) : (
                              <span className="text-neutral-500">No sizes set</span>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-neutral-600">
                            From {money(minPrice)}{" "}
                            {deliveredPrice !== null ? `- Delivered ${money(deliveredPrice)}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
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
              <div className="space-y-3">
                {form.sizePrices.map((row, index) => (
                  <div key={`${row.size}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-3">
                    <input
                      value={row.size}
                      onChange={(e) => updateSizeRow(index, { size: e.target.value })}
                      className="rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm"
                      placeholder="Size (e.g. M)"
                      required
                    />
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
                      className="rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm"
                      placeholder="Price"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => removeSizeRow(index)}
                      className="rounded-full border border-neutral-300 px-3 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-100"
                      aria-label="Remove size"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-neutral-800">Delivery fee</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.deliveryFee}
                  onChange={(e) => setForm((prev) => ({ ...prev, deliveryFee: e.target.value === "" ? "" : Number(e.target.value) }))}
                  className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-neutral-800">Delivered price</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.deliveredPrice}
                  onChange={(e) => setForm((prev) => ({ ...prev, deliveredPrice: e.target.value === "" ? "" : Number(e.target.value) }))}
                  className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm"
                  placeholder="Optional"
                />
                <p className="mt-1 text-xs text-neutral-500">Delivered price overrides delivery fee.</p>
              </div>
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
