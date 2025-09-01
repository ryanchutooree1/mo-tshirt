"use client";

import { useState } from "react";

function safeEval(expr: string): number | string {
  // Allow only numbers, operators, parentheses, decimal points, and spaces
  const ok = /^[0-9+\-*/(). %]*$/.test(expr);
  if (!ok) return "Invalid input";
  try {
    const fn = new Function(`return (${expr})`);
    const res = fn();
    if (typeof res === "number" && Number.isFinite(res)) return res;
    return "Error";
  } catch {
    return "Error";
  }
}

export default function CalculatorPage() {
  const [expr, setExpr] = useState("");
  const [out, setOut] = useState<string>("");

  function press(s: string) {
    setExpr((e) => e + s);
  }
  function clearAll() {
    setExpr("");
    setOut("");
  }
  function backspace() {
    setExpr((e) => e.slice(0, -1));
  }
  function evaluate() {
    const r = safeEval(expr.trim());
    setOut(String(r));
  }

  const keys = [
    "7",
    "8",
    "9",
    "/",
    "4",
    "5",
    "6",
    "*",
    "1",
    "2",
    "3",
    "-",
    "0",
    ".",
    "(",
    ")",
    "+",
    "%",
  ];

  return (
    <main className="px-6 py-10 max-w-md mx-auto">
      <h1 className="text-2xl font-bold">Calculator</h1>
      <p className="text-gray-600 mt-2">Quick math with a big keypad.</p>

      <div className="mt-6 rounded-2xl border p-4 bg-white shadow">
        <input
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          className="w-full text-right text-2xl font-mono px-3 py-2 border rounded-lg"
          placeholder="Enter expression"
        />
        <div className="mt-3 text-right text-lg min-h-6">{out}</div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {keys.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="py-3 rounded-lg border bg-gray-50 hover:bg-gray-100"
            >
              {k}
            </button>
          ))}
          <button onClick={backspace} className="py-3 rounded-lg border bg-yellow-50 hover:bg-yellow-100 col-span-2">
            Del
          </button>
          <button onClick={clearAll} className="py-3 rounded-lg border bg-red-50 hover:bg-red-100">
            C
          </button>
          <button onClick={evaluate} className="py-3 rounded-lg border bg-emerald-500 text-white hover:bg-emerald-600">
            =
          </button>
        </div>
      </div>
    </main>
  );
}
