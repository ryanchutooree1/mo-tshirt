"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
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
  RefreshCw,
  Route,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import {
  PARTNER_CLIENT_STATUS_LABELS,
  PARTNER_CLIENT_STATUS_OPTIONS,
  PARTNER_DECISION_LABELS,
  PARTNER_PRINT_PLACEMENT_LABELS,
  PARTNER_PRINT_PLACEMENT_OPTIONS,
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

const TANVI_STEPS: { key: TanviStepKey; label: string }[] = [
  { key: "client_onboarding", label: "Client onboarding" },
  { key: "artwork", label: "Artwork / logo" },
  { key: "route_prices", label: "Route, placement, partner prices" },
  { key: "client_approval", label: "Client approval" },
  { key: "partner_answer", label: "Partner answer" },
  { key: "print_start", label: "Print start" },
];

const defaultManager: ProductionManager = {
  name: "Tanvi",
  email: "",
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

  function toggleTanviStep(stepKey: TanviStepKey, checked: boolean) {
    if (!selected) return;
    void updateQuote(
      selected,
      { tanviStepChecks: { [stepKey]: checked } },
      `step-${stepKey}`
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
    ? "rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10"
    : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-700 focus:ring-4 focus:ring-cyan-700/10";
  const quietButtonClass = isDark
    ? "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/15 disabled:opacity-50"
    : "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";
  const darkButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50";
  const accentButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:opacity-50";
  const heroClass = isDark
    ? "overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 text-white shadow-[0_28px_70px_rgba(2,6,23,0.24)]"
    : "overflow-hidden rounded-[28px] border border-slate-200 bg-white text-slate-950 shadow-[0_18px_45px_rgba(15,23,42,0.08)]";
  const heroBadgeClass = isDark
    ? "inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100"
    : "inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-900";
  const heroSubtextClass = isDark ? "text-slate-300" : "text-slate-600";
  const heroPrimaryButtonClass = isDark
    ? "inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50 disabled:opacity-60"
    : "inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60";
  const heroSecondaryButtonClass = isDark
    ? "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
    : "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";
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
      card: isDark ? "border-amber-300/20 bg-amber-300/10" : "border-amber-100 bg-amber-50",
      iconClass: isDark ? "text-amber-200" : "text-amber-700",
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
          title: "Print start",
          value: selectedCanPrint ? "Tanvi gate" : "Do not print",
          helper: "Ask Tanvi before any print work starts.",
          icon: LockKeyhole,
          tone: selectedCanPrint ? "info" : "neutral",
        },
        {
          title: "Production status",
          value: PARTNER_PRODUCTION_STATUS_LABELS[selected.partner.productionStatus],
          helper: "Keep the live order status clean after print approval.",
          icon: CheckCircle2,
          tone:
            selected.partner.productionStatus === "completed" ||
            selected.partner.productionStatus === "ryan_to_collect"
              ? "success"
              : "neutral",
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

  function getStepState(stepKey: TanviStepKey) {
    const index = TANVI_STEPS.findIndex((step) => step.key === stepKey);
    const checked = Boolean(selected?.tanviStepChecks[stepKey]);
    const current = Boolean(selected && index === currentStepIndex && !checked);
    return { checked, current, upcoming: Boolean(selected && index > currentStepIndex && !checked) };
  }

  function getStepPanelClass(stepKey: TanviStepKey) {
    const state = getStepState(stepKey);
    const base =
      "overflow-hidden rounded-[24px] border transition-all duration-200";
    if (state.checked) {
      return `${base} ${
        isDark
          ? "border-white/10 bg-slate-950/90 shadow-[0_20px_60px_rgba(0,0,0,0.26)]"
          : "border-slate-800 bg-slate-900 text-white shadow-[0_20px_55px_rgba(15,23,42,0.18)]"
      }`;
    }
    if (state.current) {
      return `${base} ${
        isDark
          ? "border-cyan-300/40 bg-slate-900 shadow-[0_0_0_4px_rgba(34,211,238,0.12),0_22px_60px_rgba(0,0,0,0.28)]"
          : "border-cyan-300 bg-white shadow-[0_0_0_5px_rgba(6,182,212,0.16),0_20px_55px_rgba(15,23,42,0.12)]"
      }`;
    }
    return `${base} ${
      isDark
        ? "border-white/10 bg-slate-900/70 opacity-80"
        : "border-slate-200 bg-white opacity-80 shadow-[0_12px_35px_rgba(15,23,42,0.06)]"
    }`;
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
    const headerTextClass = state.checked && !isDark ? "text-white" : strongTextClass;
    const headerMutedClass = state.checked && !isDark ? "text-slate-300" : mutedClass;
    return (
      <div className={`flex flex-wrap items-start justify-between gap-4 border-b p-5 ${state.checked && !isDark ? "border-white/10" : dividerClass}`}>
        <div className="min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${state.checked && !isDark ? "text-cyan-200" : "text-cyan-700"}`}>
            Step {stepNumber}
          </p>
          <h3 className={`mt-1 text-xl font-semibold tracking-tight ${headerTextClass}`}>
            {title}
          </h3>
          <p className={`mt-2 max-w-3xl text-sm leading-6 ${headerMutedClass}`}>
            {description}
          </p>
        </div>
        <div className="flex items-start gap-3">
          {badge}
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
              state.checked
                ? isDark
                  ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                  : "border-white/15 bg-white/10 text-white"
                : state.current
                  ? "border-cyan-300 bg-cyan-50 text-cyan-900"
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
              className="h-4 w-4 rounded border-slate-300"
            />
            {state.checked ? "Checked" : state.current ? "Current" : "Mark done"}
          </label>
        </div>
      </div>
    );
  }

  return (
    <main className={pageClass}>
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5 px-3 py-4 sm:px-6 lg:px-8">
        <section className={heroClass}>
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_32rem] lg:p-7">
            <div>
              <div className={heroBadgeClass}>
                <ShieldCheck className="h-4 w-4" />
                Production Manager
              </div>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                {manager.name} command desk
              </h1>
              <p className={`mt-4 max-w-3xl text-sm leading-6 sm:text-base ${heroSubtextClass}`}>
                Every quotation, partner handoff, blocker, and print-start decision in one serious daily workspace.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
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
                <span className={heroSecondaryButtonClass}>
                  <Sparkles className="h-4 w-4 text-amber-300" />
                  Password protected
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {summaryCards.map(({ label, value, icon: Icon, card, iconClass }) => (
                <div key={label} className={`rounded-2xl border p-4 ${card}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                      {label}
                    </p>
                    <Icon className={`h-4 w-4 ${iconClass}`} />
                  </div>
                  <div className="mt-3 text-3xl font-semibold">{value}</div>
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
              <div className={`${panelClass} p-5`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
                      {selected.code}
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-tight">
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

                <div className="mt-5 grid gap-3 md:grid-cols-4">
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
                    <div key={label} className={`${subtleCardClass} px-3 py-3`}>
                      <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
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
                      <div key={label} className={`${subtleCardClass} px-3 py-3`}>
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                          {label}
                        </p>
                        <p className={`mt-1 break-words text-sm font-semibold ${strongTextClass}`}>
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className={`${subtleCardClass} p-4`}>
                    <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                      Client notes
                    </p>
                    <p className={`mt-3 whitespace-pre-wrap text-sm font-medium leading-6 ${strongTextClass}`}>
                      {selected.notes || "No client notes shared."}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <span className={neutralBadgeClass}>
                        Quote total: {formatMoney(selected.total, selected.currency)}
                      </span>
                      <span className={neutralBadgeClass}>
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
                      return (
                        <article key={`${attachment.url || attachment.filename}-${index}`} className={`${elevatedCardClass} overflow-hidden`}>
                          <div className={`flex flex-wrap items-start justify-between gap-3 border-b p-4 ${dividerClass}`}>
                            <div className="min-w-0">
                              <p className={`truncate text-base font-semibold ${strongTextClass}`}>
                                {attachment.filename}
                              </p>
                              <p className={`mt-1 text-xs ${mutedClass}`}>
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
                            <div className="bg-white p-3">
                              <img
                                src={attachment.url}
                                alt={attachment.filename}
                                className="h-[22rem] w-full rounded-2xl border border-slate-200 bg-white object-contain sm:h-[28rem]"
                                loading="lazy"
                              />
                            </div>
                          ) : isPdf ? (
                            <div className="bg-white p-3">
                              <iframe
                                src={attachment.url}
                                title={`Preview ${attachment.filename || "PDF artwork"}`}
                                className="h-[28rem] w-full rounded-2xl border border-slate-200 bg-white"
                              />
                            </div>
                          ) : attachment.url ? (
                            <div className="p-4">
                              <div className={`grid min-h-48 place-items-center text-center ${subtleCardClass} p-6`}>
                                <div>
                                  <FileText className="mx-auto h-8 w-8 text-cyan-700" />
                                  <p className={`mt-3 text-sm font-semibold ${strongTextClass}`}>
                                    Preview unavailable
                                  </p>
                                  <p className={`mt-1 text-xs ${mutedClass}`}>
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

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <label className={`text-xs font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                      Print placement
                      <select
                        value={printPlacement}
                        onChange={(event) =>
                          setPrintPlacement(event.target.value as PartnerPrintPlacement)
                        }
                        className={`mt-2 w-full normal-case tracking-normal ${fieldClass}`}
                      >
                        {PARTNER_PRINT_PLACEMENT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={`text-xs font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                      Current route
                      <div className={`mt-2 flex min-h-[42px] items-center rounded-xl px-3 py-2 normal-case tracking-normal ${subtleCardClass}`}>
                        <span className={`text-sm font-semibold ${strongTextClass}`}>
                          {selected.partner.visibleLabel}
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

                          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <label className={`text-xs font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                              Partner price
                              <div className="mt-2 flex items-center gap-2">
                                <span className={`rounded-xl border px-3 py-2 text-sm font-semibold ${isDark ? "border-white/10 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
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
                              disabled={Boolean(saving)}
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
                              className={partner.id === activePartners[0]?.id ? accentButtonClass : darkButtonClass}
                            >
                              <Send className="h-4 w-4" />
                              {saving === partner.id ? "Moving..." : `Move to ${partner.name}`}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={Boolean(saving) || activePartners.length < 2}
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
                    className={`mt-3 w-full ${quietButtonClass}`}
                  >
                    <Users className="h-4 w-4" />
                    {saving === "all" ? "Sending..." : "Send to all active partners"}
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
                    "Final gate: use this after Tanvi has confirmed client approval, payment readiness, and the correct production partner.",
                  badge: (
                    <span className={selectedCanPrint ? workflowToneClass.info : neutralBadgeClass}>
                      {selectedCanPrint ? "Ready for Tanvi gate" : "Do not print yet"}
                    </span>
                  ),
                })}
                <div className="grid gap-3 p-5 lg:grid-cols-3">
                  {partnerLoads.map(({ partner, count, accepted }) => (
                    <div key={partner.id} className={`${elevatedCardClass} p-4`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{partner.name}</p>
                      <CircleDollarSign className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className={`text-xs uppercase tracking-[0.14em] ${mutedClass}`}>Visible</p>
                        <p className="mt-1 text-2xl font-semibold">{count}</p>
                      </div>
                      <div>
                        <p className={`text-xs uppercase tracking-[0.14em] ${mutedClass}`}>Accepted</p>
                        <p className="mt-1 text-2xl font-semibold">{accepted}</p>
                      </div>
                    </div>
                  </div>
                ))}
                  <div className={`${subtleCardClass} p-4 lg:col-span-3`}>
                    <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                      Tanvi gate
                    </p>
                    <p className={`mt-2 text-sm font-semibold ${strongTextClass}`}>
                      Ask Tanvi before any print work starts.
                    </p>
                    <p className={`mt-2 text-sm leading-6 ${mutedClass}`}>
                      Production should stay paused until this step is checked and the client status is ready.
                    </p>
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
