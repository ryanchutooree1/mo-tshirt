"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCircle2,
  ExternalLink,
  Mail,
  RefreshCw,
  Save,
  Users,
} from "lucide-react";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import { PRINT_PARTNERS, type PrintPartnerId } from "@/lib/partners";

type PartnerNotificationSetting = {
  partnerId: PrintPartnerId;
  partnerName: string;
  path: string;
  email: string;
  emailNotificationsEnabled: boolean;
};

const partnerMeta = new Map(PRINT_PARTNERS.map((partner) => [partner.id, partner]));

function haveSameSettings(
  left: PartnerNotificationSetting[],
  right: PartnerNotificationSetting[]
) {
  if (left.length !== right.length) return false;
  return left.every((leftSetting) => {
    const rightSetting = right.find(
      (entry) => entry.partnerId === leftSetting.partnerId
    );
    return (
      rightSetting &&
      rightSetting.email === leftSetting.email &&
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
    (partner) => partner.emailNotificationsEnabled && partner.email
  ).length;

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

  const saveSettings = async () => {
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
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save partner settings."
      );
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
            const active =
              partner.emailNotificationsEnabled && Boolean(partner.email);

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
                          {partner.email || "No email configured"}
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
                  <label className="block">
                    <span className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${mutedTextClass}`}>
                      Notification email
                    </span>
                    <input
                      type="email"
                      value={partner.email}
                      onChange={(event) =>
                        updatePartner(partner.partnerId, {
                          email: event.target.value,
                        })
                      }
                      placeholder="partner@example.com"
                      className={`mt-2 ${inputClass}`}
                    />
                  </label>

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
    </main>
  );
}
