"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Copy,
  Factory,
  Gauge,
  PackageCheck,
  PenLine,
  Plus,
  Rocket,
  Route,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Truck,
  UsersRound,
  Zap,
} from "lucide-react";

type MetricKey =
  | "leads"
  | "orders"
  | "revenue"
  | "profit"
  | "repeatClients"
  | "deliveryTime";

type MetricsState = Record<MetricKey, string>;

type DailyTask = {
  id: string;
  label: string;
  owner: string;
  done: boolean;
};

type Bottleneck = {
  id: string;
  happened: string;
  why: string;
  fix: string;
  owner: string;
  status: string;
};

type GrowthIdea = {
  id: string;
  category: "New offer" | "Automation" | "Expansion";
  title: string;
  nextAction: string;
  impact: string;
};

type DtfOption = {
  id: string;
  group: string;
  type: string;
  price: number;
  cost: number;
};

const STORAGE_KEYS = {
  metrics: "mo-business-os-metrics-v1",
  tasks: "mo-business-os-daily-tasks-v1",
  bottlenecks: "mo-business-os-bottlenecks-v1",
  ideas: "mo-business-os-growth-ideas-v1",
  targets: "mo-business-os-targets-v1",
};

const defaultMetrics: MetricsState = {
  leads: "",
  orders: "",
  revenue: "",
  profit: "",
  repeatClients: "",
  deliveryTime: "",
};

const metricFields: Array<{
  key: MetricKey;
  label: string;
  target: string;
  icon: string;
}> = [
  { key: "leads", label: "Leads", target: "20+ per week", icon: "📥" },
  { key: "orders", label: "Orders", target: "8+ per week", icon: "🧾" },
  { key: "revenue", label: "Revenue", target: "Rs tracked daily", icon: "💰" },
  { key: "profit", label: "Profit", target: "30%+ blended margin", icon: "📈" },
  { key: "repeatClients", label: "Repeat clients", target: "Businesses first", icon: "🔁" },
  { key: "deliveryTime", label: "Delivery time", target: "Same week target", icon: "🚚" },
];

const dtfPricing: DtfOption[] = [
  { id: "normal-front-small", group: "XS-XL", type: "Front small", price: 350, cost: 300 },
  { id: "normal-front-large", group: "XS-XL", type: "Front large", price: 400, cost: 300 },
  { id: "normal-small-back", group: "XS-XL", type: "Small + Back", price: 450, cost: 350 },
  { id: "normal-large-back", group: "XS-XL", type: "Large + Back", price: 500, cost: 350 },
  { id: "large-front", group: "2XL-3XL", type: "Front only", price: 500, cost: 450 },
  { id: "large-front-back", group: "2XL-3XL", type: "Front + Back", price: 650, cost: 575 },
];

const printRules = [
  {
    label: "Complex logo",
    rule: "Many colors, gradient, photo, detailed artwork",
    method: "DTF",
    tone: "border-cyan-200 bg-cyan-50 text-cyan-800",
  },
  {
    label: "Bulk simple",
    rule: "10+ pieces, 1-2 colors, repeated design",
    method: "Serie",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  {
    label: "Clean premium",
    rule: "Simple one-color logo or text",
    method: "Vinyl",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
  },
  {
    label: "Unsure",
    rule: "Client sends unclear artwork or mixed logo style",
    method: "DTF",
    tone: "border-rose-200 bg-rose-50 text-rose-800",
  },
];

const orderFlow = [
  "Lead comes from WhatsApp or website",
  "Tanvi collects product, quantity, sizes, logo, placement, deadline, delivery",
  "Tanvi uses the pricing system and sends quote",
  "Ryan generates or checks mockup when needed",
  "Client approves mockup and total price",
  "Payment collected before production unless trusted business account",
  "Production assigned to Yan, Shabnaaz, or internal vinyl route",
  "Quality check: logo position, size, color, garment count, packaging",
  "Delivery or pickup confirmed with proof",
  "Follow-up sent and repeat order reminder created",
];

const sops = [
  {
    title: "Replying to clients",
    icon: ClipboardList,
    items: [
      "Reply fast with one clear question set.",
      "Collect logo, quantity, sizes, color, print position, deadline, name, phone, address.",
      "Push business clients toward packages, not single low-profit jobs.",
      "If client is unsure, recommend DTF and confirm after artwork review.",
    ],
  },
  {
    title: "Sending quotations",
    icon: Banknote,
    items: [
      "Use fixed DTF table for individual orders.",
      "Use serie for 10+ simple pieces and add blank garment cost.",
      "Every quote must show total price, payment rule, pickup or delivery option, and approval step.",
      "No production starts without approval and payment status.",
    ],
  },
  {
    title: "Printing process",
    icon: Factory,
    items: [
      "DTF goes to Yan only when complex or individual order.",
      "Serie goes to Shabnaaz for bulk simple logos.",
      "Vinyl is reserved for simple premium jobs with stronger margin.",
      "Mockup QA: logo position, scale, side, alignment, and approval screenshot.",
    ],
  },
  {
    title: "Packing",
    icon: PackageCheck,
    items: [
      "Count garments before packing.",
      "Use MO T-SHIRT label or neutral packaging only.",
      "Supplier branding is never visible to the client.",
      "Add client name, order number, payment status, and delivery method.",
    ],
  },
  {
    title: "Delivery",
    icon: Truck,
    items: [
      "Group pickups and deliveries by route.",
      "Home pickup is first option for small orders.",
      "Brother delivery is used when client covers delivery fee.",
      "Supplier collection happens in batches, not one drive per small order.",
    ],
  },
  {
    title: "Tracking",
    icon: Gauge,
    items: [
      "Each order has owner, supplier, payment status, production status, delivery status.",
      "Profit is logged before closing the order.",
      "Late orders become bottlenecks with cause and fix.",
      "Repeat clients are tagged for package follow-up.",
    ],
  },
];

const roles = [
  {
    name: "Tanvi",
    badge: "Communication System 👩",
    does: "Handles WhatsApp, collects details, sends price, follows payment, closes orders.",
    never: "Never asks Ryan for price or print type when the system gives the answer.",
    decisions: "Can quote DTF table, ask for missing details, send payment request, and confirm pickup address.",
  },
  {
    name: "Yan",
    badge: "DTF Supplier 🧑‍🏭",
    does: "Prints individual DTF orders and sometimes posts orders.",
    never: "Never sends client parcels with Yan branding or personal business details.",
    decisions: "Can accept or reject DTF capacity and confirm production timing.",
  },
  {
    name: "Shabnaaz",
    badge: "Serie Printing 🧵",
    does: "Prints bulk T-shirts and polos at Rs 100 per print when blanks are supplied.",
    never: "Never decides client price or changes placement without approval.",
    decisions: "Can confirm serie feasibility, color limits, and collection timing.",
  },
  {
    name: "Ryan",
    badge: "System Builder 🧑‍💼",
    does: "Builds offers, fixes bottlenecks, controls margin, coordinates exceptions, improves growth machine.",
    never: "Never becomes the daily price lookup person for normal orders.",
    decisions: "Owns supplier rules, pricing updates, package design, website automation, and quality standards.",
  },
  {
    name: "Zaideen",
    badge: "Blank Supply 👕",
    does: "Supplies plain T-shirts and poloshirts from Nouvelle France.",
    never: "Never triggers a drive for one small order unless margin covers it.",
    decisions: "Can confirm stock availability and bulk purchase timing.",
  },
  {
    name: "Mother + Brother",
    badge: "Pickup and Delivery 🏠",
    does: "Hand over orders at home, collect payment, and support selected deliveries.",
    never: "Never negotiates price, changes payment rule, or releases unpaid orders.",
    decisions: "Can confirm client arrival, collect payment, and mark delivered.",
  },
];

const defaultTasks: DailyTask[] = [
  { id: "leads", label: "Check every open lead", owner: "Tanvi", done: false },
  { id: "orders", label: "Check production status for every paid order", owner: "Ryan", done: false },
  { id: "cash", label: "Record cash in, cost out, and profit", owner: "Ryan", done: false },
  { id: "system", label: "Improve one SOP or remove one dependency", owner: "Ryan", done: false },
  { id: "growth", label: "Post one proof, offer, or client result", owner: "Ryan", done: false },
];

const seedBottlenecks: Bottleneck[] = [
  {
    id: "pricing-dependency",
    happened: "Tanvi waits for Ryan to give prices.",
    why: "Pricing was inside Ryan head instead of inside the system.",
    fix: "Tanvi uses DTF table first. Ryan only updates the table weekly.",
    owner: "Tanvi",
    status: "Fixing",
  },
  {
    id: "yan-branding",
    happened: "Yan can send parcels with his business branding.",
    why: "No packaging rule or MO label handoff exists.",
    fix: "Use neutral packaging or MO label. If not possible, collect in batches and ship from MO.",
    owner: "Yan + Ryan",
    status: "Open",
  },
  {
    id: "fuel-waste",
    happened: "Driving for every small supply or pickup burns margin.",
    why: "No home mini-stock and no batch collection day.",
    fix: "Keep core sizes at home and collect from Zaideen once or twice per week.",
    owner: "Ryan",
    status: "Open",
  },
  {
    id: "mockup-errors",
    happened: "AI mockups can place the logo wrong.",
    why: "Mockup review checklist was not enforced.",
    fix: "Check side, size, alignment, logo distortion, and approval screenshot before quoting production.",
    owner: "Ryan",
    status: "Fixing",
  },
];

const seedIdeas: GrowthIdea[] = [
  {
    id: "fast-start",
    category: "New offer",
    title: "Fast Start",
    nextAction: "Package 5-10 starter uniforms for new businesses with logo mockup and pickup option.",
    impact: "Turns small leads into structured orders.",
  },
  {
    id: "team-upgrade",
    category: "New offer",
    title: "Team Upgrade",
    nextAction: "Offer polos, T-shirts, and role-name options for teams of 10+.",
    impact: "Moves clients from one item to team uniform value.",
  },
  {
    id: "auto-quote",
    category: "Automation",
    title: "WhatsApp quote helper",
    nextAction: "Connect website/WhatsApp intake to fixed price rules and quote templates.",
    impact: "Removes Ryan from normal pricing.",
  },
  {
    id: "south-partners",
    category: "Expansion",
    title: "South business partner list",
    nextAction: "Build a list of restaurants, gyms, salons, contractors, and shops in the South.",
    impact: "Targets repeat uniform buyers instead of random individual orders.",
  },
];

const templates = [
  {
    label: "First reply",
    body:
      "Hi! Thanks for contacting MO T-SHIRT 👕 Please send: product, quantity, sizes, logo, front/back placement, deadline, and delivery or pickup location.",
  },
  {
    label: "Quote reply",
    body:
      "Your quote is Rs [TOTAL]. This includes mockup confirmation before production. Once approved, payment confirms the order and production starts.",
  },
  {
    label: "Approval",
    body:
      "Please confirm if this mockup is approved. After approval, we will proceed with production using this logo position and size.",
  },
  {
    label: "Follow-up",
    body:
      "Hi! Hope the uniforms were received well. When you need extra staff sizes or another logo run, send us the quantity and we will quote quickly.",
  },
];

const moneyBuckets = [
  { label: "Operations", detail: "Supplier, blanks, delivery, packaging" },
  { label: "Reserve", detail: "Cash buffer for mistakes and urgent stock" },
  { label: "Growth", detail: "Ads, photos, website, samples, equipment" },
  { label: "Owner pay", detail: "Ryan salary replacement target" },
  { label: "Investment", detail: "Future printer, stock, or new business" },
];

const stockRules = [
  "Keep home mini-stock for black and white T-shirts in M, L, XL.",
  "Keep starter polos in black, navy, and white when cash allows.",
  "Reorder when any core size reaches 2 pieces.",
  "Collect from Zaideen on fixed supply days, not for every order.",
  "Push clients to available colors when deadline is urgent.",
];

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function formatRs(value: number) {
  if (!Number.isFinite(value)) return "Rs 0";
  return `Rs ${Math.round(value).toLocaleString("en-MU")}`;
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function marginPercent(price: number, cost: number) {
  if (!price) return 0;
  return Math.round(((price - cost) / price) * 100);
}

export default function BusinessOsPage() {
  const [hydrated, setHydrated] = useState(false);
  const [metrics, setMetrics] = useState<MetricsState>(defaultMetrics);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>(defaultTasks);
  const [bottlenecks, setBottlenecks] = useState<Bottleneck[]>(seedBottlenecks);
  const [ideas, setIdeas] = useState<GrowthIdea[]>(seedIdeas);
  const [selectedDtfId, setSelectedDtfId] = useState(dtfPricing[0].id);
  const [quantity, setQuantity] = useState("1");
  const [copied, setCopied] = useState("");
  const [target, setTarget] = useState({ salary: "", profitPerOrder: "1000" });
  const [bottleneckDraft, setBottleneckDraft] = useState({
    happened: "",
    why: "",
    fix: "",
    owner: "Ryan",
    status: "Open",
  });
  const [ideaDraft, setIdeaDraft] = useState<GrowthIdea>({
    id: "",
    category: "New offer",
    title: "",
    nextAction: "",
    impact: "",
  });

  useEffect(() => {
    setMetrics(readJson(STORAGE_KEYS.metrics, defaultMetrics));
    setDailyTasks(readJson(STORAGE_KEYS.tasks, defaultTasks));
    setBottlenecks(readJson(STORAGE_KEYS.bottlenecks, seedBottlenecks));
    setIdeas(readJson(STORAGE_KEYS.ideas, seedIdeas));
    setTarget(readJson(STORAGE_KEYS.targets, { salary: "", profitPerOrder: "1000" }));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEYS.metrics, JSON.stringify(metrics));
  }, [hydrated, metrics]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(dailyTasks));
  }, [dailyTasks, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEYS.bottlenecks, JSON.stringify(bottlenecks));
  }, [bottlenecks, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEYS.ideas, JSON.stringify(ideas));
  }, [hydrated, ideas]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEYS.targets, JSON.stringify(target));
  }, [hydrated, target]);

  const selectedDtf = useMemo(
    () => dtfPricing.find((item) => item.id === selectedDtfId) || dtfPricing[0],
    [selectedDtfId]
  );
  const qty = Math.max(1, Math.floor(toNumber(quantity) || 1));
  const unitProfit = selectedDtf.price - selectedDtf.cost;
  const totalRevenue = selectedDtf.price * qty;
  const totalCost = selectedDtf.cost * qty;
  const totalProfit = unitProfit * qty;
  const salary = toNumber(target.salary);
  const profitPerOrder = Math.max(1, toNumber(target.profitPerOrder) || 1);
  const x2Target = salary * 2;
  const x3Target = salary * 3;
  const x2Orders = salary ? Math.ceil(x2Target / profitPerOrder) : 0;
  const x3Orders = salary ? Math.ceil(x3Target / profitPerOrder) : 0;
  const completedTasks = dailyTasks.filter((task) => task.done).length;
  const executionScore = Math.round((completedTasks / dailyTasks.length) * 100);

  async function copyTemplate(label: string, body: string) {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1400);
    } catch {
      setCopied("");
    }
  }

  function updateMetric(key: MetricKey, value: string) {
    setMetrics((current) => ({ ...current, [key]: value }));
  }

  function addBottleneck() {
    if (!bottleneckDraft.happened.trim() || !bottleneckDraft.fix.trim()) return;
    setBottlenecks((current) => [
      {
        id: crypto.randomUUID(),
        happened: bottleneckDraft.happened.trim(),
        why: bottleneckDraft.why.trim() || "Cause to confirm",
        fix: bottleneckDraft.fix.trim(),
        owner: bottleneckDraft.owner.trim() || "Ryan",
        status: bottleneckDraft.status,
      },
      ...current,
    ]);
    setBottleneckDraft({ happened: "", why: "", fix: "", owner: "Ryan", status: "Open" });
  }

  function addIdea() {
    if (!ideaDraft.title.trim() || !ideaDraft.nextAction.trim()) return;
    setIdeas((current) => [
      {
        ...ideaDraft,
        id: crypto.randomUUID(),
        title: ideaDraft.title.trim(),
        nextAction: ideaDraft.nextAction.trim(),
        impact: ideaDraft.impact.trim() || "Impact to measure",
      },
      ...current,
    ]);
    setIdeaDraft({ id: "", category: "New offer", title: "", nextAction: "", impact: "" });
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-rose-700">
                  <Sparkles className="h-4 w-4" />
                  🧠 MO T-SHIRT Master Business System
                </div>
                <h1 className="mt-2 max-w-3xl text-3xl font-bold leading-tight text-slate-950 sm:text-4xl">
                  We do not print T-shirts. We make businesses ready.
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                  Fast branded uniforms for Mauritius businesses, with clear mockups,
                  fixed pricing, controlled production, and repeatable delivery.
                </p>
              </div>
              <div className="grid min-w-[260px] gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-700">Daily execution</span>
                  <span className="text-2xl font-bold text-slate-950">{executionScore}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${executionScore}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500">
                  {completedTasks} of {dailyTasks.length} actions done today
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-rose-600" />
              <h2 className="text-lg font-bold text-slate-950">Salary Target Engine</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Full-time monthly salary
                <input
                  inputMode="numeric"
                  value={target.salary}
                  onChange={(event) => setTarget((current) => ({ ...current, salary: event.target.value }))}
                  placeholder="Rs"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Average profit per order
                <input
                  inputMode="numeric"
                  value={target.profitPerOrder}
                  onChange={(event) =>
                    setTarget((current) => ({ ...current, profitPerOrder: event.target.value }))
                  }
                  placeholder="Rs"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none"
                />
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-xs font-semibold text-emerald-800">x2 salary target</div>
                <div className="mt-1 text-2xl font-bold text-slate-950">
                  {salary ? formatRs(x2Target) : "Set salary"}
                </div>
                <div className="text-xs text-slate-600">
                  {salary ? `${x2Orders} orders/month at ${formatRs(profitPerOrder)} profit` : "Target unlocks after salary"}
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="text-xs font-semibold text-amber-800">x3 salary target</div>
                <div className="mt-1 text-2xl font-bold text-slate-950">
                  {salary ? formatRs(x3Target) : "Set salary"}
                </div>
                <div className="text-xs text-slate-600">
                  {salary ? `${x3Orders} orders/month at ${formatRs(profitPerOrder)} profit` : "Target unlocks after salary"}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-950">DTF Pricing Calculator</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Tanvi uses this table first. Ryan handles only exceptions and weekly updates.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px]">
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                DTF option
                <select
                  value={selectedDtfId}
                  onChange={(event) => setSelectedDtfId(event.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none"
                >
                  {dtfPricing.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.group} - {item.type} - Rs {item.price}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Qty
                <input
                  inputMode="numeric"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none"
                />
              </label>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-500">Unit price</div>
                <div className="mt-1 text-xl font-bold">{formatRs(selectedDtf.price)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-500">Unit cost</div>
                <div className="mt-1 text-xl font-bold">{formatRs(selectedDtf.cost)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-500">Profit</div>
                <div className="mt-1 text-xl font-bold text-emerald-700">{formatRs(totalProfit)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-500">Margin</div>
                <div className="mt-1 text-xl font-bold">{marginPercent(selectedDtf.price, selectedDtf.cost)}%</div>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              Quote total: <strong>{formatRs(totalRevenue)}</strong> | Cost:{" "}
              <strong>{formatRs(totalCost)}</strong> | Profit: <strong>{formatRs(totalProfit)}</strong>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-cyan-700" />
              <h2 className="text-lg font-bold text-slate-950">Print Decision System</h2>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {printRules.map((rule) => (
                <div key={rule.label} className={`rounded-lg border p-3 ${rule.tone}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold">{rule.label}</div>
                    <div className="rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-900">
                      {rule.method}
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-5">{rule.rule}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div>
                <strong>Serie:</strong> cost is Rs 100 per print plus blank garment. Use for scale.
              </div>
              <div>
                <strong>Vinyl:</strong> use for simple one-color premium jobs. Protect highest margin.
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-950">Daily Action System</h2>
            </div>
            <div className="mt-4 grid gap-2">
              {dailyTasks.map((task) => (
                <label
                  key={task.id}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() =>
                      setDailyTasks((current) =>
                        current.map((item) =>
                          item.id === task.id ? { ...item, done: !item.done } : item
                        )
                      )
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{task.label}</span>
                    <span className="text-xs text-slate-500">Owner: {task.owner}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-rose-600" />
              <h2 className="text-lg font-bold text-slate-950">Numbers Dashboard</h2>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {metricFields.map((field) => (
                <label key={field.key} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-800">
                      {field.icon} {field.label}
                    </span>
                    <span className="text-xs text-slate-500">{field.target}</span>
                  </span>
                  <input
                    value={metrics[field.key]}
                    onChange={(event) => updateMetric(field.key, event.target.value)}
                    placeholder="Enter today"
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
                  />
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-cyan-700" />
            <h2 className="text-lg font-bold text-slate-950">Order Flow Machine</h2>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {orderFlow.map((step, index) => (
              <div key={step} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-slate-950 text-sm font-bold text-white">
                  {index + 1}
                </div>
                <p className="text-sm font-semibold leading-5 text-slate-800">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <UsersRound className="h-5 w-5 text-violet-700" />
              <h2 className="text-lg font-bold text-slate-950">Team Roles and Decision Rights</h2>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {roles.map((role) => (
                <div key={role.name} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-950">{role.name}</h3>
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                      {role.badge}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm leading-5 text-slate-700">
                    <p>
                      <strong>Does:</strong> {role.does}
                    </p>
                    <p>
                      <strong>Never asks:</strong> {role.never}
                    </p>
                    <p>
                      <strong>Can decide:</strong> {role.decisions}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <Copy className="h-5 w-5 text-rose-600" />
                <h2 className="text-lg font-bold text-slate-950">Tanvi Copy Templates</h2>
              </div>
              <div className="mt-4 grid gap-3">
                {templates.map((template) => (
                  <div key={template.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-bold text-slate-900">{template.label}</h3>
                      <button
                        type="button"
                        onClick={() => copyTemplate(template.label, template.body)}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
                      >
                        <Copy className="h-4 w-4" />
                        {copied === template.label ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p className="mt-2 text-sm leading-5 text-slate-600">{template.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <Boxes className="h-5 w-5 text-emerald-700" />
                <h2 className="text-lg font-bold text-slate-950">Home Stock Rules</h2>
              </div>
              <div className="mt-4 grid gap-2">
                {stockRules.map((rule) => (
                  <div key={rule} className="flex gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-amber-700" />
            <h2 className="text-lg font-bold text-slate-950">SOP Library</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sops.map((sop) => {
              const Icon = sop.icon;
              return (
                <div key={sop.title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-slate-700" />
                    <h3 className="font-bold text-slate-950">{sop.title}</h3>
                  </div>
                  <ul className="mt-3 grid gap-2 text-sm leading-5 text-slate-700">
                    {sop.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-rose-600" />
              <h2 className="text-lg font-bold text-slate-950">Bottleneck Log</h2>
            </div>
            <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-2">
              <input
                value={bottleneckDraft.happened}
                onChange={(event) => setBottleneckDraft((current) => ({ ...current, happened: event.target.value }))}
                placeholder="What happened"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
              />
              <input
                value={bottleneckDraft.why}
                onChange={(event) => setBottleneckDraft((current) => ({ ...current, why: event.target.value }))}
                placeholder="Why"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
              />
              <input
                value={bottleneckDraft.fix}
                onChange={(event) => setBottleneckDraft((current) => ({ ...current, fix: event.target.value }))}
                placeholder="Fix the system"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
              />
              <div className="grid gap-3 sm:grid-cols-[1fr_130px_auto]">
                <input
                  value={bottleneckDraft.owner}
                  onChange={(event) => setBottleneckDraft((current) => ({ ...current, owner: event.target.value }))}
                  placeholder="Owner"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
                />
                <select
                  value={bottleneckDraft.status}
                  onChange={(event) => setBottleneckDraft((current) => ({ ...current, status: event.target.value }))}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
                >
                  <option>Open</option>
                  <option>Fixing</option>
                  <option>Fixed</option>
                </select>
                <button
                  type="button"
                  onClick={addBottleneck}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {bottlenecks.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-2 text-sm leading-5 text-slate-700">
                      <p>
                        <strong>What happened:</strong> {item.happened}
                      </p>
                      <p>
                        <strong>Why:</strong> {item.why}
                      </p>
                      <p>
                        <strong>Fix:</strong> {item.fix}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        Owner: {item.owner} | Status: {item.status}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete bottleneck ${item.id}`}
                      onClick={() => setBottlenecks((current) => current.filter((entry) => entry.id !== item.id))}
                      className="rounded-md border border-slate-300 bg-white p-2 text-slate-700 transition hover:bg-slate-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-violet-700" />
                <h2 className="text-lg font-bold text-slate-950">Growth Vault</h2>
              </div>
              <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
                  <select
                    value={ideaDraft.category}
                    onChange={(event) =>
                      setIdeaDraft((current) => ({
                        ...current,
                        category: event.target.value as GrowthIdea["category"],
                      }))
                    }
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
                  >
                    <option>New offer</option>
                    <option>Automation</option>
                    <option>Expansion</option>
                  </select>
                  <input
                    value={ideaDraft.title}
                    onChange={(event) => setIdeaDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Idea title"
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
                  />
                </div>
                <input
                  value={ideaDraft.nextAction}
                  onChange={(event) => setIdeaDraft((current) => ({ ...current, nextAction: event.target.value }))}
                  placeholder="Next action"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
                />
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input
                    value={ideaDraft.impact}
                    onChange={(event) => setIdeaDraft((current) => ({ ...current, impact: event.target.value }))}
                    placeholder="Expected impact"
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={addIdea}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-3">
                {ideas.map((idea) => (
                  <div key={idea.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-rose-700">{idea.category}</div>
                        <h3 className="mt-1 font-bold text-slate-950">{idea.title}</h3>
                        <p className="mt-2 text-sm leading-5 text-slate-700">{idea.nextAction}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{idea.impact}</p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Delete idea ${idea.id}`}
                        onClick={() => setIdeas((current) => current.filter((entry) => entry.id !== idea.id))}
                        className="rounded-md border border-slate-300 bg-white p-2 text-slate-700 transition hover:bg-slate-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-700" />
                <h2 className="text-lg font-bold text-slate-950">Money Rules</h2>
              </div>
              <div className="mt-4 grid gap-2">
                {moneyBuckets.map((bucket) => (
                  <div key={bucket.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="font-bold text-slate-900">{bucket.label}</div>
                    <div className="text-sm text-slate-600">{bucket.detail}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold leading-5 text-rose-800">
                🔥 Rule: every order must cover cost, protect margin, and record profit before it is marked complete.
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <Save className="h-5 w-5 text-slate-700" />
                <h2 className="text-lg font-bold text-slate-950">Weekly CEO Review</h2>
              </div>
              <div className="mt-4 grid gap-2 text-sm leading-5 text-slate-700">
                <p>Review profit, not only revenue.</p>
                <p>Fix one bottleneck and update the SOP.</p>
                <p>Analyze best business clients and create a repeat order list.</p>
                <p>Remove one low-value task from Ryan.</p>
                <p>Choose one growth action for the next 7 days.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white">
          <div className="flex items-center gap-2">
            <PenLine className="h-5 w-5 text-emerald-300" />
            <h2 className="text-lg font-bold">Final Operating Command</h2>
          </div>
          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-200">
            Build the business so Ryan creates systems, offers, and growth while the team handles
            communication, pricing, production, delivery, and follow-up. The goal is a repeatable
            uniform business that can run without Ryan checking every normal decision.
          </p>
        </section>
      </div>
    </main>
  );
}
