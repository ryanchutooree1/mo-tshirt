"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";

// Shared types
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

const DEFAULT_TASKS = (count = 9): Task[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `task-${i + 1}`,
    text: `Task ${i + 1}`,
    done: false,
  }));

// --- Reusable LifeWheel ---
function LifeWheel({
  who,
  color,
}: {
  who: "his" | "her";
  color: "blue" | "pink";
}) {
  const year = new Date().getFullYear();
  const rings = 10;
  const bands = rings - 1;

  const [tasks, setTasks] = useState<Task[][]>(
    SECTORS.map(() => DEFAULT_TASKS())
  );

  // --- Load from Firebase ---
  useEffect(() => {
    const load = async () => {
      const snapshot = await getDocs(collection(db, `dreamLife_${who}`));
      if (snapshot.empty) return;

      const merged: Task[][] = SECTORS.map(() => DEFAULT_TASKS());
      snapshot.forEach((docSnap) => {
        const idx = SECTORS.findIndex((s) => s.key === docSnap.id);
        if (idx >= 0) {
          const saved = (docSnap.data() as any)?.tasks || [];
          merged[idx] = DEFAULT_TASKS().map((def, i) => ({
            id: String(saved[i]?.id ?? def.id),
            text: String(saved[i]?.text ?? def.text),
            done: Boolean(saved[i]?.done ?? def.done),
          }));
        }
      });
      setTasks(merged);
    };
    load();
  }, [who]);

  // --- Save helper ---
  const saveSector = async (si: number, sectorTasks: Task[]) => {
    await setDoc(doc(db, `dreamLife_${who}`, SECTORS[si].key), {
      tasks: sectorTasks,
    });
  };

  const toggleBySegment = async (si: number, b: number) => {
    const copy = tasks.map((arr) => [...arr]);
    copy[si][b] = { ...copy[si][b], done: !copy[si][b].done };
    setTasks(copy);
    await saveSector(si, copy[si]);
  };

  // --- SVG helpers ---
  const radius = 200;
  const cx = 240;
  const cy = 240;
  const size = 480;
  const padding = 50;
  const angleStep = 360 / SECTORS.length;

  const polarToXY = (r: number, angleDeg: number) => {
    const a = (angleDeg - 90) * (Math.PI / 180);
    const x = Math.round((cx + r * Math.cos(a)) * 1000) / 1000;
    const y = Math.round((cy + r * Math.sin(a)) * 1000) / 1000;
    return { x, y };
  };

  const annularPath = (r0: number, r1: number, a0: number, a1: number) => {
    const p0 = polarToXY(r0, a0);
    const p1 = polarToXY(r0, a1);
    const p2 = polarToXY(r1, a1);
    const p3 = polarToXY(r1, a0);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${p0.x} ${p0.y} A ${r0} ${r0} 0 ${large} 1 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${r1} ${r1} 0 ${large} 0 ${p3.x} ${p3.y} Z`;
  };

  const doneColor = color === "blue" ? "#93c5fd" : "#f9a8d4";
  const textColor = color === "blue" ? "fill-blue-600" : "fill-pink-600";

  return (
    <div className="flex flex-col items-center">
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
            return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" />;
          })}
          <circle cx={cx} cy={cy} r={50} fill="#fff" stroke="#e5e7eb" />
          <text
            x={cx}
            y={cy + 6}
            textAnchor="middle"
            className={`font-bold ${textColor}`}
            fontSize="18"
          >
            {year}
          </text>

          {SECTORS.map((s, i) => {
            const angle = (i + 0.5) * angleStep;
            const pt = polarToXY(radius + 40, angle);
            let anchor: "start" | "end" | "middle" = "middle";
            if (angle > 90 && angle < 270) anchor = "end";
            else if (angle < 90 || angle > 270) anchor = "start";
            return (
              <text
                key={s.key}
                x={pt.x}
                y={pt.y}
                textAnchor={anchor}
                fontSize="10"
                fontWeight="600"
                className={textColor}
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
                      fill={checked ? doneColor : "#fff"}
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
  );
}

// --- Our Dream Page ---
export default function OurDreamPage() {
  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="text-xl md:text-2xl font-bold mb-8 text-center">
        Our Dream
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Her */}
        <div>
          <h2 className="text-center text-pink-600 font-semibold mb-4">
            Her Dream Life
          </h2>
          <LifeWheel who="her" color="pink" />
        </div>

        {/* His */}
        <div>
          <h2 className="text-center text-blue-600 font-semibold mb-4">
            His Dream Life
          </h2>
          <LifeWheel who="his" color="blue" />
        </div>
      </div>
    </div>
  );
}

