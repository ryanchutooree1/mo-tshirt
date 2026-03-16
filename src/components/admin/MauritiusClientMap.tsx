"use client";

import { useMemo, useState } from "react";
import { FiArrowUpRight, FiMapPin, FiTarget, FiTrendingUp } from "react-icons/fi";
import {
  type ClientLocation,
  type MauritiusDistrict,
  MAURITIUS_DISTRICTS,
  MAURITIUS_HOTSPOTS,
  findNearestHotspot,
  getDistrictCentroid,
  inferLocationFromAddress,
  resolveClientLocation,
  serializeClientLocation,
} from "@/lib/client-location";

type ClientMapRecord = {
  id: string;
  customerName: string;
  customerAddress?: string;
  starRating?: number;
  tags?: string[];
  location?: ClientLocation | null;
};

type DistrictFilter = MauritiusDistrict | "all" | "unlocated";

type HotspotCluster = {
  key: string;
  label: string;
  district: MauritiusDistrict;
  x: number;
  y: number;
  count: number;
  vipCount: number;
  clients: ClientMapRecord[];
};

const DISTRICT_STYLES: Record<
  MauritiusDistrict,
  { glow: string; chip: string; badge: string; bar: string; text: string; stroke: string }
> = {
  "Black River": {
    glow: "rgba(59, 130, 246, 0.3)",
    chip: "border-blue-200 bg-blue-50 text-blue-700",
    badge: "bg-blue-500 text-white",
    bar: "from-blue-400 to-cyan-300",
    text: "text-blue-700",
    stroke: "#60a5fa",
  },
  Flacq: {
    glow: "rgba(34, 197, 94, 0.3)",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    badge: "bg-emerald-500 text-white",
    bar: "from-emerald-400 to-lime-300",
    text: "text-emerald-700",
    stroke: "#34d399",
  },
  "Grand Port": {
    glow: "rgba(249, 115, 22, 0.3)",
    chip: "border-orange-200 bg-orange-50 text-orange-700",
    badge: "bg-orange-500 text-white",
    bar: "from-orange-400 to-amber-300",
    text: "text-orange-700",
    stroke: "#fb923c",
  },
  Moka: {
    glow: "rgba(168, 85, 247, 0.3)",
    chip: "border-violet-200 bg-violet-50 text-violet-700",
    badge: "bg-violet-500 text-white",
    bar: "from-violet-400 to-fuchsia-300",
    text: "text-violet-700",
    stroke: "#a78bfa",
  },
  Pamplemousses: {
    glow: "rgba(6, 182, 212, 0.3)",
    chip: "border-cyan-200 bg-cyan-50 text-cyan-700",
    badge: "bg-cyan-500 text-white",
    bar: "from-cyan-400 to-sky-300",
    text: "text-cyan-700",
    stroke: "#22d3ee",
  },
  "Plaines Wilhems": {
    glow: "rgba(244, 63, 94, 0.3)",
    chip: "border-rose-200 bg-rose-50 text-rose-700",
    badge: "bg-rose-500 text-white",
    bar: "from-rose-400 to-pink-300",
    text: "text-rose-700",
    stroke: "#fb7185",
  },
  "Port Louis": {
    glow: "rgba(71, 85, 105, 0.28)",
    chip: "border-slate-200 bg-slate-50 text-slate-700",
    badge: "bg-slate-600 text-white",
    bar: "from-slate-500 to-slate-300",
    text: "text-slate-700",
    stroke: "#94a3b8",
  },
  "Riviere du Rempart": {
    glow: "rgba(234, 179, 8, 0.3)",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    badge: "bg-amber-500 text-slate-950",
    bar: "from-amber-400 to-yellow-300",
    text: "text-amber-700",
    stroke: "#fbbf24",
  },
  Savanne: {
    glow: "rgba(20, 184, 166, 0.3)",
    chip: "border-teal-200 bg-teal-50 text-teal-700",
    badge: "bg-teal-500 text-white",
    bar: "from-teal-400 to-cyan-300",
    text: "text-teal-700",
    stroke: "#2dd4bf",
  },
};

function getDistrictStyle(district: MauritiusDistrict) {
  return DISTRICT_STYLES[district];
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function MauritiusClientHeatmap({
  clients,
  totalClients,
  selectedDistrict,
  onSelectDistrict,
  onEditClient,
}: {
  clients: ClientMapRecord[];
  totalClients: number;
  selectedDistrict: DistrictFilter;
  onSelectDistrict: (district: DistrictFilter) => void;
  onEditClient?: (client: ClientMapRecord) => void;
}) {
  const [activeHotspotKey, setActiveHotspotKey] = useState<string | null>(null);

  const resolved = useMemo(() => {
    return clients
      .map((client) => {
        const location = resolveClientLocation(client);
        return location ? { client, location } : null;
      })
      .filter(Boolean) as Array<{ client: ClientMapRecord; location: NonNullable<ReturnType<typeof resolveClientLocation>> }>;
  }, [clients]);

  const clusters = useMemo(() => {
    const bucket = new Map<string, HotspotCluster>();

    for (const entry of resolved) {
      const current = bucket.get(entry.location.hotspotKey);
      if (current) {
        current.count += 1;
        current.vipCount += (entry.client.starRating || 0) >= 4 ? 1 : 0;
        current.clients.push(entry.client);
      } else {
        bucket.set(entry.location.hotspotKey, {
          key: entry.location.hotspotKey,
          label: entry.location.hotspotLabel,
          district: entry.location.district,
          x: entry.location.x,
          y: entry.location.y,
          count: 1,
          vipCount: (entry.client.starRating || 0) >= 4 ? 1 : 0,
          clients: [entry.client],
        });
      }
    }

    return Array.from(bucket.values()).sort((a, b) => b.count - a.count);
  }, [resolved]);

  const districtCounts = useMemo(() => {
    const counts = new Map<MauritiusDistrict, number>();
    for (const district of MAURITIUS_DISTRICTS) counts.set(district, 0);
    for (const entry of resolved) counts.set(entry.location.district, (counts.get(entry.location.district) || 0) + 1);
    return Array.from(counts.entries())
      .map(([district, count]) => ({ district, count }))
      .sort((a, b) => b.count - a.count);
  }, [resolved]);

  const locatedCount = resolved.length;
  const coverage = totalClients ? (locatedCount / totalClients) * 100 : 0;
  const topDistrict = districtCounts.find((item) => item.count > 0) || null;
  const whiteSpace = districtCounts.filter((item) => item.count <= Math.max(1, Math.floor((topDistrict?.count || 0) / 3)));
  const activeCluster =
    clusters.find((cluster) => cluster.key === activeHotspotKey) ||
    clusters.find((cluster) => cluster.district === selectedDistrict) ||
    clusters[0] ||
    null;

  return (
    <section
      className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]"
      style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.12s" }}
    >
      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200/70 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.95),rgba(240,249,255,0.9)_40%,rgba(248,250,252,0.95)_100%)] p-5 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(14,165,233,0.14),transparent_28%),radial-gradient(circle_at_82%_14%,rgba(249,115,22,0.12),transparent_24%),radial-gradient(circle_at_50%_92%,rgba(236,72,153,0.1),transparent_30%)]"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-sky-600">Mauritius client map</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950 sm:text-[2rem]">
              See where demand is stacking up across the island.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              The map updates from your live CRM. Click a district or hotspot to narrow the list and spot where to push uniforms, school runs, and merch offers next.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <MapStat
              label="Coverage"
              value={formatPercent(coverage)}
              note={`${locatedCount} pinned`}
              icon={<FiMapPin className="h-4 w-4" />}
            />
            <MapStat
              label="Strongest district"
              value={topDistrict?.district || "No data"}
              note={topDistrict ? `${topDistrict.count} clients` : "Start pinning"}
              icon={<FiTrendingUp className="h-4 w-4" />}
            />
            <MapStat
              label="Domination move"
              value={whiteSpace[0]?.district || "Keep scaling"}
              note={whiteSpace[0] ? `${whiteSpace[0].count} clients so far` : "Island covered"}
              icon={<FiTarget className="h-4 w-4" />}
            />
          </div>
        </div>

        <div className="relative mt-6 overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-slate-950 px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:px-6">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.15),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))]"
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          <div className="relative aspect-[1/1.08]">
            <MauritiusIslandArtwork />

            {districtCounts.map(({ district, count }) => {
              const centroid = getDistrictCentroid(district);
              if (!centroid || count === 0) return null;
              const active = selectedDistrict === district;
              const style = getDistrictStyle(district);
              return (
                <button
                  key={district}
                  type="button"
                  onClick={() => onSelectDistrict(active ? "all" : district)}
                  className={cn(
                    "absolute z-10 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80 backdrop-blur transition hover:border-white/40 hover:text-white",
                    active && "border-white/50 bg-white/10 text-white"
                  )}
                  style={{
                    left: `${centroid.x}%`,
                    top: `${centroid.y}%`,
                    transform: "translate(-50%, -50%)",
                    boxShadow: active ? `0 0 0 1px ${style.stroke} inset` : "none",
                  }}
                >
                  {district}
                </button>
              );
            })}

            {clusters.map((cluster) => {
              const active = activeHotspotKey === cluster.key || selectedDistrict === cluster.district;
              const style = getDistrictStyle(cluster.district);
              const size = Math.min(86, 32 + cluster.count * 9);

              return (
                <button
                  key={cluster.key}
                  type="button"
                  onClick={() => {
                    setActiveHotspotKey((current) => (current === cluster.key ? null : cluster.key));
                    onSelectDistrict(cluster.district);
                  }}
                  className="absolute z-20 -translate-x-1/2 -translate-y-1/2 text-left transition-transform hover:scale-105"
                  style={{ left: `${cluster.x}%`, top: `${cluster.y}%` }}
                  title={`${cluster.label}: ${cluster.count} client${cluster.count > 1 ? "s" : ""}`}
                >
                  <span
                    aria-hidden
                    className="absolute rounded-full blur-xl transition"
                    style={{
                      width: `${size}px`,
                      height: `${size}px`,
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      background: style.glow,
                      opacity: active ? 1 : 0.78,
                    }}
                  />
                  <span
                    aria-hidden
                    className="absolute animate-ping rounded-full border border-white/30"
                    style={{
                      width: `${Math.max(22, size * 0.58)}px`,
                      height: `${Math.max(22, size * 0.58)}px`,
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      background: style.glow,
                      animationDuration: `${1.8 + cluster.count * 0.1}s`,
                    }}
                  />
                  <span
                    className={cn(
                      "relative flex min-w-[3.25rem] items-center justify-center rounded-full border border-white/20 px-3 py-2 text-xs font-semibold shadow-[0_10px_24px_rgba(15,23,42,0.28)]",
                      style.badge,
                      active && "ring-4 ring-white/20"
                    )}
                  >
                    {cluster.count}
                  </span>
                  <span className="pointer-events-none absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-slate-950/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/75 shadow-lg md:block">
                    {cluster.label}
                  </span>
                </button>
              );
            })}

            {!clusters.length && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 backdrop-blur">
                  Start pinning clients to unlock the island heatmap.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="relative mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSelectDistrict("all")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              selectedDistrict === "all"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            All Mauritius
          </button>
          {districtCounts.map(({ district, count }) => (
            <button
              key={district}
              type="button"
              onClick={() => onSelectDistrict(selectedDistrict === district ? "all" : district)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                selectedDistrict === district
                  ? "border-slate-900 bg-slate-900 text-white"
                  : cn("bg-white hover:brightness-95", getDistrictStyle(district).chip)
              )}
            >
              {district} · {count}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onSelectDistrict(selectedDistrict === "unlocated" ? "all" : "unlocated")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              selectedDistrict === "unlocated"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            Unpinned · {Math.max(totalClients - locatedCount, 0)}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-[2rem] border border-slate-200/70 bg-white/95 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">District leaderboard</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">Where the orders are clustering.</h3>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              Live from CRM
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {districtCounts.map(({ district, count }) => {
              const max = topDistrict?.count || 1;
              const active = selectedDistrict === district;
              const style = getDistrictStyle(district);
              return (
                <button
                  key={district}
                  type="button"
                  onClick={() => onSelectDistrict(active ? "all" : district)}
                  className={cn(
                    "w-full rounded-2xl border px-4 py-3 text-left transition",
                    active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{district}</div>
                      <div className={cn("mt-1 text-xs", active ? "text-white/70" : "text-slate-500")}>
                        {count ? `${count} client${count > 1 ? "s" : ""}` : "Open field to attack"}
                      </div>
                    </div>
                    <div className={cn("text-lg font-semibold", active ? "text-white" : style.text)}>{count}</div>
                  </div>
                  <div className={cn("mt-3 h-2 overflow-hidden rounded-full", active ? "bg-white/15" : "bg-slate-200")}>
                    <div
                      className={cn("h-full rounded-full bg-gradient-to-r", active ? "from-white to-white/60" : style.bar)}
                      style={{ width: `${max ? (count / max) * 100 : 0}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200/70 bg-white/95 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Hot zone drilldown</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">
                {activeCluster ? activeCluster.label : "No hotspot selected"}
              </h3>
            </div>
            {activeCluster && (
              <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", getDistrictStyle(activeCluster.district).chip)}>
                {activeCluster.district}
              </span>
            )}
          </div>

          {activeCluster ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MiniStat label="Clients" value={String(activeCluster.count)} />
                <MiniStat label="VIP" value={String(activeCluster.vipCount)} />
                <MiniStat
                  label="Share"
                  value={formatPercent(totalClients ? (activeCluster.count / totalClients) * 100 : 0)}
                />
              </div>
              <div className="mt-5 space-y-3">
                {activeCluster.clients.slice(0, 5).map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => onEditClient?.(client)}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{client.customerName}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {(client.tags || []).slice(0, 2).join(" · ") || client.customerAddress || "No address note"}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                      Edit <FiArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              Add or infer a few client locations and the hotspot drilldown will populate automatically.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function MauritiusLocationPicker({
  value,
  address,
  onChange,
}: {
  value?: ClientLocation | null;
  address?: string;
  onChange: (location: ClientLocation | null) => void;
}) {
  const resolved = useMemo(() => resolveClientLocation({ customerAddress: address, location: value || null }), [address, value]);
  const addressGuess = useMemo(() => inferLocationFromAddress(address), [address]);

  const selectedDistrict = resolved?.district || value?.district || null;
  const selectedHotspotKey = resolved?.hotspotKey || value?.hotspotKey || "";
  const districtHotspots = selectedDistrict
    ? MAURITIUS_HOTSPOTS.filter((hotspot) => hotspot.district === selectedDistrict)
    : MAURITIUS_HOTSPOTS;

  const previewX = resolved?.x ?? 50;
  const previewY = resolved?.y ?? 46;

  function applyManualLocation(next: ClientLocation | null) {
    onChange(next ? serializeClientLocation({ ...next, source: "manual" }) : null);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
        <button
          type="button"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = ((event.clientY - rect.top) / rect.height) * 100;
            const nearest = findNearestHotspot(x, y);
            applyManualLocation({
              district: nearest?.district || selectedDistrict || null,
              hotspotKey: nearest?.key || null,
              hotspotLabel: nearest?.label || null,
              x,
              y,
              notes: value?.notes || null,
            });
          }}
          className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-slate-950 p-4 text-left shadow-sm"
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(56,189,248,0.18),transparent_28%),radial-gradient(circle_at_78%_15%,rgba(249,115,22,0.14),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.98))]"
          />
          <div className="relative aspect-[1/1.08]">
            <MauritiusIslandArtwork muted />
            <span
              className="absolute z-20 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white bg-orange-500 shadow-[0_0_0_8px_rgba(249,115,22,0.2)]"
              style={{ left: `${previewX}%`, top: `${previewY}%` }}
            />
          </div>
          <div className="relative mt-4 flex items-center justify-between gap-3 text-xs text-white/75">
            <span>Click anywhere on Mauritius to drop a client pin.</span>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 font-semibold">
              {resolved ? `${resolved.hotspotLabel} · ${resolved.district}` : "No pin yet"}
            </span>
          </div>
        </button>

        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-semibold text-slate-600">District</span>
            <select
              value={selectedDistrict || ""}
              onChange={(event) => {
                const district = (event.target.value || null) as MauritiusDistrict | null;
                if (!district) {
                  applyManualLocation(null);
                  return;
                }
                const centroid = getDistrictCentroid(district);
                const hotspot = MAURITIUS_HOTSPOTS.find((entry) => entry.district === district);
                applyManualLocation({
                  district,
                  hotspotKey: hotspot?.key || null,
                  hotspotLabel: hotspot?.label || district,
                  x: centroid?.x || hotspot?.x || null,
                  y: centroid?.y || hotspot?.y || null,
                  notes: value?.notes || null,
                });
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
            >
              <option value="">No district selected</option>
              {MAURITIUS_DISTRICTS.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-600">Hotspot</span>
            <select
              value={selectedHotspotKey}
              onChange={(event) => {
                const hotspot = MAURITIUS_HOTSPOTS.find((entry) => entry.key === event.target.value);
                applyManualLocation(
                  hotspot
                    ? {
                        district: hotspot.district,
                        hotspotKey: hotspot.key,
                        hotspotLabel: hotspot.label,
                        x: hotspot.x,
                        y: hotspot.y,
                        notes: value?.notes || null,
                      }
                    : null
                );
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
            >
              <option value="">Choose a hotspot</option>
              {districtHotspots.map((hotspot) => (
                <option key={hotspot.key} value={hotspot.key}>
                  {hotspot.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-600">Location note</span>
            <input
              value={value?.notes || ""}
              onChange={(event) =>
                applyManualLocation({
                  district: selectedDistrict,
                  hotspotKey: selectedHotspotKey || null,
                  hotspotLabel: resolved?.hotspotLabel || null,
                  x: resolved?.x || null,
                  y: resolved?.y || null,
                  notes: event.target.value,
                })
              }
              placeholder="School campaign, corporate cluster, reseller..."
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {addressGuess && (
              <button
                type="button"
                onClick={() => applyManualLocation(addressGuess)}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
              >
                Use address guess: {addressGuess.hotspotLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => applyManualLocation(null)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Clear pin
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
            <div className="font-semibold text-slate-800">Live location summary</div>
            <div className="mt-2">{resolved ? `${resolved.hotspotLabel}, ${resolved.district}` : "No pin saved yet."}</div>
            <div className="mt-1 text-xs text-slate-500">
              {resolved ? `x ${resolved.x.toFixed(1)}% · y ${resolved.y.toFixed(1)}%` : "Pick a hotspot or click the map."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MapStat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="min-w-[10rem] rounded-2xl border border-slate-200/80 bg-white/85 p-3 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        <span>{label}</span>
        <span className="text-sky-600">{icon}</span>
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function MauritiusIslandArtwork({ muted = false }: { muted?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute inset-0 h-full w-full"
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={muted ? "mauritius-land-muted" : "mauritius-land"} x1="28" y1="8" x2="66" y2="94">
          <stop offset="0%" stopColor={muted ? "#7dd3fc" : "#67e8f9"} stopOpacity={0.85} />
          <stop offset="45%" stopColor={muted ? "#38bdf8" : "#22c55e"} stopOpacity={0.78} />
          <stop offset="100%" stopColor={muted ? "#0f766e" : "#f59e0b"} stopOpacity={0.75} />
        </linearGradient>
        <filter id={muted ? "mauritius-glow-muted" : "mauritius-glow"}>
          <feGaussianBlur stdDeviation="1.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        d="M57.5 5.5C61.4 7.8 65.7 12.4 67.8 17.7C69.8 22.8 69.4 28.6 71.7 33.4C73.8 37.9 78.1 41.5 79.7 46.6C82.2 54.7 79.2 63.4 73.7 69.2C69.9 73.1 64.8 75.8 62.4 80.6C59.7 85.9 59.8 93.4 54.8 96.7C49.8 99.9 42.7 97.3 37.7 94.1C31.6 90.2 26.6 84.6 23.6 78C20.8 71.8 20.3 64.7 16.7 59C13.4 53.9 7.6 50.3 6.5 44.3C5.3 37.3 9.7 30.6 14 24.9C17.7 19.9 20.6 14.1 25.9 10.9C34.1 6 44.9 6.8 57.5 5.5Z"
        fill={`url(#${muted ? "mauritius-land-muted" : "mauritius-land"})`}
        fillOpacity={0.9}
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="0.6"
        filter={`url(#${muted ? "mauritius-glow-muted" : "mauritius-glow"})`}
      />
      <path
        d="M69 80C73.5 80.8 76.9 83.4 78.7 87.1C80.7 91.1 80.5 96.7 76.7 99C73.1 101.2 68.1 98.7 65.9 95C63.3 90.5 64 84.5 69 80Z"
        fill="rgba(186,230,253,0.78)"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="0.4"
      />
      <path
        d="M36 18C41.7 20.8 45.7 25.7 46.9 31.4C48.2 37.3 46.1 44 40.9 48.1C35.7 52.2 27.3 53.5 22.5 48.7C17.8 44 18.4 35.9 21.3 29.7C24.1 23.8 29.5 18.8 36 18Z"
        fill="rgba(255,255,255,0.08)"
      />
    </svg>
  );
}
