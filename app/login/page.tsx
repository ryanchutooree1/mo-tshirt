"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const next = params.get("next") || "/admin";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Login failed. Try again.");
        setSubmitting(false);
        return;
      }
      router.push(next);
    } catch {
      setError("Network error. Please retry.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F9F9F9] px-6 py-16">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 transition hover:text-black" aria-label="Back to homepage">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M10.03 4.97a.75.75 0 0 1 0 1.06L5.06 11h15.19a.75.75 0 0 1 0 1.5H5.06l4.97 4.97a.75.75 0 1 1-1.06 1.06l-6.25-6.25a.75.75 0 0 1 0-1.06l6.25-6.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
          Back to homepage
        </Link>

        <div className="w-full rounded-[32px] border border-[#EAEAEA] bg-white p-10 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <Image src="/logo_transparent.png" alt="MO T-SHIRT logo" width={120} height={48} className="h-12 w-auto" />
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">Admin Access</h1>
            <p className="mt-2 text-sm text-neutral-600">Sign in with the admin password to manage MO T-SHIRT.</p>
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-6" aria-describedby={error ? "login-error" : undefined}>
            <div>
              <label htmlFor="password" className="text-sm font-medium text-neutral-800">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-[#EAEAEA] bg-white px-4 py-3 text-sm text-black shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/5"
                placeholder="••••••••"
                autoComplete="current-password"
                required
                autoFocus
              />
            </div>
            {error && (
              <p id="login-error" role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-700"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen grid place-items-center p-6">Loading…</main>}>
      <LoginInner />
    </Suspense>
  );
}
