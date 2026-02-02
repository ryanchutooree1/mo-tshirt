"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

type MoneyLine = {
  id: string;
  label: string;
  amount: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DEFAULT_INCOMES: MoneyLine[] = [
  { id: "salary", label: "Salary", amount: 55000 },
  { id: "business", label: "Business income", amount: 35000 },
  { id: "rent", label: "Rent income", amount: 12000 },
];

const DEFAULT_EXPENSES: MoneyLine[] = [
  { id: "housing", label: "Housing / Mortgage", amount: 20000 },
  { id: "utilities", label: "Utilities", amount: 4500 },
  { id: "transport", label: "Transport", amount: 6500 },
  { id: "food", label: "Food & essentials", amount: 12000 },
  { id: "staff", label: "Staff / Support", amount: 8000 },
  { id: "other", label: "Other", amount: 3500 },
];

const FINANCE_DOC_REF = doc(db, "adminSettings", "financeFreedom");

const formatCurrency = (value: number) => `Rs ${Math.round(value || 0).toLocaleString()}`;

const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildMonthlySeries = (income: number, expenses: number) => {
  return MONTHS.map((month, index) => {
    const wave = Math.sin((index + 1) / 12 * Math.PI * 2);
    const variance = 0.06 * wave;
    const incomeValue = income * (1 + variance);
    const expenseValue = expenses * (1 - variance * 0.8);
    return {
      month,
      income: Math.max(0, incomeValue),
      expenses: Math.max(0, expenseValue),
      net: incomeValue - expenseValue,
    };
  });
};

const normalizeLines = (lines: unknown, fallback: MoneyLine[], prefix: string) => {
  if (!Array.isArray(lines) || !lines.length) return fallback;
  return lines.map((line, index) => ({
    id: String((line as MoneyLine)?.id || `${prefix}-${index}`),
    label: String((line as MoneyLine)?.label || "Item"),
    amount: Number.isFinite(Number((line as MoneyLine)?.amount))
      ? Number((line as MoneyLine)?.amount)
      : 0,
  }));
};

export default function FinanceFreedomPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [incomes, setIncomes] = useState<MoneyLine[]>(DEFAULT_INCOMES);
  const [expenses, setExpenses] = useState<MoneyLine[]>(DEFAULT_EXPENSES);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const hasLoadedRef = useRef(false);
  const skipSaveRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const totalIncome = useMemo(
    () => incomes.reduce((sum, line) => sum + (Number.isFinite(line.amount) ? line.amount : 0), 0),
    [incomes]
  );
  const totalExpenses = useMemo(
    () => expenses.reduce((sum, line) => sum + (Number.isFinite(line.amount) ? line.amount : 0), 0),
    [expenses]
  );
  const net = totalIncome - totalExpenses;
  const coverageRatio = totalExpenses > 0 ? totalIncome / totalExpenses : 0;
  const freedomScore = totalExpenses > 0 ? Math.max(0, (totalIncome - totalExpenses) / totalExpenses) : 0;
  const salaryLine = incomes.find((line) => line.label.toLowerCase().includes("salary"));
  const salaryCovers = salaryLine ? salaryLine.amount >= totalExpenses : false;
  const monthlySeries = useMemo(() => buildMonthlySeries(totalIncome, totalExpenses), [totalIncome, totalExpenses]);

  const handleUnlock = () => {
    if (password.trim() === "godlove") {
      setUnlocked(true);
      setPassword("");
      setPasswordError(null);
      return;
    }
    setPasswordError("Incorrect password.");
  };

  if (!unlocked) {
    return (
      <main className="min-h-screen bg-[#f7f7fb] text-slate-900">
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="w-full max-w-sm rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Finance Freedom</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Enter password</h1>
            <p className="mt-2 text-sm text-slate-600">This page is protected.</p>
            <div className="mt-5 space-y-3">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-black focus:outline-none"
                placeholder="Password"
              />
              {passwordError && <p className="text-xs text-rose-600">{passwordError}</p>}
              <button
                type="button"
                onClick={handleUnlock}
                className="inline-flex w-full items-center justify-center rounded-full bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-900"
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const updateLine = (
    setter: React.Dispatch<React.SetStateAction<MoneyLine[]>>,
    id: string,
    patch: Partial<MoneyLine>
  ) => {
    setter((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...patch } : line))
    );
  };

  const addLine = (setter: React.Dispatch<React.SetStateAction<MoneyLine[]>>, prefix: string) => {
    const id = `${prefix}-${Date.now()}`;
    setter((prev) => [...prev, { id, label: "New item", amount: 0 }]);
  };

  const removeLine = (setter: React.Dispatch<React.SetStateAction<MoneyLine[]>>, id: string) => {
    setter((prev) => prev.filter((line) => line.id !== id));
  };

  useEffect(() => {
    const unsub = onSnapshot(
      FINANCE_DOC_REF,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          skipSaveRef.current = true;
          setIncomes(normalizeLines(data?.incomes, DEFAULT_INCOMES, "income"));
          setExpenses(normalizeLines(data?.expenses, DEFAULT_EXPENSES, "expense"));
        }
        hasLoadedRef.current = true;
        setSyncStatus("idle");
      },
      () => {
        hasLoadedRef.current = true;
        setSyncStatus("error");
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    setSyncStatus("saving");
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(async () => {
      try {
        await setDoc(
          FINANCE_DOC_REF,
          {
            incomes,
            expenses,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        setSyncStatus("saved");
      } catch {
        setSyncStatus("error");
      }
    }, 600);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [incomes, expenses]);

  return (
    <main className="min-h-screen bg-[#f7f7fb] text-slate-900">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-24 top-[-10rem] h-72 w-72 rounded-full bg-emerald-200/50 blur-3xl" />
        <div className="pointer-events-none absolute right-[-6rem] top-16 h-80 w-80 rounded-full bg-orange-200/40 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-10rem] left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-slate-200/60 blur-3xl" />

        <div className="relative mx-auto w-full max-w-6xl px-6 py-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500">MO Admin</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Finance Freedom</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Track income streams, compare against monthly bills, and prove that green covers red.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
                {salaryLine ? (
                  salaryCovers ? "Salary covers every month's expenses" : "Salary does not fully cover expenses"
                ) : (
                  "Add a salary line to measure coverage"
                )}
              </div>
              <div
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  syncStatus === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-600"
                    : syncStatus === "saving"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {syncStatus === "saving" ? "Saving..." : syncStatus === "error" ? "Save failed" : "Saved"}
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[24px] border border-emerald-100 bg-white/90 p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Total income</p>
              <p className="mt-3 text-2xl font-semibold text-emerald-700">{formatCurrency(totalIncome)}</p>
            </div>
            <div className="rounded-[24px] border border-rose-100 bg-white/90 p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Total expenses</p>
              <p className="mt-3 text-2xl font-semibold text-rose-600">{formatCurrency(totalExpenses)}</p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white/90 p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Net monthly</p>
              <p className={`mt-3 text-2xl font-semibold ${net >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                {formatCurrency(net)}
              </p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white/90 p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Freedom score</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">
                {(freedomScore * 100).toFixed(0)}%
              </p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600"
                  style={{ width: `${Math.min(100, freedomScore * 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Monthly coverage</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">Green covers red bills</h2>
                </div>
                <div className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
                  Coverage {totalExpenses > 0 ? `${coverageRatio.toFixed(2)}x` : "0x"}
                </div>
              </div>

              <div className="mt-6 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlySeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }}
                    />
                    <ReferenceLine y={totalExpenses} stroke="#f87171" strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="url(#expenseFill)" strokeWidth={2} />
                    <Area type="monotone" dataKey="income" stroke="#10b981" fill="url(#incomeFill)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm">
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Income streams</p>
                    <button
                      type="button"
                      onClick={() => addLine(setIncomes, "income")}
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                    >
                      <FiPlus /> Add income
                    </button>
                  </div>
                  <div className="mt-3 space-y-3">
                    {incomes.map((line) => (
                      <div key={line.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <input
                          value={line.label}
                          onChange={(e) => updateLine(setIncomes, line.id, { label: e.target.value })}
                          className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none"
                        />
                        <input
                          type="number"
                          value={line.amount}
                          onChange={(e) => updateLine(setIncomes, line.id, { amount: toNumber(e.target.value) })}
                          className="w-28 rounded-xl border border-slate-200 bg-white px-2 py-1 text-right text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeLine(setIncomes, line.id)}
                          className="rounded-full border border-slate-200 px-2 py-2 text-slate-400 hover:bg-white"
                          aria-label="Remove income"
                        >
                          <FiTrash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Monthly bills</p>
                    <button
                      type="button"
                      onClick={() => addLine(setExpenses, "expense")}
                      className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600"
                    >
                      <FiPlus /> Add bill
                    </button>
                  </div>
                  <div className="mt-3 space-y-3">
                    {expenses.map((line) => (
                      <div key={line.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <input
                          value={line.label}
                          onChange={(e) => updateLine(setExpenses, line.id, { label: e.target.value })}
                          className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none"
                        />
                        <input
                          type="number"
                          value={line.amount}
                          onChange={(e) => updateLine(setExpenses, line.id, { amount: toNumber(e.target.value) })}
                          className="w-28 rounded-xl border border-slate-200 bg-white px-2 py-1 text-right text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeLine(setExpenses, line.id)}
                          className="rounded-full border border-slate-200 px-2 py-2 text-slate-400 hover:bg-white"
                          aria-label="Remove bill"
                        >
                          <FiTrash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
