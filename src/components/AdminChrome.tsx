"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import {
  ADMIN_PAGE_OPTIONS,
  ALL_ADMIN_PAGE_PATHS,
  DEFAULT_MORE_NAV_PATHS,
  DEFAULT_TOP_NAV_PATHS,
  type AdminPagePath,
} from "@/lib/admin-access";
import { signOutAdminFromFirebase } from "@/lib/firebase-admin-client-auth";

type AdminSessionSummary = {
  displayName: string;
  email: string;
  allowedPages: AdminPagePath[];
  isOwner: boolean;
};

const NAV_STORAGE = "admin-nav-v2";

const PAGE_LABELS = new Map(
  ADMIN_PAGE_OPTIONS.map((option) => [option.path, option.label])
);
const PAGE_DESCRIPTIONS = new Map(
  ADMIN_PAGE_OPTIONS.map((option) => [option.path, option.description])
);
const ALL_PAGE_PATHS_SET = new Set<AdminPagePath>(ALL_ADMIN_PAGE_PATHS);

function toPagePath(value: unknown) {
  const rawValue =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "href" in value
        ? value.href
        : null;

  if (typeof rawValue !== "string") return null;
  if (!ALL_PAGE_PATHS_SET.has(rawValue as AdminPagePath)) return null;
  return rawValue as AdminPagePath;
}

function normalizeNavOrder(topRaw: unknown, moreRaw: unknown) {
  const seen = new Set<AdminPagePath>();
  const top: AdminPagePath[] = [];
  const more: AdminPagePath[] = [];

  const appendPath = (target: AdminPagePath[], value: unknown) => {
    const path = toPagePath(value);
    if (!path || seen.has(path)) return;
    seen.add(path);
    target.push(path);
  };

  if (Array.isArray(topRaw)) {
    topRaw.forEach((entry) => appendPath(top, entry));
  }

  if (Array.isArray(moreRaw)) {
    moreRaw.forEach((entry) => appendPath(more, entry));
  }

  DEFAULT_TOP_NAV_PATHS.forEach((path) => appendPath(top, path));
  DEFAULT_MORE_NAV_PATHS.forEach((path) => appendPath(more, path));

  return { top, more };
}

function isNavPathActive(path: AdminPagePath, pathname: string) {
  if (path === "/admin/iot" && pathname === "/iot") return true;
  if (path === "/admin") return pathname === "/admin";
  return pathname === path || pathname.startsWith(`${path}/`);
}

function getLabel(path: AdminPagePath) {
  return PAGE_LABELS.get(path) || path;
}

function getDescription(path: AdminPagePath) {
  return PAGE_DESCRIPTIONS.get(path) || "Open module";
}

export default function AdminChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useAdminTheme();
  const isDark = theme === "dark";
  const isPartnerDesk =
    pathname === "/admin/yan_list" ||
    pathname === "/admin/shab_list" ||
    (pathname.startsWith("/admin/partners/") && pathname !== "/admin/partners");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [hasLoadedNav, setHasLoadedNav] = useState(false);
  const [topNav, setTopNav] = useState<AdminPagePath[]>(DEFAULT_TOP_NAV_PATHS);
  const [moreNav, setMoreNav] = useState<AdminPagePath[]>(DEFAULT_MORE_NAV_PATHS);
  const [session, setSession] = useState<AdminSessionSummary | null>(null);

  useEffect(() => {
    if (isPartnerDesk) {
      setHasLoadedNav(true);
      return;
    }

    try {
      const raw = localStorage.getItem(NAV_STORAGE);
      if (raw) {
        const parsed = JSON.parse(raw);
        const normalized = normalizeNavOrder(parsed?.top, parsed?.more);
        setTopNav(normalized.top);
        setMoreNav(normalized.more);
      } else {
        const normalized = normalizeNavOrder(DEFAULT_TOP_NAV_PATHS, DEFAULT_MORE_NAV_PATHS);
        setTopNav(normalized.top);
        setMoreNav(normalized.more);
      }
    } catch {
      const normalized = normalizeNavOrder(DEFAULT_TOP_NAV_PATHS, DEFAULT_MORE_NAV_PATHS);
      setTopNav(normalized.top);
      setMoreNav(normalized.more);
    } finally {
      setHasLoadedNav(true);
    }
  }, [isPartnerDesk]);

  useEffect(() => {
    if (isPartnerDesk) return;
    if (!hasLoadedNav) return;
    try {
      localStorage.setItem(
        NAV_STORAGE,
        JSON.stringify({ top: topNav, more: moreNav })
      );
    } catch {}
  }, [hasLoadedNav, isPartnerDesk, moreNav, topNav]);

  useEffect(() => {
    let ignore = false;

    (async () => {
      if (isPartnerDesk) return;

      try {
        const res = await fetch("/api/admin/session", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.session) return;

        const nextSession = data.session as Partial<AdminSessionSummary>;
        if (
          ignore ||
          !Array.isArray(nextSession.allowedPages) ||
          typeof nextSession.displayName !== "string" ||
          typeof nextSession.email !== "string" ||
          typeof nextSession.isOwner !== "boolean"
        ) {
          return;
        }

        setSession({
          displayName: nextSession.displayName,
          email: nextSession.email,
          allowedPages: nextSession.allowedPages as AdminPagePath[],
          isOwner: nextSession.isOwner,
        });
      } catch {}
    })();

    return () => {
      ignore = true;
    };
  }, [isPartnerDesk]);

  useEffect(() => {
    if (session && !session.isOwner) {
      setEditing(false);
    }
  }, [session]);

  const canEditNavigation = session?.isOwner !== false;

  const visiblePages = useMemo(() => {
    if (!session || session.isOwner) {
      return new Set<AdminPagePath>(ALL_ADMIN_PAGE_PATHS);
    }
    return new Set<AdminPagePath>(session.allowedPages);
  }, [session]);

  const visibleTopNav = useMemo(
    () =>
      topNav
        .map((path, index) => ({ path, index }))
        .filter((entry) => visiblePages.has(entry.path)),
    [topNav, visiblePages]
  );

  const visibleMoreNav = useMemo(
    () =>
      moreNav
        .map((path, index) => ({ path, index }))
        .filter((entry) => visiblePages.has(entry.path)),
    [moreNav, visiblePages]
  );

  const currentLabel = useMemo(() => {
    const currentPath = ALL_ADMIN_PAGE_PATHS.find((path) =>
      isNavPathActive(path, pathname)
    );
    return currentPath ? getLabel(currentPath) : "Admin";
  }, [pathname]);

  function moveWithin(list: "top" | "more", index: number, delta: number) {
    const setList = list === "top" ? setTopNav : setMoreNav;
    setList((current) => {
      const next = current.slice();
      const newIndex = (index + delta + next.length) % next.length;
      const [item] = next.splice(index, 1);
      next.splice(newIndex, 0, item);
      return next;
    });
  }

  function moveBetween(list: "top" | "more", index: number) {
    if (list === "top") {
      setTopNav((currentTop) => {
        const nextTop = currentTop.slice();
        const [item] = nextTop.splice(index, 1);
        setMoreNav((currentMore) => [...currentMore, item]);
        return nextTop;
      });
      return;
    }

    setMoreNav((currentMore) => {
      const nextMore = currentMore.slice();
      const [item] = nextMore.splice(index, 1);
      setTopNav((currentTop) => [...currentTop, item]);
      return nextMore;
    });
  }

  async function logout() {
    await Promise.allSettled([
      fetch("/api/logout", { method: "POST" }),
      signOutAdminFromFirebase(),
    ]);
    router.replace("/login");
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const rootClass = isDark ? "bg-[#010503] text-[#f7fff3]" : "bg-white text-[#222222]";
  const topBarClass = isDark
    ? "border-[#17331b] bg-black/88 shadow-[0_1px_0_rgba(89,214,46,0.28),0_18px_50px_rgba(0,0,0,0.55)]"
    : "border-[#ebebeb] bg-white/92 shadow-[0_10px_30px_rgba(0,0,0,0.04)]";
  const circleButtonClass = isDark
    ? "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#285b25] bg-[#04100a] text-[#7cff45] shadow-[0_0_22px_rgba(89,214,46,0.13)] transition hover:border-[#7cff45] hover:bg-[#07190d] sm:h-11 sm:w-11"
    : "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#ebebeb] bg-white text-[#222222] shadow-[0_4px_14px_rgba(0,0,0,0.04)] transition hover:border-[#d7d7d7] hover:bg-[#f7f7f7] hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] sm:h-11 sm:w-11";
  const rolePillClass = isDark
    ? "hidden shrink-0 items-center gap-2 rounded-full border border-[#285b25] bg-[#04100a] px-3 py-1.5 text-xs font-semibold text-[#9af45c] sm:inline-flex"
    : "hidden shrink-0 items-center gap-2 rounded-full border border-[#ebebeb] bg-white px-3 py-1.5 text-xs text-[#6a6a6a] shadow-[0_4px_14px_rgba(0,0,0,0.04)] sm:inline-flex";
  const drawerPanelClass = isDark
    ? "border-[#17331b] bg-[#020604] shadow-[24px_0_80px_rgba(0,0,0,0.72)]"
    : "border-[#ebebeb] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.12)]";
  const profileCardClass = isDark
    ? "border-[#21491f] bg-[#04100a] shadow-[0_0_30px_rgba(89,214,46,0.08)]"
    : "border-[#ebebeb] bg-white shadow-[0_10px_28px_rgba(0,0,0,0.06)]";
  const subtleLabelClass = isDark ? "text-[#79d95a]" : "text-[#8a8a8a]";
  const profileMetaClass = isDark ? "text-[#b7c6b3]" : "text-[#6a6a6a]";
  const editButtonClass = (active: boolean) =>
    active
      ? isDark
        ? "border-[#7cff45] bg-[#59d62e]/20 text-[#dfffca]"
        : "border-[#222222] bg-[#222222] text-white shadow-[0_8px_20px_rgba(0,0,0,0.16)]"
      : isDark
        ? "border-[#21491f] bg-[#04100a] text-[#f7fff3] hover:border-[#7cff45] hover:bg-[#07190d]"
        : "border-[#ebebeb] bg-white text-[#484848] hover:border-[#d7d7d7] hover:bg-[#f7f7f7]";
  const themeButtonClass = isDark
    ? "border-[#1f63ff]/55 bg-[#1f63ff]/14 text-[#b9d1ff] hover:border-[#1f63ff] hover:bg-[#1f63ff]/22"
    : "border-[#ebebeb] bg-white text-[#484848] hover:border-[#d7d7d7] hover:bg-[#f7f7f7]";
  const accessCardClass = isDark
    ? "border-[#21491f] bg-black/45 text-[#b7c6b3]"
    : "border-[#ebebeb] bg-white text-[#6a6a6a]";
  const editRowClass = isDark
    ? "border-[#21491f] bg-[#04100a]"
    : "border-[#ebebeb] bg-white";
  const editChipClass = isDark
    ? "border-[#21491f] text-[#b7c6b3] hover:bg-[#07190d]"
    : "border-[#ebebeb] text-[#6a6a6a] hover:bg-[#f7f7f7]";
  const editLabelClass = isDark
    ? "border-[#21491f] bg-black/35 text-[#f7fff3]"
    : "border-[#ebebeb] bg-white text-[#222222]";
  const navActiveClass = isDark
    ? "border-[#7cff45]/70 bg-[#59d62e]/16 text-[#dfffca] shadow-[0_0_24px_rgba(89,214,46,0.18)]"
    : "border-[#222222] bg-[#222222] text-white shadow-[0_10px_24px_rgba(0,0,0,0.12)]";
  const navInactiveClass = isDark
    ? "border-transparent text-[#e9f4e5] hover:border-[#21491f] hover:bg-[#07190d]"
    : "border-transparent text-[#484848] hover:border-[#ebebeb] hover:bg-[#f7f7f7]";
  const shellClass = isDark
    ? "admin-page-shell relative min-h-screen max-w-full overflow-x-hidden bg-[#010503] p-3 text-[#f7fff3] transition-colors sm:p-6 lg:p-8"
    : "admin-page-shell airbnb-admin-shell relative min-h-screen max-w-full overflow-x-hidden bg-transparent p-3 text-[#222222] transition-colors sm:p-6 lg:p-8";
  const logoutButtonClass = isDark
    ? "border-rose-500/45 bg-rose-500/15 text-rose-200 hover:border-rose-400/60 hover:bg-rose-500/25"
    : "border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50";

  if (isPartnerDesk) {
    return <div className="min-h-screen bg-[#f6f8fb] text-slate-950">{children}</div>;
  }

  return (
    <div className={`min-h-screen w-full max-w-full overflow-x-hidden transition-colors ${rootClass}`}>
      {!isDark ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none fixed inset-x-0 top-0 z-0 h-44 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,255,255,0))]"
          />
        </>
      ) : null}
      <div
        className={`sticky top-0 z-40 border-b backdrop-blur-xl transition-colors ${topBarClass}`}
      >
        <div className="relative z-10 mx-auto flex w-full max-w-[1760px] min-w-0 items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4 lg:px-8">
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className={circleButtonClass}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                {open ? (
                  <path
                    fillRule="evenodd"
                    d="M6.225 4.811a1 1 0 0 1 1.414 0L12 9.172l4.361-4.36a1 1 0 1 1 1.414 1.414L13.414 10.586l4.36 4.361a1 1 0 0 1-1.414 1.414L12 12l-4.361 4.361a1 1 0 1 1-1.414-1.414l4.36-4.361-4.36-4.361a1 1 0 0 1 0-1.414Z"
                    clipRule="evenodd"
                  />
                ) : (
                  <path
                    fillRule="evenodd"
                    d="M4.5 6.75A.75.75 0 0 1 5.25 6h13.5a.75.75 0 0 1 0 1.5H5.25A.75.75 0 0 1 4.5 6.75Zm0 5.25a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H5.25a.75.75 0 0 1-.75-.75Zm.75 4.5a.75.75 0 0 0 0 1.5h13.5a.75.75 0 0 0 0-1.5H5.25Z"
                    clipRule="evenodd"
                  />
                )}
              </svg>
            </button>
            <button
              type="button"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              onClick={toggleTheme}
              className={circleButtonClass}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                {isDark ? (
                  <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0-16a.75.75 0 0 1 .75.75V4a.75.75 0 0 1-1.5 0V2.75A.75.75 0 0 1 12 2Zm0 18a.75.75 0 0 1 .75.75V22a.75.75 0 0 1-1.5 0v-1.25A.75.75 0 0 1 12 20Zm10-8a.75.75 0 0 1-.75.75H20a.75.75 0 0 1 0-1.5h1.25A.75.75 0 0 1 22 12ZM4 12a.75.75 0 0 1-.75.75H2a.75.75 0 0 1 0-1.5h1.25A.75.75 0 0 1 4 12Zm14.364 6.364a.75.75 0 0 1 1.06 1.06l-.884.884a.75.75 0 1 1-1.06-1.06l.884-.884ZM6.52 6.52a.75.75 0 0 1 1.06 0l.884.884a.75.75 0 1 1-1.06 1.06L6.52 7.58a.75.75 0 0 1 0-1.06Zm12.944 0a.75.75 0 0 1 0 1.06l-.884.884a.75.75 0 1 1-1.06-1.06l.884-.884a.75.75 0 0 1 1.06 0ZM7.58 17.404a.75.75 0 0 1 0 1.06l-.884.884a.75.75 0 1 1-1.06-1.06l.884-.884a.75.75 0 0 1 1.06 0Z" />
                ) : (
                  <path d="M21 12.79A9 9 0 0 1 11.21 3a.75.75 0 0 0-.95-.73A10.5 10.5 0 1 0 21.73 13.74a.75.75 0 0 0-.73-.95Z" />
                )}
              </svg>
            </button>
            <div className={rolePillClass}>
              <span className={`h-2 w-2 rounded-full ${isDark ? "bg-[#7cff45] shadow-[0_0_12px_rgba(124,255,69,0.8)]" : "bg-[#ff6600]"}`} />
              {session?.isOwner ? "Owner" : "Live"}
            </div>
          </div>

          <div className="ml-auto flex min-w-0 items-center justify-end gap-2 sm:gap-3">
            <div className="min-w-0 max-w-[52vw] text-right sm:max-w-none">
              <div className={`truncate text-[10px] font-semibold uppercase tracking-[0.22em] sm:text-[11px] sm:tracking-[0.28em] ${subtleLabelClass}`}>
                MO Admin
              </div>
              <div className={`truncate text-sm font-semibold ${isDark ? "text-[#f7fff3]" : "text-[#222222]"}`}>
                {currentLabel}
              </div>
              <div className={`hidden truncate text-xs sm:block ${profileMetaClass}`}>
                Dream operating dashboard
              </div>
            </div>
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full sm:h-12 sm:w-12 ${
                isDark
                  ? "border border-[#285b25] bg-[#07190d]"
                  : "bg-white shadow-[0_12px_28px_rgba(0,0,0,0.14)]"
              }`}
            >
              <Image
                src="/logo_transparent.png"
                alt="MO T-SHIRT"
                width={96}
                height={96}
                className="h-8 w-8 object-contain sm:h-10 sm:w-10"
                priority={false}
              />
            </div>
          </div>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50">
          <div
            className={`absolute inset-0 ${isDark ? "bg-black/40" : "bg-black/18"} backdrop-blur-sm`}
            style={{ animation: "fadeIn 0.2s ease-out both" }}
            onClick={() => setOpen(false)}
          />
          <div
            className={`absolute inset-y-0 left-0 flex w-[calc(100vw-1rem)] max-w-[24rem] flex-col rounded-r-[32px] border-r p-5 transition-colors ${drawerPanelClass}`}
            style={{ animation: "drawerIn 0.25s ease-out both" }}
          >
            <div
              className={`relative overflow-hidden rounded-[28px] border p-4 transition-colors ${profileCardClass}`}
            >
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-[11px] font-semibold uppercase tracking-[0.28em] ${profileMetaClass}`}>
                    {session?.isOwner ? "Owner Session" : "Team Session"}
                  </div>
                  <div className={`mt-2 truncate text-lg font-semibold ${isDark ? "text-[#f7fff3]" : "text-[#222222]"}`}>
                    {session?.displayName || "Admin"}
                  </div>
                  <div className={`mt-1 truncate text-xs ${profileMetaClass}`}>
                    {session?.email || "Loading access profile..."}
                  </div>
                </div>

                {canEditNavigation ? (
                  <button
                    type="button"
                    onClick={() => setEditing((value) => !value)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${editButtonClass(editing)}`}
                  >
                    {editing ? "Done" : "Edit"}
                  </button>
                ) : null}
              </div>

              <div className="relative mt-4 grid gap-3">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className={`inline-flex items-center justify-center rounded-full border px-3 py-2 text-xs font-semibold transition ${themeButtonClass}`}
                >
                  {isDark ? "Switch To Light Mode" : "Switch To Dark Mode"}
                </button>

                <div
                  className={`rounded-[22px] border px-4 py-3 ${accessCardClass}`}
                >
                  <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${subtleLabelClass}`}>
                    Access
                  </div>
                  <div className="mt-1 text-sm font-semibold text-inherit">
                    {session?.isOwner
                      ? "Full admin access"
                      : `${session?.allowedPages.length || 0} page permissions assigned`}
                  </div>
                </div>
              </div>
            </div>

            <nav className="mt-5 flex-1 space-y-4 overflow-y-auto pr-1">
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-[0.28em] ${subtleLabelClass}`}>
                  Core
                </div>
                <div className="mt-3 space-y-2">
                  {visibleTopNav.map(({ path, index }) => {
                    const active = isNavPathActive(path, pathname);
                    const label = getLabel(path);
                    return editing ? (
                      <div
                        key={path}
                        className={`flex items-center gap-2 rounded-2xl border px-2 py-2 ${editRowClass}`}
                      >
                        <button
                          type="button"
                          aria-label={`Move ${label} up`}
                          onClick={() => moveWithin("top", index, -1)}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${editChipClass}`}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${label} down`}
                          onClick={() => moveWithin("top", index, 1)}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${editChipClass}`}
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${label} to more`}
                          onClick={() => moveBetween("top", index)}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${editChipClass}`}
                        >
                          Move
                        </button>
                        <span
                          className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${editLabelClass}`}
                        >
                          {label}
                        </span>
                      </div>
                    ) : (
                      <Link
                        key={path}
                        href={path}
                        onClick={() => setOpen(false)}
                        className={`group flex items-center justify-between rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                          active ? navActiveClass : navInactiveClass
                        }`}
                        title={getDescription(path)}
                      >
                        <span>{label}</span>
                        <span
                          className={`h-2 w-2 rounded-full ${
                            active
                              ? isDark
                                ? "bg-[#7cff45] shadow-[0_0_10px_rgba(124,255,69,0.7)]"
                                : "bg-[#ff6600]"
                              : isDark
                                ? "bg-[#2c6228] group-hover:bg-[#7cff45]"
                                : "bg-[#d0d0d0] group-hover:bg-[#999999]"
                          }`}
                        />
                      </Link>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-[0.28em] ${subtleLabelClass}`}>
                  More
                </div>
                <div className="mt-3 space-y-2">
                  {visibleMoreNav.map(({ path, index }) => {
                    const active = isNavPathActive(path, pathname);
                    const label = getLabel(path);
                    return editing ? (
                      <div
                        key={path}
                        className={`flex items-center gap-2 rounded-2xl border px-2 py-2 ${editRowClass}`}
                      >
                        <button
                          type="button"
                          aria-label={`Move ${label} up`}
                          onClick={() => moveWithin("more", index, -1)}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${editChipClass}`}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${label} down`}
                          onClick={() => moveWithin("more", index, 1)}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${editChipClass}`}
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${label} to core`}
                          onClick={() => moveBetween("more", index)}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${editChipClass}`}
                        >
                          Move
                        </button>
                        <span
                          className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${editLabelClass}`}
                        >
                          {label}
                        </span>
                      </div>
                    ) : (
                      <Link
                        key={path}
                        href={path}
                        onClick={() => setOpen(false)}
                        className={`group flex items-center justify-between rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                          active ? navActiveClass : navInactiveClass
                        }`}
                        title={getDescription(path)}
                      >
                        <span>{label}</span>
                        <span
                          className={`h-2 w-2 rounded-full ${
                            active
                              ? isDark
                                ? "bg-[#7cff45] shadow-[0_0_10px_rgba(124,255,69,0.7)]"
                                : "bg-[#ff6600]"
                              : isDark
                                ? "bg-[#2c6228] group-hover:bg-[#7cff45]"
                                : "bg-[#d0d0d0] group-hover:bg-[#999999]"
                          }`}
                        />
                      </Link>
                    );
                  })}
                </div>
              </div>
            </nav>

            <div
              className={`mt-4 border-t pt-4 ${isDark ? "border-[#21491f]" : "border-[#ebebeb]"}`}
            >
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className={`w-full rounded-full border px-4 py-2 text-sm font-semibold shadow-sm transition ${logoutButtonClass}`}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main className="ml-0">
        <div className={shellClass}>
          {!isDark ? (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,0.92))]"
              />
            </>
          ) : (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(89,214,46,0.14),transparent_28%),radial-gradient(circle_at_88%_10%,rgba(31,99,255,0.16),transparent_28%),linear-gradient(rgba(124,255,69,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(124,255,69,0.035)_1px,transparent_1px)] bg-[size:auto,auto,36px_36px,36px_36px]"
            />
          )}
          <div className="relative z-10">{children}</div>
        </div>
      </main>

      <style jsx>{`
        @keyframes drawerIn {
          from {
            opacity: 0;
            transform: translateX(-12px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
