"use client";

import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CircleAlert,
  ImageOff,
  LoaderCircle,
  PackagePlus,
  PackageSearch,
  Pencil,
  Plus,
  Search,
  Sparkles,
  UploadCloud,
  WalletCards,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import { formatMoney } from "@/lib/money";
import type {
  InventoryPhotoLogItem,
  InventoryTransactionType,
} from "@/lib/inventory-photo-log";
import type {
  MobInventoryItem,
  MobInventoryTransaction,
} from "@/lib/mob-inventory";

type InventoryView = "stock" | "imports" | "history";
type EditorMode = "create" | "edit" | "adjust";

type ItemForm = {
  productName: string;
  category: string;
  quantity: number | "";
  sellingPrice: number | "";
  lowStockThreshold: number | "";
  notes: string;
  isArchived: boolean;
};

type AdjustmentForm = {
  type: InventoryTransactionType;
  quantity: number | "";
  sellingPrice: number | "";
  notes: string;
};

const EMPTY_ITEM_FORM: ItemForm = {
  productName: "",
  category: "",
  quantity: "",
  sellingPrice: "",
  lowStockThreshold: 5,
  notes: "",
  isArchived: false,
};

const EMPTY_ADJUSTMENT: AdjustmentForm = {
  type: "stock-in",
  quantity: "",
  sellingPrice: "",
  notes: "",
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-MU", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export default function MobInventoryPage() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";
  const [items, setItems] = useState<MobInventoryItem[]>([]);
  const [transactions, setTransactions] = useState<MobInventoryTransaction[]>(
    []
  );
  const [readyPhotoLogs, setReadyPhotoLogs] = useState<InventoryPhotoLogItem[]>(
    []
  );
  const [view, setView] = useState<InventoryView>("stock");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [activeItem, setActiveItem] = useState<MobInventoryItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM_FORM);
  const [adjustmentForm, setAdjustmentForm] =
    useState<AdjustmentForm>(EMPTY_ADJUSTMENT);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/mob/inventory", {
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Could not load inventory.");
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTransactions(
        Array.isArray(data.transactions) ? data.transactions : []
      );
      setReadyPhotoLogs(
        Array.isArray(data.readyPhotoLogs) ? data.readyPhotoLogs : []
      );
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load inventory."
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
    if (!editorMode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editorMode]);

  const summary = useMemo(
    () => ({
      products: items.length,
      units: items.reduce((sum, item) => sum + item.quantity, 0),
      value: items.reduce(
        (sum, item) => sum + item.quantity * item.sellingPrice,
        0
      ),
      lowStock: items.filter(
        (item) => item.quantity <= item.lowStockThreshold
      ).length,
    }),
    [items]
  );

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      `${item.productName} ${item.category} ${item.notes}`
        .toLowerCase()
        .includes(term)
    );
  }, [items, search]);

  function openCreate() {
    setActiveItem(null);
    setItemForm(EMPTY_ITEM_FORM);
    setEditorMode("create");
    setError(null);
  }

  function openEdit(item: MobInventoryItem) {
    setActiveItem(item);
    setItemForm({
      productName: item.productName,
      category: item.category,
      quantity: item.quantity,
      sellingPrice: item.sellingPrice,
      lowStockThreshold: item.lowStockThreshold,
      notes: item.notes,
      isArchived: item.isArchived,
    });
    setEditorMode("edit");
    setError(null);
  }

  function openAdjustment(
    item: MobInventoryItem,
    type: InventoryTransactionType = "stock-in"
  ) {
    setActiveItem(item);
    setAdjustmentForm({
      ...EMPTY_ADJUSTMENT,
      type,
      sellingPrice: item.sellingPrice,
    });
    setEditorMode("adjust");
    setError(null);
  }

  function closeEditor() {
    if (saving) return;
    setEditorMode(null);
    setActiveItem(null);
  }

  async function saveItem() {
    setSaving(true);
    setError(null);
    try {
      const isEditing = editorMode === "edit" && activeItem;
      const response = await fetch(
        isEditing
          ? `/api/admin/mob/inventory/${encodeURIComponent(activeItem.id)}`
          : "/api/admin/mob/inventory",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(itemForm),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.item) {
        throw new Error(data?.error || "Could not save stock item.");
      }
      setNotice(
        isEditing
          ? `${data.item.productName} updated.`
          : `${data.item.productName} added to inventory.`
      );
      setEditorMode(null);
      setActiveItem(null);
      await refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save stock item."
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveAdjustment() {
    if (!activeItem) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/mob/inventory/${encodeURIComponent(activeItem.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(adjustmentForm),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.item) {
        throw new Error(data?.error || "Could not update stock.");
      }
      setNotice(
        `${activeItem.productName}: ${adjustmentForm.type === "stock-in" ? "stock added" : "stock removed"}.`
      );
      setEditorMode(null);
      setActiveItem(null);
      await refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not update stock."
      );
    } finally {
      setSaving(false);
    }
  }

  async function importPhotoLogs(ids: string[]) {
    if (!ids.length) return;
    setImportingIds((current) => new Set([...current, ...ids]));
    setError(null);
    try {
      const response = await fetch("/api/admin/mob/inventory/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoLogIds: ids }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Could not import worker data.");
      }
      setNotice(
        `${data.imported || 0} worker record${data.imported === 1 ? "" : "s"} added to inventory.`
      );
      await refresh();
      if (ids.length === readyPhotoLogs.length) setView("stock");
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Could not import worker data."
      );
    } finally {
      setImportingIds((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

  const panelClass = isDark
    ? "border-white/10 bg-[#0d1410] text-white"
    : "border-slate-200 bg-white text-slate-950";
  const muted = isDark ? "text-white/45" : "text-slate-500";
  const inputClass = `min-h-12 w-full rounded-xl border px-3.5 text-base outline-none transition sm:text-sm ${
    isDark
      ? "border-white/10 bg-white/[0.055] text-white placeholder:text-white/30 focus:border-orange-400/60"
      : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
  }`;

  return (
    <main className="mx-auto w-full max-w-6xl pb-6">
      <section className="mb-5 flex items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-600">
            <PackageSearch className="h-3.5 w-3.5" />
            Main inventory
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] sm:text-3xl">
            Stock control
          </h1>
          <p className={`mt-1 text-sm ${muted}`}>
            Create stock or import completed worker records.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          aria-label="Create new stock"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-xs font-black text-white shadow-lg shadow-orange-500/20"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New stock</span>
        </button>
      </section>

      {error ? (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"
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

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Products",
            value: summary.products,
            icon: PackageSearch,
            color: "text-sky-500",
          },
          {
            label: "Units",
            value: summary.units,
            icon: PackagePlus,
            color: "text-emerald-500",
          },
          {
            label: "Stock value",
            value: formatMoney(summary.value),
            icon: WalletCards,
            color: "text-violet-500",
          },
          {
            label: "Low / out",
            value: summary.lowStock,
            icon: CircleAlert,
            color: "text-orange-500",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className={`rounded-2xl border p-4 shadow-sm ${panelClass}`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-extrabold ${muted}`}>
                {label}
              </span>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <div className="mt-2 truncate font-mono text-xl font-black">
              {loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : value}
            </div>
          </div>
        ))}
      </section>

      {readyPhotoLogs.length ? (
        <button
          type="button"
          onClick={() => setView("imports")}
          className={`mt-5 flex w-full items-center gap-3 rounded-2xl border p-4 text-left shadow-sm ${panelClass}`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black">
              {readyPhotoLogs.length} worker record
              {readyPhotoLogs.length === 1 ? "" : "s"} ready
            </span>
            <span className={`mt-0.5 block text-[11px] ${muted}`}>
              Review and add them to inventory
            </span>
          </span>
          <UploadCloud className="h-5 w-5 text-orange-500" />
        </button>
      ) : null}

      <section className={`mt-5 overflow-hidden rounded-2xl border ${panelClass}`}>
        <div
          className={`flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between ${
            isDark ? "border-white/10" : "border-slate-200"
          }`}
        >
          <div
            className={`grid grid-cols-3 rounded-xl p-1 ${
              isDark ? "bg-white/5" : "bg-slate-100"
            }`}
          >
            {[
              { key: "stock" as const, label: "Stock" },
              {
                key: "imports" as const,
                label: `Worker (${readyPhotoLogs.length})`,
              },
              { key: "history" as const, label: "History" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                className={`min-h-10 rounded-lg px-2 text-[11px] font-black ${
                  view === tab.key
                    ? isDark
                      ? "bg-white text-slate-950"
                      : "bg-white text-slate-950 shadow-sm"
                    : muted
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {view === "stock" ? (
            <div className="relative w-full sm:max-w-xs">
              <Search
                className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${muted}`}
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search inventory…"
                className={`${inputClass} min-h-10 pl-9`}
                aria-label="Search inventory"
              />
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className={`flex min-h-52 items-center justify-center gap-2 ${muted}`}>
            <LoaderCircle className="h-5 w-5 animate-spin" />
            <span className="text-sm font-bold">Loading inventory…</span>
          </div>
        ) : view === "stock" ? (
          filteredItems.length ? (
            <div
              className={`divide-y ${
                isDark ? "divide-white/10" : "divide-slate-100"
              }`}
            >
              {filteredItems.map((item) => {
                const isLow = item.quantity <= item.lowStockThreshold;
                return (
                  <article
                    key={item.id}
                    className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-black">
                          {item.productName}
                        </h3>
                        {isLow ? (
                          <span className="rounded-full bg-orange-500/10 px-2 py-1 text-[9px] font-black uppercase text-orange-600">
                            {item.quantity === 0 ? "Out" : "Low"}
                          </span>
                        ) : null}
                      </div>
                      <div className={`mt-1 text-[11px] ${muted}`}>
                        {item.category || "No category"} ·{" "}
                        {formatMoney(item.sellingPrice)} · Low at{" "}
                        {item.lowStockThreshold}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="mr-auto sm:mr-2 sm:text-right">
                        <div className="font-mono text-2xl font-black">
                          {item.quantity}
                        </div>
                        <div className={`text-[9px] font-bold ${muted}`}>
                          units
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openAdjustment(item, "stock-in")}
                        className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-[10px] font-black text-white"
                      >
                        <ArrowDownToLine className="h-3.5 w-3.5" />
                        In / Out
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border ${
                          isDark ? "border-white/10" : "border-slate-200"
                        }`}
                        aria-label={`Edit ${item.productName}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={`px-5 py-14 text-center text-xs ${muted}`}>
              No matching stock. Use <strong>New stock</strong> to create one.
            </div>
          )
        ) : view === "imports" ? (
          readyPhotoLogs.length ? (
            <>
              <div
                className={`flex items-center justify-between border-b px-4 py-3 ${
                  isDark ? "border-white/10" : "border-slate-100"
                }`}
              >
                <span className={`text-[11px] ${muted}`}>
                  Same product names merge automatically.
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void importPhotoLogs(readyPhotoLogs.map((item) => item.id))
                  }
                  disabled={importingIds.size > 0}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-3 text-[10px] font-black text-white disabled:opacity-50"
                >
                  {importingIds.size ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Add all ready
                </button>
              </div>
              <div
                className={`divide-y ${
                  isDark ? "divide-white/10" : "divide-slate-100"
                }`}
              >
                {readyPhotoLogs.map((record) => (
                  <article
                    key={record.id}
                    className="grid grid-cols-[64px_1fr] gap-3 p-3 sm:grid-cols-[72px_1fr_auto] sm:items-center"
                  >
                    <div className="h-16 w-16 overflow-hidden rounded-xl bg-slate-100 sm:h-[72px] sm:w-[72px]">
                      {record.imageDeleted ? (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <ImageOff className="h-5 w-5" />
                        </div>
                      ) : (
                        <img
                          src={record.thumbnailUrl}
                          alt={`Worker photo for ${record.productName}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-xs font-black">
                        {record.productName}
                      </h3>
                      <div className={`mt-1 text-[10px] ${muted}`}>
                        {record.transactionType === "stock-out"
                          ? "Stock Out"
                          : "Stock In"}{" "}
                        · {record.quantity || 0} units ·{" "}
                        {formatMoney(record.sellingPrice || 0)}
                      </div>
                      <div className={`mt-1 text-[9px] ${muted}`}>
                        {record.category || "No category"} ·{" "}
                        {formatDate(record.completedAt || record.updatedAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void importPhotoLogs([record.id])}
                      disabled={importingIds.has(record.id)}
                      className="col-span-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 text-[10px] font-black text-white disabled:opacity-50 sm:col-span-1"
                    >
                      {importingIds.has(record.id) ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <UploadCloud className="h-4 w-4" />
                      )}
                      Add to inventory
                    </button>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className={`px-5 py-14 text-center text-xs ${muted}`}>
              No completed worker records are waiting for import.
            </div>
          )
        ) : transactions.length ? (
          <div
            className={`divide-y ${
              isDark ? "divide-white/10" : "divide-slate-100"
            }`}
          >
            {transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    transaction.type === "stock-in"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-rose-500/10 text-rose-600"
                  }`}
                >
                  {transaction.type === "stock-in" ? (
                    <ArrowDownToLine className="h-4 w-4" />
                  ) : (
                    <ArrowUpFromLine className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-black">
                    {transaction.productName}
                  </span>
                  <span className={`mt-0.5 block text-[10px] ${muted}`}>
                    {formatDate(transaction.createdAt)} ·{" "}
                    {transaction.source === "photo-log"
                      ? "Worker photo"
                      : "Owner adjustment"}
                  </span>
                </span>
                <span className="text-right">
                  <span
                    className={`block font-mono text-sm font-black ${
                      transaction.type === "stock-in"
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {transaction.type === "stock-in" ? "+" : "-"}
                    {transaction.quantity}
                  </span>
                  <span className={`block text-[9px] ${muted}`}>
                    Balance {transaction.balanceAfter}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={`px-5 py-14 text-center text-xs ${muted}`}>
            Stock history will appear after the first transaction.
          </div>
        )}
      </section>

      {editorMode ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeEditor();
          }}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-editor-title"
            className={`max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] border shadow-2xl sm:max-w-xl sm:rounded-[28px] ${panelClass}`}
          >
            <div
              className={`sticky top-0 z-10 flex items-center justify-between border-b px-4 py-4 backdrop-blur-xl ${
                isDark
                  ? "border-white/10 bg-[#0d1410]/95"
                  : "border-slate-200 bg-white/95"
              }`}
            >
              <div>
                <h2 id="inventory-editor-title" className="text-base font-black">
                  {editorMode === "create"
                    ? "Create new stock"
                    : editorMode === "edit"
                      ? "Edit stock item"
                      : `Update ${activeItem?.productName || "stock"}`}
                </h2>
                <p className={`mt-0.5 text-[10px] ${muted}`}>
                  {editorMode === "adjust"
                    ? `Current balance: ${activeItem?.quantity || 0} units`
                    : "Category is optional."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className={`flex h-11 w-11 items-center justify-center rounded-full ${
                  isDark ? "bg-white/5" : "bg-slate-100"
                }`}
                aria-label="Close inventory editor"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {editorMode === "adjust" ? (
              <form
                className="grid gap-4 p-4 sm:p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveAdjustment();
                }}
              >
                <fieldset>
                  <legend className={`mb-2 text-xs font-bold ${muted}`}>
                    Movement
                  </legend>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {
                        value: "stock-in" as const,
                        label: "Stock In",
                        icon: ArrowDownToLine,
                        active: "border-emerald-500 bg-emerald-500 text-white",
                      },
                      {
                        value: "stock-out" as const,
                        label: "Stock Out",
                        icon: ArrowUpFromLine,
                        active: "border-rose-500 bg-rose-500 text-white",
                      },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setAdjustmentForm((current) => ({
                            ...current,
                            type: option.value,
                          }))
                        }
                        className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border text-sm font-black ${
                          adjustmentForm.type === option.value
                            ? option.active
                            : isDark
                              ? "border-white/10 bg-white/5"
                              : "border-slate-200"
                        }`}
                        aria-pressed={adjustmentForm.type === option.value}
                      >
                        <option.icon className="h-4 w-4" />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    <span className={`mb-1.5 block text-xs font-bold ${muted}`}>
                      Quantity
                    </span>
                    <input
                      required
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={adjustmentForm.quantity}
                      onChange={(event) =>
                        setAdjustmentForm((current) => ({
                          ...current,
                          quantity:
                            event.target.value === ""
                              ? ""
                              : Number(event.target.value),
                        }))
                      }
                      className={inputClass}
                    />
                  </label>
                  <label>
                    <span className={`mb-1.5 block text-xs font-bold ${muted}`}>
                      Selling price
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={adjustmentForm.sellingPrice}
                      onChange={(event) =>
                        setAdjustmentForm((current) => ({
                          ...current,
                          sellingPrice:
                            event.target.value === ""
                              ? ""
                              : Number(event.target.value),
                        }))
                      }
                      className={inputClass}
                    />
                  </label>
                </div>
                <label>
                  <span className={`mb-1.5 block text-xs font-bold ${muted}`}>
                    Transaction notes
                  </span>
                  <textarea
                    value={adjustmentForm.notes}
                    onChange={(event) =>
                      setAdjustmentForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    rows={3}
                    className={`${inputClass} min-h-24 py-3`}
                    placeholder="Supplier, sale, correction…"
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving || !adjustmentForm.quantity}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-orange-500 text-sm font-black text-white disabled:opacity-50"
                >
                  {saving ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Save transaction
                </button>
              </form>
            ) : (
              <form
                className="grid gap-4 p-4 sm:p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveItem();
                }}
              >
                <label>
                  <span className={`mb-1.5 block text-xs font-bold ${muted}`}>
                    Product name
                  </span>
                  <input
                    required
                    value={itemForm.productName}
                    onChange={(event) =>
                      setItemForm((current) => ({
                        ...current,
                        productName: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </label>
                <label>
                  <span className={`mb-1.5 block text-xs font-bold ${muted}`}>
                    Category <span className="font-medium">(optional)</span>
                  </span>
                  <input
                    value={itemForm.category}
                    onChange={(event) =>
                      setItemForm((current) => ({
                        ...current,
                        category: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder="e.g. Polo Shirt"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {editorMode === "create" ? (
                    <label>
                      <span className={`mb-1.5 block text-xs font-bold ${muted}`}>
                        Opening quantity
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={itemForm.quantity}
                        onChange={(event) =>
                          setItemForm((current) => ({
                            ...current,
                            quantity:
                              event.target.value === ""
                                ? ""
                                : Number(event.target.value),
                          }))
                        }
                        className={inputClass}
                      />
                    </label>
                  ) : null}
                  <label>
                    <span className={`mb-1.5 block text-xs font-bold ${muted}`}>
                      Selling price
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={itemForm.sellingPrice}
                      onChange={(event) =>
                        setItemForm((current) => ({
                          ...current,
                          sellingPrice:
                            event.target.value === ""
                              ? ""
                              : Number(event.target.value),
                        }))
                      }
                      className={inputClass}
                    />
                  </label>
                  <label>
                    <span className={`mb-1.5 block text-xs font-bold ${muted}`}>
                      Low-stock alert
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={itemForm.lowStockThreshold}
                      onChange={(event) =>
                        setItemForm((current) => ({
                          ...current,
                          lowStockThreshold:
                            event.target.value === ""
                              ? ""
                              : Number(event.target.value),
                        }))
                      }
                      className={inputClass}
                    />
                  </label>
                </div>
                <label>
                  <span className={`mb-1.5 block text-xs font-bold ${muted}`}>
                    Notes
                  </span>
                  <textarea
                    value={itemForm.notes}
                    onChange={(event) =>
                      setItemForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    rows={3}
                    className={`${inputClass} min-h-24 py-3`}
                  />
                </label>
                {editorMode === "edit" ? (
                  <label
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      isDark ? "border-white/10" : "border-slate-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={itemForm.isArchived}
                      onChange={(event) =>
                        setItemForm((current) => ({
                          ...current,
                          isArchived: event.target.checked,
                        }))
                      }
                      className="h-4 w-4"
                    />
                    <Archive className="h-4 w-4 text-slate-400" />
                    <span className="text-xs font-bold">
                      Archive this product
                    </span>
                  </label>
                ) : null}
                <button
                  type="submit"
                  disabled={saving || !itemForm.productName.trim()}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-orange-500 text-sm font-black text-white disabled:opacity-50"
                >
                  {saving ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {editorMode === "create" ? "Create stock" : "Save changes"}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {notice ? (
        <div
          role="status"
          className={`fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-[90] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl ${
            isDark
              ? "border-emerald-400/20 bg-[#122019] text-emerald-200"
              : "border-emerald-200 bg-white text-emerald-700"
          }`}
        >
          {notice}
        </div>
      ) : null}
    </main>
  );
}
