// app/admin/calculator/page.tsx
"use client";

import Link from "next/link";
import React, { useState } from "react";
import { formatMoney as formatDisplayMoney } from "@/lib/money";

/**
 * Admin Calculator page
 * Paste into: app/admin/calculator/page.tsx
 * Self-contained client component with the Calculator UI.
 */

function CalculatorCard() {
  const [expr, setExpr] = useState<string>('');
  const [result, setResult] = useState<number | null>(null);

  // Margin / markup helper
  const [cost, setCost] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [vat, setVat] = useState<number>(15);

  const allowed = /^[0-9+\-*/().\s%]*$/;

  const evalExpr = (s: string): number | null => {
    try {
      if (!allowed.test(s)) return null;
      const replaced = s.replace(/%/g, '*0.01');
      const val = Function(`"use strict"; return (${replaced})`)();
      return typeof val === 'number' && isFinite(val) ? val : null;
    } catch {
      return null;
    }
  };

  const onEquals = () => setResult(evalExpr(expr));
  const push = (t: string) => setExpr((e) => (e + t));
  const back = () => setExpr((e) => e.slice(0, -1));
  const clear = () => { setExpr(''); setResult(null); };

  const costNum  = Number.parseFloat(cost)  || 0;
  const priceNum = Number.parseFloat(price) || 0;
  const profit   = priceNum - costNum;
  const margin   = priceNum > 0 ? (profit / priceNum) * 100 : 0;
  const markup   = costNum  > 0 ? (profit / costNum)  * 100 : 0;
  const priceWithVat = priceNum * (1 + vat / 100);

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h3 className="text-lg font-bold mb-3">Calculator</h3>

      {/* Expression */}
      <div className="mb-2">
        <input
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          placeholder="Type: 1250*3 + 12% - 40"
          className="w-full border rounded-lg px-3 py-2"
        />
        <div className="mt-1 text-sm text-gray-600">
          {result !== null ? <>Result: <span className="font-semibold">{formatDisplayMoney(result)}</span></> : ' '}
        </div>
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {['7','8','9','/','4','5','6','*','1','2','3','-','0','.','%','+','(',')','C','='].map((b) => (
          <button
            key={b}
            onClick={() => (b === '=' ? onEquals() : b === 'C' ? clear() : push(b))}
            className={`py-2 rounded-lg border hover:bg-gray-50 ${b==='=' ? 'col-span-1 bg-black text-white hover:bg-gray-800' : ''}`}
          >
            {b}
          </button>
        ))}
        <button onClick={back} className="py-2 rounded-lg border hover:bg-gray-50 col-span-4">⌫ Backspace</button>
      </div>

      {/* Pricing Helper */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-sm font-semibold mb-1">Pricing Helper</div>
          <div className="flex gap-2 mb-2">
            <input
              type="number"
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="Cost"
              className="flex-1 border rounded-lg px-3 py-2"
            />
            <input
              type="number"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Price"
              className="flex-1 border rounded-lg px-3 py-2"
            />
          </div>
          <div className="text-xs text-gray-600">
            Profit: <span className="font-semibold">{formatDisplayMoney(profit)}</span> •
            {' '}Margin: <span className="font-semibold">{isFinite(margin) ? margin.toFixed(1) : '0.0'}%</span> •
            {' '}Markup: <span className="font-semibold">{isFinite(markup) ? markup.toFixed(1) : '0.0'}%</span>
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold mb-1">VAT / Discount</div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs text-gray-600">VAT %</label>
            <input
              type="number"
              value={vat}
              onChange={(e) => setVat(Number(e.target.value) || 0)}
              className="w-20 border rounded-lg px-2 py-1"
            />
            <div className="text-xs text-gray-600 ml-auto">
              Price + VAT: <span className="font-semibold">{formatDisplayMoney(priceWithVat)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPrice((p) => String(((Number(p) || 0) * 0.9).toFixed(2)))} className="px-3 py-1 border rounded-lg text-sm hover:bg-gray-50">−10% Discount</button>
            <button onClick={() => setPrice((p) => String(((Number(p) || 0) * 1.1).toFixed(2)))} className="px-3 py-1 border rounded-lg text-sm hover:bg-gray-50">+10% Markup</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminCalculatorPage() {
  return (
    <main className="min-h-screen px-6 py-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-sm text-slate-600 hover:underline">← Admin</Link>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold">Calculator</h1>
          <p className="text-sm text-slate-500 mt-1">Quick margin, VAT and ad-hoc calculations. Same UI as the dashboard calculator.</p>
        </div>
        <div />
      </div>

      <section className="bg-white rounded-xl shadow p-4">
        <CalculatorCard />
      </section>
    </main>
  );
}
