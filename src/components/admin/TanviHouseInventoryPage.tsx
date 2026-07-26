"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleGauge,
  House,
  LoaderCircle,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  ShoppingBasket,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type {
  HouseStockLevel,
  TanviHouseInventoryItem,
} from "@/lib/tanvi-house-inventory";

type InventoryView = "inventory" | "shopping";

type ItemDraft = {
  name: string;
  category: string;
  stockLevel: HouseStockLevel;
};

const API_PATH = "/api/admin/tanvi/house-inventory";
const CATEGORY_SUGGESTIONS = [
  "Bathroom",
  "Cleaning",
  "Kitchen",
  "Laundry",
  "Pantry",
  "Personal care",
  "Other",
];

const STOCK_META: Record<
  HouseStockLevel,
  { label: string; shortLabel: string; className: string; dotClassName: string }
> = {
  high: {
    label: "Plenty",
    shortLabel: "Plenty",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dotClassName: "bg-emerald-500",
  },
  medium: {
    label: "Getting low",
    shortLabel: "Medium",
    className: "border-amber-200 bg-amber-50 text-amber-900",
    dotClassName: "bg-amber-400",
  },
  low: {
    label: "Running low",
    shortLabel: "Low",
    className: "border-orange-200 bg-orange-50 text-orange-900",
    dotClassName: "bg-orange-500",
  },
  out: {
    label: "Out of stock",
    shortLabel: "Out",
    className: "border-rose-200 bg-rose-50 text-rose-800",
    dotClassName: "bg-rose-500",
  },
};

const CATEGORY_STYLES = [
  "border-violet-200 bg-violet-50 text-violet-800",
  "border-cyan-200 bg-cyan-50 text-cyan-800",
  "border-emerald-200 bg-emerald-50 text-emerald-800",
  "border-amber-200 bg-amber-50 text-amber-900",
  "border-pink-200 bg-pink-50 text-pink-800",
];

function categoryStyle(category: string) {
  const score = Array.from(category).reduce(
    (total, character) => total + character.charCodeAt(0),
    0
  );
  return CATEGORY_STYLES[score % CATEGORY_STYLES.length];
}

function sortItems(items: TanviHouseInventoryItem[]) {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition ${
          checked
            ? "border-violet-600 bg-violet-600 text-white"
            : "border-slate-300 bg-white text-transparent"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="sr-only"
        />
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
      {label}
    </label>
  );
}

export default function TanviHouseInventoryPage() {
  const [items, setItems] = useState<TanviHouseInventoryItem[]>([]);
  const [view, setView] = useState<InventoryView>("inventory");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDraft>({
    name: "",
    category: "Bathroom",
    stockLevel: "high",
  });
  const [editDraft, setEditDraft] = useState<Pick<ItemDraft, "name" | "category">>({
    name: "",
    category: "",
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadItems() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_PATH, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data?.items)) {
        throw new Error(data?.error || "Could not load the house inventory.");
      }
      setItems(data.items as TanviHouseInventoryItem[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load the house inventory."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("en");
    if (!term) return items;
    return items.filter((item) =>
      `${item.name} ${item.category}`.toLocaleLowerCase("en").includes(term)
    );
  }, [items, search]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, TanviHouseInventoryItem[]>();
    filteredItems.forEach((item) => {
      const category = item.category || "Other";
      groups.set(category, [...(groups.get(category) || []), item]);
    });
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, categoryItems]) => ({
        category,
        items: sortItems(categoryItems),
      }));
  }, [filteredItems]);

  const shoppingItems = useMemo(
    () => sortItems(filteredItems.filter((item) => item.needNow)),
    [filteredItems]
  );
  const neededItems = shoppingItems.filter((item) => !item.purchased);
  const purchasedItems = shoppingItems.filter((item) => item.purchased);
  const needsNowCount = items.filter((item) => item.needNow && !item.purchased).length;
  const lowCount = items.filter(
    (item) => item.stockLevel === "low" || item.stockLevel === "out"
  ).length;

  function clearMessages() {
    setNotice(null);
    setError(null);
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    setSavingId("new");
    try {
      const response = await fetch(API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.item) {
        throw new Error(data?.error || "Could not add this item.");
      }
      setItems((current) => [data.item as TanviHouseInventoryItem, ...current]);
      setDraft((current) => ({ ...current, name: "", stockLevel: "high" }));
      setShowAddForm(false);
      setNotice(`${data.item.name} added.`);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Could not add this item."
      );
    } finally {
      setSavingId(null);
    }
  }

  async function patchItem(
    item: TanviHouseInventoryItem,
    patch: Partial<
      Pick<
        TanviHouseInventoryItem,
        "name" | "category" | "stockLevel" | "needNow" | "purchased"
      >
    >,
    successMessage?: string
  ) {
    clearMessages();
    const previousItem = items.find((entry) => entry.id === item.id) || item;
    const optimisticPatch = {
      ...patch,
      ...(patch.needNow !== undefined ? { purchased: false } : {}),
    };
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, ...optimisticPatch } : entry
      )
    );
    setSavingId(item.id);
    try {
      const response = await fetch(`${API_PATH}/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.item) {
        throw new Error(data?.error || "Could not update this item.");
      }
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? (data.item as TanviHouseInventoryItem)
            : entry
        )
      );
      if (successMessage) setNotice(successMessage);
    } catch (updateError) {
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? previousItem : entry
        )
      );
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update this item."
      );
    } finally {
      setSavingId(null);
    }
  }

  function beginEditing(item: TanviHouseInventoryItem) {
    setEditingId(item.id);
    setEditDraft({ name: item.name, category: item.category });
  }

  function saveEdit(item: TanviHouseInventoryItem) {
    void patchItem(item, editDraft, `${editDraft.name.trim()} updated.`);
    setEditingId(null);
  }

  async function deleteItem(item: TanviHouseInventoryItem) {
    if (!window.confirm(`Delete “${item.name}” from the house inventory?`)) return;
    clearMessages();
    setSavingId(item.id);
    try {
      const response = await fetch(`${API_PATH}/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Could not delete this item.");
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setNotice(`${item.name} deleted.`);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete this item."
      );
    } finally {
      setSavingId(null);
    }
  }

  async function putAwayPurchased() {
    if (!purchasedItems.length) return;
    clearMessages();
    setSavingId("put-away");
    try {
      const response = await fetch(API_PATH, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "put-away-purchased" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Could not put away bought items.");
      }
      setItems((current) =>
        current.map((item) =>
          item.purchased
            ? { ...item, stockLevel: "high", needNow: false, purchased: false }
            : item
        )
      );
      setNotice(
        `${data.updated || purchasedItems.length} bought ${
          (data.updated || purchasedItems.length) === 1 ? "item" : "items"
        } put away.`
      );
    } catch (putAwayError) {
      setError(
        putAwayError instanceof Error
          ? putAwayError.message
          : "Could not put away bought items."
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_46px_rgba(15,23,42,0.08)]">
        <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700">
              <House className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                Tanvi’s home
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                House inventory
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                See what is at home and send anything needed straight to the shopping list.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:min-w-[25rem]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                Items
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-950">{items.length}</p>
            </div>
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-orange-700">
                Low / out
              </p>
              <p className="mt-1 text-xl font-semibold text-orange-950">{lowCount}</p>
            </div>
            <button
              type="button"
              onClick={() => setView("shopping")}
              className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-left transition hover:bg-violet-100"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-violet-700">
                To buy
              </p>
              <p className="mt-1 text-xl font-semibold text-violet-950">{needsNowCount}</p>
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_46px_rgba(15,23,42,0.08)]">
        <div className="border-b border-slate-200 p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setView("inventory")}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  view === "inventory"
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <PackageOpen className="h-4 w-4" />
                Inventory
              </button>
              <button
                type="button"
                onClick={() => setView("shopping")}
                className={`relative inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  view === "shopping"
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <ShoppingBasket className="h-4 w-4" />
                Shopping list
                {needsNowCount ? (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-violet-600 px-1 text-[10px] text-white">
                    {needsNowCount}
                  </span>
                ) : null}
              </button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:min-w-64">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find an item or category"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </label>
              <button
                type="button"
                onClick={() => {
                  setView("inventory");
                  setShowAddForm((current) => !current);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
              >
                {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {showAddForm ? "Close" : "Add item"}
              </button>
            </div>
          </div>
        </div>

        {notice ? (
          <div className="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 sm:mx-4">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {notice}
          </div>
        ) : null}
        {error ? (
          <div className="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 sm:mx-4">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {showAddForm && view === "inventory" ? (
          <form
            onSubmit={createItem}
            className="m-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-3 sm:m-4 sm:p-4"
          >
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-violet-700" />
              <h2 className="text-sm font-semibold text-violet-950">Add a household item</h2>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_12rem_auto] md:items-end">
              <label className="text-xs font-semibold text-slate-600">
                Item name
                <input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="e.g. Hand soap"
                  autoFocus
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Category
                <input
                  value={draft.category}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  list="house-category-suggestions"
                  placeholder="e.g. Bathroom"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Stock
                <select
                  value={draft.stockLevel}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      stockLevel: event.target.value as HouseStockLevel,
                    }))
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                >
                  {Object.entries(STOCK_META).map(([level, meta]) => (
                    <option key={level} value={level}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={savingId === "new" || !draft.name.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {savingId === "new" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add
              </button>
            </div>
          </form>
        ) : null}

        <div className="p-3 sm:p-4">
          {loading ? (
            <div className="grid min-h-64 place-items-center text-center">
              <div>
                <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-violet-600" />
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  Loading the house inventory…
                </p>
              </div>
            </div>
          ) : view === "inventory" ? (
            groupedItems.length ? (
              <div className="space-y-4">
                {groupedItems.map((group) => (
                  <section
                    key={group.category}
                    className="overflow-hidden rounded-2xl border border-slate-200"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-4">
                      <div className="flex items-center gap-2">
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                        <span
                          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${categoryStyle(
                            group.category
                          )}`}
                        >
                          {group.category}
                        </span>
                        <span className="text-xs text-slate-400">
                          {group.items.length}
                        </span>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {group.items.map((item) => {
                        const stock = STOCK_META[item.stockLevel];
                        const editing = editingId === item.id;
                        return (
                          <article
                            key={item.id}
                            className={`grid gap-3 px-3 py-3 transition sm:grid-cols-[minmax(0,1fr)_11rem_9rem_auto] sm:items-center sm:px-4 ${
                              item.needNow ? "bg-violet-50/40" : "bg-white"
                            }`}
                          >
                            {editing ? (
                              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                                <input
                                  value={editDraft.name}
                                  onChange={(event) =>
                                    setEditDraft((current) => ({
                                      ...current,
                                      name: event.target.value,
                                    }))
                                  }
                                  aria-label="Item name"
                                  className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
                                />
                                <input
                                  value={editDraft.category}
                                  onChange={(event) =>
                                    setEditDraft((current) => ({
                                      ...current,
                                      category: event.target.value,
                                    }))
                                  }
                                  list="house-category-suggestions"
                                  aria-label="Category"
                                  className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
                                />
                              </div>
                            ) : (
                              <div className="min-w-0">
                                <p
                                  className={`truncate text-sm font-semibold text-slate-950 ${
                                    item.purchased ? "line-through opacity-60" : ""
                                  }`}
                                >
                                  {item.name}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-400 sm:hidden">
                                  {item.category}
                                </p>
                              </div>
                            )}

                            <label className="relative">
                              <span className="sr-only">Stock level for {item.name}</span>
                              <span
                                className={`pointer-events-none absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${stock.dotClassName}`}
                              />
                              <select
                                value={item.stockLevel}
                                disabled={savingId === item.id}
                                onChange={(event) =>
                                  void patchItem(item, {
                                    stockLevel: event.target.value as HouseStockLevel,
                                  })
                                }
                                className={`w-full appearance-none rounded-xl border py-2 pl-7 pr-8 text-xs font-semibold outline-none ${stock.className}`}
                              >
                                {Object.entries(STOCK_META).map(([level, meta]) => (
                                  <option key={level} value={level}>
                                    {meta.label}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                            </label>

                            <Checkbox
                              checked={item.needNow}
                              disabled={savingId === item.id}
                              onChange={(checked) =>
                                void patchItem(
                                  item,
                                  { needNow: checked },
                                  checked
                                    ? `${item.name} added to the shopping list.`
                                    : `${item.name} removed from the shopping list.`
                                )
                              }
                              label="Need now"
                            />

                            <div className="flex items-center justify-end gap-1">
                              {editing ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => saveEdit(item)}
                                    disabled={!editDraft.name.trim()}
                                    aria-label={`Save ${item.name}`}
                                    className="grid h-9 w-9 place-items-center rounded-xl bg-violet-600 text-white disabled:opacity-50"
                                  >
                                    <Check className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingId(null)}
                                    aria-label="Cancel editing"
                                    className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => beginEditing(item)}
                                  aria-label={`Edit ${item.name}`}
                                  className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void deleteItem(item)}
                                disabled={savingId === item.id}
                                aria-label={`Delete ${item.name}`}
                                className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                              >
                                {savingId === item.id ? (
                                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <EmptyState
                title={search ? "No matching items" : "Your house inventory is ready"}
                description={
                  search
                    ? "Try another item name or category."
                    : "Add the first household item, choose its stock level, and it will be organised by category."
                }
                action={
                  search
                    ? () => setSearch("")
                    : () => setShowAddForm(true)
                }
                actionLabel={search ? "Clear search" : "Add first item"}
              />
            )
          ) : shoppingItems.length ? (
            <div className="mx-auto max-w-4xl space-y-5">
              <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShoppingBasket className="h-5 w-5 text-violet-700" />
                      <h2 className="font-semibold text-slate-950">
                        Ready for shopping
                      </h2>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      Tick each item as you buy it. Everything updates instantly.
                    </p>
                  </div>
                  {purchasedItems.length ? (
                    <button
                      type="button"
                      onClick={() => void putAwayPurchased()}
                      disabled={savingId === "put-away"}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {savingId === "put-away" ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      Put bought items away
                    </button>
                  ) : null}
                </div>
              </div>

              {neededItems.length ? (
                <ShoppingGroup
                  title="Still to buy"
                  items={neededItems}
                  savingId={savingId}
                  onToggle={(item) =>
                    void patchItem(item, { purchased: true }, `${item.name} marked as bought.`)
                  }
                  onRemove={(item) =>
                    void patchItem(
                      item,
                      { needNow: false },
                      `${item.name} removed from the shopping list.`
                    )
                  }
                />
              ) : null}

              {purchasedItems.length ? (
                <ShoppingGroup
                  title="Bought"
                  items={purchasedItems}
                  savingId={savingId}
                  purchased
                  onToggle={(item) => void patchItem(item, { purchased: false })}
                  onRemove={(item) =>
                    void patchItem(item, { needNow: false })
                  }
                />
              ) : null}
            </div>
          ) : (
            <EmptyState
              title={search ? "No matching shopping items" : "Nothing to buy right now"}
              description={
                search
                  ? "Clear the search to see the rest of the shopping list."
                  : "Go to Inventory and tick “Need now” beside any household item."
              }
              action={search ? () => setSearch("") : () => setView("inventory")}
              actionLabel={search ? "Clear search" : "Open inventory"}
            />
          )}
        </div>
      </div>
      <datalist id="house-category-suggestions">
        {CATEGORY_SUGGESTIONS.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
    </section>
  );
}

function EmptyState({
  title,
  description,
  action,
  actionLabel,
}: {
  title: string;
  description: string;
  action: () => void;
  actionLabel: string;
}) {
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
      <div>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-violet-600 shadow-sm">
          <CircleGauge className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
          {description}
        </p>
        <button
          type="button"
          onClick={action}
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function ShoppingGroup({
  title,
  items,
  purchased = false,
  savingId,
  onToggle,
  onRemove,
}: {
  title: string;
  items: TanviHouseInventoryItem[];
  purchased?: boolean;
  savingId: string | null;
  onToggle: (item: TanviHouseInventoryItem) => void;
  onRemove: (item: TanviHouseInventoryItem) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 shadow-sm">
          {items.length}
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((item) => {
          const stock = STOCK_META[item.stockLevel];
          return (
            <article
              key={item.id}
              className={`flex items-center gap-3 px-3 py-3.5 sm:px-4 ${
                purchased ? "bg-emerald-50/40" : "bg-white"
              }`}
            >
              <Checkbox
                checked={item.purchased}
                disabled={savingId === item.id}
                onChange={() => onToggle(item)}
                label=""
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm font-semibold text-slate-950 ${
                    purchased ? "line-through opacity-60" : ""
                  }`}
                >
                  {item.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {item.category}
                </p>
              </div>
              <span
                className={`hidden rounded-lg border px-2 py-1 text-[11px] font-semibold sm:inline-flex ${stock.className}`}
              >
                {stock.shortLabel}
              </span>
              <button
                type="button"
                onClick={() => onRemove(item)}
                disabled={savingId === item.id}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Remove</span>
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
