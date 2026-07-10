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
const DESKTOP_NAV_PATHS: AdminPagePath[] = [
  "/admin",
  "/admin/orders",
  "/admin/pos",
  "/admin/quotation-approval",
  "/admin/clients",
  "/admin/inventory",
];

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
  const topBarClass = "border-white/10 bg-[#080808]/95 shadow-[0_1px_0_rgba(255,255,255,0.03)]";
  const circleButtonClass =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition hover:border-white/20 hover:bg-white/[0.12]";
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
    ? "admin-page-shell admin-minimal relative min-h-screen max-w-full overflow-x-hidden bg-[#010503] p-3 text-[#f7fff3] transition-colors sm:p-4 lg:p-6"
    : "admin-page-shell admin-minimal airbnb-admin-shell relative min-h-screen max-w-full overflow-x-hidden bg-transparent p-3 text-[#222222] transition-colors sm:p-4 lg:p-6";
  const logoutButtonClass = isDark
    ? "border-rose-500/45 bg-rose-500/15 text-rose-200 hover:border-rose-400/60 hover:bg-rose-500/25"
    : "border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50";

  if (pathname === "/admin") {
    return <div className="min-h-screen bg-[#f7f8fa] text-slate-950">{children}</div>;
  }

  if (isPartnerDesk) {
    return <div className="min-h-screen bg-[#f6f8fb] text-slate-950">{children}</div>;
  }

  return (
    <div className={`min-h-screen w-full max-w-full overflow-x-hidden transition-colors ${rootClass}`}>
      <div
        className={`sticky top-0 z-40 border-b backdrop-blur-xl transition-colors ${topBarClass}`}
      >
        <div className="relative z-10 mx-auto flex h-16 w-full max-w-[1760px] min-w-0 items-center gap-3 px-4 sm:h-[72px] sm:px-6 lg:px-8">
          <Link
            href="/admin"
            className="flex shrink-0 items-center gap-2.5 text-white"
            aria-label="MO Admin dashboard"
          >
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white">
              <Image
                src="/logo_transparent.png"
                alt=""
                width={72}
                height={72}
                className="h-7 w-7 object-contain"
                priority={false}
              />
            </span>
            <span className="hidden text-sm font-semibold tracking-[-0.01em] sm:block">MO Admin</span>
          </Link>

          <nav className="mx-auto hidden min-w-0 items-center justify-center gap-7 xl:flex" aria-label="Primary admin navigation">
            {DESKTOP_NAV_PATHS.filter((path) => visiblePages.has(path)).map((path) => {
              const active = isNavPathActive(path, pathname);
              return (
                <Link
                  key={path}
                  href={path}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap text-sm font-medium tracking-[-0.01em] transition ${
                    active ? "text-white" : "text-white/62 hover:text-white"
                  }`}
                >
                  {getLabel(path)}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0">
            <button
              type="button"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              onClick={toggleTheme}
              className="hidden h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.09] px-5 text-sm font-medium text-white transition hover:bg-white/[0.14] sm:inline-flex"
            >
              {isDark ? "Light" : "Dark"}
            </button>
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className="hidden h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-[#111111] transition hover:bg-[#e9e9e9] sm:inline-flex"
            >
              Menu
              <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-4 w-4">
                <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="max-w-[45vw] truncate text-sm font-medium text-white sm:hidden">{currentLabel}</span>
            <button
              type="button"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              onClick={toggleTheme}
              className={`sm:hidden ${circleButtonClass}`}
            >
              <span aria-hidden>{isDark ? "☀" : "☾"}</span>
            </button>
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className={`sm:hidden ${circleButtonClass}`}
            >
              <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-4 w-4">
                <path d="M3.5 6h13M3.5 10h13M3.5 14h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
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
            className={`absolute inset-y-0 left-0 flex w-[min(20rem,calc(100vw-4rem))] flex-col rounded-r-[22px] border-r p-3 transition-colors sm:w-[22rem] sm:p-4 ${drawerPanelClass}`}
            style={{ animation: "drawerIn 0.25s ease-out both" }}
          >
            <div
              className={`relative overflow-hidden rounded-[20px] border p-3 transition-colors ${profileCardClass}`}
            >
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${profileMetaClass}`}>
                    {session?.isOwner ? "Owner Session" : "Team Session"}
                  </div>
                  <div className={`mt-1.5 truncate text-base font-semibold ${isDark ? "text-[#f7fff3]" : "text-[#222222]"}`}>
                    {session?.displayName || "Admin"}
                  </div>
                  <div className={`mt-1 truncate text-xs ${profileMetaClass}`}>
                    {session?.email || "Loading access profile..."}
                  </div>
                </div>

                {canEditNavigation ? (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${editButtonClass(false)}`}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing((value) => !value)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${editButtonClass(editing)}`}
                    >
                      {editing ? "Done" : "Edit"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${editButtonClass(false)}`}
                  >
                    Close
                  </button>
                )}
              </div>

              <div className="relative mt-3 grid gap-2">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className={`inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${themeButtonClass}`}
                >
                  {isDark ? "Switch To Light Mode" : "Switch To Dark Mode"}
                </button>

                <div
                  className={`rounded-[16px] border px-3 py-2 ${accessCardClass}`}
                >
                  <div className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${subtleLabelClass}`}>
                    Access
                  </div>
                  <div className="mt-0.5 text-xs font-semibold text-inherit">
                    {session?.isOwner
                      ? "Full admin access"
                      : `${session?.allowedPages.length || 0} page permissions assigned`}
                  </div>
                </div>
              </div>
            </div>

            <nav className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
              <div>
                <div className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${subtleLabelClass}`}>
                  Core
                </div>
                <div className="mt-2 space-y-1.5">
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
                        className={`group flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold transition ${
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
                <div className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${subtleLabelClass}`}>
                  More
                </div>
                <div className="mt-2 space-y-1.5">
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
                        className={`group flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold transition ${
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
              className={`mt-3 border-t pt-3 ${isDark ? "border-[#21491f]" : "border-[#ebebeb]"}`}
            >
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className={`w-full rounded-full border px-4 py-1.5 text-xs font-semibold shadow-sm transition ${logoutButtonClass}`}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main className="ml-0">
        <div className={shellClass}>
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
