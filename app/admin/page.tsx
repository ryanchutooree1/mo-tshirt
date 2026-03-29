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

type SparklineResult = {
  line: string;
  area: string;
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
  return `Rs ${Math.round(value || 0).toLocaleString()}`;
}

function dayKey(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function sumDigits(n: number) {
  return n
    .toString()
    .split("")
    .map((digit) => Number(digit))
    .reduce((acc, digit) => acc + digit, 0);
}

function sumDigitsOfString(value: string) {
  return value.split("").reduce((acc, char) => acc + (/\d/.test(char) ? Number(char) : 0), 0);
}

function reduceToMaster(value: number) {
  let next = value;
  while (next > 9 && next !== 11 && next !== 22 && next !== 33) {
    next = sumDigits(next);
  }
  return next;
}

function secondaryFromDay(day: number) {
  if ([2, 11, 20, 22, 33].includes(day)) return day;
  return reduceToMaster(sumDigits(day));
}

function calcNumerology(date: Date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return {
    primary: reduceToMaster(sumDigitsOfString(dd + mm + yyyy)),
    secondary: secondaryFromDay(date.getDate()),
  };
}

function buildSparkline(values: number[], width = 420, height = 120, pad = 10): SparklineResult {
  if (!values.length) {
    const flat = `M ${pad} ${height - pad} L ${width - pad} ${height - pad}`;
    return { line: flat, area: `${flat} L ${width - pad} ${height - pad} L ${pad} ${height - pad} Z` };
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;

  const coords = values.map((value, index) => {
    const x = pad + index * step;
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return { x, y };
  });

  const line = coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  const lastX = coords[coords.length - 1]?.x ?? pad;
  const baseY = height - pad;
  const area = `${line} L ${lastX.toFixed(2)} ${baseY.toFixed(2)} L ${pad.toFixed(2)} ${baseY.toFixed(2)} Z`;

  return { line, area };
}

function statusClass(status: string) {
  const key = status.toLowerCase();
  if (key.includes("complete") || key.includes("deliver") || key === "approved" || key === "sent") {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
  }
  if (key.includes("pending") || key.includes("review") || key.includes("urgent")) {
    return "border-amber-400/40 bg-amber-400/10 text-amber-200";
  }
  return "border-white/20 bg-white/10 text-slate-200";
}

export default function OwnerDashboard() {
  const global = useAdminMetrics();
  const { theme, toggleTheme } = useAdminTheme();
  const isDark = theme === "dark";
  const cardBase = isDark
    ? "rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-[0_22px_60px_rgba(5,12,24,0.45)]"
    : "rounded-[32px] border border-[#ebebeb] bg-white/92 backdrop-blur-xl shadow-[0_14px_34px_rgba(0,0,0,0.06)]";
  const heroPanelClass = isDark
    ? "rounded-2xl border border-white/20 bg-black/20 p-4"
    : "rounded-[26px] border border-[#ebebeb] bg-[#f7f7f7]/95 p-4";

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

  const numerologyToday = useMemo(() => calcNumerology(now), [now]);
  const tomorrowCalc = useMemo(() => {
    const nextDay = new Date(now);
    nextDay.setDate(nextDay.getDate() + 1);
    return {
      dateStr: format(nextDay, "dd/MM/yyyy"),
      ...calcNumerology(nextDay),
    };
  }, [now]);
  const formattedDate = format(now, "dd/MM/yyyy");
  const timeString = format(now, "HH:mm:ss");

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
          const rawColors = Array.isArray(data.colors) ? data.colors : [];
          const colors: ProductColor[] = rawColors
            .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
            .map((entry) => {
              const rawSizes = typeof entry.sizes === "object" && entry.sizes !== null ? entry.sizes : {};
              const sizePairs = Object.entries(rawSizes as Record<string, unknown>);
              const sizes = sizePairs.reduce<Record<string, number>>((acc, [size, qty]) => {
                acc[size] = Math.max(0, asNumber(qty));
                return acc;
              }, {});
              return {
                color: String(entry.color || "Color"),
                sizes,
              };
            });

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
    const daily = Array.from({ length: 14 }, (_, i) => {
      const date = subDays(new Date(), 13 - i);
      return {
        key: dayKey(date),
        label: format(date, "d MMM"),
        value: 0,
      };
    });

    const byDay = new Map<string, number>(daily.map((row) => [row.key, 0]));
    const clientMap = new Map<string, { name: string; orders: number; revenue: number }>();

    let revenueToday = 0;
    let ordersToday = 0;
    let pendingOrders = 0;
    let completedToday = 0;
    let completedTotal = 0;

    orders.forEach((order) => {
      const status = order.status.toLowerCase();
      if (status.includes("pending")) pendingOrders += 1;
      if (status.includes("complete") || status.includes("deliver")) completedTotal += 1;

      if (order.date) {
        const key = dayKey(order.date);
        if (key === today) {
          revenueToday += order.amount;
          ordersToday += 1;
          if (status.includes("complete") || status.includes("deliver")) completedToday += 1;
        }

        if (byDay.has(key)) {
          byDay.set(key, (byDay.get(key) || 0) + order.amount);
        }
      }

      const entry = clientMap.get(order.client) || { name: order.client, orders: 0, revenue: 0 };
      entry.orders += 1;
      entry.revenue += order.amount;
      clientMap.set(order.client, entry);
    });

    const topClients = Array.from(clientMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 4);

    const repeatClients = Array.from(clientMap.values()).filter((client) => client.orders > 1).length;

    daily.forEach((row) => {
      row.value = byDay.get(row.key) || 0;
    });

    const efficiency = orders.length ? Math.round((completedTotal / orders.length) * 100) : 0;
    const aovToday = ordersToday ? Math.round(revenueToday / ordersToday) : 0;

    return {
      revenueToday,
      ordersToday,
      pendingOrders,
      completedToday,
      efficiency,
      aovToday,
      repeatClients,
      daily,
      topClients,
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
    const won = stages.approved + stages.sent;
    const conversion = quotes.length ? Math.round((won / quotes.length) * 100) : 0;

    return {
      stages,
      awaiting,
      won,
      conversion,
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

    const daily = Array.from({ length: 14 }, (_, i) => {
      const date = subDays(new Date(), 13 - i);
      return {
        key: dayKey(date),
        value: 0,
      };
    });
    const dailyMap = new Map<string, number>(daily.map((row) => [row.key, 0]));

    accounts.forEach((entry) => {
      if (!entry.date) return;
      if (entry.date >= thirtyDaysAgo) {
        if (entry.type === "income") income30 += entry.amount;
        if (entry.type === "expense") expense30 += entry.amount;
      }

      const key = dayKey(entry.date);
      if (dailyMap.has(key)) {
        const signed = entry.type === "expense" ? -entry.amount : entry.amount;
        dailyMap.set(key, (dailyMap.get(key) || 0) + signed);
      }
    });

    daily.forEach((row) => {
      row.value = dailyMap.get(row.key) || 0;
    });

    return {
      income30,
      expense30,
      net30: income30 - expense30,
      daily,
    };
  }, [accounts]);

  const revenueSparkline = useMemo(
    () => buildSparkline(orderMetrics.daily.map((row) => row.value), 420, 120, 10),
    [orderMetrics.daily]
  );

  const cashSparkline = useMemo(
    () => buildSparkline(cashMetrics.daily.map((row) => row.value), 420, 100, 10),
    [cashMetrics.daily]
  );

  const todayRevenue = global?.todayRevenue ?? orderMetrics.revenueToday;
  const todayOrders = global?.ordersToday ?? orderMetrics.ordersToday;
  const aovToday = global?.aovToday ?? orderMetrics.aovToday;
  const pendingOrders = global?.pendingOrders ?? orderMetrics.pendingOrders;
  const repeatClients = global?.repeatClientsCount ?? orderMetrics.repeatClients;
  const efficiencyPct = global?.efficiencyPct ?? orderMetrics.efficiency;

  const kpiCards: {
    label: string;
    value: string;
    sub: string;
    href: string;
    Icon: LucideIcon;
  }[] = [
    {
      label: "Revenue Today",
      value: money(todayRevenue),
      sub: `${todayOrders} orders live`,
      href: "/admin/orders?range=today",
      Icon: Wallet,
    },
    {
      label: "Pending Orders",
      value: String(pendingOrders),
      sub: "Production queue",
      href: "/admin/orders?status=Pending",
      Icon: Clock3,
    },
    {
      label: "AOV Today",
      value: aovToday ? money(aovToday) : "-",
      sub: "Average order value",
      href: "/admin/analytics?preset=30d",
      Icon: Gauge,
    },
    {
      label: "Quote Pipeline",
      value: String(quoteMetrics.awaiting),
      sub: "Waiting follow-up",
      href: "/admin/quotation-approval",
      Icon: FileStack,
    },
    {
      label: "Inventory Alerts",
      value: String(inventoryMetrics.low.length + inventoryMetrics.out.length),
      sub: `${inventoryMetrics.out.length} out of stock`,
      href: "/admin/inventory",
      Icon: Package,
    },
    {
      label: "Automation Health",
      value: `${automationMetrics.active} active`,
      sub: automationMetrics.errors > 0 ? `${automationMetrics.errors} failures` : "No failures",
      href: "/admin/automation",
      Icon: Bot,
    },
  ];

  const quickActions: {
    label: string;
    description: string;
    href: string;
    Icon: LucideIcon;
  }[] = [
    {
      label: "New Sale",
      description: "Open POS and issue invoice",
      href: "/admin/pos",
      Icon: BriefcaseBusiness,
    },
    {
      label: "Approve Quote",
      description: "Review and send quotation",
      href: "/admin/quotation-approval",
      Icon: FileStack,
    },
    {
      label: "Stock Control",
      description: "Update low inventory lines",
      href: "/admin/inventory",
      Icon: Package,
    },
    {
      label: "Client CRM",
      description: "Call priority clients",
      href: "/admin/clients",
      Icon: Target,
    },
    {
      label: "Sales AI",
      description: "Test lead capture in admin",
      href: "/admin/ai-assistant",
      Icon: Sparkles,
    },
    {
      label: "Analytics",
      description: "Inspect sales momentum",
      href: "/admin/analytics?preset=30d",
      Icon: Activity,
    },
    {
      label: "Accounting",
      description: "Track cash and expenses",
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
      className={`${bodyFont.className} ${isDark ? "ceo-theme" : "ceo-theme-light"} relative min-h-screen overflow-hidden ${
        isDark ? "text-white" : "text-slate-900"
      }`}
    >
      <div className={`pointer-events-none absolute inset-0 ${isDark ? "opacity-80" : "opacity-100"}`}>
        <div
          className={`absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full blur-3xl ${
            isDark
              ? "bg-[radial-gradient(circle,rgba(56,189,248,0.35),rgba(56,189,248,0)_70%)]"
              : "bg-[radial-gradient(circle,rgba(255,56,92,0.16),rgba(255,56,92,0)_70%)]"
          }`}
        />
        <div
          className={`absolute right-[-6rem] top-32 h-[420px] w-[420px] rounded-full blur-3xl ${
            isDark
              ? "bg-[radial-gradient(circle,rgba(14,165,233,0.28),rgba(14,165,233,0)_70%)]"
              : "bg-[radial-gradient(circle,rgba(229,231,235,0.85),rgba(229,231,235,0)_70%)]"
          }`}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className={`${cardBase} animate-rise overflow-hidden p-7 sm:p-10`}>
          <div
            className={`absolute inset-0 ${
              isDark
                ? "bg-[linear-gradient(120deg,rgba(15,23,42,0.95),rgba(10,36,62,0.88))]"
                : "bg-[linear-gradient(125deg,rgba(255,255,255,0.96),rgba(250,250,250,0.94),rgba(255,243,246,0.9))]"
            }`}
          />
          <div
            className={`absolute inset-0 [background-size:20px_20px] ${
              isDark
                ? "opacity-30 [background-image:radial-gradient(rgba(148,163,184,0.32)_1px,transparent_1px)]"
                : "opacity-25 [background-image:radial-gradient(rgba(34,34,34,0.1)_1px,transparent_1px)]"
            }`}
          />

          <div className="relative grid gap-8 xl:grid-cols-[1.4fr_0.9fr]">
            <div>
              <p className={`text-xs uppercase tracking-[0.28em] ${isDark ? "text-cyan-200/80" : "text-[#d12f5f]"}`}>
                MO Admin HQ
              </p>
              <h1
                className={`${displayFont.className} mt-3 text-4xl font-semibold tracking-tight sm:text-6xl ${
                  isDark ? "text-white" : "text-slate-900"
                }`}
              >
                The CEO Control Panel
              </h1>
              <p className={`mt-4 max-w-2xl text-base sm:text-lg ${isDark ? "text-slate-200/90" : "text-slate-700"}`}>
                One command view for sales, quote pipeline, stock pressure, automations, and execution rhythm.
              </p>
              <p className={`mt-3 text-sm ${isDark ? "text-slate-200/95" : "text-slate-700"}`}>
                {formattedDate} • Primary{" "}
                <span className={`font-semibold ${isDark ? "text-cyan-200" : "text-sky-700"}`}>{numerologyToday.primary}</span> • Secondary{" "}
                <span className={`font-semibold ${isDark ? "text-emerald-200" : "text-emerald-700"}`}>{numerologyToday.secondary}</span>
              </p>
              <p className={`mt-1 text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                Tomorrow ({tomorrowCalc.dateStr}) • Primary{" "}
                <span className={`font-medium ${isDark ? "text-cyan-100" : "text-sky-700"}`}>{tomorrowCalc.primary}</span> • Secondary{" "}
                <span className={`font-medium ${isDark ? "text-emerald-100" : "text-emerald-700"}`}>{tomorrowCalc.secondary}</span>
              </p>

              <div className="mt-6 flex flex-wrap gap-2.5">
                <span className="rounded-full border border-cyan-300/35 bg-cyan-300/15 px-4 py-2 text-sm font-semibold text-cyan-100">
                  {money(todayRevenue)} today
                </span>
                <span className="rounded-full border border-blue-300/35 bg-blue-300/15 px-4 py-2 text-sm font-semibold text-blue-100">
                  {efficiencyPct}% efficiency
                </span>
                <span className="rounded-full border border-indigo-300/35 bg-indigo-300/15 px-4 py-2 text-sm font-semibold text-indigo-100">
                  {quoteMetrics.awaiting} quotes waiting
                </span>
                <span className="rounded-full border border-teal-300/35 bg-teal-300/15 px-4 py-2 text-sm font-semibold text-teal-100">
                  {inventoryMetrics.low.length + inventoryMetrics.out.length} stock risks
                </span>
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/admin/pos"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-cyan-100"
                >
                  Launch POS
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/admin/quotation-approval"
                  className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                    isDark
                      ? "border-white/30 bg-white/10 text-white hover:bg-white/20"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Review Quotes
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                    isDark
                      ? "border-white/30 bg-white/10 text-white hover:bg-white/20"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {theme === "dark" ? (
                    <>
                      <Sun className="h-4 w-4" />
                      Switch To Light Admin
                    </>
                  ) : (
                    <>
                      <Moon className="h-4 w-4" />
                      Switch To Dark Admin
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="grid gap-4 self-end sm:grid-cols-2 xl:grid-cols-1">
              <div className={heroPanelClass}>
                <div className={`text-xs uppercase tracking-[0.2em] ${isDark ? "text-cyan-200/75" : "text-slate-600"}`}>
                  Live Clock
                </div>
                <div className={`${displayFont.className} mt-2 text-3xl ${isDark ? "text-white" : "text-slate-900"}`}>
                  {timeString}
                </div>
                <div className={`mt-1 text-sm ${isDark ? "text-slate-200" : "text-slate-600"}`}>
                  {format(now, "EEEE, d MMMM yyyy")}
                </div>
              </div>

              <div className={heroPanelClass}>
                <div className={`text-xs uppercase tracking-[0.2em] ${isDark ? "text-cyan-200/75" : "text-slate-600"}`}>
                  Command Focus
                </div>
                <div className={`mt-2 text-sm ${isDark ? "text-slate-100" : "text-slate-700"}`}>
                  {pendingOrders > 0
                    ? `Clear ${pendingOrders} pending orders before new rush jobs.`
                    : "Queue is clean, shift to growth and outreach."}
                </div>
                <div
                  className={`mt-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1 text-xs ${
                    isDark ? "text-cyan-100" : "text-cyan-700"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Conversion {quoteMetrics.conversion}%
                </div>
              </div>

              <div className={heroPanelClass}>
                <div className={`text-xs uppercase tracking-[0.2em] ${isDark ? "text-cyan-200/75" : "text-slate-600"}`}>
                  Numerology Outlook
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2">
                    <div className={`text-[11px] uppercase tracking-[0.14em] ${isDark ? "text-cyan-100/85" : "text-cyan-700"}`}>
                      Today
                    </div>
                    <div className={`mt-1 text-sm ${isDark ? "text-slate-100" : "text-slate-700"}`}>
                      {numerologyToday.primary} / {numerologyToday.secondary}
                    </div>
                  </div>
                  <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2">
                    <div className={`text-[11px] uppercase tracking-[0.14em] ${isDark ? "text-emerald-100/85" : "text-emerald-700"}`}>
                      Tomorrow
                    </div>
                    <div className={`mt-1 text-sm ${isDark ? "text-slate-100" : "text-slate-700"}`}>
                      {tomorrowCalc.primary} / {tomorrowCalc.secondary}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {kpiCards.map(({ label, value, sub, href, Icon }, index) => (
            <Link
              key={label}
              href={href}
              className={`${cardBase} animate-rise p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/40`}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-300">{label}</div>
                  <div className={`${displayFont.className} mt-2 text-2xl font-semibold text-white`}>{value}</div>
                  <div className="mt-1 text-xs text-slate-300">{sub}</div>
                </div>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            </Link>
          ))}
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <div className="grid gap-6">
            <article className={`${cardBase} animate-rise p-6`} style={{ animationDelay: "80ms" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className={`${displayFont.className} text-2xl font-semibold`}>Revenue Momentum</h2>
                  <p className="mt-1 text-sm text-slate-300">Last 14 days from live transaction flow.</p>
                </div>
                <Link
                  href="/admin/analytics?preset=30d"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/40 hover:text-cyan-100"
                >
                  Deep analytics
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                <svg viewBox="0 0 420 120" className="h-36 w-full" preserveAspectRatio="none" role="img" aria-label="Revenue trend">
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(34,211,238,0.55)" />
                      <stop offset="100%" stopColor="rgba(34,211,238,0.04)" />
                    </linearGradient>
                  </defs>
                  <path d={revenueSparkline.area} fill="url(#revenueFill)" />
                  <path d={revenueSparkline.line} fill="none" stroke="rgb(34,211,238)" strokeWidth="2.8" />
                </svg>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-300">Today</div>
                  <div className={`${displayFont.className} mt-1 text-xl`}>{money(todayRevenue)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-300">Orders</div>
                  <div className={`${displayFont.className} mt-1 text-xl`}>{todayOrders}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-300">Repeat Clients</div>
                  <div className={`${displayFont.className} mt-1 text-xl`}>{repeatClients}</div>
                </div>
              </div>
            </article>

            <article className={`${cardBase} animate-rise p-6`} style={{ animationDelay: "120ms" }}>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className={`${displayFont.className} text-xl font-semibold`}>Quote Pipeline</h3>
                  <p className="mt-1 text-sm text-slate-300">From your quotation approval workflow.</p>

                  <div className="mt-4 space-y-3">
                    {[
                      { key: "new", label: "New", value: quoteMetrics.stages.new, color: "bg-cyan-400" },
                      { key: "review", label: "Review", value: quoteMetrics.stages.review, color: "bg-amber-400" },
                      { key: "approved", label: "Approved", value: quoteMetrics.stages.approved, color: "bg-emerald-400" },
                      { key: "sent", label: "Sent", value: quoteMetrics.stages.sent, color: "bg-violet-400" },
                    ].map((stage) => {
                      const max = Math.max(1, quotes.length);
                      const width = (stage.value / max) * 100;
                      return (
                        <div key={stage.key}>
                          <div className="mb-1 flex items-center justify-between text-xs text-slate-200">
                            <span>{stage.label}</span>
                            <span>{stage.value}</span>
                          </div>
                          <div className="h-2.5 rounded-full bg-white/10">
                            <div className={`h-full rounded-full ${stage.color}`} style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 inline-flex rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                    Win momentum: {quoteMetrics.conversion}%
                  </div>
                </div>

                <div>
                  <h3 className={`${displayFont.className} text-xl font-semibold`}>Top Clients</h3>
                  <p className="mt-1 text-sm text-slate-300">Highest value from recent transactions.</p>

                  <div className="mt-4 space-y-2">
                    {orderMetrics.topClients.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-4 py-3 text-sm text-slate-300">
                        Client data will appear after transactions sync.
                      </div>
                    ) : (
                      orderMetrics.topClients.map((client) => (
                        <div key={client.name} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-white">{client.name}</div>
                            <div className="text-xs text-slate-300">{client.orders} orders</div>
                          </div>
                          <div className="mt-1 text-sm text-cyan-100">{money(client.revenue)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div className="grid gap-6">
            <article className={`${cardBase} animate-rise p-6`} style={{ animationDelay: "110ms" }}>
              <h3 className={`${displayFont.className} text-xl font-semibold`}>Priority Radar</h3>
              <p className="mt-1 text-sm text-slate-300">Operational bottlenecks detected in real time.</p>

              <div className="mt-4 space-y-2.5">
                {alerts.map((alert) => {
                  const toneClass =
                    alert.tone === "danger"
                      ? "border-rose-400/45 bg-rose-400/12"
                      : alert.tone === "warn"
                        ? "border-amber-400/45 bg-amber-400/12"
                        : "border-emerald-400/45 bg-emerald-400/12";
                  return (
                    <Link
                      key={alert.id}
                      href={alert.href}
                      className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 transition hover:translate-x-0.5 ${toneClass}`}
                    >
                      {alert.tone === "ok" ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-200" />
                      ) : (
                        <TriangleAlert className="mt-0.5 h-4 w-4 text-amber-100" />
                      )}
                      <div>
                        <div className="text-sm font-semibold text-white">{alert.title}</div>
                        <div className="text-xs text-slate-200">{alert.detail}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </article>

            <article className={`${cardBase} animate-rise p-6`} style={{ animationDelay: "140ms" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className={`${displayFont.className} text-xl font-semibold`}>Cash Pulse (30d)</h3>
                  <p className="mt-1 text-sm text-slate-300">Income versus expenses from accounting.</p>
                </div>
                <Link href="/admin/accounting" className="text-xs font-semibold text-cyan-100 hover:text-cyan-200">
                  Open
                </Link>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                <svg viewBox="0 0 420 100" className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label="Cash trend">
                  <defs>
                    <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(20,184,166,0.42)" />
                      <stop offset="100%" stopColor="rgba(20,184,166,0.03)" />
                    </linearGradient>
                  </defs>
                  <path d={cashSparkline.area} fill="url(#cashFill)" />
                  <path d={cashSparkline.line} fill="none" stroke="rgb(45,212,191)" strokeWidth="2.4" />
                </svg>
              </div>

              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-300">Income</div>
                  <div className="mt-1 font-semibold text-emerald-200">{money(cashMetrics.income30)}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-300">Expense</div>
                  <div className="mt-1 font-semibold text-rose-200">{money(cashMetrics.expense30)}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-300">Net</div>
                  <div className="mt-1 font-semibold text-cyan-100">{money(cashMetrics.net30)}</div>
                </div>
              </div>
            </article>

            <article className={`${cardBase} animate-rise p-6`} style={{ animationDelay: "160ms" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className={`${displayFont.className} text-xl font-semibold`}>Automation Watch</h3>
                  <p className="mt-1 text-sm text-slate-300">Workflow reliability and execution freshness.</p>
                </div>
                <Link href="/admin/automation" className="text-xs font-semibold text-cyan-100 hover:text-cyan-200">
                  Manage
                </Link>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-300">Active</div>
                  <div className={`${displayFont.className} mt-1 text-xl`}>{automationMetrics.active}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-300">Paused</div>
                  <div className={`${displayFont.className} mt-1 text-xl`}>{automationMetrics.paused}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-300">Errors</div>
                  <div className={`${displayFont.className} mt-1 text-xl`}>{automationMetrics.errors}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-300">Stale</div>
                  <div className={`${displayFont.className} mt-1 text-xl`}>{automationMetrics.stale}</div>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.95fr_1fr]">
          <article className={`${cardBase} animate-rise p-6`} style={{ animationDelay: "180ms" }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className={`${displayFont.className} text-xl font-semibold`}>Daily Execution</h3>
                <p className="mt-1 text-sm text-slate-300">Tactical checklist with streak persistence.</p>
              </div>
              <div className="rounded-full border border-cyan-300/35 bg-cyan-300/12 px-3 py-1 text-xs font-semibold text-cyan-100">
                Streak {streak}
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-[112px_1fr]">
              <div className="flex flex-col items-center justify-center">
                <div className="relative h-24 w-24">
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{ background: `conic-gradient(rgb(34,211,238) ${checklistDeg}deg, rgba(148,163,184,0.2) 0deg)` }}
                  />
                  <div className="absolute inset-2 rounded-full bg-slate-950/90 text-sm font-semibold grid place-items-center text-white">
                    {checklistProgress}%
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-300">Progress</div>
              </div>

              <div>
                <div className="flex gap-2">
                  <input
                    value={newTask}
                    onChange={(event) => setNewTask(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addTask();
                    }}
                    placeholder="Add priority task"
                    className="w-full rounded-xl border border-white/20 bg-slate-950/50 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-cyan-300/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addTask}
                    className="inline-flex items-center gap-1 rounded-xl border border-cyan-300/45 bg-cyan-300/15 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/25"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>

                <ul className="mt-3 space-y-2">
                  {checklistLoading ? (
                    <li className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                      Loading checklist...
                    </li>
                  ) : tasks.length === 0 ? (
                    <li className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                      No tasks yet. Add one above.
                    </li>
                  ) : (
                    tasks.map((task, index) => (
                      <li
                        key={`${task.title}-${index}`}
                        className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                      >
                        <button
                          type="button"
                          onClick={() => toggleTask(index)}
                          className="flex items-center gap-2 text-left"
                        >
                          {task.completed ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                          ) : (
                            <Circle className="h-4 w-4 text-slate-300" />
                          )}
                          <span className={`text-sm ${task.completed ? "text-slate-400 line-through" : "text-white"}`}>
                            {task.title}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTask(index)}
                          className="rounded-lg p-1 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-200"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </article>

          <article className={`${cardBase} animate-rise p-6`} style={{ animationDelay: "200ms" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className={`${displayFont.className} text-xl font-semibold`}>Inventory Watch</h3>
                <p className="mt-1 text-sm text-slate-300">Most urgent size-color lines to replenish.</p>
              </div>
              <Link href="/admin/inventory" className="text-xs font-semibold text-cyan-100 hover:text-cyan-200">
                Open
              </Link>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
              Total units tracked: <span className="font-semibold text-white">{inventoryMetrics.totalUnits.toLocaleString()}</span>
            </div>

            <div className="mt-3 space-y-2">
              {inventoryMetrics.low.length === 0 && inventoryMetrics.out.length === 0 ? (
                <div className="rounded-xl border border-emerald-400/35 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
                  Inventory is healthy right now.
                </div>
              ) : (
                <>
                  {inventoryMetrics.out.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-rose-400/45 bg-rose-400/12 px-3 py-2 text-sm text-rose-100"
                    >
                      <span className="font-semibold">Out:</span> {item.label}
                    </div>
                  ))}
                  {inventoryMetrics.low.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-amber-400/45 bg-amber-400/12 px-3 py-2 text-sm text-amber-100"
                    >
                      <span className="font-semibold">Low ({item.qty}):</span> {item.label}
                    </div>
                  ))}
                </>
              )}
            </div>
          </article>

          <div className="grid gap-6">
            <article className={`${cardBase} animate-rise p-6`} style={{ animationDelay: "220ms" }}>
              <h3 className={`${displayFont.className} text-xl font-semibold`}>Quick Launch</h3>
              <p className="mt-1 text-sm text-slate-300">Jump to high-impact tools in one tap.</p>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {quickActions.map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="group rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-300/35 bg-cyan-300/10 text-cyan-100">
                        <action.Icon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-white group-hover:text-cyan-100">
                          {action.label}
                        </span>
                        <span className="text-xs text-slate-300">{action.description}</span>
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </article>

            <article className={`${cardBase} animate-rise p-6`} style={{ animationDelay: "240ms" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className={`${displayFont.className} text-xl font-semibold`}>Command Feed</h3>
                  <p className="mt-1 text-sm text-slate-300">Orders, quotes, and notes in one timeline.</p>
                </div>
                <Link href="/admin/orders" className="text-xs font-semibold text-cyan-100 hover:text-cyan-200">
                  View
                </Link>
              </div>

              <div className="mt-4 space-y-2.5">
                {activityFeed.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                    Feed is waiting for activity.
                  </div>
                ) : (
                  activityFeed.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="block rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-slate-200">
                          {item.kind === "Order" ? (
                            <Layers3 className="h-3 w-3" />
                          ) : item.kind === "Quote" ? (
                            <NotebookPen className="h-3 w-3" />
                          ) : (
                            <Activity className="h-3 w-3" />
                          )}
                          {item.kind}
                        </span>
                        <span className="text-[11px] text-slate-300">
                          {item.date ? formatDistanceToNow(item.date, { addSuffix: true }) : "No date"}
                        </span>
                      </div>
                      <div className="mt-1.5 text-sm font-semibold text-white">{item.title}</div>
                      <div className="mt-0.5 text-xs text-slate-300">{item.detail}</div>
                    </Link>
                  ))
                )}
              </div>
            </article>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {orders.slice(0, 4).map((order, index) => (
            <Link
              key={order.id}
              href="/admin/orders"
              className={`${cardBase} animate-rise p-4 transition hover:border-cyan-300/45`}
              style={{ animationDelay: `${260 + index * 40}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-300">Recent Order</div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(order.status)}`}>
                  {order.status}
                </span>
              </div>
              <div className="mt-2 text-sm font-semibold text-white">{order.client}</div>
              <div className="mt-1 text-xs text-slate-300">{money(order.amount)}</div>
            </Link>
          ))}
        </section>
      </div>

      <style jsx>{`
        .ceo-theme {
          --ceo-bg: #050b17;
          --ceo-surface: rgba(255, 255, 255, 0.06);
          --ceo-border: rgba(255, 255, 255, 0.1);
          --ceo-text: #f8fafc;
          background:
            radial-gradient(120% 90% at 50% -20%, rgba(56, 189, 248, 0.25), transparent 65%),
            linear-gradient(145deg, #040814 0%, #081325 46%, #0a1b30 100%);
          color: var(--ceo-text);
        }

        .ceo-theme-light {
          --ceo-bg: #fbfbfb;
          --ceo-text: #222222;
          background:
            radial-gradient(120% 90% at 50% -20%, rgba(255, 56, 92, 0.14), transparent 65%),
            linear-gradient(145deg, #ffffff 0%, #fbfbfb 48%, #f7f7f7 100%);
          color: var(--ceo-text);
        }

        .ceo-theme-light :is(.text-white, .text-slate-100) {
          color: #0f172a !important;
        }

        .ceo-theme-light .text-slate-200 {
          color: #4b5563 !important;
        }

        .ceo-theme-light .text-slate-300 {
          color: #6a6a6a !important;
        }

        .ceo-theme-light :is(.text-cyan-100, .text-cyan-200) {
          color: #d12f5f !important;
        }

        .ceo-theme-light :is(.text-emerald-100, .text-emerald-200) {
          color: #047857 !important;
        }

        .ceo-theme-light :is(.text-amber-100, .text-amber-200) {
          color: #b45309 !important;
        }

        .ceo-theme-light :is(.border-white\/10, .border-white\/15, .border-white\/20, .border-white\/30) {
          border-color: rgba(34, 34, 34, 0.1) !important;
        }

        .ceo-theme-light :is(.bg-white\/\[0\.06\], .bg-white\/10, .bg-white\/5, .bg-black\/20, .bg-slate-950\/40, .bg-slate-950\/90) {
          background-color: rgba(255, 255, 255, 0.92) !important;
        }

        .ceo-theme-light :is(.bg-slate-900, .from-slate-900, .to-slate-800) {
          background-color: #222222 !important;
        }

        .ceo-theme-light :is(.border-cyan-300\/40, .border-cyan-300\/55, .border-cyan-300\/60, .border-cyan-400\/45) {
          border-color: rgba(255, 56, 92, 0.28) !important;
        }

        .ceo-theme-light :is(.bg-cyan-400\/15, .bg-cyan-400\/18, .bg-cyan-300\/10, .bg-cyan-100) {
          background-color: rgba(255, 56, 92, 0.1) !important;
        }

        .animate-rise {
          animation: riseIn 0.55s ease both;
        }

        @keyframes riseIn {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}
