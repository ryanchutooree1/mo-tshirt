// Next-level Daily Progress (App Router) — Weighted KPIs, Revenue Target, Pipeline, Streaks, Mini-CRM
// Drop in at /app/progress/page.tsx (or /pages/progress.tsx for Pages Router)
// Uses Tailwind + localStorage. Optional charts via recharts (already available in this environment per instructions).

'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

// ====== CONFIG ======
// Map KPI → target count and weight (impact on revenue). Tweak to fit MO T‑SHIRT.
const DEFAULT_KPIS = [
  { id: 'outreach', label: 'Qualified Outreach (B2B)', target: 10, weight: 0.15 },
  { id: 'convos', label: 'Conversations (reply received)', target: 6, weight: 0.2 },
  { id: 'meetings', label: 'Meetings Booked', target: 3, weight: 0.25 },
  { id: 'proposals', label: 'Proposals/Retainers Sent', target: 3, weight: 0.25 },
  { id: 'deposits', label: 'Deposits Collected', target: 2, weight: 0.15 },
]

const STORAGE = {
  kpis: 'mo-v2-kpis',
  date: 'mo-v2-date',
  streak: 'mo-v2-streak',
  revenueTarget: 'mo-v2-revenueTarget',
  deals: 'mo-v2-deals',
  history: 'mo-v2-history',
}

// Pipeline stage probabilities for expected value calc.
const STAGES = [
  { id: 'lead', label: 'Lead', prob: 0.1 },
  { id: 'qualified', label: 'Qualified', prob: 0.35 },
  { id: 'meeting', label: 'Meeting', prob: 0.55 },
  { id: 'proposal', label: 'Proposal', prob: 0.7 },
  { id: 'verbal', label: 'Verbal Yes', prob: 0.9 },
  { id: 'won', label: 'Won', prob: 1.0 },
]

// ====== HOOKS ======
function usePersist<T>(key: string, init: T) {
  const [state, setState] = useState<T>(init)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) setState(JSON.parse(raw))
    } catch {}
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {}
  }, [key, state])
  return [state, setState] as const
}

// ====== PAGE ======
export default function ProgressPage() {
  const today = new Date().toISOString().slice(0, 10)

  const [kpis, setKpis] = usePersist(
    STORAGE.kpis,
    DEFAULT_KPIS.map((k) => ({ ...k, value: 0 }))
  )
  const [date, setDate] = useState<string>(today)
  const [streak, setStreak] = usePersist<number>(STORAGE.streak, 0)
  const [revenueTarget, setRevenueTarget] = usePersist<number>(
    STORAGE.revenueTarget,
    50000
  ) // Rs per day goal
  const [deals, setDeals] = usePersist<any[]>(STORAGE.deals, [])
  const [history, setHistory] = usePersist<any[]>(STORAGE.history, [])

  // Reset counts if day changed; update streak if >= 80% score yesterday
  useEffect(() => {
    const savedDate = localStorage.getItem(STORAGE.date)
    if (savedDate !== today) {
      // compute yesterday score → streak logic
      if (savedDate) {
        const last = JSON.parse(localStorage.getItem(STORAGE.kpis) || '[]')
        const lastScore = computeWeighted(last).pct
        setStreak((s) => (lastScore >= 80 ? s + 1 : 0))
        // push to history for chart
        setHistory((h) =>
          [
            ...h,
            {
              date: savedDate,
              pct: lastScore,
              dealsWon: (JSON.parse(localStorage.getItem(STORAGE.deals) || '[]') as any[]).filter(
                (d) => d.stage === 'won'
              ).length,
            },
          ].slice(-30)
        )
      }
      // new day
      setKpis((prev) => prev.map((k) => ({ ...k, value: 0 })))
      setDeals([])
      localStorage.setItem(STORAGE.date, today)
      setDate(today)
    }
  }, [])

  const totals = useMemo(() => computeWeighted(kpis), [kpis])

  const revenue = useMemo(() => {
    const expected = deals.reduce((sum, d) => {
      const stageProb = STAGES.find((s) => s.id === d.stage)?.prob || 0
      return sum + Number(d.value || 0) * stageProb
    }, 0)
    const won = deals
      .filter((d) => d.stage === 'won')
      .reduce((s, d) => s + Number(d.value || 0), 0)
    const pct = revenueTarget > 0 ? Math.min(100, Math.round((expected / revenueTarget) * 100)) : 0
    return { expected, won, pct }
  }, [deals, revenueTarget])

  const bump = (id: string, delta: number) =>
    setKpis((prev) => prev.map((k) => (k.id === id ? { ...k, value: Math.max(0, (k.value || 0) + delta) } : k)))
  const setTarget = (id: string, n: number) =>
    setKpis((prev) => prev.map((k) => (k.id === id ? { ...k, target: Math.max(0, n) } : k)))
  const setWeight = (id: string, w: number) =>
    setKpis((prev) => prev.map((k) => (k.id === id ? { ...k, weight: Math.max(0, Math.min(1, w)) } : k)))

  const addDeal = () =>
    setDeals((d) => [
      ...d,
      { id: crypto.randomUUID(), name: 'New Deal', value: 10000, stage: 'lead' },
    ])
  const updateDeal = (id: string, patch: any) =>
    setDeals((arr) => arr.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  const removeDeal = (id: string) => setDeals((arr) => arr.filter((d) => d.id !== id))

  return (
    <main className="min-h-screen bg-white px-6 py-8">
      <div className="max-w-6xl mx-auto">
        <Header date={date} streak={streak} pct={totals.pct} done={totals.done} goal={totals.goal} />

        {/* Overall Weighted Progress */}
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm text-gray-500">Weighted Daily Score</div>
              <div className="text-2xl font-semibold">{totals.pct}%</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Completed Actions</div>
              <div className="text-sm">{totals.done} / {totals.goal} (weighted)</div>
            </div>
          </div>
          <ProgressBar pct={totals.pct} height={10} />
        </Card>

        {/* KPI Grid */}
        <section className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {kpis.map((k) => (
            <Card key={k.id}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">{k.label}</h3>
                <span className="text-sm text-gray-500">{Math.min(k.value, k.target)} / {k.target}</span>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => bump(k.id, -1)} className="px-3 py-2 rounded-xl border hover:bg-gray-50">−</button>
                <div className="min-w-[3ch] text-center font-semibold">{k.value}</div>
                <button onClick={() => bump(k.id, +1)} className="px-3 py-2 rounded-xl border border-gray-900 bg-black text-white hover:opacity-90">+1</button>
                <button onClick={() => bump(k.id, +5)} className="px-3 py-2 rounded-xl border border-gray-900 bg-black text-white hover:opacity-90">+5</button>
              </div>

              <label className="text-xs text-gray-500">Daily target</label>
              <div className="flex items-center gap-2 mb-2">
                <input type="number" min={0} value={k.target} onChange={(e) => setTarget(k.id, Number(e.target.value))} className="w-24 rounded-xl border px-3 py-2" />
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-2 rounded-full" style={{ width: `${Math.min(100, (k.value / Math.max(1, k.target)) * 100)}%`, background: 'linear-gradient(90deg,#111827,#6B7280)' }} />
                </div>
              </div>

              <label className="text-xs text-gray-500">Weight (impact)</label>
              <input type="number" min={0} max={1} step={0.05} value={k.weight} onChange={(e) => setWeight(k.id, Number(e.target.value))} className="w-24 rounded-xl border px-3 py-2" />
            </Card>
          ))}
        </section>

        {/* Revenue Target & Expected Value */}
        <section className="grid lg:grid-cols-3 gap-4 mb-6">
          <Card className="lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Revenue Target (Today)</h3>
              <input type="number" min={0} value={revenueTarget} onChange={(e) => setRevenueTarget(Number(e.target.value))} className="w-36 rounded-xl border px-3 py-1" />
            </div>
            <div className="text-sm text-gray-600 mb-2">Expected based on pipeline</div>
            <div className="text-2xl font-semibold mb-2">Rs {formatNumber(revenue.expected)}</div>
            <ProgressBar pct={revenue.pct} />
            <div className="text-xs text-gray-500 mt-2">Won today: Rs {formatNumber(revenue.won)}</div>
          </Card>

          <Card className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Momentum (Last 14 days)</h3>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[...history.slice(-13), { date: today, pct: totals.pct }]}> 
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip />
                  <Line type="monotone" dataKey="pct" stroke="#111827" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>

        {/* Deals Mini-CRM */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Pipeline (Expected Value)</h3>
            <button onClick={addDeal} className="px-3 py-2 rounded-xl border bg-black text-white">Add Deal</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-2">Client</th>
                  <th>Value (Rs)</th>
                  <th>Stage</th>
                  <th className="text-right">EV (Rs)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => {
                  const prob = STAGES.find((s) => s.id === d.stage)?.prob || 0
                  const ev = Number(d.value || 0) * prob
                  return (
                    <tr key={d.id} className="border-t">
                      <td className="py-2 pr-2">
                        <input value={d.name} onChange={(e) => updateDeal(d.id, { name: e.target.value })} className="w-full border rounded-lg px-2 py-1" />
                      </td>
                      <td className="pr-2">
                        <input type="number" value={d.value} onChange={(e) => updateDeal(d.id, { value: Number(e.target.value) })} className="w-32 border rounded-lg px-2 py-1" />
                      </td>
                      <td className="pr-2">
                        <select value={d.stage} onChange={(e) => updateDeal(d.id, { stage: e.target.value })} className="border rounded-lg px-2 py-1">
                          {STAGES.map((s) => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="text-right font-medium">{formatNumber(ev)}</td>
                      <td className="text-right">
                        <button onClick={() => removeDeal(d.id)} className="text-red-600">Remove</button>
                      </td>
                    </tr>
                  )
                })}
                {deals.length === 0 && (
                  <tr>
                    <td className="py-4 text-gray-500" colSpan={5}>No deals yet. Click “Add Deal”.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="text-xs text-gray-400 mt-6">Tip: Only track actions that predict cash. Weights shape the score toward what closes retainers.</p>
      </div>
    </main>
  )
}

// ====== UI Bits ======
function Header({ date, streak, pct, done, goal }: any) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Daily Revenue Progress</h1>
        <div className="text-sm text-gray-500">{date} • Streak: <span className="font-medium text-gray-700">{streak} days</span></div>
      </div>
      <div className="text-right">
        <div className="text-xs text-gray-500">Weighted score</div>
        <div className="text-2xl font-semibold">{pct}%</div>
        <div className="text-xs text-gray-500">{done} / {goal} actions</div>
      </div>
    </div>
  )
}

function Card({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  return <section className={`rounded-2xl border border-gray-200 p-5 shadow-sm ${className}`}>{children}</section>
}

function ProgressBar({ pct, height = 8 }: { pct: number; height?: number }) {
  return (
    <div className="w-full bg-gray-200 rounded-full overflow-hidden" style={{ height }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#111827,#6B7280)' }} />
    </div>
  )
}

// ====== HELPERS ======
function computeWeighted(list: any[]) {
  const totalWeight = list.reduce((s, k) => s + (k.weight || 0), 0) || 1
  const score = list.reduce((sum, k) => {
    const pct = Math.min(1, (k.value || 0) / Math.max(1, k.target || 1))
    return sum + pct * (k.weight || 0)
  }, 0)
  const doneWeighted = list.reduce((sum, k) => sum + Math.min(k.value || 0, k.target || 0) * (k.weight || 0), 0)
  const goalWeighted = list.reduce((sum, k) => sum + (k.target || 0) * (k.weight || 0), 0) || 1
  return {
    pct: Math.round((score / totalWeight) * 100),
    done: Math.round(doneWeighted),
    goal: Math.round(goalWeighted),
  }
}

function formatNumber(n: number) {
  return new Intl.NumberFormat('en-MU', { maximumFractionDigits: 0 }).format(Math.round(n || 0))
}
