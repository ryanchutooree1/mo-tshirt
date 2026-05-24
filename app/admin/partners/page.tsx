"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import UnsavedChangesGuard from "@/components/admin/UnsavedChangesGuard";
import type {
  PartnerPaymentDetails,
  PrintPartner,
  ProductionManager,
} from "@/lib/partners";

type PartnerDraft = PrintPartner & {
  password: string;
};

const emptyPaymentDetails: PartnerPaymentDetails = {
  fullName: "",
  bankName: "",
  bankAccountNumber: "",
  juiceNumber: "",
};

const defaultManager: ProductionManager = {
  name: "Tanvi",
  email: "",
};

function getPartnerEmails(partner: PartnerDraft) {
  if (Array.isArray(partner.emails)) return partner.emails;
  return partner.email ? [partner.email] : [];
}

function toPartnerDraft(partner: PrintPartner): PartnerDraft {
  return {
    ...partner,
    productionNotes: Array.isArray(partner.productionNotes) ? partner.productionNotes : [],
    paymentDetails: partner.paymentDetails || null,
    emails: Array.isArray(partner.emails) ? partner.emails : partner.email ? [partner.email] : [],
    password: "",
  };
}

function normalizeForCompare(partners: PartnerDraft[]) {
  return partners.map((partner) => ({
    ...partner,
    password: partner.password ? "__changed__" : "",
    emails: getPartnerEmails(partner),
    productionNotes: partner.productionNotes,
    paymentDetails: partner.paymentDetails || null,
  }));
}

function haveSameSettings(left: PartnerDraft[], right: PartnerDraft[]) {
  return JSON.stringify(normalizeForCompare(left)) === JSON.stringify(normalizeForCompare(right));
}

function haveSameManager(left: ProductionManager, right: ProductionManager) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function makePartnerId(name: string, existingIds: string[]) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "partner";
  let candidate = base;
  let index = 2;

  while (existingIds.includes(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

function createNewPartner(existingIds: string[]): PartnerDraft {
  const id = makePartnerId("new partner", existingIds);
  return {
    id,
    name: "New Partner",
    path: `/admin/partners/${id}`,
    active: true,
    productionNotes: [],
    paymentDetails: null,
    email: "",
    emails: [""],
    emailNotificationsEnabled: false,
    supportsLogoPrintPlacements: false,
    hasPassword: false,
    password: "",
  };
}

export default function AdminPartnersPage() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";
  const [manager, setManager] = useState<ProductionManager>(defaultManager);
  const [savedManager, setSavedManager] = useState<ProductionManager>(defaultManager);
  const [partners, setPartners] = useState<PartnerDraft[]>([]);
  const [savedPartners, setSavedPartners] = useState<PartnerDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasChanges = useMemo(
    () => !haveSameSettings(partners, savedPartners) || !haveSameManager(manager, savedManager),
    [manager, partners, savedManager, savedPartners]
  );
  const activeCount = partners.filter((partner) => partner.active).length;
  const recipientCount = partners.reduce(
    (count, partner) => count + getPartnerEmails(partner).filter(Boolean).length,
    0
  );

  const pageClass = isDark
    ? "min-h-screen overflow-x-hidden bg-slate-950 text-slate-100"
    : "min-h-screen overflow-x-hidden bg-[#f4f7fb] text-slate-950";
  const panelClass = isDark
    ? "rounded-[24px] border border-white/10 bg-white/[0.06] shadow-[0_22px_60px_rgba(5,12,24,0.42)]"
    : "rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]";
  const softPanelClass = isDark
    ? "border-white/10 bg-slate-900/80"
    : "border-slate-200 bg-slate-50";
  const mutedTextClass = isDark ? "text-slate-400" : "text-slate-500";
  const inputClass = isDark
    ? "w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-base text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10 sm:text-sm"
    : "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-700 focus:ring-4 focus:ring-cyan-700/10 sm:text-sm";
  const smallLabelClass = `text-[11px] font-semibold uppercase tracking-[0.16em] ${mutedTextClass}`;

  const loadPartners = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/partners", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load partners.");
      }
      const nextPartners = Array.isArray(data?.partners)
        ? (data.partners as PrintPartner[]).map(toPartnerDraft)
        : [];
      const nextManager =
        data?.manager && typeof data.manager === "object"
          ? (data.manager as ProductionManager)
          : defaultManager;
      setManager(nextManager);
      setSavedManager(nextManager);
      setPartners(nextPartners);
      setSavedPartners(nextPartners);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load partners.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPartners();
  }, []);

  const updatePartner = (partnerId: string, patch: Partial<PartnerDraft>) => {
    setPartners((current) =>
      current.map((partner) => {
        if (partner.id !== partnerId) return partner;
        const next = { ...partner, ...patch };
        const emails = patch.emails ? patch.emails : getPartnerEmails(next);
        return { ...next, email: emails[0] || "", emails };
      })
    );
    setNotice(null);
    setError(null);
  };

  const updatePartnerId = (currentId: string, nextId: string) => {
    const cleanId = nextId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    setPartners((current) =>
      current.map((partner) =>
        partner.id === currentId
          ? {
              ...partner,
              id: cleanId,
              path:
                cleanId === "yan"
                  ? "/admin/yan_list"
                  : cleanId === "shabanaz"
                    ? "/admin/shab_list"
                    : `/admin/partners/${cleanId}`,
            }
          : partner
      )
    );
    setNotice(null);
    setError(null);
  };

  const updatePartnerEmail = (partnerId: string, emailIndex: number, email: string) => {
    setPartners((current) =>
      current.map((partner) => {
        if (partner.id !== partnerId) return partner;
        const emails = getPartnerEmails(partner).slice();
        emails[emailIndex] = email;
        return { ...partner, email: emails[0] || "", emails };
      })
    );
    setNotice(null);
    setError(null);
  };

  const addPartnerEmail = (partnerId: string) => {
    setPartners((current) =>
      current.map((partner) => {
        if (partner.id !== partnerId) return partner;
        const emails = [...getPartnerEmails(partner), ""];
        return { ...partner, email: emails[0] || "", emails };
      })
    );
    setNotice(null);
    setError(null);
  };

  const removePartnerEmail = (partnerId: string, emailIndex: number) => {
    setPartners((current) =>
      current.map((partner) => {
        if (partner.id !== partnerId) return partner;
        const emails = getPartnerEmails(partner).filter((_, index) => index !== emailIndex);
        return { ...partner, email: emails[0] || "", emails };
      })
    );
    setNotice(null);
    setError(null);
  };

  const updatePaymentDetails = (
    partnerId: string,
    key: keyof PartnerPaymentDetails,
    value: string
  ) => {
    setPartners((current) =>
      current.map((partner) => {
        if (partner.id !== partnerId) return partner;
        const paymentDetails = {
          ...(partner.paymentDetails || emptyPaymentDetails),
          [key]: value,
        };
        const hasPayment = Object.values(paymentDetails).some((entry) => entry.trim());
        return { ...partner, paymentDetails: hasPayment ? paymentDetails : null };
      })
    );
    setNotice(null);
    setError(null);
  };

  const updateProductionNotes = (partnerId: string, value: string) => {
    updatePartner(partnerId, {
      productionNotes: value
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    });
  };

  const addPartner = () => {
    setPartners((current) => [...current, createNewPartner(current.map((partner) => partner.id))]);
    setNotice(null);
    setError(null);
  };

  const removePartner = (partnerId: string) => {
    setPartners((current) => current.filter((partner) => partner.id !== partnerId));
    setNotice(null);
    setError(null);
  };

  const savePartners = async () => {
    if (!hasChanges) return true;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/partners", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partners, manager }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to save partners.");
      }
      const nextPartners = Array.isArray(data?.partners)
        ? (data.partners as PrintPartner[]).map(toPartnerDraft)
        : partners.map((partner) => ({ ...partner, password: "" }));
      const nextManager =
        data?.manager && typeof data.manager === "object"
          ? (data.manager as ProductionManager)
          : manager;
      setManager(nextManager);
      setSavedManager(nextManager);
      setPartners(nextPartners);
      setSavedPartners(nextPartners);
      setNotice("Partner settings saved.");
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save partners.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={pageClass}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:gap-6 sm:px-6 sm:py-8">
        <header className={`${panelClass} p-5 sm:p-8`}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                  isDark
                    ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                    : "border-cyan-200 bg-cyan-50 text-cyan-900"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Partner Control
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-4xl">
                Production partners
              </h1>
              <p className={`mt-2 max-w-3xl text-sm leading-6 ${mutedTextClass}`}>
                Add, remove, and configure the partner desks used by Quotation / Invoice.
                Each active partner gets a private desk link and password.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:min-w-[22rem]">
              <div className={`rounded-2xl border px-4 py-4 ${softPanelClass}`}>
                <div className={smallLabelClass}>Active</div>
                <div className="mt-2 text-2xl font-semibold">{activeCount}</div>
              </div>
              <div className={`rounded-2xl border px-4 py-4 ${softPanelClass}`}>
                <div className={smallLabelClass}>Recipients</div>
                <div className="mt-2 text-2xl font-semibold">{recipientCount}</div>
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {notice}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={addPartner}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-900"
          >
            <UserPlus className="h-4 w-4" />
            Add partner
          </button>
          <button
            type="button"
            onClick={loadPartners}
            disabled={loading}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
              isDark
                ? "border-white/10 bg-white/10 text-slate-100 hover:bg-white/15"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Reload
          </button>
        </div>

        <section className={`${panelClass} p-4 sm:p-5`}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-900">
                <Users className="h-3.5 w-3.5" />
                Production manager
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight">
                {manager.name || "Production manager"}
              </h2>
              <p className={`mt-2 max-w-3xl text-sm leading-6 ${mutedTextClass}`}>
                This manager sees Quotation / Invoice, decides which partner receives each
                order, and tracks partner blockers before print work starts.
              </p>
              <Link
                href="/admin/quotation-approval"
                className={`mt-4 inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                  isDark
                    ? "border-white/10 bg-white/10 text-slate-100 hover:bg-white/15"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Open Quotation / Invoice
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid w-full gap-3 lg:max-w-xl lg:grid-cols-2">
              <label className={smallLabelClass}>
                Manager name
                <input
                  value={manager.name}
                  onChange={(event) =>
                    setManager((current) => ({ ...current, name: event.target.value }))
                  }
                  className={`mt-2 normal-case tracking-normal ${inputClass}`}
                  placeholder="Tanvi"
                />
              </label>
              <label className={smallLabelClass}>
                Manager email
                <input
                  type="email"
                  value={manager.email}
                  onChange={(event) =>
                    setManager((current) => ({
                      ...current,
                      email: event.target.value.trim().toLowerCase(),
                    }))
                  }
                  className={`mt-2 normal-case tracking-normal ${inputClass}`}
                  placeholder="tanvi@example.com"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="grid gap-4">
          {partners.map((partner) => {
            const emails = getPartnerEmails(partner);
            const savedEmails = emails.filter(Boolean);
            const activeNotifications =
              partner.emailNotificationsEnabled && savedEmails.length > 0;
            const paymentDetails = partner.paymentDetails || emptyPaymentDetails;
            const productionNotesText = partner.productionNotes.join("\n");

            return (
              <article key={partner.id} className={`${panelClass} overflow-hidden`}>
                <div className="border-b border-slate-200/70 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold ${
                          partner.active
                            ? "bg-cyan-800 text-white"
                            : isDark
                              ? "bg-slate-800 text-slate-300"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {partner.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-xl font-semibold">{partner.name}</h2>
                        <p className={`mt-1 truncate text-sm ${mutedTextClass}`}>
                          {partner.path}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={partner.path}
                        className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                          isDark
                            ? "border-white/10 bg-white/10 text-slate-100 hover:bg-white/15"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        Open desk
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => removePartner(partner.id)}
                        className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                          isDark
                            ? "border-rose-300/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                            : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        }`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
                  <div className="grid gap-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={smallLabelClass}>
                        Partner name
                        <input
                          value={partner.name}
                          onChange={(event) =>
                            updatePartner(partner.id, { name: event.target.value })
                          }
                          className={`mt-2 normal-case tracking-normal ${inputClass}`}
                          placeholder="Partner name"
                        />
                      </label>
                      <label className={smallLabelClass}>
                        Partner ID
                        <input
                          value={partner.id}
                          onChange={(event) => updatePartnerId(partner.id, event.target.value)}
                          className={`mt-2 normal-case tracking-normal ${inputClass}`}
                          placeholder="partner-id"
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={smallLabelClass}>
                        Password
                        <div className="relative mt-2">
                          <KeyRound className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${mutedTextClass}`} />
                          <input
                            type="text"
                            value={partner.password}
                            onChange={(event) =>
                              updatePartner(partner.id, { password: event.target.value })
                            }
                            className={`${inputClass} pl-10 normal-case tracking-normal`}
                            placeholder={
                              partner.hasPassword
                                ? "Leave blank to keep current password"
                                : "Set partner password"
                            }
                          />
                        </div>
                      </label>
                      <label className={smallLabelClass}>
                        Active
                        <select
                          value={partner.active ? "active" : "inactive"}
                          onChange={(event) =>
                            updatePartner(partner.id, {
                              active: event.target.value === "active",
                            })
                          }
                          className={`mt-2 normal-case tracking-normal ${inputClass}`}
                        >
                          <option value="active">Active in routing</option>
                          <option value="inactive">Inactive / hidden</option>
                        </select>
                      </label>
                    </div>

                    <label className={smallLabelClass}>
                      Production notes
                      <textarea
                        value={productionNotesText}
                        onChange={(event) =>
                          updateProductionNotes(partner.id, event.target.value)
                        }
                        rows={3}
                        className={`mt-2 resize-y normal-case tracking-normal ${inputClass}`}
                        placeholder="One production rule per line"
                      />
                    </label>

                    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={partner.supportsLogoPrintPlacements}
                        onChange={(event) =>
                          updatePartner(partner.id, {
                            supportsLogoPrintPlacements: event.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-cyan-800"
                      />
                      Show logo-only print placement options on this partner desk.
                    </label>
                  </div>

                  <div className="grid gap-4">
                    <section className={`rounded-2xl border p-4 ${softPanelClass}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={smallLabelClass}>Notification emails</p>
                          <p className={`mt-1 text-xs leading-5 ${mutedTextClass}`}>
                            These recipients get the production handoff email.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => addPartnerEmail(partner.id)}
                          className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                            isDark
                              ? "border-white/10 bg-white/10 text-slate-100 hover:bg-white/15"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add
                        </button>
                      </div>

                      <div className="mt-3 grid gap-2">
                        {emails.map((email, index) => (
                          <div
                            key={`${partner.id}-email-${index}`}
                            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_2.75rem]"
                          >
                            <input
                              type="email"
                              value={email}
                              onChange={(event) =>
                                updatePartnerEmail(partner.id, index, event.target.value)
                              }
                              placeholder="partner@example.com"
                              className={inputClass}
                            />
                            <button
                              type="button"
                              onClick={() => removePartnerEmail(partner.id, index)}
                              className={`inline-flex h-11 items-center justify-center rounded-xl border transition ${
                                isDark
                                  ? "border-rose-300/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                                  : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              }`}
                              aria-label={`Remove email ${index + 1} for ${partner.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                              activeNotifications
                                ? "bg-emerald-600 text-white"
                                : isDark
                                  ? "bg-slate-800 text-slate-400"
                                  : "bg-white text-slate-500"
                            }`}
                          >
                            {activeNotifications ? (
                              <Bell className="h-4 w-4" />
                            ) : (
                              <BellOff className="h-4 w-4" />
                            )}
                          </span>
                          <div>
                            <div className="text-sm font-semibold">Email notification</div>
                            <div className={`text-xs ${mutedTextClass}`}>
                              {activeNotifications ? "Active" : "Disabled"}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            updatePartner(partner.id, {
                              emailNotificationsEnabled:
                                !partner.emailNotificationsEnabled,
                            })
                          }
                          className={`relative h-9 w-16 shrink-0 rounded-full border transition ${
                            partner.emailNotificationsEnabled
                              ? "border-emerald-500 bg-emerald-500"
                              : isDark
                                ? "border-slate-700 bg-slate-800"
                                : "border-slate-200 bg-slate-200"
                          }`}
                          aria-label={`Toggle ${partner.name} email notifications`}
                        >
                          <span
                            className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow-sm transition ${
                              partner.emailNotificationsEnabled ? "left-8" : "left-1"
                            }`}
                          />
                        </button>
                      </div>
                    </section>

                    <section className={`rounded-2xl border p-4 ${softPanelClass}`}>
                      <p className={smallLabelClass}>Payment details</p>
                      <div className="mt-3 grid gap-2">
                        {(
                          [
                            ["fullName", "Full name"],
                            ["bankName", "Bank name"],
                            ["bankAccountNumber", "Bank account number"],
                            ["juiceNumber", "Juice number"],
                          ] as const
                        ).map(([key, label]) => (
                          <input
                            key={key}
                            value={paymentDetails[key]}
                            onChange={(event) =>
                              updatePaymentDetails(partner.id, key, event.target.value)
                            }
                            className={inputClass}
                            placeholder={label}
                          />
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </article>
            );
          })}

          {!partners.length && !loading ? (
            <div className={`${panelClass} p-8 text-center text-sm ${mutedTextClass}`}>
              No partners configured.
            </div>
          ) : null}
        </section>

        <div
          className={`sticky bottom-3 z-10 rounded-[24px] border p-3 shadow-lg backdrop-blur ${
            isDark ? "border-white/10 bg-slate-950/88" : "border-slate-200 bg-white/92"
          }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className={`flex items-center gap-2 text-xs font-semibold ${mutedTextClass}`}>
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Loading partners
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4" />
                  {hasChanges ? "Unsaved partner changes" : "Partner settings up to date"}
                </>
              )}
            </div>
            <button
              type="button"
              onClick={savePartners}
              disabled={loading || saving || !hasChanges}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : hasChanges ? "Save partners" : "Up to date"}
            </button>
          </div>
        </div>
      </div>
      <UnsavedChangesGuard
        active={hasChanges}
        isSaving={saving}
        onSave={savePartners}
        title="Save partner changes?"
        message="You changed partner configuration. Save before opening another admin page, or leave without saving."
        saveLabel="Save partners"
      />
    </main>
  );
}
