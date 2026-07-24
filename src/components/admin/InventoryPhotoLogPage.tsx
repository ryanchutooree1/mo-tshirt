"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  Camera,
  Check,
  CircleAlert,
  Clock3,
  History,
  ImagePlus,
  LoaderCircle,
  PackageCheck,
  Pencil,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import { formatMoney } from "@/lib/money";
import type {
  InventoryPhotoLogItem,
  InventoryTransactionType,
} from "@/lib/inventory-photo-log";

type ViewMode = "pending" | "history";

type EditForm = {
  productName: string;
  category: string;
  quantity: number | "";
  sellingPrice: number | "";
  transactionType: InventoryTransactionType | "";
  notes: string;
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const CATEGORY_SUGGESTIONS = [
  "T-Shirt",
  "Polo Shirt",
  "Uniform",
  "Hoodie",
  "Cap",
  "Bag",
  "Accessory",
];

function formatDateTime(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.replace("T", " ").replace(/([+-]\d{2}:\d{2})$/, " $1");
  }

  return new Intl.DateTimeFormat("en-MU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatFileSize(size: number) {
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function buildEditForm(item: InventoryPhotoLogItem): EditForm {
  return {
    productName: item.productName,
    category: item.category,
    quantity: item.quantity ?? "",
    sellingPrice: item.sellingPrice ?? "",
    transactionType: item.transactionType ?? "",
    notes: item.notes,
  };
}

function transactionLabel(value: InventoryTransactionType | null) {
  if (value === "stock-in") return "Stock In";
  if (value === "stock-out") return "Stock Out";
  return "Not set";
}

function RecordPhoto({
  item,
  className,
}: {
  item: InventoryPhotoLogItem;
  className: string;
}) {
  return (
    // Protected admin images cannot use the unauthenticated Next.js image optimizer.
    <img
      src={item.thumbnailUrl}
      alt={`Inventory photo for ${item.productName}`}
      className={className}
      loading="lazy"
      decoding="async"
    />
  );
}

export default function InventoryPhotoLogPage() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const editDialogRef = useRef<HTMLDivElement | null>(null);
  const savingRef = useRef(false);
  const [items, setItems] = useState<InventoryPhotoLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("pending");
  const [search, setSearch] = useState("");
  const [editingItem, setEditingItem] =
    useState<InventoryPhotoLogItem | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/inventory-photo-log", {
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Could not load the photo log.");
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not load the photo log."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!editingItem) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const firstInput =
      editDialogRef.current?.querySelector<HTMLInputElement>("input");
    window.requestAnimationFrame(() => firstInput?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) {
        setEditingItem(null);
        setEditForm(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editingItem]);

  const pendingItems = useMemo(
    () => items.filter((item) => item.isPending),
    [items]
  );

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const source = view === "pending" ? pendingItems : items;
    if (!term) return source;

    return source.filter((item) =>
      `${item.productName} ${item.category} ${item.transactionType || ""} ${item.notes}`
        .toLowerCase()
        .includes(term)
    );
  }, [items, pendingItems, search, view]);

  const stockInCount = useMemo(
    () => items.filter((item) => item.transactionType === "stock-in").length,
    [items]
  );
  const stockOutCount = useMemo(
    () => items.filter((item) => item.transactionType === "stock-out").length,
    [items]
  );

  async function uploadPhoto(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`Photo is ${formatFileSize(file.size)}. Maximum size is 10 MB.`);
      return;
    }

    const preview = URL.createObjectURL(file);
    setUploadPreview(preview);
    setUploading(true);
    setError(null);
    setNotice(null);

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("productName", quickName.trim());

      const response = await fetch("/api/admin/inventory-photo-log/upload", {
        method: "POST",
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.item) {
        throw new Error(data?.error || "Could not save the photo.");
      }

      const saved = data.item as InventoryPhotoLogItem;
      setItems((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      setQuickName("");
      setView("pending");
      setNotice(`${saved.productName} saved. Details can be added anytime.`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not save the photo."
      );
    } finally {
      URL.revokeObjectURL(preview);
      setUploadPreview(null);
      setUploading(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  function handlePhotoSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void uploadPhoto(file);
  }

  function startEditing(item: InventoryPhotoLogItem) {
    setError(null);
    setEditingItem(item);
    setEditForm(buildEditForm(item));
  }

  function closeEditor() {
    if (saving) return;
    setEditingItem(null);
    setEditForm(null);
  }

  async function saveEdit() {
    if (!editingItem || !editForm) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/inventory-photo-log/${encodeURIComponent(editingItem.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editForm),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.item) {
        throw new Error(data?.error || "Could not update the record.");
      }

      const saved = data.item as InventoryPhotoLogItem;
      setItems((current) =>
        current.map((item) => (item.id === saved.id ? saved : item))
      );
      setEditingItem(null);
      setEditForm(null);
      setNotice(
        saved.isPending
          ? `${saved.productName} updated. Some details are still pending.`
          : `${saved.productName} is complete.`
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not update the record."
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const panelClass = isDark
    ? "border-white/10 bg-[#0d1410] text-white"
    : "border-slate-200 bg-white text-slate-950";
  const mutedText = isDark ? "text-white/48" : "text-slate-500";
  const inputClass = `min-h-12 w-full rounded-xl border px-3.5 text-base outline-none transition sm:text-sm ${
    isDark
      ? "border-white/10 bg-white/[0.055] text-white placeholder:text-white/30 focus:border-orange-400/60"
      : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
  }`;

  return (
    <main className="mx-auto w-full max-w-[1500px] pb-10">
      <section className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-orange-600">
            <Camera className="h-3.5 w-3.5" />
            Quick capture
          </div>
          <h1 className="text-2xl font-black tracking-[-0.04em] sm:text-3xl">
            Inventory Photo Log
          </h1>
          <p className={`mt-1.5 max-w-2xl text-sm leading-6 ${mutedText}`}>
            Save the photo first. Add stock details when there is time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || uploading}
          className={`inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border px-4 text-xs font-bold transition disabled:opacity-50 sm:self-auto ${
            isDark
              ? "border-white/10 bg-white/5 hover:bg-white/10"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </section>

      <section
        className={`relative mb-5 overflow-hidden rounded-[24px] border shadow-sm sm:mb-6 ${panelClass}`}
      >
        <div
          className={`absolute inset-x-0 top-0 h-1 ${
            uploading ? "animate-pulse bg-orange-500" : "bg-orange-500/70"
          }`}
        />
        <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
                <ImagePlus className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-extrabold">Add a product photo</h2>
                <p className={`mt-0.5 text-xs ${mutedText}`}>
                  The photo saves as soon as it is selected.
                </p>
              </div>
            </div>

            <label className="mt-5 block max-w-xl">
              <span className={`mb-2 block text-xs font-bold ${mutedText}`}>
                Quick product name{" "}
                <span className="font-medium">(optional)</span>
              </span>
              <input
                value={quickName}
                onChange={(event) => setQuickName(event.target.value)}
                placeholder="Leave blank for Unsorted Item 001"
                maxLength={160}
                disabled={uploading}
                className={inputClass}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:min-w-[330px]">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              capture="environment"
              onChange={handlePhotoSelection}
              disabled={uploading}
              className="sr-only"
              aria-label="Take a product photo"
            />
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              onChange={handlePhotoSelection}
              disabled={uploading}
              className="sr-only"
              aria-label="Upload a product photo"
            />
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 text-sm font-extrabold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60"
            >
              {uploading ? (
                <LoaderCircle className="h-5 w-5 animate-spin" />
              ) : (
                <Camera className="h-5 w-5" />
              )}
              Take photo
            </button>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploading}
              className={`inline-flex min-h-[56px] items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-extrabold transition disabled:cursor-wait disabled:opacity-60 ${
                isDark
                  ? "border-white/12 bg-white/5 hover:bg-white/10"
                  : "border-slate-200 bg-slate-50 hover:bg-slate-100"
              }`}
            >
              <Upload className="h-5 w-5" />
              Upload
            </button>
          </div>
        </div>

        {uploading ? (
          <div
            className={`flex items-center gap-3 border-t px-4 py-3 sm:px-6 ${
              isDark
                ? "border-white/10 bg-orange-400/5"
                : "border-orange-100 bg-orange-50"
            }`}
            role="status"
          >
            {uploadPreview ? (
              <img
                src={uploadPreview}
                alt="Photo being saved"
                className="h-10 w-10 rounded-lg object-cover"
              />
            ) : null}
            <LoaderCircle className="h-4 w-4 animate-spin text-orange-500" />
            <span className="text-xs font-bold">
              Saving photo and checking EXIF time…
            </span>
          </div>
        ) : null}
      </section>

      {error ? (
        <div
          role="alert"
          className={`mb-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
            isDark
              ? "border-rose-400/20 bg-rose-400/10 text-rose-200"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "All photos",
            value: items.length,
            icon: History,
            color: "text-sky-500",
          },
          {
            label: "Need details",
            value: pendingItems.length,
            icon: Clock3,
            color: "text-orange-500",
          },
          {
            label: "Stock In",
            value: stockInCount,
            icon: ArrowDownToLine,
            color: "text-emerald-500",
          },
          {
            label: "Stock Out",
            value: stockOutCount,
            icon: ArrowUpFromLine,
            color: "text-rose-500",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className={`rounded-2xl border p-3.5 sm:p-4 ${panelClass}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] font-bold ${mutedText}`}>
                {label}
              </span>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <div className="mt-2 font-mono text-2xl font-black">{value}</div>
          </div>
        ))}
      </section>

      <section className={`overflow-hidden rounded-[24px] border ${panelClass}`}>
        <div
          className={`flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4 ${
            isDark ? "border-white/10" : "border-slate-200"
          }`}
        >
          <div
            className={`grid grid-cols-2 rounded-xl p-1 ${
              isDark ? "bg-white/5" : "bg-slate-100"
            }`}
          >
            <button
              type="button"
              onClick={() => setView("pending")}
              className={`min-h-10 rounded-lg px-3 text-xs font-extrabold transition ${
                view === "pending"
                  ? isDark
                    ? "bg-white text-slate-950"
                    : "bg-white text-slate-950 shadow-sm"
                  : mutedText
              }`}
            >
              Pending ({pendingItems.length})
            </button>
            <button
              type="button"
              onClick={() => setView("history")}
              className={`min-h-10 rounded-lg px-3 text-xs font-extrabold transition ${
                view === "history"
                  ? isDark
                    ? "bg-white text-slate-950"
                    : "bg-white text-slate-950 shadow-sm"
                  : mutedText
              }`}
            >
              History ({items.length})
            </button>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search
              className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${mutedText}`}
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search photo log…"
              aria-label="Search inventory photo log"
              className={`${inputClass} min-h-10 pl-9`}
            />
          </div>
        </div>

        {loading ? (
          <div className={`flex min-h-56 items-center justify-center gap-3 ${mutedText}`}>
            <LoaderCircle className="h-5 w-5 animate-spin" />
            <span className="text-sm font-semibold">Loading photo log…</span>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                isDark ? "bg-white/5" : "bg-slate-100"
              }`}
            >
              {view === "pending" ? (
                <PackageCheck className="h-6 w-6 text-emerald-500" />
              ) : (
                <Camera className={`h-6 w-6 ${mutedText}`} />
              )}
            </span>
            <h3 className="mt-4 text-sm font-extrabold">
              {search
                ? "No matching photos"
                : view === "pending"
                  ? "All photo details are complete"
                  : "No inventory photos yet"}
            </h3>
            <p className={`mt-1 max-w-sm text-xs leading-5 ${mutedText}`}>
              {view === "pending"
                ? "New quick captures that need product details will appear here."
                : "Take or upload the first product photo above."}
            </p>
          </div>
        ) : (
          <div
            className={`divide-y ${
              isDark ? "divide-white/10" : "divide-slate-200/70"
            }`}
          >
            {visibleItems.map((item) => (
              <article
                key={item.id}
                className={`grid gap-4 p-3 transition sm:grid-cols-[112px_1fr_auto] sm:p-4 ${
                  isDark ? "hover:bg-white/[0.025]" : "hover:bg-slate-50/70"
                }`}
              >
                <button
                  type="button"
                  onClick={() => startEditing(item)}
                  className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-100 sm:aspect-square sm:w-28"
                  aria-label={`Edit ${item.productName}`}
                >
                  <RecordPhoto
                    item={item}
                    className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]"
                  />
                  {item.isPending ? (
                    <span className="absolute left-2 top-2 rounded-full bg-orange-500 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white shadow">
                      Pending
                    </span>
                  ) : null}
                </button>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-extrabold sm:text-base">
                      {item.productName}
                    </h3>
                    {item.transactionType ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold ${
                          item.transactionType === "stock-in"
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-rose-500/10 text-rose-600"
                        }`}
                      >
                        {item.transactionType === "stock-in" ? (
                          <ArrowDownToLine className="h-3 w-3" />
                        ) : (
                          <ArrowUpFromLine className="h-3 w-3" />
                        )}
                        {transactionLabel(item.transactionType)}
                      </span>
                    ) : null}
                  </div>

                  <div className={`mt-1 text-xs ${mutedText}`}>
                    {item.category || "Category pending"}
                    <span className="mx-2 opacity-40">•</span>
                    {item.quantity === null
                      ? "Quantity pending"
                      : `${item.quantity} unit${item.quantity === 1 ? "" : "s"}`}
                    <span className="mx-2 opacity-40">•</span>
                    {item.sellingPrice === null
                      ? "Price pending"
                      : formatMoney(item.sellingPrice)}
                  </div>

                  <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
                    <div
                      className={`flex items-start gap-2 rounded-xl px-3 py-2 ${
                        isDark ? "bg-white/[0.045]" : "bg-slate-50"
                      }`}
                    >
                      <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                      <span>
                        <span className={`block font-semibold ${mutedText}`}>
                          Photo time (EXIF)
                        </span>
                        <span className="mt-0.5 block font-mono font-semibold">
                          {formatDateTime(item.photoTakenAt)}
                        </span>
                      </span>
                    </div>
                    <div
                      className={`flex items-start gap-2 rounded-xl px-3 py-2 ${
                        isDark ? "bg-white/[0.045]" : "bg-slate-50"
                      }`}
                    >
                      <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
                      <span>
                        <span className={`block font-semibold ${mutedText}`}>
                          Server upload
                        </span>
                        <span className="mt-0.5 block font-mono font-semibold">
                          {formatDateTime(item.uploadedAt)}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => startEditing(item)}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 self-center rounded-xl border px-4 text-xs font-extrabold transition sm:min-w-[112px] ${
                    item.isPending
                      ? "border-orange-500 bg-orange-500 text-white hover:bg-orange-600"
                      : isDark
                        ? "border-white/10 bg-white/5 hover:bg-white/10"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {item.isPending ? "Add details" : "Edit"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {editingItem && editForm ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeEditor();
          }}
        >
          <div
            ref={editDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-photo-editor-title"
            className={`max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] border shadow-2xl sm:max-w-3xl sm:rounded-[28px] ${panelClass}`}
          >
            <div
              className={`sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-4 py-4 backdrop-blur-xl sm:px-6 ${
                isDark
                  ? "border-white/10 bg-[#0d1410]/95"
                  : "border-slate-200 bg-white/95"
              }`}
            >
              <div>
                <h2
                  id="inventory-photo-editor-title"
                  className="text-base font-black"
                >
                  Complete inventory details
                </h2>
                <p className={`mt-0.5 text-xs ${mutedText}`}>
                  The original photo and timestamps stay unchanged.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition ${
                  isDark ? "bg-white/5 hover:bg-white/10" : "bg-slate-100 hover:bg-slate-200"
                }`}
                aria-label="Close editor"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-5 p-4 sm:grid-cols-[220px_1fr] sm:p-6">
              <div>
                <div className="aspect-square overflow-hidden rounded-2xl bg-slate-100">
                  <RecordPhoto
                    item={editingItem}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className={`mt-3 space-y-2 text-[11px] ${mutedText}`}>
                  <div className="flex gap-2">
                    <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      EXIF: {formatDateTime(editingItem.photoTakenAt)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Uploaded: {formatDateTime(editingItem.uploadedAt)}
                    </span>
                  </div>
                </div>
              </div>

              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveEdit();
                }}
              >
                <label>
                  <span className={`mb-1.5 block text-xs font-bold ${mutedText}`}>
                    Product name
                  </span>
                  <input
                    required
                    value={editForm.productName}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? { ...current, productName: event.target.value }
                          : current
                      )
                    }
                    maxLength={160}
                    className={inputClass}
                  />
                </label>

                <label>
                  <span className={`mb-1.5 block text-xs font-bold ${mutedText}`}>
                    Category
                  </span>
                  <input
                    value={editForm.category}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? { ...current, category: event.target.value }
                          : current
                      )
                    }
                    list="inventory-photo-categories"
                    placeholder="e.g. Polo Shirt"
                    maxLength={100}
                    className={inputClass}
                  />
                  <datalist id="inventory-photo-categories">
                    {CATEGORY_SUGGESTIONS.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label>
                    <span
                      className={`mb-1.5 block text-xs font-bold ${mutedText}`}
                    >
                      Quantity
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={editForm.quantity}
                      onChange={(event) =>
                        setEditForm((current) =>
                          current
                            ? {
                                ...current,
                                quantity:
                                  event.target.value === ""
                                    ? ""
                                    : Number(event.target.value),
                              }
                            : current
                        )
                      }
                      placeholder="0"
                      className={inputClass}
                    />
                  </label>
                  <label>
                    <span
                      className={`mb-1.5 block text-xs font-bold ${mutedText}`}
                    >
                      Selling price (Rs)
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={editForm.sellingPrice}
                      onChange={(event) =>
                        setEditForm((current) =>
                          current
                            ? {
                                ...current,
                                sellingPrice:
                                  event.target.value === ""
                                    ? ""
                                    : Number(event.target.value),
                              }
                            : current
                        )
                      }
                      placeholder="0.00"
                      className={inputClass}
                    />
                  </label>
                </div>

                <fieldset>
                  <legend className={`mb-1.5 text-xs font-bold ${mutedText}`}>
                    Transaction type
                  </legend>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {
                        value: "stock-in" as const,
                        label: "Stock In",
                        icon: ArrowDownToLine,
                        activeClass:
                          "border-emerald-500 bg-emerald-500 text-white",
                      },
                      {
                        value: "stock-out" as const,
                        label: "Stock Out",
                        icon: ArrowUpFromLine,
                        activeClass: "border-rose-500 bg-rose-500 text-white",
                      },
                    ].map(({ value, label, icon: Icon, activeClass }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setEditForm((current) =>
                            current
                              ? { ...current, transactionType: value }
                              : current
                          )
                        }
                        className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border text-sm font-extrabold transition ${
                          editForm.transactionType === value
                            ? activeClass
                            : isDark
                              ? "border-white/10 bg-white/5 hover:bg-white/10"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                        aria-pressed={editForm.transactionType === value}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <label>
                  <span className={`mb-1.5 block text-xs font-bold ${mutedText}`}>
                    Notes <span className="font-medium">(optional)</span>
                  </span>
                  <textarea
                    value={editForm.notes}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? { ...current, notes: event.target.value }
                          : current
                      )
                    }
                    rows={3}
                    maxLength={2000}
                    placeholder="Colour, size mix, supplier, storage location…"
                    className={`${inputClass} min-h-24 resize-y py-3`}
                  />
                </label>

                <div
                  className={`mt-1 flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end ${
                    isDark ? "border-white/10" : "border-slate-200"
                  }`}
                >
                  <button
                    type="button"
                    onClick={closeEditor}
                    disabled={saving}
                    className={`min-h-12 rounded-xl border px-5 text-sm font-bold ${
                      isDark
                        ? "border-white/10 hover:bg-white/5"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !editForm.productName.trim()}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 text-sm font-extrabold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600 disabled:opacity-50"
                  >
                    {saving ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Save details
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[90] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl ${
            isDark
              ? "border-emerald-400/20 bg-[#122019] text-emerald-200"
              : "border-emerald-200 bg-white text-emerald-700"
          }`}
        >
          <Check className="h-4 w-4 shrink-0" />
          {notice}
        </div>
      ) : null}
    </main>
  );
}
