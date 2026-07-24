"use client";

import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Camera,
  CircleAlert,
  Clock3,
  LoaderCircle,
  PackageCheck,
  PackageSearch,
  RefreshCw,
  Settings,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import { useMobHref } from "@/components/mob/MobShell";
import { formatWholeMoney } from "@/lib/money";
import type {
  MobInventoryItem,
  MobInventoryTransaction,
} from "@/lib/mob-inventory";

type DashboardData = {
  summary: {
    products: number;
    units: number;
    stockValue: number;
    lowStock: number;
    outOfStock: number;
    pendingPhotos: number;
    readyImports: number;
    todayStockIn: number;
    todayStockOut: number;
    stockOutValue30d: number;
  };
  movement7Days: Array<{
    key: string;
    label: string;
    stockIn: number;
    stockOut: number;
  }>;
  categories: Array<{
    category: string;
    products: number;
    units: number;
    value: number;
  }>;
  lowStockItems: MobInventoryItem[];
  topSellers: Array<{
    productName: string;
    quantity: number;
    value: number;
  }>;
  recentTransactions: MobInventoryTransaction[];
  refreshedAt: string;
};

const EMPTY_DASHBOARD: DashboardData = {
  summary: {
    products: 0,
    units: 0,
    stockValue: 0,
    lowStock: 0,
    outOfStock: 0,
    pendingPhotos: 0,
    readyImports: 0,
    todayStockIn: 0,
    todayStockOut: 0,
    stockOutValue30d: 0,
  },
  movement7Days: [],
  categories: [],
  lowStockItems: [],
  topSellers: [],
  recentTransactions: [],
  refreshedAt: "",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-MU", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function MobOwnerDashboard() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";
  const photoLogHref = useMobHref("/photo-log");
  const inventoryHref = useMobHref("/inventory");
  const settingsHref = useMobHref("/settings");
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/mob/dashboard", {
        cache: "no-store",
      });
      const dashboard = await response.json().catch(() => ({}));
      if (!response.ok || !dashboard.summary) {
        throw new Error(dashboard?.error || "Could not load the dashboard.");
      }
      setData(dashboard as DashboardData);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load the owner dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const movementMaximum = useMemo(
    () =>
      Math.max(
        1,
        ...data.movement7Days.flatMap((day) => [
          day.stockIn,
          day.stockOut,
        ])
      ),
    [data.movement7Days]
  );
  const categoryMaximum = useMemo(
    () => Math.max(1, ...data.categories.map((category) => category.value)),
    [data.categories]
  );

  const panelClass = isDark
    ? "border-white/10 bg-[#0d1410] text-white"
    : "border-slate-200 bg-white text-slate-950";
  const muted = isDark ? "text-white/45" : "text-slate-500";

  return (
    <main className="mx-auto w-full max-w-6xl pb-6">
      <section className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className={`text-xs font-bold ${muted}`}>
            {greeting()} ·{" "}
            {new Intl.DateTimeFormat("en-MU", {
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(new Date())}
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] sm:text-3xl">
            Shop overview
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
            isDark
              ? "border-white/10 bg-white/5"
              : "border-slate-200 bg-white"
          }`}
          aria-label="Refresh dashboard"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </section>

      {error ? (
        <div
          className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"
          role="alert"
        >
          <CircleAlert className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      <section className="relative overflow-hidden rounded-[28px] bg-[#101c16] p-5 text-white shadow-xl shadow-emerald-950/10 sm:p-7">
        <div className="absolute -right-14 -top-20 h-48 w-48 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-300">
              <WalletCards className="h-3.5 w-3.5" />
              Current stock value
            </div>
            <div className="mt-4 font-mono text-4xl font-black tracking-[-0.06em] sm:text-5xl">
              {loading ? (
                <LoaderCircle className="h-9 w-9 animate-spin" />
              ) : (
                formatWholeMoney(data.summary.stockValue)
              )}
            </div>
            <p className="mt-2 text-sm text-white/55">
              {data.summary.units.toLocaleString("en-MU")} units across{" "}
              {data.summary.products} active products
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 lg:min-w-[330px]">
            <Link
              href={photoLogHref}
              className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl bg-orange-500 px-2 text-center text-[10px] font-black text-white"
            >
              <Camera className="h-5 w-5" />
              Capture
            </Link>
            <Link
              href={inventoryHref}
              className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-2 text-center text-[10px] font-black text-white"
            >
              <PackageSearch className="h-5 w-5" />
              Inventory
            </Link>
            <Link
              href={settingsHref}
              className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-2 text-center text-[10px] font-black text-white"
            >
              <Settings className="h-5 w-5" />
              Settings
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        {[
          {
            label: "Out of stock",
            value: data.summary.outOfStock,
            icon: CircleAlert,
            color: "text-rose-500",
            background: isDark ? "bg-rose-500/8" : "bg-rose-50",
          },
          {
            label: "Low stock",
            value: data.summary.lowStock,
            icon: ShoppingBag,
            color: "text-orange-500",
            background: isDark ? "bg-orange-500/8" : "bg-orange-50",
          },
          {
            label: "Ready to add",
            value: data.summary.readyImports,
            icon: PackageCheck,
            color: "text-emerald-500",
            background: isDark ? "bg-emerald-500/8" : "bg-emerald-50",
          },
        ].map(({ label, value, icon: Icon, color, background }) => (
          <Link
            key={label}
            href={inventoryHref}
            className={`rounded-2xl border p-3 shadow-sm sm:p-4 ${panelClass}`}
          >
            <div className="flex items-center justify-between gap-1">
              <Icon className={`h-4 w-4 ${color}`} />
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-sm font-black ${background} ${color}`}
              >
                {loading ? "—" : value}
              </span>
            </div>
            <p className={`mt-3 text-[9px] font-black sm:text-[10px] ${muted}`}>
              {label}
            </p>
          </Link>
        ))}
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Stock In today",
            value: `${data.summary.todayStockIn} units`,
            icon: ArrowDownToLine,
            color: "text-emerald-500",
          },
          {
            label: "Stock Out today",
            value: `${data.summary.todayStockOut} units`,
            icon: ArrowUpFromLine,
            color: "text-rose-500",
          },
          {
            label: "30-day stock-out value",
            value: formatWholeMoney(data.summary.stockOutValue30d),
            icon: TrendingUp,
            color: "text-violet-500",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className={`flex items-center gap-3 rounded-2xl border p-4 shadow-sm ${panelClass}`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                isDark ? "bg-white/5" : "bg-slate-50"
              } ${color}`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className={`block text-[9px] font-bold ${muted}`}>
                {label}
              </span>
              <span className="mt-1 block truncate font-mono text-base font-black">
                {loading ? "Loading…" : value}
              </span>
            </span>
          </div>
        ))}
      </section>

      <section className={`mt-4 rounded-2xl border p-4 shadow-sm sm:p-5 ${panelClass}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black">Last 7 days</h2>
            <p className={`mt-0.5 text-[10px] ${muted}`}>
              Units moved in and out
            </p>
          </div>
          <div className={`flex gap-3 text-[9px] font-bold ${muted}`}>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              In
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              Out
            </span>
          </div>
        </div>
        <div className="mt-5 grid h-40 grid-cols-7 items-end gap-2">
          {data.movement7Days.map((day) => (
            <div
              key={day.key}
              className="flex h-full min-w-0 flex-col items-center justify-end"
            >
              <div className="flex h-28 w-full items-end justify-center gap-1">
                <span
                  className="w-[34%] min-w-1 rounded-t-md bg-emerald-500"
                  style={{
                    height: `${Math.max(4, (day.stockIn / movementMaximum) * 100)}%`,
                  }}
                  title={`${day.stockIn} units in`}
                />
                <span
                  className="w-[34%] min-w-1 rounded-t-md bg-rose-500"
                  style={{
                    height: `${Math.max(4, (day.stockOut / movementMaximum) * 100)}%`,
                  }}
                  title={`${day.stockOut} units out`}
                />
              </div>
              <span className={`mt-2 text-[9px] font-bold ${muted}`}>
                {day.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className={`overflow-hidden rounded-2xl border shadow-sm ${panelClass}`}>
          <div
            className={`flex items-center justify-between border-b px-4 py-3 ${
              isDark ? "border-white/10" : "border-slate-100"
            }`}
          >
            <div>
              <h2 className="text-sm font-black">Needs attention</h2>
              <p className={`mt-0.5 text-[10px] ${muted}`}>
                Reorder these items first
              </p>
            </div>
            <Link
              href={inventoryHref}
              className="inline-flex items-center gap-1 text-[10px] font-black text-orange-500"
            >
              Open <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {data.lowStockItems.length ? (
            <div
              className={`divide-y ${
                isDark ? "divide-white/10" : "divide-slate-100"
              }`}
            >
              {data.lowStockItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-black ${
                      item.quantity === 0
                        ? "bg-rose-500/10 text-rose-600"
                        : "bg-orange-500/10 text-orange-600"
                    }`}
                  >
                    {item.quantity}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-black">
                      {item.productName}
                    </span>
                    <span className={`mt-0.5 block text-[9px] ${muted}`}>
                      {item.category || "No category"} · reorder at{" "}
                      {item.lowStockThreshold}
                    </span>
                  </span>
                  <span
                    className={`text-[9px] font-black uppercase ${
                      item.quantity === 0
                        ? "text-rose-600"
                        : "text-orange-600"
                    }`}
                  >
                    {item.quantity === 0 ? "Out" : "Low"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className={`px-4 py-10 text-center text-xs ${muted}`}>
              Stock levels look healthy.
            </div>
          )}
        </div>

        <div className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${panelClass}`}>
          <div>
            <h2 className="text-sm font-black">Stock by category</h2>
            <p className={`mt-0.5 text-[10px] ${muted}`}>
              Inventory value mix
            </p>
          </div>
          <div className="mt-5 space-y-4">
            {data.categories.map((category) => (
              <div key={category.category}>
                <div className="flex items-center justify-between gap-3 text-[10px]">
                  <span className="truncate font-black">{category.category}</span>
                  <span className={`shrink-0 font-mono font-bold ${muted}`}>
                    {formatWholeMoney(category.value)}
                  </span>
                </div>
                <div
                  className={`mt-2 h-2 overflow-hidden rounded-full ${
                    isDark ? "bg-white/8" : "bg-slate-100"
                  }`}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400"
                    style={{
                      width: `${Math.max(5, (category.value / categoryMaximum) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            {!data.categories.length ? (
              <div className={`py-8 text-center text-xs ${muted}`}>
                Add stock to see the category mix.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className={`overflow-hidden rounded-2xl border shadow-sm ${panelClass}`}>
          <div
            className={`border-b px-4 py-3 ${
              isDark ? "border-white/10" : "border-slate-100"
            }`}
          >
            <h2 className="text-sm font-black">Top moving products</h2>
            <p className={`mt-0.5 text-[10px] ${muted}`}>
              Stock Out during the last 30 days
            </p>
          </div>
          <div
            className={`divide-y ${
              isDark ? "divide-white/10" : "divide-slate-100"
            }`}
          >
            {data.topSellers.map((item, index) => (
              <div
                key={item.productName}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span
                  className={`font-mono text-xs font-black ${
                    index === 0 ? "text-orange-500" : muted
                  }`}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-black">
                  {item.productName}
                </span>
                <span className="font-mono text-xs font-black text-rose-600">
                  {item.quantity}
                </span>
              </div>
            ))}
            {!data.topSellers.length ? (
              <div className={`px-4 py-10 text-center text-xs ${muted}`}>
                Stock Out activity will rank products here.
              </div>
            ) : null}
          </div>
        </div>

        <div className={`overflow-hidden rounded-2xl border shadow-sm ${panelClass}`}>
          <div
            className={`flex items-center justify-between border-b px-4 py-3 ${
              isDark ? "border-white/10" : "border-slate-100"
            }`}
          >
            <div>
              <h2 className="text-sm font-black">Recent movement</h2>
              <p className={`mt-0.5 text-[10px] ${muted}`}>
                Latest inventory transactions
              </p>
            </div>
            <Link
              href={inventoryHref}
              className="text-[10px] font-black text-orange-500"
            >
              Full history
            </Link>
          </div>
          <div
            className={`divide-y ${
              isDark ? "divide-white/10" : "divide-slate-100"
            }`}
          >
            {data.recentTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
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
                  <span className={`mt-0.5 block text-[9px] ${muted}`}>
                    {formatDateTime(transaction.createdAt)}
                  </span>
                </span>
                <span
                  className={`font-mono text-xs font-black ${
                    transaction.type === "stock-in"
                      ? "text-emerald-600"
                      : "text-rose-600"
                  }`}
                >
                  {transaction.type === "stock-in" ? "+" : "-"}
                  {transaction.quantity}
                </span>
              </div>
            ))}
            {!data.recentTransactions.length ? (
              <div className={`px-4 py-10 text-center text-xs ${muted}`}>
                Inventory movements will appear here.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <footer className={`mt-4 flex items-center gap-2 px-1 text-[9px] ${muted}`}>
        <Clock3 className="h-3.5 w-3.5" />
        {data.refreshedAt
          ? `Updated ${formatDateTime(data.refreshedAt)}`
          : "Loading live inventory data"}
        {data.summary.pendingPhotos > 0 ? (
          <span className="ml-auto inline-flex items-center gap-1 font-bold text-orange-500">
            <Sparkles className="h-3.5 w-3.5" />
            {data.summary.pendingPhotos} photo
            {data.summary.pendingPhotos === 1 ? "" : "s"} need details
          </span>
        ) : null}
      </footer>
    </main>
  );
}
