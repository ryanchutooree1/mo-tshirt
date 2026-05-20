"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCircle2,
  ExternalLink,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import UnsavedChangesGuard from "@/components/admin/UnsavedChangesGuard";
import { PRINT_PARTNERS, type PrintPartnerId } from "@/lib/partners";

type PartnerNotificationSetting = {
  partnerId: PrintPartnerId;
  partnerName: string;
  path: string;
  email: string;
  emails: string[];
  emailNotificationsEnabled: boolean;
};

const partnerMeta = new Map(PRINT_PARTNERS.map((partner) => [partner.id, partner]));

function getPartnerEmails(partner: PartnerNotificationSetting) {
  if (Array.isArray(partner.emails)) return partner.emails;
  return partner.email ? [partner.email] : [];
}

function haveSameSettings(
  left: PartnerNotificationSetting[],
  right: PartnerNotificationSetting[]
) {
  if (left.length !== right.length) return false;
  return left.every((leftSetting) => {
    const rightSetting = right.find(
      (entry) => entry.partnerId === leftSetting.partnerId
    );
    if (!rightSetting) return false;
    const leftEmails = getPartnerEmails(leftSetting);
    const rightEmails = getPartnerEmails(rightSetting);
    return (
      leftEmails.length === rightEmails.length &&
      leftEmails.every((email, index) => email === rightEmails[index]) &&
      rightSetting.emailNotificationsEnabled ===
        leftSetting.emailNotificationsEnabled
    );
  });
}

export default function AdminPartnersPage() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";
  const [partners, setPartners] = useState<PartnerNotificationSetting[]>([]);
  const [savedPartners, setSavedPartners] = useState<PartnerNotificationSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasChanges = useMemo(
    () => !haveSameSettings(partners, savedPartners),
    [partners, savedPartners]
  );
  const activeCount = partners.filter(
    (partner) => partner.emailNotificationsEnabled && getPartnerEmails(partner).some(Boolean)
  ).length;
  const recipientCount = partners.reduce(
    (count, partner) => count + getPartnerEmails(partner).filter(Boolean).length,
    0
  );

  const pageClass = isDark
    ? "min-h-screen overflow-x-hidden bg-slate-950 text-slate-100"
    : "min-h-screen overflow-x-hidden bg-white text-slate-950";
  const panelClass = isDark
    ? "rounded-[28px] border border-white/10 bg-white/[0.06] shadow-[0_22px_60px_rgba(5,12,24,0.42)]"
    : "rounded-[28px] border border-slate-200 bg-white shadow-sm";
  const softPanelClass = isDark
    ? "border-white/10 bg-slate-900/80"
    : "border-slate-200 bg-slate-50";
  const mutedTextClass = isDark ? "text-slate-400" : "text-slate-500";
  const inputClass = isDark
    ? "w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-base text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10 sm:text-sm"
    : "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-200 sm:text-sm";

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/partners/notifications", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load partner settings.");
      }
      const nextPartners = Array.isArray(data?.partners)
        ? (data.partners as PartnerNotificationSetting[])
        : [];
      setPartners(nextPartners);
      setSavedPartners(nextPartners);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load partner settings."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const updatePartner = (
    partnerId: PrintPartnerId,
    patch: Partial<PartnerNotificationSetting>
  ) => {
    setPartners((current) =>
      current.map((partner) =>
        partner.partnerId === partnerId ? { ...partner, ...patch } : partner
      )
    );
    setNotice(null);
    setError(null);
  };

  const updatePartnerEmail = (
    partnerId: PrintPartnerId,
    emailIndex: number,
    email: string
  ) => {
    setPartners((current) =>
      current.map((partner) => {
        if (partner.partnerId !== partnerId) return partner;
        const emails = getPartnerEmails(partner).slice();
        emails[emailIndex] = email;
        return { ...partner, email: emails[0] || "", emails };
      })
    );
    setNotice(null);
    setError(null);
  };

  const addPartnerEmail = (partnerId: PrintPartnerId) => {
    setPartners((current) =>
      current.map((partner) => {
        if (partner.partnerId !== partnerId) return partner;
        const emails = [...getPartnerEmails(partner), ""];
        return { ...partner, email: emails[0] || "", emails };
      })
    );
    setNotice(null);
    setError(null);
  };

  const removePartnerEmail = (partnerId: PrintPartnerId, emailIndex: number) => {
    setPartners((current) =>
      current.map((partner) => {
        if (partner.partnerId !== partnerId) return partner;
        const emails = getPartnerEmails(partner).filter((_, index) => index !== emailIndex);
        return { ...partner, email: emails[0] || "", emails };
      })
    );
    setNotice(null);
    setError(null);
  };

  const saveSettings = async () => {
    if (!hasChanges) return true;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/partners/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partners }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to save partner settings.");
      }
      const nextPartners = Array.isArray(data?.partners)
        ? (data.partners as PartnerNotificationSetting[])
        : partners;
      setPartners(nextPartners);
      setSavedPartners(nextPartners);
      setNotice("Partner notification settings saved.");
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save partner settings."
      );
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
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Partner Control
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-4xl">
                Partners
              </h1>
              <p className={`mt-2 max-w-3xl text-sm leading-6 ${mutedTextClass}`}>
                Manage partner desk links and email notifications for production
                handoffs from Quotation / Invoice.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:min-w-[22rem]">
              <div className={`rounded-2xl border px-4 py-4 ${softPanelClass}`}>
                <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>
                  Partners
                </div>
                <div className="mt-2 text-2xl font-semibold">{partners.length}</div>
              </div>
              <div className={`rounded-2xl border px-4 py-4 ${softPanelClass}`}>
                <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>
                  Email active
                </div>
                <div className="mt-2 text-2xl font-semibold">{activeCount}</div>
                <div className={`mt-1 text-xs ${mutedTextClass}`}>
                  {recipientCount} recipient{recipientCount === 1 ? "" : "s"}
                </div>
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

        <section className="grid gap-4 lg:grid-cols-2">
          {partners.map((partner) => {
            const meta = partnerMeta.get(partner.partnerId);
            const emails = getPartnerEmails(partner);
            const savedEmails = emails.filter(Boolean);
            const emailSummary = savedEmails.length
              ? savedEmails.join(", ")
              : "No email configured";
            const active =
              partner.emailNotificationsEnabled && savedEmails.length > 0;

            return (
              <article key={partner.partnerId} className={`${panelClass} p-4 sm:p-5`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold ${
                          active
                            ? "bg-emerald-600 text-white"
                            : isDark
                              ? "bg-slate-800 text-slate-300"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {partner.partnerName.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-xl font-semibold">
                          {partner.partnerName}
                        </h2>
                        <p className={`mt-1 truncate text-sm ${mutedTextClass}`}>
                          {emailSummary}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Link
                    href={partner.path}
                    className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold transition ${
                      isDark
                        ? "border-white/10 bg-white/10 text-slate-100 hover:bg-white/15"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Open page
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <div className="mt-5 grid gap-4">
                  <div className="grid gap-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <span className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>
                          Notification emails
                        </span>
                        <p className={`mt-1 text-xs leading-5 ${mutedTextClass}`}>
                          Add the partner, backup worker, or manager who should track this desk.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addPartnerEmail(partner.partnerId)}
                        className={`inline-flex items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                          isDark
                            ? "border-white/10 bg-white/10 text-slate-100 hover:bg-white/15"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add email
                      </button>
                    </div>

                    {emails.length ? (
                      <div className="grid gap-2">
                        {emails.map((email, index) => (
                          <div
                            key={`${partner.partnerId}-email-${index}`}
                            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_2.75rem]"
                          >
                            <input
                              type="email"
                              value={email}
                              onChange={(event) =>
                                updatePartnerEmail(
                                  partner.partnerId,
                                  index,
                                  event.target.value
                                )
                              }
                              placeholder={
                                index === 0
                                  ? "partner@example.com"
                                  : "backup-or-manager@example.com"
                              }
                              className={inputClass}
                            />
                            <button
                              type="button"
                              onClick={() => removePartnerEmail(partner.partnerId, index)}
                              className={`inline-flex h-11 items-center justify-center rounded-2xl border transition ${
                                isDark
                                  ? "border-rose-300/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                                  : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              }`}
                              aria-label={`Remove email ${index + 1} for ${partner.partnerName}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={`rounded-2xl border border-dashed px-4 py-4 text-sm ${softPanelClass} ${mutedTextClass}`}>
                        No email recipients yet.
                      </div>
                    )}
                  </div>

                  <div
                    className={`flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between ${softPanelClass}`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                          active
                            ? "bg-emerald-600 text-white"
                            : isDark
                              ? "bg-slate-800 text-slate-400"
                              : "bg-white text-slate-500"
                        }`}
                      >
                        {active ? (
                          <Bell className="h-4 w-4" />
                        ) : (
                          <BellOff className="h-4 w-4" />
                        )}
                      </span>
                      <div>
                        <div className="text-sm font-semibold">
                          Email notification
                        </div>
                        <div className={`text-xs ${mutedTextClass}`}>
                          {active ? "Active when order is moved" : "Disabled"}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        updatePartner(partner.partnerId, {
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
                      aria-label={`Toggle ${partner.partnerName} email notifications`}
                    >
                      <span
                        className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow-sm transition ${
                          partner.emailNotificationsEnabled ? "left-8" : "left-1"
                        }`}
                      />
                    </button>
                  </div>

                  {meta?.paymentDetails ? (
                    <div className={`rounded-2xl border p-3 text-xs leading-5 ${softPanelClass}`}>
                      <div className={`font-semibold uppercase tracking-[0.16em] ${mutedTextClass}`}>
                        Payment name
                      </div>
                      <div className="mt-1 font-semibold">
                        {meta.paymentDetails.fullName}
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}

          {!partners.length && !loading ? (
            <div className={`${panelClass} p-8 text-center text-sm ${mutedTextClass}`}>
              No partner settings found.
            </div>
          ) : null}
        </section>

        <div
          className={`sticky bottom-3 z-10 rounded-[24px] border p-3 shadow-lg backdrop-blur ${
            isDark
              ? "border-white/10 bg-slate-950/88"
              : "border-slate-200 bg-white/92"
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
              onClick={saveSettings}
              disabled={loading || saving || !hasChanges}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : hasChanges ? "Save partner settings" : "Up to date"}
            </button>
          </div>
        </div>
      </div>
      <UnsavedChangesGuard
        active={hasChanges}
        isSaving={saving}
        onSave={saveSettings}
        title="Save partner email changes?"
        message="You changed partner notification emails. Save them before opening another admin page, or leave without saving."
        saveLabel="Save partner settings"
      />
    </main>
  );
}
