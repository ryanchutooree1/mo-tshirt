"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  PencilLine,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import {
  ADMIN_PAGE_GROUPS,
  ADMIN_PAGE_OPTIONS,
  type AdminPagePath,
} from "@/lib/admin-access";
import type { PrintPartner, ProductionManager } from "@/lib/partners";
import UnsavedChangesGuard from "@/components/admin/UnsavedChangesGuard";
import AdminProfileEditor from "@/components/admin/AdminProfileEditor";
import {
  defaultAdminProfile,
  type AdminProfile,
} from "@/lib/admin-profile";

type AdminUserSummary = {
  email: string;
  username: string;
  displayName: string;
  authProvider: "firebase" | "legacy";
  firebaseUid: string | null;
  allowedPages: AdminPagePath[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  profile: AdminProfile;
};

type AdminSessionSummary = {
  userId: string;
  displayName: string;
  email: string;
  allowedPages: AdminPagePath[];
  isOwner: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY_USER_DRAFT = {
  email: "",
  username: "",
  displayName: "",
  password: "",
  allowedPages: ["/admin"] as AdminPagePath[],
  isActive: true,
};

function getAdminApiError(
  status: number,
  payload: unknown,
  fallback: string
) {
  if (status === 401) {
    return "This admin session cannot use Settings right now. Sign in again with the owner account.";
  }

  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return fallback;
}

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

function SettingsUserAvatar({
  profile,
  displayName,
  email,
  className = "h-12 w-12 rounded-2xl",
}: {
  profile?: AdminProfile;
  displayName: string;
  email: string;
  className?: string;
}) {
  const positionX = Math.min(100, Math.max(0, 50 - (profile?.avatarOffsetX || 0)));
  const positionY = Math.min(100, Math.max(0, 50 - (profile?.avatarOffsetY || 0)));

  return (
    <div className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-slate-100 text-sm font-semibold text-slate-700 ${className}`}>
      {profile?.avatarDataUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-no-repeat"
          style={{
            backgroundImage: `url(${profile.avatarDataUrl})`,
            backgroundPosition: `${positionX}% ${positionY}%`,
            transform: `scale(${profile.avatarZoom})`,
            transformOrigin: `${positionX}% ${positionY}%`,
          }}
        />
      ) : (
        getInitials(displayName, email)
      )}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
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
  const [userProfileDraft, setUserProfileDraft] = useState<AdminProfile>(() =>
    defaultAdminProfile({ displayName: "Administrator", isOwner: false })
  );
  const [userProfileEditorOpen, setUserProfileEditorOpen] = useState(false);
  const [currentAdminSession, setCurrentAdminSession] = useState<AdminSessionSummary | null>(null);
  const [sharedFirebaseAdminEmail, setSharedFirebaseAdminEmail] = useState<string | null>(null);
  const [resettingUserEmail, setResettingUserEmail] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [productionManager, setProductionManager] = useState<ProductionManager>({ name: "Tanvi", email: "" });
  const [productionPartners, setProductionPartners] = useState<PrintPartner[]>([]);
  const [operationalLoading, setOperationalLoading] = useState(true);
  const [operationalSaving, setOperationalSaving] = useState(false);
  const [operationalNotice, setOperationalNotice] = useState<string | null>(null);
  const [operationalError, setOperationalError] = useState<string | null>(null);
  const [editingOperationalId, setEditingOperationalId] = useState<string | null>(null);
  const operationalSyncStarted = useRef(false);

  useEffect(() => {
    let ignore = false;

    (async () => {
      try {
        const res = await fetch("/api/admin/session", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = await res.json().catch(() => ({}));

        if (!ignore && res.status === 401) {
          setUserError(
            "This admin session cannot use Settings right now. Sign in again with the owner account."
          );
          router.replace("/login");
          return;
        }

        if (!ignore && res.ok && data?.session && typeof data.session.email === "string") {
          setCurrentAdminSession({
            userId:
              typeof data.session.userId === "string"
                ? data.session.userId
                : data.session.email,
            displayName:
              typeof data.session.displayName === "string"
                ? data.session.displayName
                : "Admin",
            email: data.session.email,
            allowedPages: Array.isArray(data.session.allowedPages)
              ? data.session.allowedPages.filter(
                  (entry: unknown): entry is AdminPagePath => typeof entry === "string"
                )
              : [],
            isOwner: Boolean(data.session.isOwner),
          });
        }
      } catch {
        // Keep settings usable if the session summary fails to load.
      }
    })();

    return () => {
      ignore = true;
    };
  }, [router]);

  useEffect(() => {
    let ignore = false;

    (async () => {
      try {
        const res = await fetch("/api/admin/firebase-auth", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = await res.json().catch(() => ({}));

        if (!ignore && res.ok && typeof data?.email === "string" && data.email.trim()) {
          setSharedFirebaseAdminEmail(data.email.trim().toLowerCase());
        }
      } catch {
        // This account is optional and may not be available to every admin.
      }
    })();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    (async () => {
      try {
        const [notificationRes, usersRes] = await Promise.all([
          fetch("/api/admin/settings/quotation-notifications", {
            cache: "no-store",
            credentials: "same-origin",
          }),
          fetch("/api/admin/settings/users", {
            cache: "no-store",
            credentials: "same-origin",
          }),
        ]);

        const notificationData = await notificationRes.json().catch(() => ({}));
        const usersData = await usersRes.json().catch(() => ({}));

        if (!notificationRes.ok) {
          throw new Error(
            getAdminApiError(
              notificationRes.status,
              notificationData,
              "Failed to load quotation notification emails."
            )
          );
        }

        if (!usersRes.ok) {
          throw new Error(
            getAdminApiError(usersRes.status, usersData, "Failed to load admin users.")
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

    (async () => {
      try {
        const res = await fetch("/api/admin/partners", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof data?.error === "string" ? data.error : "Failed to load operational users.");
        }
        if (!ignore) {
          if (data?.manager) setProductionManager({
            ...(data.manager as ProductionManager),
            email: data.manager.email?.trim() || "tanvihulooman0212@gmail.com",
          });
          setProductionPartners(Array.isArray(data?.partners) ? data.partners.map((partner: PrintPartner) =>
            partner.id === "yan" && !partner.email.trim()
              ? { ...partner, email: "yan@gmail.com", emails: ["yan@gmail.com"] }
              : partner
          ) : []);
          setOperationalError(null);
        }
      } catch (error) {
        if (!ignore) {
          setOperationalError(error instanceof Error ? error.message : "Failed to load operational users.");
        }
      } finally {
        if (!ignore) setOperationalLoading(false);
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

  const firebaseUsers = useMemo(
    () => users.filter((user) => user.authProvider === "firebase"),
    [users]
  );

  const totalGrantedPages = useMemo(
    () => users.reduce((count, user) => count + user.allowedPages.length, 0),
    [users]
  );

  const editingUser = useMemo(
    () => users.find((user) => user.email === editingUserEmail) ?? null,
    [editingUserEmail, users]
  );

  const managedUserEmailSet = useMemo(
    () => new Set(users.map((user) => user.email.toLowerCase())),
    [users]
  );

  const managerNeedsFirebaseSetup = !productionManager.email.trim() ||
    !managedUserEmailSet.has(productionManager.email.trim().toLowerCase());
  const partnersNeedingFirebaseSetup = productionPartners.filter(
    (partner) => !partner.email.trim() || !managedUserEmailSet.has(partner.email.trim().toLowerCase())
  );

  useEffect(() => {
    if (usersLoading || operationalLoading || operationalSyncStarted.current) return;
    if (!managerNeedsFirebaseSetup && partnersNeedingFirebaseSetup.length === 0) return;
    operationalSyncStarted.current = true;

    (async () => {
      try {
        const syncRes = await fetch("/api/admin/settings/users/sync-operational", {
          method: "POST",
          credentials: "same-origin",
        });
        const syncData = await syncRes.json().catch(() => ({}));
        if (!syncRes.ok) throw new Error(typeof syncData?.error === "string" ? syncData.error : "Failed to synchronize Firebase users.");

        const usersRes = await fetch("/api/admin/settings/users", { cache: "no-store", credentials: "same-origin" });
        const usersData = await usersRes.json().catch(() => ({}));
        if (!usersRes.ok || !Array.isArray(usersData?.users)) throw new Error("Firebase users were created but the directory could not refresh.");
        setUsers(usersData.users);
        setOperationalError(null);
        setOperationalNotice("Tanvi, Yan, and Shabbanaz are ready in the administrator directory.");
      } catch (error) {
        setOperationalError(error instanceof Error ? error.message : "Failed to synchronize Firebase users.");
      }
    })();
  }, [managerNeedsFirebaseSetup, operationalLoading, partnersNeedingFirebaseSetup.length, usersLoading]);

  const showCurrentAdminCard = useMemo(() => {
    if (!currentAdminSession?.email) return false;
    return !managedUserEmailSet.has(currentAdminSession.email.toLowerCase());
  }, [currentAdminSession, managedUserEmailSet]);

  const showSharedFirebaseAdminCard = useMemo(() => {
    if (!sharedFirebaseAdminEmail) return false;
    if (managedUserEmailSet.has(sharedFirebaseAdminEmail.toLowerCase())) return false;
    if (
      currentAdminSession?.email &&
      currentAdminSession.email.toLowerCase() === sharedFirebaseAdminEmail.toLowerCase()
    ) {
      return false;
    }
    return true;
  }, [currentAdminSession, managedUserEmailSet, sharedFirebaseAdminEmail]);

  const hasDirectoryAccounts = useMemo(
    () => users.length > 0 || showCurrentAdminCard || showSharedFirebaseAdminCard,
    [showCurrentAdminCard, showSharedFirebaseAdminCard, users.length]
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
      return false;
    }

    setNotificationSaving(true);
    setNotificationError(null);
    setNotificationSaved(false);

    try {
      const res = await fetch("/api/admin/settings/quotation-notifications", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: notificationRecipients }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          getAdminApiError(
            res.status,
            data,
            "Failed to save quotation notification emails."
          )
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
      return true;
    } catch (error) {
      setNotificationError(
        error instanceof Error
          ? error.message
          : "Failed to save quotation notification emails."
      );
      return false;
    } finally {
      setNotificationSaving(false);
    }
  };

  const resetUserDraft = (options?: { preserveSaved?: boolean }) => {
    setEditingUserEmail(null);
    setUserDraft(EMPTY_USER_DRAFT);
    setUserProfileDraft(defaultAdminProfile({ displayName: "Administrator", isOwner: false }));
    setUserProfileEditorOpen(false);
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
      username: user.username,
      displayName: user.displayName,
      password: "",
      allowedPages: user.allowedPages,
      isActive: user.isActive,
    });
    setUserProfileDraft(
      user.profile || defaultAdminProfile({ displayName: user.displayName, isOwner: false })
    );
    setUserError(null);
    setUserSaved(false);
    setResetError(null);
    setResetNotice(null);
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

    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(userDraft.username.trim().toLowerCase())) {
      setUserError("Username must be 3–32 characters using letters, numbers, dots, dashes, or underscores.");
      return;
    }

    if (!editingUserEmail && userDraft.password.trim().length < 8) {
      setUserError("Password must be at least 8 characters.");
      return;
    }

    if (
      editingUserEmail &&
      userDraft.password.trim() &&
      userDraft.password.trim().length < 8
    ) {
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
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          username: userDraft.username.trim().toLowerCase(),
          displayName: userDraft.displayName,
          password: userDraft.password,
          allowedPages: userDraft.allowedPages,
          isActive: userDraft.isActive,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          getAdminApiError(
            res.status,
            data,
            isEditing
              ? "Failed to update admin user."
              : "Failed to create admin user."
          )
        );
      }

      const user = data?.user as AdminUserSummary | undefined;
      if (!user || typeof user.email !== "string") {
        throw new Error("Server returned an invalid admin user.");
      }

      const profilePayload: AdminProfile = {
        ...userProfileDraft,
        displayName: userDraft.displayName.trim(),
      };
      const profileRes = await fetch(
        `/api/admin/profile?userId=${encodeURIComponent(user.email)}`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profilePayload),
        }
      );
      const profileData = await profileRes.json().catch(() => ({}));
      const savedProfile = profileRes.ok && profileData?.profile
        ? profileData.profile as AdminProfile
        : profilePayload;
      const enrichedUser = { ...user, profile: savedProfile };

      setUsers((current) => {
        const others = current.filter((entry) => entry.email !== user.email);
        return [...others, enrichedUser].sort((left, right) => left.createdAt - right.createdAt);
      });
      setUserSaved(true);
      setResetError(null);
      setResetNotice(null);
      resetUserDraft({ preserveSaved: true });
      if (!profileRes.ok) {
        setUserError(profileData?.error || "User access was saved, but the profile picture could not be updated.");
      }
    } catch (error) {
      setUserError(
        error instanceof Error ? error.message : "Failed to save admin user."
      );
    } finally {
        setUsersSaving(false);
    }
  };

  const sendResetLink = async (user: AdminUserSummary) => {
    setResettingUserEmail(user.email);
    setResetError(null);
    setResetNotice(null);

    try {
      const res = await fetch("/api/admin/settings/users/reset-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          getAdminApiError(
            res.status,
            data,
            "Failed to send password reset email."
          )
        );
      }

      const nextUser = data?.user as AdminUserSummary | undefined;
      if (nextUser && typeof nextUser.email === "string") {
        setUsers((current) =>
          current
            .map((entry) => (entry.email === nextUser.email ? nextUser : entry))
            .sort((left, right) => left.createdAt - right.createdAt)
        );
      }

      setResetNotice(
        user.authProvider === "legacy"
          ? `Reset link sent to ${user.email}. This admin is now using Firebase Auth.`
          : `Reset link sent to ${user.email}.`
      );
      window.setTimeout(() => setResetNotice(null), 2400);
    } catch (error) {
      setResetError(
        error instanceof Error
          ? error.message
          : "Failed to send password reset email."
      );
    } finally {
      setResettingUserEmail(null);
    }
  };

  const saveOperationalUsers = async () => {
    setOperationalSaving(true);
    setOperationalError(null);
    setOperationalNotice(null);
    try {
      const res = await fetch("/api/admin/partners", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manager: productionManager, partners: productionPartners }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to update operational users.");
      if (data?.manager) setProductionManager(data.manager as ProductionManager);
      if (Array.isArray(data?.partners)) setProductionPartners(data.partners);

      const syncRes = await fetch("/api/admin/settings/users/sync-operational", {
        method: "POST",
        credentials: "same-origin",
      });
      const syncData = await syncRes.json().catch(() => ({}));
      if (!syncRes.ok) throw new Error(typeof syncData?.error === "string" ? syncData.error : "Users were saved, but Firebase synchronization failed.");

      const usersRes = await fetch("/api/admin/settings/users", { cache: "no-store", credentials: "same-origin" });
      const usersData = await usersRes.json().catch(() => ({}));
      if (usersRes.ok && Array.isArray(usersData?.users)) setUsers(usersData.users);
      setEditingOperationalId(null);
      const skipped = Array.isArray(syncData?.skipped) ? syncData.skipped : [];
      setOperationalNotice(skipped.length ? `Saved to Firebase. Add an email for ${skipped.join(", ")}.` : "All operational users are stored in Firebase.");
      window.setTimeout(() => setOperationalNotice(null), 2400);
    } catch (error) {
      setOperationalError(error instanceof Error ? error.message : "Failed to update operational users.");
    } finally {
      setOperationalSaving(false);
    }
  };

  const panelClass = "rounded-[32px] border border-slate-200 bg-white shadow-sm";

  return (
    <main className="relative min-h-screen bg-white text-[#1a1a1a]">
      <div className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6">
        <header className={`${panelClass} relative overflow-hidden p-8`}>
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                Workspace Control
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
                Workspace settings
              </h1>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Notification Routes</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{notificationRecipients.length}</div>
                <div className="text-xs text-slate-500">Quotation inboxes</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Admin Users</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{users.length}</div>
                <div className="text-xs text-slate-500">{firebaseUsers.length} using Firebase Auth</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Page Grants</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{totalGrantedPages}</div>
                <div className="text-xs text-slate-500">Pages assigned across staff</div>
              </div>
            </div>
          </div>
        </header>

        <section className={`${panelClass} overflow-hidden`}>
          <div className="grid lg:grid-cols-[minmax(0,1.2fr)_360px]">
            <div className="p-6 sm:p-8 lg:border-r lg:border-slate-200/70">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
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

            <aside className="bg-slate-50/70 p-6 sm:p-8">
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
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                <Users className="h-3.5 w-3.5" />
                Admin Access
              </div>
              <h2 className="mt-4 text-xl font-semibold text-slate-900">
                Admin authentication and access
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Create Firebase-backed admin accounts, send password reset links,
                and choose exactly which admin pages each team member can use.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Managed users</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{users.length}</div>
                <div className="text-xs text-slate-500">Accounts created</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Firebase auth</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{firebaseUsers.length}</div>
                <div className="text-xs text-slate-500">{activeUsers.length} active right now</div>
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
                    {editingUserEmail ? "Update admin access" : "New admin account"}
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

              <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
                <SettingsUserAvatar
                  profile={userProfileDraft}
                  displayName={userProfileDraft.displayName || userDraft.displayName || "Administrator"}
                  email={userDraft.email || "admin@mo-tshirt.mu"}
                  className="h-20 w-20 rounded-full ring-1 ring-slate-200"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900">Profile picture</div>
                  <div className="mt-1 text-xs text-slate-500">Upload, zoom, and reposition the administrator photo.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setUserProfileEditorOpen(true)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <Camera className="h-4 w-4" />
                  Edit profile
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-xs font-semibold text-slate-600">
                  Full name
                  <input
                    value={userDraft.displayName}
                    onChange={(e) => {
                      setUserDraft((current) => ({ ...current, displayName: e.target.value }));
                      setUserProfileDraft((current) => ({ ...current, displayName: e.target.value }));
                      setUserError(null);
                      setUserSaved(false);
                    }}
                    placeholder="e.g. Sales Assistant"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
                <label className="grid gap-2 text-xs font-semibold text-slate-600">
                  Username
                  <input
                    value={userDraft.username}
                    onChange={(e) => {
                      setUserDraft((current) => ({ ...current, username: e.target.value.toLowerCase() }));
                      setUserError(null);
                      setUserSaved(false);
                    }}
                    placeholder="e.g. tanvi"
                    autoComplete="username"
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
                    disabled={editingUser?.authProvider === "firebase"}
                    placeholder={
                      editingUser?.authProvider === "firebase"
                        ? "Use the reset link action for Firebase users"
                        : editingUserEmail
                          ? "Leave blank to keep current login method"
                          : "Minimum 8 characters"
                    }
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  <span className="text-[11px] font-normal leading-5 text-slate-500">
                    {editingUser?.authProvider === "firebase"
                      ? "This user already signs in with Firebase Auth. Send a reset link below if they need a new password."
                      : editingUser?.authProvider === "legacy"
                        ? "Enter a new password to move this legacy account onto Firebase Auth, or send a reset link from the user list."
                        : "This password creates the Firebase sign-in for the new admin account."}
                  </span>
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
                    <div className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                      {items.map((item) => {
                        const checked = userDraft.allowedPages.includes(item.path);
                        return (
                          <label
                            key={item.path}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition ${
                              checked
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleUserPage(item.path)}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                            <div className="min-w-0 truncate text-sm font-semibold">{item.label}</div>
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
                <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  User saved
                </div>
              ) : null}

              {resetError ? (
                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {resetError}
                </div>
              ) : null}

              {resetNotice ? (
                <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                  <KeyRound className="h-4 w-4" />
                  {resetNotice}
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
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Authentication Directory
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {users.length + partnersNeedingFirebaseSetup.length + (managerNeedsFirebaseSetup ? 1 : 0)}
                  </span>
                </div>
              </div>

              {managerNeedsFirebaseSetup ? <div className="rounded-[28px] border border-slate-900 bg-slate-950 p-5 text-white shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold">{productionManager.name || "Tanvi"}</div>
                    <div className="mt-1 text-xs text-slate-400">Production manager</div>
                  </div>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Active</span>
                </div>
                {editingOperationalId === "manager" ? (
                  <div className="mt-4 space-y-2">
                    <input
                      type="text"
                      value={productionManager.name}
                      onChange={(event) => setProductionManager((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Full name"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-white/30"
                    />
                    <input
                      type="email"
                      value={productionManager.email}
                      onChange={(event) => setProductionManager((current) => ({ ...current, email: event.target.value }))}
                      placeholder="Add email address"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-white/30"
                    />
                  </div>
                ) : (
                  <div className="mt-4 text-sm text-slate-400">{productionManager.email || "No email added"}</div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {['Production Workspace', 'Quotes & Invoices', 'Couple Goals'].map((access) => (
                    <span key={access} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-300">{access}</span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => editingOperationalId === "manager" ? void saveOperationalUsers() : setEditingOperationalId("manager")}
                  disabled={operationalSaving}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/10"
                >
                  {editingOperationalId === "manager" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <PencilLine className="h-3.5 w-3.5" />}
                  {editingOperationalId === "manager" ? "Save user" : "Edit user"}
                </button>
              </div> : null}

              {partnersNeedingFirebaseSetup.map((partner) => (
                <div key={partner.id} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white">{getInitials(partner.name, partner.email || partner.id)}</div>
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-slate-900">{partner.name}</div>
                        <div className="text-xs text-slate-500">Production partner</div>
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${partner.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{partner.active ? 'Active' : 'Paused'}</span>
                  </div>
                  {editingOperationalId === partner.id ? (
                    <div className="mt-4 space-y-2">
                      <input
                        type="text"
                        value={partner.name}
                        onChange={(event) => setProductionPartners((current) => current.map((entry) => entry.id === partner.id ? { ...entry, name: event.target.value } : entry))}
                        placeholder="Full name"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                      />
                      <input
                        type="email"
                        value={partner.email}
                        onChange={(event) => setProductionPartners((current) => current.map((entry) => entry.id === partner.id ? { ...entry, email: event.target.value, emails: event.target.value.trim() ? [event.target.value.trim()] : [] } : entry))}
                        placeholder="Add email address"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                      />
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <input type="checkbox" checked={partner.active} onChange={(event) => setProductionPartners((current) => current.map((entry) => entry.id === partner.id ? { ...entry, active: event.target.checked } : entry))} className="h-4 w-4 rounded border-slate-300" />
                        Active account
                      </label>
                    </div>
                  ) : (
                    <div className="mt-4 text-sm text-slate-500">{partner.email || "No email added"}</div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">Production Workspace</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">Assigned orders only</span>
                    {partner.hasPassword ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">Login ready</span> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => editingOperationalId === partner.id ? void saveOperationalUsers() : setEditingOperationalId(partner.id)}
                    disabled={operationalSaving}
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    {editingOperationalId === partner.id ? <CheckCircle2 className="h-3.5 w-3.5" /> : <PencilLine className="h-3.5 w-3.5" />}
                    {editingOperationalId === partner.id ? "Save user" : "Edit user"}
                  </button>
                </div>
              ))}

              {managerNeedsFirebaseSetup || partnersNeedingFirebaseSetup.length ? <button
                type="button"
                onClick={saveOperationalUsers}
                disabled={operationalLoading || operationalSaving}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
              >
                {operationalSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {operationalSaving ? "Saving" : "Save operational users"}
              </button> : null}
              {operationalError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{operationalError}</div> : null}
              {operationalNotice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{operationalNotice}</div> : null}

              {showCurrentAdminCard ? (
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-700">
                        {getInitials(
                          currentAdminSession?.displayName || "Owner",
                          currentAdminSession?.email || "owner"
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-slate-900">
                          {currentAdminSession?.displayName || "Workspace Owner"}
                        </div>
                        <div className="truncate text-sm text-slate-500">
                          {currentAdminSession?.email || "—"}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        Active
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                        Owner Account
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                      Full workspace access
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                      {currentAdminSession?.allowedPages.length || 0} page grants in session
                    </span>
                  </div>
                </div>
              ) : null}

              {showSharedFirebaseAdminCard ? (
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-700">
                        {getInitials("Firebase Admin", sharedFirebaseAdminEmail || "firebase")}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-slate-900">
                          Shared Firebase Admin
                        </div>
                        <div className="truncate text-sm text-slate-500">
                          {sharedFirebaseAdminEmail}
                        </div>
                      </div>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      Firebase Auth
                    </span>
                  </div>

                </div>
              ) : null}

              {users.length ? (
                users.map((user) => (
                  <div
                    key={user.email}
                    className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <SettingsUserAvatar
                          profile={user.profile}
                          displayName={user.displayName}
                          email={user.email}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold text-slate-900">
                            {user.displayName}
                          </div>
                          <div className="truncate text-sm text-slate-500">{user.email}</div>
                          <div className="mt-1 truncate text-xs font-semibold text-slate-400">@{user.username}</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                            user.isActive
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-100 text-slate-500"
                          }`}
                        >
                          {user.isActive ? "Active" : "Paused"}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                          {user.authProvider === "firebase" ? "Firebase Auth" : "Legacy Auth"}
                        </span>
                      </div>
                    </div>

                    {user.authProvider === "legacy" ? (
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        This account still uses the legacy admin password system. Send a reset link to move it to Firebase Auth.
                      </div>
                    ) : null}

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

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                      <div className="flex flex-col gap-1">
                        Updated {formatDateTime(user.updatedAt)}
                        <span>
                          Created {formatDateTime(user.createdAt)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => sendResetLink(user)}
                          disabled={resettingUserEmail === user.email}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          {resettingUserEmail === user.email
                            ? "Sending..."
                            : user.authProvider === "legacy"
                              ? "Reset + Migrate"
                              : "Send reset link"}
                        </button>
                        <button
                          onClick={() => startEditingUser(user)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          <PencilLine className="h-3.5 w-3.5" />
                          Edit user
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : !usersLoading && !hasDirectoryAccounts ? (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="mt-4 text-base font-semibold text-slate-700">
                    No directory accounts yet
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Create the first managed admin user to give a team member controlled workspace access.
                  </p>
                </div>
              ) : null}
            </aside>
          </div>
        </section>
      </div>
      <AdminProfileEditor
        open={userProfileEditorOpen}
        profile={userProfileDraft}
        email={userDraft.email || "Email added when the user is saved"}
        fallbackAvatarUrl={null}
        onSaveRequest={async (profile) => profile}
        onClose={() => setUserProfileEditorOpen(false)}
        onSaved={(profile) => {
          setUserProfileDraft(profile);
          setUserDraft((current) => ({ ...current, displayName: profile.displayName }));
          setUserProfileEditorOpen(false);
          setUserError(null);
          setUserSaved(false);
        }}
      />
      <UnsavedChangesGuard
        active={notificationHasChanges}
        isSaving={notificationSaving}
        onSave={saveNotificationRecipients}
        title="Save quotation notification changes?"
        message="You changed the quotation email recipients. Save them before opening another admin page, or leave without saving."
      />
    </main>
  );
}
