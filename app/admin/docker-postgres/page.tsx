"use client";

import { useEffect, useState } from "react";

type StatusPayload = {
  configured: boolean;
  connection: string;
  env: string | null;
  error?: string;
};

type TestPayload = {
  ok?: boolean;
  latencyMs?: number;
  error?: string;
  database?: {
    version: string;
    table: string;
    rowCount: number;
    inserted: {
      id: string;
      label: string;
      created_at: string;
    } | null;
  };
};

export default function DockerPostgresAdminPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [result, setResult] = useState<TestPayload | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    setLoadingStatus(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/docker-postgres/test", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as StatusPayload;
      if (!res.ok) throw new Error(data.error || "Could not load PostgreSQL status.");
      setStatus(data);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Could not load PostgreSQL status.");
    } finally {
      setLoadingStatus(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/docker-postgres/test", {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as TestPayload;
      if (!res.ok || !data.ok) throw new Error(data.error || "PostgreSQL test failed.");
      setResult(data);
      await loadStatus();
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "PostgreSQL test failed.");
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_46px_rgba(15,23,42,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Docker PostgreSQL
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          Database connection test
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Use this page to verify that the app can connect to a PostgreSQL database
          running from Docker, Vercel Sandbox, or any reachable PostgreSQL host.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_46px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Connection</h2>
              <p className="mt-1 text-sm text-slate-500">
                Reads from <code className="font-mono">POSTGRES_TEST_DATABASE_URL</code>, then falls back to{" "}
                <code className="font-mono">DATABASE_URL</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadStatus()}
              disabled={loadingStatus || testing}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingStatus ? "Checking..." : "Refresh"}
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Status
            </p>
            <p className={`mt-2 text-lg font-semibold ${status?.configured ? "text-emerald-700" : "text-rose-700"}`}>
              {loadingStatus
                ? "Checking connection string..."
                : status?.configured
                  ? "Connection string configured"
                  : "Connection string missing"}
            </p>
            <p className="mt-2 break-all font-mono text-xs text-slate-600">
              {status?.connection || "No PostgreSQL URL configured."}
            </p>
            {status?.env ? (
              <p className="mt-2 text-xs font-semibold text-slate-500">
                Source env: {status.env}
              </p>
            ) : null}
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
              {error}
            </div>
          ) : null}

          {result?.ok ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <p className="font-semibold">PostgreSQL test passed in {result.latencyMs}ms.</p>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Table</dt>
                  <dd className="mt-1 font-mono">{result.database?.table}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Rows</dt>
                  <dd className="mt-1 font-mono">{result.database?.rowCount}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Inserted ID</dt>
                  <dd className="mt-1 font-mono">{result.database?.inserted?.id}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Label</dt>
                  <dd className="mt-1 break-all font-mono">{result.database?.inserted?.label}</dd>
                </div>
              </dl>
              <p className="mt-3 break-words text-xs text-emerald-800">
                {result.database?.version}
              </p>
            </div>
          ) : null}
        </div>

        <aside className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_46px_rgba(15,23,42,0.08)]">
          <h2 className="text-lg font-semibold text-slate-950">Run test</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The test creates <code className="font-mono">admin_docker_postgres_tests</code>,
            inserts one row, then reads the row count back.
          </p>
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={testing || loadingStatus}
            className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {testing ? "Running test..." : "Run PostgreSQL test"}
          </button>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-600">
            <p className="font-semibold text-slate-900">Local Docker URL</p>
            <code className="mt-2 block break-all font-mono">
              postgresql://mo_tshirt:mo_tshirt_dev@localhost:54329/mo_tshirt_docker_test
            </code>
          </div>
        </aside>
      </section>
    </main>
  );
}
