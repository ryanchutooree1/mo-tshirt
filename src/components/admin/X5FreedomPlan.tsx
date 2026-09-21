"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  Banknote,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Clock3,
  Gauge,
  Landmark,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Sprout,
  Target,
  Trash2,
  WalletCards,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  calculateX5FreedomGoal,
  calculateX5FreedomGoalSummary,
  calculateX5FreedomPlan,
  EMPTY_X5_FREEDOM_PLAN,
  normalizeX5FreedomPlan,
  type X5FreedomGoal,
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
  const goalSummary = useMemo(
    () => calculateX5FreedomGoalSummary(plan.goals),
    [plan.goals]
  );

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

  function addGoal() {
    const goal: X5FreedomGoal = {
      id: crypto.randomUUID(),
      name: "",
      target: "",
      actual: "",
      rule: "MOTHER",
    };
    update("goals", [...plan.goals, goal]);
  }

  function updateGoal<K extends keyof Omit<X5FreedomGoal, "id">>(
    goalId: string,
    key: K,
    value: X5FreedomGoal[K]
  ) {
    update(
      "goals",
      plan.goals.map((goal) =>
        goal.id === goalId ? { ...goal, [key]: value } : goal
      )
    );
  }

  function removeGoal(goalId: string) {
    update("goals", plan.goals.filter((goal) => goal.id !== goalId));
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

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <ChartNoAxesColumnIncreasing className="h-5 w-5 text-[#f0442a]" /> Freedom buckets
              </h3>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                Add any goal, then enter its target and actual value. The graph updates automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={addGoal}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#141921] px-4 text-xs font-bold text-white transition hover:bg-[#252c36]"
            >
              <Plus className="h-4 w-4" /> Add bucket
            </button>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr]">
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-sky-800">
                <ShieldCheck className="h-4 w-4" /> Mother · protected
              </div>
              <div className="mt-2 text-lg font-bold text-slate-950">{formatMoney(goalSummary.motherProtected)}</div>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">Stays inside the business and keeps producing.</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                <Sprout className="h-4 w-4" /> Child · usable
              </div>
              <div className="mt-2 text-lg font-bold text-slate-950">{formatMoney(goalSummary.childUsable)}</div>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">Money produced by the Mother. This is what you can use.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                <span>All buckets</span>
                <span>{goalSummary.overallProgressPercent}%</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-[#f0442a] transition-[width] duration-300"
                  style={{ width: `${goalSummary.overallProgressPercent}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between gap-3 text-[11px] text-slate-500">
                <span>Actual {formatMoney(goalSummary.totalActual)}</span>
                <span>Target {formatMoney(goalSummary.totalTarget)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4 sm:p-6">
          {plan.goals.length ? plan.goals.map((goal) => {
            const amounts = calculateX5FreedomGoal(goal);
            const isMother = goal.rule === "MOTHER";
            return (
              <div key={goal.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(180px,1.3fr)_160px_1fr_1fr_auto] lg:items-end">
                  <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    Bucket name
                    <input
                      value={goal.name}
                      onChange={(event) => updateGoal(goal.id, "name", event.target.value)}
                      placeholder="e.g. Emergency fund"
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-[#f0442a] focus:ring-4 focus:ring-[#f0442a]/10"
                    />
                  </label>
                  <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    Money rule
                    <select
                      value={goal.rule}
                      onChange={(event) => updateGoal(goal.id, "rule", event.target.value as X5FreedomGoal["rule"])}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-[#f0442a] focus:ring-4 focus:ring-[#f0442a]/10"
                    >
                      <option value="MOTHER">Mother · protect</option>
                      <option value="CHILD">Child · usable</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    Actual
                    <span className="flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-[#f0442a] focus-within:ring-4 focus-within:ring-[#f0442a]/10">
                      <span className="mr-2 text-xs text-slate-400">Rs</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="decimal"
                        value={goal.actual}
                        onChange={(event) => updateGoal(goal.id, "actual", event.target.value)}
                        placeholder="0"
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-normal text-slate-900 outline-none"
                      />
                    </span>
                  </label>
                  <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    Target
                    <span className="flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-[#f0442a] focus-within:ring-4 focus-within:ring-[#f0442a]/10">
                      <span className="mr-2 text-xs text-slate-400">Rs</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="decimal"
                        value={goal.target}
                        onChange={(event) => updateGoal(goal.id, "target", event.target.value)}
                        placeholder="0"
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-normal text-slate-900 outline-none"
                      />
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeGoal(goal.id)}
                    aria-label={`Delete ${goal.name || "bucket"}`}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-1 font-bold ${isMother ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {isMother ? "MOTHER · DO NOT USE" : "CHILD · AVAILABLE TO USE"}
                      </span>
                      <span className="text-slate-400">{formatMoney(amounts.remaining)} remaining</span>
                    </div>
                    <span className="font-bold text-slate-700">{amounts.progressPercent}%</span>
                  </div>
                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ${isMother ? "bg-sky-500" : "bg-emerald-500"}`}
                      style={{ width: `${amounts.progressPercent}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-[11px] text-slate-400">
                    <span>Actual {formatMoney(amounts.actual)}</span>
                    <span>Target {formatMoney(amounts.target)}</span>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center">
              <ChartNoAxesColumnIncreasing className="mx-auto h-8 w-8 text-slate-300" />
              <h4 className="mt-3 text-sm font-bold text-slate-700">Create your first money bucket</h4>
              <p className="mt-1 text-xs text-slate-400">Start with “Emergency fund,” then add its target and actual value.</p>
              <button
                type="button"
                onClick={addGoal}
                className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#141921] px-4 text-xs font-bold text-white"
              >
                <Plus className="h-4 w-4" /> Add first bucket
              </button>
            </div>
          )}
        </div>
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
