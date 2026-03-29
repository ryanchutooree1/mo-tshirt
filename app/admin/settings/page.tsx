"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Database,
  HardDrive,
  Mail,
  PencilLine,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { getMetadata, list, ref as storageRef } from "firebase/storage";
import {
  ADMIN_PAGE_GROUPS,
  ADMIN_PAGE_OPTIONS,
  type AdminPagePath,
} from "@/lib/admin-access";
import { storage } from "@/lib/firebase";
import {
  ensureAdminFirebaseSession,
  isFirebaseAdminAuthConfigured,
} from "@/lib/firebase-admin-client-auth";

type AdminUserSummary = {
  email: string;
  displayName: string;
  allowedPages: AdminPagePath[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_FIREBASE_STORAGE_LIMIT_GB = 5;

type UsageSnapshot = {
  usedBytes: number;
  limitBytes: number;
  note: string;
  provider: string;
  isEstimate?: boolean;
};

const EMPTY_USER_DRAFT = {
  email: "",
  displayName: "",
  password: "",
  allowedPages: ["/admin"] as AdminPagePath[],
  isActive: true,
};

function parseRecipientInput(value: string) {
  const seen = new Set<string>();
  const recipients: string[] = [];
  const invalidEntries: string[] = [];

  for (const entry of value.split(/[\n,;]+/g)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const normalized = trimmed.toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      invalidEntries.push(trimmed);
      continue;
    }

    if (seen.has(normalized)) continue;
    seen.add(normalized);
    recipients.push(normalized);
  }

  return { recipients, invalidEntries };
}

function haveSameRecipients(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((recipient, index) => recipient === right[index]);
}

function formatDateTime(value?: number) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(displayName: string, email: string) {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  }
  if (words.length === 1 && words[0]) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function toBytesFromGb(value: string | undefined, fallbackGb: number) {
  const parsed = Number(value);
  const gb = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackGb;
  return Math.round(gb * 1024 * 1024 * 1024);
}

function formatStorageBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1
  );
  const sized = value / Math.pow(1024, exponent);
  return `${sized.toFixed(exponent === 0 ? 0 : exponent === 1 ? 1 : 2)} ${units[exponent]}`;
}

function getUsagePercent(usedBytes: number, limitBytes: number) {
  if (!Number.isFinite(usedBytes) || !Number.isFinite(limitBytes) || limitBytes <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (usedBytes / limitBytes) * 100));
}

async function sumStoragePrefix(path: string): Promise<number> {
  async function walk(folderPath: string, pageToken?: string): Promise<number> {
    const page = await list(storageRef(storage, folderPath), {
      maxResults: 1000,
      pageToken,
    });

    const metadata = await Promise.all(
      page.items.map((item) => getMetadata(item).catch(() => null))
    );
    const fileBytes = metadata.reduce(
      (total, item) => total + (typeof item?.size === "number" ? item.size : 0),
      0
    );
    const nestedBytes = await Promise.all(
      page.prefixes.map((prefix) => walk(prefix.fullPath))
    );
    const currentTotal =
      fileBytes + nestedBytes.reduce((total, value) => total + value, 0);

    if (!page.nextPageToken) {
      return currentTotal;
    }

    return currentTotal + (await walk(folderPath, page.nextPageToken));
  }

  return walk(path);
}

export default function SettingsPage() {
  const [notificationRecipients, setNotificationRecipients] = useState<string[]>([]);
  const [savedNotificationRecipients, setSavedNotificationRecipients] = useState<string[]>([]);
  const [notificationInput, setNotificationInput] = useState("");
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationSaved, setNotificationSaved] = useState(false);

  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersSaving, setUsersSaving] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSaved, setUserSaved] = useState(false);
  const [editingUserEmail, setEditingUserEmail] = useState<string | null>(null);
  const [userDraft, setUserDraft] = useState(EMPTY_USER_DRAFT);
  const [firebaseUsage, setFirebaseUsage] = useState<UsageSnapshot | null>(null);
  const [firebaseUsageLoading, setFirebaseUsageLoading] = useState(true);
  const [firebaseUsageError, setFirebaseUsageError] = useState<string | null>(null);
  const [hostingUsage, setHostingUsage] = useState<UsageSnapshot | null>(null);
  const [hostingUsageLoading, setHostingUsageLoading] = useState(true);
  const [hostingUsageError, setHostingUsageError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    (async () => {
      try {
        const [notificationRes, usersRes] = await Promise.all([
          fetch("/api/admin/settings/quotation-notifications", { cache: "no-store" }),
          fetch("/api/admin/settings/users", { cache: "no-store" }),
        ]);

        const notificationData = await notificationRes.json().catch(() => ({}));
        const usersData = await usersRes.json().catch(() => ({}));

        if (!notificationRes.ok) {
          throw new Error(
            typeof notificationData?.error === "string"
              ? notificationData.error
              : "Failed to load quotation notification emails."
          );
        }

        if (!usersRes.ok) {
          throw new Error(
            typeof usersData?.error === "string"
              ? usersData.error
              : "Failed to load admin users."
          );
        }

        const recipients = Array.isArray(notificationData?.recipients)
          ? notificationData.recipients.filter((entry: unknown): entry is string => typeof entry === "string")
          : [];
        const nextUsers = Array.isArray(usersData?.users)
          ? usersData.users.filter(
              (entry: unknown): entry is AdminUserSummary =>
                Boolean(entry) &&
                typeof entry === "object" &&
                typeof (entry as AdminUserSummary).email === "string"
            )
          : [];

        if (!ignore) {
          setNotificationRecipients(recipients);
          setSavedNotificationRecipients(recipients);
          setUsers(nextUsers);
          setNotificationError(null);
          setUserError(null);
        }
      } catch (error) {
        if (!ignore) {
          const message =
            error instanceof Error ? error.message : "Failed to load settings.";
          setNotificationError(message);
          setUserError(message);
        }
      } finally {
        if (!ignore) {
          setNotificationLoading(false);
          setUsersLoading(false);
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    const firebaseLimitBytes = toBytesFromGb(
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_LIMIT_GB,
      DEFAULT_FIREBASE_STORAGE_LIMIT_GB
    );

    (async () => {
      setFirebaseUsageLoading(true);
      setFirebaseUsageError(null);

      try {
        if (!isFirebaseAdminAuthConfigured()) {
          throw new Error("Firebase storage admin auth is not configured.");
        }

        const hasFirebaseSession = await ensureAdminFirebaseSession();
        if (!hasFirebaseSession) {
          throw new Error("Firebase storage session is unavailable.");
        }
        const [documentsBytes, quotesBytes] = await Promise.all([
          sumStoragePrefix("documents"),
          sumStoragePrefix("quotes"),
        ]);

        if (!ignore) {
          setFirebaseUsage({
            usedBytes: documentsBytes + quotesBytes,
            limitBytes: firebaseLimitBytes,
            provider: "Firebase Storage",
            note: "Counts files stored in the documents and quotes folders.",
          });
        }
      } catch (error) {
        if (!ignore) {
          setFirebaseUsageError(
            error instanceof Error
              ? error.message
              : "Failed to load Firebase storage usage."
          );
        }
      } finally {
        if (!ignore) {
          setFirebaseUsageLoading(false);
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    (async () => {
      setHostingUsageLoading(true);
      setHostingUsageError(null);

      try {
        const res = await fetch("/api/admin/settings/storage", {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Failed to load host storage usage."
          );
        }

        if (!ignore) {
          setHostingUsage({
            usedBytes:
              typeof data?.usedBytes === "number" ? data.usedBytes : 0,
            limitBytes:
              typeof data?.limitBytes === "number" ? data.limitBytes : 0,
            provider:
              typeof data?.provider === "string"
                ? data.provider
                : "MO T-SHIRT Host",
            note:
              typeof data?.note === "string"
                ? data.note
                : "Estimated from the current host footprint.",
            isEstimate: Boolean(data?.isEstimate),
          });
        }
      } catch (error) {
        if (!ignore) {
          setHostingUsageError(
            error instanceof Error
              ? error.message
              : "Failed to load host storage usage."
          );
        }
      } finally {
        if (!ignore) {
          setHostingUsageLoading(false);
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, []);

  const notificationHasChanges = useMemo(
    () => !haveSameRecipients(notificationRecipients, savedNotificationRecipients),
    [notificationRecipients, savedNotificationRecipients]
  );

  const groupedPageOptions = useMemo(
    () =>
      ADMIN_PAGE_GROUPS.map((group) => ({
        group,
        items: ADMIN_PAGE_OPTIONS.filter((option) => option.group === group),
      })),
    []
  );

  const activeUsers = useMemo(
    () => users.filter((user) => user.isActive),
    [users]
  );

  const totalGrantedPages = useMemo(
    () => users.reduce((count, user) => count + user.allowedPages.length, 0),
    [users]
  );

  const addNotificationRecipients = () => {
    const parsed = parseRecipientInput(notificationInput);

    if (!parsed.recipients.length && !parsed.invalidEntries.length) {
      setNotificationError("Enter at least one email address.");
      return;
    }

    if (parsed.invalidEntries.length) {
      setNotificationError(
        `Invalid email address${parsed.invalidEntries.length > 1 ? "es" : ""}: ${parsed.invalidEntries.join(", ")}`
      );
      return;
    }

    const merged = [...notificationRecipients];
    for (const recipient of parsed.recipients) {
      if (!merged.includes(recipient)) {
        merged.push(recipient);
      }
    }

    setNotificationRecipients(merged);
    setNotificationInput("");
    setNotificationError(null);
    setNotificationSaved(false);
  };

  const removeNotificationRecipient = (recipientToRemove: string) => {
    setNotificationRecipients((prev) => prev.filter((recipient) => recipient !== recipientToRemove));
    setNotificationError(null);
    setNotificationSaved(false);
  };

  const saveNotificationRecipients = async () => {
    if (!notificationRecipients.length) {
      setNotificationError("Add at least one valid email address.");
      return;
    }

    setNotificationSaving(true);
    setNotificationError(null);
    setNotificationSaved(false);

    try {
      const res = await fetch("/api/admin/settings/quotation-notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: notificationRecipients }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Failed to save quotation notification emails."
        );
      }

      const recipients = Array.isArray(data?.recipients)
        ? data.recipients.filter((entry: unknown): entry is string => typeof entry === "string")
        : notificationRecipients;

      setNotificationRecipients(recipients);
      setSavedNotificationRecipients(recipients);
      setNotificationInput("");
      setNotificationSaved(true);
      window.setTimeout(() => setNotificationSaved(false), 1600);
    } catch (error) {
      setNotificationError(
        error instanceof Error
          ? error.message
          : "Failed to save quotation notification emails."
      );
    } finally {
      setNotificationSaving(false);
    }
  };

  const resetUserDraft = (options?: { preserveSaved?: boolean }) => {
    setEditingUserEmail(null);
    setUserDraft(EMPTY_USER_DRAFT);
    setUserError(null);
    if (!options?.preserveSaved) {
      setUserSaved(false);
    }
  };

  const toggleUserPage = (page: AdminPagePath) => {
    setUserDraft((current) => {
      const hasPage = current.allowedPages.includes(page);
      return {
        ...current,
        allowedPages: hasPage
          ? current.allowedPages.filter((item) => item !== page)
          : [...current.allowedPages, page],
      };
    });
    setUserError(null);
    setUserSaved(false);
  };

  const startEditingUser = (user: AdminUserSummary) => {
    setEditingUserEmail(user.email);
    setUserDraft({
      email: user.email,
      displayName: user.displayName,
      password: "",
      allowedPages: user.allowedPages,
      isActive: user.isActive,
    });
    setUserError(null);
    setUserSaved(false);
  };

  const saveUser = async () => {
    const email = userDraft.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      setUserError("Enter a valid email address.");
      return;
    }

    if (!userDraft.displayName.trim()) {
      setUserError("Enter a display name.");
      return;
    }

    if (!editingUserEmail && userDraft.password.trim().length < 8) {
      setUserError("Password must be at least 8 characters.");
      return;
    }

    if (!userDraft.allowedPages.length) {
      setUserError("Choose at least one admin page.");
      return;
    }

    setUsersSaving(true);
    setUserError(null);
    setUserSaved(false);

    try {
      const isEditing = Boolean(editingUserEmail);
      const res = await fetch("/api/admin/settings/users", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          displayName: userDraft.displayName,
          password: userDraft.password,
          allowedPages: userDraft.allowedPages,
          isActive: userDraft.isActive,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : isEditing
              ? "Failed to update admin user."
              : "Failed to create admin user."
        );
      }

      const user = data?.user as AdminUserSummary | undefined;
      if (!user || typeof user.email !== "string") {
        throw new Error("Server returned an invalid admin user.");
      }

      setUsers((current) => {
        const others = current.filter((entry) => entry.email !== user.email);
        return [...others, user].sort((left, right) => left.createdAt - right.createdAt);
      });
      setUserSaved(true);
      resetUserDraft({ preserveSaved: true });
    } catch (error) {
      setUserError(
        error instanceof Error ? error.message : "Failed to save admin user."
      );
    } finally {
        setUsersSaving(false);
    }
  };

  const panelClass = "rounded-[32px] border border-slate-200/70 bg-white/90 shadow-sm backdrop-blur";

  return (
    <main className="relative min-h-screen bg-[#F5F5F7] text-[#1a1a1a]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 right-[-9rem] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_72%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10rem] top-60 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.12),transparent_72%)] blur-3xl"
      />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6">
        <header className={`${panelClass} relative overflow-hidden p-8`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_60%)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin Settings
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
                Team access and notification routing
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                Control who receives quotation emails and which admin pages each employee can use.
                Owner access stays unrestricted.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Recipients</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{notificationRecipients.length}</div>
                <div className="text-xs text-slate-500">Quotation inboxes</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Users</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{users.length}</div>
                <div className="text-xs text-slate-500">Managed admin accounts</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Access Grants</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{totalGrantedPages}</div>
                <div className="text-xs text-slate-500">Pages assigned across staff</div>
              </div>
            </div>
          </div>
        </header>

        <section className={`${panelClass} p-6 sm:p-8`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                <HardDrive className="h-3.5 w-3.5" />
                Storage Overview
              </div>
              <h2 className="mt-4 text-xl font-semibold text-slate-900">
                Storage usage
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Track how much Firebase bucket space and MO T-SHIRT host footprint are currently in use.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <StorageUsageCard
              title="Firebase Storage"
              subtitle="Documents and quotation attachments"
              icon={<Database className="h-4 w-4" />}
              usage={firebaseUsage}
              loading={firebaseUsageLoading}
              error={firebaseUsageError}
            />
            <StorageUsageCard
              title={hostingUsage?.provider || "MO T-SHIRT Host"}
              subtitle="Current host footprint"
              icon={<HardDrive className="h-4 w-4" />}
              usage={hostingUsage}
              loading={hostingUsageLoading}
              error={hostingUsageError}
            />
          </div>
        </section>

        <section className={`${panelClass} overflow-hidden`}>
          <div className="grid lg:grid-cols-[minmax(0,1.2fr)_360px]">
            <div className="p-6 sm:p-8 lg:border-r lg:border-slate-200/70">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                <Mail className="h-3.5 w-3.5" />
                Website Quotations
              </div>
              <h2 className="mt-4 text-xl font-semibold text-slate-900">
                Notification routing
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Manage the inboxes that receive each new website quotation. Add one address at a time or paste several separated by commas.
              </p>

              <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Recipient Directory
                    </div>
                    <div className="mt-1 text-base font-semibold text-slate-900">
                      Quotation alert inboxes
                    </div>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {notificationRecipients.length} active
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <input
                    value={notificationInput}
                    onChange={(e) => {
                      setNotificationInput(e.target.value);
                      setNotificationError(null);
                      setNotificationSaved(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addNotificationRecipients();
                      }
                    }}
                    disabled={notificationLoading || notificationSaving}
                    placeholder="name@example.com, sales@example.com"
                    className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  <button
                    onClick={addNotificationRecipients}
                    disabled={notificationLoading || notificationSaving}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-sm transition hover:bg-slate-800 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <Plus className="h-4 w-4" />
                    Add Recipient
                  </button>
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  Press Enter to add quickly. Duplicate email addresses are ignored automatically.
                </p>
              </div>

              {notificationError ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {notificationError}
                </div>
              ) : null}

              {notificationSaved ? (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Recipients saved
                </div>
              ) : null}

              <div className="mt-5 grid gap-3">
                {notificationRecipients.length ? (
                  notificationRecipients.map((recipient) => (
                    <div
                      key={recipient}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                          <Mail className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Recipient
                          </div>
                          <div className="truncate text-sm font-semibold text-slate-800">
                            {recipient}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeNotificationRecipient(recipient)}
                        disabled={notificationSaving}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>
                  ))
                ) : !notificationLoading ? (
                  <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div className="mt-4 text-base font-semibold text-slate-700">
                      No recipients configured
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      Add the inboxes that should receive website quotation notifications.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            <aside className="bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(241,245,249,0.88))] p-6 sm:p-8">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Delivery Summary
                </div>
                <div className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">
                  {notificationRecipients.length}
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  active {notificationRecipients.length === 1 ? "recipient" : "recipients"}
                </div>

                <div className="mt-5 space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Rule
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Every new website quotation email is sent to this list.
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Input
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Paste one address or several separated by commas, then save.
                    </div>
                  </div>
                </div>

                <button
                  onClick={saveNotificationRecipients}
                  disabled={notificationLoading || notificationSaving || !notificationHasChanges}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-sm transition hover:bg-slate-800 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <Mail className="h-4 w-4" />
                  {notificationSaving ? "Saving..." : notificationHasChanges ? "Save Changes" : "Up to Date"}
                </button>
              </div>
            </aside>
          </div>
        </section>

        <section className={`${panelClass} p-6 sm:p-8`}>
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                <Users className="h-3.5 w-3.5" />
                Team Access
              </div>
              <h2 className="mt-4 text-xl font-semibold text-slate-900">
                Create and manage admin users
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Create employee accounts, set their passwords, and choose exactly which admin pages they can access.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Managed users</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{users.length}</div>
                <div className="text-xs text-slate-500">Accounts created</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Active users</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{activeUsers.length}</div>
                <div className="text-xs text-slate-500">Can sign in now</div>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_420px]">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {editingUserEmail ? "Edit User" : "Create User"}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {editingUserEmail ? "Update employee access" : "New team account"}
                  </div>
                </div>
                {editingUserEmail ? (
                  <button
                    onClick={() => resetUserDraft()}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-xs font-semibold text-slate-600">
                  Full name
                  <input
                    value={userDraft.displayName}
                    onChange={(e) => {
                      setUserDraft((current) => ({ ...current, displayName: e.target.value }));
                      setUserError(null);
                      setUserSaved(false);
                    }}
                    placeholder="e.g. Sales Assistant"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
                <label className="grid gap-2 text-xs font-semibold text-slate-600">
                  Email
                  <input
                    value={userDraft.email}
                    onChange={(e) => {
                      setUserDraft((current) => ({ ...current, email: e.target.value }));
                      setUserError(null);
                      setUserSaved(false);
                    }}
                    disabled={Boolean(editingUserEmail)}
                    placeholder="employee@mo-tshirt.mu"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </label>
                <label className="grid gap-2 text-xs font-semibold text-slate-600 md:col-span-2">
                  Password
                  <input
                    type="password"
                    value={userDraft.password}
                    onChange={(e) => {
                      setUserDraft((current) => ({ ...current, password: e.target.value }));
                      setUserError(null);
                      setUserSaved(false);
                    }}
                    placeholder={editingUserEmail ? "Leave blank to keep current password" : "Minimum 8 characters"}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={userDraft.isActive}
                    onChange={(e) => {
                      setUserDraft((current) => ({ ...current, isActive: e.target.checked }));
                      setUserError(null);
                      setUserSaved(false);
                    }}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Active account
                </label>
                <button
                  onClick={() => {
                    setUserDraft((current) => ({ ...current, allowedPages: ADMIN_PAGE_OPTIONS.map((item) => item.path) }));
                    setUserError(null);
                    setUserSaved(false);
                  }}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Grant all pages
                </button>
                <button
                  onClick={() => {
                    setUserDraft((current) => ({ ...current, allowedPages: [] }));
                    setUserError(null);
                    setUserSaved(false);
                  }}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Clear selection
                </button>
              </div>

              <div className="mt-6 space-y-5">
                {groupedPageOptions.map(({ group, items }) => (
                  <div key={group}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {group}
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {items.map((item) => {
                        const checked = userDraft.allowedPages.includes(item.path);
                        return (
                          <label
                            key={item.path}
                            className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4 transition ${
                              checked
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleUserPage(item.path)}
                              className="mt-1 h-4 w-4 rounded border-slate-300"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold">{item.label}</div>
                              <div className={`mt-1 text-xs leading-5 ${checked ? "text-slate-300" : "text-slate-500"}`}>
                                {item.description}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {userError ? (
                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {userError}
                </div>
              ) : null}

              {userSaved ? (
                <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  User saved
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={saveUser}
                  disabled={usersSaving || usersLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-sm transition hover:bg-slate-800 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <UserCog className="h-4 w-4" />
                  {usersSaving ? "Saving..." : editingUserEmail ? "Update user" : "Create user"}
                </button>
                {editingUserEmail ? (
                  <button
                    onClick={() => resetUserDraft()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Managed Users
                </div>
                <div className="mt-3 text-sm text-slate-600">
                  Employees sign in with their email and password. Owner access remains full.
                </div>
              </div>

              {users.length ? (
                users.map((user) => (
                  <div
                    key={user.email}
                    className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-700">
                          {getInitials(user.displayName, user.email)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold text-slate-900">
                            {user.displayName}
                          </div>
                          <div className="truncate text-sm text-slate-500">{user.email}</div>
                        </div>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                          user.isActive
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-100 text-slate-500"
                        }`}
                      >
                        {user.isActive ? "Active" : "Paused"}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {user.allowedPages.slice(0, 4).map((pagePath) => {
                        const option = ADMIN_PAGE_OPTIONS.find((entry) => entry.path === pagePath);
                        return (
                          <span
                            key={pagePath}
                            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600"
                          >
                            {option?.label || pagePath}
                          </span>
                        );
                      })}
                      {user.allowedPages.length > 4 ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">
                          +{user.allowedPages.length - 4} more
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <div>
                        Updated {formatDateTime(user.updatedAt)}
                      </div>
                      <button
                        onClick={() => startEditingUser(user)}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                        Edit access
                      </button>
                    </div>
                  </div>
                ))
              ) : !usersLoading ? (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="mt-4 text-base font-semibold text-slate-700">
                    No employee accounts yet
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Create the first managed admin user to give a team member limited access.
                  </p>
                </div>
              ) : null}
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function StorageUsageCard({
  title,
  subtitle,
  icon,
  usage,
  loading,
  error,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  usage: UsageSnapshot | null;
  loading: boolean;
  error: string | null;
}) {
  const usedBytes = usage?.usedBytes ?? 0;
  const limitBytes = usage?.limitBytes ?? 0;
  const percentage = getUsagePercent(usedBytes, limitBytes);

  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            {title}
          </div>
          <div className="mt-1 text-base font-semibold text-slate-900">
            {subtitle}
          </div>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm">
          {icon}
        </div>
      </div>

      {loading ? (
        <div className="mt-6 space-y-3">
          <div className="h-3 rounded-full bg-slate-200" />
          <div className="h-3 w-2/3 rounded-full bg-slate-200" />
        </div>
      ) : error ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : usage ? (
        <>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-3xl font-semibold tracking-tight text-slate-900">
                {percentage.toFixed(1)}%
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {formatStorageBytes(usedBytes)} used of {formatStorageBytes(limitBytes)}
              </div>
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              {usage.isEstimate ? "Estimate" : "Live"}
            </div>
          </div>

          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-900 transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>

          <p className="mt-3 text-sm text-slate-500">{usage.note}</p>
        </>
      ) : null}
    </div>
  );
}
