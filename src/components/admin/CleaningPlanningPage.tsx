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
  ChevronDown,
  ChevronUp,
  Clock3,
  Droplets,
  ListPlus,
  Mail,
  MapPin,
  MessageCircle,
  PanelsTopLeft,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  ScanLine,
  Send,
  Shirt,
  Sparkles,
  Trash2,
  Utensils,
  X,
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

type RoutineTask = {
  id: string;
  title: string;
  detail: string;
  priority: boolean;
};

type CleaningSettings = {
  recipientEmail: string;
  lastReminderAt?: string;
  lastReminderBy?: string;
};

type CleaningData = {
  weeks: Record<string, SundayPlan>;
  routineTasks: RoutineTask[];
  settings: CleaningSettings;
};

type SaveState = "loading" | "idle" | "saving" | "saved" | "offline";
type EmailState = "idle" | "sending" | "sent" | "error";

const STORAGE_DOC = doc(db, "homePlanning", "cleaning");
const LOCAL_STORAGE_KEY = "mo-cleaning-planning-v1";
const EMPTY_PLAN: SundayPlan = {
  tasks: [],
  pickupReady: false,
  cashReady: false,
  notes: "",
};

const DEFAULT_TASKS: RoutineTask[] = [
  {
    id: "ironing",
    title: "Iron working clothes",
    detail: "Do this first so weekday outfits are ready to wear.",
    priority: true,
  },
  {
    id: "floors",
    title: "Clean the floors",
    detail: "Sweep and mop all living areas.",
    priority: false,
  },
  {
    id: "mirrors",
    title: "Clean the mirrors",
    detail: "Leave glass clear and streak-free.",
    priority: false,
  },
  {
    id: "tables",
    title: "Wipe the tables",
    detail: "Clear surfaces, dust, then wipe down.",
    priority: false,
  },
  {
    id: "bathroom",
    title: "Clean the bathroom",
    detail: "Wash and refresh the full bathroom.",
    priority: false,
  },
  {
    id: "bed",
    title: "Make the bed",
    detail: "Finish with a tidy, ready bedroom.",
    priority: false,
  },
  {
    id: "dishes",
    title: "Wash the dishes",
    detail: "Clear the sink and leave the kitchen reset.",
    priority: false,
  },
] as const;

const DEFAULT_SETTINGS: CleaningSettings = {
  recipientEmail: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TASK_ICON_BY_ID = {
  ironing: Shirt,
  floors: Droplets,
  mirrors: ScanLine,
  tables: PanelsTopLeft,
  bathroom: Bath,
  bed: BedDouble,
  dishes: Utensils,
} as const;

function newTaskId() {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRoutineTasks(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_TASKS.map((task) => ({ ...task }));
  const seen = new Set<string>();
  const tasks = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Partial<RoutineTask>;
    const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 100) : "";
    const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 160) : "";
    if (!id || !title || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      title,
      detail: typeof raw.detail === "string" ? raw.detail.trim().slice(0, 500) : "",
      priority: raw.priority === true,
    }];
  });
  return tasks;
}

function normalizePlan(value: unknown, validTaskIds: Set<string>): SundayPlan {
  if (!value || typeof value !== "object") return { ...EMPTY_PLAN };
  const plan = value as Partial<SundayPlan>;
  const normalized: SundayPlan = {
    tasks: Array.isArray(plan.tasks)
      ? plan.tasks.filter((task): task is string => typeof task === "string" && validTaskIds.has(task))
      : [],
    pickupReady: plan.pickupReady === true,
    cashReady: plan.cashReady === true,
    notes: typeof plan.notes === "string" ? plan.notes : "",
  };
  if (typeof plan.completedAt === "string") normalized.completedAt = plan.completedAt;
  return normalized;
}

function normalizeData(value: unknown): CleaningData {
  if (!value || typeof value !== "object") {
    return { weeks: {}, routineTasks: DEFAULT_TASKS.map((task) => ({ ...task })), settings: { ...DEFAULT_SETTINGS } };
  }
  const raw = value as { weeks?: unknown; routineTasks?: unknown; settings?: unknown };
  const routineTasks = normalizeRoutineTasks(raw.routineTasks);
  const validTaskIds = new Set(routineTasks.map((task) => task.id));
  const rawWeeks = raw.weeks;
  const rawSettings = raw.settings && typeof raw.settings === "object"
    ? raw.settings as Partial<CleaningSettings>
    : {};
  const settings: CleaningSettings = {
    recipientEmail: typeof rawSettings.recipientEmail === "string" ? rawSettings.recipientEmail.trim().slice(0, 320) : "",
  };
  if (typeof rawSettings.lastReminderAt === "string") settings.lastReminderAt = rawSettings.lastReminderAt;
  if (typeof rawSettings.lastReminderBy === "string") settings.lastReminderBy = rawSettings.lastReminderBy;
  return {
    weeks: rawWeeks && typeof rawWeeks === "object"
      ? Object.fromEntries(
        Object.entries(rawWeeks as Record<string, unknown>).map(([key, plan]) => [key, normalizePlan(plan, validTaskIds)])
      )
      : {},
    routineTasks,
    settings,
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
  const [data, setData] = useState<CleaningData>(() => normalizeData({}));
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [taskEditorOpen, setTaskEditorOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState({ title: "", detail: "", priority: false });
  const [emailPanelOpen, setEmailPanelOpen] = useState(false);
  const [senderName, setSenderName] = useState<"Ryan" | "Tanvi">("Ryan");
  const [emailState, setEmailState] = useState<EmailState>("idle");
  const [emailMessage, setEmailMessage] = useState("");
  const plan = data.weeks[sunday.key] || EMPTY_PLAN;
  const routineTasks = data.routineTasks;
  const completedTasks = plan.tasks.length;
  const completedSteps = completedTasks + Number(plan.pickupReady) + Number(plan.cashReady);
  const totalSteps = routineTasks.length + 2;
  const progress = Math.round((completedSteps / totalSteps) * 100);
  const readyToFinish = completedTasks === routineTasks.length && plan.pickupReady && plan.cashReady;
  const isComplete = Boolean(plan.completedAt);
  const priorityTask = routineTasks.find((task) => task.priority) || routineTasks[0];
  const PriorityIcon = priorityTask
    ? TASK_ICON_BY_ID[priorityTask.id as keyof typeof TASK_ICON_BY_ID] || Sparkles
    : ListPlus;

  useEffect(() => {
    let ignore = false;

    async function load() {
      let localData: CleaningData = normalizeData({});
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
      tasks: routineTasks.map((task) => task.id),
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

  function openAddTask() {
    setEditingTaskId(null);
    setTaskDraft({ title: "", detail: "", priority: routineTasks.length === 0 });
    setTaskEditorOpen(true);
  }

  function openEditTask(task: RoutineTask) {
    setEditingTaskId(task.id);
    setTaskDraft({ title: task.title, detail: task.detail, priority: task.priority });
    setTaskEditorOpen(true);
  }

  function closeTaskEditor() {
    setTaskEditorOpen(false);
    setEditingTaskId(null);
    setTaskDraft({ title: "", detail: "", priority: false });
  }

  function saveTask() {
    const title = taskDraft.title.trim();
    if (!title) return;
    const id = editingTaskId || newTaskId();
    const updatedTask: RoutineTask = {
      id,
      title,
      detail: taskDraft.detail.trim(),
      priority: taskDraft.priority,
    };
    let tasks = editingTaskId
      ? routineTasks.map((task) => task.id === id ? updatedTask : task)
      : [...routineTasks, updatedTask];
    if (updatedTask.priority) {
      tasks = [updatedTask, ...tasks.filter((task) => task.id !== id).map((task) => ({ ...task, priority: false }))];
    }
    const weeks = { ...data.weeks };
    if (!editingTaskId && weeks[sunday.key]) {
      const currentWeek = { ...weeks[sunday.key] };
      delete currentWeek.completedAt;
      weeks[sunday.key] = currentWeek;
    }
    void persist({ ...data, weeks, routineTasks: tasks });
    closeTaskEditor();
  }

  function deleteTask(task: RoutineTask) {
    if (!window.confirm(`Delete “${task.title}” from the Sunday routine?`)) return;
    const weeks = Object.fromEntries(Object.entries(data.weeks).map(([key, week]) => {
      const nextWeek = { ...week, tasks: week.tasks.filter((taskId) => taskId !== task.id) };
      delete nextWeek.completedAt;
      return [key, nextWeek];
    }));
    void persist({
      ...data,
      weeks,
      routineTasks: routineTasks.filter((entry) => entry.id !== task.id),
    });
  }

  function moveTask(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= routineTasks.length) return;
    const tasks = [...routineTasks];
    [tasks[index], tasks[nextIndex]] = [tasks[nextIndex], tasks[index]];
    void persist({ ...data, routineTasks: tasks });
  }

  function saveRecipientEmail(recipientEmail: string) {
    void persist({ ...data, settings: { ...data.settings, recipientEmail: recipientEmail.trim() } });
  }

  async function sendReminder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const recipient = data.settings.recipientEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(recipient)) {
      setEmailState("error");
      setEmailMessage("Add a valid email address first.");
      return;
    }
    if (!routineTasks.length) {
      setEmailState("error");
      setEmailMessage("Add at least one cleaning task first.");
      return;
    }

    setEmailState("sending");
    setEmailMessage("");
    try {
      const response = await fetch("/api/admin/cleaning/reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient,
          senderName,
          sundayLabel: sunday.label,
          tasks: routineTasks.map(({ title, detail }) => ({ title, detail })),
          notes: plan.notes,
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "The reminder could not be sent.");
      const nextData: CleaningData = {
        ...data,
        settings: {
          ...data.settings,
          recipientEmail: recipient,
          lastReminderAt: new Date().toISOString(),
          lastReminderBy: senderName,
        },
      };
      await persist(nextData);
      setEmailState("sent");
      setEmailMessage(`Task reminder sent to ${recipient}.`);
    } catch (error) {
      setEmailState("error");
      setEmailMessage(error instanceof Error ? error.message : "The reminder could not be sent.");
    }
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
              <div className={styles.headingActions}>
                <span className={styles.counter}>{completedTasks} of {routineTasks.length} done</span>
                <button type="button" className={styles.reminderTrigger} onClick={() => setEmailPanelOpen((open) => !open)} aria-expanded={emailPanelOpen}>
                  <Mail size={16} /> Send reminder
                </button>
                <button type="button" className={styles.addTaskButton} onClick={openAddTask}>
                  <Plus size={17} /> Add task
                </button>
              </div>
            </div>

            {emailPanelOpen ? (
              <form className={styles.emailPanel} onSubmit={sendReminder}>
                <div className={styles.panelIntro}>
                  <span className={styles.panelIcon}><Send size={18} /></span>
                  <div><strong>Email Adel’s task list</strong><small>The current order and Sunday notes will be included.</small></div>
                </div>
                <label>
                  Adel’s email
                  <input
                    type="email"
                    value={data.settings.recipientEmail}
                    onChange={(event) => setData((current) => ({
                      ...current,
                      settings: { ...current.settings, recipientEmail: event.target.value },
                    }))}
                    onBlur={(event) => saveRecipientEmail(event.target.value)}
                    placeholder="adel@example.com"
                    autoComplete="email"
                  />
                </label>
                <fieldset>
                  <legend>Sent by</legend>
                  <div className={styles.senderOptions}>
                    {(["Ryan", "Tanvi"] as const).map((name) => (
                      <button key={name} type="button" data-selected={senderName === name} onClick={() => setSenderName(name)}>{name}</button>
                    ))}
                  </div>
                </fieldset>
                <button type="submit" className={styles.sendButton} disabled={emailState === "sending"}>
                  <Mail size={17} /> {emailState === "sending" ? "Sending…" : "Send task email"}
                </button>
                {emailMessage ? <p className={styles.emailMessage} data-state={emailState} role="status">{emailMessage}</p> : null}
              </form>
            ) : null}

            {taskEditorOpen ? (
              <form className={styles.taskEditor} onSubmit={(event) => { event.preventDefault(); saveTask(); }}>
                <div className={styles.editorHeading}>
                  <div><ListPlus size={18} /><strong>{editingTaskId ? "Edit task" : "Add a cleaning task"}</strong></div>
                  <button type="button" onClick={closeTaskEditor} aria-label="Close task editor"><X size={18} /></button>
                </div>
                <div className={styles.editorFields}>
                  <label>
                    Task name
                    <input
                      value={taskDraft.title}
                      onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))}
                      placeholder="e.g. Dust the shelves"
                      maxLength={160}
                      autoFocus
                    />
                  </label>
                  <label>
                    Instructions
                    <input
                      value={taskDraft.detail}
                      onChange={(event) => setTaskDraft((current) => ({ ...current, detail: event.target.value }))}
                      placeholder="Add a short note for Adel"
                      maxLength={500}
                    />
                  </label>
                </div>
                <div className={styles.editorFooter}>
                  <label className={styles.priorityChoice}>
                    <input type="checkbox" checked={taskDraft.priority} onChange={(event) => setTaskDraft((current) => ({ ...current, priority: event.target.checked }))} />
                    Make this the first priority
                  </label>
                  <div>
                    <button type="button" className={styles.cancelButton} onClick={closeTaskEditor}>Cancel</button>
                    <button type="submit" className={styles.saveTaskButton} disabled={!taskDraft.title.trim()}>{editingTaskId ? "Save changes" : "Add task"}</button>
                  </div>
                </div>
              </form>
            ) : null}

            <div className={styles.taskList}>
              {routineTasks.map((task, index) => {
                const checked = plan.tasks.includes(task.id);
                const Icon = TASK_ICON_BY_ID[task.id as keyof typeof TASK_ICON_BY_ID] || Sparkles;
                return (
                  <div
                    key={task.id}
                    className={styles.task}
                    data-checked={checked}
                    data-priority={task.priority || undefined}
                  >
                    <span className={styles.taskNumber}>{String(index + 1).padStart(2, "0")}</span>
                    <button type="button" className={styles.taskToggle} onClick={() => toggleTask(task.id)} aria-label={`${checked ? "Mark incomplete" : "Mark complete"}: ${task.title}`} aria-pressed={checked}>
                      <span className={styles.taskIcon}>{checked ? <Check size={20} /> : <Icon size={20} />}</span>
                    </button>
                    <span className={styles.taskCopy}>
                      <span className={styles.taskTitleLine}>
                        <strong>{task.title}</strong>
                        {task.priority ? <em>First priority</em> : null}
                      </span>
                      <small>{task.detail}</small>
                    </span>
                    <span className={styles.taskStatus}>{checked ? "Done" : "To do"}</span>
                    <span className={styles.taskActions}>
                      <button type="button" onClick={() => moveTask(index, -1)} disabled={index === 0} aria-label={`Move ${task.title} up`}><ChevronUp size={16} /></button>
                      <button type="button" onClick={() => moveTask(index, 1)} disabled={index === routineTasks.length - 1} aria-label={`Move ${task.title} down`}><ChevronDown size={16} /></button>
                      <button type="button" onClick={() => openEditTask(task)} aria-label={`Edit ${task.title}`}><Pencil size={16} /></button>
                      <button type="button" className={styles.deleteTaskButton} onClick={() => deleteTask(task)} aria-label={`Delete ${task.title}`}><Trash2 size={16} /></button>
                    </span>
                  </div>
                );
              })}
              {!routineTasks.length ? (
                <div className={styles.emptyTasks}>
                  <ListPlus size={24} />
                  <strong>No cleaning tasks yet</strong>
                  <span>Add the first task to build Adel’s Sunday routine.</span>
                  <button type="button" onClick={openAddTask}><Plus size={16} /> Add first task</button>
                </div>
              ) : null}
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
              <div className={styles.focusIcon}><PriorityIcon size={23} /></div>
              <span className={styles.sectionKicker}>The one non-negotiable</span>
              <h2>{priorityTask?.title || "Choose the first task"}</h2>
              <p>{priorityTask?.detail || "Add a task and mark it as first priority so Adel always knows where to begin."}</p>
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
