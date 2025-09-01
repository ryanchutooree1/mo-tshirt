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
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white border rounded-2xl p-6 shadow-sm">
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
