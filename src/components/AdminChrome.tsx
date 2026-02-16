"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAdminTheme } from "@/admin/AdminThemeContext";

type NavItem = { href: string; label: string };

const SHOP_ITEM: NavItem = { href: "/admin/shops", label: "Shops" };
const NOTES_ITEM: NavItem = { href: "/admin/business-notes", label: "Business Notes" };
const DETAILS_ITEM: NavItem = { href: "/admin/business-details", label: "Business Details" };
const QUOTE_ITEM: NavItem = { href: "/admin/quotation-approval", label: "Quotation / Invoice" };
const DESIGN_STUDIO_ITEM: NavItem = { href: "/admin/design-studio", label: "Design Studio" };
const FINANCE_ITEM: NavItem = { href: "/admin/finance-freedom", label: "Finance Freedom" };
const BUSINESS_VALUE_ITEM: NavItem = { href: "/admin/business-value", label: "Business Value" };
const IOT_ITEM: NavItem = { href: "/admin/iot", label: "IoT Control Center" };

// Default nav groupings
const DEFAULT_TOP: NavItem[] = [
  { href: "/admin/pos", label: "POS" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/contracts", label: "Contracts" },
  SHOP_ITEM,
  QUOTE_ITEM,
  DESIGN_STUDIO_ITEM,
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/accounting", label: "Accounting" },
  FINANCE_ITEM,
  BUSINESS_VALUE_ITEM,
  { href: "/admin/dms", label: "DMS" },
  IOT_ITEM,
  NOTES_ITEM,
  DETAILS_ITEM,
  { href: "/admin/his-dream-life", label: "His Dream Life" },
  { href: "/admin/her-dream-life", label: "Her Dream Life" },
  { href: "/admin/our-dream", label: "Our Dream Life" },
];

const DEFAULT_MORE: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/inventory", label: "Inventory" },
];

const NAV_STORAGE = "admin-nav-v1";

function normalizeNav(top: NavItem[], more: NavItem[]) {
  const topHasNotes = top.some((item) => item.href === NOTES_ITEM.href);
  const moreHasNotes = more.some((item) => item.href === NOTES_ITEM.href);
  const topHasDetails = top.some((item) => item.href === DETAILS_ITEM.href);
  const moreHasDetails = more.some((item) => item.href === DETAILS_ITEM.href);
  const topHasQuote = top.some((item) => item.href === QUOTE_ITEM.href);
  const moreHasQuote = more.some((item) => item.href === QUOTE_ITEM.href);
  const topHasDesignStudio = top.some((item) => item.href === DESIGN_STUDIO_ITEM.href);
  const moreHasDesignStudio = more.some((item) => item.href === DESIGN_STUDIO_ITEM.href);
  const topHasFinance = top.some((item) => item.href === FINANCE_ITEM.href);
  const moreHasFinance = more.some((item) => item.href === FINANCE_ITEM.href);
  const topHasBusinessValue = top.some((item) => item.href === BUSINESS_VALUE_ITEM.href);
  const moreHasBusinessValue = more.some((item) => item.href === BUSINESS_VALUE_ITEM.href);
  const topHasIot = top.some((item) => item.href === IOT_ITEM.href);
  const moreHasIot = more.some((item) => item.href === IOT_ITEM.href);
  const cleanedTop = top.filter(
    (item) =>
      item.href !== SHOP_ITEM.href &&
      item.href !== QUOTE_ITEM.href &&
      item.href !== DESIGN_STUDIO_ITEM.href &&
      item.href !== FINANCE_ITEM.href &&
      item.href !== IOT_ITEM.href &&
      item.href !== BUSINESS_VALUE_ITEM.href &&
      (item.href !== NOTES_ITEM.href || topHasNotes) &&
      (item.href !== DETAILS_ITEM.href || topHasDetails)
  );
  const cleanedMore = more.filter(
    (item) =>
      item.href !== SHOP_ITEM.href &&
      item.href !== QUOTE_ITEM.href &&
      item.href !== DESIGN_STUDIO_ITEM.href &&
      item.href !== FINANCE_ITEM.href &&
      item.href !== IOT_ITEM.href &&
      item.href !== BUSINESS_VALUE_ITEM.href &&
      (item.href !== NOTES_ITEM.href || !topHasNotes) &&
      (item.href !== DETAILS_ITEM.href || !topHasDetails)
  );
  const nextTop = cleanedTop.slice();
  const contractsIndex = nextTop.findIndex((item) => item.href === "/admin/contracts");
  if (contractsIndex >= 0) {
    nextTop.splice(contractsIndex + 1, 0, SHOP_ITEM);
  } else {
    nextTop.push(SHOP_ITEM);
  }
  if (topHasQuote || (!topHasQuote && !moreHasQuote)) {
    const shopIndex = nextTop.findIndex((item) => item.href === SHOP_ITEM.href);
    if (shopIndex >= 0) {
      nextTop.splice(shopIndex + 1, 0, QUOTE_ITEM);
    } else {
      nextTop.push(QUOTE_ITEM);
    }
  }
  if (topHasDesignStudio || (!topHasDesignStudio && !moreHasDesignStudio)) {
    const quoteIndex = nextTop.findIndex((item) => item.href === QUOTE_ITEM.href);
    if (quoteIndex >= 0) {
      nextTop.splice(quoteIndex + 1, 0, DESIGN_STUDIO_ITEM);
    } else {
      nextTop.push(DESIGN_STUDIO_ITEM);
    }
  }
  if (topHasFinance || (!topHasFinance && !moreHasFinance)) {
    const accountingIndex = nextTop.findIndex((item) => item.href === "/admin/accounting");
    if (accountingIndex >= 0) {
      nextTop.splice(accountingIndex + 1, 0, FINANCE_ITEM);
    } else {
      nextTop.push(FINANCE_ITEM);
    }
  }
  if (topHasBusinessValue || (!topHasBusinessValue && !moreHasBusinessValue)) {
    const financeIndex = nextTop.findIndex((item) => item.href === FINANCE_ITEM.href);
    if (financeIndex >= 0) {
      nextTop.splice(financeIndex + 1, 0, BUSINESS_VALUE_ITEM);
    } else {
      nextTop.push(BUSINESS_VALUE_ITEM);
    }
  }
  if (topHasIot || (!topHasIot && !moreHasIot)) {
    const dmsIndex = nextTop.findIndex((item) => item.href === "/admin/dms");
    if (dmsIndex >= 0) {
      nextTop.splice(dmsIndex + 1, 0, IOT_ITEM);
    } else {
      nextTop.push(IOT_ITEM);
    }
  }
  if (!topHasNotes && !moreHasNotes) {
    const iotIndex = nextTop.findIndex((item) => item.href === IOT_ITEM.href);
    if (iotIndex >= 0) {
      nextTop.splice(iotIndex + 1, 0, NOTES_ITEM);
    } else {
      const dmsIndex = nextTop.findIndex((item) => item.href === "/admin/dms");
      if (dmsIndex >= 0) {
        nextTop.splice(dmsIndex + 1, 0, NOTES_ITEM);
      } else {
        nextTop.push(NOTES_ITEM);
      }
    }
  }
  if (!topHasDetails && !moreHasDetails) {
    const notesIndex = nextTop.findIndex((item) => item.href === NOTES_ITEM.href);
    if (notesIndex >= 0) {
      nextTop.splice(notesIndex + 1, 0, DETAILS_ITEM);
    } else {
      const dmsIndex = nextTop.findIndex((item) => item.href === "/admin/dms");
      if (dmsIndex >= 0) {
        nextTop.splice(dmsIndex + 1, 0, DETAILS_ITEM);
      } else {
        nextTop.push(DETAILS_ITEM);
      }
    }
  }
  const nextMore = cleanedMore.slice();
  if (moreHasQuote) {
    nextMore.push(QUOTE_ITEM);
  }
  if (moreHasDesignStudio) {
    nextMore.push(DESIGN_STUDIO_ITEM);
  }
  if (moreHasFinance) {
    nextMore.push(FINANCE_ITEM);
  }
  if (moreHasBusinessValue) {
    nextMore.push(BUSINESS_VALUE_ITEM);
  }
  if (moreHasIot) {
    nextMore.push(IOT_ITEM);
  }
  return { top: nextTop, more: nextMore };
}

export default function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useAdminTheme();
  const isDark = theme === "dark";
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [topNav, setTopNav] = useState<NavItem[]>(DEFAULT_TOP);
  const [moreNav, setMoreNav] = useState<NavItem[]>(DEFAULT_MORE);

  // Load custom order
  useEffect(() => {
    try {
      const raw = localStorage.getItem(NAV_STORAGE);
      if (raw) {
        const parsed = JSON.parse(raw);
        const parsedTop = Array.isArray(parsed?.top) ? parsed.top : DEFAULT_TOP;
        const parsedMore = Array.isArray(parsed?.more) ? parsed.more : DEFAULT_MORE;
        const normalized = normalizeNav(parsedTop, parsedMore);
        setTopNav(normalized.top);
        setMoreNav(normalized.more);
        return;
      }
    } catch {}
    const normalized = normalizeNav(DEFAULT_TOP, DEFAULT_MORE);
    setTopNav(normalized.top);
    setMoreNav(normalized.more);
  }, []);

  // Persist order
  useEffect(() => {
    try {
      localStorage.setItem(NAV_STORAGE, JSON.stringify({ top: topNav, more: moreNav }));
    } catch {}
  }, [topNav, moreNav]);


  // Helpers to reorder
  function moveWithin(list: "top" | "more", index: number, delta: number) {
    const arr = list === "top" ? topNav : moreNav;
    const next = arr.slice();
    const newIndex = (index + delta + next.length) % next.length;
    const [item] = next.splice(index, 1);
    next.splice(newIndex, 0, item);
    if (list === "top") {
      setTopNav(next);
    } else {
      setMoreNav(next);
    }
  }

  function moveBetween(from: "top" | "more", index: number) {
    if (from === "top") {
      const src = topNav.slice();
      const [item] = src.splice(index, 1);
      setTopNav(src);
      setMoreNav((m) => [...m, item]);
    } else {
      const src = moreNav.slice();
      const [item] = src.splice(index, 1);
      setMoreNav(src);
      setTopNav((t) => [...t, item]);
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  }


  // Close menu on escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      className={`min-h-screen transition-colors ${
        isDark
          ? "bg-slate-950 text-slate-100"
          : "bg-[#F5F5F7] text-[#1a1a1a]"
      }`}
    >
      {/* Top bar (always visible) */}
      <div
        className={`sticky top-0 z-40 border-b backdrop-blur transition-colors ${
          isDark
            ? "border-slate-800 bg-slate-950/85"
            : "border-gray-200 bg-white/90"
        }`}
      >
        <div className="px-4 py-3 grid grid-cols-3 items-center">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen((s) => !s)}
            className={`inline-flex items-center justify-center rounded-xl border border-transparent p-2 transition justify-self-start ${
              isDark
                ? "text-slate-100 hover:border-slate-700 hover:bg-slate-800/70"
                : "text-[#1a1a1a] hover:border-slate-200 hover:bg-slate-50"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
              {open ? (
                <path fillRule="evenodd" d="M6.225 4.811a1 1 0 0 1 1.414 0L12 9.172l4.361-4.36a1 1 0 1 1 1.414 1.414L13.414 10.586l4.36 4.361a1 1 0 0 1-1.414 1.414L12 12l-4.361 4.361a1 1 0 1 1-1.414-1.414l4.36-4.361-4.36-4.361a1 1 0 0 1 0-1.414Z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M4.5 6.75A.75.75 0 0 1 5.25 6h13.5a.75.75 0 0 1 0 1.5H5.25A.75.75 0 0 1 4.5 6.75Zm0 5.25a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H5.25a.75.75 0 0 1-.75-.75Zm.75 4.5a.75.75 0 0 0 0 1.5h13.5a.75.75 0 0 0 0-1.5H5.25Z" clipRule="evenodd" />
              )}
            </svg>
          </button>
          <div
            className={`justify-self-center text-xs font-semibold uppercase tracking-[0.32em] ${
              isDark ? "text-slate-300" : "text-slate-600"
            }`}
          >
            MO Admin
          </div>
          <div
            className={`justify-self-end hidden sm:flex items-center gap-2 text-xs ${
              isDark ? "text-slate-400" : "text-slate-500"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Live
          </div>
        </div>
      </div>

      {/* Sidebar removed for full-width pages; use drawer menu instead */}
      <aside
        className={`hidden fixed inset-y-0 left-0 w-64 border-r px-4 py-6 flex-col ${
          isDark ? "border-slate-800 bg-slate-900" : "border-gray-200 bg-white"
        }`}
      >
        <div className="px-1">
          <div className="text-2xl font-semibold tracking-tight">MO Admin</div>
          <div className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>Operations</div>
        </div>
        <nav className="mt-6 space-y-1 flex-1">
          {topNav.map((n) => {
            const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`block px-3 py-2 rounded-lg transition-colors border ${
                  active
                    ? isDark
                      ? "border-cyan-400/60 bg-slate-800"
                      : "border-[#bfa37a] bg-[#f5f5f5]"
                    : isDark
                      ? "border-transparent hover:border-slate-700 hover:bg-slate-800/80"
                      : "border-transparent hover:border-[#e5e5e5] hover:bg-[#f5f5f5]"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className={`pt-4 border-t ${isDark ? "border-slate-800" : "border-gray-200"}`}>
          <button
            onClick={logout}
            className={`w-full px-3 py-2 rounded-lg text-sm border transition-colors ${
              isDark
                ? "border-rose-500/45 text-rose-200 hover:bg-rose-500/20"
                : "border-[#bfa37a] text-[#1a1a1a] hover:bg-[#bfa37a] hover:text-white"
            }`}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Drawer menu (works on all sizes) */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            style={{ animation: "fadeIn 0.2s ease-out both" }}
            onClick={() => setOpen(false)}
          />
          <div
            className={`absolute inset-y-0 left-0 w-[22rem] border-r p-5 flex flex-col shadow-2xl rounded-r-3xl transition-colors ${
              isDark
                ? "bg-slate-950 border-slate-800"
                : "bg-white border-slate-200"
            }`}
            style={{ animation: "drawerIn 0.25s ease-out both" }}
          >
            <div
              className={`relative overflow-hidden rounded-3xl border p-4 shadow-sm transition-colors ${
                isDark
                  ? "border-slate-700 bg-slate-900"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div
                aria-hidden
                className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_60%)]"
              />
              <div className="relative flex items-center justify-between">
                <div>
                  <div
                    className={`text-xs font-semibold uppercase tracking-[0.3em] ${
                      isDark ? "text-slate-400" : "text-slate-500"
                    }`}
                  >
                    MO Admin
                  </div>
                  <div className={`mt-2 text-lg font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>
                    Command Center
                  </div>
                  <div className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Tap to jump between modules.
                  </div>
                </div>
                <button
                  onClick={() => setEditing((e) => !e)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    editing
                      ? isDark
                        ? "border-cyan-300/60 bg-cyan-400/20 text-cyan-100"
                        : "border-slate-900 bg-slate-900 text-white"
                      : isDark
                        ? "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:bg-slate-800"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {editing ? "Done" : "Edit"}
                </button>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className={`relative mt-3 inline-flex w-full items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  isDark
                    ? "border-cyan-400/45 bg-cyan-400/15 text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-400/25"
                    : "border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-400 hover:bg-slate-200"
                }`}
              >
                {isDark ? "Switch To Light Mode" : "Switch To Dark Mode"}
              </button>
            </div>

            <nav className="mt-5 space-y-3 flex-1 min-h-0 overflow-y-auto pr-1">
              <div
                className={`text-[11px] font-semibold uppercase tracking-[0.28em] ${
                  isDark ? "text-slate-500" : "text-slate-400"
                }`}
              >
                Core
              </div>
              {topNav.map((n, i) => {
                const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
                return editing ? (
                  <div
                    key={n.href}
                    className={`flex items-center gap-2 rounded-2xl border px-2 py-2 ${
                      isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
                    }`}
                  >
                    <button
                      aria-label="Up"
                      onClick={() => moveWithin("top", i, -1)}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                        isDark
                          ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Up
                    </button>
                    <button
                      aria-label="Down"
                      onClick={() => moveWithin("top", i, +1)}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                        isDark
                          ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Down
                    </button>
                    <button
                      aria-label="Move"
                      onClick={() => moveBetween("top", i)}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                        isDark
                          ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Move
                    </button>
                    <span
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                        isDark
                          ? "border-slate-700 bg-slate-800 text-slate-200"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {n.label}
                    </span>
                  </div>
                ) : (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={`group flex items-center justify-between rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? isDark
                          ? "border-cyan-300/55 bg-cyan-400/18 text-cyan-100 shadow"
                          : "border-slate-900 bg-slate-900 text-white shadow"
                        : isDark
                          ? "border-transparent text-slate-200 hover:border-slate-700 hover:bg-slate-800/70"
                          : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span>{n.label}</span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        active ? "bg-emerald-400" : "bg-slate-300 group-hover:bg-slate-400"
                      }`}
                    />
                  </Link>
                );
              })}
              {moreNav.map((n, i) => {
                const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
                return editing ? (
                  <div
                    key={n.href}
                    className={`flex items-center gap-2 rounded-2xl border px-2 py-2 ${
                      isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
                    }`}
                  >
                    <button
                      aria-label="Up"
                      onClick={() => moveWithin("more", i, -1)}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                        isDark
                          ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Up
                    </button>
                    <button
                      aria-label="Down"
                      onClick={() => moveWithin("more", i, +1)}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                        isDark
                          ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Down
                    </button>
                    <button
                      aria-label="Move"
                      onClick={() => moveBetween("more", i)}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                        isDark
                          ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Move
                    </button>
                    <span
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                        isDark
                          ? "border-slate-700 bg-slate-800 text-slate-200"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {n.label}
                    </span>
                  </div>
                ) : (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={`group flex items-center justify-between rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? isDark
                          ? "border-cyan-300/55 bg-cyan-400/18 text-cyan-100 shadow"
                          : "border-slate-900 bg-slate-900 text-white shadow"
                        : isDark
                          ? "border-transparent text-slate-200 hover:border-slate-700 hover:bg-slate-800/70"
                          : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span>{n.label}</span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        active ? "bg-emerald-400" : "bg-slate-300 group-hover:bg-slate-400"
                      }`}
                    />
                  </Link>
                );
              })}
            </nav>
            <div className={`mt-4 pt-4 border-t ${isDark ? "border-slate-700" : "border-slate-200"}`}>
              <button
                onClick={() => { setOpen(false); logout(); }}
                className={`w-full rounded-full border px-4 py-2 text-sm font-semibold shadow-sm transition ${
                  isDark
                    ? "border-rose-500/45 bg-rose-500/15 text-rose-200 hover:border-rose-400/60 hover:bg-rose-500/25"
                    : "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100"
                }`}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="ml-0">
        <div
          className={`admin-page-shell min-h-screen p-4 sm:p-6 lg:p-8 transition-colors ${
            isDark ? "bg-slate-950 text-slate-100" : "bg-[#ffffff]"
          }`}
        >
          {children}
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
