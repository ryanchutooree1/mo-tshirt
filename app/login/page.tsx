"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const next = params.get("next") || "/admin";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Login failed");
        return;
      }
      router.push(next);
    } catch {
      setError("Network error");
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <a
          href="/"
          aria-label="Back to homepage"
          className="mb-3 inline-flex items-center text-sm text-gray-700 hover:text-gray-900"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M10.03 4.97a.75.75 0 0 1 0 1.06L5.06 11h15.19a.75.75 0 0 1 0 1.5H5.06l4.97 4.97a.75.75 0 1 1-1.06 1.06l-6.25-6.25a.75.75 0 0 1 0-1.06l6.25-6.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
          <span className="ml-1">Back to homepage</span>
        </a>
        <form onSubmit={onSubmit} className="w-full bg-white border rounded-2xl p-6 shadow-sm">
          <h1 className="text-xl font-bold">Admin Login</h1>
          <p className="text-xs text-gray-500 mt-1">Enter the admin password.</p>
          <label className="block mt-4 text-sm font-medium">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2"
            placeholder="••••••••"
            required
          />
          {error && (
            <div className="mt-3 text-sm text-red-600" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="mt-5 w-full bg-black text-white py-2 rounded-lg hover:bg-gray-800">
            Sign in
          </button>
        </form>
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
