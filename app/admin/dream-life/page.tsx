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

export default function DreamLifePage() {
  const year = new Date().getFullYear();
  const [sectors, setSectors] = useState<Sector[]>(() =>
    DEFAULT_SECTORS.map((s) => ({ ...s, checked: false, note: "" }))
  );

  // Load/save state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSectors(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sectors));
    } catch {}
  }, [sectors]);

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

  const reset = () => setSectors(DEFAULT_SECTORS.map((s) => ({ ...s, checked: false, note: "" })));

  const angleStep = 360 / sectors.length;

  // Precompute label positions
  const labelPositions = useMemo(
    () => sectors.map((_, i) => polarToXY(radius + 30, i * angleStep)),
    [sectors.length]
  );

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">DESIGNING MY DREAM LIFE</h1>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">
            Assess where you see yourself today in relation to your ideal level in each area. Click a circle to mark a weekly task as done (turns green). Add a note inside each circle. Use Reset to clear.
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

          {/* Sector labels and interactive circles */}
          {sectors.map((s, i) => {
            const angle = i * angleStep;
            const pt = polarToXY(radius + 10, angle);
            const pin = polarToXY(radius - 25, angle);
            const color = s.checked ? "#22c55e" : "#ffffff";
            const stroke = s.checked ? "#16a34a" : "#d1d5db";
            const textColor = s.checked ? "#065f46" : "#374151";
            return (
              <g key={s.key}>
                {/* label around edge */}
                <text x={pt.x} y={pt.y} textAnchor="middle" fontSize="10" className="fill-gray-500" transform={`rotate(${angle}, ${pt.x}, ${pt.y})`}>
                  {s.label}
                </text>
                {/* clickable small circle */}
                <circle
                  cx={pin.x}
                  cy={pin.y}
                  r={16}
                  fill={color}
                  stroke={stroke}
                  onClick={() => toggleSector(i)}
                  style={{ cursor: "pointer" }}
                />
                {/* text inside the circle using foreignObject */}
                <foreignObject x={pin.x - 14} y={pin.y - 10} width={28} height={20}>
                  <input
                    value={s.note}
                    onChange={(e) => updateNote(i, e.target.value)}
                    className="w-full h-full text-[10px] text-center bg-transparent outline-none"
                    placeholder=""/>
                </foreignObject>
                {/* check mark when checked */}
                {s.checked && (
                  <text x={pin.x} y={pin.y + 3} textAnchor="middle" fontSize="14" fill="#ffffff" fontWeight="700">✓</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend inputs similar to screenshot */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
        <div>
          <div className="font-semibold text-gray-800 mb-2">SCORE</div>
          <ul className="space-y-2">
            {sectors.slice(0, 6).map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <button
                  onClick={() => toggleSector(i)}
                  className={`h-4 w-4 rounded-sm border ${s.checked ? "bg-green-500 border-green-600" : "bg-white border-gray-300"}`}
                  aria-label={`Toggle ${s.label}`}
                />
                <span className="text-gray-700">{s.label}</span>
                <input
                  value={s.note}
                  onChange={(e) => updateNote(i, e.target.value)}
                  className="ml-auto w-16 border rounded px-2 py-1 text-xs"
                  placeholder="note"
                />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-semibold text-gray-800 mb-2">SCORE</div>
          <ul className="space-y-2">
            {sectors.slice(6, 12).map((s, idx) => {
              const i = idx + 6;
              return (
                <li key={s.key} className="flex items-center gap-2">
                  <button
                    onClick={() => toggleSector(i)}
                    className={`h-4 w-4 rounded-sm border ${s.checked ? "bg-green-500 border-green-600" : "bg-white border-gray-300"}`}
                    aria-label={`Toggle ${s.label}`}
                  />
                  <span className="text-gray-700">{s.label}</span>
                  <input
                    value={s.note}
                    onChange={(e) => updateNote(i, e.target.value)}
                    className="ml-auto w-16 border rounded px-2 py-1 text-xs"
                    placeholder="note"
                  />
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <div className="font-semibold text-gray-800 mb-2">COLOR</div>
          <p className="text-gray-500">Use the green circles on the wheel to mark completion. Notes can be written inside each circle or in the list.</p>
        </div>
      </div>
    </div>
  );
}

