"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  Banknote,
  CalendarDays,
  Clock3,
  Gauge,
  Landmark,
  Save,
  Sparkles,
  Target,
  WalletCards,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  calculateX5FreedomPlan,
  EMPTY_X5_FREEDOM_PLAN,
  normalizeX5FreedomPlan,
  type X5FreedomPlan,
} from "@/lib/x5-freedom";

const FREEDOM_PLAN_PATH = ["users", "mo-owner", "x5FreedomPlan", "current"] as const;

function formatMoney(value: number) {
  return `Rs ${Math.round(value).toLocaleString("en-US")}`;
}

function formatMonths(value: number) {
  if (!value) return "0 months";
  return `${value.toFixed(value >= 10 ? 0 : 1)} months`;
}

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  placeholder = "0",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-bold text-slate-600">
      {label}
      <span className="flex h-11 items-center rounded-xl border border-slate-200 bg-white px-3 transition focus-within:border-[#f0442a] focus-within:ring-4 focus-within:ring-[#f0442a]/10">
        {prefix ? <span className="mr-2 text-xs font-semibold text-slate-400">{prefix}</span> : null}
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-normal text-slate-900 outline-none"
        />
        {suffix ? <span className="ml-2 text-xs font-semibold text-slate-400">{suffix}</span> : null}
      </span>
    </label>
  );
}

export default function X5FreedomPlanPanel() {
  const [plan, setPlan] = useState<X5FreedomPlan>(EMPTY_X5_FREEDOM_PLAN);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const revision = useRef(0);
  const loaded = useRef(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    const reference = doc(db, ...FREEDOM_PLAN_PATH);
    return onSnapshot(
      reference,
      (snapshot) => {
        if (!dirtyRef.current) {
          setPlan(normalizeX5FreedomPlan(snapshot.exists() ? snapshot.data() : null));
        }
        loaded.current = true;
        setLoading(false);
        setNotice("");
      },
      (error) => {
        console.error("Could not load X5 freedom plan", error);
        setNotice("Your Freedom Plan could not be loaded. Check the database connection.");
        setLoading(false);
      }
    );
  }, []);

  const calculations = useMemo(() => calculateX5FreedomPlan(plan), [plan]);

  const savePlan = useCallback(async () => {
    if (!loaded.current || !dirty || saving) return true;
    const savingRevision = revision.current;
    setSaving(true);
    setNotice("");
    try {
      await setDoc(
        doc(db, ...FREEDOM_PLAN_PATH),
        {
          ...plan,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      if (revision.current === savingRevision) {
        dirtyRef.current = false;
        setDirty(false);
      }
      setNotice("Saved to your private Freedom Plan.");
      return true;
    } catch (error) {
      console.error("Could not save X5 freedom plan", error);
      setNotice("Your changes did not save. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [dirty, plan, saving]);

  useEffect(() => {
    if (!dirty || !loaded.current) return;
    const timeout = window.setTimeout(() => void savePlan(), 900);
    return () => window.clearTimeout(timeout);
  }, [dirty, plan, savePlan]);

  function update<K extends keyof X5FreedomPlan>(key: K, value: X5FreedomPlan[K]) {
    revision.current += 1;
    dirtyRef.current = true;
    setPlan((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setNotice("");
  }

  const outputCards = [
    {
      label: "Freedom income target",
      value: formatMoney(calculations.freedomMonthlyTarget),
      hint: "Required each month",
      Icon: Target,
    },
    {
      label: "Income gap",
      value: formatMoney(calculations.monthlyGap),
      hint: `${calculations.incomeCoveragePercent}% covered`,
      Icon: Gauge,
    },
    {
      label: "Cash runway",
      value: formatMonths(calculations.currentRunwayMonths),
      hint: `Target ${formatMoney(calculations.targetCashReserve)}`,
      Icon: Landmark,
    },
    {
      label: "Time reclaimed",
      value: `${calculations.weeklyHoursReclaimed} hrs`,
      hint: "Per week at your target",
      Icon: Clock3,
    },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[520px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-400">
        Loading your Freedom Plan…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center sm:px-8 sm:py-14">
        <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-[#f0442a]" />
        <div className="mx-auto max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#f0442a]">
            <Sparkles className="h-3.5 w-3.5" /> Your numbers, your definition
          </div>
          <h2 className="mt-5 font-serif text-3xl leading-[1.05] tracking-[-0.035em] text-slate-950 sm:text-5xl">
            building a business that<br className="hidden sm:block" /> brings me freedom
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-500">
            Enter your real numbers below. The plan calculates the gap between today and a business that supports your money, time, and lifestyle goals.
          </p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {outputCards.map(({ label, value, hint, Icon }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</div>
                <div className="mt-2 text-xl font-bold tracking-[-0.03em] text-slate-950">{value}</div>
                <div className="mt-1 text-[11px] text-slate-400">{hint}</div>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#f0442a]">
                <Icon className="h-4 w-4" />
              </span>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <WalletCards className="h-4 w-4 text-[#f0442a]" /> Define your freedom number
            </h3>
            <p className="mt-1 text-xs text-slate-400">Monthly costs plus the safety margin you choose.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Personal living costs" prefix="Rs" value={plan.personalMonthlyCost} onChange={(value) => update("personalMonthlyCost", value)} />
            <NumberField label="Business operating costs" prefix="Rs" value={plan.businessMonthlyCost} onChange={(value) => update("businessMonthlyCost", value)} />
            <NumberField label="Lifestyle / freedom budget" prefix="Rs" value={plan.lifestyleMonthlyCost} onChange={(value) => update("lifestyleMonthlyCost", value)} />
            <NumberField label="Safety buffer" suffix="%" value={plan.safetyBufferPercent} onChange={(value) => update("safetyBufferPercent", value)} />
          </div>
        </div>

        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Banknote className="h-4 w-4 text-[#f0442a]" /> Record today’s reality
            </h3>
            <p className="mt-1 text-xs text-slate-400">Use actual figures so the gap stays honest.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Owner-independent monthly income" prefix="Rs" value={plan.independentMonthlyIncome} onChange={(value) => update("independentMonthlyIncome", value)} />
            <NumberField label="Current monthly profit" prefix="Rs" value={plan.currentMonthlyProfit} onChange={(value) => update("currentMonthlyProfit", value)} />
            <NumberField label="Available cash reserve" prefix="Rs" value={plan.cashReserve} onChange={(value) => update("cashReserve", value)} />
            <NumberField label="Current working time" suffix="hrs / week" value={plan.currentWeeklyHours} onChange={(value) => update("currentWeeklyHours", value)} />
          </div>
        </div>

        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <CalendarDays className="h-4 w-4 text-[#f0442a]" /> Set the destination
            </h3>
            <p className="mt-1 text-xs text-slate-400">Choose when and how you want freedom to feel.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Target cash runway" suffix="months" value={plan.targetRunwayMonths} onChange={(value) => update("targetRunwayMonths", value)} />
            <NumberField label="Target working time" suffix="hrs / week" value={plan.targetWeeklyHours} onChange={(value) => update("targetWeeklyHours", value)} />
            <label className="grid gap-1.5 text-xs font-bold text-slate-600 sm:col-span-2">
              Target freedom date
              <input
                type="date"
                value={plan.targetDate}
                onChange={(event) => update("targetDate", event.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-[#f0442a] focus:ring-4 focus:ring-[#f0442a]/10"
              />
            </label>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <label className="grid gap-1.5 text-xs font-bold text-slate-600">
            What freedom looks like to me
            <textarea
              value={plan.vision}
              onChange={(event) => update("vision", event.target.value)}
              placeholder="Describe the life and business you are building toward…"
              className="min-h-28 resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal leading-6 text-slate-800 outline-none focus:border-[#f0442a] focus:ring-4 focus:ring-[#f0442a]/10"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-slate-600">
            Numbers, assumptions, and next decisions
            <textarea
              value={plan.notes}
              onChange={(event) => update("notes", event.target.value)}
              placeholder="Add any extra numbers or notes you want to track…"
              className="min-h-28 resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal leading-6 text-slate-800 outline-none focus:border-[#f0442a] focus:ring-4 focus:ring-[#f0442a]/10"
            />
          </label>
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className={`text-xs font-semibold ${notice.includes("not") || notice.includes("could not") ? "text-rose-600" : "text-slate-400"}`}>
          {notice || (dirty ? "Saving automatically…" : "Your Freedom Plan is saved.")}
        </div>
        <button
          type="button"
          onClick={() => void savePlan()}
          disabled={!dirty || saving}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#141921] px-5 text-sm font-bold text-white transition hover:bg-[#252c36] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save now"}
        </button>
      </div>
    </div>
  );
}
