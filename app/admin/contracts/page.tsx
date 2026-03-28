// app/admin/contracts/page.tsx
"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";

type Contract = {
  id: string;
  name: string;
  value: number; // numeric value used to size the bubble
  color?: string;
};

const SAMPLE_CONTRACTS: Contract[] = [
  { id: "c1", name: "Mega Supply", value: 2_400_000, color: "#0f4c81" },
  { id: "c2", name: "Local Shop", value: 180_000, color: "#1f9d55" },
  { id: "c3", name: "Event Sponsor", value: 650_000, color: "#ff7f0e" },
  { id: "c4", name: "Small Dev", value: 45_000, color: "#6a3d9a" },
  { id: "c5", name: "Partner Co", value: 980_000, color: "#e31a1c" },
  { id: "c6", name: "Festival Stand", value: 360_000, color: "#6366f1" },
];

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/* ------------------- Helpers: packing, sizing ------------------ */
// Simple packing: compute radius from value and then place bubbles in a single row with gaps to avoid overlap.
// Center the whole row inside the container.
function computeRadii(contracts: Contract[], maxRadiusPx: number, minRadiusPx = 20) {
  const maxValue = Math.max(...contracts.map((c) => c.value), 1);
  return contracts.map((c) => {
    const scale = Math.sqrt(c.value / maxValue); // area-ish visual scaling
    const r = Math.max(minRadiusPx, Math.round(scale * maxRadiusPx));
    return r;
  });
}

function computePositions(radii: number[], containerWidth: number, gap = 16) {
  const diameters = radii.map((r) => r * 2);
  const totalWidth = diameters.reduce((s, d) => s + d, 0) + gap * (radii.length - 1);
  const startX = Math.max(16, (containerWidth - totalWidth) / 2); // 16px left padding
  const positions: number[] = [];
  let cursor = startX;
  for (let i = 0; i < radii.length; i++) {
    const r = radii[i];
    const x = cursor + r;
    positions.push(Math.round(x));
    cursor += diameters[i] + gap;
  }
  return positions;
}

/* --------------------------- Component -------------------------- */
export default function AdminContractsPage() {
  // Replace SAMPLE_CONTRACTS with your real data source if needed.
  const contracts = SAMPLE_CONTRACTS;

  // UI state
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [showTopN, setShowTopN] = useState<number | "all">("all");
  const [showLabels, setShowLabels] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pulseTopN, setPulseTopN] = useState(3);

  // container ref for responsive sizing
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(980);

  // tooltip
  const [tooltip, setTooltip] = useState<{ show: boolean; x: number; y: number; html: string }>({
    show: false,
    x: 0,
    y: 0,
    html: "",
  });

  // resize observer to adapt SVG to container width
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const w = Math.max(360, Math.floor(el.clientWidth));
      setContainerWidth(w);
    });
    ro.observe(el);
    // init
    setContainerWidth(Math.max(360, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  // sorted + filtered list
  const prepared = useMemo(() => {
    const sorted = [...contracts].sort((a, b) => (sortDir === "desc" ? b.value - a.value : a.value - b.value));
    if (showTopN === "all") return sorted;
    return sorted.slice(0, Number(showTopN));
  }, [contracts, sortDir, showTopN]);

  // sizing logic responsive to containerWidth
  const svgPadding = 32;
  const svgWidth = Math.max(360, containerWidth);
  const svgHeight = Math.max(240, Math.round(svgWidth * 0.45)); // keep a pleasant aspect ratio
  const maxRadiusPx = Math.max(40, Math.round(svgWidth * 0.12)); // max radius scales with width

  const radii = useMemo(() => computeRadii(prepared, maxRadiusPx, 18), [prepared, maxRadiusPx]);
  const positions = useMemo(() => computePositions(radii, svgWidth - svgPadding * 2, Math.round(svgWidth * 0.02)), [radii, svgWidth]);

  // compute total and indexes for top N highlighting
  const totalValue = prepared.reduce((s, c) => s + c.value, 0);
  const topIds = useMemo(() => prepared.slice(0, pulseTopN).map((c) => c.id), [prepared, pulseTopN]);

  // auto-select largest on first load for confidence
  useEffect(() => {
    if (prepared.length > 0) setSelectedId(prepared[0].id);
  }, [prepared]);

  /* -------------------- Export SVG -> PNG -------------------- */
  async function exportPNG(filename = "contracts-bubbles.png") {
    const svgEl = svgRef.current;
    if (!svgEl) return alert("SVG not ready");
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgEl);

    // add xmlns if missing and a small style reset for export clarity
    if (!/xmlns=/.test(source)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    // inline computed styles for better fidelity (optional improvement)
    // (We keep this minimal to avoid huge code inside)
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // 2x for hi-res
      canvas.width = svgWidth * 2;
      canvas.height = svgHeight * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return alert("Export failed (no 2D context)");
      }
      // white background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const png = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = png;
      a.download = filename;
      a.click();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert("Export failed. Your browser may block SVG export.");
    };
    img.src = url;
  }

  /* -------------------- Interactions -------------------- */
  function handleBubbleClick(id: string) {
    setSelectedId((s) => (s === id ? null : id));
  }

  function handleMouseMove(e: React.MouseEvent, c: Contract) {
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const x = e.clientX - svgRect.left + 8;
    const y = e.clientY - svgRect.top + 8;
    const pct = totalValue ? Math.round((c.value / totalValue) * 100) : 0;
    setTooltip({ show: true, x, y, html: `${c.name}<br/><strong>MUR ${fmtMoney(c.value)}</strong> • ${pct}% of shown` });
  }

  function handleMouseLeave() {
    setTooltip({ show: false, x: 0, y: 0, html: "" });
  }

  /* -------------------- Small UI helpers -------------------- */
  function toggleSort() {
    setSortDir((s) => (s === "desc" ? "asc" : "desc"));
  }

  function handleTopNChange(v: string) {
    if (v === "all") return setShowTopN("all");
    const n = Math.max(1, Math.min(50, Number(v) || 1));
    setShowTopN(n);
  }

  /* -------------------- Small polished CSS (Tailwind + inline) -------------------- */
  // Note: we inject a tiny keyframe for a soft pulse used by top contracts
  const pulseStyle = `
    @keyframes sleekPulse {
      0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59,130,246,0.12); }
      50% { transform: scale(1.03); box-shadow: 0 12px 30px -10px rgba(59,130,246,0.12); }
      100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(59,130,246,0.00); }
    }
  `;

  return (
    <main className="min-h-screen px-6 py-8 max-w-7xl mx-auto space-y-6">
      <style>{pulseStyle}</style>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-sm text-slate-600 hover:underline">
          ← Admin
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold">Contracts — Visual Focus</h1>
          <p className="text-sm text-slate-500 mt-1">
            Visualise where to spend your energy. Bigger bubbles = larger contract value. Top contracts are highlighted for clarity.
          </p>
        </div>

        <div className="flex gap-2 items-center">
          <button
            onClick={() => exportPNG()}
            className="px-3 py-2 bg-sky-600 text-white rounded-lg text-sm hover:bg-sky-700"
            aria-label="Export visualization as PNG"
          >
            Export PNG
          </button>
          <button
            onClick={() => {
              setSelectedId(null);
              setShowLabels(true);
            }}
            className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
            aria-label="Reset focus"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl p-4 shadow flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-500">Sort</label>
          <button
            onClick={toggleSort}
            className="px-3 py-1 border rounded-md text-sm"
            aria-pressed={sortDir === "desc"}
            title="Toggle sort"
          >
            {sortDir === "desc" ? "Value: High → Low" : "Value: Low → High"}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-500">Show</label>
          <select
            value={showTopN === "all" ? "all" : String(showTopN)}
            onChange={(e) => handleTopNChange(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm"
            aria-label="Show top N contracts"
          >
            <option value="all">All</option>
            <option value="3">Top 3</option>
            <option value="5">Top 5</option>
            <option value="10">Top 10</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-500">Labels</label>
          <button
            onClick={() => setShowLabels((s) => !s)}
            className="px-3 py-1 border rounded-md text-sm"
            aria-pressed={showLabels}
          >
            {showLabels ? "On" : "Off"}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-xs text-slate-500">Highlight</div>
          <input
            type="range"
            min={1}
            max={Math.max(1, prepared.length)}
            value={pulseTopN}
            onChange={(e) => setPulseTopN(Number(e.target.value))}
            className="w-32"
            aria-label="Number of top contracts to pulse"
          />
          <div className="text-sm text-slate-600">{pulseTopN}</div>
        </div>
      </div>

      {/* Visual */}
      <div ref={containerRef} className="bg-white rounded-xl p-5 shadow">
        <div className="flex items-start gap-6">
          <div style={{ flex: 1 }}>
            {/* SVG visual */}
            <div style={{ width: "100%", overflow: "hidden" }}>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                width="100%"
                height={svgHeight}
                role="img"
                aria-label="Contracts bubble visualization"
              >
                {/* background card area */}
                <defs>
                  <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#000" floodOpacity="0.06" />
                  </filter>
                </defs>

                <rect x={8} y={8} width={svgWidth - 16} height={svgHeight - 16} rx={14} fill="#ffffff" />

                {/* Render bubbles */}
                {prepared.map((c, i) => {
                  const idx = i;
                  const r = radii[idx];
                  // positions were computed for container width excluding big paddings — offset by padding to center inside viewBox
                  const paddingOffset = svgPadding;
                  const x = (positions[idx] ?? 0) + paddingOffset;
                  const y = Math.round(svgHeight / 2);

                  const isSelected = selectedId === c.id;
                  const isTop = topIds.includes(c.id);
                  return (
                    <g key={c.id} transform={`translate(${x}, ${y})`} className="group" role="button" tabIndex={0}
                       onClick={() => handleBubbleClick(c.id)}
                       onKeyDown={(e) => { if (e.key === "Enter") handleBubbleClick(c.id); }}
                       onMouseMove={(e) => handleMouseMove(e, c)}
                       onMouseLeave={handleMouseLeave}
                       aria-label={`${c.name}, MUR ${fmtMoney(c.value)}`}
                    >
                      {/* subtle shadow ring for top elements */}
                      <circle
                        r={r + (isTop ? 10 : 0)}
                        fill="none"
                        stroke={isTop ? "rgba(59,130,246,0.06)" : "transparent"}
                        strokeWidth={isTop ? 1.5 : 0}
                        style={{ transition: "all 220ms ease" }}
                      />

                      <circle
                        r={r}
                        fill={c.color ?? "#64748b"}
                        stroke={isSelected ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.04)"}
                        strokeWidth={isSelected ? 3 : 1}
                        style={{
                          filter: "url(#softShadow)",
                          transformOrigin: "center",
                          ...(isTop ? { animation: "sleekPulse 2.2s ease-in-out infinite" } : {}),
                          transition: "transform 200ms ease, stroke-width 200ms ease",
                        }}
                      />

                      {/* Value label inside bubble */}
                      <text x={0} y={4} textAnchor="middle" fontSize={Math.max(10, Math.min(14, Math.round(r / 3.5)))} fill="#fff" fontWeight={700}
                        style={{ pointerEvents: "none", opacity: 0.98 }}>
                        {fmtMoney(c.value)}
                      </text>

                      {/* Name under bubble (optional) */}
                      {showLabels && (
                        <text x={0} y={r + 20} textAnchor="middle" fontSize={12} fill="#0f172a" style={{ pointerEvents: "none" }}>
                          {c.name}
                        </text>
                      )}

                      {/* small percent badge */}
                      <g transform={`translate(${Math.round(r * 0.6)}, ${Math.round(-r * 0.6)})`} style={{ pointerEvents: "none" }}>
                        <rect x={-36} y={-16} rx={10} width={72} height={32} fill="#ffffff" stroke="#eef2ff" />
                        <text x={0} y={6} textAnchor="middle" fontSize={11} fill="#111" fontWeight={600}>
                          {totalValue ? `${Math.round((c.value / totalValue) * 100)}%` : "—"}
                        </text>
                      </g>

                      {/* selection ring */}
                      {isSelected && (
                        <circle r={r + 12} fill="none" stroke="rgba(11,92,255,0.14)" strokeWidth={10} />
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Tooltip floating over the SVG */}
              <div style={{ position: "relative", height: 0 }}>
                {tooltip.show && (
                  <div
                    className="pointer-events-none text-sm"
                    style={{
                      position: "absolute",
                      left: tooltip.x,
                      top: tooltip.y,
                      transform: "translate(-6px, 8px)",
                      background: "#0f172a",
                      color: "#fff",
                      padding: "8px 10px",
                      borderRadius: 8,
                      boxShadow: "0 10px 30px rgba(2,6,23,0.22)",
                      whiteSpace: "nowrap",
                      zIndex: 50,
                    }}
                    dangerouslySetInnerHTML={{ __html: tooltip.html }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Right column: small legend + actions */}
          <aside style={{ width: 300 }} className="hidden md:block">
            <div className="bg-slate-50 rounded-lg p-4 sticky top-6">
              <h3 className="text-sm font-semibold">Quick insights</h3>
              <p className="text-xs text-slate-500 mt-2">
                The bubbles above show contract value. Click a bubble to focus. Use controls to refine the view.
              </p>

              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Total shown</span>
                  <strong>Rs {fmtMoney(totalValue)}</strong>
                </div>

                <div className="pt-2">
                  <div className="text-xs text-slate-500">Top highlights</div>
                  <ul className="mt-2 space-y-2">
                    {prepared.slice(0, 5).map((c) => (
                      <li key={c.id} className="flex items-center gap-3">
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: c.color }} />
                        <div className="flex-1 text-sm">{c.name}</div>
                        <div className="text-xs text-slate-500">Rs {fmtMoney(c.value)}</div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3">
                  <button
                    onClick={() => { if (prepared.length) setSelectedId(prepared[0].id); }}
                    className="w-full px-3 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700"
                  >
                    Focus biggest
                  </button>
                </div>

                <div className="mt-2">
                  <button
                    onClick={() => exportPNG("contracts-visual.png")}
                    className="w-full px-3 py-2 border rounded-md text-sm hover:bg-gray-50"
                  >
                    Download PNG
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Legend for mobile below visual */}
        <div className="mt-4 md:hidden flex gap-3 items-center overflow-x-auto">
          {prepared.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg shadow-sm border">
              <div style={{ width: 12, height: 12, borderRadius: 3, background: c.color }} />
              <div className="text-sm whitespace-nowrap">
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-slate-500">Rs {fmtMoney(c.value)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer micro guidance */}
      <div className="text-xs text-slate-500">
        Tip: Focus on the biggest bubble first because that is where you get the largest impact. Use <strong>Show → Top 3</strong> to narrow down quickly.
      </div>
    </main>
  );
}
