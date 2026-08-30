"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CircleDollarSign,
  House,
  LoaderCircle,
  PackageCheck,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  ShoppingBasket,
  ShoppingCart,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import type {
  HouseShoppingStatus,
  HouseStockLevel,
  TanviHouseInventoryItem,
} from "@/lib/tanvi-house-inventory";

type InventoryView = "inventory" | "now" | "later";
type ItemDraft = {
  name: string;
  category: string;
  stockQuantity: string;
  stockLevel: HouseStockLevel;
  shoppingStatus: HouseShoppingStatus;
  buyQuantity: string;
  budgetMin: string;
  budgetMax: string;
};

const API_PATH = "/api/admin/tanvi/house-inventory";
const PAGE_SIZE = 40;
const CATEGORY_SUGGESTIONS = [
  "Bathroom",
  "Breakfast",
  "Cleaning",
  "Dairy & eggs",
  "Fruit",
  "Kitchen",
  "Laundry",
  "Meat & protein",
  "Pantry",
  "Personal care",
  "Vegetables",
  "Other",
];

const STOCK_META: Record<
  HouseStockLevel,
  { label: string; className: string; dotClassName: string }
> = {
  unknown: {
    label: "Not counted",
    className: "border-slate-200 bg-slate-50 text-slate-600",
    dotClassName: "bg-slate-400",
  },
  high: {
    label: "Plenty",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dotClassName: "bg-emerald-500",
  },
  medium: {
    label: "Getting low",
    className: "border-amber-200 bg-amber-50 text-amber-900",
    dotClassName: "bg-amber-400",
  },
  low: {
    label: "Low",
    className: "border-orange-200 bg-orange-50 text-orange-900",
    dotClassName: "bg-orange-500",
  },
  out: {
    label: "Out",
    className: "border-rose-200 bg-rose-50 text-rose-800",
    dotClassName: "bg-rose-500",
  },
};

const SHOPPING_LABELS: Record<HouseShoppingStatus, string> = {
  none: "Inventory only",
  later: "Buy later",
  now: "Buy now",
  bought: "Bought",
};

function blankDraft(status: HouseShoppingStatus = "none"): ItemDraft {
  return {
    name: "",
    category: "Kitchen",
    stockQuantity: "",
    stockLevel: "unknown",
    shoppingStatus: status,
    buyQuantity: "",
    budgetMin: "",
    budgetMax: "",
  };
}

function draftFromItem(item: TanviHouseInventoryItem): ItemDraft {
  return {
    name: item.name,
    category: item.category,
    stockQuantity: item.stockQuantity,
    stockLevel: item.stockLevel,
    shoppingStatus: item.shoppingStatus,
    buyQuantity: item.buyQuantity,
    budgetMin: item.budgetMin === null ? "" : String(item.budgetMin),
    budgetMax:
      item.budgetMax === null || item.budgetMax === item.budgetMin
        ? ""
        : String(item.budgetMax),
  };
}

function payloadFromDraft(draft: ItemDraft) {
  return {
    ...draft,
    budgetMin: draft.budgetMin === "" ? null : Number(draft.budgetMin),
    budgetMax:
      draft.budgetMax === ""
        ? draft.budgetMin === ""
          ? null
          : Number(draft.budgetMin)
        : Number(draft.budgetMax),
  };
}

function formatMoney(min: number | null, max: number | null) {
  if (min === null && max === null) return "No price";
  const first = Math.round(min ?? max ?? 0).toLocaleString("en-MU");
  const last = Math.round(max ?? min ?? 0).toLocaleString("en-MU");
  return first === last ? `Rs ${first}` : `Rs ${first}–${last}`;
}

function sumBudget(items: TanviHouseInventoryItem[]) {
  return items.reduce(
    (total, item) => ({
      min: total.min + (item.budgetMin ?? item.budgetMax ?? 0),
      max: total.max + (item.budgetMax ?? item.budgetMin ?? 0),
    }),
    { min: 0, max: 0 }
  );
}

function sortItems(items: TanviHouseInventoryItem[]) {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

export default function TanviHouseInventoryPage() {
  const [items, setItems] = useState<TanviHouseInventoryItem[]>([]);
  const [view, setView] = useState<InventoryView>("inventory");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editingItem, setEditingItem] = useState<TanviHouseInventoryItem | null>(null);
  const [draft, setDraft] = useState<ItemDraft>(blankDraft());
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

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [view, search, categoryFilter]);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const categories = useMemo(
    () => [...new Set(items.map((item) => item.category))].sort(),
    [items]
  );
  const scopedItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("en");
    return sortItems(
      items.filter((item) => {
        if (view === "now" && !["now", "bought"].includes(item.shoppingStatus)) {
          return false;
        }
        if (view === "later" && item.shoppingStatus !== "later") return false;
        if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
        if (!term) return true;
        return `${item.name} ${item.category} ${item.buyQuantity}`
          .toLocaleLowerCase("en")
          .includes(term);
      })
    );
  }, [items, view, categoryFilter, search]);
  const visibleItems = scopedItems.slice(0, visibleCount);

  const lowCount = items.filter((item) => ["low", "out"].includes(item.stockLevel)).length;
  const nowCount = items.filter((item) => item.shoppingStatus === "now").length;
  const laterCount = items.filter((item) => item.shoppingStatus === "later").length;
  const boughtItems = items.filter((item) => item.shoppingStatus === "bought");
  const activeBudget = sumBudget(
    items.filter((item) => ["now", "bought"].includes(item.shoppingStatus))
  );

  function clearMessages() {
    setNotice(null);
    setError(null);
  }

  function openAdd() {
    const status = view === "now" ? "now" : view === "later" ? "later" : "none";
    setEditingItem(null);
    setDraft(blankDraft(status));
    setFormMode("add");
    clearMessages();
  }

  function openEdit(item: TanviHouseInventoryItem) {
    setEditingItem(item);
    setDraft(draftFromItem(item));
    setFormMode("edit");
    clearMessages();
  }

  async function saveForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    const isEditing = formMode === "edit" && editingItem;
    setSavingId(isEditing ? editingItem.id : "new");
    try {
      const response = await fetch(
        isEditing ? `${API_PATH}/${encodeURIComponent(editingItem.id)}` : API_PATH,
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadFromDraft(draft)),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.item) {
        throw new Error(data?.error || "Could not save this item.");
      }
      const savedItem = data.item as TanviHouseInventoryItem;
      setItems((current) =>
        isEditing
          ? current.map((item) => (item.id === savedItem.id ? savedItem : item))
          : [savedItem, ...current]
      );
      setFormMode(null);
      setEditingItem(null);
      setNotice(`${savedItem.name} ${isEditing ? "updated" : "added"}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this item.");
    } finally {
      setSavingId(null);
    }
  }

  async function patchItem(
    item: TanviHouseInventoryItem,
    patch: Partial<TanviHouseInventoryItem>,
    successMessage?: string
  ) {
    clearMessages();
    const previousItem = item;
    setItems((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, ...patch } : entry))
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
        current.map((entry) => entry.id === item.id ? data.item as TanviHouseInventoryItem : entry)
      );
      if (successMessage) setNotice(successMessage);
    } catch (updateError) {
      setItems((current) =>
        current.map((entry) => entry.id === item.id ? previousItem : entry)
      );
      setError(updateError instanceof Error ? updateError.message : "Could not update this item.");
    } finally {
      setSavingId(null);
    }
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
      if (!response.ok) throw new Error(data?.error || "Could not delete this item.");
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setNotice(`${item.name} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete this item.");
    } finally {
      setSavingId(null);
    }
  }

  async function putAwayPurchased() {
    if (!boughtItems.length) return;
    clearMessages();
    setSavingId("put-away");
    try {
      const response = await fetch(API_PATH, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "put-away-purchased" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Could not restock bought items.");
      setItems((current) =>
        current.map((item) => item.shoppingStatus === "bought"
          ? {
              ...item,
              shoppingStatus: "none",
              stockLevel: "high",
              stockQuantity: item.buyQuantity || item.stockQuantity,
              lastBoughtAt: new Date().toISOString(),
            }
          : item)
      );
      setNotice(`${data.updated || boughtItems.length} bought item${(data.updated || boughtItems.length) === 1 ? "" : "s"} moved into inventory.`);
      setView("inventory");
    } catch (putAwayError) {
      setError(putAwayError instanceof Error ? putAwayError.message : "Could not restock bought items.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_16px_46px_rgba(15,23,42,0.08)]">
        <header className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_right,_rgba(139,92,246,0.13),_transparent_42%)] p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white">
                <House className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Tanvi’s home</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">House inventory</h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                  Current stock, shopping plans and prices stay together. Bought items only move after you restock them.
                </p>
              </div>
            </div>
            <button type="button" onClick={openAdd} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700">
              <Plus className="h-4 w-4" /> Add item
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-5">
            <SummaryCard label="Inventory items" value={items.length} icon={PackageOpen} tone="slate" />
            <SummaryCard label="Low / out" value={lowCount} icon={AlertCircle} tone="rose" />
            <SummaryCard label="Buy now" value={nowCount} icon={ShoppingCart} tone="violet" />
            <SummaryCard label="Buy later" value={laterCount} icon={ShoppingBasket} tone="amber" />
            <SummaryCard label="Buy now budget" value={formatMoney(activeBudget.min, activeBudget.max)} icon={WalletCards} tone="emerald" wide />
          </div>
        </header>

        <div className="p-3 sm:p-4">
          <nav className="grid grid-cols-3 rounded-2xl bg-slate-100 p-1" aria-label="House inventory sections">
            <ViewButton active={view === "inventory"} onClick={() => setView("inventory")} label="Inventory" count={items.length} />
            <ViewButton active={view === "now"} onClick={() => setView("now")} label="Buy now" count={nowCount + boughtItems.length} />
            <ViewButton active={view === "later"} onClick={() => setView("later")} label="Buy later" count={laterCount} />
          </nav>

          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_13rem]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item, category or quantity…" className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" />
            </label>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter by category" className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-violet-400">
              <option value="all">All categories</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>

          {notice ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
            </div>
          ) : null}
          {error ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          ) : null}

          <div className="mt-4">
            {loading ? (
              <div className="grid min-h-72 place-items-center text-center">
                <LoaderCircle className="h-7 w-7 animate-spin text-violet-600" />
              </div>
            ) : !scopedItems.length ? (
              <EmptyState
                title={search || categoryFilter !== "all" ? "No matching items" : view === "inventory" ? "No inventory items yet" : view === "later" ? "Nothing planned for later" : "Nothing to buy now"}
                description={search || categoryFilter !== "all" ? "Clear the filters or try another search." : "Add a new item or update an existing inventory item’s shopping plan."}
                action={() => search || categoryFilter !== "all" ? (setSearch(""), setCategoryFilter("all")) : openAdd()}
                actionLabel={search || categoryFilter !== "all" ? "Clear filters" : "Add item"}
              />
            ) : view === "inventory" ? (
              <InventoryList items={visibleItems} savingId={savingId} onEdit={openEdit} onDelete={deleteItem} onStatus={(item, shoppingStatus) => void patchItem(item, { shoppingStatus }, `${item.name} moved to ${SHOPPING_LABELS[shoppingStatus].toLowerCase()}.`)} />
            ) : (
              <ShoppingList
                mode={view}
                items={visibleItems}
                savingId={savingId}
                onEdit={openEdit}
                onStatus={(item, shoppingStatus) => void patchItem(item, { shoppingStatus }, `${item.name} moved to ${SHOPPING_LABELS[shoppingStatus].toLowerCase()}.`)}
                onPutAway={() => void putAwayPurchased()}
                puttingAway={savingId === "put-away"}
              />
            )}

            {scopedItems.length ? (
              <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 sm:flex-row">
                <span>Showing {Math.min(visibleCount, scopedItems.length)} of {scopedItems.length}</span>
                {visibleCount < scopedItems.length ? (
                  <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-100">Load {Math.min(PAGE_SIZE, scopedItems.length - visibleCount)} more</button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {formMode ? (
        <ItemFormModal
          mode={formMode}
          draft={draft}
          saving={savingId === "new" || savingId === editingItem?.id}
          onChange={setDraft}
          onSubmit={saveForm}
          onClose={() => { setFormMode(null); setEditingItem(null); }}
        />
      ) : null}

      <datalist id="house-category-suggestions">
        {CATEGORY_SUGGESTIONS.map((category) => <option key={category} value={category} />)}
      </datalist>
    </section>
  );
}

function SummaryCard({ label, value, icon: Icon, tone, wide = false }: {
  label: string;
  value: number | string;
  icon: typeof PackageOpen;
  tone: "slate" | "rose" | "violet" | "amber" | "emerald";
  wide?: boolean;
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    rose: "bg-rose-100 text-rose-700",
    violet: "bg-violet-100 text-violet-700",
    amber: "bg-amber-100 text-amber-800",
    emerald: "bg-emerald-100 text-emerald-700",
  };
  return (
    <div className={`rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm ${wide ? "col-span-2 lg:col-span-1" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-2 truncate text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function ViewButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl px-1 text-xs font-bold transition sm:gap-2 sm:px-2 sm:text-sm ${active ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
      <span className="whitespace-nowrap">{label}</span><span className={`shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] sm:px-2 sm:text-[11px] ${active ? "bg-violet-100 text-violet-700" : "bg-slate-200 text-slate-500"}`}>{count}</span>
    </button>
  );
}

function StockBadge({ level }: { level: HouseStockLevel }) {
  const stock = STOCK_META[level];
  return <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-bold ${stock.className}`}><span className={`h-1.5 w-1.5 rounded-full ${stock.dotClassName}`} />{stock.label}</span>;
}

function InventoryList({ items, savingId, onEdit, onDelete, onStatus }: {
  items: TanviHouseInventoryItem[];
  savingId: string | null;
  onEdit: (item: TanviHouseInventoryItem) => void;
  onDelete: (item: TanviHouseInventoryItem) => void;
  onStatus: (item: TanviHouseInventoryItem, status: HouseShoppingStatus) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(9rem,0.8fr)_minmax(10rem,0.9fr)_minmax(10rem,0.8fr)_auto] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-400 lg:grid">
        <span>Item</span><span>Actual inventory</span><span>Planned purchase</span><span>Shopping plan</span><span>Update</span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((item) => (
          <article key={item.id} className="grid gap-3 bg-white px-3 py-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(9rem,0.8fr)_minmax(10rem,0.9fr)_minmax(10rem,0.8fr)_auto] lg:items-center lg:px-4">
            <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-950">{item.name}</p><p className="mt-0.5 text-xs text-slate-400">{item.category}</p></div>
            <div className="flex items-center justify-between gap-2 lg:block"><span className="text-[11px] font-bold uppercase text-slate-400 lg:hidden">In stock</span><div><p className="text-sm font-semibold text-slate-800">{item.stockQuantity || "Not counted"}</p><div className="mt-1"><StockBadge level={item.stockLevel} /></div></div></div>
            <div className="flex items-center justify-between gap-2 lg:block"><span className="text-[11px] font-bold uppercase text-slate-400 lg:hidden">To purchase</span><div><p className="text-sm font-semibold text-slate-800">{item.buyQuantity || "Not set"}</p><p className="mt-0.5 text-xs font-bold text-emerald-700">{formatMoney(item.budgetMin, item.budgetMax)}</p></div></div>
            <select value={item.shoppingStatus} disabled={savingId === item.id} onChange={(event) => onStatus(item, event.target.value as HouseShoppingStatus)} aria-label={`Shopping plan for ${item.name}`} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-violet-400 disabled:opacity-50">
              <option value="none">Inventory only</option><option value="later">Buy later</option><option value="now">Buy now</option>{item.shoppingStatus === "bought" ? <option value="bought">Bought</option> : null}
            </select>
            <div className="flex items-center justify-end gap-1">
              <button type="button" onClick={() => onEdit(item)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" /> Edit</button>
              <button type="button" onClick={() => void onDelete(item)} disabled={savingId === item.id} aria-label={`Delete ${item.name}`} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">{savingId === item.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ShoppingList({ mode, items, savingId, onEdit, onStatus, onPutAway, puttingAway }: {
  mode: "now" | "later";
  items: TanviHouseInventoryItem[];
  savingId: string | null;
  onEdit: (item: TanviHouseInventoryItem) => void;
  onStatus: (item: TanviHouseInventoryItem, status: HouseShoppingStatus) => void;
  onPutAway: () => void;
  puttingAway: boolean;
}) {
  const pending = items.filter((item) => item.shoppingStatus !== "bought");
  const bought = items.filter((item) => item.shoppingStatus === "bought");
  const budget = sumBudget(pending);
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-4 ${mode === "now" ? "border-violet-200 bg-violet-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2">{mode === "now" ? <ShoppingCart className="h-5 w-5 text-violet-700" /> : <ShoppingBasket className="h-5 w-5 text-amber-700" />}<h2 className="font-bold text-slate-950">{mode === "now" ? "Ready for shopping" : "Things to buy later"}</h2></div><p className="mt-1 text-sm text-slate-600">{mode === "now" ? "Tick items as you buy them. They stay here until you move them into inventory." : "Plan future purchases without mixing them into today’s list."}</p></div>
          <div className="rounded-xl bg-white px-4 py-2.5 text-right shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Planned budget</p><p className="mt-0.5 font-bold text-slate-950">{formatMoney(budget.min, budget.max)}</p></div>
        </div>
      </div>

      {pending.length ? <ShoppingGroup title={mode === "now" ? "Still to buy" : "Saved for later"} items={pending} mode={mode} savingId={savingId} onEdit={onEdit} onStatus={onStatus} /> : null}
      {mode === "now" && bought.length ? (
        <section className="overflow-hidden rounded-2xl border border-emerald-200">
          <div className="flex flex-col gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-bold text-emerald-950">Bought · {bought.length}</h3><p className="mt-0.5 text-xs text-emerald-700">Review these before updating your home stock.</p></div><button type="button" onClick={onPutAway} disabled={puttingAway} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{puttingAway ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}Move bought to inventory</button></div>
          <ShoppingRows items={bought} mode="now" savingId={savingId} onEdit={onEdit} onStatus={onStatus} bought />
        </section>
      ) : null}
    </div>
  );
}

function ShoppingGroup({ title, items, mode, savingId, onEdit, onStatus }: {
  title: string;
  items: TanviHouseInventoryItem[];
  mode: "now" | "later";
  savingId: string | null;
  onEdit: (item: TanviHouseInventoryItem) => void;
  onStatus: (item: TanviHouseInventoryItem, status: HouseShoppingStatus) => void;
}) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200"><div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="text-sm font-bold text-slate-800">{title}</h3><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-500 shadow-sm">{items.length}</span></div><ShoppingRows items={items} mode={mode} savingId={savingId} onEdit={onEdit} onStatus={onStatus} /></section>;
}

function ShoppingRows({ items, mode, savingId, onEdit, onStatus, bought = false }: {
  items: TanviHouseInventoryItem[];
  mode: "now" | "later";
  savingId: string | null;
  onEdit: (item: TanviHouseInventoryItem) => void;
  onStatus: (item: TanviHouseInventoryItem, status: HouseShoppingStatus) => void;
  bought?: boolean;
}) {
  return <div className="divide-y divide-slate-100">{items.map((item) => <article key={item.id} className={`grid gap-3 px-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)_8rem_8rem_auto] sm:items-center sm:px-4 ${bought ? "bg-emerald-50/40" : "bg-white"}`}>
    {mode === "now" ? <button type="button" onClick={() => onStatus(item, bought ? "now" : "bought")} disabled={savingId === item.id} aria-label={bought ? `Mark ${item.name} as not bought` : `Mark ${item.name} as bought`} className={`grid h-7 w-7 place-items-center rounded-lg border ${bought ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-transparent"}`}><Check className="h-4 w-4" strokeWidth={3} /></button> : <span className="hidden sm:block" />}
    <div className="min-w-0"><p className={`truncate text-sm font-bold text-slate-950 ${bought ? "line-through opacity-60" : ""}`}>{item.name}</p><p className="mt-0.5 truncate text-xs text-slate-400">{item.category} · In stock: {item.stockQuantity || "not counted"}</p></div>
    <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Buy</p><p className="mt-0.5 text-sm font-semibold text-slate-800">{item.buyQuantity || "Not set"}</p></div>
    <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Price</p><p className="mt-0.5 text-sm font-bold text-emerald-700">{formatMoney(item.budgetMin, item.budgetMax)}</p></div>
    <div className="flex items-center justify-end gap-1"><button type="button" onClick={() => onEdit(item)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label={`Edit ${item.name}`}><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => onStatus(item, mode === "later" ? "now" : "later")} disabled={savingId === item.id} className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{mode === "later" ? "Buy now" : "Later"}</button></div>
  </article>)}</div>;
}

function ItemFormModal({ mode, draft, saving, onChange, onSubmit, onClose }: {
  mode: "add" | "edit";
  draft: ItemDraft;
  saving: boolean;
  onChange: (draft: ItemDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  function update<K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) {
    onChange({ ...draft, [key]: value });
  }
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="inventory-form-title">
      <form onSubmit={onSubmit} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:max-w-2xl sm:rounded-[28px]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-600">{mode === "add" ? "New stock item" : "Update item"}</p><h2 id="inventory-form-title" className="mt-1 text-xl font-bold text-slate-950">{mode === "add" ? "Add to house inventory" : draft.name}</h2></div><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200" aria-label="Close"><X className="h-4 w-4" /></button></div>
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
          <Field label="Item name" required><input required autoFocus value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Rice" className={inputClass} /></Field>
          <Field label="Category"><input value={draft.category} onChange={(event) => update("category", event.target.value)} list="house-category-suggestions" placeholder="e.g. Pantry" className={inputClass} /></Field>
          <Field label="Actual quantity at home" hint="Any format: 3, 2 kg, half pack"><input value={draft.stockQuantity} onChange={(event) => update("stockQuantity", event.target.value)} placeholder="e.g. 3 packs" className={inputClass} /></Field>
          <Field label="Current stock level"><select value={draft.stockLevel} onChange={(event) => update("stockLevel", event.target.value as HouseStockLevel)} className={inputClass}>{Object.entries(STOCK_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></Field>
          <div className="sm:col-span-2 border-t border-slate-100 pt-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Shopping plan</p></div>
          <Field label="When to buy"><select value={draft.shoppingStatus} onChange={(event) => update("shoppingStatus", event.target.value as HouseShoppingStatus)} className={inputClass}><option value="none">Not on a shopping list</option><option value="now">Buy now</option><option value="later">Buy later</option>{draft.shoppingStatus === "bought" ? <option value="bought">Bought — waiting to restock</option> : null}</select></Field>
          <Field label="Quantity to buy" hint="e.g. 2 kg or 4–5"><input value={draft.buyQuantity} onChange={(event) => update("buyQuantity", event.target.value)} placeholder="e.g. 2 kg" className={inputClass} /></Field>
          <Field label="Price / budget (Rs)"><input type="number" min="0" step="1" value={draft.budgetMin} onChange={(event) => update("budgetMin", event.target.value)} placeholder="e.g. 100" className={inputClass} /></Field>
          <Field label="Maximum price (optional)" hint="Use for a range such as Rs 320–400"><input type="number" min="0" step="1" value={draft.budgetMax} onChange={(event) => update("budgetMax", event.target.value)} placeholder="e.g. 400" className={inputClass} /></Field>
        </div>
        <div className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:justify-end sm:px-6"><button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50 sm:flex-none">Cancel</button><button type="submit" disabled={saving || !draft.name.trim()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50 sm:flex-none">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{mode === "add" ? "Add item" : "Save changes"}</button></div>
      </form>
    </div>
  );
}

const inputClass = "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100";

function Field({ label, hint, required = false, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-bold text-slate-700">{label}{required ? " *" : ""}</span>{hint ? <span className="ml-2 text-[11px] text-slate-400">{hint}</span> : null}<div className="mt-1.5">{children}</div></label>;
}

function EmptyState({ title, description, action, actionLabel }: { title: string; description: string; action: () => void; actionLabel: string }) {
  return <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-violet-600 shadow-sm"><CircleDollarSign className="h-5 w-5" /></span><h2 className="mt-4 text-lg font-bold text-slate-950">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p><button type="button" onClick={action} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800"><Plus className="h-4 w-4" />{actionLabel}</button></div></div>;
}
