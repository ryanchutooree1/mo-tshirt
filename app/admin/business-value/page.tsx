"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

type AssetCategory =
  | "Printing Machines"
  | "Tools"
  | "Equipment"
  | "Products"
  | "Website"
  | "Brand"
  | "Other";

type ValuationItem = {
  id: string;
  name: string;
  category: AssetCategory;
  boughtDate: string;
  quantity: number;
  investedUnitValue: number;
  currentUnitValue: number;
  notes: string;
};

type HistoryPoint = {
  date: string;
  totalValue: number;
};

type SyncState = "idle" | "saving" | "saved" | "error";

const STORAGE_KEY = "admin-business-value-v1";
const DOC_REF = doc(db, "adminSettings", "businessValueTracker");

const CATEGORY_OPTIONS: AssetCategory[] = [
  "Printing Machines",
  "Tools",
  "Equipment",
  "Products",
  "Website",
  "Brand",
  "Other",
];

const DEFAULT_ITEMS: ValuationItem[] = [
  {
    id: "asset-machine",
    name: "Printing machine",
    category: "Printing Machines",
    boughtDate: "",
    quantity: 1,
    investedUnitValue: 0,
    currentUnitValue: 0,
    notes: "",
  },
  {
    id: "asset-tools",
    name: "Tools",
    category: "Tools",
    boughtDate: "",
    quantity: 1,
    investedUnitValue: 0,
    currentUnitValue: 0,
    notes: "",
  },
  {
    id: "asset-products",
    name: "Products stock",
    category: "Products",
    boughtDate: "",
    quantity: 1,
    investedUnitValue: 0,
    currentUnitValue: 0,
    notes: "",
  },
  {
    id: "asset-website",
    name: "Website + admin system",
    category: "Website",
    boughtDate: "",
    quantity: 1,
    investedUnitValue: 0,
    currentUnitValue: 0,
    notes: "",
  },
];

const DEFAULT_GOAL_VALUE = 1_000_000;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const toNonNegativeNumber = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
};

const isDateKey = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

const normalizeCategory = (value: unknown): AssetCategory => {
  if (typeof value === "string" && CATEGORY_OPTIONS.includes(value as AssetCategory)) {
    return value as AssetCategory;
  }
  return "Other";
};

const normalizeItems = (value: unknown): ValuationItem[] => {
  if (!Array.isArray(value)) return DEFAULT_ITEMS;
  return value
    .map((item, index) => {
      if (!isRecord(item)) return null;
      const rawId = item.id;
      const id = typeof rawId === "string" && rawId.trim() ? rawId : `item-${index}-${createId()}`;
      const name = typeof item.name === "string" ? item.name : "";
      const notes = typeof item.notes === "string" ? item.notes : "";
      const boughtDate = typeof item.boughtDate === "string" && isDateKey(item.boughtDate) ? item.boughtDate : "";
      return {
        id,
        name,
        boughtDate,
        notes,
        category: normalizeCategory(item.category),
        quantity: toNonNegativeNumber(item.quantity),
        investedUnitValue: toNonNegativeNumber(item.investedUnitValue),
        currentUnitValue: toNonNegativeNumber(item.currentUnitValue),
      };
    })
    .filter((item): item is ValuationItem => Boolean(item));
};

const normalizeHistory = (value: unknown): HistoryPoint[] => {
  if (!Array.isArray(value)) return [];
  const map = new Map<string, number>();
  value.forEach((entry) => {
    if (!isRecord(entry)) return;
    const date = typeof entry.date === "string" ? entry.date : "";
    if (!isDateKey(date)) return;
    map.set(date, toNonNegativeNumber(entry.totalValue));
  });
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, totalValue]) => ({ date, totalValue }));
};

const getTodayKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateFromKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const formatDateShort = (dateKey: string) => {
  if (!isDateKey(dateKey)) return dateKey;
  return dateFromKey(dateKey).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
};

const formatDateLong = (dateKey: string) => {
  if (!isDateKey(dateKey)) return dateKey;
  return dateFromKey(dateKey).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatCurrency = (value: number) => `Rs ${Math.round(value || 0).toLocaleString()}`;

const upsertHistoryPoint = (history: HistoryPoint[], date: string, totalValue: number) => {
  const map = new Map<string, number>();
  history.forEach((entry) => map.set(entry.date, toNonNegativeNumber(entry.totalValue)));
  map.set(date, toNonNegativeNumber(totalValue));
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-730)
    .map(([historyDate, historyValue]) => ({
      date: historyDate,
      totalValue: historyValue,
    }));
};

const lineTotal = (item: ValuationItem) => {
  return toNonNegativeNumber(item.quantity) * toNonNegativeNumber(item.currentUnitValue);
};

const lineInvestedTotal = (item: ValuationItem) => {
  return toNonNegativeNumber(item.quantity) * toNonNegativeNumber(item.investedUnitValue);
};

export default function BusinessValuePage() {
  const [items, setItems] = useState<ValuationItem[]>(DEFAULT_ITEMS);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [goalValue, setGoalValue] = useState(DEFAULT_GOAL_VALUE);
  const [loaded, setLoaded] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [snapshotLabel, setSnapshotLabel] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!isRecord(parsed)) return;
      if ("items" in parsed) {
        setItems(normalizeItems(parsed.items));
      }
      if ("history" in parsed) {
        setHistory(normalizeHistory(parsed.history));
      }
      if ("goalValue" in parsed) {
        setGoalValue(toNonNegativeNumber(parsed.goalValue));
      }
    } catch {
      // ignore local parse errors
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadRemote = async () => {
      try {
        const snapshot = await getDoc(DOC_REF);
        if (cancelled) return;
        if (snapshot.exists()) {
          const data = snapshot.data();
          setItems(normalizeItems(data.items));
          setHistory(normalizeHistory(data.history));
          setGoalValue(toNonNegativeNumber(data.goalValue ?? DEFAULT_GOAL_VALUE));
        }
        setSyncState("idle");
      } catch {
        if (cancelled) return;
        setSyncState("error");
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    };
    loadRemote();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          items,
          history,
          goalValue,
        })
      );
    } catch {
      // ignore local write errors
    }
  }, [items, history, goalValue]);

  useEffect(() => {
    if (!loaded) return;
    setSyncState("saving");
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(async () => {
      try {
        await setDoc(
          DOC_REF,
          {
            items,
            history,
            goalValue,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        setSyncState("saved");
      } catch {
        setSyncState("error");
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [items, history, goalValue, loaded]);

  const totalInvestedValue = useMemo(() => {
    return items.reduce((sum, item) => sum + lineInvestedTotal(item), 0);
  }, [items]);

  const totalBusinessValue = useMemo(() => {
    return items.reduce((sum, item) => sum + lineTotal(item), 0);
  }, [items]);

  const totalGrowth = totalBusinessValue - totalInvestedValue;

  const todayKey = getTodayKey();
  const historyWithTodayPreview = useMemo(() => {
    return upsertHistoryPoint(history, todayKey, totalBusinessValue);
  }, [history, todayKey, totalBusinessValue]);

  const todaySavedPoint = history.find((point) => point.date === todayKey);
  const todaySnapshotSaved = typeof todaySavedPoint !== "undefined";
  const lastSavedPoint = historyWithTodayPreview.length ? historyWithTodayPreview[historyWithTodayPreview.length - 1] : null;
  const previousSavedPoint = historyWithTodayPreview.length > 1 ? historyWithTodayPreview[historyWithTodayPreview.length - 2] : null;
  const dayChange = lastSavedPoint && previousSavedPoint ? lastSavedPoint.totalValue - previousSavedPoint.totalValue : 0;

  const goalProgress = goalValue > 0 ? Math.min(100, (totalBusinessValue / goalValue) * 100) : 0;

  const chartData = useMemo(
    () =>
      historyWithTodayPreview.map((entry) => ({
        date: formatDateShort(entry.date),
        fullDate: formatDateLong(entry.date),
        totalValue: Math.round(entry.totalValue),
      })),
    [historyWithTodayPreview]
  );

  const categoryData = useMemo(() => {
    const sums = new Map<AssetCategory, number>();
    CATEGORY_OPTIONS.forEach((category) => sums.set(category, 0));
    items.forEach((item) => {
      sums.set(item.category, (sums.get(item.category) || 0) + lineTotal(item));
    });
    return Array.from(sums.entries())
      .map(([category, total]) => ({
        category,
        total,
      }))
      .filter((entry) => entry.total > 0);
  }, [items]);

  const updateItem = (id: string, patch: Partial<ValuationItem>) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          ...patch,
        };
      })
    );
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const addItem = (category: AssetCategory = "Other") => {
    setItems((current) => [
      ...current,
      {
        id: createId(),
        name: "",
        category,
        boughtDate: "",
        quantity: 1,
        investedUnitValue: 0,
        currentUnitValue: 0,
        notes: "",
      },
    ]);
  };

  const saveTodaySnapshot = () => {
    const nextHistory = upsertHistoryPoint(history, todayKey, totalBusinessValue);
    setHistory(nextHistory);
    setSnapshotLabel("Saved");
    window.setTimeout(() => setSnapshotLabel(null), 1600);
  };

  const panelClass = "rounded-3xl border border-slate-200 bg-white/90 shadow-sm backdrop-blur";

  if (!loaded) {
    return (
      <main className="min-h-screen bg-[#f7f7fb] text-slate-900">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-10 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
            Loading business value tracker...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f7fb] text-slate-900">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-20 top-[-8rem] h-72 w-72 rounded-full bg-cyan-200/50 blur-3xl" />
        <div className="pointer-events-none absolute right-[-5rem] top-20 h-80 w-80 rounded-full bg-amber-200/40 blur-3xl" />

        <div className="relative mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          <header className={`${panelClass} p-6 sm:p-8`}>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">MO Admin</p>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Business Value Tracker</h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-600">
                  Add your machines, tools, equipment, products, website, and brand value. Save each day and watch your
                  business valuation grow.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={saveTodaySnapshot}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  Save today snapshot
                </button>
                <div
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    syncState === "error"
                      ? "border-rose-200 bg-rose-50 text-rose-600"
                      : syncState === "saving"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {syncState === "saving" ? "Saving..." : syncState === "error" ? "Save failed" : "Saved"}
                </div>
                {snapshotLabel ? (
                  <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {snapshotLabel}
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-3xl border border-cyan-100 bg-white/90 p-5 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Business value</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(totalBusinessValue)}</p>
              <p className="mt-1 text-xs text-slate-500">Current estimated value</p>
            </article>

            <article className="rounded-3xl border border-amber-100 bg-white/90 p-5 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Invested value</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(totalInvestedValue)}</p>
              <p className="mt-1 text-xs text-slate-500">Total money invested</p>
            </article>

            <article className="rounded-3xl border border-emerald-100 bg-white/90 p-5 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Growth</p>
              <p className={`mt-2 text-2xl font-semibold ${totalGrowth >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                {totalGrowth >= 0 ? "+" : "-"}
                {formatCurrency(Math.abs(totalGrowth))}
              </p>
              <p className="mt-1 text-xs text-slate-500">Current value - invested value</p>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Goal progress</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{goalProgress.toFixed(1)}%</p>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-900 transition-all"
                  style={{ width: `${Math.max(0, Math.min(goalProgress, 100))}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-slate-500">Goal: {formatCurrency(goalValue)}</div>
            </article>
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[1.8fr_1fr]">
            <article className={`${panelClass} p-4 sm:p-6`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Assets register</h2>
                  <p className="text-sm text-slate-600">Update each item value and quantity to track real business worth.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => addItem("Printing Machines")}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <FiPlus className="h-4 w-4" /> Add machine
                  </button>
                  <button
                    type="button"
                    onClick={() => addItem("Products")}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <FiPlus className="h-4 w-4" /> Add product
                  </button>
                  <button
                    type="button"
                    onClick={() => addItem("Website")}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <FiPlus className="h-4 w-4" /> Add website
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                {items.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="grid gap-3 md:grid-cols-[1.1fr_0.95fr_0.78fr_0.52fr_0.95fr_0.95fr_auto] md:items-center">
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Description</span>
                        <input
                          value={item.name}
                          onChange={(event) => updateItem(item.id, { name: event.target.value })}
                          placeholder="Example: Epson printer / Heat press / Website"
                          className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-900"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Category</span>
                        <select
                          value={item.category}
                          onChange={(event) => updateItem(item.id, { category: normalizeCategory(event.target.value) })}
                          className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-900"
                        >
                          {CATEGORY_OPTIONS.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Bought date</span>
                        <input
                          type="date"
                          value={item.boughtDate}
                          onChange={(event) => {
                            updateItem(item.id, { boughtDate: event.target.value });
                          }}
                          className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-900"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Qty</span>
                        <input
                          type="number"
                          min="0"
                          value={item.quantity === 0 ? "" : item.quantity}
                          onChange={(event) => {
                            const value = event.target.value;
                            updateItem(item.id, { quantity: value === "" ? 0 : toNonNegativeNumber(value) });
                          }}
                          className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-900"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Invested / unit</span>
                        <input
                          type="number"
                          min="0"
                          value={item.investedUnitValue === 0 ? "" : item.investedUnitValue}
                          onChange={(event) => {
                            const value = event.target.value;
                            updateItem(item.id, { investedUnitValue: value === "" ? 0 : toNonNegativeNumber(value) });
                          }}
                          className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-900"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Current / unit</span>
                        <input
                          type="number"
                          min="0"
                          value={item.currentUnitValue === 0 ? "" : item.currentUnitValue}
                          onChange={(event) => {
                            const value = event.target.value;
                            updateItem(item.id, { currentUnitValue: value === "" ? 0 : toNonNegativeNumber(value) });
                          }}
                          className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-900"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="mt-5 inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 p-2.5 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
                        aria-label="Remove item"
                      >
                        <FiTrash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                      <label className="space-y-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Notes</span>
                        <input
                          value={item.notes}
                          onChange={(event) => updateItem(item.id, { notes: event.target.value })}
                          placeholder="Example: bought in 2024, perfect condition"
                          className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-900"
                        />
                      </label>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Line total</div>
                        <div className="mt-1 text-base font-semibold text-slate-900">{formatCurrency(lineTotal(item))}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addItem("Other")}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <FiPlus className="h-4 w-4" /> Add another asset
              </button>
            </article>

            <div className="space-y-6">
              <article className={`${panelClass} p-5`}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Daily valuation trend</h2>
                    <p className="text-xs text-slate-500">
                      {todaySnapshotSaved
                        ? "Today is saved in your timeline."
                        : "Today is shown as preview. Click Save today snapshot to store it."}
                    </p>
                  </div>
                  <div className={`text-sm font-semibold ${dayChange >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                    {dayChange >= 0 ? "+" : "-"}
                    {formatCurrency(Math.abs(dayChange))}
                  </div>
                </div>

                <div className="mt-4 h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0f172a" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="#0f172a" stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis tickFormatter={(value) => `Rs ${Math.round(value).toLocaleString()}`} tick={{ fontSize: 11 }} stroke="#94a3b8" width={78} />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label, payload) => {
                          const first = payload?.[0]?.payload as { fullDate?: string } | undefined;
                          return first?.fullDate || label;
                        }}
                      />
                      <Area type="monotone" dataKey="totalValue" stroke="#0f172a" strokeWidth={2.2} fill="url(#valueFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className={`${panelClass} p-5`}>
                <h2 className="text-lg font-semibold text-slate-900">Category breakdown</h2>
                <p className="mt-1 text-xs text-slate-500">See where your biggest value sits right now.</p>

                <div className="mt-4 h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData.length ? categoryData : [{ category: "No data", total: 0 }]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="category" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} tick={{ fontSize: 11 }} stroke="#94a3b8" width={38} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="total" fill="#0f172a" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className={`${panelClass} p-5`}>
                <h2 className="text-lg font-semibold text-slate-900">Motivation target</h2>
                <p className="mt-1 text-xs text-slate-500">Set a business value target and track progress daily.</p>

                <label className="mt-4 block space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Target value (Rs)</span>
                  <input
                    type="number"
                    min="0"
                    value={goalValue === 0 ? "" : goalValue}
                    onChange={(event) => {
                      const value = event.target.value;
                      setGoalValue(value === "" ? 0 : toNonNegativeNumber(value));
                    }}
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-900"
                  />
                </label>

                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-500">Remaining to reach target</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {formatCurrency(Math.max(goalValue - totalBusinessValue, 0))}
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
