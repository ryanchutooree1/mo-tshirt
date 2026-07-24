"use client";

import {
  Check,
  CircleAlert,
  Clock3,
  Database,
  HardDrive,
  ImageOff,
  LoaderCircle,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import type {
  InventoryPhotoCleanupResult,
} from "@/lib/inventory-photo-retention";
import {
  DEFAULT_MOB_INVENTORY_SETTINGS,
  type MobInventorySettings,
} from "@/lib/mob-inventory";

export default function MobSettingsPage() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";
  const [settings, setSettings] = useState<MobInventorySettings>(
    DEFAULT_MOB_INVENTORY_SETTINGS
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] =
    useState<InventoryPhotoCleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/mob/settings", {
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.settings) {
        throw new Error(data?.error || "Could not load settings.");
      }
      setSettings(data.settings);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load settings."
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

  async function saveSettings() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/mob/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.settings) {
        throw new Error(data?.error || "Could not save settings.");
      }
      setSettings(data.settings);
      setNotice("Hybrid settings saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save settings."
      );
    } finally {
      setSaving(false);
    }
  }

  async function runCleanup() {
    const confirmed = window.confirm(
      `Delete photos from completed records older than ${settings.photoRetentionDays} day${settings.photoRetentionDays === 1 ? "" : "s"}? All record data will be kept.`
    );
    if (!confirmed) return;

    setCleaning(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/mob/settings/cleanup", {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.result) {
        throw new Error(data?.error || "Could not run photo cleanup.");
      }
      setCleanupResult(data.result);
      setNotice(
        `${data.result.deleted} expired photo${data.result.deleted === 1 ? "" : "s"} deleted; record data kept.`
      );
    } catch (cleanupError) {
      setError(
        cleanupError instanceof Error
          ? cleanupError.message
          : "Could not run photo cleanup."
      );
    } finally {
      setCleaning(false);
    }
  }

  const panelClass = isDark
    ? "border-white/10 bg-[#0d1410] text-white"
    : "border-slate-200 bg-white text-slate-950";
  const muted = isDark ? "text-white/45" : "text-slate-500";
  const inputClass = `min-h-12 w-full rounded-xl border px-3.5 text-base outline-none sm:text-sm ${
    isDark
      ? "border-white/10 bg-white/[0.055] text-white"
      : "border-slate-200 bg-white text-slate-900"
  }`;

  return (
    <main className="mx-auto w-full max-w-4xl pb-6">
      <section className="mb-5 flex items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">
            <Sparkles className="h-3.5 w-3.5" />
            Hybrid settings
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] sm:text-3xl">
            Mobile shop settings
          </h1>
          <p className={`mt-1 text-sm ${muted}`}>
            Keep useful data while reducing photo storage.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
            isDark
              ? "border-white/10 bg-white/5"
              : "border-slate-200 bg-white"
          }`}
          aria-label="Refresh settings"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </section>

      {error ? (
        <div
          role="alert"
          className="mb-5 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"
        >
          <CircleAlert className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      <section className={`overflow-hidden rounded-2xl border shadow-sm ${panelClass}`}>
        <div
          className={`flex items-center gap-3 border-b p-4 sm:p-5 ${
            isDark ? "border-white/10" : "border-slate-200"
          }`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500 text-white">
            <ImageOff className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-black">Completed photo retention</h2>
            <p className={`mt-0.5 text-[11px] ${muted}`}>
              Pending worker photos are never deleted.
            </p>
          </div>
        </div>

        <div className="grid gap-5 p-4 sm:p-5">
          <label
            className={`flex cursor-pointer items-center gap-4 rounded-2xl border p-4 ${
              isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50"
            }`}
          >
            <input
              type="checkbox"
              checked={settings.deleteCompletedPhotos}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  deleteCompletedPhotos: event.target.checked,
                }))
              }
              className="h-5 w-5 accent-orange-500"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black">
                Automatically delete completed photos
              </span>
              <span className={`mt-1 block text-[11px] leading-5 ${muted}`}>
                Product name, quantity, price, transaction, notes and timestamps
                remain permanently.
              </span>
            </span>
          </label>

          <label className="max-w-xs">
            <span className={`mb-1.5 block text-xs font-bold ${muted}`}>
              Delete photo after
            </span>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="365"
                step="1"
                value={settings.photoRetentionDays}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    photoRetentionDays: Math.max(
                      1,
                      Math.min(365, Number(event.target.value) || 1)
                    ),
                  }))
                }
                className={`${inputClass} pr-16`}
                disabled={!settings.deleteCompletedPhotos}
              />
              <span
                className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold ${muted}`}
              >
                days
              </span>
            </div>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div
              className={`flex gap-3 rounded-2xl border p-4 ${
                isDark ? "border-white/10" : "border-slate-200"
              }`}
            >
              <Database className="h-5 w-5 shrink-0 text-emerald-500" />
              <div>
                <h3 className="text-xs font-black">Data is kept</h3>
                <p className={`mt-1 text-[10px] leading-5 ${muted}`}>
                  Every log record and inventory transaction remains searchable.
                </p>
              </div>
            </div>
            <div
              className={`flex gap-3 rounded-2xl border p-4 ${
                isDark ? "border-white/10" : "border-slate-200"
              }`}
            >
              <Clock3 className="h-5 w-5 shrink-0 text-sky-500" />
              <div>
                <h3 className="text-xs font-black">Timer starts when complete</h3>
                <p className={`mt-1 text-[10px] leading-5 ${muted}`}>
                  The upload date does not trigger deletion while details are pending.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={saving || loading}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-black text-white shadow-lg shadow-orange-500/20 disabled:opacity-50 sm:justify-self-start"
          >
            {saving ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save settings
          </button>
        </div>
      </section>

      <section className={`mt-5 rounded-2xl border p-4 shadow-sm sm:p-5 ${panelClass}`}>
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <HardDrive className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black">Storage cleanup</h2>
            <p className={`mt-1 text-[11px] leading-5 ${muted}`}>
              Runs automatically every day. You can also process eligible photos
              now.
            </p>
          </div>
        </div>

        {cleanupResult ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { label: "Scanned", value: cleanupResult.scanned },
              { label: "Eligible", value: cleanupResult.eligible },
              { label: "Deleted", value: cleanupResult.deleted },
            ].map((metric) => (
              <div
                key={metric.label}
                className={`rounded-xl p-3 text-center ${
                  isDark ? "bg-white/5" : "bg-slate-50"
                }`}
              >
                <div className="font-mono text-lg font-black">{metric.value}</div>
                <div className={`mt-1 text-[9px] font-bold ${muted}`}>
                  {metric.label}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void runCleanup()}
          disabled={
            cleaning || loading || !settings.deleteCompletedPhotos
          }
          className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 text-xs font-black disabled:opacity-50 sm:w-auto ${
            isDark
              ? "border-white/10 bg-white/5 hover:bg-white/10"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          {cleaning ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Run cleanup now
        </button>
      </section>

      <section
        className={`mt-5 flex items-start gap-3 rounded-2xl border p-4 ${
          isDark
            ? "border-emerald-400/15 bg-emerald-400/5"
            : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <Settings className="h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <h2 className="text-xs font-black">Current hybrid policy</h2>
          <p className={`mt-1 text-[11px] leading-5 ${muted}`}>
            {settings.deleteCompletedPhotos
              ? `Keep every record, then remove only its photo ${settings.photoRetentionDays} day${settings.photoRetentionDays === 1 ? "" : "s"} after the required details are saved.`
              : "Keep all records and all photos until automatic cleanup is enabled."}
          </p>
        </div>
      </section>

      {notice ? (
        <div
          role="status"
          className={`fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-[90] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl ${
            isDark
              ? "border-emerald-400/20 bg-[#122019] text-emerald-200"
              : "border-emerald-200 bg-white text-emerald-700"
          }`}
        >
          <Check className="h-4 w-4" />
          {notice}
        </div>
      ) : null}
    </main>
  );
}
