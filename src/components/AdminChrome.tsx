"use client";

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
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [hasLoadedNav, setHasLoadedNav] = useState(false);
  const [topNav, setTopNav] = useState<AdminPagePath[]>(DEFAULT_TOP_NAV_PATHS);
  const [moreNav, setMoreNav] = useState<AdminPagePath[]>(DEFAULT_MORE_NAV_PATHS);
  const [session, setSession] = useState<AdminSessionSummary | null>(null);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!hasLoadedNav) return;
    try {
      localStorage.setItem(
        NAV_STORAGE,
        JSON.stringify({ top: topNav, more: moreNav })
      );
    } catch {}
  }, [hasLoadedNav, moreNav, topNav]);

  useEffect(() => {
    let ignore = false;

    (async () => {
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
  }, []);

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

  const rootClass = isDark ? "bg-slate-950 text-slate-100" : "bg-white text-[#222222]";
  const topBarClass = isDark
    ? "border-slate-800 bg-slate-950/85"
    : "border-[#ebebeb] bg-white/92 shadow-[0_10px_30px_rgba(0,0,0,0.04)]";
  const circleButtonClass = isDark
    ? "inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-100 transition hover:border-slate-600 hover:bg-slate-800"
    : "inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#ebebeb] bg-white text-[#222222] shadow-[0_4px_14px_rgba(0,0,0,0.04)] transition hover:border-[#d7d7d7] hover:bg-[#f7f7f7] hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)]";
  const rolePillClass = isDark
    ? "hidden shrink-0 items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 sm:inline-flex"
    : "hidden shrink-0 items-center gap-2 rounded-full border border-[#ebebeb] bg-white px-3 py-1.5 text-xs text-[#6a6a6a] shadow-[0_4px_14px_rgba(0,0,0,0.04)] sm:inline-flex";
  const drawerPanelClass = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-[#ebebeb] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.12)]";
  const profileCardClass = isDark
    ? "border-slate-700 bg-slate-900"
    : "border-[#ebebeb] bg-white shadow-[0_10px_28px_rgba(0,0,0,0.06)]";
  const subtleLabelClass = isDark ? "text-slate-500" : "text-[#8a8a8a]";
  const profileMetaClass = isDark ? "text-slate-400" : "text-[#6a6a6a]";
  const editButtonClass = (active: boolean) =>
    active
      ? isDark
        ? "border-cyan-300/60 bg-cyan-400/20 text-cyan-100"
        : "border-[#222222] bg-[#222222] text-white shadow-[0_8px_20px_rgba(0,0,0,0.16)]"
      : isDark
        ? "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:bg-slate-800"
        : "border-[#ebebeb] bg-white text-[#484848] hover:border-[#d7d7d7] hover:bg-[#f7f7f7]";
  const themeButtonClass = isDark
    ? "border-cyan-400/45 bg-cyan-400/15 text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-400/25"
    : "border-[#ebebeb] bg-white text-[#484848] hover:border-[#d7d7d7] hover:bg-[#f7f7f7]";
  const accessCardClass = isDark
    ? "border-slate-700 bg-slate-950/60 text-slate-300"
    : "border-[#ebebeb] bg-white text-[#6a6a6a]";
  const editRowClass = isDark
    ? "border-slate-700 bg-slate-900"
    : "border-[#ebebeb] bg-white";
  const editChipClass = isDark
    ? "border-slate-700 text-slate-300 hover:bg-slate-800"
    : "border-[#ebebeb] text-[#6a6a6a] hover:bg-[#f7f7f7]";
  const editLabelClass = isDark
    ? "border-slate-700 bg-slate-800 text-slate-200"
    : "border-[#ebebeb] bg-white text-[#222222]";
  const navActiveClass = isDark
    ? "border-cyan-300/55 bg-cyan-400/18 text-cyan-100 shadow"
    : "border-[#222222] bg-[#222222] text-white shadow-[0_10px_24px_rgba(0,0,0,0.12)]";
  const navInactiveClass = isDark
    ? "border-transparent text-slate-200 hover:border-slate-700 hover:bg-slate-800/70"
    : "border-transparent text-[#484848] hover:border-[#ebebeb] hover:bg-[#f7f7f7]";
  const shellClass = isDark
    ? "admin-page-shell relative min-h-screen bg-slate-950 p-4 text-slate-100 transition-colors sm:p-6 lg:p-8"
    : "admin-page-shell airbnb-admin-shell relative min-h-screen bg-transparent p-4 text-[#222222] transition-colors sm:p-6 lg:p-8";
  const logoutButtonClass = isDark
    ? "border-rose-500/45 bg-rose-500/15 text-rose-200 hover:border-rose-400/60 hover:bg-rose-500/25"
    : "border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50";

  return (
    <div className={`min-h-screen transition-colors ${rootClass}`}>
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
        <div className="relative z-10 mx-auto flex max-w-[1760px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
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
              <span className={`h-2 w-2 rounded-full ${isDark ? "bg-emerald-400" : "bg-[#ff385c]"}`} />
              {session?.isOwner ? "Owner" : "Live"}
            </div>
          </div>

          <div className="ml-auto flex min-w-0 items-center justify-end gap-3">
            <div className="min-w-0 text-right">
              <div className={`text-[11px] font-semibold uppercase tracking-[0.28em] ${subtleLabelClass}`}>
                MO Admin
              </div>
              <div className={`truncate text-sm font-semibold ${isDark ? "text-slate-100" : "text-[#222222]"}`}>
                {currentLabel}
              </div>
              <div className={`hidden truncate text-xs sm:block ${profileMetaClass}`}>
                Clean internal workspace
              </div>
            </div>
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                isDark
                  ? "border border-slate-700 bg-slate-900 text-slate-100"
                  : "bg-[#222222] text-white shadow-[0_12px_28px_rgba(0,0,0,0.14)]"
              }`}
            >
              MO
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
            className={`absolute inset-y-0 left-0 flex w-[24rem] flex-col rounded-r-[32px] border-r p-5 transition-colors ${drawerPanelClass}`}
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
                  <div className={`mt-2 truncate text-lg font-semibold ${isDark ? "text-white" : "text-[#222222]"}`}>
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
                                ? "bg-emerald-400"
                                : "bg-[#ff385c]"
                              : isDark
                                ? "bg-slate-300 group-hover:bg-slate-400"
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
                                ? "bg-emerald-400"
                                : "bg-[#ff385c]"
                              : isDark
                                ? "bg-slate-300 group-hover:bg-slate-400"
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
              className={`mt-4 border-t pt-4 ${isDark ? "border-slate-700" : "border-[#ebebeb]"}`}
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
          ) : null}
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
