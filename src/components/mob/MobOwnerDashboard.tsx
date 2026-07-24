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
  Sparkles,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import { formatMoney } from "@/lib/money";
import type { InventoryPhotoLogItem } from "@/lib/inventory-photo-log";
import type {
  MobInventoryItem,
  MobInventoryTransaction,
} from "@/lib/mob-inventory";
import { useMobHref } from "@/components/mob/MobShell";

type DashboardData = {
  items: MobInventoryItem[];
  transactions: MobInventoryTransaction[];
  readyPhotoLogs: InventoryPhotoLogItem[];
  photoLogs: InventoryPhotoLogItem[];
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

export default function MobOwnerDashboard() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";
  const photoLogHref = useMobHref("/photo-log");
  const inventoryHref = useMobHref("/inventory");
  const settingsHref = useMobHref("/settings");
  const [data, setData] = useState<DashboardData>({
    items: [],
    transactions: [],
    readyPhotoLogs: [],
    photoLogs: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [inventoryResponse, photoResponse] = await Promise.all([
        fetch("/api/admin/mob/inventory", { cache: "no-store" }),
        fetch("/api/admin/inventory-photo-log", { cache: "no-store" }),
      ]);
      const [inventoryData, photoData] = await Promise.all([
        inventoryResponse.json().catch(() => ({})),
        photoResponse.json().catch(() => ({})),
      ]);
      if (!inventoryResponse.ok) {
        throw new Error(inventoryData?.error || "Could not load inventory.");
      }
      if (!photoResponse.ok) {
        throw new Error(photoData?.error || "Could not load photo records.");
      }
      setData({
        items: Array.isArray(inventoryData.items) ? inventoryData.items : [],
        transactions: Array.isArray(inventoryData.transactions)
          ? inventoryData.transactions
          : [],
        readyPhotoLogs: Array.isArray(inventoryData.readyPhotoLogs)
          ? inventoryData.readyPhotoLogs
          : [],
        photoLogs: Array.isArray(photoData.items) ? photoData.items : [],
      });
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

  const summary = useMemo(() => {
    const activeItems = data.items.filter((item) => !item.isArchived);
    return {
      pendingPhotos: data.photoLogs.filter((item) => item.isPending).length,
      readyImports: data.readyPhotoLogs.length,
      products: activeItems.length,
      units: activeItems.reduce((sum, item) => sum + item.quantity, 0),
      value: activeItems.reduce(
        (sum, item) => sum + item.quantity * item.sellingPrice,
        0
      ),
      lowStock: activeItems.filter(
        (item) => item.quantity <= item.lowStockThreshold
      ).length,
    };
  }, [data]);

  const panelClass = isDark
    ? "border-white/10 bg-[#0d1410] text-white"
    : "border-slate-200 bg-white text-slate-950";
  const muted = isDark ? "text-white/45" : "text-slate-500";

  return (
    <main className="mx-auto w-full max-w-6xl pb-6">
      <section className="mb-5 flex items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-orange-600">
            <Sparkles className="h-3.5 w-3.5" />
            Owner dashboard
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] sm:text-3xl">
            Mobile Shop
          </h1>
          <p className={`mt-1 text-sm ${muted}`}>
            Photos, stock and daily movements in one place.
          </p>
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
          className="mb-5 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"
          role="alert"
        >
          <CircleAlert className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Pending details",
            value: summary.pendingPhotos,
            icon: Clock3,
            color: "text-orange-500",
          },
          {
            label: "Ready to import",
            value: summary.readyImports,
            icon: PackageCheck,
            color: "text-emerald-500",
          },
          {
            label: "Stock units",
            value: summary.units,
            icon: PackageSearch,
            color: "text-sky-500",
          },
          {
            label: "Stock value",
            value: formatMoney(summary.value),
            icon: WalletCards,
            color: "text-violet-500",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className={`rounded-2xl border p-4 shadow-sm ${panelClass}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[10px] font-extrabold ${muted}`}>
                {label}
              </span>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <div className="mt-2 truncate font-mono text-xl font-black sm:text-2xl">
              {loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : value}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          {
            href: photoLogHref,
            title: "Capture stock",
            body: `${summary.pendingPhotos} photo${summary.pendingPhotos === 1 ? "" : "s"} need details`,
            icon: Camera,
            accent: "bg-orange-500",
          },
          {
            href: inventoryHref,
            title: "Open inventory",
            body: `${summary.products} products · ${summary.lowStock} low`,
            icon: PackageSearch,
            accent: "bg-emerald-500",
          },
          {
            href: settingsHref,
            title: "Hybrid settings",
            body: "Photo retention and automation",
            icon: Settings,
            accent: "bg-violet-500",
          },
        ].map(({ href, title, body, icon: Icon, accent }) => (
          <Link
            key={title}
            href={href}
            className={`group flex min-h-24 items-center gap-3 rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 ${panelClass}`}
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white ${accent}`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black">{title}</span>
              <span className={`mt-1 block truncate text-[11px] ${muted}`}>
                {body}
              </span>
            </span>
            <ArrowRight className={`ml-auto h-4 w-4 shrink-0 ${muted}`} />
          </Link>
        ))}
      </section>

      <section className={`mt-5 overflow-hidden rounded-2xl border ${panelClass}`}>
        <div
          className={`flex items-center justify-between border-b px-4 py-3 ${
            isDark ? "border-white/10" : "border-slate-200"
          }`}
        >
          <div>
            <h2 className="text-sm font-black">Recent inventory movement</h2>
            <p className={`mt-0.5 text-[10px] ${muted}`}>
              Worker imports and owner adjustments
            </p>
          </div>
          <Link
            href={inventoryHref}
            className="text-[11px] font-black text-orange-500"
          >
            View all
          </Link>
        </div>
        {data.transactions.length ? (
          <div
            className={`divide-y ${
              isDark ? "divide-white/10" : "divide-slate-100"
            }`}
          >
            {data.transactions.slice(0, 6).map((transaction) => (
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
                  <span className={`mt-0.5 block text-[10px] ${muted}`}>
                    {formatDate(transaction.createdAt)} ·{" "}
                    {transaction.source === "photo-log"
                      ? "Worker photo"
                      : "Owner"}
                  </span>
                </span>
                <span
                  className={`font-mono text-sm font-black ${
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
          </div>
        ) : (
          <div className={`px-4 py-10 text-center text-xs ${muted}`}>
            Inventory movements will appear here.
          </div>
        )}
      </section>
    </main>
  );
}
