"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  FiChevronLeft,
  FiChevronRight,
  FiCopy,
  FiPlus,
  FiSearch,
  FiTrash2,
} from "react-icons/fi";
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

type CategoryFilter = AssetCategory | "All";

type SortMode =
  | "value_desc"
  | "value_asc"
  | "name_asc"
  | "name_desc"
  | "bought_newest"
  | "bought_oldest";

type ChartWindow = "30" | "90" | "all";

type NumericItemField = "quantity" | "investedUnitValue" | "currentUnitValue";

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
const DEFAULT_GOAL_VALUE = 1_000_000;
const DEFAULT_PAGE_SIZE = 15;
const DEFAULT_GOAL_HORIZON_DAYS = 30;
const PAGE_SIZE_OPTIONS = [15, 30, 60, 120];

const CATEGORY_OPTIONS: AssetCategory[] = [
  "Printing Machines",
  "Tools",
  "Equipment",
  "Products",
  "Website",
  "Brand",
  "Other",
];

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "value_desc", label: "Highest value" },
  { value: "value_asc", label: "Lowest value" },
  { value: "name_asc", label: "Name A-Z" },
  { value: "name_desc", label: "Name Z-A" },
  { value: "bought_newest", label: "Bought date (newest)" },
  { value: "bought_oldest", label: "Bought date (oldest)" },
];

const DEFAULT_NAMES_BY_CATEGORY: Record<AssetCategory, string> = {
  "Printing Machines": "Printing machine",
  Tools: "Tools",
  Equipment: "Equipment",
  Products: "Products stock",
  Website: "Website + admin system",
  Brand: "Brand value",
  Other: "",
};

const STARTER_TEMPLATE: Omit<ValuationItem, "id">[] = [
  {
    name: "Printing machine",
    category: "Printing Machines",
    boughtDate: "",
    quantity: 1,
    investedUnitValue: 0,
    currentUnitValue: 0,
    notes: "",
  },
  {
    name: "Heat press",
    category: "Equipment",
    boughtDate: "",
    quantity: 1,
    investedUnitValue: 0,
    currentUnitValue: 0,
    notes: "",
  },
  {
    name: "Tools set",
    category: "Tools",
    boughtDate: "",
    quantity: 1,
    investedUnitValue: 0,
    currentUnitValue: 0,
    notes: "",
  },
  {
    name: "Products stock",
    category: "Products",
    boughtDate: "",
    quantity: 1,
    investedUnitValue: 0,
    currentUnitValue: 0,
    notes: "",
  },
  {
    name: "Website + admin system",
    category: "Website",
    boughtDate: "",
    quantity: 1,
    investedUnitValue: 0,
    currentUnitValue: 0,
    notes: "",
  },
];

const DEFAULT_ITEMS: ValuationItem[] = STARTER_TEMPLATE.map((item, index) => ({
  id: `asset-${index + 1}`,
  ...item,
}));

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
      const rawDate = typeof item.boughtDate === "string" ? item.boughtDate : "";
      return {
        id,
        name,
        notes,
        category: normalizeCategory(item.category),
        boughtDate: rawDate && isDateKey(rawDate) ? rawDate : "",
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

const getDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
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

const lineTotal = (item: ValuationItem) => {
  return toNonNegativeNumber(item.quantity) * toNonNegativeNumber(item.currentUnitValue);
};

const lineInvestedTotal = (item: ValuationItem) => {
  return toNonNegativeNumber(item.quantity) * toNonNegativeNumber(item.investedUnitValue);
};

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

const dateAsTimestamp = (dateKey: string) => {
  if (!dateKey || !isDateKey(dateKey)) return 0;
  return dateFromKey(dateKey).getTime();
};

const calculateSnapshotStreak = (history: HistoryPoint[]) => {
  if (!history.length) return 0;
  const savedDates = new Set(history.map((entry) => entry.date));
  const cursor = new Date();
  let streak = 0;
  while (true) {
    const key = getDateKey(cursor);
    if (!savedDates.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

const sortItems = (items: ValuationItem[], mode: SortMode) => {
  const sorted = items.slice();
  sorted.sort((a, b) => {
    const valueDiff = lineTotal(a) - lineTotal(b);
    const nameDiff = (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
    const dateDiff = dateAsTimestamp(a.boughtDate) - dateAsTimestamp(b.boughtDate);
    switch (mode) {
      case "value_asc":
        return valueDiff || nameDiff;
      case "value_desc":
        return -valueDiff || nameDiff;
      case "name_asc":
        return nameDiff || -valueDiff;
      case "name_desc":
        return -nameDiff || -valueDiff;
      case "bought_newest":
        return -dateDiff || -valueDiff;
      case "bought_oldest":
        return dateDiff || -valueDiff;
      default:
        return -valueDiff;
    }
  });
  return sorted;
};

export default function BusinessValuePage() {
  const [items, setItems] = useState<ValuationItem[]>(DEFAULT_ITEMS);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [goalValue, setGoalValue] = useState(DEFAULT_GOAL_VALUE);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All");
  const [sortMode, setSortMode] = useState<SortMode>("value_desc");
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);
  const [chartWindow, setChartWindow] = useState<ChartWindow>("90");
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
  const todayKey = getDateKey(new Date());

  const historyWithTodayPreview = useMemo(() => {
    return upsertHistoryPoint(history, todayKey, totalBusinessValue);
  }, [history, todayKey, totalBusinessValue]);

  const historyForChart = useMemo(() => {
    if (chartWindow === "all") return historyWithTodayPreview;
    const limit = chartWindow === "30" ? 30 : 90;
    return historyWithTodayPreview.slice(-limit);
  }, [chartWindow, historyWithTodayPreview]);

  const chartData = useMemo(
    () =>
      historyForChart.map((entry) => ({
        date: formatDateShort(entry.date),
        fullDate: formatDateLong(entry.date),
        totalValue: Math.round(entry.totalValue),
      })),
    [historyForChart]
  );

  const trendUsingSample = chartData.length < 2;
  const trendChartData = useMemo(() => {
    if (!trendUsingSample) return chartData;
    const base = Math.max(totalBusinessValue, totalInvestedValue, 20_000);
    const points = 7;
    return Array.from({ length: points }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (points - 1 - index));
      const dateKey = getDateKey(date);
      const factor = 0.82 + (index / (points - 1)) * 0.18;
      return {
        date: formatDateShort(dateKey),
        fullDate: `${formatDateLong(dateKey)} (sample)`,
        totalValue: Math.round(base * factor),
      };
    });
  }, [chartData, totalBusinessValue, totalInvestedValue, trendUsingSample]);

  const todaySaved = history.some((point) => point.date === todayKey);
  const lastChartPoint = historyWithTodayPreview.length
    ? historyWithTodayPreview[historyWithTodayPreview.length - 1]
    : null;
  const previousChartPoint = historyWithTodayPreview.length > 1
    ? historyWithTodayPreview[historyWithTodayPreview.length - 2]
    : null;
  const dayChange =
    lastChartPoint && previousChartPoint
      ? lastChartPoint.totalValue - previousChartPoint.totalValue
      : 0;

  const goalProgress =
    goalValue > 0
      ? Math.max(0, Math.min(100, (totalBusinessValue / goalValue) * 100))
      : 0;
  const remainingToGoal = Math.max(goalValue - totalBusinessValue, 0);

  const dailyGainData = useMemo(() => {
    if (historyForChart.length < 2) return [] as Array<{ date: string; fullDate: string; gain: number }>;
    return historyForChart.slice(1).map((entry, index) => {
      const previous = historyForChart[index];
      const gain = entry.totalValue - previous.totalValue;
      return {
        date: formatDateShort(entry.date),
        fullDate: formatDateLong(entry.date),
        gain,
      };
    });
  }, [historyForChart]);

  const dailyGainUsingSample = dailyGainData.length === 0;
  const dailyGainChartData = useMemo(() => {
    if (!dailyGainUsingSample) return dailyGainData;
    const base = Math.max(totalBusinessValue, totalInvestedValue, 20_000);
    const step = Math.max(500, Math.round(base * 0.01));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const dateKey = getDateKey(date);
      const gain = index === 0 ? 0 : Math.round(step * (0.45 + Math.sin(index / 2) * 0.2 + index * 0.08));
      return {
        date: formatDateShort(dateKey),
        fullDate: `${formatDateLong(dateKey)} (sample)`,
        gain,
      };
    });
  }, [dailyGainData, dailyGainUsingSample, totalBusinessValue, totalInvestedValue]);

  const recentAverageDailyGain = useMemo(() => {
    if (historyWithTodayPreview.length < 2) return 0;
    const gains = historyWithTodayPreview.slice(1).map((entry, index) => {
      const previous = historyWithTodayPreview[index];
      return entry.totalValue - previous.totalValue;
    });
    const recentGains = gains.slice(-14);
    if (!recentGains.length) return 0;
    return recentGains.reduce((sum, value) => sum + value, 0) / recentGains.length;
  }, [historyWithTodayPreview]);

  const currentPaceDailyGain = Math.max(0, recentAverageDailyGain);
  const targetDailyGain =
    remainingToGoal > 0 ? remainingToGoal / DEFAULT_GOAL_HORIZON_DAYS : 0;
  const paceGap = currentPaceDailyGain - targetDailyGain;

  const projectionData = useMemo(() => {
    const points: Array<{
      date: string;
      fullDate: string;
      currentPaceValue: number;
      targetPathValue: number;
      goal: number;
    }> = [];
    const now = new Date();
    for (let dayOffset = 0; dayOffset <= DEFAULT_GOAL_HORIZON_DAYS; dayOffset += 1) {
      const date = new Date(now);
      date.setDate(now.getDate() + dayOffset);
      const dateKey = getDateKey(date);
      points.push({
        date: dayOffset === 0 ? "Today" : formatDateShort(dateKey),
        fullDate: formatDateLong(dateKey),
        currentPaceValue: Math.round(totalBusinessValue + currentPaceDailyGain * dayOffset),
        targetPathValue: Math.round(
          remainingToGoal > 0
            ? totalBusinessValue + targetDailyGain * dayOffset
            : totalBusinessValue
        ),
        goal: goalValue,
      });
    }
    return points;
  }, [currentPaceDailyGain, goalValue, remainingToGoal, targetDailyGain, totalBusinessValue]);

  const projectedValueInHorizon = projectionData.length
    ? projectionData[projectionData.length - 1].currentPaceValue
    : totalBusinessValue;
  const goalHorizonDateLabel = useMemo(() => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + DEFAULT_GOAL_HORIZON_DAYS);
    return targetDate.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }, []);

  const categoryData = useMemo(() => {
    const sums = new Map<AssetCategory, number>();
    CATEGORY_OPTIONS.forEach((category) => sums.set(category, 0));
    items.forEach((item) => {
      sums.set(item.category, (sums.get(item.category) || 0) + lineTotal(item));
    });
    return Array.from(sums.entries())
      .map(([category, total]) => ({ category, total }))
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [items]);

  const topCategory = categoryData.length ? categoryData[0] : null;

  const categoryCounts = useMemo(() => {
    const counts = new Map<CategoryFilter, number>();
    counts.set("All", items.length);
    CATEGORY_OPTIONS.forEach((category) => counts.set(category, 0));
    items.forEach((item) => {
      counts.set(item.category, (counts.get(item.category) || 0) + 1);
    });
    return counts;
  }, [items]);

  const filteredSortedItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (categoryFilter !== "All" && item.category !== categoryFilter) {
        return false;
      }
      if (!query) return true;
      const blob = `${item.name} ${item.category} ${item.notes} ${item.boughtDate}`.toLowerCase();
      return blob.includes(query);
    });
    return sortItems(filtered, sortMode);
  }, [items, categoryFilter, searchQuery, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filteredSortedItems.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, sortMode, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSortedItems.slice(start, start + pageSize);
  }, [filteredSortedItems, currentPage, pageSize]);

  const visibleValue = useMemo(() => {
    return filteredSortedItems.reduce((sum, item) => sum + lineTotal(item), 0);
  }, [filteredSortedItems]);

  const snapshotStreak = useMemo(() => {
    return calculateSnapshotStreak(history);
  }, [history]);

  const biggestItem = useMemo(() => {
    if (!items.length) return null;
    return items
      .slice()
      .sort((a, b) => lineTotal(b) - lineTotal(a))[0];
  }, [items]);

  const updateItem = (id: string, patch: Partial<ValuationItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const updateNumericField = (id: string, field: NumericItemField, raw: string) => {
    const value = raw === "" ? 0 : toNonNegativeNumber(raw);
    updateItem(id, { [field]: value } as Pick<ValuationItem, NumericItemField>);
  };

  const addItem = (category: AssetCategory = "Other") => {
    setItems((current) => [
      ...current,
      {
        id: createId(),
        name: DEFAULT_NAMES_BY_CATEGORY[category],
        category,
        boughtDate: "",
        quantity: 1,
        investedUnitValue: 0,
        currentUnitValue: 0,
        notes: "",
      },
    ]);
  };

  const addStarterPack = () => {
    const templates = STARTER_TEMPLATE.map((template) => ({
      ...template,
      id: createId(),
    }));
    setItems((current) => [...current, ...templates]);
  };

  const duplicateItem = (id: string) => {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index < 0) return current;
      const base = current[index];
      const clone: ValuationItem = {
        ...base,
        id: createId(),
        name: base.name ? `${base.name} copy` : "Asset copy",
      };
      const next = current.slice();
      next.splice(index + 1, 0, clone);
      return next;
    });
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const clearFilters = () => {
    setSearchQuery("");
    setCategoryFilter("All");
    setSortMode("value_desc");
  };

  const saveTodaySnapshot = () => {
    const nextHistory = upsertHistoryPoint(history, todayKey, totalBusinessValue);
    setHistory(nextHistory);
    setSnapshotLabel("Saved");
    window.setTimeout(() => setSnapshotLabel(null), 1600);
  };

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

  const panelClass = "rounded-[28px] border border-slate-200 bg-white/90 shadow-sm backdrop-blur";
  const firstVisibleIndex = filteredSortedItems.length
    ? (currentPage - 1) * pageSize + 1
    : 0;
  const lastVisibleIndex = Math.min(currentPage * pageSize, filteredSortedItems.length);

  return (
    <main className="min-h-screen bg-[#f7f7fb] text-slate-900">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-20 top-[-8rem] h-72 w-72 rounded-full bg-cyan-200/50 blur-3xl" />
        <div className="pointer-events-none absolute right-[-5rem] top-16 h-80 w-80 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-8rem] left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-200/30 blur-3xl" />

        <div className="relative mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          <header className={`${panelClass} p-6 sm:p-8`}>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">MO Admin</p>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                  Business Value Tracker
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-600">
                  Track every machine, tool, product, and digital asset in one place. Save daily snapshots and build a
                  business you can value with confidence.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={saveTodaySnapshot}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  Save today snapshot
                </button>
                <button
                  type="button"
                  onClick={() => addItem("Other")}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <FiPlus className="h-4 w-4" /> Add asset
                </button>
                <a
                  href="#growth-graphs"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  View graphs
                </a>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    syncState === "error"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : syncState === "saving"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {syncState === "saving" ? "Saving..." : syncState === "error" ? "Save failed" : "Saved"}
                </span>
                {snapshotLabel ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {snapshotLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </header>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <article className="rounded-3xl border border-cyan-100 bg-white/90 p-5 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Business value</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(totalBusinessValue)}</p>
              <p className="mt-1 text-xs text-slate-500">Live estimated value</p>
            </article>

            <article className="rounded-3xl border border-amber-100 bg-white/90 p-5 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Invested value</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(totalInvestedValue)}</p>
              <p className="mt-1 text-xs text-slate-500">Total cash invested</p>
            </article>

            <article className="rounded-3xl border border-emerald-100 bg-white/90 p-5 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Growth</p>
              <p className={`mt-2 text-2xl font-semibold ${totalGrowth >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                {totalGrowth >= 0 ? "+" : "-"}
                {formatCurrency(Math.abs(totalGrowth))}
              </p>
              <p className="mt-1 text-xs text-slate-500">Current - invested</p>
            </article>

            <article className="rounded-3xl border border-violet-100 bg-white/90 p-5 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Snapshot streak</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{snapshotStreak} day{snapshotStreak === 1 ? "" : "s"}</p>
              <p className="mt-1 text-xs text-slate-500">Consecutive saved days</p>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Goal progress</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{goalProgress.toFixed(1)}%</p>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-900 transition-all"
                  style={{ width: `${goalProgress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">Goal: {formatCurrency(goalValue)}</p>
            </article>
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[1.85fr_1fr]">
            <article className={`${panelClass} order-2 p-4 sm:p-6 xl:order-1`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Assets register</h2>
                  <p className="text-sm text-slate-600">
                    Built for large inventories: search, filter, sort, and paginate while editing inline.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => addItem("Printing Machines")}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <FiPlus className="h-4 w-4" /> Machine
                  </button>
                  <button
                    type="button"
                    onClick={() => addItem("Products")}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <FiPlus className="h-4 w-4" /> Product
                  </button>
                  <button
                    type="button"
                    onClick={addStarterPack}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                  >
                    <FiPlus className="h-4 w-4" /> Starter pack
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_0.9fr_0.9fr_0.8fr]">
                <label className="relative block">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <FiSearch className="h-4 w-4" />
                  </span>
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by item, note, category, or date"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-slate-900"
                  />
                </label>

                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-900"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      Sort: {option.label}
                    </option>
                  ))}
                </select>

                <select
                  value={String(pageSize)}
                  onChange={(event) => setPageSize(toNonNegativeNumber(event.target.value) || DEFAULT_PAGE_SIZE)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-900"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size} rows / page
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Reset filters
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(["All", ...CATEGORY_OPTIONS] as CategoryFilter[]).map((category) => {
                  const active = categoryFilter === category;
                  const count = categoryCounts.get(category) || 0;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setCategoryFilter(category)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <span>{category}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span>
                  Showing {firstVisibleIndex || 0}-{lastVisibleIndex || 0} of {filteredSortedItems.length} filtered items
                </span>
                <span>
                  Filtered value: <strong className="text-slate-900">{formatCurrency(visibleValue)}</strong>
                </span>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <div className="max-h-[740px] overflow-auto">
                  <table className="min-w-[1280px] w-full border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
                      <tr className="text-left text-[11px] uppercase tracking-[0.2em]">
                        <th className="px-3 py-3 font-semibold">#</th>
                        <th className="px-3 py-3 font-semibold">Description</th>
                        <th className="px-3 py-3 font-semibold">Category</th>
                        <th className="px-3 py-3 font-semibold">Bought date</th>
                        <th className="px-3 py-3 font-semibold text-right">Qty</th>
                        <th className="px-3 py-3 font-semibold text-right">Invested/unit</th>
                        <th className="px-3 py-3 font-semibold text-right">Current/unit</th>
                        <th className="px-3 py-3 font-semibold text-right">Line total</th>
                        <th className="px-3 py-3 font-semibold">Notes</th>
                        <th className="px-3 py-3 font-semibold text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {!pagedItems.length ? (
                        <tr>
                          <td colSpan={10} className="px-6 py-10 text-center text-sm text-slate-500">
                            No items found for this filter.
                          </td>
                        </tr>
                      ) : (
                        pagedItems.map((item, index) => {
                          const rowNumber = (currentPage - 1) * pageSize + index + 1;
                          return (
                            <tr key={item.id} className="align-top">
                              <td className="px-3 py-3 text-sm text-slate-500">{rowNumber}</td>

                              <td className="px-3 py-3">
                                <input
                                  value={item.name}
                                  onChange={(event) => updateItem(item.id, { name: event.target.value })}
                                  placeholder="Item name"
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-slate-900"
                                />
                              </td>

                              <td className="px-3 py-3">
                                <select
                                  value={item.category}
                                  onChange={(event) => updateItem(item.id, { category: normalizeCategory(event.target.value) })}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-slate-900"
                                >
                                  {CATEGORY_OPTIONS.map((category) => (
                                    <option key={category} value={category}>
                                      {category}
                                    </option>
                                  ))}
                                </select>
                              </td>

                              <td className="px-3 py-3">
                                <input
                                  type="date"
                                  value={item.boughtDate}
                                  onChange={(event) => updateItem(item.id, { boughtDate: event.target.value })}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-slate-900"
                                />
                              </td>

                              <td className="px-3 py-3">
                                <input
                                  type="number"
                                  min="0"
                                  value={item.quantity === 0 ? "" : item.quantity}
                                  onChange={(event) => updateNumericField(item.id, "quantity", event.target.value)}
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-right text-sm text-slate-800 outline-none transition focus:border-slate-900"
                                />
                              </td>

                              <td className="px-3 py-3">
                                <input
                                  type="number"
                                  min="0"
                                  value={item.investedUnitValue === 0 ? "" : item.investedUnitValue}
                                  onChange={(event) =>
                                    updateNumericField(item.id, "investedUnitValue", event.target.value)
                                  }
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-right text-sm text-slate-800 outline-none transition focus:border-slate-900"
                                />
                              </td>

                              <td className="px-3 py-3">
                                <input
                                  type="number"
                                  min="0"
                                  value={item.currentUnitValue === 0 ? "" : item.currentUnitValue}
                                  onChange={(event) =>
                                    updateNumericField(item.id, "currentUnitValue", event.target.value)
                                  }
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-right text-sm text-slate-800 outline-none transition focus:border-slate-900"
                                />
                              </td>

                              <td className="px-3 py-3 text-right text-sm font-semibold text-slate-900">
                                {formatCurrency(lineTotal(item))}
                              </td>

                              <td className="px-3 py-3">
                                <input
                                  value={item.notes}
                                  onChange={(event) => updateItem(item.id, { notes: event.target.value })}
                                  placeholder="Optional details"
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-900"
                                />
                              </td>

                              <td className="px-3 py-3">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => duplicateItem(item.id)}
                                    className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                                    title="Duplicate"
                                  >
                                    <FiCopy className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeItem(item.id)}
                                    className="rounded-full border border-rose-200 bg-rose-50 p-2 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
                                    title="Remove"
                                  >
                                    <FiTrash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-600">
                  Page <span className="font-semibold text-slate-900">{currentPage}</span> of {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage <= 1}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <FiChevronLeft className="h-4 w-4" /> Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage >= totalPages}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Next <FiChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </article>

            <div id="growth-graphs" className="space-y-6 order-1 xl:order-2">
              <article className={`${panelClass} p-5`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Daily valuation trend</h2>
                    <p className="text-xs text-slate-500">
                      {todaySaved
                        ? "Today snapshot is saved in your history."
                        : "Today is previewed. Save snapshot to lock it."}
                    </p>
                  </div>
                  <div className={`text-sm font-semibold ${dayChange >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                    {dayChange >= 0 ? "+" : "-"}
                    {formatCurrency(Math.abs(dayChange))}
                  </div>
                </div>
                {trendUsingSample ? (
                  <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                    Showing preview graph. Save snapshots for 2+ days to display your real trend.
                  </div>
                ) : null}

                <div className="mt-3 inline-flex overflow-hidden rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
                  {([
                    { value: "30", label: "30D" },
                    { value: "90", label: "90D" },
                    { value: "all", label: "All" },
                  ] as Array<{ value: ChartWindow; label: string }>).map((option) => {
                    const active = chartWindow === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setChartWindow(option.value)}
                        className={`rounded-full px-3 py-1 transition ${
                          active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendChartData} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="businessValueFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0f172a" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="#0f172a" stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis
                        tickFormatter={(value) => `Rs ${Math.round(value).toLocaleString()}`}
                        tick={{ fontSize: 11 }}
                        stroke="#94a3b8"
                        width={76}
                      />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label, payload) => {
                          const first = payload?.[0]?.payload as { fullDate?: string } | undefined;
                          return first?.fullDate || String(label);
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="totalValue"
                        stroke="#0f172a"
                        strokeWidth={2.2}
                        fill="url(#businessValueFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className={`${panelClass} p-5`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Daily gains momentum</h2>
                    <p className="text-xs text-slate-500">
                      Green bars are value increases. Red bars show days to recover and push harder.
                    </p>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${recentAverageDailyGain >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                      {recentAverageDailyGain >= 0 ? "+" : "-"}
                      {formatCurrency(Math.abs(recentAverageDailyGain))}/day
                    </div>
                    <div className="text-[11px] text-slate-500">14-day average pace</div>
                  </div>
                </div>
                {dailyGainUsingSample ? (
                  <div className="mt-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-[11px] font-semibold text-cyan-700">
                    Preview bars are shown until your real day-to-day gain history is available.
                  </div>
                ) : null}

                <div className="mt-4 h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyGainChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis
                        tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                        tick={{ fontSize: 11 }}
                        stroke="#94a3b8"
                        width={40}
                      />
                      <ReferenceLine y={0} stroke="#cbd5e1" />
                      <Tooltip
                        formatter={(value: number) => `${value >= 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`}
                        labelFormatter={(label, payload) => {
                          const first = payload?.[0]?.payload as { fullDate?: string } | undefined;
                          return first?.fullDate || String(label);
                        }}
                      />
                      <Bar dataKey="gain" radius={[4, 4, 0, 0]}>
                        {dailyGainChartData.map((entry, index) => (
                          <Cell
                            key={`${entry.date}-${index}`}
                            fill={entry.gain >= 0 ? "#16a34a" : "#f43f5e"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className={`${panelClass} p-5`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {DEFAULT_GOAL_HORIZON_DAYS}-day path to goal
                    </h2>
                    <p className="text-xs text-slate-500">
                      Compare your current pace with the pace required to hit your target by {goalHorizonDateLabel}.
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Current pace</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      +{formatCurrency(currentPaceDailyGain)}/day
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Needed pace</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      +{formatCurrency(targetDailyGain)}/day
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Your projection</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {formatCurrency(projectedValueInHorizon)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={projectionData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis
                        tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                        tick={{ fontSize: 11 }}
                        stroke="#94a3b8"
                        width={50}
                      />
                      <Tooltip
                        formatter={(value: number, key: string) =>
                          key === "currentPaceValue"
                            ? [formatCurrency(value), "Current pace"]
                            : key === "targetPathValue"
                              ? [formatCurrency(value), "Target pace"]
                              : [formatCurrency(value), "Goal"]
                        }
                        labelFormatter={(label, payload) => {
                          const first = payload?.[0]?.payload as { fullDate?: string } | undefined;
                          return first?.fullDate || String(label);
                        }}
                      />
                      <ReferenceLine y={goalValue} stroke="#f59e0b" strokeDasharray="5 5" />
                      <Line
                        type="monotone"
                        dataKey="currentPaceValue"
                        stroke="#0284c7"
                        strokeWidth={2.2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="targetPathValue"
                        stroke="#16a34a"
                        strokeWidth={2.2}
                        strokeDasharray="5 4"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div
                  className={`mt-3 rounded-2xl border px-3 py-2 text-xs font-semibold ${
                    paceGap >= 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {paceGap >= 0
                    ? `You are ahead of target pace by +${formatCurrency(paceGap)}/day.`
                    : `Add +${formatCurrency(Math.abs(paceGap))}/day to hit your target on time.`}
                </div>
              </article>

              <article className={`${panelClass} p-5`}>
                <h2 className="text-lg font-semibold text-slate-900">Category breakdown</h2>
                <p className="mt-1 text-xs text-slate-500">Where most of your valuation currently sits.</p>

                <div className="mt-4 h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData.length ? categoryData : [{ category: "No data", total: 0 }]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="category" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis
                        tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                        tick={{ fontSize: 11 }}
                        stroke="#94a3b8"
                        width={38}
                      />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="total" fill="#0f172a" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className={`${panelClass} p-5`}>
                <h2 className="text-lg font-semibold text-slate-900">Motivation panel</h2>
                <p className="mt-1 text-xs text-slate-500">Keep your target visible and make daily progress measurable.</p>

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
                  <div className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(remainingToGoal)}</div>
                </div>

                <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    Projection by {goalHorizonDateLabel}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {formatCurrency(projectedValueInHorizon)}
                  </div>
                </div>

                <div className="mt-3 grid gap-2">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Top category</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {topCategory ? `${topCategory.category} (${formatCurrency(topCategory.total)})` : "No data yet"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Most valuable item</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {biggestItem ? `${biggestItem.name || "Unnamed item"} (${formatCurrency(lineTotal(biggestItem))})` : "No items yet"}
                    </div>
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
