"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, PencilLine, Utensils } from "lucide-react";

type PlanResponse = {
  day: string;
  weekday: string;
  food: string;
  confirmed: boolean;
  error?: string;
};

export default function FoodConfirmationClient({
  day,
  expires,
  token,
}: {
  day: string;
  expires: string;
  token: string;
}) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [weekday, setWeekday] = useState("");
  const [food, setFood] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const query = new URLSearchParams({ day, expires, token });
        const response = await fetch(`/api/food-confirmation?${query}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const result = (await response.json().catch(() => ({}))) as PlanResponse;
        if (!response.ok) throw new Error(result.error || "Unable to open this food plan.");
        setWeekday(result.weekday);
        setFood(result.food);
        setConfirmed(result.confirmed);
      } catch (loadError) {
        if ((loadError as Error).name !== "AbortError") {
          setError(loadError instanceof Error ? loadError.message : "Unable to open this food plan.");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [day, expires, token]);

  async function confirmDinner() {
    if (!food.trim() || submitting || confirmed) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/food-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, expires, token, food }),
      });
      const result = (await response.json().catch(() => ({}))) as PlanResponse;
      if (!response.ok) throw new Error(result.error || "Unable to confirm dinner.");
      setFood(result.food);
      setWeekday(result.weekday);
      setConfirmed(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to confirm dinner.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff7ed_0,#fff_45%,#f8fafc_100%)] px-4 py-10 text-slate-950">
      <section className="w-full max-w-md overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-2xl shadow-orange-100/70">
        <div className="bg-slate-950 px-6 py-7 text-white">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500">
            <Utensils className="h-6 w-6" />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-300">Food Planning</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Tonight&apos;s dinner</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Confirm the preset meal, or change it first.
          </p>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center gap-3 text-sm font-bold text-slate-500">
              <LoaderCircle className="h-5 w-5 animate-spin" /> Loading today&apos;s meal…
            </div>
          ) : error && !food ? (
            <div className="rounded-2xl bg-red-50 p-5 text-sm font-semibold leading-6 text-red-700">{error}</div>
          ) : confirmed ? (
            <div className="py-5 text-center">
              <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
              <h2 className="mt-4 text-2xl font-black">Dinner confirmed</h2>
              <p className="mt-2 text-slate-600">The confirmation email has been sent.</p>
              <div className="mt-6 rounded-2xl bg-emerald-50 px-4 py-5">
                <p className="text-xs font-black uppercase tracking-wider text-emerald-700">{weekday}</p>
                <p className="mt-1 text-xl font-black text-emerald-950">{food}</p>
              </div>
            </div>
          ) : (
            <>
              <label className="block text-sm font-black text-slate-700">
                <span className="mb-2 flex items-center justify-between">
                  <span>{weekday}</span>
                  <span className="flex items-center gap-1 text-xs font-bold text-slate-400">
                    <PencilLine className="h-3.5 w-3.5" /> Editable
                  </span>
                </span>
                <input
                  value={food}
                  onChange={(event) => setFood(event.target.value)}
                  maxLength={160}
                  autoComplete="off"
                  className="w-full rounded-2xl border-2 border-slate-200 px-4 py-4 text-lg font-bold outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                  aria-label="Tonight's food"
                />
              </label>
              {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
              <button
                type="button"
                onClick={confirmDinner}
                disabled={!food.trim() || submitting}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-base font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                {submitting ? "Confirming…" : "Confirm dinner"}
              </button>
              <p className="mt-4 text-center text-xs leading-5 text-slate-400">
                Pressing confirm sends the final dinner choice by email.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
