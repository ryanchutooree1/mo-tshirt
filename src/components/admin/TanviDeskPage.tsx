"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  RefreshCw,
  Route,
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
import type { TanviQuoteSummary } from "@/lib/tanvi-quotes";

type DeskPayload = {
  manager: ProductionManager;
  partners: PrintPartner[];
  quotes: TanviQuoteSummary[];
};

type QueueFilter = "all" | "unrouted" | "waiting" | "blocked" | "ready" | "active";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }, [selected]);

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

  const pageClass = isDark
    ? "min-h-screen bg-slate-950 text-slate-100"
    : "min-h-screen bg-[#f5f7fb] text-slate-950";
  const panelClass = isDark
    ? "rounded-lg border border-white/10 bg-slate-900/80 shadow-[0_20px_60px_rgba(0,0,0,0.28)]"
    : "rounded-lg border border-slate-200 bg-white shadow-[0_16px_46px_rgba(15,23,42,0.08)]";
  const mutedClass = isDark ? "text-slate-400" : "text-slate-500";
  const fieldClass = isDark
    ? "rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-300"
    : "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900";
  const quietButtonClass = isDark
    ? "inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/15 disabled:opacity-50"
    : "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";
  const darkButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50";
  const accentButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:opacity-50";

  return (
    <main className={pageClass}>
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5 px-3 py-4 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-lg border border-slate-900 bg-slate-950 text-white shadow-[0_28px_70px_rgba(2,6,23,0.24)]">
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_32rem] lg:p-7">
            <div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">
                <ShieldCheck className="h-4 w-4" />
                Production Manager
              </div>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">
                {manager.name} command desk
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                Every quotation, partner handoff, blocker, and print-start decision in one serious daily workspace.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={loadDesk}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
                <span className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200">
                  <Sparkles className="h-4 w-4 text-amber-300" />
                  Password protected
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "All quotes", value: metrics.total, icon: FileText, tone: "text-cyan-200" },
                { label: "Need routing", value: metrics.unrouted, icon: Route, tone: "text-amber-200" },
                { label: "Blockers", value: metrics.blockers, icon: AlertTriangle, tone: "text-rose-200" },
                { label: "Ready to print", value: metrics.ready, icon: CheckCircle2, tone: "text-emerald-200" },
              ].map(({ label, value, icon: Icon, tone }) => (
                <div key={label} className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {label}
                    </p>
                    <Icon className={`h-4 w-4 ${tone}`} />
                  </div>
                  <div className="mt-3 text-3xl font-semibold">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {notice ? (
          <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            {notice}
          </div>
        ) : null}

        {error ? (
          <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-[25rem_minmax(0,1fr)]">
          <aside className={`${panelClass} overflow-hidden`}>
            <div className="border-b border-slate-200/70 p-4">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600">
                <Search className="h-4 w-4" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search quote, client, product"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
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
                    className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                      filter === key
                        ? "border-slate-950 bg-slate-950 text-white"
                        : isDark
                          ? "border-white/10 bg-white/10 text-slate-200"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                    }`}
                  >
                    <span className="block uppercase tracking-[0.12em]">{label as string}</span>
                    <span className="mt-1 block text-lg">{String(count)}</span>
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
                        className={`w-full rounded-lg border p-3 text-left transition ${
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
                <div className={`rounded-lg border border-dashed p-8 text-center text-sm ${mutedClass}`}>
                  No quotations match this view.
                </div>
              )}
            </div>
          </aside>

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
                    <span className={`rounded-lg border px-3 py-2 text-xs font-semibold ${statusTone(selected.partner.requestStatus)}`}>
                      Partner: {PARTNER_DECISION_LABELS[selected.partner.requestStatus]}
                    </span>
                    <span className={`rounded-lg border px-3 py-2 text-xs font-semibold ${statusTone(selected.partner.clientStatus)}`}>
                      Client: {PARTNER_CLIENT_STATUS_LABELS[selected.partner.clientStatus]}
                    </span>
                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                      Production: {PARTNER_PRODUCTION_STATUS_LABELS[selected.partner.productionStatus]}
                    </span>
                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
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
                    <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {label}
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
                <div className={`${panelClass} p-5`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
                        Route order
                      </p>
                      <h3 className="mt-2 text-xl font-semibold">Choose the production desk</h3>
                    </div>
                    <Route className="h-5 w-5 text-cyan-700" />
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {activePartners.map((partner) => (
                      <button
                        key={partner.id}
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
                    ))}
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
                      className={quietButtonClass}
                    >
                      <Users className="h-4 w-4" />
                      {saving === "all" ? "Sending..." : "Send to all active"}
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
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

                    <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
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

                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Fields shared with partners
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {PARTNER_VISIBLE_FIELD_OPTIONS.map((field) => (
                        <label
                          key={field.key}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                            visibleFields.includes(field.key)
                              ? "border-cyan-300 bg-cyan-50 text-cyan-950"
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

                <div className={`${panelClass} p-5`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
                        Follow-up
                      </p>
                      <h3 className="mt-2 text-xl font-semibold">Status and partner answers</h3>
                    </div>
                    <Clock3 className="h-5 w-5 text-amber-600" />
                  </div>

                  <div className="mt-5 space-y-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Missing information
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-900">
                        {selected.partner.missingInformation || "No blocker from partner."}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Partner comments
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-900">
                        {selected.partner.comments || "No comments yet."}
                      </p>
                    </div>
                    {selected.notes ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Client notes
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-900">
                          {selected.notes}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 space-y-2">
                    {selected.partner.responses.length ? (
                      selected.partner.responses.map((response) => (
                        <div key={response.partnerId} className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-slate-950">{response.partnerName}</p>
                            <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${statusTone(response.requestStatus)}`}>
                              {PARTNER_DECISION_LABELS[response.requestStatus]}
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                            <span>{response.completionDays ? `${response.completionDays} days` : "Days n/a"}</span>
                            <span>{response.price ? `Rs ${response.price}` : "Price n/a"}</span>
                            <span>{formatRelative(response.updatedAt)}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className={`rounded-lg border border-dashed p-5 text-center text-sm ${mutedClass}`}>
                        Waiting for partner response.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                {partnerLoads.map(({ partner, count, accepted }) => (
                  <div key={partner.id} className={`${panelClass} p-4`}>
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
