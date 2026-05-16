"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import {
  FiAlertTriangle,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiFileText,
  FiImage,
  FiLock,
  FiLogOut,
  FiMessageCircle,
  FiPackage,
  FiRefreshCw,
  FiTruck,
  FiXCircle,
} from "react-icons/fi";
import {
  getPrintPartner,
  PARTNER_DECISION_LABELS,
  PARTNER_DECISION_TONES,
  PARTNER_PRODUCTION_STATUS_LABELS,
  PARTNER_PRODUCTION_STATUSES,
  type PartnerDecision,
  type PartnerOrderDetails,
  type PartnerOrderView,
  type PartnerProductionStatus,
  type PrintPartnerId,
} from "@/lib/partners";

type SessionState = "checking" | "signed_out" | "signed_in";
type FilterKey = "all" | "pending" | "accepted" | "active" | "completed" | "rejected";

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

export default function PartnerProductionPage({
  partnerId,
}: {
  partnerId: PrintPartnerId;
}) {
  const partner = getPrintPartner(partnerId);
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [orders, setOrders] = useState<PartnerOrderView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [draft, setDraft] = useState<ResponseDraft>(() => buildDraft(null));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = useMemo(
    () => orders.find((order) => order.id === selectedId) || orders[0] || null,
    [orders, selectedId]
  );

  const filteredOrders = useMemo(
    () => orders.filter((order) => orderMatchesFilter(order, filter)),
    [orders, filter]
  );

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
      <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-white">
        <div className="flex items-center gap-3 text-sm font-semibold">
          <FiRefreshCw className="h-5 w-5 animate-spin" />
          Opening partner desk
        </div>
      </main>
    );
  }

  if (sessionState === "signed_out") {
    return (
      <main className="min-h-screen bg-slate-950 px-5 py-8 text-white sm:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
          <div className="grid w-full gap-6 lg:grid-cols-[1fr_420px] lg:items-center">
            <section className="py-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                MO T-SHIRT partner production
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
                {partner.name} production desk
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
                Orders assigned by Ryan appear here with only the production details he chooses to share.
              </p>
              <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
                {[
                  ["Accept or reject", "Confirm capacity fast."],
                  ["Price your work", "Send cost and timing."],
                  ["Update status", "Keep Ryan in sync."],
                ].map(([title, copy]) => (
                  <div key={title} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{copy}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white p-6 text-slate-950 shadow-2xl sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <Image
                  src="/logo_transparent.png"
                  alt="MO T-SHIRT"
                  width={130}
                  height={52}
                  className="h-12 w-auto"
                />
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <FiLock className="h-5 w-5" />
                </span>
              </div>
              <h2 className="mt-8 text-2xl font-semibold tracking-tight">Enter password</h2>
              <form onSubmit={login} className="mt-6 space-y-4">
                <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Partner password
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    required
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm normal-case tracking-normal text-slate-950 outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
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
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-black"
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
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {partner.name}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500">
                Private production queue
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Assigned orders
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadOrders}
              disabled={loadingOrders}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <FiRefreshCw className={`h-4 w-4 ${loadingOrders ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <FiLogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-8">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-2">
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
                    className={`rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition ${
                      active
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                    }`}
                  >
                    <span className="block">{label}</span>
                    <span className="mt-1 block opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            {ordersError ? (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {ordersError}
              </div>
            ) : null}
            <div className="space-y-2">
              {filteredOrders.map((order) => {
                const active = selected?.id === order.id;
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => setSelectedId(order.id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      active
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{order.code}</p>
                        <p className={`mt-1 text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>
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
                    <div className={`mt-3 grid grid-cols-3 gap-2 text-[11px] ${active ? "text-slate-300" : "text-slate-500"}`}>
                      <span>{order.summary.pieces ? `${order.summary.pieces} pcs` : "Qty hidden"}</span>
                      <span>{order.summary.deadline || "No deadline"}</span>
                      <span>{getDetailCount(order.details)} fields</span>
                    </div>
                  </button>
                );
              })}
              {!filteredOrders.length ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  No orders in this view.
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          {selected ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Order {selected.code}
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                      {selected.summary.product || "Production details"}
                    </h2>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${PARTNER_DECISION_TONES[selected.decision]}`}>
                        {PARTNER_DECISION_LABELS[selected.decision]}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
                        {PARTNER_PRODUCTION_STATUS_LABELS[selected.productionStatus]}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">
                        Assigned {formatDate(selected.assignedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
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

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
                <div className="space-y-5">
                  <OrderDetails details={selected.details} />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
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
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
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
                        className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm normal-case tracking-normal text-slate-950 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
                        placeholder="e.g. 3"
                      />
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
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
                        className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm normal-case tracking-normal text-slate-950 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
                        placeholder="Rs"
                      />
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Production status
                      <select
                        value={draft.productionStatus}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            productionStatus: event.target.value as PartnerProductionStatus,
                          }))
                        }
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm normal-case tracking-normal text-slate-950 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
                      >
                        {PARTNER_PRODUCTION_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {PARTNER_PRODUCTION_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
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
                        className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm normal-case tracking-normal text-slate-950 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
                        placeholder="Production notes, price explanation, or delivery plan."
                      />
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
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
                        className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm normal-case tracking-normal text-slate-950 outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100"
                        placeholder="Tell Ryan what is missing before you can print."
                      />
                    </label>
                  </div>

                  <div className="mt-5 grid gap-2">
                    <button
                      type="button"
                      onClick={() => saveResponse()}
                      disabled={saving}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
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
                    <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      {notice}
                    </p>
                  ) : null}

                  <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-500">
                    Customer name, phone, email, and address are hidden on this desk.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
              <FiPackage className="mx-auto h-8 w-8 text-slate-400" />
              <h2 className="mt-4 text-xl font-semibold">No assigned orders yet</h2>
              <p className="mt-2 text-sm text-slate-500">
                New jobs will appear here when Ryan moves an order to {partner.name}.
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
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        <span className="text-slate-700">{icon}</span>
        {label}
      </div>
      <div className="mt-2 line-clamp-2 text-sm font-semibold text-slate-950">{value}</div>
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
      className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border px-2 text-xs font-semibold transition ${
        active
          ? "border-slate-950 bg-slate-950 text-white"
          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
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
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
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
                return (
                  <div
                    key={`${attachment.url || attachment.filename}-${index}`}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {attachment.filename}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {attachment.label}
                          {attachment.quantity ? ` - Qty ${attachment.quantity}` : ""}
                        </p>
                      </div>
                      {attachment.url ? (
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          Open
                        </a>
                      ) : null}
                    </div>
                    {isImage ? (
                      <img
                        src={attachment.url}
                        alt={attachment.filename}
                        className="mt-3 max-h-72 w-full rounded-lg border border-slate-200 bg-white object-contain"
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
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
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
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        <span className="text-slate-800">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );
}

function EmptyDetail({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
      {children}
    </div>
  );
}

function TextDetail({ value, empty }: { value: string; empty: string }) {
  if (!value.trim()) return <EmptyDetail>{empty}</EmptyDetail>;
  return <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p>;
}

function ListDetail({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <EmptyDetail>{empty}</EmptyDetail>;
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
