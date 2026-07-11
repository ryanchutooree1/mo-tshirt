"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { getMetadata, list, ref as storageRef } from "firebase/storage";
import {
  Activity,
  Cloud,
  Database,
  HardDrive,
  RefreshCw,
} from "lucide-react";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import { storage } from "@/lib/firebase";
import {
  ensureAdminFirebaseSession,
  isFirebaseAdminAuthConfigured,
} from "@/lib/firebase-admin-client-auth";

type UsageSnapshot = {
  usedBytes: number;
  limitBytes: number;
  isEstimate?: boolean;
};

type StatusPayload = {
  configured: boolean;
  connection: string;
  env: string | null;
  error?: string;
  storage?: UsageSnapshot & { databaseName: string };
  storageError?: string;
};

type TestPayload = {
  ok?: boolean;
  latencyMs?: number;
  error?: string;
  database?: {
    version: string;
    table: string;
    rowCount: number;
  };
};

const configuredFirebaseLimitGb = Number(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_LIMIT_GB);
const FIREBASE_LIMIT_BYTES = (Number.isFinite(configuredFirebaseLimitGb) && configuredFirebaseLimitGb > 0 ? configuredFirebaseLimitGb : 5) * 1024 * 1024 * 1024;

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** exponent).toFixed(exponent < 2 ? 1 : 2)} ${units[exponent]}`;
}

function usagePercent(usage: UsageSnapshot | null) {
  if (!usage || usage.limitBytes <= 0) return 0;
  return Math.max(0, Math.min(100, (usage.usedBytes / usage.limitBytes) * 100));
}

async function sumStoragePrefix(path: string): Promise<number> {
  async function walk(folderPath: string, pageToken?: string): Promise<number> {
    const page = await list(storageRef(storage, folderPath), { maxResults: 1000, pageToken });
    const metadata = await Promise.all(page.items.map((item) => getMetadata(item).catch(() => null)));
    const fileBytes = metadata.reduce(
      (total, item) => total + (typeof item?.size === "number" ? item.size : 0),
      0
    );
    const nestedBytes = await Promise.all(page.prefixes.map((prefix) => walk(prefix.fullPath)));
    const total = fileBytes + nestedBytes.reduce((sum, value) => sum + value, 0);
    return page.nextPageToken ? total + await walk(folderPath, page.nextPageToken) : total;
  }
  return walk(path);
}

function StorageMeter({
  title,
  detail,
  icon,
  usage,
  loading,
  error,
  isDark,
}: {
  title: string;
  detail: string;
  icon: ReactNode;
  usage: UsageSnapshot | null;
  loading: boolean;
  error: string | null;
  isDark: boolean;
}) {
  const percentage = usagePercent(usage);
  return (
    <article className={`rounded-2xl border p-5 ${isDark ? "border-white/10 bg-[#101613]" : "border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)]"}`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${isDark ? "bg-white/[0.07] text-orange-300" : "bg-orange-50 text-orange-600"}`}>{icon}</span>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${usage?.isEstimate ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
          {usage?.isEstimate ? "Estimate" : "Live"}
        </span>
      </div>
      <h2 className="mt-4 text-base font-bold">{title}</h2>
      <p className={`mt-1 text-xs ${isDark ? "text-white/45" : "text-slate-500"}`}>{detail}</p>
      {loading ? (
        <div className={`mt-5 h-2 animate-pulse rounded-full ${isDark ? "bg-white/10" : "bg-slate-100"}`} />
      ) : error ? (
        <p className="mt-5 text-xs font-semibold text-rose-500">{error}</p>
      ) : (
        <>
          <div className="mt-5 flex items-end justify-between gap-3">
            <strong className="text-2xl tracking-tight">{percentage.toFixed(1)}%</strong>
            <span className={`text-right text-[11px] ${isDark ? "text-white/45" : "text-slate-500"}`}>
              {formatBytes(usage?.usedBytes || 0)} of {formatBytes(usage?.limitBytes || 0)}
            </span>
          </div>
          <div role="progressbar" aria-label={`${title} usage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percentage)} className={`mt-3 h-2.5 overflow-hidden rounded-full ${isDark ? "bg-white/10" : "bg-slate-100"}`}>
            <div className="h-full rounded-full bg-[linear-gradient(90deg,#ff6400,#ff9a52)] transition-all" style={{ width: `${Math.max(percentage, percentage > 0 ? 1 : 0)}%` }} />
          </div>
        </>
      )}
    </article>
  );
}

export default function DockerPostgresAdminPage() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [result, setResult] = useState<TestPayload | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firebaseUsage, setFirebaseUsage] = useState<UsageSnapshot | null>(null);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [firebaseLoading, setFirebaseLoading] = useState(true);
  const [hostingUsage, setHostingUsage] = useState<UsageSnapshot | null>(null);
  const [hostingProvider, setHostingProvider] = useState("Vercel");
  const [hostingError, setHostingError] = useState<string | null>(null);
  const [hostingLoading, setHostingLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/docker-postgres/test", { cache: "no-store" });
      const data = await res.json().catch(() => ({})) as StatusPayload;
      if (!res.ok) throw new Error(data.error || "Could not load PostgreSQL status.");
      setStatus(data);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load PostgreSQL status.");
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const loadStorage = useCallback(async () => {
    setFirebaseLoading(true);
    setHostingLoading(true);
    setFirebaseError(null);
    setHostingError(null);
    await Promise.all([
      (async () => {
        try {
          if (!isFirebaseAdminAuthConfigured() || !(await ensureAdminFirebaseSession())) {
            throw new Error("Firebase storage session is unavailable.");
          }
          const [documents, quotes] = await Promise.all([
            sumStoragePrefix("documents"),
            sumStoragePrefix("quotes"),
          ]);
          setFirebaseUsage({ usedBytes: documents + quotes, limitBytes: FIREBASE_LIMIT_BYTES });
        } catch (nextError) {
          setFirebaseError(nextError instanceof Error ? nextError.message : "Could not load Firebase storage.");
        } finally {
          setFirebaseLoading(false);
        }
      })(),
      (async () => {
        try {
          const res = await fetch("/api/admin/docker-postgres/storage", { cache: "no-store" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || "Could not load host storage.");
          setHostingProvider(data?.provider || "Vercel");
          setHostingUsage({
            usedBytes: Number(data?.usedBytes || 0),
            limitBytes: Number(data?.limitBytes || 0),
            isEstimate: data?.isEstimate !== false,
          });
        } catch (nextError) {
          setHostingError(nextError instanceof Error ? nextError.message : "Could not load host storage.");
        } finally {
          setHostingLoading(false);
        }
      })(),
    ]);
  }, []);

  async function runTest() {
    setTesting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/docker-postgres/test", { method: "POST" });
      const data = await res.json().catch(() => ({}) ) as TestPayload;
      if (!res.ok || !data.ok) throw new Error(data.error || "PostgreSQL test failed.");
      setResult(data);
      await loadStatus();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "PostgreSQL test failed.");
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    void Promise.all([loadStatus(), loadStorage()]);
  }, [loadStatus, loadStorage]);

  const panelClass = `rounded-2xl border ${isDark ? "border-white/10 bg-[#101613]" : "border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)]"}`;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <header className={`${panelClass} flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6`}>
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${isDark ? "text-orange-300" : "text-orange-600"}`}>System</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Database & storage</h1>
        </div>
        <button type="button" onClick={() => void Promise.all([loadStatus(), loadStorage()])} disabled={loadingStatus || firebaseLoading || hostingLoading} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-xs font-semibold ${isDark ? "border-white/10 bg-white/[0.06] hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
          <RefreshCw className={`h-4 w-4 ${loadingStatus ? "animate-spin" : ""}`} /> Refresh
        </button>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <StorageMeter title="Firebase Storage" detail="Documents and quotation attachments" icon={<Cloud className="h-5 w-5" />} usage={firebaseUsage} loading={firebaseLoading} error={firebaseError} isDark={isDark} />
        <StorageMeter title={hostingProvider} detail="Current host footprint" icon={<HardDrive className="h-5 w-5" />} usage={hostingUsage} loading={hostingLoading} error={hostingError} isDark={isDark} />
        <StorageMeter title="PostgreSQL" detail={status?.storage?.databaseName || "Application database"} icon={<Database className="h-5 w-5" />} usage={status?.storage || null} loading={loadingStatus} error={status?.storageError || error} isDark={isDark} />
      </section>

      <section className={`${panelClass} grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_280px]`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-500" /><h2 className="font-bold">PostgreSQL connection</h2></div>
          <div className={`mt-4 rounded-xl border p-4 ${isDark ? "border-white/10 bg-black/20" : "border-slate-200 bg-slate-50"}`}>
            <div className={`text-sm font-semibold ${status?.configured ? "text-emerald-500" : "text-rose-500"}`}>
              {loadingStatus ? "Checking…" : status?.configured ? "Connection configured" : "Connection missing"}
            </div>
            <div className={`mt-2 break-all font-mono text-[11px] ${isDark ? "text-white/40" : "text-slate-500"}`}>{status?.connection || "No PostgreSQL URL configured."}</div>
          </div>
          {result?.ok ? <p className="mt-3 text-xs font-semibold text-emerald-500">Test passed in {result.latencyMs}ms · {result.database?.rowCount || 0} test rows</p> : null}
          {error ? <p className="mt-3 text-xs font-semibold text-rose-500">{error}</p> : null}
        </div>
        <button type="button" onClick={() => void runTest()} disabled={testing || loadingStatus} className="min-h-12 self-end rounded-xl bg-[#ff6400] px-5 text-sm font-bold text-white transition hover:bg-[#e95b00] disabled:opacity-50">
          {testing ? "Running test…" : "Test PostgreSQL"}
        </button>
      </section>
    </main>
  );
}
