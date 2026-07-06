"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Heart,
  Mail,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Trophy,
  Utensils,
} from "lucide-react";
import { db } from "@/lib/firebase";

type ShiftKey = "first" | "second" | "third" | "m" | "rest";
type MShiftChoice = "not-confirmed" | Exclude<ShiftKey, "m">;
type GoalStatus = "Not Started" | "In Progress" | "Completed";

type LittleWin = {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
  notes: string;
};

type Goal = {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  status: GoalStatus;
  notes: string;
  wins: LittleWin[];
};

type CoupleSettings = {
  rotationStartDate: string;
  sendTime: string;
  emailEnabled: boolean;
  recipients: string[];
  lastFoodEmailDayKey?: string;
};

type CoupleData = {
  settings: CoupleSettings;
  herShiftOverrides: Record<string, Exclude<ShiftKey, "m">>;
  mShiftOverrides: Record<string, MShiftChoice>;
  dayNotes: Record<string, string>;
  goals: Goal[];
  foodPlan: Record<string, string>;
};

type WorkBlock = {
  owner: "me" | "her";
  label: string;
  start: number;
  end: number;
  overnight?: boolean;
  uncertain?: boolean;
};

type DayAnalysis = {
  date: Date;
  key: string;
  dayName: string;
  mineLabel: string;
  herLabel: string;
  herShift: ShiftKey;
  effectiveHerShift: ShiftKey | "not-confirmed";
  blocks: WorkBlock[];
  sharedFree: Array<{ start: number; end: number }>;
  bestSlot: { start: number; end: number } | null;
  restDay: boolean;
  overnight: boolean;
  mUnconfirmed: boolean;
  postThirdRest: boolean;
};

const STORAGE_DOC = doc(db, "coupleGoals", "workspace");
const MAURITIUS_TIMEZONE = "Indian/Mauritius";
const WEEK_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const GOAL_STATUSES: GoalStatus[] = ["Not Started", "In Progress", "Completed"];
const PATTERN: ShiftKey[] = ["first", "third", "second", "m", "first", "third", "second", "rest"];
const ACTUAL_CALENDAR_ALIASES = [
  "First = First Shift",
  "2nd = Second Shift",
  "Last = Third Shift",
  "Off duty = Rest Day",
];
const ACTUAL_CALENDAR_IMPORT: Record<string, Exclude<ShiftKey, "m">> = {
  "2026-07-06": "third",
  "2026-07-07": "rest",
  "2026-07-08": "rest",
  "2026-07-09": "first",
  "2026-07-10": "third",
  "2026-07-11": "rest",
  "2026-07-12": "rest",
  "2026-07-13": "second",
  "2026-07-14": "rest",
  "2026-07-15": "first",
  "2026-07-16": "third",
  "2026-07-17": "rest",
  "2026-07-18": "second",
  "2026-07-19": "rest",
  "2026-07-20": "first",
  "2026-07-21": "third",
  "2026-07-22": "rest",
  "2026-07-23": "second",
  "2026-07-24": "rest",
  "2026-07-25": "first",
  "2026-07-26": "third",
  "2026-07-27": "rest",
  "2026-07-28": "second",
  "2026-07-29": "rest",
  "2026-07-30": "rest",
  "2026-07-31": "rest",
};
const SHIFT_LABELS: Record<ShiftKey | "not-confirmed", string> = {
  first: "First Shift",
  second: "Second Shift",
  third: "Third Shift",
  m: "M Shift",
  rest: "Rest Day",
  "not-confirmed": "Not Confirmed",
};
const M_CHOICES: MShiftChoice[] = ["not-confirmed", "first", "second", "third", "rest"];
const DEFAULT_FOOD_PLAN: Record<string, string> = {
  Monday: "Butter Chicken",
  Tuesday: "Sausages Saute",
  Wednesday: "Eggs Salad",
  Thursday: "Vindaye Poisson",
  Friday: "Beetroot Salad",
  Saturday: "Batonnet Crab",
  Sunday: "Agneau Salmi",
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const WAKING_START = 6 * 60;
const WAKING_END = 23 * 60 + 30;

function todayKey() {
  return formatDateKey(new Date());
}

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function minutesToTime(total: number) {
  const minutes = Math.max(0, Math.min(24 * 60, total));
  const hh = `${Math.floor(minutes / 60)}`.padStart(2, "0");
  const mm = `${minutes % 60}`.padStart(2, "0");
  return `${hh}:${mm}`;
}

function slotLabel(slot: { start: number; end: number }) {
  return `${minutesToTime(slot.start)} - ${minutesToTime(slot.end)}`;
}

function durationLabel(slot: { start: number; end: number }) {
  const minutes = Math.max(0, slot.end - slot.start);
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (!hours) return `${rem}m`;
  if (!rem) return `${hours}h`;
  return `${hours}h ${rem}m`;
}

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getMauritiusDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MAURITIUS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    key: `${read("year")}-${read("month")}-${read("day")}`,
    weekday: read("weekday"),
  };
}

function getMineBlocks(date: Date): WorkBlock[] {
  const day = date.getDay();
  if (day === 0 || day === 6) return [];
  return [{ owner: "me", label: "My work", start: 8 * 60 + 30, end: 17 * 60 }];
}

function getMineLabel(date: Date) {
  return getMineBlocks(date).length ? "08:30 - 17:00" : "Rest day";
}

function getPatternShift(date: Date, rotationStartDate: string) {
  const start = parseDateKey(rotationStartDate || todayKey());
  const diff = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
      DAY_MS
  );
  const index = ((diff % PATTERN.length) + PATTERN.length) % PATTERN.length;
  return PATTERN[index];
}

function getScheduledHerShift(date: Date, data: CoupleData): ShiftKey {
  const key = formatDateKey(date);
  return data.herShiftOverrides[key] || getPatternShift(date, data.settings.rotationStartDate);
}

function resolveHerShift(date: Date, data: CoupleData): ShiftKey | "not-confirmed" {
  const shift = getScheduledHerShift(date, data);
  if (shift !== "m") return shift;
  const override = data.mShiftOverrides[formatDateKey(date)] || "not-confirmed";
  return override === "not-confirmed" ? "not-confirmed" : override;
}

function isPostThirdRestDay(date: Date, data: CoupleData) {
  return resolveHerShift(addDays(date, -1), data) === "third";
}

function getHerBlocksForDay(date: Date, data: CoupleData): WorkBlock[] {
  const key = formatDateKey(date);
  const shift = getScheduledHerShift(date, data);
  const effective = resolveHerShift(date, data);
  const previousEffective = resolveHerShift(addDays(date, -1), data);
  const blocks: WorkBlock[] = [];

  if (previousEffective === "third") {
    blocks.push({
      owner: "her",
      label: "Third Shift carryover",
      start: 0,
      end: 7 * 60 + 15,
      overnight: true,
    });
    return blocks;
  }

  if (shift === "m" && effective === "not-confirmed") {
    blocks.push({
      owner: "her",
      label: "M Shift pending",
      start: 7 * 60 + 15,
      end: 23 * 60 + 15,
      uncertain: true,
    });
    return blocks;
  }

  if (effective === "first") {
    blocks.push({ owner: "her", label: "First Shift", start: 7 * 60 + 15, end: 15 * 60 + 15 });
  }
  if (effective === "second") {
    blocks.push({ owner: "her", label: "Second Shift", start: 15 * 60 + 15, end: 23 * 60 + 15 });
  }
  if (effective === "third") {
    blocks.push({
      owner: "her",
      label: "Third Shift",
      start: 23 * 60 + 15,
      end: 24 * 60,
      overnight: true,
    });
  }

  return blocks.map((block) => ({ ...block, label: block.uncertain ? `${block.label} (${key})` : block.label }));
}

function mergeBusy(blocks: WorkBlock[]) {
  const certain = blocks
    .filter((block) => !block.uncertain)
    .map((block) => ({ start: Math.max(WAKING_START, block.start), end: Math.min(WAKING_END, block.end) }))
    .filter((block) => block.end > block.start)
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const block of certain) {
    const last = merged[merged.length - 1];
    if (!last || block.start > last.end) {
      merged.push({ ...block });
    } else {
      last.end = Math.max(last.end, block.end);
    }
  }
  return merged;
}

function calculateSharedFree(blocks: WorkBlock[], mUnconfirmed: boolean) {
  if (mUnconfirmed) return [];
  const busy = mergeBusy(blocks);
  const free: Array<{ start: number; end: number }> = [];
  let cursor = WAKING_START;
  for (const block of busy) {
    if (block.start > cursor) free.push({ start: cursor, end: block.start });
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < WAKING_END) free.push({ start: cursor, end: WAKING_END });
  return free.filter((slot) => slot.end - slot.start >= 30);
}

function workBlockTimeLabel(block: WorkBlock) {
  if (block.label === "Third Shift") return "23:15 - 07:15 next day";
  if (block.label === "Third Shift carryover") return "00:00 - 07:15";
  return slotLabel(block);
}

function analyzeDay(date: Date, data: CoupleData): DayAnalysis {
  const key = formatDateKey(date);
  const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
  const mineBlocks = getMineBlocks(date);
  const postThirdRest = isPostThirdRestDay(date, data);
  const herShift = postThirdRest ? "rest" : getScheduledHerShift(date, data);
  const effectiveHerShift = postThirdRest ? "rest" : resolveHerShift(date, data);
  const herBlocks = getHerBlocksForDay(date, data);
  const mUnconfirmed = herShift === "m" && effectiveHerShift === "not-confirmed";
  const blocks = [...mineBlocks, ...herBlocks];
  const sharedFree = calculateSharedFree(blocks, mUnconfirmed);
  const bestSlot =
    sharedFree.length > 0
      ? sharedFree.reduce((best, slot) =>
          slot.end - slot.start > best.end - best.start ? slot : best
        )
      : null;
  const restDay = mineBlocks.length === 0 && effectiveHerShift === "rest";
  const overnight = blocks.some((block) => block.overnight);
  const herWorkLabels = herBlocks.map(
    (block) => `${block.label}: ${workBlockTimeLabel(block)}`
  );
  const herLabel =
    effectiveHerShift === "not-confirmed"
      ? "M Shift - pending confirmation"
      : postThirdRest && herWorkLabels.length
        ? `${herWorkLabels.join(", ")}, off after 07:15`
        : herWorkLabels.join(", ") || "Rest day";

  return {
    date,
    key,
    dayName,
    mineLabel: getMineLabel(date),
    herLabel,
    herShift,
    effectiveHerShift,
    blocks,
    sharedFree,
    bestSlot,
    restDay,
    overnight,
    mUnconfirmed,
    postThirdRest,
  };
}

function defaultData(): CoupleData {
  return {
    settings: {
      rotationStartDate: "2026-07-06",
      sendTime: "07:00",
      emailEnabled: true,
      recipients: [],
    },
    herShiftOverrides: ACTUAL_CALENDAR_IMPORT,
    mShiftOverrides: {},
    dayNotes: {},
    goals: [
      {
        id: newId("goal"),
        title: "Protect one quality-time window every week",
        description: "Use the shared availability calendar to plan a simple date, rest, or errand-free evening.",
        targetDate: "",
        status: "In Progress",
        notes: "Start with the best common free slot each week.",
        wins: [
          {
            id: newId("win"),
            title: "Confirm her next M shift",
            dueDate: "",
            completed: false,
            notes: "",
          },
          {
            id: newId("win"),
            title: "Choose this week's best shared slot",
            dueDate: "",
            completed: false,
            notes: "",
          },
        ],
      },
    ],
    foodPlan: DEFAULT_FOOD_PLAN,
  };
}

function normalizeData(raw: unknown): CoupleData {
  const fallback = defaultData();
  if (!raw || typeof raw !== "object") return fallback;
  const input = raw as Partial<CoupleData>;
  return {
    settings: {
      rotationStartDate:
        typeof input.settings?.rotationStartDate === "string" && input.settings.rotationStartDate
          ? input.settings.rotationStartDate
          : fallback.settings.rotationStartDate,
      sendTime:
        typeof input.settings?.sendTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.settings.sendTime)
          ? input.settings.sendTime
          : "07:00",
      emailEnabled:
        typeof input.settings?.emailEnabled === "boolean" ? input.settings.emailEnabled : true,
      recipients: Array.isArray(input.settings?.recipients)
        ? input.settings.recipients.filter((email) => typeof email === "string" && EMAIL_RE.test(email))
        : [],
      lastFoodEmailDayKey:
        typeof input.settings?.lastFoodEmailDayKey === "string"
          ? input.settings.lastFoodEmailDayKey
          : undefined,
    },
    mShiftOverrides:
      input.mShiftOverrides && typeof input.mShiftOverrides === "object"
        ? (input.mShiftOverrides as Record<string, MShiftChoice>)
        : {},
    herShiftOverrides:
      input.herShiftOverrides && typeof input.herShiftOverrides === "object"
        ? {
            ...ACTUAL_CALENDAR_IMPORT,
            ...(input.herShiftOverrides as Record<string, Exclude<ShiftKey, "m">>),
          }
        : ACTUAL_CALENDAR_IMPORT,
    dayNotes:
      input.dayNotes && typeof input.dayNotes === "object"
        ? Object.fromEntries(
            Object.entries(input.dayNotes).filter(([, value]) => typeof value === "string")
          )
        : {},
    goals: Array.isArray(input.goals) ? input.goals.map(normalizeGoal) : fallback.goals,
    foodPlan: { ...DEFAULT_FOOD_PLAN, ...(input.foodPlan || {}) },
  };
}

function normalizeGoal(goal: Partial<Goal>): Goal {
  const status = GOAL_STATUSES.includes(goal.status as GoalStatus)
    ? (goal.status as GoalStatus)
    : "Not Started";
  return {
    id: typeof goal.id === "string" ? goal.id : newId("goal"),
    title: typeof goal.title === "string" ? goal.title : "",
    description: typeof goal.description === "string" ? goal.description : "",
    targetDate: typeof goal.targetDate === "string" ? goal.targetDate : "",
    status,
    notes: typeof goal.notes === "string" ? goal.notes : "",
    wins: Array.isArray(goal.wins) ? goal.wins.map(normalizeWin) : [],
  };
}

function normalizeWin(win: Partial<LittleWin>): LittleWin {
  return {
    id: typeof win.id === "string" ? win.id : newId("win"),
    title: typeof win.title === "string" ? win.title : "",
    dueDate: typeof win.dueDate === "string" ? win.dueDate : "",
    completed: Boolean(win.completed),
    notes: typeof win.notes === "string" ? win.notes : "",
  };
}

function monthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = addDays(first, -startOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function progressFor(goal: Goal) {
  if (goal.wins.length === 0) return goal.status === "Completed" ? 100 : 0;
  return Math.round((goal.wins.filter((win) => win.completed).length / goal.wins.length) * 100);
}

function statusColor(status: GoalStatus) {
  if (status === "Completed") return "bg-emerald-100 text-emerald-800";
  if (status === "In Progress") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function savePayload(data: CoupleData) {
  return {
    ...data,
    updatedAt: new Date().toISOString(),
  };
}

export default function CoupleGoalsPage() {
  const initialDate = useMemo(() => new Date(), []);
  const [data, setData] = useState<CoupleData>(() => defaultData());
  const [month, setMonth] = useState(initialDate.getMonth());
  const [year, setYear] = useState(initialDate.getFullYear());
  const [selectedKey, setSelectedKey] = useState(todayKey());
  const [dayModalOpen, setDayModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [recipientDraft, setRecipientDraft] = useState("");
  const [mailState, setMailState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const snapshot = await getDoc(STORAGE_DOC);
        if (!ignore && snapshot.exists()) {
          setData(normalizeData(snapshot.data()));
        }
      } catch {
        if (!ignore) setSaveState("error");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, []);

  const days = useMemo(() => monthDays(year, month), [month, year]);
  const analysisByKey = useMemo(() => {
    const entries = days.map((date) => {
      const analysis = analyzeDay(date, data);
      return [analysis.key, analysis] as const;
    });
    return new Map(entries);
  }, [data, days]);
  const selectedAnalysis =
    analysisByKey.get(selectedKey) || analyzeDay(parseDateKey(selectedKey), data);

  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const monthAnalyses = days
    .filter((date) => date.getMonth() === month)
    .map((date) => analysisByKey.get(formatDateKey(date))!)
    .filter(Boolean);
  const bestMonthSlots = monthAnalyses.filter((day) => day.bestSlot).length;
  const pendingMCount = monthAnalyses.filter((day) => day.mUnconfirmed).length;
  const restTogetherCount = monthAnalyses.filter((day) => day.restDay).length;
  const completedWins = data.goals.flatMap((goal) => goal.wins).filter((win) => win.completed).length;
  const totalWins = data.goals.flatMap((goal) => goal.wins).length;

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }

  async function persist(nextData = data, message = "Saved") {
    setSaveState("saving");
    try {
      await setDoc(STORAGE_DOC, savePayload(nextData), { merge: true });
      setSaveState("saved");
      showToast(message);
      setTimeout(() => setSaveState("idle"), 1600);
    } catch {
      setSaveState("error");
      showToast("Save failed");
    }
  }

  function updateData(mutator: (current: CoupleData) => CoupleData) {
    setData((current) => mutator(current));
  }

  function updateSetting<K extends keyof CoupleSettings>(key: K, value: CoupleSettings[K]) {
    updateData((current) => ({
      ...current,
      settings: { ...current.settings, [key]: value },
    }));
  }

  function setMShift(dateKey: string, value: MShiftChoice) {
    const next = {
      ...data,
      mShiftOverrides: {
        ...data.mShiftOverrides,
        [dateKey]: value,
      },
    };
    setData(next);
    persist(next, "M shift updated");
  }

  function setHerShiftOverride(dateKey: string, value: "pattern" | Exclude<ShiftKey, "m">) {
    const overrides = { ...data.herShiftOverrides };
    if (value === "pattern") {
      delete overrides[dateKey];
    } else {
      overrides[dateKey] = value;
    }
    const next = { ...data, herShiftOverrides: overrides };
    setData(next);
    persist(next, "Her shift updated");
  }

  function updateDayNote(dateKey: string, notes: string) {
    updateData((current) => ({
      ...current,
      dayNotes: { ...current.dayNotes, [dateKey]: notes },
    }));
  }

  function addGoal() {
    const goal: Goal = {
      id: newId("goal"),
      title: "New shared goal",
      description: "",
      targetDate: "",
      status: "Not Started",
      notes: "",
      wins: [],
    };
    updateData((current) => ({ ...current, goals: [goal, ...current.goals] }));
  }

  function updateGoal(goalId: string, patch: Partial<Goal>) {
    updateData((current) => ({
      ...current,
      goals: current.goals.map((goal) =>
        goal.id === goalId ? { ...goal, ...patch } : goal
      ),
    }));
  }

  function deleteGoal(goalId: string) {
    if (!window.confirm("Delete this goal and all its Little Wins?")) return;
    const next = {
      ...data,
      goals: data.goals.filter((goal) => goal.id !== goalId),
    };
    setData(next);
    persist(next, "Goal deleted");
  }

  function addWin(goalId: string) {
    const win: LittleWin = {
      id: newId("win"),
      title: "New Little Win",
      dueDate: "",
      completed: false,
      notes: "",
    };
    updateData((current) => ({
      ...current,
      goals: current.goals.map((goal) =>
        goal.id === goalId ? { ...goal, wins: [...goal.wins, win] } : goal
      ),
    }));
  }

  function updateWin(goalId: string, winId: string, patch: Partial<LittleWin>) {
    updateData((current) => ({
      ...current,
      goals: current.goals.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              wins: goal.wins.map((win) =>
                win.id === winId ? { ...win, ...patch } : win
              ),
            }
          : goal
      ),
    }));
  }

  function deleteWin(goalId: string, winId: string) {
    if (!window.confirm("Delete this Little Win?")) return;
    const next = {
      ...data,
      goals: data.goals.map((goal) =>
        goal.id === goalId
          ? { ...goal, wins: goal.wins.filter((win) => win.id !== winId) }
          : goal
      ),
    };
    setData(next);
    persist(next, "Little Win deleted");
  }

  function addRecipient() {
    const email = recipientDraft.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      showToast("Enter a valid email address");
      return;
    }
    if (data.settings.recipients.includes(email)) {
      showToast("Recipient already exists");
      return;
    }
    const next = {
      ...data,
      settings: {
        ...data.settings,
        recipients: [...data.settings.recipients, email],
      },
    };
    setData(next);
    setRecipientDraft("");
    persist(next, "Recipient added");
  }

  function updateRecipient(index: number, value: string) {
    updateData((current) => {
      const recipients = current.settings.recipients.slice();
      recipients[index] = value;
      return { ...current, settings: { ...current.settings, recipients } };
    });
  }

  function removeRecipient(index: number) {
    if (!window.confirm("Remove this email recipient?")) return;
    const next = {
      ...data,
      settings: {
        ...data.settings,
        recipients: data.settings.recipients.filter((_, i) => i !== index),
      },
    };
    setData(next);
    persist(next, "Recipient removed");
  }

  function updateFood(day: string, value: string) {
    updateData((current) => ({
      ...current,
      foodPlan: { ...current.foodPlan, [day]: value },
    }));
  }

  async function sendFoodEmail(action: "manual" | "test") {
    const invalidEmail = data.settings.recipients.find((email) => !EMAIL_RE.test(email));
    if (invalidEmail || data.settings.recipients.length === 0) {
      showToast("Add at least one valid recipient first");
      return;
    }
    await persist(data, "Food plan saved");
    setMailState("sending");
    try {
      const response = await fetch("/api/admin/couple-goals/food-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Email failed");
      setMailState("sent");
      showToast(action === "test" ? "Test email sent" : "Today's food email sent");
      setTimeout(() => setMailState("idle"), 2000);
    } catch (error) {
      setMailState("error");
      showToast(error instanceof Error ? error.message : "Email failed");
    }
  }

  function changeMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setMonth(next.getMonth());
    setYear(next.getFullYear());
  }

  function openDayDetail(dateKey: string) {
    setSelectedKey(dateKey);
    setDayModalOpen(true);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      {toast && (
        <div className="fixed right-4 top-4 z-50 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}

      <div className="mx-auto max-w-7xl px-3 py-5 sm:px-5 lg:px-8">
        <header className="mb-5 overflow-hidden rounded-2xl bg-slate-950 text-white shadow-sm">
          <div className="grid gap-6 p-5 md:grid-cols-[1.5fr_1fr] md:p-7">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                <Heart className="h-3.5 w-3.5" />
                Mauritius timezone by default
              </div>
              <h1 className="text-2xl font-black tracking-tight md:text-4xl">
                Couple Goals
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                A shared command center for free time, Little Wins, and daily food plans.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Best slots this month" value={bestMonthSlots} icon={<Sparkles />} />
              <StatCard label="M shifts pending" value={pendingMCount} icon={<Clock3 />} />
              <StatCard label="Rest days together" value={restTogetherCount} icon={<CalendarDays />} />
              <StatCard label="Little Wins done" value={`${completedWins}/${totalWins}`} icon={<Trophy />} />
            </div>
          </div>
        </header>

        <section className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_auto] md:items-end">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm font-semibold text-slate-700">
              Her rotation Day 1 starts
              <input
                type="date"
                value={data.settings.rotationStartDate}
                onChange={(event) => updateSetting("rotationStartDate", event.target.value)}
                onBlur={() => persist(data, "Rotation saved")}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Food email time
              <input
                type="time"
                value={data.settings.sendTime}
                onChange={(event) => updateSetting("sendTime", event.target.value)}
                onBlur={() => persist(data, "Email time saved")}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={data.settings.emailEnabled}
                onChange={(event) => {
                  const next = {
                    ...data,
                    settings: { ...data.settings, emailEnabled: event.target.checked },
                  };
                  setData(next);
                  persist(next, event.target.checked ? "Morning email enabled" : "Morning email paused");
                }}
                className="h-4 w-4"
              />
              Morning food email enabled
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500 md:col-span-2">
            {ACTUAL_CALENDAR_ALIASES.map((alias) => (
              <span key={alias} className="rounded-full bg-slate-100 px-2.5 py-1">
                {alias}
              </span>
            ))}
          </div>
          <button
            onClick={() => persist()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
          >
            <Save className="h-4 w-4" />
            {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Save all"}
          </button>
        </section>

        <section>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-black">
                  <CalendarDays className="h-5 w-5 text-cyan-600" />
                  Advanced Couple Availability Calendar
                </h2>
                <p className="text-sm text-slate-500">Common free time is calculated from fixed work, rotation shifts, and overnight carryover.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => changeMonth(-1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold hover:bg-slate-50">
                  Previous
                </button>
                <select
                  value={month}
                  onChange={(event) => setMonth(Number(event.target.value))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
                >
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index} value={index}>
                      {new Date(2026, index, 1).toLocaleDateString("en-US", { month: "long" })}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="2020"
                  max="2040"
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value) || year)}
                  className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
                />
                <button onClick={() => changeMonth(1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold hover:bg-slate-50">
                  Next
                </button>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
              <Legend color="bg-sky-500" label="My working hours" />
              <Legend color="bg-pink-500" label="Her working hours" />
              <Legend color="bg-emerald-500" label="Shared free time" />
              <Legend color="bg-slate-400" label="Rest day" />
              <Legend color="bg-violet-500" label="Overnight shift" />
              <Legend color="bg-amber-500" label="Unconfirmed M shift" />
            </div>

            <div className="grid grid-cols-7 gap-2">
              {WEEK_DAYS.map((day) => (
                <div key={day} className="hidden rounded-lg bg-slate-100 py-2 text-center text-xs font-black uppercase tracking-wide text-slate-500 sm:block">
                  {day.slice(0, 3)}
                </div>
              ))}
              {days.map((date) => {
                const key = formatDateKey(date);
                const analysis = analysisByKey.get(key)!;
                const isSelected = key === selectedKey;
                const isCurrentMonth = date.getMonth() === month;
                const isToday = key === todayKey();
                return (
                  <button
                    key={key}
                    onClick={() => openDayDetail(key)}
                    className={[
                      "min-h-32 rounded-xl border p-2 text-left transition hover:-translate-y-0.5 hover:shadow-md",
                      isSelected ? "border-slate-950 ring-2 ring-slate-950/10" : "border-slate-200",
                      isCurrentMonth ? "bg-white" : "bg-slate-50 text-slate-400",
                    ].join(" ")}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className={`grid h-7 w-7 place-items-center rounded-full text-sm font-black ${isToday ? "bg-slate-950 text-white" : "bg-slate-100"}`}>
                        {date.getDate()}
                      </span>
                      {analysis.mUnconfirmed && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">M</span>}
                    </div>
                    <div className="space-y-1">
                      {analysis.restDay && <MiniPill className="bg-slate-100 text-slate-600" label="Rest together" />}
                      {analysis.blocks.some((block) => block.owner === "me") && <MiniPill className="bg-sky-100 text-sky-700" label="Me 08:30-17:00" />}
                      {analysis.blocks.some((block) => block.owner === "her" && !block.uncertain) && (
                        <MiniPill className={analysis.overnight ? "bg-violet-100 text-violet-700" : "bg-pink-100 text-pink-700"} label={SHIFT_LABELS[analysis.effectiveHerShift]} />
                      )}
                      {analysis.mUnconfirmed && <MiniPill className="bg-amber-100 text-amber-800" label="M pending" />}
                      {analysis.bestSlot && <MiniPill className="bg-emerald-100 text-emerald-700" label={`Best ${slotLabel(analysis.bestSlot)}`} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {dayModalOpen && (
          <div
            className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/50 px-3 py-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="couple-day-detail-title"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setDayModalOpen(false);
            }}
          >
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">Selected day</p>
                  <h3 id="couple-day-detail-title" className="mt-1 text-2xl font-black">
                    {selectedAnalysis.date.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDayModalOpen(false)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-black text-slate-600 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3">
                <DetailRow label="My working hours" value={selectedAnalysis.mineLabel} />
                <DetailRow label="Her shift type" value={SHIFT_LABELS[selectedAnalysis.herShift]} />
                <DetailRow label="Her working hours" value={selectedAnalysis.herLabel} />
                <label className="block rounded-xl border border-slate-200 p-3 text-sm font-black">
                  Her shift override
                  <select
                    value={
                      selectedAnalysis.postThirdRest
                        ? "rest"
                        : data.herShiftOverrides[selectedAnalysis.key] || "pattern"
                    }
                    onChange={(event) =>
                      setHerShiftOverride(
                        selectedAnalysis.key,
                        event.target.value as "pattern" | Exclude<ShiftKey, "m">
                      )
                    }
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
                  >
                    <option value="pattern">Use rotation pattern</option>
                    <option value="first">First Shift</option>
                    <option value="second">Second Shift</option>
                    <option value="third">Third Shift</option>
                    <option value="rest">Rest Day</option>
                  </select>
                </label>
                {selectedAnalysis.herShift === "m" && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="mb-2 text-sm font-black text-amber-900">Confirm M Shift</p>
                    <div className="grid gap-2">
                      {M_CHOICES.map((choice) => (
                        <label key={choice} className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                          <input
                            type="radio"
                            checked={(data.mShiftOverrides[selectedAnalysis.key] || "not-confirmed") === choice}
                            onChange={() => setMShift(selectedAnalysis.key, choice)}
                          />
                          {SHIFT_LABELS[choice]}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="mb-2 text-sm font-black">Shared available time slots</p>
                  {selectedAnalysis.mUnconfirmed ? (
                    <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                      Waiting for M shift confirmation before calculating shared free time.
                    </p>
                  ) : selectedAnalysis.sharedFree.length ? (
                    <div className="space-y-2">
                      {selectedAnalysis.sharedFree.map((slot) => (
                        <div key={slotLabel(slot)} className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm">
                          <span className="font-black text-emerald-900">{slotLabel(slot)}</span>
                          <span className="font-semibold text-emerald-700">{durationLabel(slot)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl bg-slate-100 p-3 text-sm font-semibold text-slate-600">No clean common slot found.</p>
                  )}
                </div>
                <label className="block text-sm font-black">
                  Notes
                  <textarea
                    value={data.dayNotes[selectedAnalysis.key] || ""}
                    onChange={(event) => updateDayNote(selectedAnalysis.key, event.target.value)}
                    onBlur={() => persist(data, "Day notes saved")}
                    rows={4}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium"
                    placeholder="Plans, reminders, date ideas, errands..."
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Trophy className="h-5 w-5 text-amber-500" />
                Dynamic Goals and Little Wins
              </h2>
              <p className="text-sm text-slate-500">Goals become practical when they are split into small wins.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={addGoal} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
                <Plus className="h-4 w-4" />
                Add goal
              </button>
              <button onClick={() => persist()} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold hover:bg-slate-50">
                Save goals
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {data.goals.map((goal) => {
              const progress = progressFor(goal);
              return (
                <article key={goal.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <input
                      value={goal.title}
                      onChange={(event) => updateGoal(goal.id, { title: event.target.value })}
                      onBlur={() => persist(data, "Goal saved")}
                      className="w-full rounded-lg border border-transparent bg-slate-50 px-3 py-2 text-lg font-black focus:border-slate-300 focus:outline-none"
                    />
                    <button onClick={() => deleteGoal(goal.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete goal">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <textarea
                    value={goal.description}
                    onChange={(event) => updateGoal(goal.id, { description: event.target.value })}
                    onBlur={() => persist(data, "Goal saved")}
                    rows={2}
                    className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Description"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Target date
                      <input
                        type="date"
                        value={goal.targetDate}
                        onChange={(event) => updateGoal(goal.id, { targetDate: event.target.value })}
                        onBlur={() => persist(data, "Goal saved")}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm normal-case tracking-normal"
                      />
                    </label>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Status
                      <select
                        value={goal.status}
                        onChange={(event) => updateGoal(goal.id, { status: event.target.value as GoalStatus })}
                        onBlur={() => persist(data, "Goal saved")}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm normal-case tracking-normal"
                      >
                        {GOAL_STATUSES.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${statusColor(goal.status)}`}>{goal.status}</span>
                      <span className="font-black">{progress}%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <textarea
                    value={goal.notes}
                    onChange={(event) => updateGoal(goal.id, { notes: event.target.value })}
                    onBlur={() => persist(data, "Goal saved")}
                    rows={2}
                    className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Goal notes"
                  />

                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="font-black">Little Wins</h4>
                      <button onClick={() => addWin(goal.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold hover:bg-slate-50">
                        Add Little Win
                      </button>
                    </div>
                    <div className="space-y-2">
                      {goal.wins.length === 0 && (
                        <p className="rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-500">No Little Wins yet.</p>
                      )}
                      {goal.wins.map((win) => (
                        <div key={win.id} className="rounded-xl border border-slate-200 p-3">
                          <div className="grid gap-2 md:grid-cols-[auto_1fr_auto_auto] md:items-center">
                            <input
                              type="checkbox"
                              checked={win.completed}
                              onChange={(event) => updateWin(goal.id, win.id, { completed: event.target.checked })}
                              onBlur={() => persist(data, "Little Win saved")}
                              className="h-4 w-4"
                            />
                            <input
                              value={win.title}
                              onChange={(event) => updateWin(goal.id, win.id, { title: event.target.value })}
                              onBlur={() => persist(data, "Little Win saved")}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
                            />
                            <input
                              type="date"
                              value={win.dueDate}
                              onChange={(event) => updateWin(goal.id, win.id, { dueDate: event.target.value })}
                              onBlur={() => persist(data, "Little Win saved")}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            />
                            <button onClick={() => deleteWin(goal.id, win.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete Little Win">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <input
                            value={win.notes}
                            onChange={(event) => updateWin(goal.id, win.id, { notes: event.target.value })}
                            onBlur={() => persist(data, "Little Win saved")}
                            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            placeholder="Little Win notes"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Utensils className="h-5 w-5 text-rose-500" />
                Daily Food Planner
              </h2>
              <p className="text-sm text-slate-500">Plan the week once, then send the morning food email manually or by cron.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => persist(data, "Food plan saved")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold hover:bg-slate-50">
                Save food plan
              </button>
              <button onClick={() => sendFoodEmail("test")} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold hover:bg-slate-50">
                <Mail className="h-4 w-4" />
                Send test
              </button>
              <button onClick={() => sendFoodEmail("manual")} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {mailState === "sending" ? "Sending..." : "Send today"}
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
            <div className="grid gap-3 sm:grid-cols-2">
              {WEEK_DAYS.map((day) => (
                <label key={day} className="rounded-xl border border-slate-200 p-3 text-sm font-black">
                  <span className="text-slate-700">{day}</span>
                  <input
                    value={data.foodPlan[day] || ""}
                    onChange={(event) => updateFood(day, event.target.value)}
                    onBlur={() => persist(data, `${day} food saved`)}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
                    placeholder="Food planned"
                  />
                </label>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <h3 className="mb-2 font-black">Email recipients</h3>
              <div className="mb-3 flex gap-2">
                <input
                  value={recipientDraft}
                  onChange={(event) => setRecipientDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addRecipient();
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="name@example.com"
                />
                <button onClick={addRecipient} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white">
                  Add
                </button>
              </div>
              <div className="space-y-2">
                {data.settings.recipients.length === 0 && (
                  <p className="rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-500">No recipients yet.</p>
                )}
                {data.settings.recipients.map((email, index) => (
                  <div key={`${email}-${index}`} className="flex gap-2">
                    <input
                      value={email}
                      onChange={(event) => updateRecipient(index, event.target.value)}
                      onBlur={() => {
                        if (!EMAIL_RE.test(data.settings.recipients[index] || "")) {
                          showToast("Fix invalid email before saving");
                          return;
                        }
                        persist(data, "Recipient saved");
                      }}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <button onClick={() => removeRecipient(index)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove recipient">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                <p className="font-black text-slate-800">Email preview</p>
                <p className="mt-2">Subject: Today&apos;s Food Plan</p>
                <p className="mt-1">
                  Today is {getMauritiusDateParts().weekday}. Food planned for today:{" "}
                  <strong>{data.foodPlan[getMauritiusDateParts().weekday] || "Not planned"}</strong>.
                </p>
              </div>
            </div>
          </div>
        </section>

        {loading && (
          <div className="fixed inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-xl">
            Loading Couple Goals...
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white/10 p-3">
      <div className="mb-2 text-cyan-100 [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs font-semibold text-slate-300">{label}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-2.5 py-1">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function MiniPill({ className, label }: { className: string; label: string }) {
  return <div className={`truncate rounded-md px-2 py-1 text-[11px] font-black ${className}`}>{label}</div>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-800">{value}</p>
    </div>
  );
}
