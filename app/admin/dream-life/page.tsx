"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";

type Sector = { key: string; label: string };
type Task = { id: string; text: string; done: boolean };

const SECTORS: Sector[] = [
  { key: "health", label: "HEALTH & FITNESS" },
  { key: "selfdev", label: "SELF DEVELOPMENT" },
  { key: "lifestyle", label: "LIFESTYLE" },
  { key: "career", label: "CAREER / BUSINESS" },
  { key: "spiritual", label: "SPIRITUALITY" },
  { key: "travel", label: "TRAVEL" },
  { key: "hobbies", label: "FUN & HOBBIES" },
  { key: "home", label: "HOME" },
  { key: "family", label: "FRIENDS & FAMILY" },
  { key: "romance", label: "ROMANCE" },
  { key: "giving", label: "GIVING" },
  { key: "finances", label: "FINANCES" },
];

// Default 9 tasks
const DEFAULT_TASKS = Array.from({ length: 9 }, (_, i) => ({
  id: `task-${i + 1}`,
  text: `Task ${i + 1}`,
  done: false,
}));

export default function DreamLifePage() {
  const year = new Date().getFullYear();

  const rings = 10;
  const bands = rings - 1;

  const [tasks, setTasks] = useState<Task[][]>(
    SECTORS.map(() => [...DEFAULT_TASKS])
  );

  // --- Load from Firebase and seed missing sectors ---
  useEffect(() => {
    const ensureNine = (arr: any[]): Task[] => {
      const base = DEFAULT_TASKS.map((t) => ({ ...t }));
      if (!Array.isArray(arr)) return base;
      const normalized: Task[] = [];
      for (let i = 0; i < 9; i++) {
        const item = arr[i];
        if (item && typeof item === "object") {
          normalized.push({
            id: String(item.id ?? `task-${i + 1}`),
            text: String(item.text ?? `Task ${i + 1}`),
            done: Boolean(item.done),
          });
        } else {
          normalized.push({ ...base[i] });
        }
      }
      return normalized;
    };

    const load = async () => {
      try {
        const colRef = collection(db, "dreamLife");
        const snapshot = await getDocs(colRef);

        // Start with defaults for all sectors
        const merged: Task[][] = SECTORS.map(() => DEFAULT_TASKS.map((t) => ({ ...t })));
        const seen = new Set<string>();

        snapshot.forEach((docSnap) => {
          const id = docSnap.id;
          const idx = SECTORS.findIndex((s) => s.key === id);
          if (idx >= 0) {
            const saved = (docSnap.data() as any)?.tasks;
            merged[idx] = ensureNine(saved);
            seen.add(id);
          }
        });

        setTasks(merged);

        // Seed any missing sector docs so all 12 exist going forward
        const missingWrites = SECTORS.filter((s) => !seen.has(s.key)).map((s, si) =>
          setDoc(doc(db, "dreamLife", s.key), { tasks: merged[si] }, { merge: true })
        );
        if (missingWrites.length) await Promise.all(missingWrites);
      } catch (e) {
        console.error("Error loading from Firebase:", e);
      }
    };
    load();
  }, []);

  // --- Save to Firebase (merge) ---
  useEffect(() => {
    const save = async () => {
      try {
        await Promise.all(
          SECTORS.map((s, si) =>
            setDoc(doc(db, "dreamLife", s.key), { tasks: tasks[si] }, { merge: true })
          )
        );
      } catch (e) {
        console.error("Error saving to Firebase:", e);
      }
    };
    save();
  }, [tasks]);

  // --- Task helpers
  const updateTaskText = (si: number, ti: number, text: string) =>
    setTasks((all) => {
      const copy = all.map((arr) => [...arr]);
      copy[si][ti] = { ...copy[si][ti], text };
      return copy;
    });

  const toggleTask = (si: number, ti: number) =>
    setTasks((all) => {
      const copy = all.map((arr) => [...arr]);
      copy[si][ti] = { ...copy[si][ti], done: !copy[si][ti].done };
      return copy;
    });

  const resetAll = () => setTasks(SECTORS.map(() => [...DEFAULT_TASKS]));

  // --- SVG helpers
  const radius = 260;
  const cx = 320;
  const cy = 320;
  const size = 640;
  const padding = 100;
  const angleStep = 360 / SECTORS.length;

  const polarToXY = (r: number, angleDeg: number) => {
    const a = (angleDeg - 90) * (Math.PI / 180);
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    // round to avoid floating-point mismatch
    return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
  };

  const annularPath = (r0: number, r1: number, a0: number, a1: number) => {
    const p0 = polarToXY(r0, a0);
    const p1 = polarToXY(r0, a1);
    const p2 = polarToXY(r1, a1);
    const p3 = polarToXY(r1, a0);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${p0.x} ${p0.y} A ${r0} ${r0} 0 ${large} 1 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${r1} ${r1} 0 ${large} 0 ${p3.x} ${p3.y} Z`;
  };

  const toggleBySegment = (si: number, b: number) =>
    setTasks((all) => {
      const copy = all.map((arr) => [...arr]);
      if (copy[si][b]) {
        copy[si][b] = { ...copy[si][b], done: !copy[si][b].done };
      }
      return copy;
    });

  return (
    <div className="mx-auto max-w-7xl p-4">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">
          DESIGNING MY DREAM LIFE
        </h1>
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
          width={size + padding * 2}
          height={size + padding * 2}
          viewBox={`0 0 ${size + padding * 2} ${size + padding * 2}`}
        >
          <g transform={`translate(${padding}, ${padding})`}>
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
              return (
                <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" />
              );
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
              const angle = (i + 0.5) * angleStep;
              const pt = polarToXY(radius + 50, angle);

              let anchor: "start" | "end" | "middle" = "middle";
              if (angle > 90 && angle < 270) anchor = "end";
              else if (angle < 90 || angle > 270) anchor = "start";

              return (
                <text
                  key={s.key}
                  x={pt.x}
                  y={pt.y}
                  textAnchor={anchor}
                  fontSize="12"
                  fontWeight="600"
                  className="fill-gray-800"
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
          </g>
        </svg>
      </div>

      {/* Task Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {SECTORS.map((s, si) => (
          <div key={s.key} className="rounded-lg border p-3">
            <h2 className="mb-2 text-sm font-semibold tracking-wide">
              {s.label}
            </h2>

            <ul className="space-y-2">
              {tasks[si].map((t, ti) => (
                <li key={t.id} className="flex items-center gap-2 group">
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
                  />
                  {/* Delete only on hover */}
                  <button
                    onClick={() =>
                      setTasks((all) => {
                        const copy = all.map((arr) => [...arr]);
                        copy[si][ti] = {
                          ...copy[si][ti],
                          text: "",
                          done: false,
                        };
                        return copy;
                      })
                    }
                    className="text-xs text-red-600 hover:underline opacity-0 group-hover:opacity-100 transition"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
