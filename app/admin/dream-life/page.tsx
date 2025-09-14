"use client";

import { useEffect, useMemo, useState } from "react";

type Sector = {
  key: string;
  label: string;
  checked: boolean;
  note: string;
};

const DEFAULT_SECTORS: Omit<Sector, "checked" | "note">[] = [
  { key: "health", label: "HEALTH & FITNESS" },
  { key: "selfdev", label: "SELF DEVELOPMENT" },
  { key: "lifestyle", label: "LIFESTYLE" },
  { key: "giving", label: "GIVING" },
  { key: "spiritual", label: "SPIRITUALITY" },
  { key: "travel", label: "TRAVEL" },
  { key: "hobbies", label: "FUN & HOBBIES" },
  { key: "home", label: "HOME" },
  { key: "family", label: "FRIENDS & FAMILY" },
  { key: "romance", label: "ROMANCE" },
  { key: "career", label: "CAREER / BUSINESS" },
  { key: "finances", label: "FINANCES" },
];

const STORAGE_KEY = "dream-life-v1";
type Cell = { text: string; checked: boolean };

export default function DreamLifePage() {
  const year = new Date().getFullYear();
  const [sectors, setSectors] = useState<Sector[]>(() =>
    DEFAULT_SECTORS.map((s) => ({ ...s, checked: false, note: "" }))
  );
  // 3 annular bands like the screenshot
  const bands = 3;
  const [cells, setCells] = useState<Cell[][]>(() =>
    Array.from({ length: bands }, () =>
      Array.from({ length: DEFAULT_SECTORS.length }, () => ({ text: "", checked: false }))
    )
  );

  // Load/save state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.sectors) setSectors(parsed.sectors);
        if (parsed?.cells) setCells(parsed.cells);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ sectors, cells })
      );
    } catch {}
  }, [sectors, cells]);

  const radius = 260;
  const rings = 10;
  const cx = 320;
  const cy = 320;
  const size = 640;

  const polarToXY = (r: number, angleDeg: number) => {
    const a = (angleDeg - 90) * (Math.PI / 180);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const toggleSector = (i: number) =>
    setSectors((arr) => arr.map((s, idx) => (idx === i ? { ...s, checked: !s.checked } : s)));

  const updateNote = (i: number, note: string) =>
    setSectors((arr) => arr.map((s, idx) => (idx === i ? { ...s, note } : s)));

  const reset = () => {
    setSectors(DEFAULT_SECTORS.map((s) => ({ ...s, checked: false, note: "" })));
    setCells(Array.from({ length: bands }, () => Array.from({ length: DEFAULT_SECTORS.length }, () => ({ text: "", checked: false }))));
  };

  const angleStep = 360 / sectors.length;

  // Precompute label positions
  const labelPositions = useMemo(
    () => sectors.map((_, i) => polarToXY(radius + 30, i * angleStep)),
    [sectors.length]
  );

  const annularPath = (r0: number, r1: number, a0: number, a1: number) => {
    const p0 = polarToXY(r0, a0);
    const p1 = polarToXY(r0, a1);
    const p2 = polarToXY(r1, a1);
    const p3 = polarToXY(r1, a0);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${p0.x} ${p0.y} A ${r0} ${r0} 0 ${large} 1 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${r1} ${r1} 0 ${large} 0 ${p3.x} ${p3.y} Z`;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">DESIGNING MY DREAM LIFE</h1>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">
            Type inside each ring segment (like A, B, C…) and click to mark it green. Use Reset to clear.
          </p>
        </div>
        <button onClick={reset} className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-gray-50">
          Reset
        </button>
      </header>

      <div className="overflow-auto">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto block">
          {/* Background rings */}
          {[...Array(rings)].map((_, i) => (
            <circle key={i} cx={cx} cy={cy} r={(radius / rings) * (i + 1)} fill="none" stroke="#e5e7eb" />
          ))}

          {/* Spokes */}
          {sectors.map((_, i) => {
            const { x, y } = polarToXY(radius, i * angleStep);
            return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" />;
          })}

          {/* Center year */}
          <circle cx={cx} cy={cy} r={60} fill="#ffffff" stroke="#e5e7eb" />
          <text x={cx} y={cy + 6} textAnchor="middle" className="fill-gray-800" fontSize="20" fontWeight="700">
            {year}
          </text>

          {/* Sector labels (around the edge) */}
          {sectors.map((s, i) => {
            const angle = i * angleStep;
            const pt = polarToXY(radius + 10, angle);
            return (
              <g key={s.key}>
                <text x={pt.x} y={pt.y} textAnchor="middle" fontSize="10" className="fill-gray-500" transform={`rotate(${angle}, ${pt.x}, ${pt.y})`}>
                  {s.label}
                </text>
              </g>
            );
          })}

          {/* Annular segmented cells (3 bands x 12 sectors) */}
          {cells.map((row, b) => {
            const r1 = radius - 20 - b * (radius / 4);
            const r0 = r1 - (radius / 4) + 10;
            return (
              <g key={`band-${b}`}>
                {row.map((cell, i) => {
                  const a0 = i * angleStep + 2;
                  const a1 = (i + 1) * angleStep - 2;
                  const d = annularPath(r0, r1, a0, a1);
                  const midA = (a0 + a1) / 2;
                  const midR = (r0 + r1) / 2;
                  const w = Math.max(40, (Math.PI * (a1 - a0) / 180) * midR * 0.6);
                  const h = 22;
                  const c = polarToXY(midR, midA);
                  return (
                    <g key={`cell-${b}-${i}`}>
                      <path d={d} fill={cell.checked ? "#bbf7d0" : "#ffffff"} stroke="#d1d5db" onClick={() => {
                        setCells((prev) => prev.map((r, rb) => r.map((col, ci) => (rb === b && ci === i ? { ...col, checked: !col.checked } : col))));
                      }} style={{ cursor: "pointer" }} />
                      <foreignObject x={c.x - w / 2} y={c.y - h / 2} width={w} height={h}>
                        <div
                          xmlns="http://www.w3.org/1999/xhtml"
                          contentEditable
                          onInput={(e) => {
                            const val = (e.target as HTMLDivElement).innerText.slice(0, 12);
                            setCells((prev) => prev.map((r, rb) => r.map((col, ci) => (rb === b && ci === i ? { ...col, text: val } : col))));
                          }}
                          suppressContentEditableWarning
                          style={{
                            width: `${w}px`,
                            height: `${h}px`,
                            overflow: "hidden",
                            display: "grid",
                            placeItems: "center",
                            textAlign: "center",
                            fontSize: "12px",
                            lineHeight: 1.1,
                            color: "#111827",
                            background: "transparent",
                          }}
                        >
                          {cell.text}
                        </div>
                      </foreignObject>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Removed SCORE lists and text fields per request */}
    </div>
  );
}
