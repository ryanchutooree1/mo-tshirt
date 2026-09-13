"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  Banknote,
  Bath,
  BedDouble,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  Clock3,
  Droplets,
  MapPin,
  MessageCircle,
  PanelsTopLeft,
  Phone,
  RotateCcw,
  ScanLine,
  Shirt,
  Sparkles,
  Utensils,
} from "lucide-react";
import { db } from "@/lib/firebase";
import styles from "./cleaning-planning.module.css";

type SundayPlan = {
  tasks: string[];
  pickupReady: boolean;
  cashReady: boolean;
  notes: string;
  completedAt?: string;
};

type CleaningData = {
  weeks: Record<string, SundayPlan>;
};

type SaveState = "loading" | "idle" | "saving" | "saved" | "offline";

const STORAGE_DOC = doc(db, "homePlanning", "cleaning");
const LOCAL_STORAGE_KEY = "mo-cleaning-planning-v1";
const EMPTY_PLAN: SundayPlan = {
  tasks: [],
  pickupReady: false,
  cashReady: false,
  notes: "",
};

const TASKS = [
  {
    id: "ironing",
    title: "Iron working clothes",
    detail: "Do this first so weekday outfits are ready to wear.",
    icon: Shirt,
    priority: true,
  },
  {
    id: "floors",
    title: "Clean the floors",
    detail: "Sweep and mop all living areas.",
    icon: Droplets,
    priority: false,
  },
  {
    id: "mirrors",
    title: "Clean the mirrors",
    detail: "Leave glass clear and streak-free.",
    icon: ScanLine,
    priority: false,
  },
  {
    id: "tables",
    title: "Wipe the tables",
    detail: "Clear surfaces, dust, then wipe down.",
    icon: PanelsTopLeft,
    priority: false,
  },
  {
    id: "bathroom",
    title: "Clean the bathroom",
    detail: "Wash and refresh the full bathroom.",
    icon: Bath,
    priority: false,
  },
  {
    id: "bed",
    title: "Make the bed",
    detail: "Finish with a tidy, ready bedroom.",
    icon: BedDouble,
    priority: false,
  },
  {
    id: "dishes",
    title: "Wash the dishes",
    detail: "Clear the sink and leave the kitchen reset.",
    icon: Utensils,
    priority: false,
  },
] as const;

function normalizePlan(value: unknown): SundayPlan {
  if (!value || typeof value !== "object") return { ...EMPTY_PLAN };
  const plan = value as Partial<SundayPlan>;
  const validTaskIds = new Set(TASKS.map((task) => task.id));
  return {
    tasks: Array.isArray(plan.tasks)
      ? plan.tasks.filter((task): task is string => typeof task === "string" && validTaskIds.has(task as never))
      : [],
    pickupReady: plan.pickupReady === true,
    cashReady: plan.cashReady === true,
    notes: typeof plan.notes === "string" ? plan.notes : "",
    completedAt: typeof plan.completedAt === "string" ? plan.completedAt : undefined,
  };
}

function normalizeData(value: unknown): CleaningData {
  if (!value || typeof value !== "object") return { weeks: {} };
  const rawWeeks = (value as { weeks?: unknown }).weeks;
  if (!rawWeeks || typeof rawWeeks !== "object") return { weeks: {} };
  return {
    weeks: Object.fromEntries(
      Object.entries(rawWeeks as Record<string, unknown>).map(([key, plan]) => [key, normalizePlan(plan)])
    ),
  };
}

function getMauritiusSunday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Indian/Mauritius",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(read("weekday"));
  const date = new Date(Date.UTC(Number(read("year")), Number(read("month")) - 1, Number(read("day")), 12));
  date.setUTCDate(date.getUTCDate() + ((7 - dayIndex) % 7));
  const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  return {
    key,
    label: new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date),
    isToday: dayIndex === 0,
  };
}

export default function CleaningPlanningPage() {
  const sunday = useMemo(() => getMauritiusSunday(), []);
  const [data, setData] = useState<CleaningData>({ weeks: {} });
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const plan = data.weeks[sunday.key] || EMPTY_PLAN;
  const completedTasks = plan.tasks.length;
  const completedSteps = completedTasks + Number(plan.pickupReady) + Number(plan.cashReady);
  const totalSteps = TASKS.length + 2;
  const progress = Math.round((completedSteps / totalSteps) * 100);
  const readyToFinish = completedTasks === TASKS.length && plan.pickupReady && plan.cashReady;
  const isComplete = Boolean(plan.completedAt);

  useEffect(() => {
    let ignore = false;

    async function load() {
      let localData: CleaningData = { weeks: {} };
      try {
        const saved = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          localData = normalizeData(JSON.parse(saved));
          if (!ignore) setData(localData);
        }
      } catch {}

      try {
        const snapshot = await getDoc(STORAGE_DOC);
        if (ignore) return;
        if (snapshot.exists()) {
          const remoteData = normalizeData(snapshot.data());
          setData(remoteData);
          window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remoteData));
        }
        setSaveState("idle");
      } catch {
        if (!ignore) setSaveState("offline");
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, []);

  async function persist(nextData: CleaningData) {
    setData(nextData);
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextData));
    } catch {}
    setSaveState("saving");
    try {
      await setDoc(STORAGE_DOC, { ...nextData, updatedAt: new Date().toISOString() }, { merge: true });
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1800);
    } catch {
      setSaveState("offline");
    }
  }

  function updatePlan(patch: Partial<SundayPlan>) {
    const nextPlan = { ...plan, ...patch };
    if (patch.tasks || patch.pickupReady === false || patch.cashReady === false) {
      delete nextPlan.completedAt;
    }
    void persist({
      ...data,
      weeks: { ...data.weeks, [sunday.key]: nextPlan },
    });
  }

  function toggleTask(taskId: string) {
    const tasks = plan.tasks.includes(taskId)
      ? plan.tasks.filter((id) => id !== taskId)
      : [...plan.tasks, taskId];
    updatePlan({ tasks });
  }

  function completeSunday() {
    const nextPlan: SundayPlan = {
      ...plan,
      tasks: TASKS.map((task) => task.id),
      pickupReady: true,
      cashReady: true,
      completedAt: new Date().toISOString(),
    };
    void persist({ ...data, weeks: { ...data.weeks, [sunday.key]: nextPlan } });
  }

  function resetSunday() {
    if (!window.confirm("Reset this Sunday’s cleaning checklist?")) return;
    void persist({ ...data, weeks: { ...data.weeks, [sunday.key]: { ...EMPTY_PLAN } } });
  }

  const syncLabel =
    saveState === "loading"
      ? "Loading plan"
      : saveState === "saving"
        ? "Saving…"
        : saveState === "saved"
          ? "Saved"
          : saveState === "offline"
            ? "Saved on this device"
            : "Up to date";

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}><Sparkles size={15} /> Our Home</span>
            <h1>Sunday cleaning</h1>
            <p>Everything ready for a calm, clean week.</p>
          </div>
          <div className={styles.headerMeta}>
            <span className={styles.syncDot} data-state={saveState} />
            <span>{syncLabel}</span>
          </div>
        </header>

        <section className={styles.overview} aria-label="Upcoming cleaning visit">
          <div className={styles.visitCard}>
            <div className={styles.visitTopline}>
              <span className={styles.datePill}><CalendarDays size={16} /> {sunday.isToday ? "Today" : "Next Sunday"}</span>
              <span className={styles.schedule}>Weekly</span>
            </div>
            <div className={styles.visitMain}>
              <div>
                <p className={styles.date}>{sunday.label}</p>
                <h2>Adel is coming</h2>
                <p className={styles.time}><Clock3 size={18} /> 8:30 AM – 12:00 PM <span>3h 30m</span></p>
              </div>
              <div
                className={styles.progressRing}
                style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}
                aria-label={`${progress}% ready`}
              >
                <div><strong>{progress}%</strong><span>{isComplete ? "done" : "ready"}</span></div>
              </div>
            </div>
            <div className={styles.quickActions}>
              <a href="tel:+23054542265"><Phone size={17} /> Call Adel</a>
              <a href="https://wa.me/23054542265" target="_blank" rel="noreferrer"><MessageCircle size={17} /> WhatsApp</a>
              <a href="https://www.google.com/maps/search/?api=1&query=Taxi+Stand%2C+Chemin+Grenier%2C+Mauritius" target="_blank" rel="noreferrer"><MapPin size={17} /> Open pickup</a>
            </div>
          </div>

          <div className={styles.arrivalCard}>
            <div className={styles.avatar} aria-hidden="true">A</div>
            <div className={styles.arrivalTitle}>
              <span>Cleaner</span>
              <h2>Adel</h2>
              <a href="tel:+23054542265">5454 2265</a>
            </div>
            <div className={styles.detailRows}>
              <div><span><CarFront size={17} /> Pick up</span><strong>Taxi Stand, Chemin Grenier</strong></div>
              <div><span><Banknote size={17} /> Payment</span><strong>Rs 700 · cash</strong></div>
            </div>
          </div>
        </section>

        <section className={styles.prepCard} aria-labelledby="before-arrival-title">
          <div>
            <span className={styles.sectionKicker}>Before 8:30 AM</span>
            <h2 id="before-arrival-title">Arrival checklist</h2>
          </div>
          <div className={styles.prepActions}>
            <button type="button" data-checked={plan.pickupReady} onClick={() => updatePlan({ pickupReady: !plan.pickupReady })}>
              <span className={styles.checkIcon}>{plan.pickupReady ? <Check size={16} /> : <CarFront size={17} />}</span>
              <span><strong>Pickup planned</strong><small>Car · Taxi Stand</small></span>
            </button>
            <button type="button" data-checked={plan.cashReady} onClick={() => updatePlan({ cashReady: !plan.cashReady })}>
              <span className={styles.checkIcon}>{plan.cashReady ? <Check size={16} /> : <Banknote size={17} />}</span>
              <span><strong>Rs 700 ready</strong><small>Cash for Adel</small></span>
            </button>
          </div>
        </section>

        <div className={styles.workspace}>
          <section className={styles.routineCard} aria-labelledby="routine-title">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionKicker}>In this order</span>
                <h2 id="routine-title">Sunday routine</h2>
              </div>
              <span className={styles.counter}>{completedTasks} of {TASKS.length} done</span>
            </div>

            <div className={styles.taskList}>
              {TASKS.map((task, index) => {
                const checked = plan.tasks.includes(task.id);
                const Icon = task.icon;
                return (
                  <button
                    key={task.id}
                    type="button"
                    className={styles.task}
                    data-checked={checked}
                    data-priority={task.priority || undefined}
                    onClick={() => toggleTask(task.id)}
                  >
                    <span className={styles.taskNumber}>{String(index + 1).padStart(2, "0")}</span>
                    <span className={styles.taskIcon}>{checked ? <Check size={20} /> : <Icon size={20} />}</span>
                    <span className={styles.taskCopy}>
                      <span className={styles.taskTitleLine}>
                        <strong>{task.title}</strong>
                        {task.priority ? <em>First priority</em> : null}
                      </span>
                      <small>{task.detail}</small>
                    </span>
                    <span className={styles.taskStatus}>{checked ? "Done" : "To do"}</span>
                  </button>
                );
              })}
            </div>

            <div className={styles.routineFooter}>
              <button type="button" className={styles.resetButton} onClick={resetSunday}><RotateCcw size={16} /> Reset</button>
              <button type="button" className={styles.completeButton} data-ready={readyToFinish} onClick={completeSunday}>
                <CheckCircle2 size={18} /> {isComplete ? "Sunday completed" : "Complete Sunday"}
              </button>
            </div>
          </section>

          <aside className={styles.sideColumn}>
            <section className={styles.focusCard}>
              <div className={styles.focusIcon}><Shirt size={23} /></div>
              <span className={styles.sectionKicker}>The one non-negotiable</span>
              <h2>Weekday clothes first</h2>
              <p>Keep shirts, trousers and work outfits together before Adel arrives. Ironing starts before the rest of the cleaning.</p>
              <div className={styles.focusFooter}><Clock3 size={16} /><span>Start at 8:30 AM</span></div>
            </section>

            <section className={styles.notesCard}>
              <span className={styles.sectionKicker}>For this Sunday</span>
              <h2>Notes for Adel</h2>
              <textarea
                value={plan.notes}
                onChange={(event) => setData((current) => ({
                  ...current,
                  weeks: { ...current.weeks, [sunday.key]: { ...plan, notes: event.target.value } },
                }))}
                onBlur={() => updatePlan({ notes: plan.notes })}
                placeholder="Anything different this week? Add it here…"
                rows={6}
              />
              <p>Saved when you leave the note.</p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
