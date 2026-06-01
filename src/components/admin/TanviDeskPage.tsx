"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  LockKeyhole,
  MessageCircle,
  PackageCheck,
  Plus,
  Printer,
  RefreshCw,
  Route,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Users,
} from "lucide-react";
import { differenceInCalendarDays, format, formatDistanceToNow } from "date-fns";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import {
  PARTNER_CLIENT_STATUS_LABELS,
  PARTNER_CLIENT_STATUS_OPTIONS,
  PARTNER_DECISION_LABELS,
  PARTNER_PRINT_PLACEMENT_LABELS,
  PARTNER_PRODUCTION_STATUS_LABELS,
  PARTNER_VISIBLE_FIELD_OPTIONS,
  type PartnerClientStatus,
  type PartnerPrintPlacement,
  type PartnerVisibleField,
  type PrintPartner,
  type ProductionManager,
} from "@/lib/partners";
import type {
  TanviArtworkAttachment,
  TanviQuoteSummary,
  TanviStepKey,
} from "@/lib/tanvi-quotes";

type DeskPayload = {
  manager: ProductionManager;
  partners: PrintPartner[];
  quotes: TanviQuoteSummary[];
};

type QueueFilter = "all" | "unrouted" | "waiting" | "blocked" | "ready" | "active";
type WorkflowTone = "success" | "warning" | "danger" | "info" | "neutral";

type WhatsappOrderDraft = {
  clientName: string;
  phone: string;
  email: string;
  product: string;
  quantity: string;
  color: string;
  printMethod: string;
  deadline: string;
  total: string;
  notes: string;
};

const TANVI_STEPS: { key: TanviStepKey; label: string }[] = [
  { key: "client_onboarding", label: "Client onboarding" },
  { key: "artwork", label: "Artwork / logo" },
  { key: "route_prices", label: "Route, placement, partner prices" },
  { key: "client_approval", label: "Client approval" },
  { key: "partner_answer", label: "Partner answer" },
  { key: "print_start", label: "Print start" },
];

const YAN_PRINT_PRICE_OPTIONS: {
  value: PartnerPrintPlacement;
  label: string;
  price: number;
}[] = [
  { value: "small_front_only", label: "DTF Small Front Printing only", price: 150 },
  { value: "small_back_only", label: "DTF Small Back Printing only", price: 150 },
  { value: "large_front_only", label: "DTF Large Front Printing only", price: 200 },
  { value: "back_only", label: "DTF Large Back Printing only", price: 200 },
  { value: "small_front_back", label: "DTF Small Front and Small Back Printing", price: 200 },
  { value: "small_front_large_back", label: "DTF Small Front and Large Back Printing", price: 250 },
  { value: "large_front_small_back", label: "DTF Large Front and Small Back Printing", price: 250 },
  { value: "front_back", label: "DTF Large Front and Large Back Printing", price: 300 },
];

const SHABBANAZ_PRINT_PRICE_OPTIONS: typeof YAN_PRINT_PRICE_OPTIONS = [
  { value: "small_front_only", label: "DTF Small Front Printing only", price: 50 },
  { value: "small_back_only", label: "DTF Small Back Printing only", price: 50 },
  { value: "large_front_only", label: "DTF Large Front Printing only", price: 80 },
  { value: "back_only", label: "DTF Large Back Printing only", price: 80 },
  { value: "small_front_back", label: "DTF Small Front and Small Back Printing", price: 100 },
  { value: "small_front_large_back", label: "DTF Small Front and Large Back Printing", price: 100 },
  { value: "large_front_small_back", label: "DTF Large Front and Small Back Printing", price: 100 },
  { value: "front_back", label: "DTF Large Front and Large Back Printing", price: 150 },
  { value: "small_front_only", label: "SP Small Front Printing only", price: 50 },
  { value: "small_back_only", label: "SP Small Back Printing only", price: 50 },
  { value: "large_front_only", label: "SP Large Front Printing only", price: 80 },
  { value: "back_only", label: "SP Large Back Printing only", price: 80 },
  { value: "small_front_back", label: "SP Small Front and Small Back Printing", price: 100 },
  { value: "small_front_large_back", label: "SP Small Front and Large Back Printing", price: 100 },
  { value: "large_front_small_back", label: "SP Large Front and Small Back Printing", price: 100 },
  { value: "front_back", label: "SP Large Front and Large Back Printing", price: 150 },
];

const defaultManager: ProductionManager = {
  name: "Tanvi",
  email: "",
};

const emptyWhatsappDraft: WhatsappOrderDraft = {
  clientName: "",
  phone: "",
  email: "",
  product: "",
  quantity: "",
  color: "",
  printMethod: "",
  deadline: "",
  total: "",
  notes: "",
};

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return format(date, "dd MMM yyyy, HH:mm");
}

function formatRelative(value: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return `${formatDistanceToNow(date, { addSuffix: true })}`;
}

function formatMoney(value: number | null, currency: string) {
  if (!value) return "Not set";
  return `${currency || "Rs"} ${value.toLocaleString("en-MU")}`;
}

function formatFileSize(value: number | null) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function parseDeadlineDate(value: string) {
  const cleanValue = value.trim();
  if (!cleanValue || cleanValue.toLowerCase() === "no deadline") return null;

  const directDate = new Date(cleanValue);
  if (!Number.isNaN(directDate.getTime())) return directDate;

  const numericDate = cleanValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!numericDate) return null;

  const day = Number(numericDate[1]);
  const month = Number(numericDate[2]) - 1;
  const year = Number(numericDate[3].length === 2 ? `20${numericDate[3]}` : numericDate[3]);
  const parsed = new Date(year, month, day);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDeadlineInsight(value: string) {
  const deadlineDate = parseDeadlineDate(value);
  if (!deadlineDate) {
    return {
      label: value && value !== "No deadline" ? value : "No deadline shared",
      helper: "No countdown available until Ryan or the client gives a date.",
      tone: "neutral" as WorkflowTone,
      daysLeft: null as number | null,
      progress: 0,
    };
  }

  const daysLeft = differenceInCalendarDays(deadlineDate, new Date());
  if (daysLeft < 0) {
    return {
      label: `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} late`,
      helper: format(deadlineDate, "dd MMM yyyy"),
      tone: "danger" as WorkflowTone,
      daysLeft,
      progress: 100,
    };
  }

  if (daysLeft === 0) {
    return {
      label: "Due today",
      helper: format(deadlineDate, "dd MMM yyyy"),
      tone: "warning" as WorkflowTone,
      daysLeft,
      progress: 92,
    };
  }

  return {
    label: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
    helper: format(deadlineDate, "dd MMM yyyy"),
    tone: daysLeft <= 2 ? "warning" as WorkflowTone : "success" as WorkflowTone,
    daysLeft,
    progress: Math.max(10, Math.min(88, 100 - daysLeft * 8)),
  };
}

function getProductionStageInsight(status: TanviQuoteSummary["partner"]["productionStatus"]) {
  if (status === "waiting_for_tshirts_from_ryan") {
    return {
      supply: "Waiting for Ryan to supply the t-shirts",
      printing: "Printing cannot start yet",
      helper: "Keep this open until Ryan confirms the garments are with the partner.",
      tone: "warning" as WorkflowTone,
      progress: 25,
    };
  }

  if (status === "in_progress") {
    return {
      supply: "Ryan has already supplied the t-shirts",
      printing: "Printing in progress",
      helper: "Track deadline pressure and partner updates daily.",
      tone: "info" as WorkflowTone,
      progress: 62,
    };
  }

  if (status === "completed" || status === "ryan_to_collect" || status === "will_post_tomorrow") {
    return {
      supply: "Ryan has already supplied the t-shirts",
      printing: PARTNER_PRODUCTION_STATUS_LABELS[status],
      helper: "Move attention to collection, delivery, and client handoff.",
      tone: "success" as WorkflowTone,
      progress: status === "completed" ? 100 : 84,
    };
  }

  return {
    supply: "T-shirt supply not confirmed yet",
    printing: "Printing not started",
    helper: "Start only after Tanvi confirms approval, payment readiness, and partner ownership.",
    tone: "neutral" as WorkflowTone,
    progress: 8,
  };
}

function quoteNeedsRouting(quote: TanviQuoteSummary) {
  return !quote.partner.visibleTo.length;
}

function quoteHasBlocker(quote: TanviQuoteSummary) {
  return (
    quote.partner.requestStatus === "needs_info" ||
    Boolean(quote.partner.missingInformation)
  );
}

function quoteIsReady(quote: TanviQuoteSummary) {
  return (
    quote.partner.clientStatus === "confirmed_half_payment" &&
    quote.partner.requestStatus === "accepted"
  );
}

function quoteIsActive(quote: TanviQuoteSummary) {
  return (
    quote.partner.productionStatus === "in_progress" ||
    quote.partner.productionStatus === "waiting_for_tshirts_from_ryan"
  );
}

function filterQuote(quote: TanviQuoteSummary, filter: QueueFilter) {
  if (filter === "unrouted") return quoteNeedsRouting(quote);
  if (filter === "waiting") return quote.partner.requestStatus === "pending";
  if (filter === "blocked") return quoteHasBlocker(quote);
  if (filter === "ready") return quoteIsReady(quote);
  if (filter === "active") return quoteIsActive(quote);
  return true;
}

function searchQuote(quote: TanviQuoteSummary, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [
    quote.code,
    quote.clientName,
    quote.clientCompany,
    quote.phone,
    quote.email,
    quote.product,
    quote.printMethod,
    quote.partner.visibleLabel,
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function statusTone(value: string) {
  if (value === "accepted" || value === "confirmed_half_payment" || value === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (value === "needs_info" || value === "changes_needed") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (value === "rejected") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function getArtworkDownloadHref(attachment: TanviArtworkAttachment, index: number) {
  if (!attachment.url) return "";

  const params = new URLSearchParams({
    url: attachment.url,
    name: attachment.filename || attachment.label || `artwork-${index + 1}`,
  });

  return `/api/shops/download?${params.toString()}`;
}

function isArtworkImage(attachment: TanviArtworkAttachment) {
  const contentType = attachment.contentType.toLowerCase();
  const filename = attachment.filename.toLowerCase();
  return Boolean(
    attachment.url &&
      (contentType.startsWith("image/") ||
        [".png", ".jpg", ".jpeg", ".webp", ".gif"].some((suffix) =>
          filename.endsWith(suffix)
        ))
  );
}

function isArtworkPdf(attachment: TanviArtworkAttachment) {
  const contentType = attachment.contentType.toLowerCase();
  const filename = attachment.filename.toLowerCase();
  return Boolean(
    attachment.url &&
      (contentType === "application/pdf" ||
        contentType.includes("pdf") ||
        filename.endsWith(".pdf"))
  );
}

export default function TanviDeskPage() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";
  const [manager, setManager] = useState<ProductionManager>(defaultManager);
  const [partners, setPartners] = useState<PrintPartner[]>([]);
  const [quotes, setQuotes] = useState<TanviQuoteSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [search, setSearch] = useState("");
  const [visibleFields, setVisibleFields] = useState<PartnerVisibleField[]>([]);
  const [printPlacement, setPrintPlacement] = useState<PartnerPrintPlacement>("not_set");
  const [partnerPriceDrafts, setPartnerPriceDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showQueue, setShowQueue] = useState(true);
  const [showWhatsappIntake, setShowWhatsappIntake] = useState(false);
  const [whatsappDraft, setWhatsappDraft] = useState<WhatsappOrderDraft>(emptyWhatsappDraft);
  const [creatingWhatsappOrder, setCreatingWhatsappOrder] = useState(false);

  const activePartners = useMemo(
    () => partners.filter((partner) => partner.active),
    [partners]
  );
  const selected = useMemo(
    () => quotes.find((quote) => quote.id === selectedId) || quotes[0] || null,
    [quotes, selectedId]
  );

  const filteredQuotes = useMemo(
    () => quotes.filter((quote) => filterQuote(quote, filter) && searchQuote(quote, search)),
    [filter, quotes, search]
  );

  const metrics = useMemo(
    () => ({
      total: quotes.length,
      unrouted: quotes.filter(quoteNeedsRouting).length,
      blockers: quotes.filter(quoteHasBlocker).length,
      ready: quotes.filter(quoteIsReady).length,
      active: quotes.filter(quoteIsActive).length,
    }),
    [quotes]
  );

  const partnerLoads = useMemo(
    () =>
      activePartners.map((partner) => ({
        partner,
        count: quotes.filter((quote) => quote.partner.visibleTo.includes(partner.id)).length,
        accepted: quotes.filter(
          (quote) =>
            quote.partner.lockedBy === partner.id &&
            quote.partner.requestStatus === "accepted"
        ).length,
      })),
    [activePartners, quotes]
  );

  async function loadDesk() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tanvi/quotes", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as Partial<DeskPayload> & {
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.quotes)) {
        throw new Error(data.error || "Failed to load Tanvi desk.");
      }
      setManager(data.manager || defaultManager);
      setPartners(Array.isArray(data.partners) ? data.partners : []);
      setQuotes(data.quotes);
      setSelectedId((current) =>
        current && data.quotes?.some((quote) => quote.id === current)
          ? current
          : data.quotes?.[0]?.id || null
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load Tanvi desk.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDesk();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setVisibleFields(selected.partner.visibleFields);
    setPrintPlacement(selected.partner.printPlacement);
    setPartnerPriceDrafts(
      activePartners.reduce<Record<string, string>>((drafts, partner) => {
        const response = selected.partner.responses.find(
          (entry) => entry.partnerId === partner.id
        );
        drafts[partner.id] = response?.price ? String(response.price) : "";
        return drafts;
      }, {})
    );
  }, [activePartners, selected]);

  function replaceQuote(quote: TanviQuoteSummary) {
    setQuotes((current) =>
      current.map((entry) => (entry.id === quote.id ? quote : entry))
    );
    setSelectedId(quote.id);
  }

  async function updateQuote(
    quote: TanviQuoteSummary,
    payload: {
      partnerIds?: string[];
      visibleFields?: PartnerVisibleField[];
      printPlacement?: PartnerPrintPlacement;
      clientStatus?: PartnerClientStatus;
      partnerPrices?: Record<string, { price: number | null }>;
      tanviStepChecks?: Partial<Record<TanviStepKey, boolean>>;
      whatsappDetails?: WhatsappOrderDraft;
    },
    label: string
  ) {
    setSaving(label);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tanvi/quotes/${encodeURIComponent(quote.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.quote) {
        throw new Error(data?.error || "Could not update quote.");
      }
      replaceQuote(data.quote as TanviQuoteSummary);
      setNotice(`${quote.code} updated.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update quote.");
    } finally {
      setSaving(null);
    }
  }

  function toggleVisibleField(field: PartnerVisibleField) {
    setVisibleFields((current) => {
      if (current.includes(field)) {
        const next = current.filter((entry) => entry !== field);
        return next.length ? next : current;
      }
      return [...current, field];
    });
  }

  function getPartnerPriceOptions(partnerId: string) {
    if (partnerId === "yan") return YAN_PRINT_PRICE_OPTIONS;
    if (partnerId === "shabanaz") return SHABBANAZ_PRINT_PRICE_OPTIONS;
    return YAN_PRINT_PRICE_OPTIONS;
  }

  function applyPartnerPricePreset(partnerId: string, presetIndex: number) {
    const preset = getPartnerPriceOptions(partnerId)[presetIndex];
    if (!preset) return;

    setPrintPlacement(preset.value);
    setPartnerPriceDrafts((current) => ({
      ...current,
      [partnerId]: String(preset.price),
    }));
  }

  function toggleTanviStep(stepKey: TanviStepKey, checked: boolean) {
    if (!selected) return;
    void updateQuote(
      selected,
      { tanviStepChecks: { [stepKey]: checked } },
      `step-${stepKey}`
    );
  }

  function updateWhatsappDraft(field: keyof WhatsappOrderDraft, value: string) {
    setWhatsappDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function loadSelectedIntoWhatsappDraft() {
    if (!selected) return;
    setWhatsappDraft({
      clientName: selected.clientName === "Client not set" ? "" : selected.clientName,
      phone: selected.phone,
      email: selected.email,
      product: selected.product === "Not set" ? "" : selected.product,
      quantity: selected.pieces ? String(selected.pieces) : "",
      color: selected.colors.join(", "),
      printMethod: selected.printMethod === "Not set" ? "" : selected.printMethod,
      deadline: selected.deadline === "No deadline" ? "" : selected.deadline,
      total: selected.total ? String(selected.total) : "",
      notes: selected.notes,
    });
    setShowWhatsappIntake(true);
  }

  async function createWhatsappOrder() {
    setCreatingWhatsappOrder(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/tanvi/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappDetails: whatsappDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.quote) {
        throw new Error(data?.error || "Could not create WhatsApp order.");
      }
      const quote = data.quote as TanviQuoteSummary;
      setQuotes((current) => [quote, ...current]);
      setSelectedId(quote.id);
      setWhatsappDraft(emptyWhatsappDraft);
      setShowWhatsappIntake(false);
      setNotice(`${quote.code} WhatsApp order created.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create WhatsApp order.");
    } finally {
      setCreatingWhatsappOrder(false);
    }
  }

  function saveWhatsappDetailsToSelected() {
    if (!selected) return;
    void updateQuote(
      selected,
      { whatsappDetails: whatsappDraft },
      "whatsapp-details"
    );
  }

  const pageClass = isDark
    ? "min-h-screen bg-slate-950 text-slate-100"
    : "min-h-screen bg-[#f5f7fb] text-slate-950";
  const panelClass = isDark
    ? "rounded-[24px] border border-white/10 bg-slate-900/80 shadow-[0_20px_60px_rgba(0,0,0,0.28)]"
    : "rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_46px_rgba(15,23,42,0.08)]";
  const mutedClass = isDark ? "text-slate-400" : "text-slate-500";
  const dividerClass = isDark ? "border-white/10" : "border-slate-200/70";
  const strongTextClass = isDark ? "text-slate-100" : "text-slate-950";
  const subtleCardClass = isDark
    ? "rounded-2xl border border-white/10 bg-slate-950/60"
    : "rounded-2xl border border-slate-200 bg-slate-50";
  const elevatedCardClass = isDark
    ? "rounded-2xl border border-white/10 bg-slate-950/50"
    : "rounded-2xl border border-slate-200 bg-white";
  const neutralBadgeClass = isDark
    ? "rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200"
    : "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700";
  const fieldClass = isDark
    ? "rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-300/10"
    : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-700 focus:ring-4 focus:ring-orange-700/10";
  const quietButtonClass = isDark
    ? "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/15 disabled:opacity-50"
    : "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";
  const darkButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50";
  const accentButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-50";
  const whatsappButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50";
  const heroClass = isDark
    ? "overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 text-white shadow-[0_28px_70px_rgba(2,6,23,0.24)]"
    : "overflow-hidden rounded-[28px] border border-slate-200 bg-white text-slate-950 shadow-[0_18px_45px_rgba(15,23,42,0.08)]";
  const heroBadgeClass = isDark
    ? "inline-flex items-center gap-2 rounded-full border border-orange-300/30 bg-orange-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-orange-100"
    : "inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-orange-900";
  const heroSubtextClass = isDark ? "text-slate-300" : "text-slate-600";
  const heroPrimaryButtonClass = isDark
    ? "inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50 disabled:opacity-60"
    : "inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60";
  const heroSecondaryButtonClass = isDark
    ? "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
    : "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";
  const sentButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 disabled:opacity-100";
  const workflowToneClass: Record<WorkflowTone, string> = {
    success: isDark
      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
      : "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: isDark
      ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
      : "border-amber-200 bg-amber-50 text-amber-900",
    danger: isDark
      ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
      : "border-rose-200 bg-rose-50 text-rose-900",
    info: isDark
      ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
      : "border-cyan-200 bg-cyan-50 text-cyan-900",
    neutral: isDark
      ? "border-white/10 bg-slate-950/60 text-slate-200"
      : "border-slate-200 bg-slate-50 text-slate-800",
  };
  const summaryCards = [
    {
      label: "All quotes",
      value: metrics.total,
      icon: FileText,
      card: isDark ? "border-cyan-300/20 bg-cyan-300/10" : "border-cyan-100 bg-cyan-50",
      iconClass: isDark ? "text-cyan-200" : "text-cyan-700",
    },
    {
      label: "Need routing",
      value: metrics.unrouted,
      icon: Route,
      card: isDark ? "border-orange-300/20 bg-orange-300/10" : "border-orange-100 bg-orange-50",
      iconClass: isDark ? "text-orange-200" : "text-orange-700",
    },
    {
      label: "Blockers",
      value: metrics.blockers,
      icon: AlertTriangle,
      card: isDark ? "border-rose-300/20 bg-rose-300/10" : "border-rose-100 bg-rose-50",
      iconClass: isDark ? "text-rose-200" : "text-rose-700",
    },
    {
      label: "Ready to print",
      value: metrics.ready,
      icon: CheckCircle2,
      card: isDark ? "border-emerald-300/20 bg-emerald-300/10" : "border-emerald-100 bg-emerald-50",
      iconClass: isDark ? "text-emerald-200" : "text-emerald-700",
    },
  ];
  const selectedHasArtwork = Boolean(selected?.artwork.length);
  const selectedHasOpenArtwork = Boolean(selected?.hasOpenArtwork);
  const selectedHasOffer = Boolean(selected?.partner.completionDays && selected.partner.price);
  const selectedCanPrint = Boolean(
    selected?.partner.requestStatus === "accepted" &&
      selected.partner.clientStatus === "confirmed_half_payment"
  );
  const selectedWorkflow: Array<{
    title: string;
    value: string;
    helper: string;
    icon: typeof ImageIcon;
    tone: WorkflowTone;
  }> = selected
    ? [
        {
          title: "Client onboarding",
          value: selected.phone || selected.email ? "Contact ready" : "Contact missing",
          helper: "Confirm client, product, quantity, deadline, and contact details.",
          icon: ClipboardCheck,
          tone: selected.phone || selected.email ? "success" : "warning",
        },
        {
          title: "Artwork",
          value: selectedHasOpenArtwork
            ? "Open and judge"
            : selectedHasArtwork
              ? "Email-only"
              : "Missing",
          helper: selectedHasOpenArtwork
            ? "Review logo quality before routing."
            : selectedHasArtwork
              ? "Ask Ryan to re-upload so partners can open it."
              : "Ask for logo before assigning production.",
          icon: ImageIcon,
          tone: selectedHasOpenArtwork
            ? "success"
            : selectedHasArtwork
              ? "warning"
              : "danger",
        },
        {
          title: "Route + prices",
          value: selectedHasOffer
            ? formatMoney(selected.partner.price, selected.currency)
            : selected.partner.visibleTo.length
              ? selected.partner.visibleLabel
              : "Choose partner",
          helper: "Compare partner prices, set placement, then move the order.",
          icon: CircleDollarSign,
          tone: selected.partner.visibleTo.length || selectedHasOffer ? "success" : "warning",
        },
        {
          title: "Client approval",
          value: PARTNER_CLIENT_STATUS_LABELS[selected.partner.clientStatus],
          helper: "Tanvi keeps approval and half payment visible.",
          icon: Clock3,
          tone:
            selected.partner.clientStatus === "confirmed_half_payment"
              ? "success"
              : selected.partner.clientStatus === "changes_needed"
                ? "warning"
                : "neutral",
        },
        {
          title: "Partner answer",
          value: PARTNER_DECISION_LABELS[selected.partner.requestStatus],
          helper:
            selected.partner.requestStatus === "needs_info"
              ? "Clear the blocker before print."
              : "Review days, price, and partner comments.",
          icon: CheckCircle2,
          tone:
            selected.partner.requestStatus === "accepted"
              ? "success"
              : selected.partner.requestStatus === "needs_info"
                ? "warning"
                : selected.partner.requestStatus === "rejected"
                  ? "danger"
                  : "neutral",
        },
        {
          title: "Print start",
          value: selectedCanPrint ? "Tanvi gate" : "Do not print",
          helper: "Ask Tanvi before any print work starts.",
          icon: LockKeyhole,
          tone: selectedCanPrint ? "info" : "neutral",
        },
      ]
    : [];
  const firstOpenStepIndex = selected
    ? TANVI_STEPS.findIndex((step) => !selected.tanviStepChecks[step.key])
    : -1;
  const currentStepIndex =
    firstOpenStepIndex === -1 && selected ? TANVI_STEPS.length - 1 : firstOpenStepIndex;
  const checkedStepCount = selected
    ? TANVI_STEPS.filter((step) => selected.tanviStepChecks[step.key]).length
    : 0;
  const progressPercent = Math.round((checkedStepCount / TANVI_STEPS.length) * 100);
  const allActivePartnersRouted = Boolean(
    selected &&
      activePartners.length >= 2 &&
      activePartners.every((partner) => selected.partner.visibleTo.includes(partner.id))
  );
  const selectedDeadlineInsight = selected ? getDeadlineInsight(selected.deadline) : null;
  const selectedProductionInsight = selected
    ? getProductionStageInsight(selected.partner.productionStatus)
    : null;
  const partnerInsightMax = Math.max(
    1,
    ...partnerLoads.flatMap(({ count, accepted }) => [count, accepted])
  );
  const partnerVisibleTotal = partnerLoads.reduce((total, { count }) => total + count, 0);
  const partnerAcceptedTotal = partnerLoads.reduce((total, { accepted }) => total + accepted, 0);
  const partnerAcceptedPercent = partnerVisibleTotal
    ? Math.round((partnerAcceptedTotal / partnerVisibleTotal) * 100)
    : 0;

  function getStepState(stepKey: TanviStepKey) {
    const index = TANVI_STEPS.findIndex((step) => step.key === stepKey);
    const checked = Boolean(selected?.tanviStepChecks[stepKey]);
    const current = Boolean(selected && index === currentStepIndex && !checked);
    return { checked, current, upcoming: Boolean(selected && index > currentStepIndex && !checked) };
  }

  function getStepPanelClass(stepKey: TanviStepKey) {
    const state = getStepState(stepKey);
    const base =
      "overflow-hidden rounded-[26px] border transition-all duration-200";
    if (state.checked) {
      return `${base} ${
        isDark
          ? "border-white/10 bg-black/80 opacity-80 shadow-none hover:opacity-90"
          : "border-slate-950 bg-slate-950 text-white opacity-75 shadow-none hover:opacity-90"
      }`;
    }
    if (state.current) {
      return `${base} ${
        isDark
          ? "border-orange-300/50 bg-slate-900 shadow-[0_0_0_4px_rgba(249,115,22,0.16),0_22px_60px_rgba(0,0,0,0.28)]"
          : "border-orange-300 bg-white shadow-[0_0_0_5px_rgba(249,115,22,0.14),0_20px_55px_rgba(15,23,42,0.1)]"
      }`;
    }
    return `${base} ${
      isDark
        ? "border-white/10 bg-slate-900/70"
        : "border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
    }`;
  }

  function getStepSurfaceClass(stepKey: TanviStepKey, fallback: string) {
    if (!getStepState(stepKey).checked) return fallback;
    return isDark
      ? "rounded-2xl border border-white/10 bg-black/50 text-slate-200"
      : "rounded-2xl border border-slate-800 bg-slate-900 text-slate-100";
  }

  function getStepTextClass(stepKey: TanviStepKey, fallback: string) {
    if (!getStepState(stepKey).checked) return fallback;
    return isDark ? "text-slate-200" : "text-slate-100";
  }

  function getStepMutedClass(stepKey: TanviStepKey) {
    if (!getStepState(stepKey).checked) return mutedClass;
    return isDark ? "text-slate-400" : "text-slate-400";
  }

  function renderStepHeader({
    stepKey,
    stepNumber,
    title,
    description,
    badge,
  }: {
    stepKey: TanviStepKey;
    stepNumber: number;
    title: string;
    description: string;
    badge?: ReactNode;
  }) {
    const state = getStepState(stepKey);
    const headerTextClass = state.checked ? "text-slate-100" : strongTextClass;
    const headerMutedClass = state.checked ? "text-slate-400" : mutedClass;
    return (
      <div
        className={`flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:gap-4 sm:p-5 ${
          state.checked
            ? isDark
              ? "border-white/10 bg-black/30"
              : "border-slate-800 bg-black/40"
            : dividerClass
        }`}
      >
        <div className="flex min-w-0 gap-4">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold sm:h-12 sm:w-12 ${
              state.checked
                ? isDark
                  ? "bg-cyan-300/10 text-cyan-100"
                  : "bg-slate-800 text-white"
                : state.current
                  ? "bg-orange-500 text-white"
                  : isDark
                    ? "bg-slate-950 text-slate-300"
                    : "bg-slate-100 text-slate-600"
            }`}
          >
            {stepNumber}
          </span>
          <div className="min-w-0">
            <p
              className={`text-xs font-semibold uppercase tracking-[0.16em] ${
                state.checked ? "text-slate-400" : "text-cyan-700"
              }`}
            >
              Step {stepNumber}
            </p>
            <h3 className={`mt-1 text-lg font-semibold tracking-tight sm:text-xl ${headerTextClass}`}>
              {title}
            </h3>
            <p className={`mt-1.5 max-w-3xl text-sm leading-6 sm:mt-2 ${headerMutedClass}`}>
              {description}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          {badge}
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
              state.checked
                ? isDark
                  ? "border-white/10 bg-white/10 text-slate-200"
                  : "border-slate-700 bg-slate-900 text-slate-200"
                : state.current
                  ? "border-orange-300 bg-orange-50 text-orange-900"
                  : isDark
                    ? "border-white/10 bg-slate-950/60 text-slate-300"
                    : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            <input
              type="checkbox"
              checked={state.checked}
              disabled={saving === `step-${stepKey}`}
              onChange={(event) => toggleTanviStep(stepKey, event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-orange-500"
            />
            {state.checked ? "Checked" : state.current ? "Current" : "Mark done"}
          </label>
        </div>
      </div>
    );
  }

  return (
    <main className={pageClass}>
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-2 py-3 sm:gap-5 sm:px-6 sm:py-4 lg:px-8">
        <section className={heroClass}>
          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_32rem] lg:p-7">
            <div>
              <div className={heroBadgeClass}>
                <ShieldCheck className="h-4 w-4" />
                Production Manager
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:mt-5 sm:text-4xl">
                {manager.name} command desk
              </h1>
              <p className={`mt-3 max-w-3xl text-sm leading-6 sm:mt-4 sm:text-base ${heroSubtextClass}`}>
                Fast phone workspace for quotations, WhatsApp orders, partner handoff, blockers, and print-start decisions.
              </p>
              <div className="mt-5 flex flex-wrap gap-2 sm:mt-6">
                <button
                  type="button"
                  onClick={loadDesk}
                  disabled={loading}
                  className={heroPrimaryButtonClass}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setShowQueue((current) => !current)}
                  className={heroSecondaryButtonClass}
                >
                  {showQueue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showQueue ? "Hide quote list" : "Show quote list"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWhatsappDraft(emptyWhatsappDraft);
                    setShowWhatsappIntake((current) => !current);
                  }}
                  className={whatsappButtonClass}
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp order
                </button>
                <span className={heroSecondaryButtonClass}>
                  <Sparkles className="h-4 w-4 text-amber-300" />
                  Password protected
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {summaryCards.map(({ label, value, icon: Icon, card, iconClass }) => (
                <div key={label} className={`rounded-2xl border p-3 sm:p-4 ${card}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-xs sm:tracking-[0.14em] ${mutedClass}`}>
                      {label}
                    </p>
                    <Icon className={`h-4 w-4 ${iconClass}`} />
                  </div>
                  <div className="mt-2 text-2xl font-semibold sm:mt-3 sm:text-3xl">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {notice ? (
          <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            {notice}
          </div>
        ) : null}

        {error ? (
          <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        ) : null}

        {showWhatsappIntake ? (
          <section className={`${panelClass} overflow-hidden`}>
            <div className={`flex flex-wrap items-center justify-between gap-3 border-b p-4 ${dividerClass}`}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  WhatsApp order
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">
                  Add or update the details Tanvi receives in chat
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected ? (
                  <button type="button" onClick={loadSelectedIntoWhatsappDraft} className={quietButtonClass}>
                    <ClipboardCheck className="h-4 w-4" />
                    Use selected
                  </button>
                ) : null}
                <button type="button" onClick={() => setShowWhatsappIntake(false)} className={quietButtonClass}>
                  <EyeOff className="h-4 w-4" />
                  Hide
                </button>
              </div>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["clientName", "Client name", "Name from WhatsApp"],
                ["phone", "Phone", "+230..."],
                ["email", "Email", "Optional"],
                ["product", "Product", "T-shirt / polo / hoodie"],
                ["quantity", "Quantity", "No. of pieces"],
                ["color", "Colour", "Black, white..."],
                ["printMethod", "Print", "DTF, embroidery..."],
                ["deadline", "Deadline", "Date or urgent note"],
                ["total", "Total", "Optional amount"],
              ].map(([field, label, placeholder]) => (
                <label key={field} className={`text-xs font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                  {label}
                  <input
                    value={whatsappDraft[field as keyof WhatsappOrderDraft]}
                    onChange={(event) =>
                      updateWhatsappDraft(field as keyof WhatsappOrderDraft, event.target.value)
                    }
                    placeholder={placeholder}
                    className={`mt-2 w-full normal-case tracking-normal ${fieldClass}`}
                  />
                </label>
              ))}
              <label className={`md:col-span-2 xl:col-span-4 text-xs font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                Notes from WhatsApp
                <textarea
                  value={whatsappDraft.notes}
                  onChange={(event) => updateWhatsappDraft("notes", event.target.value)}
                  placeholder="Paste the client request, delivery note, artwork reminder, or price discussion."
                  rows={3}
                  className={`mt-2 w-full resize-none normal-case tracking-normal ${fieldClass}`}
                />
              </label>
            </div>
            <div className={`flex flex-col gap-2 border-t p-4 sm:flex-row sm:justify-end ${dividerClass}`}>
              {selected ? (
                <button
                  type="button"
                  disabled={Boolean(saving) || creatingWhatsappOrder}
                  onClick={saveWhatsappDetailsToSelected}
                  className={quietButtonClass}
                >
                  <Save className="h-4 w-4" />
                  {saving === "whatsapp-details" ? "Saving..." : `Update ${selected.code}`}
                </button>
              ) : null}
              <button
                type="button"
                disabled={creatingWhatsappOrder || Boolean(saving)}
                onClick={createWhatsappOrder}
                className={whatsappButtonClass}
              >
                <Plus className="h-4 w-4" />
                {creatingWhatsappOrder ? "Creating..." : "Create WhatsApp order"}
              </button>
            </div>
          </section>
        ) : null}

        <section className={showQueue ? "grid gap-5 xl:grid-cols-[25rem_minmax(0,1fr)]" : "grid gap-5"}>
          {showQueue ? (
            <aside className={`${panelClass} overflow-hidden`}>
              <div className={`flex items-center justify-between gap-3 border-b p-4 ${dividerClass}`}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
                    Quote queue
                  </p>
                  <p className={`mt-1 text-sm ${mutedClass}`}>
                    {filteredQuotes.length} in this view
                  </p>
                </div>
                <button type="button" onClick={() => setShowQueue(false)} className={quietButtonClass}>
                  <EyeOff className="h-4 w-4" />
                  Focus
                </button>
              </div>
              <div className={`border-b p-4 ${dividerClass}`}>
              <label
                className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${
                  isDark
                    ? "border-white/10 bg-slate-950 text-slate-300"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                <Search className="h-4 w-4" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search quote, client, product"
                  className={`min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 ${
                    isDark ? "text-slate-100" : "text-slate-950"
                  }`}
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["all", "All", metrics.total],
                  ["unrouted", "Route", metrics.unrouted],
                  ["waiting", "Waiting", quotes.filter((quote) => quote.partner.requestStatus === "pending").length],
                  ["blocked", "Blocked", metrics.blockers],
                  ["ready", "Ready", metrics.ready],
                  ["active", "Active", metrics.active],
                ].map(([key, label, count]) => (
                  <button
                    key={String(key)}
                    type="button"
                    onClick={() => setFilter(key as QueueFilter)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      filter === key
                        ? "border-cyan-700 bg-cyan-700 text-white"
                        : isDark
                          ? "border-white/10 bg-white/10 text-slate-200 hover:bg-white/15"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                    }`}
                  >
                    <span className="uppercase tracking-[0.12em]">{label as string}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        filter === key
                          ? "bg-white/20 text-white"
                          : isDark
                            ? "bg-slate-950 text-slate-200"
                            : "bg-white text-slate-700"
                      }`}
                    >
                      {String(count)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[calc(100vh-18rem)] overflow-y-auto p-3">
              {filteredQuotes.length ? (
                <div className="space-y-2">
                  {filteredQuotes.map((quote) => {
                    const active = selected?.id === quote.id;
                    return (
                      <button
                        key={quote.id}
                        type="button"
                        onClick={() => setSelectedId(quote.id)}
                        className={`w-full rounded-2xl border p-3 text-left transition ${
                          active
                            ? "border-cyan-500 bg-cyan-50 text-slate-950 shadow-sm"
                            : isDark
                              ? "border-white/10 bg-slate-950/50 text-slate-100 hover:bg-slate-900"
                              : "border-slate-200 bg-white text-slate-950 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-mono text-xs font-semibold text-cyan-700">
                              {quote.code}
                            </p>
                            <p className="mt-1 truncate text-sm font-semibold">
                              {quote.clientName}
                            </p>
                          </div>
                          <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${statusTone(quote.partner.requestStatus)}`}>
                            {PARTNER_DECISION_LABELS[quote.partner.requestStatus]}
                          </span>
                        </div>
                        <div className={`mt-3 grid grid-cols-2 gap-2 text-xs ${active ? "text-slate-600" : mutedClass}`}>
                          <span className="truncate">{quote.product}</span>
                          <span className="truncate text-right">{quote.partner.visibleLabel}</span>
                          <span>{quote.pieces ? `${quote.pieces} pcs` : "Qty n/a"}</span>
                          <span className="text-right">{formatRelative(quote.createdAt)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className={`rounded-2xl border border-dashed p-8 text-center text-sm ${mutedClass}`}>
                  No quotations match this view.
                </div>
              )}
            </div>
          </aside>
          ) : null}

          {selected ? (
            <section className="grid gap-5">
              <div className={`${panelClass} p-4 sm:p-5`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
                      {selected.code}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                      {selected.clientName}
                    </h2>
                    <div className={`mt-3 flex flex-wrap gap-2 text-xs font-semibold ${mutedClass}`}>
                      <span>{selected.phone || "No phone"}</span>
                      <span>{selected.email || "No email"}</span>
                      <span>{formatDateTime(selected.createdAt)}</span>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:min-w-[24rem] sm:grid-cols-2">
                    <span className={`rounded-xl border px-3 py-2 text-xs font-semibold ${statusTone(selected.partner.requestStatus)}`}>
                      Partner: {PARTNER_DECISION_LABELS[selected.partner.requestStatus]}
                    </span>
                    <span className={`rounded-xl border px-3 py-2 text-xs font-semibold ${statusTone(selected.partner.clientStatus)}`}>
                      Client: {PARTNER_CLIENT_STATUS_LABELS[selected.partner.clientStatus]}
                    </span>
                    <span className={neutralBadgeClass}>
                      Production: {PARTNER_PRODUCTION_STATUS_LABELS[selected.partner.productionStatus]}
                    </span>
                    <span className={neutralBadgeClass}>
                      Total: {formatMoney(selected.total, selected.currency)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 md:grid-cols-4">
                  {[
                    ["Product", selected.product],
                    ["Quantity", selected.pieces ? `${selected.pieces} pcs` : "Not set"],
                    ["Print", selected.printMethod],
                    ["Deadline", selected.deadline],
                    ["Placement", PARTNER_PRINT_PLACEMENT_LABELS[selected.partner.printPlacement]],
                    ["Artwork", selected.artworkCount ? `${selected.artworkCount} file(s)` : "No artwork"],
                    ["Route", selected.partner.visibleLabel],
                    ["Updated", formatRelative(selected.updatedAt)],
                  ].map(([label, value]) => (
                    <div key={label} className={`${subtleCardClass} px-3 py-2.5 sm:py-3`}>
                      <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-[11px] sm:tracking-[0.14em] ${mutedClass}`}>
                        {label}
                      </p>
                      <p className={`mt-1 truncate text-sm font-semibold ${strongTextClass}`}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`${panelClass} overflow-hidden`}>
                <div className={`flex flex-wrap items-center justify-between gap-3 border-b p-5 ${dividerClass}`}>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
                      Tanvi progress
                    </p>
                    <h3 className="mt-1 text-xl font-semibold tracking-tight">
                      {checkedStepCount} of {TANVI_STEPS.length} checkpoints complete
                    </h3>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      selectedCanPrint
                        ? workflowToneClass.info
                        : selectedHasOpenArtwork && selected.partner.visibleTo.length
                          ? workflowToneClass.success
                          : workflowToneClass.warning
                    }`}
                  >
                    {selectedCanPrint
                      ? "Tanvi print gate"
                      : selectedHasOpenArtwork && selected.partner.visibleTo.length
                        ? "Moving"
                        : "Needs decision"}
                  </span>
                </div>
                <div className="p-4">
                  <div className={`h-3 overflow-hidden rounded-full ${isDark ? "bg-slate-950" : "bg-slate-100"}`}>
                    <div
                      className="h-full rounded-full bg-cyan-600 transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                    {selectedWorkflow.map((step, index) => {
                      const StepIcon = step.icon;
                      const stepMeta = TANVI_STEPS[index];
                      const checked = stepMeta ? selected.tanviStepChecks[stepMeta.key] : false;
                      return (
                        <div
                          key={step.title}
                          className={`rounded-2xl border p-4 ${
                            checked
                              ? isDark
                                ? "border-white/10 bg-slate-950 text-slate-300"
                                : "border-slate-800 bg-slate-900 text-slate-200"
                              : workflowToneClass[step.tone]
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70 text-current">
                              <StepIcon className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">
                                Step {index + 1}
                              </p>
                              <h4 className="mt-1 text-sm font-semibold text-current">
                                {step.title}
                              </h4>
                              <p className="mt-2 text-sm font-semibold">
                                {step.value}
                              </p>
                              <p className="mt-2 text-xs leading-5 opacity-75">
                                {step.helper}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className={getStepPanelClass("client_onboarding")}>
                {renderStepHeader({
                  stepKey: "client_onboarding",
                  stepNumber: 1,
                  title: "Client onboarding",
                  description:
                    "Tanvi checks the client, contact details, garment, quantity, deadline, and notes before touching production.",
                  badge: (
                    <span
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        selected.phone || selected.email
                          ? workflowToneClass.success
                          : workflowToneClass.warning
                      }`}
                    >
                      {selected.phone || selected.email ? "Client reachable" : "Need contact"}
                    </span>
                  ),
                })}
                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {[
                      ["Client", selected.clientName],
                      ["Company", selected.clientCompany || "Not set"],
                      ["Phone", selected.phone || "Not set"],
                      ["Email", selected.email || "Not set"],
                      ["Source", selected.source],
                      ["Created", formatDateTime(selected.createdAt)],
                      ["Product", selected.product],
                      ["Garments", selected.garmentSummary],
                      ["Quantity", selected.pieces ? `${selected.pieces} pcs` : "Not set"],
                      ["Colours", selected.colors.length ? selected.colors.join(", ") : "Not set"],
                      ["Print method", selected.printMethod],
                      ["Deadline", selected.deadline],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className={`${getStepSurfaceClass("client_onboarding", subtleCardClass)} px-3 py-3`}
                      >
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${getStepMutedClass("client_onboarding")}`}>
                          {label}
                        </p>
                        <p className={`mt-1 break-words text-sm font-semibold ${getStepTextClass("client_onboarding", strongTextClass)}`}>
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className={`${getStepSurfaceClass("client_onboarding", subtleCardClass)} p-4`}>
                    <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${getStepMutedClass("client_onboarding")}`}>
                      Client notes
                    </p>
                    <p className={`mt-3 whitespace-pre-wrap text-sm font-medium leading-6 ${getStepTextClass("client_onboarding", strongTextClass)}`}>
                      {selected.notes || "No client notes shared."}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <span className={`${getStepSurfaceClass("client_onboarding", neutralBadgeClass)} px-3 py-2 text-xs font-semibold`}>
                        Quote total: {formatMoney(selected.total, selected.currency)}
                      </span>
                      <span className={`${getStepSurfaceClass("client_onboarding", neutralBadgeClass)} px-3 py-2 text-xs font-semibold`}>
                        Route: {selected.partner.visibleLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={getStepPanelClass("artwork")}>
                {renderStepHeader({
                  stepKey: "artwork",
                  stepNumber: 2,
                  title: "Artwork / logo",
                  description:
                    "Tanvi can open the files, inspect the logo size and detail, then send the order to the best production desk.",
                  badge: (
                    <span className={neutralBadgeClass}>
                      {selected.artworkCount ? `${selected.artworkCount} file(s)` : "No file"}
                    </span>
                  ),
                })}

                {selected.artwork.length ? (
                  <div className="grid gap-4 p-4 lg:grid-cols-2">
                    {selected.artwork.map((attachment, index) => {
                      const isImage = isArtworkImage(attachment);
                      const isPdf = isArtworkPdf(attachment);
                      const downloadHref = getArtworkDownloadHref(attachment, index);
                      const artworkChecked = getStepState("artwork").checked;
                      const artworkSurfaceClass = getStepSurfaceClass("artwork", elevatedCardClass);
                      const artworkMutedClass = getStepMutedClass("artwork");
                      const artworkTextClass = getStepTextClass("artwork", strongTextClass);
                      const artworkDividerClass = artworkChecked
                        ? isDark
                          ? "border-white/10"
                          : "border-slate-800"
                        : dividerClass;
                      const artworkPreviewShellClass = artworkChecked
                        ? isDark
                          ? "bg-black p-3"
                          : "bg-slate-950 p-3"
                        : "bg-white p-3";
                      const artworkPreviewClass = artworkChecked
                        ? "h-[22rem] w-full rounded-2xl border border-slate-800 bg-black object-contain sm:h-[28rem]"
                        : "h-[22rem] w-full rounded-2xl border border-slate-200 bg-white object-contain sm:h-[28rem]";
                      return (
                        <article key={`${attachment.url || attachment.filename}-${index}`} className={`${artworkSurfaceClass} overflow-hidden`}>
                          <div className={`flex flex-wrap items-start justify-between gap-3 border-b p-4 ${artworkDividerClass}`}>
                            <div className="min-w-0">
                              <p className={`truncate text-base font-semibold ${artworkTextClass}`}>
                                {attachment.filename}
                              </p>
                              <p className={`mt-1 text-xs ${artworkMutedClass}`}>
                                {attachment.label}
                                {attachment.quantity ? ` - Qty ${attachment.quantity}` : ""}
                                {formatFileSize(attachment.size) ? ` - ${formatFileSize(attachment.size)}` : ""}
                              </p>
                            </div>
                            {attachment.url ? (
                              <div className="flex shrink-0 items-center gap-2">
                                <a
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={quietButtonClass}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  Open
                                </a>
                                <a
                                  href={downloadHref}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
                                  aria-label={`Download ${attachment.filename || "artwork"}`}
                                  title="Download artwork"
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                              </div>
                            ) : null}
                          </div>

                          {isImage ? (
                            <div className={artworkPreviewShellClass}>
                              <img
                                src={attachment.url}
                                alt={attachment.filename}
                                className={artworkPreviewClass}
                                loading="lazy"
                              />
                            </div>
                          ) : isPdf ? (
                            <div className={artworkPreviewShellClass}>
                              <iframe
                                src={attachment.url}
                                title={`Preview ${attachment.filename || "PDF artwork"}`}
                                className={
                                  artworkChecked
                                    ? "h-[28rem] w-full rounded-2xl border border-slate-800 bg-black"
                                    : "h-[28rem] w-full rounded-2xl border border-slate-200 bg-white"
                                }
                              />
                            </div>
                          ) : attachment.url ? (
                            <div className="p-4">
                              <div className={`grid min-h-48 place-items-center text-center ${getStepSurfaceClass("artwork", subtleCardClass)} p-6`}>
                                <div>
                                  <FileText className="mx-auto h-8 w-8 text-cyan-700" />
                                  <p className={`mt-3 text-sm font-semibold ${artworkTextClass}`}>
                                    Preview unavailable
                                  </p>
                                  <p className={`mt-1 text-xs ${artworkMutedClass}`}>
                                    Open the file to inspect this artwork.
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-4">
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                                Email-only artwork. Ask Ryan to re-upload it in Quotation Approval so Tanvi and the partner can open it here.
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-5 py-8 text-center text-sm font-semibold text-amber-900">
                      No artwork shared yet. Tanvi should not move this to print until Ryan gets the logo from the client.
                    </div>
                  </div>
                )}
              </div>

              <div className={getStepPanelClass("route_prices")}>
                {renderStepHeader({
                  stepKey: "route_prices",
                  stepNumber: 3,
                  title: "Route, placement, partner prices",
                  description:
                    "Compare each partner, set the print placement, edit the partner price, then move the order to the right desk.",
                  badge: <Route className="h-5 w-5 text-cyan-700" />,
                })}
                <div className="p-5">

                  <div className="grid gap-4">
                    <label className={`text-xs font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                      Current route and selected placement
                      <div className={`mt-2 flex min-h-[42px] items-center rounded-xl px-3 py-2 normal-case tracking-normal ${subtleCardClass}`}>
                        <span className={`text-sm font-semibold ${strongTextClass}`}>
                          {selected.partner.visibleLabel} / {PARTNER_PRINT_PLACEMENT_LABELS[printPlacement]}
                        </span>
                      </div>
                    </label>
                  </div>

                  <div className="mt-5 grid gap-3 xl:grid-cols-2">
                    {activePartners.map((partner) => {
                      const response = selected.partner.responses.find(
                        (entry) => entry.partnerId === partner.id
                      );
                      const isRouted = selected.partner.visibleTo.includes(partner.id);
                      const priceDraft = partnerPriceDrafts[partner.id] || "";
                      const priceValue = Number(priceDraft);
                      const partnerPresetOptions = getPartnerPriceOptions(partner.id);
                      const nextPrice =
                        priceDraft.trim() && Number.isFinite(priceValue) && priceValue > 0
                          ? priceValue
                          : null;

                      return (
                        <article key={partner.id} className={`${elevatedCardClass} p-4`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className={`text-base font-semibold ${strongTextClass}`}>
                                {partner.name}
                              </p>
                              <p className={`mt-1 text-xs ${mutedClass}`}>
                                {isRouted ? "Currently seeing this order" : "Available partner"}
                              </p>
                            </div>
                            <span
                              className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                                response?.requestStatus
                                  ? statusTone(response.requestStatus)
                                  : workflowToneClass.neutral
                              }`}
                            >
                              {response?.requestStatus
                                ? PARTNER_DECISION_LABELS[response.requestStatus]
                                : "No reply"}
                            </span>
                          </div>

                          <label className={`mt-4 block text-xs font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                            Price preset
                            <select
                              defaultValue=""
                              onChange={(event) => {
                                const presetIndex = Number(event.target.value);
                                if (Number.isInteger(presetIndex)) {
                                  applyPartnerPricePreset(partner.id, presetIndex);
                                }
                              }}
                              className={`mt-2 w-full normal-case tracking-normal ${fieldClass}`}
                            >
                              <option value="">Select placement and preset price</option>
                              {partnerPresetOptions.map((option, index) => (
                                <option key={`${partner.id}-${option.label}-${option.price}`} value={index}>
                                  {option.label} Rs {option.price}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <label className={`text-xs font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                              Partner price
                              <div className="mt-2 flex items-center gap-2">
                                <span className={`inline-flex min-w-12 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-semibold leading-none ${isDark ? "border-white/10 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                                  {selected.currency}
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  value={priceDraft}
                                  onChange={(event) =>
                                    setPartnerPriceDrafts((current) => ({
                                      ...current,
                                      [partner.id]: event.target.value,
                                    }))
                                  }
                                  className={`w-full normal-case tracking-normal ${fieldClass}`}
                                  placeholder="0"
                                />
                              </div>
                            </label>
                            <button
                              type="button"
                              disabled={Boolean(saving)}
                              onClick={() =>
                                updateQuote(
                                  selected,
                                  {
                                    printPlacement,
                                    partnerPrices: {
                                      [partner.id]: { price: nextPrice },
                                    },
                                  },
                                  `price-${partner.id}`
                                )
                              }
                              className={quietButtonClass}
                            >
                              <Save className="h-4 w-4" />
                              {saving === `price-${partner.id}` ? "Saving..." : "Save price"}
                            </button>
                          </div>

                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            <div className={`${subtleCardClass} px-3 py-2`}>
                              <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${mutedClass}`}>
                                Last saved
                              </p>
                              <p className={`mt-1 text-sm font-semibold ${strongTextClass}`}>
                                {formatMoney(response?.price || null, selected.currency)}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={Boolean(saving) || isRouted}
                              onClick={() =>
                                updateQuote(
                                  selected,
                                  {
                                    partnerIds: [partner.id],
                                    visibleFields,
                                    printPlacement,
                                  },
                                  partner.id
                                )
                              }
                              className={
                                isRouted
                                  ? sentButtonClass
                                  : partner.id === activePartners[0]?.id
                                    ? accentButtonClass
                                    : darkButtonClass
                              }
                            >
                              {isRouted ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                              {isRouted
                                ? `Already sent to ${partner.name}`
                                : saving === partner.id
                                  ? "Moving..."
                                  : `Move to ${partner.name}`}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={Boolean(saving) || activePartners.length < 2 || allActivePartnersRouted}
                    onClick={() =>
                      updateQuote(
                        selected,
                        {
                          partnerIds: activePartners.map((partner) => partner.id),
                          visibleFields,
                          printPlacement,
                        },
                        "all"
                      )
                    }
                    className={`mt-3 w-full ${allActivePartnersRouted ? sentButtonClass : quietButtonClass}`}
                  >
                    {allActivePartnersRouted ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Users className="h-4 w-4" />
                    )}
                    {allActivePartnersRouted
                      ? "Already sent to all active partners"
                      : saving === "all"
                        ? "Sending..."
                        : "Send to all active partners"}
                  </button>

                  <div className="mt-5">
                    <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                      Fields shared with partners
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {PARTNER_VISIBLE_FIELD_OPTIONS.map((field) => (
                        <label
                          key={field.key}
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2 text-sm transition ${
                            visibleFields.includes(field.key)
                              ? isDark
                                ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                                : "border-cyan-300 bg-cyan-50 text-cyan-950"
                              : isDark
                                ? "border-white/10 bg-slate-950 text-slate-200"
                                : "border-slate-200 bg-white text-slate-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={visibleFields.includes(field.key)}
                            onChange={() => toggleVisibleField(field.key)}
                            className="mt-1"
                          />
                          <span>
                            <span className="block font-semibold">{field.label}</span>
                            <span className="mt-0.5 block text-xs opacity-75">{field.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className={getStepPanelClass("client_approval")}>
                {renderStepHeader({
                  stepKey: "client_approval",
                  stepNumber: 4,
                  title: "Client approval",
                  description:
                    "Track quotation approval, payment readiness, missing information, and client-facing notes before print starts.",
                  badge: <Clock3 className="h-5 w-5 text-amber-600" />,
                })}
                <div className="p-5">

                  <div className="mt-5">
                    <label className={`text-xs font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                      Client status
                      <select
                        value={selected.partner.clientStatus}
                        onChange={(event) =>
                          updateQuote(
                            selected,
                            { clientStatus: event.target.value as PartnerClientStatus },
                            "client-status"
                          )
                        }
                        disabled={Boolean(saving)}
                        className={`mt-2 w-full normal-case tracking-normal ${fieldClass}`}
                      >
                        {PARTNER_CLIENT_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-5 space-y-3">
                    <div className={`${subtleCardClass} p-3`}>
                      <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                        Missing information
                      </p>
                      <p className={`mt-2 whitespace-pre-wrap text-sm font-medium ${strongTextClass}`}>
                        {selected.partner.missingInformation || "No blocker from partner."}
                      </p>
                    </div>
                    <div className={`${subtleCardClass} p-3`}>
                      <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                        Partner comments
                      </p>
                      <p className={`mt-2 whitespace-pre-wrap text-sm font-medium ${strongTextClass}`}>
                        {selected.partner.comments || "No comments yet."}
                      </p>
                    </div>
                    {selected.notes ? (
                      <div className={`${subtleCardClass} p-3`}>
                        <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                          Client notes
                        </p>
                        <p className={`mt-2 whitespace-pre-wrap text-sm font-medium ${strongTextClass}`}>
                          {selected.notes}
                        </p>
                      </div>
                    ) : null}
                  </div>

                </div>
              </div>

              <div className={getStepPanelClass("partner_answer")}>
                {renderStepHeader({
                  stepKey: "partner_answer",
                  stepNumber: 5,
                  title: "Partner answer",
                  description:
                    "Review each partner reply, completion days, price, blockers, and production comments in one clean place.",
                  badge: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
                })}
                <div className="space-y-2 p-5">
                  {selected.partner.responses.length ? (
                    selected.partner.responses.map((response) => (
                      <div key={response.partnerId} className={`${elevatedCardClass} p-3`}>
                        <div className="flex items-center justify-between gap-3">
                          <p className={`font-semibold ${strongTextClass}`}>{response.partnerName}</p>
                          <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${statusTone(response.requestStatus)}`}>
                            {PARTNER_DECISION_LABELS[response.requestStatus]}
                          </span>
                        </div>
                        <div className={`mt-3 grid grid-cols-3 gap-2 text-xs ${mutedClass}`}>
                          <span>{response.completionDays ? `${response.completionDays} days` : "Days n/a"}</span>
                          <span>{response.price ? `Rs ${response.price}` : "Price n/a"}</span>
                          <span>{formatRelative(response.updatedAt)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className={`rounded-2xl border border-dashed p-5 text-center text-sm ${mutedClass}`}>
                      Waiting for partner response.
                    </div>
                  )}
                </div>
              </div>

              <div className={getStepPanelClass("print_start")}>
                {renderStepHeader({
                  stepKey: "print_start",
                  stepNumber: 6,
                  title: "Print start",
                  description:
                    "Final gate: Ryan supply, printing movement, deadline pressure, and Tanvi's print-start decision.",
                  badge: (
                    <span className={selectedCanPrint ? workflowToneClass.info : neutralBadgeClass}>
                      {selectedCanPrint ? "Ready for Tanvi gate" : "Do not print yet"}
                    </span>
                  ),
                })}
                <div className="grid gap-4 p-5">
                  <div className="grid gap-4">
                    <div className={`${elevatedCardClass} overflow-hidden`}>
                      <div className={`border-b p-4 ${dividerClass}`}>
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                          Current production movement
                        </p>
                        <h4 className={`mt-2 text-xl font-semibold ${strongTextClass}`}>
                          {selectedProductionInsight?.printing || "Printing not started"}
                        </h4>
                      </div>
                      <div className="grid gap-3 p-4 md:grid-cols-3">
                        <div className={`${subtleCardClass} p-4`}>
                          <PackageCheck className="h-5 w-5 text-orange-600" />
                          <p className={`mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                            Ryan supply
                          </p>
                          <p className={`mt-2 text-sm font-semibold leading-5 ${strongTextClass}`}>
                            {selectedProductionInsight?.supply || "T-shirt supply not confirmed yet"}
                          </p>
                        </div>
                        <div className={`${subtleCardClass} p-4`}>
                          <Printer className="h-5 w-5 text-cyan-700" />
                          <p className={`mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                            Print status
                          </p>
                          <p className={`mt-2 text-sm font-semibold leading-5 ${strongTextClass}`}>
                            {PARTNER_PRODUCTION_STATUS_LABELS[selected.partner.productionStatus]}
                          </p>
                        </div>
                        <div className={`${subtleCardClass} p-4`}>
                          <TimerReset className="h-5 w-5 text-amber-600" />
                          <p className={`mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                            Deadline
                          </p>
                          <p className={`mt-2 text-sm font-semibold leading-5 ${strongTextClass}`}>
                            {selectedDeadlineInsight?.label || "No deadline shared"}
                          </p>
                          <p className={`mt-1 text-xs ${mutedClass}`}>
                            {selectedDeadlineInsight?.helper || "No countdown available."}
                          </p>
                        </div>
                      </div>
                      <div className="px-4 pb-4">
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem]">
                          <div className={`${subtleCardClass} p-4`}>
                            <div className="flex items-center justify-between gap-3">
                              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                                Production progress
                              </p>
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${workflowToneClass[selectedProductionInsight?.tone || "neutral"]}`}>
                                {selectedProductionInsight?.progress || 0}%
                              </span>
                            </div>
                            <div className={`mt-3 h-3 overflow-hidden rounded-full ${isDark ? "bg-slate-950" : "bg-slate-100"}`}>
                              <div
                                className="h-full rounded-full bg-orange-500 transition-all"
                                style={{ width: `${selectedProductionInsight?.progress || 0}%` }}
                              />
                            </div>
                            <p className={`mt-3 text-sm leading-6 ${mutedClass}`}>
                              {selectedProductionInsight?.helper}
                            </p>
                          </div>
                          <div className={`rounded-2xl border p-4 ${selectedCanPrint ? workflowToneClass.info : workflowToneClass.warning}`}>
                            <LockKeyhole className="h-5 w-5" />
                            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em]">
                              Tanvi gate
                            </p>
                            <p className="mt-2 text-sm font-semibold leading-5">
                              Ask Tanvi before any print work starts.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={`${elevatedCardClass} p-4`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                            Deadline pressure
                          </p>
                          <p className={`mt-1 text-sm font-semibold ${strongTextClass}`}>
                            {selectedDeadlineInsight?.daysLeft === null
                              ? "No dated promise to count down."
                              : selectedDeadlineInsight?.label}
                          </p>
                        </div>
                        <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${workflowToneClass[selectedDeadlineInsight?.tone || "neutral"]}`}>
                          {selected.deadline || "No deadline"}
                        </span>
                      </div>
                      <div className={`mt-4 h-4 overflow-hidden rounded-full ${isDark ? "bg-slate-950" : "bg-slate-100"}`}>
                        <div
                          className={`h-full rounded-full transition-all ${
                            selectedDeadlineInsight?.tone === "danger"
                              ? "bg-rose-500"
                              : selectedDeadlineInsight?.tone === "warning"
                                ? "bg-amber-400"
                                : "bg-emerald-500"
                          }`}
                          style={{ width: `${selectedDeadlineInsight?.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              <div className={`${panelClass} p-5`}>
                <div className={`${elevatedCardClass} p-4`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700">
                          General insight
                        </p>
                        <h4 className={`mt-1 text-lg font-semibold ${strongTextClass}`}>
                          Partner workload
                        </h4>
                      </div>
                      <BarChart3 className="h-5 w-5 text-orange-600" />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className={`${subtleCardClass} p-3`}>
                        <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${mutedClass}`}>
                          Visible
                        </p>
                        <p className={`mt-1 text-2xl font-semibold ${strongTextClass}`}>
                          {partnerVisibleTotal}
                        </p>
                      </div>
                      <div className={`${subtleCardClass} p-3`}>
                        <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${mutedClass}`}>
                          Accepted
                        </p>
                        <p className={`mt-1 text-2xl font-semibold ${strongTextClass}`}>
                          {partnerAcceptedTotal}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      {partnerLoads.map(({ partner, count, accepted }) => (
                        <div key={partner.id}>
                          <div className="flex items-center justify-between gap-3">
                            <p className={`text-sm font-semibold ${strongTextClass}`}>
                              {partner.name}
                            </p>
                            <p className={`text-xs ${mutedClass}`}>
                              {accepted}/{count} accepted
                            </p>
                          </div>
                          <div className="mt-2 grid gap-1.5">
                            <div className={`h-2 overflow-hidden rounded-full ${isDark ? "bg-slate-950" : "bg-slate-100"}`}>
                              <div
                                className="h-full rounded-full bg-cyan-500"
                                style={{ width: `${Math.round((count / partnerInsightMax) * 100)}%` }}
                              />
                            </div>
                            <div className={`h-2 overflow-hidden rounded-full ${isDark ? "bg-slate-950" : "bg-slate-100"}`}>
                              <div
                                className="h-full rounded-full bg-emerald-500"
                                style={{ width: `${Math.round((accepted / partnerInsightMax) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-950">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">
                        Acceptance rate
                      </p>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <span className="text-3xl font-semibold">{partnerAcceptedPercent}%</span>
                        <span className="text-xs font-semibold text-orange-800">
                          {partnerAcceptedTotal} accepted from {partnerVisibleTotal} visible jobs
                        </span>
                      </div>
                    </div>
                </div>
              </div>
            </section>
          ) : (
            <section className={`${panelClass} grid min-h-[28rem] place-items-center p-8 text-center`}>
              <div>
                <FileText className="mx-auto h-10 w-10 text-slate-400" />
                <h2 className="mt-4 text-xl font-semibold">No quotations loaded</h2>
                <p className={`mt-2 text-sm ${mutedClass}`}>
                  {loading ? "Loading Tanvi desk..." : "No quotation records are available."}
                </p>
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
