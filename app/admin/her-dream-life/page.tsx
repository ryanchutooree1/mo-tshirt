"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
} from "firebase/firestore";

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

const DEFAULT_TASKS = Array.from({ length: 9 }, (_, i) => ({
  id: `task-${i + 1}`,
  text: `Task ${i + 1}`,
  done: false,
}));

const COLLECTION = "dreamLife_her";

export default function HerDreamLifePage() {
  const year = new Date().getFullYear();
  const rings = 10;
  const bands = rings - 1;

  const [tasks, setTasks] = useState<Task[][]>(
    SECTORS.map(() => [...DEFAULT_TASKS])
  );

  // Load + seed
  useEffect(() => {
    const normalizeToBands = (arr: any[]): Task[] => {
      const out: Task[] = [];
      const len = Math.max(Array.isArray(arr) ? arr.length : 0, 9);
      for (let i = 0; i < len; i++) {
        const item = Array.isArray(arr) ? arr[i] : undefined;
        out.push({
          id: String(item?.id ?? `task-${i + 1}`),
          text: String(item?.text ?? `Task ${i + 1}`),
          done: Boolean(item?.done ?? false),
        });
      }
      return out;
    };

    const load = async () => {
      try {
        const colRef = collection(db, COLLECTION);
        const snapshot = await getDocs(colRef);
        const merged: Task[][] = SECTORS.map(() => DEFAULT_TASKS());
        const seen = new Set<string>();
        snapshot.forEach((docSnap) => {
          const id = docSnap.id;
          const idx = SECTORS.findIndex((s) => s.key === id);
          if (idx >= 0) {
            const saved = (docSnap.data() as any)?.tasks;
            merged[idx] = Array.isArray(saved) && saved.length
              ? normalizeToBands(saved)
              : DEFAULT_TASKS();
            seen.add(id);
          }
        });
        setTasks(merged);
        const missing = SECTORS.filter((s) => !seen.has(s.key)).map((s, si) =>
          setDoc(
            doc(db, COLLECTION, s.key),
            { tasks: merged[si] },
            { merge: true }
          )
        );
        if (missing.length) await Promise.all(missing);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, []);

  // Merge safeguard
  useEffect(() => {
    const save = async () => {
      try {
        await Promise.all(
          SECTORS.map((s, si) =>
            setDoc(
              doc(db, COLLECTION, s.key),
              { tasks: tasks[si] },
              { merge: true }
            )
          )
        );
      } catch (e) {
        console.error(e);
      }
    };
    save();
  }, [tasks]);

  // Row save + toast
  const [saveState, setSaveState] = useState<
    Record<string, "idle" | "saving" | "saved" | "error">
  >({});
  const [toast, setToast] = useState<string | null>(null);
  const keyFor = (si: number, ti: number) => `${si}-${ti}`;

  const updateTaskText = (si: number, ti: number, text: string) =>
    setTasks((all) => {
      const copy = all.map((arr) => [...arr]);
      copy[si][ti] = { ...copy[si][ti], text };
      return copy;
    });
  const saveRow = async (si: number, ti: number, updated: Task[][]) => {
    const k = keyFor(si, ti);
    setSaveState((s) => ({ ...s, [k]: "saving" }));
    try {
      await setDoc(
        doc(db, COLLECTION, SECTORS[si].key),
        { tasks: updated[si] },
        { merge: true }
      );
      setSaveState((s) => ({ ...s, [k]: "saved" }));
      setToast("Saved to Firebase");
      setTimeout(() => {
        setSaveState((s) => ({ ...s, [k]: "idle" }));
        setToast(null);
      }, 1500);
    } catch (e) {
      console.error(e);
      setSaveState((s) => ({ ...s, [k]: "error" }));
      setToast("Save failed");
      setTimeout(() => setToast(null), 2000);
    }
  };
  const toggleTask = (si: number, ti: number) =>
    setTasks((all) => {
      const copy = all.map((arr) => [...arr]);
      copy[si][ti] = { ...copy[si][ti], done: !copy[si][ti].done };
      void saveRow(si, ti, copy);
      return copy;
    });
  const resetAll = async () => {
    const fresh = SECTORS.map(() => [...DEFAULT_TASKS]);
    setTasks(fresh);
    try {
      const batch = writeBatch(db);
      SECTORS.forEach((s, si) =>
        batch.set(doc(db, COLLECTION, s.key), { tasks: fresh[si] })
      );
      await batch.commit();
      setToast("All reset");
      setTimeout(() => setToast(null), 1500);
    } catch (e) {
      console.error(e);
      setToast("Reset failed");
      setTimeout(() => setToast(null), 2000);
    }
  };

  // SVG helpers
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
  const doneColor = "#f9a8d4";

  return (
    <div className="mx-auto max-w-7xl p-4">
      {toast && (
        <div className="fixed top-4 right-4 rounded bg-black text-white text-sm px-3 py-2 shadow-lg z-50">
          {toast}
        </div>
      )}
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-pink-600">
          Her Dream Life
        </h1>
        <button
          onClick={resetAll}
          className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-gray-50"
        >
          Reset
        </button>
      </header>
      <div className="flex justify-center mb-10">
        <svg
          width={size + padding * 2}
          height={size + padding * 2}
          viewBox={`0 0 ${size + padding * 2} ${size + padding * 2}`}
        >
          <g transform={`translate(${padding}, ${padding})`}>
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
            {SECTORS.map((_, i) => {
              const { x, y } = polarToXY(radius, i * angleStep);
              return (
                <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" />
              );
            })}
            <circle cx={cx} cy={cy} r={60} fill="#ffffff" stroke="#e5e7eb" />
            <text
              x={cx}
              y={cy + 6}
              textAnchor="middle"
              className="fill-pink-600"
              fontSize="20"
              fontWeight="700"
            >
              {year}
            </text>
            {SECTORS.map((s, i) => {
              const angle = (i + 0.5) * angleStep;
              const p = polarToXY(radius + 50, angle);
              const pt = { ...p };
              // Manual fine-tuning
              if (s.key === "romance") pt.x -= 10;
              if (s.key === "career") pt.x += 10;
              if (s.key === "spiritual") pt.x += 10;
              let anchor: "start" | "end" | "middle" = "middle";
              if (angle >= 75 && angle <= 105) anchor = "middle";
              else if (angle > 105 && angle < 255) anchor = "end";
              else if (angle >= 255 && angle <= 285) anchor = "middle";
              else anchor = "start";
              return (
                <text
                  key={s.key}
                  x={pt.x}
                  y={pt.y}
                  textAnchor={anchor}
                  fontSize="12"
                  fontWeight="600"
                  className="fill-pink-600"
                >
                  {s.label}
                </text>
              );
            })}
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
                        fill={checked ? doneColor : "#ffffff"}
                        stroke="#d1d5db"
                        onClick={() => toggleTask(si, b)}
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {SECTORS.map((s, si) => (
          <div
            key={s.key}
            className="rounded-xl border shadow-sm overflow-hidden"
          >
            <div className="bg-gray-100 px-3 py-2 text-sm font-semibold tracking-wide text-gray-700 sticky top-0">
              {s.label}
            </div>
            <ul className="divide-y divide-gray-200">
              {tasks[si].map((t, ti) => {
                const st = saveState[keyFor(si, ti)] ?? "idle";
                return (
                  <li
                    key={t.id}
                    className={`flex items-center gap-3 px-3 py-2 transition ${
                      t.done ? "bg-green-50 border-l-4 border-green-400" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={() => toggleTask(si, ti)}
                      className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <input
                      value={t.text}
                      onChange={(e) => updateTaskText(si, ti, e.target.value)}
                      className="flex-1 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
                    />
                    <button
                      onClick={() => saveRow(si, ti, tasks)}
                      disabled={st === "saving"}
                      className={`text-xs rounded px-3 py-1 font-medium transition ${
                        st === "saved"
                          ? "bg-green-500 text-white"
                          : st === "saving"
                          ? "bg-gray-300 text-gray-700"
                          : "border border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {st === "saving" ? "..." : st === "saved" ? "✓" : "Done"}
                    </button>
                    {st === "error" && (
                      <span className="text-xs text-red-600 ml-2">
                        Save failed
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
