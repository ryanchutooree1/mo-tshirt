"use client";

import { useEffect, useState } from "react";

type Sector = { key: string; label: string };
type Task = { id: string; text: string; done: boolean };

const SECTORS: Sector[] = [
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

const STORAGE_KEY = "dream-life-v2";

export default function DreamLifePage() {
  const year = new Date().getFullYear();

  const rings = 10;
  const bands = rings - 1;

  const [tasks, setTasks] = useState<Task[][]>(() =>
    SECTORS.map(() => [])
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.tasks)) setTasks(parsed.tasks);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks }));
    } catch {}
  }, [tasks]);

  // --- SVG helpers ---
  const radius = 260;
  const cx = 320;
  const cy = 320;
  const size = 640;
  const angleStep = 360 / SECTORS.length;

  const polarToXY = (r: number, angleDeg: number) => {
    const a = (angleDeg - 90) * (Math.PI / 180);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const annularPath = (r0: number, r1: number, a0: number, a1: number) => {
    const p0 = polarToXY(r0, a0);
    const p1 = polarToXY(r0, a1);
    const p2 = polarToXY(r1, a1);
    const p3 = polarToXY(r1, a0);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${p0.x} ${p0.y} A ${r0} ${r0} 0 ${large} 1 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${r1} ${r1} 0 ${large} 0 ${p3.x} ${p3.y} Z`;
  };

  // --- task helpers ---
  const addTask = (si: number) =>
    setTasks((all) => {
      const copy = all.map((arr) => arr.slice());
      if (copy[si].length >= bands) return all; // maxed
      copy[si].push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text: `Task ${copy[si].length + 1}`,
        done: false,
      });
      return copy;
    });

  const updateTaskText = (si: number, ti: number, text: string) =>
    setTasks((all) => {
      const copy = all.map((arr) => arr.slice());
      copy[si][ti] = { ...copy[si][ti], text: text.slice(0, 60) };
      return copy;
    });

  const toggleTask = (si: number, ti: number) =>
    setTasks((all) => {
      const copy = all.map((arr) => arr.slice());
      copy[si][ti] = { ...copy[si][ti], done: !copy[si][ti].done };
      return copy;
    });

  const removeTask = (si: number, ti: number) =>
    setTasks((all) => {
      const copy = all.map((arr) => arr.slice());
      copy[si].splice(ti, 1);
      return copy;
    });

  const resetAll = () => setTasks(SECTORS.map(() => []));

  const toggleBySegment = (si: number, b: number) => {
    setTasks((all) => {
      const copy = all.map((arr) => arr.slice());
      while (copy[si].length <= b && copy[si].length < bands) {
        copy[si].push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          text: `Task ${copy[si].length + 1}`,
          done: false,
        });
      }
      if (copy[si][b]) copy[si][b] = { ...copy[si][b], done: !copy[si][b].done };
      return copy;
    });
  };

  return (
    <div className="mx-auto max-w-6xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">DESIGNING MY DREAM LIFE</h1>
        <button
          onClick={resetAll}
          className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-gray-50"
        >
          Reset
        </button>
      </header>

      {/* Circle */}
      <div className="flex justify-center mb-10">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="mx-auto block"
        >
          {/* guide rings */}
          {[...Array(rings)].map((_, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={(radius / rings) * (i + 1)}
              fill="none"
              stroke="#e5e7eb"
            />
          ))}

          {/* spokes */}
          {SECTORS.map((_, i) => {
            const { x, y } = polarToXY(radius, i * angleStep);
            return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" />;
          })}

          {/* center year */}
          <circle cx={cx} cy={cy} r={60} fill="#ffffff" stroke="#e5e7eb" />
          <text
            x={cx}
            y={cy + 6}
            textAnchor="middle"
            className="fill-gray-800"
            fontSize="20"
            fontWeight="700"
          >
            {year}
          </text>

          {/* sector labels */}
          {SECTORS.map((s, i) => {
            const midA = (i + 0.5) * angleStep;
            const pt = polarToXY(radius + 50, midA);
            return (
              <text
                key={s.key}
                x={pt.x}
                y={pt.y}
                textAnchor="middle"
                fontSize="12"
                className="fill-gray-800 font-bold"
              >
                {s.label}
              </text>
            );
          })}

          {/* task segments */}
          {[...Array(bands)].map((_, b) => {
            const r1 = radius - (b * radius) / bands;
            const r0 = radius - ((b + 1) * radius) / bands;
            return (
              <g key={`band-${b}`}>
                {SECTORS.map((_, si) => {
                  const a0 = si * angleStep + 2;
                  const a1 = (si + 1) * angleStep - 2;
                  const d = annularPath(r0, r1, a0, a1);
                  const task = tasks[si][b];
                  const checked = Boolean(task?.done);

                  return (
                    <path
                      key={`seg-${b}-${si}`}
                      d={d}
                      fill={checked ? "#bbf7d0" : "#ffffff"}
                      stroke="#d1d5db"
                      onClick={() => toggleBySegment(si, b)}
                      style={{ cursor: "pointer" }}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Task Lists in 4 columns (3 vertical sectors each) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {SECTORS.map((s, si) => (
          <div key={s.key} className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide">{s.label}</h2>
              <button
                onClick={() => addTask(si)}
                className="text-xs rounded border px-2 py-1 hover:bg-gray-50"
                disabled={tasks[si].length >= bands}
              >
                Add Task
              </button>
            </div>

            {tasks[si].length === 0 ? (
              <p className="text-xs text-gray-500">No tasks yet.</p>
            ) : (
              <ul className="space-y-2">
                {tasks[si].map((t, ti) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={() => toggleTask(si, ti)}
                      className="h-4 w-4"
                    />
                    <input
                      value={t.text}
                      onChange={(e) => updateTaskText(si, ti, e.target.value)}
                      className="flex-1 rounded border px-2 py-1 text-sm"
                      placeholder={`Task ${ti + 1}`}
                    />
                    <button
                      onClick={() => removeTask(si, ti)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {tasks[si].length > 0 && (
              <p className="mt-2 text-[11px] text-gray-500">
                Order maps to rings from outside to inside.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
