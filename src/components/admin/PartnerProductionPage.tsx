"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import {
  FiAlertTriangle,
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiCheckCircle,
  FiClock,
  FiDownload,
  FiFileText,
  FiImage,
  FiLock,
  FiLogOut,
  FiMessageCircle,
  FiMoon,
  FiPackage,
  FiRefreshCw,
  FiSearch,
  FiSun,
  FiTruck,
  FiXCircle,
} from "react-icons/fi";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import {
  getPrintPartner,
  PARTNER_DECISION_LABELS,
  PARTNER_DECISION_TONES,
  PARTNER_PRODUCTION_STATUS_LABELS,
  PARTNER_PRODUCTION_STATUSES,
  type PartnerDecision,
  type PartnerOrderAttachment,
  type PartnerOrderDetails,
  type PartnerOrderView,
  type PartnerProductionStatus,
  type PrintPartnerId,
} from "@/lib/partners";

type SessionState = "checking" | "signed_out" | "signed_in";
type FilterKey = "all" | "pending" | "accepted" | "active" | "completed" | "rejected";
type SortKey = "assigned" | "deadline" | "status";
type MobilePanel = "queue" | "order";

type ResponseDraft = {
  decision: PartnerDecision;
  productionStatus: PartnerProductionStatus;
  completionDays: string;
  price: string;
  comments: string;
  missingInformation: string;
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-MU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isActiveOrder(order: PartnerOrderView) {
  return (
    order.decision === "accepted" &&
    order.productionStatus !== "completed" &&
    order.productionStatus !== "ryan_to_collect"
  );
}

function buildDraft(order: PartnerOrderView | null): ResponseDraft {
  return {
    decision: order?.decision || "pending",
    productionStatus: order?.productionStatus || "not_started",
    completionDays: order?.completionDays ? String(order.completionDays) : "",
    price: order?.price ? String(order.price) : "",
    comments: order?.comments || "",
    missingInformation: order?.missingInformation || "",
  };
}

function orderMatchesFilter(order: PartnerOrderView, filter: FilterKey) {
  if (filter === "all") return true;
  if (filter === "pending") return order.decision === "pending" || order.decision === "needs_info";
  if (filter === "accepted") return order.decision === "accepted";
  if (filter === "active") return isActiveOrder(order);
  if (filter === "completed") {
    return order.productionStatus === "completed" || order.productionStatus === "ryan_to_collect";
  }
  return order.decision === "rejected";
}

function detailHasContent(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(String(value || "").trim());
}

function getDetailCount(details: PartnerOrderDetails) {
  return Object.values(details).filter(detailHasContent).length;
}

function getArtworkDownloadHref(attachment: PartnerOrderAttachment, index: number) {
  if (!attachment.url) return "";

  const params = new URLSearchParams({
    url: attachment.url,
    name: attachment.filename || attachment.label || `artwork-${index + 1}`,
  });

  return `/api/shops/download?${params.toString()}`;
}

function timestampValue(value: string | null) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function deadlineValue(order: PartnerOrderView) {
  const value = order.summary.deadline || order.details.deadline || "";
  if (!value.trim()) return Number.POSITIVE_INFINITY;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime();
}

function searchableOrderText(order: PartnerOrderView) {
  return [
    order.code,
    order.summary.product,
    order.summary.print,
    order.summary.deadline,
    order.partnerName,
    order.decision,
    order.productionStatus,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sortOrders(orders: PartnerOrderView[], sort: SortKey) {
  const statusRank: Record<PartnerDecision, number> = {
    needs_info: 0,
    pending: 1,
    accepted: 2,
    rejected: 3,
  };

  return orders.slice().sort((left, right) => {
    if (sort === "deadline") {
      return (
        deadlineValue(left) - deadlineValue(right) ||
        timestampValue(right.assignedAt || right.updatedAt || right.createdAt) -
          timestampValue(left.assignedAt || left.updatedAt || left.createdAt)
      );
    }

    if (sort === "status") {
      return (
        statusRank[left.decision] - statusRank[right.decision] ||
        timestampValue(right.assignedAt || right.updatedAt || right.createdAt) -
          timestampValue(left.assignedAt || left.updatedAt || left.createdAt)
      );
    }

    return (
      timestampValue(right.assignedAt || right.updatedAt || right.createdAt) -
      timestampValue(left.assignedAt || left.updatedAt || left.createdAt)
    );
  });
}

export default function PartnerProductionPage({
  partnerId,
}: {
  partnerId: PrintPartnerId;
}) {
  const { theme, toggleTheme } = useAdminTheme();
  const isDark = theme === "dark";
  const partner = getPrintPartner(partnerId);
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [orders, setOrders] = useState<PartnerOrderView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("assigned");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("queue");
  const [draft, setDraft] = useState<ResponseDraft>(() => buildDraft(null));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const filteredOrders = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const matching = orders.filter((order) => {
      if (!orderMatchesFilter(order, filter)) return false;
      if (!query) return true;
      return searchableOrderText(order).includes(query);
    });

    return sortOrders(matching, sortKey);
  }, [filter, orders, searchTerm, sortKey]);

  const selected = useMemo(
    () =>
      filteredOrders.find((order) => order.id === selectedId) ||
      filteredOrders[0] ||
      null,
    [filteredOrders, selectedId]
  );

  const selectedIndex = useMemo(
    () => (selected ? filteredOrders.findIndex((order) => order.id === selected.id) : -1),
    [filteredOrders, selected]
  );

  const themeVars = useMemo(
    () =>
      ({
        "--partner-bg": isDark ? "#020617" : "#f6f8fb",
        "--partner-card": isDark ? "#0f172a" : "#ffffff",
        "--partner-soft": isDark ? "#111c2f" : "#f8fafc",
        "--partner-hover": isDark ? "#18243a" : "#f1f5f9",
        "--partner-border": isDark ? "#243249" : "#e2e8f0",
        "--partner-text": isDark ? "#e5e7eb" : "#0f172a",
        "--partner-muted": isDark ? "#94a3b8" : "#64748b",
        "--partner-faint": isDark ? "#64748b" : "#94a3b8",
        "--partner-accent": isDark ? "#0e7490" : "#0f172a",
        "--partner-accent-soft": isDark ? "#164e63" : "#e0f2fe",
        "--partner-accent-text": "#ffffff",
        colorScheme: theme,
      }) as CSSProperties,
    [isDark, theme]
  );

  const shellClass =
    "min-h-screen bg-[var(--partner-bg)] text-[color:var(--partner-text)] transition-colors";
  const surfaceClass =
    "rounded-2xl border border-[color:var(--partner-border)] bg-[var(--partner-card)] shadow-sm";
  const softSurfaceClass =
    "border-[color:var(--partner-border)] bg-[var(--partner-soft)]";
  const secondaryButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--partner-border)] bg-[var(--partner-card)] px-4 py-2.5 text-sm font-semibold text-[color:var(--partner-text)] transition hover:bg-[var(--partner-hover)] disabled:opacity-60";
  const inputClass =
    "w-full rounded-xl border border-[color:var(--partner-border)] bg-[var(--partner-card)] px-4 py-3 text-base text-[color:var(--partner-text)] outline-none transition placeholder:text-[color:var(--partner-faint)] focus:border-[color:var(--partner-accent)] focus:ring-4 focus:ring-cyan-500/10 sm:text-sm";
  const fieldLabelClass =
    "text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--partner-muted)] sm:text-xs sm:tracking-[0.18em]";
  const sectionLabelClass =
    "text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--partner-muted)] sm:text-xs sm:tracking-[0.2em]";
  const mobilePanelButtonClass = (active: boolean) =>
    `rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
      active
        ? "bg-[var(--partner-accent)] text-[color:var(--partner-accent-text)]"
        : "text-[color:var(--partner-muted)] hover:bg-[var(--partner-hover)]"
    }`;

  const counts = useMemo(() => {
    return orders.reduce(
      (acc, order) => {
        acc.all += 1;
        if (order.decision === "pending" || order.decision === "needs_info") acc.pending += 1;
        if (order.decision === "accepted") acc.accepted += 1;
        if (isActiveOrder(order)) acc.active += 1;
        if (order.productionStatus === "completed" || order.productionStatus === "ryan_to_collect") {
          acc.completed += 1;
        }
        if (order.decision === "rejected") acc.rejected += 1;
        return acc;
      },
      { all: 0, pending: 0, accepted: 0, active: 0, completed: 0, rejected: 0 }
    );
  }, [orders]);

  const selectQueueOffset = useCallback(
    (offset: number) => {
      if (!filteredOrders.length) return;
      const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
      const nextIndex =
        (currentIndex + offset + filteredOrders.length) % filteredOrders.length;
      setSelectedId(filteredOrders[nextIndex].id);
    },
    [filteredOrders, selectedIndex]
  );

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    setOrdersError(null);
    try {
      const res = await fetch(`/api/partners/orders?partner=${partnerId}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not load orders.");
      const nextOrders = Array.isArray(data?.orders)
        ? (data.orders as PartnerOrderView[])
        : [];
      setOrders(nextOrders);
      if (nextOrders.length === 1) setMobilePanel("order");
      setSelectedId((current) => {
        if (current && nextOrders.some((order) => order.id === current)) return current;
        return nextOrders[0]?.id || null;
      });
    } catch (error) {
      setOrdersError(error instanceof Error ? error.message : "Could not load orders.");
    } finally {
      setLoadingOrders(false);
    }
  }, [partnerId]);

  useEffect(() => {
    let ignore = false;

    (async () => {
      try {
        const res = await fetch(`/api/partners/session?partner=${partnerId}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!ignore) setSessionState("signed_out");
          return;
        }
        if (!ignore) {
          setSessionState("signed_in");
          await loadOrders();
        }
      } catch {
        if (!ignore) setSessionState("signed_out");
      }
    })();

    return () => {
      ignore = true;
    };
  }, [loadOrders, partnerId]);

  useEffect(() => {
    setDraft(buildDraft(selected));
    setNotice(null);
  }, [selected]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoginError(null);
    try {
      const res = await fetch("/api/partners/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Login failed.");
      setPassword("");
      setSessionState("signed_in");
      await loadOrders();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed.");
    }
  }

  async function logout() {
    await fetch("/api/partners/login", { method: "DELETE" }).catch(() => null);
    setOrders([]);
    setSelectedId(null);
    setSessionState("signed_out");
  }

  async function saveResponse(nextDecision?: PartnerDecision) {
    if (!selected) return;
    const decision = nextDecision || draft.decision;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/partners/orders/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId,
          decision,
          productionStatus: draft.productionStatus,
          completionDays: draft.completionDays,
          price: draft.price,
          comments: draft.comments,
          missingInformation: draft.missingInformation,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save response.");
      const updated = data?.order as PartnerOrderView | null;
      if (updated) {
        setOrders((current) =>
          current.map((order) => (order.id === updated.id ? updated : order))
        );
        setDraft(buildDraft(updated));
        setSelectedId(updated.id);
      }
      setNotice("Saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save response.");
    } finally {
      setSaving(false);
    }
  }

  if (sessionState === "checking") {
    return (
      <main
        style={themeVars}
        className={`grid place-items-center px-6 ${shellClass}`}
      >
        <div className="flex items-center gap-3 text-sm font-semibold">
          <FiRefreshCw className="h-5 w-5 animate-spin" />
          Opening partner desk
        </div>
      </main>
    );
  }

  if (sessionState === "signed_out") {
    return (
      <main
        style={themeVars}
        className={`px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-8 sm:py-8 ${shellClass}`}
      >
        <div className="mx-auto flex max-w-6xl justify-end">
          <button
            type="button"
            onClick={toggleTheme}
            className={secondaryButtonClass}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <FiSun className="h-4 w-4" /> : <FiMoon className="h-4 w-4" />}
            {isDark ? "Light" : "Dark"}
          </button>
        </div>
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
          <div className="grid w-full gap-6 lg:grid-cols-[1fr_420px] lg:items-center">
            <section className="py-6 sm:py-8">
              <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold text-[color:var(--partner-muted)] ${softSurfaceClass}`}>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                MO T-SHIRT partner production
              </div>
              <h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-[color:var(--partner-text)] sm:mt-6 sm:text-6xl">
                {partner.name} production desk
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[color:var(--partner-muted)] sm:mt-5 sm:text-base sm:leading-7">
                Orders assigned by Ryan appear here with only the production details he chooses to share.
              </p>
              <div className="mt-6 grid max-w-2xl gap-3 sm:mt-8 sm:grid-cols-3">
                {[
                  ["Accept or reject", "Confirm capacity fast."],
                  ["Price your work", "Send cost and timing."],
                  ["Update status", "Keep Ryan in sync."],
                ].map(([title, copy]) => (
                  <div key={title} className={`rounded-xl border p-4 ${softSurfaceClass}`}>
                    <p className="text-sm font-semibold text-[color:var(--partner-text)]">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-[color:var(--partner-muted)]">{copy}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className={`${surfaceClass} p-5 sm:p-8`}>
              <div className="flex items-center justify-between gap-4">
                <Image
                  src="/logo_transparent.png"
                  alt="MO T-SHIRT"
                  width={130}
                  height={52}
                  className="h-12 w-auto"
                />
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--partner-accent)] text-[color:var(--partner-accent-text)]">
                  <FiLock className="h-5 w-5" />
                </span>
              </div>
              <h2 className="mt-8 text-2xl font-semibold tracking-tight">Enter password</h2>
              <form onSubmit={login} className="mt-6 space-y-4">
                <label className={`block ${fieldLabelClass}`}>
                  Partner password
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    required
                    className={`mt-2 normal-case tracking-normal ${inputClass}`}
                    placeholder="Password"
                  />
                </label>
                {loginError ? (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {loginError}
                  </p>
                ) : null}
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--partner-accent)] px-5 py-3 text-sm font-semibold text-[color:var(--partner-accent-text)] transition hover:opacity-90"
                >
                  <FiLock className="h-4 w-4" />
                  Open desk
                </button>
              </form>
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={themeVars} className={shellClass}>
      <header className="border-b border-[color:var(--partner-border)] bg-[var(--partner-card)]">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-3 py-4 sm:gap-5 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold text-[color:var(--partner-text)] ${softSurfaceClass}`}>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {partner.name}
              </span>
              <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold text-[color:var(--partner-muted)] ${softSurfaceClass}`}>
                Private production queue
              </span>
              <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold text-[color:var(--partner-muted)] ${softSurfaceClass}`}>
                {filteredOrders.length} of {orders.length} orders
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-4xl">
              Assigned orders
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={toggleTheme}
              className={`${secondaryButtonClass} px-2 text-xs sm:px-4 sm:text-sm`}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <FiSun className="h-4 w-4" /> : <FiMoon className="h-4 w-4" />}
              {isDark ? "Light" : "Dark"}
            </button>
            <button
              type="button"
              onClick={loadOrders}
              disabled={loadingOrders}
              className={`${secondaryButtonClass} px-2 text-xs sm:px-4 sm:text-sm`}
            >
              <FiRefreshCw className={`h-4 w-4 ${loadingOrders ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={logout}
              className={`${secondaryButtonClass} px-2 text-xs sm:px-4 sm:text-sm`}
            >
              <FiLogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto px-3 pt-3 sm:px-6 lg:hidden">
        <div className={`${surfaceClass} grid grid-cols-2 gap-1 p-1`}>
          <button
            type="button"
            onClick={() => setMobilePanel("queue")}
            className={mobilePanelButtonClass(mobilePanel === "queue")}
          >
            Queue ({filteredOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setMobilePanel("order")}
            className={mobilePanelButtonClass(mobilePanel === "order")}
          >
            {selected ? selected.code : "Order"}
          </button>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1500px] gap-4 px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:gap-6 sm:px-6 sm:py-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-8">
        <aside className={`${mobilePanel === "queue" ? "block" : "hidden"} space-y-4 lg:block`}>
          <div className={`${surfaceClass} p-3 sm:p-4`}>
            <div className="grid gap-3">
              <label className="relative block">
                <span className="sr-only">Search orders</span>
                <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--partner-muted)]" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className={`${inputClass} pl-10`}
                  placeholder="Search order, product, print"
                />
              </label>
              <label className={`block ${fieldLabelClass}`}>
                Sort queue
                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                  className={`mt-2 ${inputClass}`}
                >
                  <option value="assigned">Newest assigned</option>
                  <option value="deadline">Deadline first</option>
                  <option value="status">Response status</option>
                </select>
              </label>
            </div>
          </div>

          <div className={`${surfaceClass} p-3 sm:p-4`}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-2">
              {(
                [
                  ["all", "All", counts.all],
                  ["pending", "Pending", counts.pending],
                  ["accepted", "Accepted", counts.accepted],
                  ["active", "Active", counts.active],
                  ["completed", "Done", counts.completed],
                  ["rejected", "Rejected", counts.rejected],
                ] as const
              ).map(([key, label, count]) => {
                const active = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`rounded-xl border px-2 py-2.5 text-left text-xs font-semibold transition sm:px-3 ${
                      active
                        ? "border-[color:var(--partner-accent)] bg-[var(--partner-accent)] text-[color:var(--partner-accent-text)]"
                        : "border-[color:var(--partner-border)] bg-[var(--partner-soft)] text-[color:var(--partner-text)] hover:bg-[var(--partner-hover)]"
                    }`}
                  >
                    <span className="block">{label}</span>
                    <span className="mt-1 block opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`${surfaceClass} p-2 sm:p-3`}>
            {ordersError ? (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {ordersError}
              </div>
            ) : null}
            <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1 lg:max-h-none lg:overflow-visible lg:pr-0">
              {filteredOrders.map((order) => {
                const active = selected?.id === order.id;
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(order.id);
                      setMobilePanel("order");
                    }}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      active
                        ? "border-[color:var(--partner-accent)] bg-[var(--partner-accent)] text-[color:var(--partner-accent-text)]"
                        : "border-[color:var(--partner-border)] bg-[var(--partner-card)] text-[color:var(--partner-text)] hover:bg-[var(--partner-hover)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{order.code}</p>
                        <p className={`mt-1 text-xs ${active ? "text-white/75" : "text-[color:var(--partner-muted)]"}`}>
                          {order.summary.product || "Production order"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                          active
                            ? "border-white/20 bg-white/10 text-white"
                            : PARTNER_DECISION_TONES[order.decision]
                        }`}
                      >
                        {PARTNER_DECISION_LABELS[order.decision]}
                      </span>
                    </div>
                    <div className={`mt-3 grid grid-cols-3 gap-2 text-[11px] ${active ? "text-white/75" : "text-[color:var(--partner-muted)]"}`}>
                      <span className="truncate">{order.summary.pieces ? `${order.summary.pieces} pcs` : "Qty hidden"}</span>
                      <span className="truncate">{order.summary.deadline || "No deadline"}</span>
                      <span className="truncate">{getDetailCount(order.details)} fields</span>
                    </div>
                  </button>
                );
              })}
              {!filteredOrders.length ? (
                <div className={`rounded-xl border border-dashed px-4 py-10 text-center text-sm text-[color:var(--partner-muted)] ${softSurfaceClass}`}>
                  No orders in this view.
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <section className={`${mobilePanel === "order" ? "block" : "hidden"} min-w-0 lg:block`}>
          {selected ? (
            <div className="space-y-4 sm:space-y-5">
              <div className={`${surfaceClass} p-4 sm:p-6`}>
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <button
                      type="button"
                      onClick={() => setMobilePanel("queue")}
                      className={`${secondaryButtonClass} mb-4 text-xs lg:hidden`}
                    >
                      <FiChevronLeft className="h-4 w-4" />
                      Back to queue
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={sectionLabelClass}>
                        Order {selected.code}
                      </p>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold text-[color:var(--partner-muted)] ${softSurfaceClass}`}>
                        {selectedIndex + 1} of {filteredOrders.length}
                      </span>
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                      {selected.summary.product || "Production details"}
                    </h2>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${PARTNER_DECISION_TONES[selected.decision]}`}>
                        {PARTNER_DECISION_LABELS[selected.decision]}
                      </span>
                      <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold text-[color:var(--partner-text)] ${softSurfaceClass}`}>
                        {PARTNER_PRODUCTION_STATUS_LABELS[selected.productionStatus]}
                      </span>
                      <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold text-[color:var(--partner-muted)] ${softSurfaceClass}`}>
                        Assigned {formatDate(selected.assignedAt)}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => selectQueueOffset(-1)}
                        disabled={filteredOrders.length < 2}
                        className={`${secondaryButtonClass} text-xs sm:text-sm`}
                      >
                        <FiChevronLeft className="h-4 w-4" />
                        Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => selectQueueOffset(1)}
                        disabled={filteredOrders.length < 2}
                        className={`${secondaryButtonClass} text-xs sm:text-sm`}
                      >
                        Next
                        <FiChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:gap-3 xl:min-w-[520px]">
                    <Metric
                      icon={<FiPackage />}
                      label="Quantity"
                      value={selected.summary.pieces ? `${selected.summary.pieces} pcs` : "Hidden"}
                    />
                    <Metric
                      icon={<FiCalendar />}
                      label="Deadline"
                      value={selected.summary.deadline || "Not set"}
                    />
                    <Metric
                      icon={<FiFileText />}
                      label="Print"
                      value={selected.summary.print || "Not set"}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
                <div className="space-y-5">
                  <OrderDetails details={selected.details} />
                </div>

                <div className={`${surfaceClass} p-4 sm:p-5`}>
                  <p className={sectionLabelClass}>
                    Your response
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <DecisionButton
                      active={draft.decision === "accepted"}
                      label="Accept"
                      icon={<FiCheckCircle />}
                      onClick={() => setDraft((current) => ({ ...current, decision: "accepted" }))}
                    />
                    <DecisionButton
                      active={draft.decision === "needs_info"}
                      label="Need info"
                      icon={<FiAlertTriangle />}
                      onClick={() => setDraft((current) => ({ ...current, decision: "needs_info" }))}
                    />
                    <DecisionButton
                      active={draft.decision === "rejected"}
                      label="Reject"
                      icon={<FiXCircle />}
                      onClick={() => setDraft((current) => ({ ...current, decision: "rejected" }))}
                    />
                  </div>

                  <div className="mt-5 grid gap-4">
                    <label className={fieldLabelClass}>
                      Completion days
                      <input
                        type="number"
                        min={0}
                        value={draft.completionDays}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            completionDays: event.target.value,
                          }))
                        }
                        className={`mt-2 normal-case tracking-normal ${inputClass}`}
                        placeholder="e.g. 3"
                      />
                    </label>
                    <label className={fieldLabelClass}>
                      Your price
                      <input
                        type="number"
                        min={0}
                        value={draft.price}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            price: event.target.value,
                          }))
                        }
                        className={`mt-2 normal-case tracking-normal ${inputClass}`}
                        placeholder="Rs"
                      />
                    </label>
                    <label className={fieldLabelClass}>
                      Production status
                      <select
                        value={draft.productionStatus}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            productionStatus: event.target.value as PartnerProductionStatus,
                          }))
                        }
                        className={`mt-2 normal-case tracking-normal ${inputClass}`}
                      >
                        {PARTNER_PRODUCTION_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {PARTNER_PRODUCTION_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={fieldLabelClass}>
                      Comments for Ryan
                      <textarea
                        value={draft.comments}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            comments: event.target.value,
                          }))
                        }
                        rows={4}
                        className={`mt-2 resize-y normal-case tracking-normal ${inputClass}`}
                        placeholder="Production notes, price explanation, or delivery plan."
                      />
                    </label>
                    <label className={fieldLabelClass}>
                      Missing information
                      <textarea
                        value={draft.missingInformation}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            missingInformation: event.target.value,
                          }))
                        }
                        rows={3}
                        className={`mt-2 resize-y normal-case tracking-normal ${inputClass}`}
                        placeholder="Tell Ryan what is missing before you can print."
                      />
                    </label>
                  </div>

                  <div className="mt-5 grid gap-2">
                    <button
                      type="button"
                      onClick={() => saveResponse()}
                      disabled={saving}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--partner-accent)] px-5 py-3 text-sm font-semibold text-[color:var(--partner-accent-text)] transition hover:opacity-90 disabled:opacity-60"
                    >
                      <FiCheckCircle className="h-4 w-4" />
                      {saving ? "Saving..." : "Save response"}
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => saveResponse("accepted")}
                        disabled={saving}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => saveResponse("rejected")}
                        disabled={saving}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </div>

                  {notice ? (
                    <p className={`mt-4 rounded-xl border px-4 py-3 text-sm text-[color:var(--partner-text)] ${softSurfaceClass}`}>
                      {notice}
                    </p>
                  ) : null}

                  <div className={`mt-5 rounded-xl border p-4 text-xs leading-5 text-[color:var(--partner-muted)] ${softSurfaceClass}`}>
                    Customer name, phone, email, and address are hidden on this desk.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={`rounded-2xl border border-dashed px-6 py-16 text-center shadow-sm ${softSurfaceClass}`}>
              <FiPackage className="mx-auto h-8 w-8 text-[color:var(--partner-muted)]" />
              <h2 className="mt-4 text-xl font-semibold">No assigned orders in this view</h2>
              <p className="mt-2 text-sm text-[color:var(--partner-muted)]">
                Try another filter or search. New jobs will appear here when Ryan moves an
                order to {partner.name}.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-[color:var(--partner-border)] bg-[var(--partner-soft)] p-3 sm:p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--partner-muted)] sm:gap-2 sm:text-xs sm:tracking-[0.16em]">
        <span className="text-[color:var(--partner-text)]">{icon}</span>
        {label}
      </div>
      <div className="mt-2 line-clamp-2 text-xs font-semibold text-[color:var(--partner-text)] sm:text-sm">{value}</div>
    </div>
  );
}

function DecisionButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-16 flex-col items-center justify-center gap-2 rounded-xl border px-2 text-xs font-semibold transition sm:min-h-20 ${
        active
          ? "border-[color:var(--partner-accent)] bg-[var(--partner-accent)] text-[color:var(--partner-accent-text)]"
          : "border-[color:var(--partner-border)] bg-[var(--partner-soft)] text-[color:var(--partner-text)] hover:bg-[var(--partner-hover)]"
      }`}
    >
      <span className="text-base">{icon}</span>
      {label}
    </button>
  );
}

function OrderDetails({ details }: { details: PartnerOrderDetails }) {
  const hasDetails = Object.values(details).some(detailHasContent);

  if (!hasDetails) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--partner-border)] bg-[var(--partner-card)] px-6 py-12 text-center text-sm text-[color:var(--partner-muted)] shadow-sm">
        Ryan has not shared production fields for this order yet.
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {details.artwork ? (
        <DetailPanel icon={<FiImage />} title="Artwork / logo">
          {details.artwork.length ? (
            <div className="space-y-3">
              {details.artwork.map((attachment, index) => {
                const isImage = Boolean(
                  attachment.url && attachment.contentType.startsWith("image/")
                );
                const downloadHref = getArtworkDownloadHref(attachment, index);
                return (
                  <div
                    key={`${attachment.url || attachment.filename}-${index}`}
                    className="rounded-xl border border-[color:var(--partner-border)] bg-[var(--partner-soft)] p-3"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[color:var(--partner-text)]">
                          {attachment.filename}
                        </p>
                        <p className="mt-1 text-xs text-[color:var(--partner-muted)]">
                          {attachment.label}
                          {attachment.quantity ? ` - Qty ${attachment.quantity}` : ""}
                        </p>
                      </div>
                      {attachment.url ? (
                        <div className="flex shrink-0 items-center gap-2 self-start">
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-[color:var(--partner-border)] bg-[var(--partner-card)] px-3 py-2 text-xs font-semibold text-[color:var(--partner-text)] transition hover:bg-[var(--partner-hover)]"
                          >
                            Open
                          </a>
                          <a
                            href={downloadHref}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--partner-border)] bg-[var(--partner-card)] text-[color:var(--partner-text)] transition hover:bg-[var(--partner-hover)]"
                            aria-label={`Download ${attachment.filename || "artwork"}`}
                            title="Download artwork"
                          >
                            <FiDownload className="h-4 w-4" />
                          </a>
                        </div>
                      ) : null}
                    </div>
                    {isImage ? (
                      <img
                        src={attachment.url}
                        alt={attachment.filename}
                        className="mt-3 max-h-56 w-full rounded-lg border border-[color:var(--partner-border)] bg-white object-contain sm:max-h-72"
                        loading="lazy"
                      />
                    ) : !attachment.url ? (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                        Ryan received this file by email only. Ask Ryan to re-upload it in
                        Quotation Approval so you can open the artwork here.
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyDetail>No artwork files shared.</EmptyDetail>
          )}
        </DetailPanel>
      ) : null}

      {details.garments ? (
        <DetailPanel icon={<FiPackage />} title="Garments">
          <ListDetail items={details.garments} empty="No garment details shared." />
        </DetailPanel>
      ) : null}

      {details.sizes ? (
        <DetailPanel icon={<FiPackage />} title="Sizes and quantities">
          <ListDetail items={details.sizes} empty="No sizes shared." />
        </DetailPanel>
      ) : null}

      {details.colors ? (
        <DetailPanel icon={<FiPackage />} title="Colours">
          <div className="flex flex-wrap gap-2">
            {details.colors.length ? (
              details.colors.map((color) => (
                <span
                  key={color}
                  className="rounded-full border border-[color:var(--partner-border)] bg-[var(--partner-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--partner-text)]"
                >
                  {color}
                </span>
              ))
            ) : (
              <EmptyDetail>No colours shared.</EmptyDetail>
            )}
          </div>
        </DetailPanel>
      ) : null}

      {details.print !== undefined ? (
        <DetailPanel icon={<FiFileText />} title="Print method">
          <TextDetail value={details.print} empty="No print method shared." />
        </DetailPanel>
      ) : null}

      {details.deadline !== undefined ? (
        <DetailPanel icon={<FiClock />} title="Deadline">
          <TextDetail value={details.deadline} empty="No deadline shared." />
        </DetailPanel>
      ) : null}

      {details.design ? (
        <DetailPanel icon={<FiImage />} title="Design placement">
          <ListDetail items={details.design} empty="No design placement details shared." />
        </DetailPanel>
      ) : null}

      {details.notes !== undefined ? (
        <DetailPanel icon={<FiMessageCircle />} title="Job notes">
          <TextDetail value={details.notes} empty="No notes shared." />
        </DetailPanel>
      ) : null}

      {details.delivery !== undefined ? (
        <DetailPanel icon={<FiTruck />} title="Delivery mode">
          <TextDetail value={details.delivery} empty="No delivery mode shared." />
        </DetailPanel>
      ) : null}
    </div>
  );
}

function DetailPanel({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[color:var(--partner-border)] bg-[var(--partner-card)] p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--partner-muted)] sm:text-xs sm:tracking-[0.18em]">
        <span className="text-[color:var(--partner-text)]">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );
}

function EmptyDetail({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[color:var(--partner-border)] bg-[var(--partner-soft)] px-4 py-4 text-sm text-[color:var(--partner-muted)] sm:py-5">
      {children}
    </div>
  );
}

function TextDetail({ value, empty }: { value: string; empty: string }) {
  if (!value.trim()) return <EmptyDetail>{empty}</EmptyDetail>;
  return <p className="whitespace-pre-wrap text-sm leading-6 text-[color:var(--partner-muted)]">{value}</p>;
}

function ListDetail({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <EmptyDetail>{empty}</EmptyDetail>;
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className="rounded-xl border border-[color:var(--partner-border)] bg-[var(--partner-soft)] px-3 py-2.5 text-sm font-medium text-[color:var(--partner-text)] sm:px-4 sm:py-3"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
