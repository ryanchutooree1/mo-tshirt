"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Manrope, Space_Grotesk } from "next/font/google";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Circle,
  Clock3,
  FileStack,
  Gauge,
  Layers3,
  Moon,
  NotebookPen,
  Package,
  Plus,
  Sparkles,
  Sun,
  Target,
  Trash2,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { format, formatDistanceToNow, subDays } from "date-fns";
import { db } from "@/lib/firebase";
import { normalizeInventoryColors } from "@/lib/inventory-stock";
import { formatMoney as formatDisplayMoney } from "@/lib/money";
import { useAdminMetrics } from "@/admin/AdminDataContext";
import { useAdminTheme } from "@/admin/AdminThemeContext";

type TxnProduct = {
  quantity?: number;
  unitPrice?: number;
  price?: number;
};

type DashboardOrder = {
  id: string;
  client: string;
  amount: number;
  status: string;
  date: Date | null;
};

type ProductColor = {
  color: string;
  sizes: Record<string, number>;
};

type DashboardProduct = {
  id: string;
  productName: string;
  colors: ProductColor[];
};

type DashboardQuote = {
  id: string;
  name: string;
  status: string;
  total: number;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type DashboardNote = {
  id: string;
  title: string;
  category: string;
  updatedAt: Date | null;
};

type DashboardAutomation = {
  id: string;
  name: string;
  enabled: boolean;
  updatedAt: Date | null;
  lastRunAt: Date | null;
  lastStatus: string;
};

type DashboardAccount = {
  id: string;
  amount: number;
  type: "income" | "expense" | "other";
  date: Date | null;
};

type ChecklistTask = {
  title: string;
  completed: boolean;
};

type ActivityItem = {
  id: string;
  kind: "Order" | "Quote" | "Note";
  title: string;
  detail: string;
  date: Date | null;
  href: string;
};

type AlertItem = {
  id: string;
  tone: "danger" | "warn" | "ok";
  title: string;
  detail: string;
  href: string;
};

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const bodyFont = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ADMIN_ID = "mo-owner";
const LOW_STOCK_THRESHOLD = 10;

function asNumber(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const direct = new Date(value);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "object" && value !== null) {
    const maybeTs = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTs.toDate === "function") {
      const parsed = maybeTs.toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof maybeTs.seconds === "number") {
      const parsed = new Date(maybeTs.seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return null;
}

function sumProducts(products: unknown): number {
  if (!Array.isArray(products)) return 0;
  return products.reduce((total, line) => {
    if (!line || typeof line !== "object") return total;
    const item = line as TxnProduct;
    if (typeof item.price === "number") return total + item.price;
    return total + asNumber(item.unitPrice) * asNumber(item.quantity);
  }, 0);
}

function money(value: number) {
  return formatDisplayMoney(value);
}

function dayKey(value: Date) {
  return format(value, "yyyy-MM-dd");
}

export default function OwnerDashboard() {
  const global = useAdminMetrics();
  const { theme, toggleTheme } = useAdminTheme();
  const isDark = theme === "dark";
  const cardBase = isDark
    ? "rounded-lg border border-[#17331b] bg-[#020604]/92 shadow-[inset_0_1px_0_rgba(124,255,69,0.08),0_18px_55px_rgba(0,0,0,0.58)]"
    : "rounded-[32px] border border-[#ebebeb] bg-white/92 backdrop-blur-xl shadow-[0_14px_34px_rgba(0,0,0,0.06)]";

  const [now, setNow] = useState(new Date());
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [quotes, setQuotes] = useState<DashboardQuote[]>([]);
  const [notes, setNotes] = useState<DashboardNote[]>([]);
  const [automations, setAutomations] = useState<DashboardAutomation[]>([]);
  const [accounts, setAccounts] = useState<DashboardAccount[]>([]);

  const [tasks, setTasks] = useState<ChecklistTask[]>([]);
  const [streak, setStreak] = useState(0);
  const [newTask, setNewTask] = useState("");
  const [checklistLoading, setChecklistLoading] = useState(true);

  const today = dayKey(now);
  const checklistRef = useMemo(
    () => doc(db, "users", ADMIN_ID, "checklists", today),
    [today]
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadChecklist() {
      setChecklistLoading(true);
      try {
        const snap = await getDoc(checklistRef);
        if (!cancelled && snap.exists()) {
          const raw = snap.data() as { tasks?: unknown; streak?: unknown };
          const safeTasks = Array.isArray(raw.tasks)
            ? raw.tasks
                .filter((row): row is { title?: unknown; completed?: unknown } =>
                  typeof row === "object" && row !== null
                )
                .map((row) => ({
                  title: String(row.title ?? "").trim(),
                  completed: Boolean(row.completed),
                }))
                .filter((task) => task.title.length > 0)
            : [];

          setTasks(safeTasks);
          setStreak(asNumber(raw.streak, 0));
          setChecklistLoading(false);
          return;
        }

        await setDoc(checklistRef, { tasks: [], streak: 0 }, { merge: true });
        if (!cancelled) {
          setTasks([]);
          setStreak(0);
        }
      } catch {
        if (!cancelled) {
          setTasks([]);
          setStreak(0);
        }
      } finally {
        if (!cancelled) setChecklistLoading(false);
      }
    }

    loadChecklist();
    return () => {
      cancelled = true;
    };
  }, [checklistRef]);

  useEffect(() => {
    const qy = query(collection(db, "transactions"), orderBy("transactionDate", "desc"), limit(240));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const next: DashboardOrder[] = snap.docs.map((row) => {
          const data = row.data() as Record<string, unknown>;
          const amount = typeof data.amount === "number" ? data.amount : sumProducts(data.products);
          return {
            id: row.id,
            client: String(
              data.customerName ||
                data.phoneNumber ||
                data.email ||
                data.client ||
                "Unknown"
            ),
            amount,
            status: String(data.status || "Unknown"),
            date: asDate(data.transactionDate || data.date),
          };
        });
        setOrders(next);
      },
      () => setOrders([])
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const qy = query(collection(db, "products"), orderBy("productName"), limit(120));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const next: DashboardProduct[] = snap.docs.map((row) => {
          const data = row.data() as Record<string, unknown>;
          const colors = normalizeInventoryColors(data.colors).map((entry) => ({
            color: entry.color,
            sizes: entry.sizes,
          })) as ProductColor[];

          return {
            id: row.id,
            productName: String(data.productName || "Unnamed Product"),
            colors,
          };
        });

        setProducts(next);
      },
      () => setProducts([])
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const qy = query(collection(db, "quotes"), orderBy("createdAt", "desc"), limit(120));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const next: DashboardQuote[] = snap.docs.map((row) => {
          const data = row.data() as Record<string, unknown>;
          const quoteObj =
            typeof data.quote === "object" && data.quote !== null
              ? (data.quote as Record<string, unknown>)
              : null;
          return {
            id: row.id,
            name: String(data.name || data.clientName || "New lead"),
            status: String(data.status || "new"),
            total: asNumber(quoteObj?.total ?? data.amount),
            createdAt: asDate(data.createdAt),
            updatedAt: asDate(data.updatedAt),
          };
        });
        setQuotes(next);
      },
      () => setQuotes([])
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const qy = query(
      collection(db, "users", ADMIN_ID, "businessNotes"),
      orderBy("createdAt", "desc"),
      limit(60)
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const next: DashboardNote[] = snap.docs.map((row) => {
          const data = row.data() as Record<string, unknown>;
          return {
            id: row.id,
            title: String(data.title || "Untitled note"),
            category: String(data.category || "Note"),
            updatedAt: asDate(data.updatedAt || data.createdAt),
          };
        });
        setNotes(next);
      },
      () => setNotes([])
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const qy = query(collection(db, "automations"), orderBy("updatedAt", "desc"), limit(80));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const next: DashboardAutomation[] = snap.docs.map((row) => {
          const data = row.data() as Record<string, unknown>;
          const stats =
            typeof data.stats === "object" && data.stats !== null
              ? (data.stats as Record<string, unknown>)
              : null;
          return {
            id: row.id,
            name: String(data.name || "Automation"),
            enabled: data.enabled !== false,
            updatedAt: asDate(data.updatedAt || data.createdAt),
            lastRunAt: asDate(stats?.lastRunAt),
            lastStatus: String(stats?.lastStatus || "unknown"),
          };
        });
        setAutomations(next);
      },
      () => setAutomations([])
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const qy = query(collection(db, "account"), orderBy("transactionDate", "desc"), limit(240));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const next: DashboardAccount[] = snap.docs.map((row) => {
          const data = row.data() as Record<string, unknown>;
          const rawType = String(data.type || "other").toLowerCase();
          const type: DashboardAccount["type"] =
            rawType === "income" ? "income" : rawType === "expense" ? "expense" : "other";
          return {
            id: row.id,
            amount: asNumber(data.amount),
            type,
            date: asDate(data.transactionDate),
          };
        });
        setAccounts(next);
      },
      () => setAccounts([])
    );

    return () => unsub();
  }, []);

  const orderMetrics = useMemo(() => {
    let revenueToday = 0;
    let ordersToday = 0;
    let pendingOrders = 0;

    orders.forEach((order) => {
      const status = order.status.toLowerCase();
      if (status.includes("pending")) pendingOrders += 1;

      if (order.date) {
        const key = dayKey(order.date);
        if (key === today) {
          revenueToday += order.amount;
          ordersToday += 1;
        }
      }
    });

    const aovToday = ordersToday ? Math.round(revenueToday / ordersToday) : 0;

    return {
      revenueToday,
      ordersToday,
      pendingOrders,
      aovToday,
    };
  }, [orders, today]);

  const quoteMetrics = useMemo(() => {
    const stages = {
      new: 0,
      review: 0,
      approved: 0,
      sent: 0,
      other: 0,
    };

    quotes.forEach((quote) => {
      const key = quote.status.toLowerCase();
      if (key === "new") stages.new += 1;
      else if (key === "review") stages.review += 1;
      else if (key === "approved") stages.approved += 1;
      else if (key === "sent") stages.sent += 1;
      else stages.other += 1;
    });

    const awaiting = stages.new + stages.review;
    return {
      stages,
      awaiting,
    };
  }, [quotes]);

  const inventoryMetrics = useMemo(() => {
    const low: { id: string; label: string; qty: number }[] = [];
    const out: { id: string; label: string }[] = [];

    let totalUnits = 0;

    products.forEach((product) => {
      product.colors.forEach((color, index) => {
        const qty = Object.values(color.sizes).reduce((sum, current) => sum + current, 0);
        totalUnits += qty;

        const id = `${product.id}-${index}`;
        const label = `${product.productName} - ${color.color}`;
        if (qty <= 0) {
          out.push({ id, label });
          return;
        }
        if (qty < LOW_STOCK_THRESHOLD) {
          low.push({ id, label, qty });
        }
      });
    });

    low.sort((a, b) => a.qty - b.qty);

    return {
      totalUnits,
      low,
      out,
    };
  }, [products]);

  const automationMetrics = useMemo(() => {
    const active = automations.filter((item) => item.enabled).length;
    const paused = automations.length - active;
    const errors = automations.filter((item) => item.lastStatus.toLowerCase() === "error").length;

    const stale = automations.filter((item) => {
      if (!item.lastRunAt) return item.enabled;
      const days = (Date.now() - item.lastRunAt.getTime()) / (1000 * 60 * 60 * 24);
      return item.enabled && days > 7;
    }).length;

    return {
      active,
      paused,
      errors,
      stale,
    };
  }, [automations]);

  const cashMetrics = useMemo(() => {
    const thirtyDaysAgo = subDays(new Date(), 29);
    let income30 = 0;
    let expense30 = 0;

    accounts.forEach((entry) => {
      if (!entry.date) return;
      if (entry.date >= thirtyDaysAgo) {
        if (entry.type === "income") income30 += entry.amount;
        if (entry.type === "expense") expense30 += entry.amount;
      }
    });

    return {
      income30,
      expense30,
      net30: income30 - expense30,
    };
  }, [accounts]);

  const todayRevenue = global?.todayRevenue ?? orderMetrics.revenueToday;
  const todayOrders = global?.ordersToday ?? orderMetrics.ordersToday;
  const aovToday = global?.aovToday ?? orderMetrics.aovToday;
  const pendingOrders = global?.pendingOrders ?? orderMetrics.pendingOrders;

  const kpiCards: {
    label: string;
    value: string;
    sub: string;
    href: string;
    Icon: LucideIcon;
    accent: "green" | "orange" | "blue" | "yellow" | "pink" | "violet";
  }[] = [
    {
      label: "Revenue Today",
      value: money(todayRevenue),
      sub: `${todayOrders} orders live`,
      href: "/admin/orders?range=today",
      Icon: Wallet,
      accent: "green",
    },
    {
      label: "Pending Orders",
      value: String(pendingOrders),
      sub: "Production queue",
      href: "/admin/orders?status=Pending",
      Icon: Clock3,
      accent: "orange",
    },
    {
      label: "AOV Today",
      value: aovToday ? money(aovToday) : "-",
      sub: "Average order value",
      href: "/admin/analytics?preset=30d",
      Icon: Gauge,
      accent: "blue",
    },
    {
      label: "Quote Pipeline",
      value: String(quoteMetrics.awaiting),
      sub: "Waiting follow-up",
      href: "/admin/quotation-approval",
      Icon: FileStack,
      accent: "yellow",
    },
    {
      label: "Inventory Alerts",
      value: String(inventoryMetrics.low.length + inventoryMetrics.out.length),
      sub: `${inventoryMetrics.out.length} out of stock`,
      href: "/admin/inventory",
      Icon: Package,
      accent: "pink",
    },
    {
      label: "Automation Health",
      value: `${automationMetrics.active} active`,
      sub: automationMetrics.errors > 0 ? `${automationMetrics.errors} failures` : "No failures",
      href: "/admin/automation",
      Icon: Bot,
      accent: "violet",
    },
  ];

  const quickActions: {
    label: string;
    href: string;
    Icon: LucideIcon;
  }[] = [
    {
      label: "New Sale",
      href: "/admin/pos",
      Icon: BriefcaseBusiness,
    },
    {
      label: "Approve Quote",
      href: "/admin/quotation-approval",
      Icon: FileStack,
    },
    {
      label: "Stock Control",
      href: "/admin/inventory",
      Icon: Package,
    },
    {
      label: "Client CRM",
      href: "/admin/clients",
      Icon: Target,
    },
    {
      label: "Sales AI",
      href: "/admin/ai-assistant",
      Icon: Sparkles,
    },
    {
      label: "Analytics",
      href: "/admin/analytics?preset=30d",
      Icon: Activity,
    },
    {
      label: "Accounting",
      href: "/admin/accounting",
      Icon: Wallet,
    },
  ];

  const alerts = useMemo<AlertItem[]>(() => {
    const items: AlertItem[] = [];

    if (pendingOrders > Math.max(5, todayOrders)) {
      items.push({
        id: "queue",
        tone: "danger",
        title: "Order queue is backing up",
        detail: `${pendingOrders} pending versus ${todayOrders} closed today.`,
        href: "/admin/orders?status=Pending",
      });
    }

    if (inventoryMetrics.out.length > 0) {
      items.push({
        id: "out-stock",
        tone: "danger",
        title: "Out-of-stock lines detected",
        detail: `${inventoryMetrics.out.length} SKU lines are currently at zero.`,
        href: "/admin/inventory?filter=out",
      });
    }

    if (inventoryMetrics.low.length > 0) {
      items.push({
        id: "low-stock",
        tone: "warn",
        title: "Low-stock window closing",
        detail: `${inventoryMetrics.low.length} lines under ${LOW_STOCK_THRESHOLD} units.`,
        href: "/admin/inventory?filter=low",
      });
    }

    if (quoteMetrics.awaiting >= 5) {
      items.push({
        id: "quotes",
        tone: "warn",
        title: "Quote follow-up pending",
        detail: `${quoteMetrics.awaiting} quote requests still waiting response.`,
        href: "/admin/quotation-approval",
      });
    }

    if (automationMetrics.errors > 0 || automationMetrics.stale > 0) {
      items.push({
        id: "automation",
        tone: "warn",
        title: "Automation reliability needs attention",
        detail: `${automationMetrics.errors} failures, ${automationMetrics.stale} stale workflows.`,
        href: "/admin/automation",
      });
    }

    if (!items.length) {
      items.push({
        id: "healthy",
        tone: "ok",
        title: "All systems stable",
        detail: "Operations are clean. Push growth tasks and upsells.",
        href: "/admin/analytics",
      });
    }

    return items.slice(0, 5);
  }, [
    pendingOrders,
    todayOrders,
    inventoryMetrics.out.length,
    inventoryMetrics.low.length,
    quoteMetrics.awaiting,
    automationMetrics.errors,
    automationMetrics.stale,
  ]);

  const activityFeed = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [
      ...orders.slice(0, 8).map((order) => ({
        id: `order-${order.id}`,
        kind: "Order" as const,
        title: order.client,
        detail: `${money(order.amount)} - ${order.status}`,
        date: order.date,
        href: "/admin/orders",
      })),
      ...quotes.slice(0, 8).map((quote) => ({
        id: `quote-${quote.id}`,
        kind: "Quote" as const,
        title: quote.name,
        detail: `${quote.status} ${quote.total > 0 ? `- ${money(quote.total)}` : ""}`,
        date: quote.updatedAt || quote.createdAt,
        href: "/admin/quotation-approval",
      })),
      ...notes.slice(0, 8).map((note) => ({
        id: `note-${note.id}`,
        kind: "Note" as const,
        title: note.title,
        detail: note.category,
        date: note.updatedAt,
        href: "/admin/business-notes",
      })),
    ];

    return items
      .sort((a, b) => {
        const tA = a.date ? a.date.getTime() : 0;
        const tB = b.date ? b.date.getTime() : 0;
        return tB - tA;
      })
      .slice(0, 10);
  }, [orders, quotes, notes]);

  const checklistDone = tasks.filter((task) => task.completed).length;
  const checklistProgress = tasks.length ? Math.round((checklistDone / tasks.length) * 100) : 0;
  const checklistDeg = checklistProgress * 3.6;

  async function persistChecklist(nextTasks: ChecklistTask[], nextStreak: number) {
    try {
      await setDoc(checklistRef, { tasks: nextTasks, streak: nextStreak }, { merge: true });
    } catch {
      // keep UI responsive even if persistence fails
    }
  }

  async function addTask() {
    const title = newTask.trim();
    if (!title) return;

    const nextTasks = [...tasks, { title, completed: false }];
    setTasks(nextTasks);
    setNewTask("");
    await persistChecklist(nextTasks, streak);
  }

  async function toggleTask(index: number) {
    const nextTasks = tasks.map((task, current) =>
      current === index ? { ...task, completed: !task.completed } : task
    );

    const wasDone = tasks.length > 0 && tasks.every((task) => task.completed);
    const nowDone = nextTasks.length > 0 && nextTasks.every((task) => task.completed);
    const nextStreak = !wasDone && nowDone ? streak + 1 : streak;

    setTasks(nextTasks);
    setStreak(nextStreak);
    await persistChecklist(nextTasks, nextStreak);
  }

  async function removeTask(index: number) {
    const nextTasks = tasks.filter((_, current) => current !== index);
    setTasks(nextTasks);
    await persistChecklist(nextTasks, streak);
  }

  return (
    <main
      className={`${bodyFont.className} ${isDark ? "ceo-theme" : "ceo-theme-light"} relative min-h-screen ${
        isDark ? "text-white" : "text-slate-900"
      }`}
    >
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className={`${cardBase} p-5 sm:p-6`}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className={`text-xs font-bold uppercase tracking-[0.22em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Admin
              </p>
              <h1
                className={`${displayFont.className} mt-2 text-3xl font-semibold tracking-tight sm:text-4xl ${
                  isDark ? "text-white" : "text-slate-900"
                }`}
              >
                Dashboard
              </h1>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/pos"
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  isDark
                    ? "bg-white text-slate-950 hover:bg-slate-200"
                    : "bg-slate-900 text-white hover:bg-slate-700"
                }`}
              >
                POS
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link
                href="/admin/quotation-approval"
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                  isDark
                    ? "border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Quotes
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={toggleTheme}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                  isDark
                    ? "border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === "dark" ? "Light" : "Dark"}
              </button>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpiCards.slice(0, 4).map(({ label, value, sub, href, Icon }) => (
            <Link
              key={label}
              href={href}
              className={`${cardBase} p-4 transition hover:border-slate-400/50`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`text-xs font-bold uppercase tracking-[0.16em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {label}
                  </div>
                  <div className={`${displayFont.className} mt-2 text-2xl font-semibold`}>
                    {value}
                  </div>
                  <div className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {sub}
                  </div>
                </div>
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${
                    isDark
                      ? "border-white/10 bg-white/5 text-slate-200"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            </Link>
          ))}
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <article className={`${cardBase} p-5`}>
            <h2 className={`${displayFont.className} text-xl font-semibold`}>Urgent</h2>

            <div className="mt-4 grid gap-2">
              {alerts.slice(0, 4).map((alert) => {
                const toneClass =
                  alert.tone === "danger"
                    ? isDark
                      ? "border-rose-400/30 bg-rose-400/10"
                      : "border-rose-200 bg-rose-50"
                    : alert.tone === "warn"
                      ? isDark
                        ? "border-amber-400/30 bg-amber-400/10"
                        : "border-amber-200 bg-amber-50"
                      : isDark
                        ? "border-emerald-400/30 bg-emerald-400/10"
                        : "border-emerald-200 bg-emerald-50";
                return (
                  <Link
                    key={alert.id}
                    href={alert.href}
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition hover:border-slate-400/50 ${toneClass}`}
                  >
                    {alert.tone === "ok" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span>
                      <span className="block text-sm font-semibold">{alert.title}</span>
                      <span className={`text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                        {alert.detail}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </article>

          <article className={`${cardBase} p-5`}>
            <h2 className={`${displayFont.className} text-xl font-semibold`}>Open</h2>

            <div className="mt-4 grid gap-2">
              {quickActions.slice(0, 6).map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className={`group rounded-2xl border px-4 py-3 transition ${
                    isDark
                      ? "border-white/10 bg-white/5 hover:bg-white/10"
                      : "border-slate-200 bg-slate-50 hover:bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-xl border ${
                        isDark
                          ? "border-white/10 bg-slate-950/40"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <action.Icon className="h-4 w-4" />
                    </span>
                    <span className="block text-sm font-semibold">{action.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
          <article className={`${cardBase} p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className={`${displayFont.className} text-xl font-semibold`}>Today</h2>
                <p className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Checklist for the day.
                </p>
              </div>
              <div
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  isDark
                    ? "border-white/10 bg-white/5 text-slate-200"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                Streak {streak}
              </div>
            </div>

            <div className="mt-4">
              <div
                className={`mb-3 h-2 overflow-hidden rounded-full ${
                  isDark ? "bg-white/10" : "bg-slate-100"
                }`}
              >
                <div className="h-full rounded-full bg-slate-900 transition-all dark:bg-white" style={{ width: `${checklistProgress}%` }} />
              </div>
              <div className={`mb-4 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {checklistDone}/{tasks.length || 0} complete
              </div>

              <div className="flex gap-2">
                <input
                  value={newTask}
                  onChange={(event) => setNewTask(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addTask();
                  }}
                  placeholder="Add priority task"
                  className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${
                    isDark
                      ? "border-white/10 bg-slate-950/60 text-white placeholder:text-slate-500 focus:border-white/30"
                      : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-400"
                  }`}
                />
                <button
                  type="button"
                  onClick={addTask}
                  className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    isDark
                      ? "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                      : "border-slate-200 bg-slate-900 text-white hover:bg-slate-700"
                  }`}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>

              <ul className="mt-3 space-y-2">
                {checklistLoading ? (
                  <li className={`rounded-xl border px-3 py-2 text-sm ${isDark ? "border-white/10 bg-white/5 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                    Loading checklist...
                  </li>
                ) : tasks.length === 0 ? (
                  <li className={`rounded-xl border px-3 py-2 text-sm ${isDark ? "border-white/10 bg-white/5 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                    No tasks yet. Add one above.
                  </li>
                ) : (
                  tasks.map((task, index) => (
                    <li
                      key={`${task.title}-${index}`}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                        isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleTask(index)}
                        className="flex items-center gap-2 text-left"
                      >
                        {task.completed ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Circle className="h-4 w-4 text-slate-400" />
                        )}
                        <span className={`text-sm ${task.completed ? "text-slate-400 line-through" : ""}`}>
                          {task.title}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTask(index)}
                        className="rounded-lg p-1 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500"
                        aria-label="Remove task"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </article>

          <article className={`${cardBase} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className={`${displayFont.className} text-xl font-semibold`}>Recent</h2>
                <p className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Latest orders, quotes, and notes.
                </p>
              </div>
              <Link
                href="/admin/orders"
                className={`text-xs font-semibold ${isDark ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-slate-900"}`}
              >
                Orders
              </Link>
            </div>

            <div className="mt-4 space-y-2">
              {activityFeed.length === 0 ? (
                <div className={`rounded-xl border px-3 py-2 text-sm ${isDark ? "border-white/10 bg-white/5 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                  Feed is waiting for activity.
                </div>
              ) : (
                activityFeed.slice(0, 6).map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`block rounded-xl border px-3 py-2.5 transition ${
                      isDark
                        ? "border-white/10 bg-white/5 hover:bg-white/10"
                        : "border-slate-200 bg-slate-50 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${isDark ? "border-white/10 bg-white/5 text-slate-300" : "border-slate-200 bg-white text-slate-500"}`}>
                        {item.kind === "Order" ? (
                          <Layers3 className="h-3 w-3" />
                        ) : item.kind === "Quote" ? (
                          <NotebookPen className="h-3 w-3" />
                        ) : (
                          <Activity className="h-3 w-3" />
                        )}
                        {item.kind}
                      </span>
                      <span className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        {item.date ? formatDistanceToNow(item.date, { addSuffix: true }) : "No date"}
                      </span>
                    </div>
                    <div className="mt-1.5 text-sm font-semibold">{item.title}</div>
                    <div className={`mt-0.5 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      {item.detail}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </article>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-3">
          <article className={`${cardBase} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className={`${displayFont.className} text-lg font-semibold`}>Inventory</h2>
                <p className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {inventoryMetrics.totalUnits.toLocaleString()} units tracked.
                </p>
              </div>
              <Link href="/admin/inventory" className={`text-xs font-semibold ${isDark ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-slate-900"}`}>
                Open
              </Link>
            </div>
            <div className="mt-4 space-y-2">
              {inventoryMetrics.out.slice(0, 2).map((item) => (
                <div key={item.id} className={`rounded-xl border px-3 py-2 text-sm ${isDark ? "border-rose-400/30 bg-rose-400/10" : "border-rose-200 bg-rose-50"}`}>
                  <span className="font-semibold">Out:</span> {item.label}
                </div>
              ))}
              {inventoryMetrics.low.slice(0, 3).map((item) => (
                <div key={item.id} className={`rounded-xl border px-3 py-2 text-sm ${isDark ? "border-amber-400/30 bg-amber-400/10" : "border-amber-200 bg-amber-50"}`}>
                  <span className="font-semibold">Low ({item.qty}):</span> {item.label}
                </div>
              ))}
              {inventoryMetrics.low.length === 0 && inventoryMetrics.out.length === 0 ? (
                <div className={`rounded-xl border px-3 py-2 text-sm ${isDark ? "border-emerald-400/30 bg-emerald-400/10" : "border-emerald-200 bg-emerald-50"}`}>
                  Inventory is healthy.
                </div>
              ) : null}
            </div>
          </article>

          <article className={`${cardBase} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className={`${displayFont.className} text-lg font-semibold`}>Cash</h2>
                <p className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Last 30 days.
                </p>
              </div>
              <Link href="/admin/accounting" className={`text-xs font-semibold ${isDark ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-slate-900"}`}>
                Open
              </Link>
            </div>
            <div className="mt-4 grid gap-2">
              <div className={`rounded-xl border px-3 py-2 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
                <div className={`text-[11px] uppercase tracking-[0.14em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Income</div>
                <div className="mt-1 font-semibold">{money(cashMetrics.income30)}</div>
              </div>
              <div className={`rounded-xl border px-3 py-2 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
                <div className={`text-[11px] uppercase tracking-[0.14em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Expense</div>
                <div className="mt-1 font-semibold">{money(cashMetrics.expense30)}</div>
              </div>
              <div className={`rounded-xl border px-3 py-2 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
                <div className={`text-[11px] uppercase tracking-[0.14em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Net</div>
                <div className="mt-1 font-semibold">{money(cashMetrics.net30)}</div>
              </div>
            </div>
          </article>

          <article className={`${cardBase} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className={`${displayFont.className} text-lg font-semibold`}>Automation</h2>
                <p className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Workflow health.
                </p>
              </div>
              <Link href="/admin/automation" className={`text-xs font-semibold ${isDark ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-slate-900"}`}>
                Open
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                ["Active", automationMetrics.active],
                ["Paused", automationMetrics.paused],
                ["Errors", automationMetrics.errors],
                ["Stale", automationMetrics.stale],
              ].map(([label, value]) => (
                <div key={label} className={`rounded-xl border px-3 py-2 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
                  <div className={`text-[11px] uppercase tracking-[0.14em] ${isDark ? "text-slate-400" : "text-slate-500"}`}>{label}</div>
                  <div className={`${displayFont.className} mt-1 text-xl`}>{value}</div>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
