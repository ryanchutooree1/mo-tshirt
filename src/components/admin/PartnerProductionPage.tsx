"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import BackgroundRemoverPage from "@/components/admin/BackgroundRemoverPage";
import {
  FiAlertTriangle,
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiCheckCircle,
  FiClock,
  FiCreditCard,
  FiDollarSign,
  FiDownload,
  FiEdit3,
  FiFileText,
  FiFlag,
  FiImage,
  FiInfo,
  FiLock,
  FiLogOut,
  FiMail,
  FiMessageCircle,
  FiMoon,
  FiPackage,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiSun,
  FiTruck,
  FiXCircle,
} from "react-icons/fi";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import {
  getPrintPartner,
  PARTNER_CLIENT_STATUS_LABELS,
  PARTNER_DECISION_LABELS,
  PARTNER_DECISION_TONES,
  PARTNER_PRINT_PLACEMENT_LABELS,
  PARTNER_PRINT_PLACEMENT_OPTIONS,
  PARTNER_PRODUCTION_STATUS_LABELS,
  PARTNER_PRODUCTION_STATUSES,
  SHABANAZ_PRINT_PLACEMENT_OPTIONS,
  type PartnerDecision,
  type PartnerOrderAttachment,
  type PartnerOrderDetails,
  type PartnerOrderView,
  type PartnerPrintPlacement,
  type PartnerProductionStatus,
  type PrintPartner,
  type PrintPartnerId,
} from "@/lib/partners";

type SessionState = "checking" | "signed_out" | "signed_in";
type FilterKey = "all" | "pending" | "accepted" | "active" | "completed" | "rejected";
type SortKey = "assigned" | "deadline" | "status";
type MobilePanel = "queue" | "order";

type ResponseDraft = {
  decision: PartnerDecision;
  productionStatus: PartnerProductionStatus;
  printPlacement: PartnerPrintPlacement;
  completionDays: string;
  price: string;
  comments: string;
  missingInformation: string;
};

type WorkflowTone = "success" | "warning" | "danger" | "info" | "neutral";
type ResponseSectionTone = "cyan" | "amber" | "emerald" | "rose";

const RESPONSE_SAVE_LABELS: Record<PartnerDecision, string> = {
  pending: "Save response",
  accepted: "Save acceptance",
  needs_info: "Send need info request",
  rejected: "Save rejection",
};

const RESPONSE_SAVE_TONES: Record<PartnerDecision, string> = {
  pending:
    "bg-[var(--partner-accent)] text-[color:var(--partner-accent-text)] hover:opacity-90",
  accepted: "bg-emerald-600 text-white hover:bg-emerald-700",
  needs_info: "bg-amber-500 text-slate-950 hover:bg-amber-400",
  rejected: "bg-rose-600 text-white hover:bg-rose-700",
};

const WORKFLOW_TONE_CLASSES: Record<WorkflowTone, string> = {
  success:
    "border-[color:var(--partner-success-border)] bg-[var(--partner-success-bg)] text-[color:var(--partner-success-text)]",
  warning:
    "border-[color:var(--partner-warning-border)] bg-[var(--partner-warning-bg)] text-[color:var(--partner-warning-text)]",
  danger:
    "border-[color:var(--partner-danger-border)] bg-[var(--partner-danger-bg)] text-[color:var(--partner-danger-text)]",
  info:
    "border-[color:var(--partner-info-border)] bg-[var(--partner-info-bg)] text-[color:var(--partner-info-text)]",
  neutral:
    "border-[color:var(--partner-border)] bg-[var(--partner-soft)] text-[color:var(--partner-muted)]",
};

const RESPONSE_SECTION_TONES: Record<ResponseSectionTone, string> = {
  cyan: "border-cyan-500",
  amber: "border-amber-500",
  emerald: "border-emerald-500",
  rose: "border-rose-500",
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
    printPlacement: order?.printPlacement || "not_set",
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

function orderHasArtwork(details: PartnerOrderDetails) {
  return Boolean(details.artwork?.some((attachment) =>
    attachment.url || attachment.filename || attachment.label
  ));
}

function getArtworkDownloadHref(attachment: PartnerOrderAttachment, index: number) {
  if (!attachment.url) return "";

  const params = new URLSearchParams({
    url: attachment.url,
    name: attachment.filename || attachment.label || `artwork-${index + 1}`,
  });

  return `/api/shops/download?${params.toString()}`;
}

function isArtworkImage(attachment: PartnerOrderAttachment) {
  const contentType = attachment.contentType.toLowerCase();
  return Boolean(attachment.url && contentType.startsWith("image/"));
}

function isArtworkPdf(attachment: PartnerOrderAttachment) {
  const contentType = attachment.contentType.toLowerCase();
  const filename = attachment.filename.toLowerCase();
  return Boolean(
    attachment.url &&
      (contentType === "application/pdf" ||
        contentType.includes("pdf") ||
        filename.endsWith(".pdf"))
  );
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
    PARTNER_PRINT_PLACEMENT_LABELS[order.printPlacement],
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
  initialPartner,
}: {
  partnerId: PrintPartnerId;
  initialPartner?: PrintPartner | null;
}) {
  const { theme, toggleTheme } = useAdminTheme();
  const isDark = theme === "dark";
  const partner = initialPartner || getPrintPartner(partnerId);
  const productionNotes = partner.productionNotes;
  const paymentDetails = partner.paymentDetails;
  const printPlacementOptions =
    partner.supportsLogoPrintPlacements
      ? SHABANAZ_PRINT_PLACEMENT_OPTIONS
      : PARTNER_PRINT_PLACEMENT_OPTIONS;
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
  const [requestingLogoKey, setRequestingLogoKey] = useState<string | null>(null);
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
        "--partner-bg": isDark ? "#020617" : "#f4f7fb",
        "--partner-card": isDark ? "#0f172a" : "#ffffff",
        "--partner-soft": isDark ? "#111c2f" : "#f8fafc",
        "--partner-hover": isDark ? "#17243a" : "#eef4fb",
        "--partner-border": isDark ? "#243249" : "#d9e2ee",
        "--partner-text": isDark ? "#e5e7eb" : "#0f172a",
        "--partner-muted": isDark ? "#94a3b8" : "#64748b",
        "--partner-faint": isDark ? "#64748b" : "#94a3b8",
        "--partner-accent": isDark ? "#0e7490" : "#155e75",
        "--partner-accent-soft": isDark ? "#12364a" : "#e0f2fe",
        "--partner-accent-text": "#ffffff",
        "--partner-success-bg": isDark ? "#052e26" : "#ecfdf5",
        "--partner-success-border": isDark ? "#0f766e" : "#a7f3d0",
        "--partner-success-text": isDark ? "#a7f3d0" : "#065f46",
        "--partner-warning-bg": isDark ? "#3a2705" : "#fffbeb",
        "--partner-warning-border": isDark ? "#b45309" : "#fde68a",
        "--partner-warning-text": isDark ? "#fde68a" : "#92400e",
        "--partner-danger-bg": isDark ? "#3b0712" : "#fff1f2",
        "--partner-danger-border": isDark ? "#be123c" : "#fecdd3",
        "--partner-danger-text": isDark ? "#fecdd3" : "#9f1239",
        "--partner-info-bg": isDark ? "#082f49" : "#eff6ff",
        "--partner-info-border": isDark ? "#0369a1" : "#bfdbfe",
        "--partner-info-text": isDark ? "#bae6fd" : "#1e3a8a",
        "--partner-shadow": isDark
          ? "0 18px 50px rgba(0,0,0,0.28)"
          : "0 18px 45px rgba(15,23,42,0.08)",
        colorScheme: theme,
      }) as CSSProperties,
    [isDark, theme]
  );

  const shellClass =
    "min-h-screen bg-[var(--partner-bg)] text-[color:var(--partner-text)] transition-colors";
  const surfaceClass =
    "rounded-2xl border border-[color:var(--partner-border)] bg-[var(--partner-card)] shadow-[var(--partner-shadow)]";
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
  const responseSaveButtonClass =
    RESPONSE_SAVE_TONES[draft.decision] || RESPONSE_SAVE_TONES.pending;
  const responseSaveLabel = saving
    ? "Saving..."
    : RESPONSE_SAVE_LABELS[draft.decision] || RESPONSE_SAVE_LABELS.pending;
  const responseSaveIcon =
    draft.decision === "rejected" ? (
      <FiXCircle className="h-4 w-4" />
    ) : draft.decision === "needs_info" ? (
      <FiAlertTriangle className="h-4 w-4" />
    ) : (
      <FiCheckCircle className="h-4 w-4" />
    );
  const mobilePanelButtonClass = (active: boolean) =>
    `rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
      active
        ? "bg-[var(--partner-accent)] text-[color:var(--partner-accent-text)]"
        : "text-[color:var(--partner-muted)] hover:bg-[var(--partner-hover)]"
    }`;
  const productionRulesCard = productionNotes.length ? (
    <div className={`rounded-2xl border p-4 sm:p-5 ${softSurfaceClass}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--partner-accent)] text-[color:var(--partner-accent-text)]">
          <FiInfo className="h-4 w-4" />
        </span>
        <div>
          <p className={sectionLabelClass}>Production rules</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-6 text-[color:var(--partner-muted)]">
            {productionNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  ) : null;
  const paymentDetailsCard = paymentDetails ? (
    <details className={`group rounded-2xl border ${softSurfaceClass}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 marker:hidden sm:p-4 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <FiCreditCard className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className={sectionLabelClass}>Payment details</p>
            <p className="mt-1 truncate text-sm font-semibold text-[color:var(--partner-text)]">
              {paymentDetails.fullName}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-[color:var(--partner-border)] bg-[var(--partner-card)] px-3 py-1.5 text-xs font-semibold text-[color:var(--partner-muted)]">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <div className="border-t border-[color:var(--partner-border)] p-3 sm:p-4">
        <dl className="grid gap-2 text-sm leading-6 sm:grid-cols-2">
          {[
            ["Full name", paymentDetails.fullName],
            ["Bank name", paymentDetails.bankName],
            ["Bank account number", paymentDetails.bankAccountNumber],
            ["Juice number", paymentDetails.juiceNumber],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-[color:var(--partner-border)] bg-[var(--partner-card)] px-3 py-2"
            >
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--partner-muted)]">
                {label}
              </dt>
              <dd className="mt-1 break-words font-semibold text-[color:var(--partner-text)]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  ) : null;

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

  async function saveResponse() {
    if (!selected) return;
    const decision = draft.decision;
    if (decision === "accepted") {
      if (!draft.completionDays.trim() || Number(draft.completionDays) <= 0) {
        setNotice("Add how many days you need before accepting.");
        return;
      }
      if (!draft.price.trim() || Number(draft.price) <= 0) {
        setNotice("Add your price before accepting.");
        return;
      }
    }
    if (decision === "needs_info" && !draft.missingInformation.trim()) {
      setNotice("Write what Ryan must get or fix before sending the request.");
      return;
    }
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
          printPlacement: draft.printPlacement,
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
      setNotice(
        data?.actionEmailSent
          ? "Saved. Ryan was emailed for action."
          : data?.actionEmailWarning
            ? `Saved, but Ryan email failed: ${data.actionEmailWarning}`
            : "Saved."
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save response.");
    } finally {
      setSaving(false);
    }
  }

  async function requestLogoUpload(
    attachment: PartnerOrderAttachment,
    attachmentIndex: number
  ) {
    if (!selected) return;

    const requestKey = `${selected.id}:${attachmentIndex}`;
    setRequestingLogoKey(requestKey);
    setNotice(null);

    try {
      const res = await fetch(`/api/partners/orders/${selected.id}/logo-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId,
          attachmentFilename: attachment.filename,
          attachmentLabel: attachment.label,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Could not ask Ryan to upload the logo.");
      }
      setNotice(data?.message || `Asked Ryan to upload the logo for ${selected.code}.`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not ask Ryan to upload the logo."
      );
    } finally {
      setRequestingLogoKey(null);
    }
  }

  async function requestClientLogo() {
    if (!selected) return;

    const requestKey = `${selected.id}:client-logo`;
    setRequestingLogoKey(requestKey);
    setNotice(null);

    try {
      const res = await fetch(`/api/partners/orders/${selected.id}/logo-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId,
          attachmentLabel: "Logo / artwork",
          requestType: "ask_client_for_logo",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Could not ask Ryan to request the logo.");
      }
      setNotice(
        data?.message ||
          `Asked Ryan to request the logo from the client for ${selected.code}.`
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not ask Ryan to request the logo."
      );
    } finally {
      setRequestingLogoKey(null);
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
              {productionRulesCard ? (
                <div className="mt-5 max-w-2xl sm:mt-6">{productionRulesCard}</div>
              ) : null}
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

      <div className="mx-auto max-w-[1500px] px-3 pt-3 sm:px-6 sm:pt-5 lg:px-8">
        {productionRulesCard || paymentDetailsCard ? (
          <div
            className={`mb-3 grid items-start gap-3 sm:mb-5 ${
              productionRulesCard && paymentDetailsCard ? "lg:grid-cols-2" : ""
            }`}
          >
            {productionRulesCard}
            {paymentDetailsCard}
          </div>
        ) : null}
        <details className={`${surfaceClass} group overflow-hidden`}>
          <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 marker:hidden sm:flex-row sm:items-center sm:justify-between sm:p-5 [&::-webkit-details-marker]:hidden">
            <div>
              <p className={sectionLabelClass}>Tools for today</p>
              <h2 className="mt-2 flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
                <FiImage className="h-5 w-5 text-[color:var(--partner-muted)]" />
                Background Remover
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--partner-muted)]">
                Remove backgrounds from logo and artwork files, then download a transparent PNG.
              </p>
            </div>
            <span className={`${secondaryButtonClass} pointer-events-none text-xs sm:text-sm`}>
              <span className="group-open:hidden">Open tool</span>
              <span className="hidden group-open:inline">Hide tool</span>
            </span>
          </summary>
          <div className="border-t border-[color:var(--partner-border)] p-3 sm:p-5">
            <BackgroundRemoverPage />
          </div>
        </details>
      </div>

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
                      {order.isShared ? (
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                            active
                              ? "border-white/20 bg-white/10 text-white"
                              : "border-cyan-200 bg-cyan-50 text-cyan-800"
                          }`}
                        >
                          Shared
                        </span>
                      ) : null}
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
                <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
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
                      {selected.isShared ? (
                        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800">
                          Shared offer - first acceptance owns it
                        </span>
                      ) : null}
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

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3 2xl:min-w-[720px]">
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
                    <Metric
                      icon={<FiImage />}
                      label="Placement"
                      value={PARTNER_PRINT_PLACEMENT_LABELS[selected.printPlacement]}
                    />
                    <Metric
                      icon={<FiMessageCircle />}
                      label="Client"
                      value={PARTNER_CLIENT_STATUS_LABELS[selected.clientStatus]}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(420px,480px)]">
                <div className="space-y-5">
                  <WorkflowSteps
                    order={selected}
                    draft={draft}
                    onRequestClientLogo={requestClientLogo}
                    requestingLogoKey={requestingLogoKey}
                  />

                  <OrderDetails
                    details={selected.details}
                    orderId={selected.id}
                    onRequestLogoUpload={requestLogoUpload}
                    onRequestClientLogo={requestClientLogo}
                    requestingLogoKey={requestingLogoKey}
                  />
                </div>

                <div className={`${surfaceClass} overflow-hidden 2xl:sticky 2xl:top-5`}>
                  <div className="border-b border-[color:var(--partner-border)] bg-[linear-gradient(135deg,var(--partner-accent-soft),var(--partner-card))] p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--partner-accent)] text-[color:var(--partner-accent-text)]">
                        <FiSend className="h-4 w-4" />
                      </span>
                      <div>
                        <p className={sectionLabelClass}>
                          Partner response
                        </p>
                        <h3 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--partner-text)]">
                          Decision, quote, production update
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-[color:var(--partner-muted)]">
                          Give Ryan the exact answer he needs to move the order without a follow-up call.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5 p-4 sm:p-5">
                    <ResponseSection
                      icon={<FiFlag className="h-4 w-4" />}
                      label="Step 2"
                      title="Choose the job decision"
                      tone="cyan"
                    >
                      <div className="grid grid-cols-3 gap-2">
                        <DecisionButton
                          active={draft.decision === "accepted"}
                          label="Accept"
                          icon={<FiCheckCircle />}
                          tone="accept"
                          onClick={() =>
                            setDraft((current) => ({ ...current, decision: "accepted" }))
                          }
                        />
                        <DecisionButton
                          active={draft.decision === "needs_info"}
                          label="Need info"
                          icon={<FiAlertTriangle />}
                          tone="info"
                          onClick={() =>
                            setDraft((current) => ({ ...current, decision: "needs_info" }))
                          }
                        />
                        <DecisionButton
                          active={draft.decision === "rejected"}
                          label="Reject"
                          icon={<FiXCircle />}
                          tone="reject"
                          onClick={() =>
                            setDraft((current) => ({ ...current, decision: "rejected" }))
                          }
                        />
                      </div>
                    </ResponseSection>

                    <ResponseSection
                      icon={<FiDollarSign className="h-4 w-4" />}
                      label="Step 3"
                      title="Quote Ryan clearly"
                      tone="amber"
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
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
                      </div>
                    </ResponseSection>

                    <ResponseSection
                      icon={<FiTruck className="h-4 w-4" />}
                      label="Steps 1 + 6"
                      title="Confirm print plan"
                      tone="emerald"
                    >
                      <div className="grid gap-3">
                        <label className={fieldLabelClass}>
                          Print placement
                          <select
                            value={draft.printPlacement}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                printPlacement: event.target.value as PartnerPrintPlacement,
                              }))
                            }
                            className={`mt-2 normal-case tracking-normal ${inputClass}`}
                          >
                            {printPlacementOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <span className="mt-2 block text-xs normal-case tracking-normal text-[color:var(--partner-muted)]">
                            Prefilled from Ryan&apos;s quotation or the client request when available.
                          </span>
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
                      </div>
                    </ResponseSection>

                    <ResponseSection
                      icon={<FiEdit3 className="h-4 w-4" />}
                      label="Step 7"
                      title="Notes and blockers"
                      tone="rose"
                    >
                      <div className="grid gap-3">
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
                            placeholder="Tell Ryan what he must get before you can print."
                          />
                          <span className="mt-2 block text-xs normal-case tracking-normal text-[color:var(--partner-muted)]">
                            If this field is filled or Need info is selected, Ryan gets an email after saving.
                          </span>
                        </label>
                      </div>
                    </ResponseSection>

                    <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => saveResponse()}
                      disabled={saving}
                      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition disabled:opacity-60 ${responseSaveButtonClass}`}
                    >
                      {responseSaveIcon}
                      {responseSaveLabel}
                    </button>
                    </div>

                    {notice ? (
                      <p className={`rounded-xl border px-4 py-3 text-sm text-[color:var(--partner-text)] ${softSurfaceClass}`}>
                        {notice}
                      </p>
                    ) : null}
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

function WorkflowSteps({
  order,
  draft,
  onRequestClientLogo,
  requestingLogoKey,
}: {
  order: PartnerOrderView;
  draft: ResponseDraft;
  onRequestClientLogo: () => void;
  requestingLogoKey: string | null;
}) {
  const hasArtwork = orderHasArtwork(order.details);
  const days = Number(draft.completionDays);
  const price = Number(draft.price);
  const hasOffer = Number.isFinite(days) && days > 0 && Number.isFinite(price) && price > 0;
  const actionNeeded = draft.decision === "needs_info" || Boolean(draft.missingInformation.trim());
  const logoRequestKey = `${order.id}:client-logo`;
  const flowStatus = actionNeeded
    ? "Ryan action needed"
    : hasOffer && draft.decision === "accepted"
      ? "Ready for Ryan"
      : hasOffer
        ? "Quote drafted"
        : "Quote needed";
  const flowTone: WorkflowTone = actionNeeded ? "warning" : hasOffer ? "success" : "neutral";
  const steps: Array<{
    title: string;
    value: string;
    helper: string;
    icon: ReactNode;
    tone: WorkflowTone;
    action: ReactNode;
  }> = [
    {
      title: "Artwork",
      value: hasArtwork ? "Ready" : "Missing",
      helper: hasArtwork ? "Open and check the logo before quoting." : "Ask Ryan before any print work starts.",
      icon: <FiImage />,
      tone: hasArtwork
        ? "success"
        : "warning",
      action: hasArtwork ? null : (
        <button
          type="button"
          onClick={onRequestClientLogo}
          disabled={requestingLogoKey === logoRequestKey}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
        >
          <FiAlertTriangle className="h-3.5 w-3.5" />
          {requestingLogoKey === logoRequestKey
            ? "Sending..."
            : "Ask Ryan for client logo"}
        </button>
      ),
    },
    {
      title: "Decision",
      value:
        draft.decision === "accepted"
          ? "Accepted"
          : draft.decision === "rejected"
            ? "Rejected"
            : draft.decision === "needs_info"
              ? "Need info"
              : "Waiting",
      icon:
        draft.decision === "rejected" ? (
          <FiXCircle />
        ) : draft.decision === "needs_info" ? (
          <FiAlertTriangle />
        ) : (
          <FiCheckCircle />
        ),
      tone:
        draft.decision === "accepted"
          ? "success"
          : draft.decision === "rejected"
            ? "danger"
            : draft.decision === "needs_info"
              ? "warning"
              : "neutral",
      helper: "Accept, request info, or reject from the response panel.",
      action: null,
    },
    {
      title: "Days + price",
      value: hasOffer ? `${days}d / Rs ${price}` : "Needed",
      helper: "Required before an acceptance can be saved.",
      icon: <FiClock />,
      tone: hasOffer
        ? "success"
        : "neutral",
      action: null,
    },
    {
      title: "Ryan price",
      value: hasOffer ? "Ready for Ryan" : "Waiting",
      helper: "Ryan uses this to quote and confirm the client.",
      icon: <FiMail />,
      tone: hasOffer
        ? "info"
        : "neutral",
      action: null,
    },
    {
      title: "Client",
      value: PARTNER_CLIENT_STATUS_LABELS[order.clientStatus],
      helper: "Ryan keeps client approval and payment status here.",
      icon: <FiMessageCircle />,
      tone:
        order.clientStatus === "confirmed_half_payment"
          ? "success"
          : order.clientStatus === "changes_needed"
            ? "warning"
            : "neutral",
      action: null,
    },
    {
      title: "Production",
      value: PARTNER_PRODUCTION_STATUS_LABELS[draft.productionStatus],
      helper: "Update this as the job moves through your shop.",
      icon: <FiTruck />,
      tone:
        draft.productionStatus === "completed" ||
        draft.productionStatus === "ryan_to_collect"
          ? "success"
          : "neutral",
      action: null,
    },
    {
      title: "Ryan action",
      value: actionNeeded ? "Email on save" : "No block",
      helper: actionNeeded ? "Ryan gets the blocker when you save." : "Nothing blocks production right now.",
      icon: <FiAlertTriangle />,
      tone: actionNeeded
        ? "warning"
        : "neutral",
      action: null,
    },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-[color:var(--partner-border)] bg-[var(--partner-card)] shadow-[var(--partner-shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--partner-border)] bg-[linear-gradient(135deg,var(--partner-soft),var(--partner-card))] p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--partner-muted)] sm:text-xs sm:tracking-[0.2em]">
            Production protocol
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--partner-text)]">
            {order.code} fast path
          </h3>
        </div>
        <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${WORKFLOW_TONE_CLASSES[flowTone]}`}>
          {flowStatus}
        </span>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 2xl:grid-cols-4">
        {steps.map((step, index) => (
          <div key={step.title} className={`rounded-xl border p-4 ${WORKFLOW_TONE_CLASSES[step.tone]}`}>
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/70 text-base text-current">
                {step.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">
                  Step {index + 1}
                </p>
                <h4 className="mt-1 text-sm font-semibold text-current">
                  {step.title}
                </h4>
                <p className="mt-2 line-clamp-2 text-sm font-semibold">
                  {step.value}
                </p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 opacity-75">
                  {step.helper}
                </p>
              </div>
            </div>
            {step.action}
          </div>
        ))}
      </div>
    </section>
  );
}

function DecisionButton({
  active,
  label,
  icon,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  tone: "accept" | "info" | "reject";
  onClick: () => void;
}) {
  const toneClass = {
    accept: active
      ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
      : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
    info: active
      ? "border-amber-500 bg-amber-500 text-white shadow-sm"
      : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
    reject: active
      ? "border-rose-600 bg-rose-600 text-white shadow-sm"
      : "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-16 flex-col items-center justify-center gap-2 rounded-xl border px-2 text-xs font-semibold transition sm:min-h-20 ${toneClass}`}
    >
      <span className="text-base">{icon}</span>
      {label}
    </button>
  );
}

function ResponseSection({
  icon,
  label,
  title,
  tone,
  children,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  tone: ResponseSectionTone;
  children: ReactNode;
}) {
  return (
    <section className={`border-l-4 pl-4 ${RESPONSE_SECTION_TONES[tone]}`}>
      <div className="mb-3 flex items-center gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--partner-border)] bg-[var(--partner-soft)] text-[color:var(--partner-text)]">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--partner-muted)]">
            {label}
          </p>
          <h4 className="mt-0.5 text-sm font-semibold text-[color:var(--partner-text)]">
            {title}
          </h4>
        </div>
      </div>
      {children}
    </section>
  );
}

function OrderDetails({
  details,
  orderId,
  onRequestLogoUpload,
  onRequestClientLogo,
  requestingLogoKey,
}: {
  details: PartnerOrderDetails;
  orderId: string;
  onRequestLogoUpload: (
    attachment: PartnerOrderAttachment,
    attachmentIndex: number
  ) => void;
  onRequestClientLogo: () => void;
  requestingLogoKey: string | null;
}) {
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
                const isImage = isArtworkImage(attachment);
                const isPdf = isArtworkPdf(attachment);
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
                    ) : isPdf && attachment.url ? (
                      <div className="mt-3 overflow-hidden rounded-lg border border-[color:var(--partner-border)] bg-white">
                        <iframe
                          src={attachment.url}
                          title={`Preview ${attachment.filename || "PDF artwork"}`}
                          className="h-72 w-full bg-white sm:h-96"
                        />
                      </div>
                    ) : !attachment.url ? (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-900">
                        <p>
                          Ryan received this file by email only. Ask Ryan to re-upload it in
                          Quotation Approval so you can open the artwork here.
                        </p>
                        <button
                          type="button"
                          onClick={() => onRequestLogoUpload(attachment, index)}
                          disabled={requestingLogoKey === `${orderId}:${index}`}
                          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#f97316,#e11d48)] px-4 py-2.5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(225,29,72,0.24)] transition hover:shadow-[0_18px_36px_rgba(225,29,72,0.32)] disabled:cursor-not-allowed disabled:opacity-65 sm:w-auto"
                        >
                          <FiMessageCircle className="h-4 w-4" />
                          {requestingLogoKey === `${orderId}:${index}`
                            ? "Asking Ryan..."
                            : "Ask Ryan to upload logo"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyDetail>
              <div className="space-y-3">
                <p>No artwork files shared.</p>
                <button
                  type="button"
                  onClick={onRequestClientLogo}
                  disabled={requestingLogoKey === `${orderId}:client-logo`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(8,145,178,0.24)] transition hover:bg-cyan-700 hover:shadow-[0_18px_36px_rgba(8,145,178,0.32)] disabled:cursor-not-allowed disabled:opacity-65 sm:w-auto"
                >
                  <FiMessageCircle className="h-4 w-4" />
                  {requestingLogoKey === `${orderId}:client-logo`
                    ? "Asking Ryan..."
                    : "Ask Ryan to ask client for logo"}
                </button>
              </div>
            </EmptyDetail>
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
