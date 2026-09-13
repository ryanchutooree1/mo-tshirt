"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  FolderOpen,
  Gauge,
  Hammer,
  Home,
  LoaderCircle,
  Plus,
  ReceiptText,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Utensils,
  Wrench,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  createBlankBill,
  createBlankHomeDocument,
  createBlankHomeEvent,
  createBlankMaintenanceTask,
  dateDistanceInDays,
  EMPTY_HOME_MANAGEMENT_DATA,
  normalizeHomeManagementData,
  type HomeCalendarEvent,
  type HomeDocument,
  type HomeManagementData,
  type HomeWorkspaceView,
  type MaintenanceTask,
  type UtilityBill,
} from "@/lib/home-management";

const STORAGE_DOC = doc(db, "homePlanning", "management");
const COUPLE_GOALS_DOC = doc(db, "coupleGoals", "workspace");
const CLEANING_DOC = doc(db, "homePlanning", "cleaning");

type ConnectedHomeSummary = {
  todayMeal: string;
  cleaningProgress: string;
  cleaningDetail: string;
  shoppingNow: number;
  lowStock: number;
  activeGoals: number;
};

const EMPTY_CONNECTED_SUMMARY: ConnectedHomeSummary = {
  todayMeal: "Not planned",
  cleaningProgress: "0 / 0",
  cleaningDetail: "No checklist yet",
  shoppingNow: 0,
  lowStock: 0,
  activeGoals: 0,
};

const VIEW_META: Record<
  HomeWorkspaceView,
  { title: string; description: string; icon: typeof Home; accent: string }
> = {
  overview: {
    title: "Home Overview",
    description: "One calm view of what needs attention across your home.",
    icon: Home,
    accent: "from-slate-950 via-slate-900 to-indigo-950",
  },
  bills: {
    title: "Bills & Utilities",
    description: "Track household providers, amounts, due dates, and payment status.",
    icon: ReceiptText,
    accent: "from-emerald-950 via-slate-900 to-slate-950",
  },
  maintenance: {
    title: "Maintenance & Repairs",
    description: "Keep repairs, servicing, costs, and recurring work under control.",
    icon: Wrench,
    accent: "from-orange-950 via-slate-900 to-slate-950",
  },
  calendar: {
    title: "Home Calendar",
    description: "Plan household appointments, deliveries, visitors, and reminders.",
    icon: CalendarDays,
    accent: "from-indigo-950 via-slate-900 to-slate-950",
  },
  documents: {
    title: "Home Documents",
    description: "Organize warranties, policies, references, locations, and expiry dates.",
    icon: FolderOpen,
    accent: "from-cyan-950 via-slate-900 to-slate-950",
  },
};

const VIEW_LINKS: Array<{ view: HomeWorkspaceView; href: string }> = [
  { view: "overview", href: "/admin/home-overview" },
  { view: "bills", href: "/admin/home-bills" },
  { view: "maintenance", href: "/admin/home-maintenance" },
  { view: "calendar", href: "/admin/home-calendar" },
  { view: "documents", href: "/admin/home-documents" },
];

const HOME_SHORTCUTS = [
  { href: "/admin/couple-goals", label: "Couple Goals", note: "Schedules and shared time", icon: Sparkles, tone: "bg-pink-50 text-pink-700" },
  { href: "/admin/tanvi-home", label: "Food Planning", note: "Meals for the week", icon: Utensils, tone: "bg-orange-50 text-orange-700" },
  { href: "/admin/cleaning", label: "Cleaning Planning", note: "Routines and visits", icon: CheckCircle2, tone: "bg-cyan-50 text-cyan-700" },
  { href: "/admin/house-inventory", label: "House Inventory", note: "Stock and shopping", icon: Gauge, tone: "bg-violet-50 text-violet-700" },
];

function mauritiusTodayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Indian/Mauritius",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function upcomingSundayKey(todayKey: string) {
  const date = new Date(`${todayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + ((7 - date.getUTCDay()) % 7));
  return date.toISOString().slice(0, 10);
}

function money(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "Amount not set";
  return `Rs ${amount.toLocaleString("en-MU", { maximumFractionDigits: 2 })}`;
}

function friendlyDate(value: string) {
  if (!value) return "No date set";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function safeDocumentUrl(value: string) {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export default function HomeManagementWorkspace({ view }: { view: HomeWorkspaceView }) {
  const [data, setData] = useState<HomeManagementData>(EMPTY_HOME_MANAGEMENT_DATA);
  const dataRef = useRef(data);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [connectedSummary, setConnectedSummary] = useState(EMPTY_CONNECTED_SUMMARY);
  const todayKey = useMemo(mauritiusTodayKey, []);
  const meta = VIEW_META[view];
  const HeaderIcon = meta.icon;

  useEffect(() => {
    let active = true;
    getDoc(STORAGE_DOC)
      .then((snapshot) => {
        if (!active) return;
        const normalized = normalizeHomeManagementData(snapshot.exists() ? snapshot.data() : null);
        dataRef.current = normalized;
        setData(normalized);
      })
      .catch((error) => {
        console.error("Unable to load home management workspace", error);
        if (active) setMessage("Could not load the home workspace.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (view !== "overview") return;
    let active = true;
    Promise.allSettled([
      getDoc(COUPLE_GOALS_DOC),
      getDoc(CLEANING_DOC),
      fetch("/api/admin/tanvi/house-inventory", { cache: "no-store" }).then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("Inventory summary unavailable"))
      ),
    ]).then(([coupleResult, cleaningResult, inventoryResult]) => {
      if (!active) return;
      const next = { ...EMPTY_CONNECTED_SUMMARY };

      if (coupleResult.status === "fulfilled" && coupleResult.value.exists()) {
        const couple = coupleResult.value.data() as Record<string, unknown>;
        const weekday = new Intl.DateTimeFormat("en-US", {
          timeZone: "Indian/Mauritius",
          weekday: "long",
        }).format(new Date());
        const foodPlan = couple.foodPlan && typeof couple.foodPlan === "object"
          ? couple.foodPlan as Record<string, unknown>
          : {};
        const eatOutside = couple.eatOutside && typeof couple.eatOutside === "object"
          ? couple.eatOutside as Record<string, unknown>
          : {};
        next.todayMeal = eatOutside[weekday] === true
          ? "Eating outside"
          : typeof foodPlan[weekday] === "string" && foodPlan[weekday]
            ? foodPlan[weekday] as string
            : "Not planned";
        next.activeGoals = Array.isArray(couple.goals)
          ? couple.goals.filter((goal) => goal && typeof goal === "object" && (goal as { status?: unknown }).status !== "Completed").length
          : 0;
      }

      if (cleaningResult.status === "fulfilled" && cleaningResult.value.exists()) {
        const cleaning = cleaningResult.value.data() as Record<string, unknown>;
        const routineTasks = Array.isArray(cleaning.routineTasks) ? cleaning.routineTasks : [];
        const weeks = cleaning.weeks && typeof cleaning.weeks === "object"
          ? cleaning.weeks as Record<string, unknown>
          : {};
        const planValue = weeks[upcomingSundayKey(todayKey)];
        const plan = planValue && typeof planValue === "object"
          ? planValue as Record<string, unknown>
          : {};
        const checked = Array.isArray(plan.tasks) ? plan.tasks.length : 0;
        const completed = checked + Number(plan.pickupReady === true) + Number(plan.cashReady === true);
        const total = routineTasks.length + 2;
        next.cleaningProgress = `${completed} / ${total}`;
        next.cleaningDetail = total ? "Sunday checklist steps" : "No checklist yet";
      }

      if (inventoryResult.status === "fulfilled") {
        const payload = inventoryResult.value as { items?: unknown };
        const items = Array.isArray(payload.items) ? payload.items : [];
        next.shoppingNow = items.filter((item) => item && typeof item === "object" && (item as { shoppingStatus?: unknown }).shoppingStatus === "now").length;
        next.lowStock = items.filter((item) => item && typeof item === "object" && ["low", "out"].includes(String((item as { stockLevel?: unknown }).stockLevel))).length;
      }

      setConnectedSummary(next);
    });
    return () => {
      active = false;
    };
  }, [todayKey, view]);

  function replaceData(next: HomeManagementData) {
    dataRef.current = next;
    setData(next);
  }

  async function persist(next = dataRef.current, successMessage = "Home workspace saved") {
    setSaving(true);
    setMessage("");
    try {
      await setDoc(
        STORAGE_DOC,
        { ...next, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      setMessage(successMessage);
    } catch (error) {
      console.error("Unable to save home management workspace", error);
      setMessage("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function updateRecord<K extends keyof HomeManagementData>(
    collection: K,
    id: string,
    patch: Partial<HomeManagementData[K][number]>
  ) {
    const next = {
      ...dataRef.current,
      [collection]: dataRef.current[collection].map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    } as HomeManagementData;
    replaceData(next);
  }

  async function addRecord(collection: keyof HomeManagementData) {
    const record =
      collection === "bills"
        ? createBlankBill()
        : collection === "maintenance"
          ? createBlankMaintenanceTask()
          : collection === "events"
            ? createBlankHomeEvent()
            : createBlankHomeDocument();
    const next = {
      ...dataRef.current,
      [collection]: [record, ...dataRef.current[collection]],
    } as HomeManagementData;
    replaceData(next);
    await persist(next, "New record added");
  }

  async function removeRecord(collection: keyof HomeManagementData, id: string, label: string) {
    if (!window.confirm(`Delete “${label}”?`)) return;
    const next = {
      ...dataRef.current,
      [collection]: dataRef.current[collection].filter((item) => item.id !== id),
    } as HomeManagementData;
    replaceData(next);
    await persist(next, "Record deleted");
  }

  const query = search.trim().toLowerCase();
  const filteredBills = useMemo(
    () => data.bills.filter((item) => !query || `${item.name} ${item.provider} ${item.category} ${item.notes}`.toLowerCase().includes(query)),
    [data.bills, query]
  );
  const filteredMaintenance = useMemo(
    () => data.maintenance.filter((item) => !query || `${item.title} ${item.area} ${item.provider} ${item.notes}`.toLowerCase().includes(query)),
    [data.maintenance, query]
  );
  const filteredEvents = useMemo(
    () => [...data.events]
      .filter((item) => !query || `${item.title} ${item.type} ${item.who} ${item.notes}`.toLowerCase().includes(query))
      .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999")),
    [data.events, query]
  );
  const filteredDocuments = useMemo(
    () => data.documents.filter((item) => !query || `${item.title} ${item.category} ${item.provider} ${item.reference} ${item.notes}`.toLowerCase().includes(query)),
    [data.documents, query]
  );

  const overview = useMemo(() => {
    const unpaidBills = data.bills.filter((bill) => bill.status === "upcoming" || bill.status === "overdue");
    const openMaintenance = data.maintenance.filter((task) => task.status !== "done");
    const upcomingEvents = data.events.filter((event) => event.status === "planned" && (dateDistanceInDays(event.date, todayKey) ?? -1) >= 0);
    const expiringDocuments = data.documents.filter((document) => {
      const distance = dateDistanceInDays(document.expiryDate, todayKey);
      return distance !== null && distance >= 0 && distance <= 30;
    });
    const attention = [
      ...unpaidBills
        .filter((bill) => {
          const distance = dateDistanceInDays(bill.dueDate, todayKey);
          return bill.status === "overdue" || (distance !== null && distance <= 14);
        })
        .map((bill) => ({ id: `bill-${bill.id}`, title: bill.name, detail: `${money(bill.amount)} · due ${friendlyDate(bill.dueDate)}`, href: "/admin/home-bills", tone: "rose" })),
      ...openMaintenance
        .filter((task) => {
          const distance = dateDistanceInDays(task.dueDate, todayKey);
          return task.priority === "urgent" || (distance !== null && distance <= 14);
        })
        .map((task) => ({ id: `task-${task.id}`, title: task.title, detail: `${task.priority} priority · ${friendlyDate(task.dueDate)}`, href: "/admin/home-maintenance", tone: "orange" })),
      ...upcomingEvents
        .filter((event) => (dateDistanceInDays(event.date, todayKey) ?? 99) <= 14)
        .map((event) => ({ id: `event-${event.id}`, title: event.title, detail: `${friendlyDate(event.date)}${event.time ? ` at ${event.time}` : ""}`, href: "/admin/home-calendar", tone: "indigo" })),
      ...expiringDocuments.map((document) => ({ id: `document-${document.id}`, title: document.title, detail: `Expires ${friendlyDate(document.expiryDate)}`, href: "/admin/home-documents", tone: "cyan" })),
    ];
    return { unpaidBills, openMaintenance, upcomingEvents, expiringDocuments, attention };
  }, [data, todayKey]);

  const addCollection = view === "bills" ? "bills" : view === "maintenance" ? "maintenance" : view === "calendar" ? "events" : view === "documents" ? "documents" : null;

  return (
    <main className="min-h-screen bg-[#f4f6fa] text-slate-950">
      <div className="mx-auto w-full max-w-[1580px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <section className={`relative overflow-hidden rounded-[28px] bg-gradient-to-br ${meta.accent} px-5 py-6 text-white shadow-xl sm:px-8 sm:py-8`}>
          <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-inset ring-white/15">
                <HeaderIcon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/50">Our Home</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{meta.title}</h1>
                <p className="mt-1 max-w-2xl text-sm font-medium text-white/60">{meta.description}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {message && <span className="rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-white/80">{message}</span>}
              <button
                type="button"
                onClick={() => void persist()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950 shadow-sm transition hover:-translate-y-0.5 disabled:opacity-60"
              >
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving" : "Save all"}
              </button>
            </div>
          </div>
        </section>

        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible" aria-label="Home management pages">
          {VIEW_LINKS.map((item) => {
            const itemMeta = VIEW_META[item.view];
            const ItemIcon = itemMeta.icon;
            const active = item.view === view;
            return (
              <Link
                key={item.view}
                href={item.href}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-bold transition lg:justify-center lg:px-2 ${active ? "border-slate-900 bg-slate-950 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"}`}
              >
                <ItemIcon className="h-4 w-4" />
                {itemMeta.title}
              </Link>
            );
          })}
        </nav>

        {loading ? (
          <div className="mt-5 grid min-h-72 place-items-center rounded-3xl border border-slate-200 bg-white">
            <div className="text-center">
              <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-slate-400" />
              <p className="mt-3 text-sm font-bold text-slate-500">Loading your home workspace…</p>
            </div>
          </div>
        ) : view === "overview" ? (
          <Overview data={data} overview={overview} connected={connectedSummary} />
        ) : (
          <section className="mt-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="relative block w-full sm:max-w-md">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-200/60"
                  placeholder={`Search ${meta.title.toLowerCase()}…`}
                />
              </label>
              {addCollection && (
                <button
                  type="button"
                  onClick={() => void addRecord(addCollection)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" />
                  Add {view === "bills" ? "bill" : view === "maintenance" ? "task" : view === "calendar" ? "event" : "document"}
                </button>
              )}
            </div>

            {view === "bills" && (
              <BillsWorkspace
                bills={filteredBills}
                update={(id, patch) => updateRecord("bills", id, patch)}
                save={() => void persist()}
                remove={(id, label) => void removeRecord("bills", id, label)}
                onAdd={() => void addRecord("bills")}
              />
            )}
            {view === "maintenance" && (
              <MaintenanceWorkspace
                tasks={filteredMaintenance}
                update={(id, patch) => updateRecord("maintenance", id, patch)}
                save={() => void persist()}
                remove={(id, label) => void removeRecord("maintenance", id, label)}
                onAdd={() => void addRecord("maintenance")}
              />
            )}
            {view === "calendar" && (
              <CalendarWorkspace
                events={filteredEvents}
                update={(id, patch) => updateRecord("events", id, patch)}
                save={() => void persist()}
                remove={(id, label) => void removeRecord("events", id, label)}
                onAdd={() => void addRecord("events")}
              />
            )}
            {view === "documents" && (
              <DocumentsWorkspace
                documents={filteredDocuments}
                update={(id, patch) => updateRecord("documents", id, patch)}
                save={() => void persist()}
                remove={(id, label) => void removeRecord("documents", id, label)}
                onAdd={() => void addRecord("documents")}
              />
            )}
          </section>
        )}
      </div>
    </main>
  );
}

type OverviewResult = {
  unpaidBills: UtilityBill[];
  openMaintenance: MaintenanceTask[];
  upcomingEvents: HomeCalendarEvent[];
  expiringDocuments: HomeDocument[];
  attention: Array<{ id: string; title: string; detail: string; href: string; tone: string }>;
};

function Overview({ data, overview, connected }: { data: HomeManagementData; overview: OverviewResult; connected: ConnectedHomeSummary }) {
  const totalDue = overview.unpaidBills.reduce((total, bill) => total + (Number(bill.amount) || 0), 0);
  const stats = [
    { label: "Bills to settle", value: overview.unpaidBills.length, detail: totalDue ? `Rs ${totalDue.toLocaleString("en-MU")} tracked` : "No amount due", icon: CircleDollarSign, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Open maintenance", value: overview.openMaintenance.length, detail: `${data.maintenance.filter((task) => task.priority === "urgent" && task.status !== "done").length} urgent`, icon: Hammer, tone: "bg-orange-50 text-orange-700" },
    { label: "Upcoming events", value: overview.upcomingEvents.length, detail: "Planned from today", icon: CalendarDays, tone: "bg-indigo-50 text-indigo-700" },
    { label: "Documents expiring", value: overview.expiringDocuments.length, detail: "Within 30 days", icon: ShieldCheck, tone: "bg-cyan-50 text-cyan-700" },
  ];
  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className={`mb-4 grid h-10 w-10 place-items-center rounded-xl ${stat.tone}`}><Icon className="h-5 w-5" /></div>
              <p className="text-3xl font-black tracking-tight">{stat.value}</p>
              <p className="mt-1 text-sm font-black text-slate-800">{stat.label}</p>
              <p className="mt-0.5 text-xs font-medium text-slate-400">{stat.detail}</p>
            </article>
          );
        })}
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-500">Connected modules</p>
          <h2 className="mt-1 text-xl font-black">Today and this week</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Today’s food", value: connected.todayMeal, detail: "From Food Planning", href: "/admin/tanvi-home", icon: Utensils, tone: "bg-orange-50 text-orange-700" },
            { label: "Cleaning readiness", value: connected.cleaningProgress, detail: connected.cleaningDetail, href: "/admin/cleaning", icon: CheckCircle2, tone: "bg-cyan-50 text-cyan-700" },
            { label: "Shopping now", value: String(connected.shoppingNow), detail: `${connected.lowStock} low or out of stock`, href: "/admin/house-inventory", icon: Gauge, tone: "bg-violet-50 text-violet-700" },
            { label: "Active couple goals", value: String(connected.activeGoals), detail: "Shared goals in progress", href: "/admin/couple-goals", icon: Sparkles, tone: "bg-pink-50 text-pink-700" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.label} href={item.href} className="group flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5 transition hover:border-slate-200 hover:bg-white hover:shadow-sm">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${item.tone}`}><Icon className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-black uppercase tracking-wide text-slate-400">{item.label}</p>
                  <p className="truncate text-base font-black text-slate-900">{item.value}</p>
                  <p className="truncate text-xs font-medium text-slate-400">{item.detail}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-500">Needs attention</p>
              <h2 className="mt-1 text-xl font-black">Coming up soon</h2>
            </div>
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </div>
          {overview.attention.length ? (
            <div className="space-y-2">
              {overview.attention.slice(0, 8).map((item) => (
                <Link key={item.id} href={item.href} className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 transition hover:border-slate-200 hover:bg-white hover:shadow-sm">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{item.title}</p>
                    <p className="truncate text-xs font-medium text-slate-500">{item.detail}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState compact icon={<CheckCircle2 />} title="Nothing urgent" description="Upcoming household items will appear here automatically." />
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-500">Quick access</p>
          <h2 className="mt-1 text-xl font-black">Run your home</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {HOME_SHORTCUTS.map((shortcut) => {
              const Icon = shortcut.icon;
              return (
                <Link key={shortcut.href} href={shortcut.href} className="group flex items-center gap-3 rounded-2xl border border-slate-100 p-3 transition hover:border-slate-200 hover:bg-slate-50">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${shortcut.tone}`}><Icon className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{shortcut.label}</p>
                    <p className="truncate text-xs font-medium text-slate-400">{shortcut.note}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function BillsWorkspace({ bills, update, save, remove, onAdd }: { bills: UtilityBill[]; update: (id: string, patch: Partial<UtilityBill>) => void; save: () => void; remove: (id: string, label: string) => void; onAdd: () => void }) {
  if (!bills.length) return <EmptyState icon={<ReceiptText />} title="No bills yet" description="Add electricity, water, internet, mobile, insurance, or any recurring household payment." action="Add first bill" onAction={onAdd} />;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {bills.map((bill) => (
        <RecordCard key={bill.id} icon={<ReceiptText />} eyebrow={bill.category} title={bill.name} meta={`${money(bill.amount)} · ${friendlyDate(bill.dueDate)}`} status={bill.status} onDelete={() => remove(bill.id, bill.name)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bill name"><input value={bill.name} onChange={(event) => update(bill.id, { name: event.target.value })} onBlur={save} /></Field>
            <Field label="Category"><select value={bill.category} onChange={(event) => { update(bill.id, { category: event.target.value }); }} onBlur={save}>{["Electricity", "Water", "Internet", "Mobile", "Insurance", "Subscription", "Municipal", "Other"].map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Provider"><input value={bill.provider} onChange={(event) => update(bill.id, { provider: event.target.value })} onBlur={save} placeholder="Provider name" /></Field>
            <Field label="Amount (Rs)"><input type="number" min="0" value={bill.amount} onChange={(event) => update(bill.id, { amount: event.target.value })} onBlur={save} placeholder="0" /></Field>
            <Field label="Due date"><input type="date" value={bill.dueDate} onChange={(event) => update(bill.id, { dueDate: event.target.value })} onBlur={save} /></Field>
            <Field label="Frequency"><select value={bill.frequency} onChange={(event) => update(bill.id, { frequency: event.target.value })} onBlur={save}>{["Monthly", "Every 2 months", "Quarterly", "Yearly", "One time"].map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Payment status"><select value={bill.status} onChange={(event) => update(bill.id, { status: event.target.value as UtilityBill["status"] })} onBlur={save}><option value="upcoming">Upcoming</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="paused">Paused</option></select></Field>
            <Field label="Account/reference"><input value={bill.accountReference} onChange={(event) => update(bill.id, { accountReference: event.target.value })} onBlur={save} placeholder="Account number" /></Field>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700"><input type="checkbox" checked={bill.autoPay} onChange={(event) => { update(bill.id, { autoPay: event.target.checked }); save(); }} className="h-4 w-4 accent-emerald-600" />Paid automatically</label>
          <Notes value={bill.notes} onChange={(value) => update(bill.id, { notes: value })} onBlur={save} />
        </RecordCard>
      ))}
    </div>
  );
}

function MaintenanceWorkspace({ tasks, update, save, remove, onAdd }: { tasks: MaintenanceTask[]; update: (id: string, patch: Partial<MaintenanceTask>) => void; save: () => void; remove: (id: string, label: string) => void; onAdd: () => void }) {
  if (!tasks.length) return <EmptyState icon={<Wrench />} title="No maintenance tasks" description="Add repairs, appliance servicing, painting, plumbing, pest control, or recurring checks." action="Add first task" onAction={onAdd} />;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {tasks.map((task) => (
        <RecordCard key={task.id} icon={<Hammer />} eyebrow={task.area} title={task.title} meta={`${task.priority} priority · ${friendlyDate(task.dueDate)}`} status={task.status} onDelete={() => remove(task.id, task.title)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Task"><input value={task.title} onChange={(event) => update(task.id, { title: event.target.value })} onBlur={save} /></Field>
            <Field label="Area"><select value={task.area} onChange={(event) => update(task.id, { area: event.target.value })} onBlur={save}>{["General", "Kitchen", "Bathroom", "Bedroom", "Living room", "Garden", "Roof", "Electrical", "Plumbing", "Appliance", "Vehicle"].map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Priority"><select value={task.priority} onChange={(event) => update(task.id, { priority: event.target.value as MaintenanceTask["priority"] })} onBlur={save}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field>
            <Field label="Status"><select value={task.status} onChange={(event) => update(task.id, { status: event.target.value as MaintenanceTask["status"] })} onBlur={save}><option value="to-do">To do</option><option value="scheduled">Scheduled</option><option value="in-progress">In progress</option><option value="done">Done</option></select></Field>
            <Field label="Due/service date"><input type="date" value={task.dueDate} onChange={(event) => update(task.id, { dueDate: event.target.value })} onBlur={save} /></Field>
            <Field label="Provider/contact"><input value={task.provider} onChange={(event) => update(task.id, { provider: event.target.value })} onBlur={save} placeholder="Person or company" /></Field>
            <Field label="Estimated cost (Rs)"><input type="number" min="0" value={task.estimatedCost} onChange={(event) => update(task.id, { estimatedCost: event.target.value })} onBlur={save} placeholder="0" /></Field>
            <Field label="Repeat every (months)"><input type="number" min="0" value={task.recurringMonths} onChange={(event) => update(task.id, { recurringMonths: event.target.value })} onBlur={save} placeholder="Leave blank if once" /></Field>
          </div>
          <Notes value={task.notes} onChange={(value) => update(task.id, { notes: value })} onBlur={save} />
        </RecordCard>
      ))}
    </div>
  );
}

function CalendarWorkspace({ events, update, save, remove, onAdd }: { events: HomeCalendarEvent[]; update: (id: string, patch: Partial<HomeCalendarEvent>) => void; save: () => void; remove: (id: string, label: string) => void; onAdd: () => void }) {
  if (!events.length) return <EmptyState icon={<CalendarDays />} title="No home events" description="Add appointments, deliveries, visitors, rubbish collection, birthdays, or household reminders." action="Add first event" onAction={onAdd} />;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {events.map((event) => (
        <RecordCard key={event.id} icon={<CalendarDays />} eyebrow={event.type} title={event.title} meta={`${friendlyDate(event.date)}${event.time ? ` · ${event.time}` : ""}`} status={event.status} onDelete={() => remove(event.id, event.title)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Event"><input value={event.title} onChange={(input) => update(event.id, { title: input.target.value })} onBlur={save} /></Field>
            <Field label="Type"><select value={event.type} onChange={(input) => update(event.id, { type: input.target.value })} onBlur={save}>{["Reminder", "Appointment", "Delivery", "Visitor", "Collection", "Birthday", "Home task", "Other"].map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Date"><input type="date" value={event.date} onChange={(input) => update(event.id, { date: input.target.value })} onBlur={save} /></Field>
            <Field label="Time"><input type="time" value={event.time} onChange={(input) => update(event.id, { time: input.target.value })} onBlur={save} /></Field>
            <Field label="Who"><select value={event.who} onChange={(input) => update(event.id, { who: input.target.value })} onBlur={save}><option>Both</option><option>Ryan</option><option>Tanvi</option><option>Family</option></select></Field>
            <Field label="Status"><select value={event.status} onChange={(input) => update(event.id, { status: input.target.value as HomeCalendarEvent["status"] })} onBlur={save}><option value="planned">Planned</option><option value="done">Done</option><option value="cancelled">Cancelled</option></select></Field>
            <Field label="Repeat"><select value={event.repeat} onChange={(input) => update(event.id, { repeat: input.target.value })} onBlur={save}>{["Does not repeat", "Daily", "Weekly", "Monthly", "Yearly"].map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Reminder"><select value={event.reminder} onChange={(input) => update(event.id, { reminder: input.target.value })} onBlur={save}>{["No reminder", "At event time", "1 hour before", "1 day before", "3 days before", "1 week before"].map((value) => <option key={value}>{value}</option>)}</select></Field>
          </div>
          <Notes value={event.notes} onChange={(value) => update(event.id, { notes: value })} onBlur={save} />
        </RecordCard>
      ))}
    </div>
  );
}

function DocumentsWorkspace({ documents, update, save, remove, onAdd }: { documents: HomeDocument[]; update: (id: string, patch: Partial<HomeDocument>) => void; save: () => void; remove: (id: string, label: string) => void; onAdd: () => void }) {
  if (!documents.length) return <EmptyState icon={<FolderOpen />} title="No home documents" description="Register insurance policies, warranties, receipts, manuals, contracts, and important household references." action="Add first document" onAction={onAdd} />;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {documents.map((document) => {
        const url = safeDocumentUrl(document.url);
        return (
          <RecordCard key={document.id} icon={<FileText />} eyebrow={document.category} title={document.title} meta={document.expiryDate ? `Expires ${friendlyDate(document.expiryDate)}` : document.storageLocation || "Location not set"} status={document.expiryDate ? "tracked" : "no expiry"} onDelete={() => remove(document.id, document.title)} action={url ? <a href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50">Open</a> : null}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Document"><input value={document.title} onChange={(event) => update(document.id, { title: event.target.value })} onBlur={save} /></Field>
              <Field label="Category"><select value={document.category} onChange={(event) => update(document.id, { category: event.target.value })} onBlur={save}>{["Warranty", "Insurance", "Receipt", "Manual", "Contract", "Property", "Identity", "Medical", "Other"].map((value) => <option key={value}>{value}</option>)}</select></Field>
              <Field label="Provider/issuer"><input value={document.provider} onChange={(event) => update(document.id, { provider: event.target.value })} onBlur={save} placeholder="Company or issuer" /></Field>
              <Field label="Reference"><input value={document.reference} onChange={(event) => update(document.id, { reference: event.target.value })} onBlur={save} placeholder="Policy, serial, receipt…" /></Field>
              <Field label="Expiry/renewal date"><input type="date" value={document.expiryDate} onChange={(event) => update(document.id, { expiryDate: event.target.value })} onBlur={save} /></Field>
              <Field label="Stored at"><input value={document.storageLocation} onChange={(event) => update(document.id, { storageLocation: event.target.value })} onBlur={save} placeholder="Folder, drawer, Drive…" /></Field>
            </div>
            <Field label="Document URL / Drive link"><input type="url" value={document.url} onChange={(event) => update(document.id, { url: event.target.value })} onBlur={save} placeholder="https://…" /></Field>
            <Notes value={document.notes} onChange={(value) => update(document.id, { notes: value })} onBlur={save} />
          </RecordCard>
        );
      })}
    </div>
  );
}

function RecordCard({ icon, eyebrow, title, meta, status, onDelete, action, children }: { icon: ReactNode; eyebrow: string; title: string; meta: string; status: string; onDelete: () => void; action?: ReactNode; children: ReactNode }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/60 p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 [&_svg]:h-5 [&_svg]:w-5">{icon}</div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{eyebrow}</p>
            <h2 className="truncate text-base font-black text-slate-950">{title}</h2>
            <p className="truncate text-xs font-semibold text-slate-500">{meta}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500 ring-1 ring-slate-200 sm:inline">{status}</span>
          {action}
          <button type="button" onClick={onDelete} aria-label={`Delete ${title}`} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
        </div>
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </article>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-black uppercase tracking-wide text-slate-500 [&_input]:mt-1.5 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:py-2.5 [&_input]:text-sm [&_input]:font-semibold [&_input]:normal-case [&_input]:tracking-normal [&_input]:text-slate-900 [&_input]:outline-none [&_input]:transition [&_input]:focus:border-slate-400 [&_input]:focus:ring-4 [&_input]:focus:ring-slate-100 [&_select]:mt-1.5 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-slate-200 [&_select]:bg-white [&_select]:px-3 [&_select]:py-2.5 [&_select]:text-sm [&_select]:font-semibold [&_select]:normal-case [&_select]:tracking-normal [&_select]:text-slate-900 [&_select]:outline-none [&_select]:transition [&_select]:focus:border-slate-400 [&_select]:focus:ring-4 [&_select]:focus:ring-slate-100">
      {label}
      {children}
    </label>
  );
}

function Notes({ value, onChange, onBlur }: { value: string; onChange: (value: string) => void; onBlur: () => void }) {
  return (
    <label className="mt-3 block text-xs font-black uppercase tracking-wide text-slate-500">
      Notes
      <textarea value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} rows={2} className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100" placeholder="Add useful details for later…" />
    </label>
  );
}

function EmptyState({ icon, title, description, action, onAction, compact = false }: { icon: ReactNode; title: string; description: string; action?: string; onAction?: () => void; compact?: boolean }) {
  return (
    <div className={`grid place-items-center rounded-3xl border border-dashed border-slate-300 bg-white text-center ${compact ? "min-h-48 p-5" : "min-h-80 p-8"}`}>
      <div className="max-w-md">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500 [&_svg]:h-6 [&_svg]:w-6">{icon}</div>
        <h2 className="mt-4 text-lg font-black">{title}</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>
        {action && onAction && <button type="button" onClick={onAction} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white"><Plus className="h-4 w-4" />{action}</button>}
      </div>
    </div>
  );
}
