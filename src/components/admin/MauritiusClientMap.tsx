"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FiArrowUpRight, FiMapPin, FiPause, FiPlay, FiRotateCcw, FiTarget, FiTrendingUp } from "react-icons/fi";
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

const NEUTRAL_DISTRICT_STYLE = {
  glow: "rgba(148, 163, 184, 0.18)",
  chip: "border-slate-200 bg-white text-slate-700",
  badge: "bg-white text-slate-900",
  bar: "from-slate-300 to-slate-200",
  text: "text-slate-700",
  stroke: "#cbd5e1",
} as const;

const DISTRICT_STYLES: Record<
  MauritiusDistrict,
  { glow: string; chip: string; badge: string; bar: string; text: string; stroke: string }
> = {
  "Black River": NEUTRAL_DISTRICT_STYLE,
  Flacq: NEUTRAL_DISTRICT_STYLE,
  "Grand Port": NEUTRAL_DISTRICT_STYLE,
  Moka: NEUTRAL_DISTRICT_STYLE,
  Pamplemousses: NEUTRAL_DISTRICT_STYLE,
  "Plaines Wilhems": NEUTRAL_DISTRICT_STYLE,
  "Port Louis": NEUTRAL_DISTRICT_STYLE,
  "Riviere du Rempart": NEUTRAL_DISTRICT_STYLE,
  Savanne: NEUTRAL_DISTRICT_STYLE,
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

type OrbitalView = {
  yaw: number;
  pitch: number;
  zoom: number;
};

type OrbitalPoint = {
  x: number;
  y: number;
  z: number;
};

type OrbitalProjection = {
  left: number;
  top: number;
  depth: number;
  scale: number;
  visible: boolean;
};

const DEFAULT_ORBITAL_VIEW: OrbitalView = {
  yaw: -0.36,
  pitch: 0.16,
  zoom: 1,
};

const ORBITAL_CENTER = {
  x: 50,
  y: 53,
};

const ORBITAL_RADIUS = {
  x: 30.5,
  y: 34.5,
};

const MAX_SCENE_CLUSTERS = 8;
const ORBITAL_PITCH_LIMIT = 0.64;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function wrapAngle(angle: number) {
  const turn = Math.PI * 2;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}

function shortestAngleDelta(from: number, to: number) {
  return wrapAngle(to - from);
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function lerpAngle(from: number, to: number, amount: number) {
  return from + shortestAngleDelta(from, to) * amount;
}

function toOrbitalPoint(x: number, y: number): OrbitalPoint {
  const nx = clamp((x - 50) / 22, -0.92, 0.92);
  const ny = clamp((y - 52) / 38, -0.98, 0.98);
  const radial = clamp(nx * nx + ny * ny * 0.84, 0, 0.98);
  const z = Math.sqrt(1 - radial) * 0.94 - 0.08;

  return {
    x: nx * 0.94,
    y: ny * 1.08,
    z,
  };
}

function rotateOrbitalPoint(point: OrbitalPoint, yaw: number, pitch: number): OrbitalPoint {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);

  const x = point.x * cosYaw + point.z * sinYaw;
  const z = point.z * cosYaw - point.x * sinYaw;
  const y = point.y * cosPitch - z * sinPitch;
  const nextZ = point.y * sinPitch + z * cosPitch;

  return { x, y, z: nextZ };
}

function projectOrbitalPoint(point: OrbitalPoint, view: OrbitalView): OrbitalProjection {
  const rotated = rotateOrbitalPoint(point, view.yaw, view.pitch);
  const perspective = 1.95 / view.zoom;
  const scale = perspective / (perspective - rotated.z * 0.92);

  return {
    left: ORBITAL_CENTER.x + rotated.x * ORBITAL_RADIUS.x * scale,
    top: ORBITAL_CENTER.y + rotated.y * ORBITAL_RADIUS.y * scale,
    depth: rotated.z,
    scale,
    visible: rotated.z > -0.2,
  };
}

function getFocusView(x: number, y: number): OrbitalView {
  const point = toOrbitalPoint(x, y);
  const yaw = wrapAngle(-Math.atan2(point.x, point.z || 0.0001));
  const afterYaw = rotateOrbitalPoint(point, yaw, 0);
  const pitch = clamp(Math.atan2(afterYaw.y, afterYaw.z || 0.0001), -0.42, 0.42);

  return {
    yaw,
    pitch,
    zoom: 1.08,
  };
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
  const unpinnedCount = Math.max(totalClients - locatedCount, 0);

  function handleDistrictSelection(district: DistrictFilter) {
    setActiveHotspotKey((current) => {
      if (district === "all" || district === "unlocated") return null;
      const active = clusters.find((cluster) => cluster.key === current);
      return active?.district === district ? current : null;
    });
    onSelectDistrict(district);
  }

  function handleClusterSelection(cluster: HotspotCluster) {
    setActiveHotspotKey((current) => (current === cluster.key ? null : cluster.key));
    onSelectDistrict(cluster.district);
  }

  return (
    <section
      className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]"
      style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.12s" }}
    >
      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">Mauritius orbital map</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950 sm:text-[2rem]">
              Navigate the island demand like a live command surface.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Drag to orbit, scroll to zoom, and lock onto the busiest zones. The scene still runs from your live CRM, but now the map behaves like the reference instead of a flat island card.
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

        <MauritiusOrbitalScene
          clusters={clusters}
          districtCounts={districtCounts}
          selectedDistrict={selectedDistrict}
          activeCluster={activeCluster}
          onSelectDistrict={handleDistrictSelection}
          onSelectCluster={handleClusterSelection}
          unpinnedCount={unpinnedCount}
        />

        <div className="relative mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleDistrictSelection("all")}
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
              onClick={() => handleDistrictSelection(selectedDistrict === district ? "all" : district)}
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
            onClick={() => handleDistrictSelection(selectedDistrict === "unlocated" ? "all" : "unlocated")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              selectedDistrict === "unlocated"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            Unpinned · {unpinnedCount}
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
                  onClick={() => handleDistrictSelection(active ? "all" : district)}
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

function MauritiusOrbitalScene({
  clusters,
  districtCounts,
  selectedDistrict,
  activeCluster,
  onSelectDistrict,
  onSelectCluster,
  unpinnedCount,
}: {
  clusters: HotspotCluster[];
  districtCounts: Array<{ district: MauritiusDistrict; count: number }>;
  selectedDistrict: DistrictFilter;
  activeCluster: HotspotCluster | null;
  onSelectDistrict: (district: DistrictFilter) => void;
  onSelectCluster: (cluster: HotspotCluster) => void;
  unpinnedCount: number;
}) {
  const [view, setView] = useState<OrbitalView>(DEFAULT_ORBITAL_VIEW);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const [dragging, setDragging] = useState(false);
  const motionRef = useRef({
    yaw: DEFAULT_ORBITAL_VIEW.yaw,
    pitch: DEFAULT_ORBITAL_VIEW.pitch,
    zoom: DEFAULT_ORBITAL_VIEW.zoom,
    velocityYaw: 0,
    velocityPitch: 0,
    target: null as OrbitalView | null,
    holdTarget: false,
  });
  const pointerRef = useRef({
    pointerId: -1,
    x: 0,
    y: 0,
    dragging: false,
  });
  const autoOrbitRef = useRef(autoOrbit);

  const sceneClusters = useMemo(() => {
    const source =
      selectedDistrict !== "all" && selectedDistrict !== "unlocated"
        ? clusters.filter((cluster) => cluster.district === selectedDistrict)
        : clusters.slice(0, MAX_SCENE_CLUSTERS);

    if (activeCluster && !source.some((cluster) => cluster.key === activeCluster.key)) {
      return [...source, activeCluster].sort((a, b) => b.count - a.count);
    }

    return source;
  }, [activeCluster, clusters, selectedDistrict]);

  const districtNodes = useMemo(() => {
    return districtCounts
      .filter(({ count }) => count > 0)
      .map(({ district, count }) => {
        const centroid = getDistrictCentroid(district);
        return centroid ? { district, count, centroid } : null;
      })
      .filter(Boolean) as Array<{ district: MauritiusDistrict; count: number; centroid: { x: number; y: number } }>;
  }, [districtCounts]);

  const focusSeed = useMemo(() => {
    if (selectedDistrict !== "all" && selectedDistrict !== "unlocated") {
      const focusedCluster = activeCluster?.district === selectedDistrict ? activeCluster : sceneClusters[0] || null;
      if (focusedCluster) return { x: focusedCluster.x, y: focusedCluster.y };
      const centroid = getDistrictCentroid(selectedDistrict);
      return centroid ? { x: centroid.x, y: centroid.y } : null;
    }

    return null;
  }, [activeCluster, sceneClusters, selectedDistrict]);

  useEffect(() => {
    autoOrbitRef.current = autoOrbit;
  }, [autoOrbit]);

  useEffect(() => {
    const target = focusSeed ? getFocusView(focusSeed.x, focusSeed.y) : DEFAULT_ORBITAL_VIEW;
    motionRef.current.target = target;
    motionRef.current.holdTarget = Boolean(focusSeed);
    motionRef.current.velocityYaw = 0;
    motionRef.current.velocityPitch = 0;
  }, [focusSeed]);

  useEffect(() => {
    let frameId = 0;
    let lastTick = performance.now();

    const tick = (now: number) => {
      const delta = Math.min(0.04, Math.max(0.008, (now - lastTick) / 1000));
      lastTick = now;
      const motion = motionRef.current;

      if (!pointerRef.current.dragging) {
        if (motion.target) {
          const easing = 1 - Math.exp(-delta * 4);
          motion.yaw = wrapAngle(lerpAngle(motion.yaw, motion.target.yaw, easing));
          motion.pitch = clamp(lerp(motion.pitch, motion.target.pitch, easing), -ORBITAL_PITCH_LIMIT, ORBITAL_PITCH_LIMIT);
          motion.zoom = lerp(motion.zoom, motion.target.zoom, easing);

          if (
            !motion.holdTarget &&
            Math.abs(shortestAngleDelta(motion.yaw, motion.target.yaw)) < 0.015 &&
            Math.abs(motion.pitch - motion.target.pitch) < 0.015 &&
            Math.abs(motion.zoom - motion.target.zoom) < 0.015
          ) {
            motion.target = null;
          }
        } else if (autoOrbitRef.current) {
          motion.yaw = wrapAngle(motion.yaw + delta * 0.18 / motion.zoom);
        }

        motion.yaw = wrapAngle(motion.yaw + motion.velocityYaw * delta);
        motion.pitch = clamp(motion.pitch + motion.velocityPitch * delta, -ORBITAL_PITCH_LIMIT, ORBITAL_PITCH_LIMIT);

        const friction = Math.pow(0.82, delta * 60);
        motion.velocityYaw *= friction;
        motion.velocityPitch *= friction;
      }

      setView({
        yaw: motion.yaw,
        pitch: motion.pitch,
        zoom: motion.zoom,
      });

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  function resetView() {
    const target = focusSeed ? getFocusView(focusSeed.x, focusSeed.y) : DEFAULT_ORBITAL_VIEW;
    motionRef.current.target = target;
    motionRef.current.holdTarget = Boolean(focusSeed);
    motionRef.current.velocityYaw = 0;
    motionRef.current.velocityPitch = 0;
  }

  function endDrag(pointerId: number, target: HTMLDivElement) {
    if (pointerRef.current.pointerId !== pointerId) return;
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    pointerRef.current.pointerId = -1;
    pointerRef.current.dragging = false;
    setDragging(false);
  }

  const projectedClusters = useMemo(() => {
    return sceneClusters
      .map((cluster) => ({
        cluster,
        projection: projectOrbitalPoint(toOrbitalPoint(cluster.x, cluster.y), view),
      }))
      .sort((left, right) => left.projection.depth - right.projection.depth);
  }, [sceneClusters, view]);

  const projectedDistricts = useMemo(() => {
    return districtNodes.map((entry) => ({
      ...entry,
      projection: projectOrbitalPoint(toOrbitalPoint(entry.centroid.x, entry.centroid.y), view),
    }));
  }, [districtNodes, view]);

  const activeProjection = activeCluster ? projectOrbitalPoint(toOrbitalPoint(activeCluster.x, activeCluster.y), view) : null;

  return (
    <div className="relative mt-6 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:px-6">
      <div
        aria-hidden
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px), radial-gradient(rgba(148,163,184,0.45) 1px, transparent 1px)",
          backgroundSize: "48px 48px, 48px 48px, 150px 150px",
          backgroundPosition: "0 0, 0 0, 18px 26px",
        }}
      />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
          Drag to orbit · Scroll to zoom · Tap a hotspot to inspect
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoOrbit((current) => !current)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            {autoOrbit ? (
              <span className="inline-flex items-center gap-2">
                <FiPause className="h-3.5 w-3.5" /> Pause orbit
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <FiPlay className="h-3.5 w-3.5" /> Auto orbit
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <span className="inline-flex items-center gap-2">
              <FiRotateCcw className="h-3.5 w-3.5" /> Reset view
            </span>
          </button>
        </div>
      </div>

      <div
        className={cn(
          "relative mt-4 aspect-[1/1.02] overflow-hidden rounded-[1.6rem]",
          dragging ? "cursor-grabbing" : "cursor-grab"
        )}
        style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("[data-orbital-stop]")) return;
          motionRef.current.target = null;
          motionRef.current.holdTarget = false;
          pointerRef.current.pointerId = event.pointerId;
          pointerRef.current.x = event.clientX;
          pointerRef.current.y = event.clientY;
          pointerRef.current.dragging = true;
          motionRef.current.velocityYaw = 0;
          motionRef.current.velocityPitch = 0;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!pointerRef.current.dragging || pointerRef.current.pointerId !== event.pointerId) return;
          const deltaX = event.clientX - pointerRef.current.x;
          const deltaY = event.clientY - pointerRef.current.y;
          pointerRef.current.x = event.clientX;
          pointerRef.current.y = event.clientY;

          motionRef.current.yaw = wrapAngle(motionRef.current.yaw + deltaX * 0.0066);
          motionRef.current.pitch = clamp(
            motionRef.current.pitch + deltaY * 0.0048,
            -ORBITAL_PITCH_LIMIT,
            ORBITAL_PITCH_LIMIT
          );
          motionRef.current.velocityYaw = deltaX * 0.34;
          motionRef.current.velocityPitch = deltaY * 0.26;
        }}
        onPointerUp={(event) => endDrag(event.pointerId, event.currentTarget)}
        onPointerCancel={(event) => endDrag(event.pointerId, event.currentTarget)}
        onLostPointerCapture={(event) => endDrag(event.pointerId, event.currentTarget)}
        onWheel={(event) => {
          event.preventDefault();
          motionRef.current.target = null;
          motionRef.current.holdTarget = false;
          motionRef.current.zoom = clamp(motionRef.current.zoom - event.deltaY * 0.0011, 0.84, 1.42);
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 rounded-[1.6rem] bg-[radial-gradient(circle_at_50%_46%,rgba(148,163,184,0.12),transparent_24%),radial-gradient(circle_at_50%_95%,rgba(148,163,184,0.08),transparent_30%)]"
        />

        <div
          aria-hidden
          className="absolute left-1/2 top-[53%] h-[82%] w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200 blur-md"
        />
        <div
          aria-hidden
          className="absolute left-1/2 top-[53%] h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200 animate-spin"
          style={{ animationDuration: "22s" }}
        />
        <div
          aria-hidden
          className="absolute left-1/2 top-[53%] h-[72%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_36%_28%,rgba(255,255,255,0.98),rgba(248,250,252,0.95)_30%,rgba(241,245,249,0.96)_70%,rgba(226,232,240,0.98)_100%)] shadow-[0_0_40px_rgba(148,163,184,0.12),inset_0_0_30px_rgba(255,255,255,0.8)]"
        />

        <svg
          aria-hidden
          viewBox="0 0 100 100"
          className="absolute left-1/2 top-[53%] h-[72%] w-[72%] -translate-x-1/2 -translate-y-1/2"
        >
          <defs>
            <radialGradient id="orbital-atmosphere" cx="35%" cy="28%" r="70%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.42)" />
              <stop offset="30%" stopColor="rgba(148,163,184,0.18)" />
              <stop offset="75%" stopColor="rgba(226,232,240,0.1)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="url(#orbital-atmosphere)" />
          <ellipse cx="50" cy="50" rx="45" ry="13" stroke="rgba(226,232,240,0.22)" strokeWidth="0.8" fill="none" />
          <ellipse cx="50" cy="50" rx="45" ry="24" stroke="rgba(226,232,240,0.18)" strokeWidth="0.8" fill="none" />
          <ellipse cx="50" cy="50" rx="45" ry="36" stroke="rgba(226,232,240,0.12)" strokeWidth="0.8" fill="none" />
          <ellipse
            cx="50"
            cy="50"
            rx="18"
            ry="46"
            stroke="rgba(226,232,240,0.12)"
            strokeWidth="0.8"
            fill="none"
            transform="rotate(15 50 50)"
          />
          <ellipse
            cx="50"
            cy="50"
            rx="28"
            ry="46"
            stroke="rgba(226,232,240,0.16)"
            strokeWidth="0.8"
            fill="none"
            transform="rotate(-24 50 50)"
          />
          <ellipse
            cx="50"
            cy="50"
            rx="36"
            ry="46"
            stroke="rgba(226,232,240,0.1)"
            strokeWidth="0.8"
            fill="none"
            transform="rotate(42 50 50)"
          />
        </svg>

        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[53%] h-[44%] w-[28%] -translate-x-1/2 -translate-y-1/2 opacity-45 mix-blend-screen"
          style={{
            transform: `translate(-50%, -50%) rotate(${view.yaw * 18}deg) scale(${0.94 + (view.zoom - 1) * 0.24}) skewY(${view.pitch * 6}deg)`,
          }}
        >
          <MauritiusIslandArtwork muted />
        </div>

        {activeCluster && activeProjection && (
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-full blur-2xl transition"
            style={{
              left: `${activeProjection.left}%`,
              top: `${activeProjection.top}%`,
              width: `${Math.min(220, 92 + activeCluster.count * 18)}px`,
              height: `${Math.min(220, 92 + activeCluster.count * 18)}px`,
              transform: "translate(-50%, -50%)",
              background: getDistrictStyle(activeCluster.district).glow,
              opacity: activeProjection.visible ? 0.85 : 0.28,
            }}
          />
        )}

        {projectedDistricts.map(({ district, count, projection }) => {
          if (!projection.visible) return null;
          const active = selectedDistrict === district;

          return (
            <button
              key={district}
              type="button"
              data-orbital-stop
              onClick={() => onSelectDistrict(active ? "all" : district)}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 transition hover:border-slate-300 hover:text-slate-700",
                active && "border-slate-900 bg-slate-900 text-white"
              )}
              style={{
                left: `${projection.left}%`,
                top: `${projection.top}%`,
                zIndex: 10 + Math.round((projection.depth + 1) * 20),
                boxShadow: active ? `0 0 0 1px ${getDistrictStyle(district).stroke} inset` : "none",
                opacity: clamp(0.45 + projection.scale * 0.12, 0.4, 0.92),
              }}
            >
              {district} · {count}
            </button>
          );
        })}

        {projectedClusters.map(({ cluster, projection }) => {
          const style = getDistrictStyle(cluster.district);
          const active = activeCluster?.key === cluster.key;
          const bubbleSize = Math.min(66, 26 + cluster.count * 7);
          const frontStrength = clamp((projection.depth + 1) / 2, 0.22, 1);
          const labelBelow = projection.top < 26;

          if (!projection.visible) {
            return (
              <span
                key={cluster.key}
                aria-hidden
                className="pointer-events-none absolute rounded-full border border-slate-200 blur-[1px]"
                style={{
                  left: `${projection.left}%`,
                  top: `${projection.top}%`,
                  width: `${Math.max(10, bubbleSize * 0.34)}px`,
                  height: `${Math.max(10, bubbleSize * 0.34)}px`,
                  transform: "translate(-50%, -50%)",
                  background: style.glow,
                  opacity: 0.25,
                }}
              />
            );
          }

          return (
            <button
              key={cluster.key}
              type="button"
              data-orbital-stop
              onClick={() => onSelectCluster(cluster)}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-left transition-transform hover:scale-[1.03]"
              style={{
                left: `${projection.left}%`,
                top: `${projection.top}%`,
                zIndex: 30 + Math.round((projection.depth + 1) * 100),
                opacity: frontStrength,
                transform: `translate(-50%, -50%) scale(${clamp(0.78 + (projection.scale - 1) * 0.92, 0.74, 1.16)})`,
              }}
              title={`${cluster.label}: ${cluster.count} client${cluster.count > 1 ? "s" : ""}`}
            >
              <span
                aria-hidden
                className="absolute left-1/2 top-1/2 rounded-full blur-xl transition"
                style={{
                  width: `${bubbleSize * 1.9}px`,
                  height: `${bubbleSize * 1.9}px`,
                  transform: "translate(-50%, -50%)",
                  background: style.glow,
                  opacity: active ? 1 : 0.75,
                }}
              />
              <span
                aria-hidden
                className="absolute left-1/2 top-1/2 animate-ping rounded-full border border-slate-300"
                style={{
                  width: `${bubbleSize * 0.86}px`,
                  height: `${bubbleSize * 0.86}px`,
                  transform: "translate(-50%, -50%)",
                  background: style.glow,
                  animationDuration: `${2.1 + cluster.count * 0.12}s`,
                }}
              />
              <span
                className={cn(
                  "relative flex items-center justify-center rounded-[1.15rem] border border-white/20 px-4 font-semibold shadow-[0_10px_30px_rgba(2,6,23,0.42)]",
                  "border-slate-200 shadow-[0_10px_24px_rgba(15,23,42,0.08)]",
                  style.badge,
                  active && "ring-4 ring-slate-200"
                )}
                style={{
                  minWidth: `${bubbleSize}px`,
                  height: `${Math.max(34, bubbleSize * 0.9)}px`,
                  fontSize: `${clamp(0.92 + cluster.count * 0.035, 0.92, 1.15)}rem`,
                }}
              >
                {cluster.count}
              </span>
              <span
                className={cn(
                  "pointer-events-none absolute left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-full border border-white/18 bg-slate-950/[0.78] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-white/[0.82] shadow-lg backdrop-blur md:block",
                  "border-slate-200 bg-white text-slate-700 shadow-md",
                  labelBelow ? "top-full mt-3" : "bottom-full mb-3"
                )}
              >
                {cluster.label}
              </span>
            </button>
          );
        })}

        {!clusters.length && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm text-slate-600">
              Start pinning clients to unlock the orbital map.
            </div>
          </div>
        )}

        <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            Zoom {view.zoom.toFixed(2)}x
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            Hotspots {sceneClusters.length}
          </span>
          {!!unpinnedCount && (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
              Unpinned {unpinnedCount}
            </span>
          )}
        </div>
      </div>
    </div>
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
          className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-4 text-left shadow-sm"
        >
          <div className="relative aspect-[1/1.08]">
            <MauritiusIslandArtwork muted />
            <span
              className="absolute z-20 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white bg-slate-900 shadow-[0_0_0_8px_rgba(148,163,184,0.18)]"
              style={{ left: `${previewX}%`, top: `${previewY}%` }}
            />
          </div>
          <div className="relative mt-4 flex items-center justify-between gap-3 text-xs text-slate-600">
            <span>Click anywhere on Mauritius to drop a client pin.</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold">
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
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-100"
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
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-100"
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
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-100"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {addressGuess && (
              <button
                type="button"
                onClick={() => applyManualLocation(addressGuess)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
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
