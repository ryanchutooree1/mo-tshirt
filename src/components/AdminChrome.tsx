"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = { href: string; label: string };

// Default nav groupings
const DEFAULT_TOP: NavItem[] = [
  { href: "/admin/pos", label: "POS" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/contracts", label: "Contracts" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/accounting", label: "Accounting" },
  { href: "/admin/dms", label: "DMS" },
  { href: "/admin/his-dream-life", label: "His Dream Life" },
  { href: "/admin/her-dream-life", label: "Her Dream Life" },
  { href: "/admin/our-dream", label: "Our Dream Life" },
];

const DEFAULT_MORE: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/shops", label: "Shops" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/inventory", label: "Inventory" },
];

const NAV_STORAGE = "admin-nav-v1";

export default function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
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
        if (Array.isArray(parsed?.top)) setTopNav(parsed.top);
        if (Array.isArray(parsed?.more)) setMoreNav(parsed.more);
      }
    } catch {}
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
    list === "top" ? setTopNav(next) : setMoreNav(next);
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
    <div className="min-h-screen bg-[#F5F5F7] text-[#1a1a1a]">
      {/* Top bar (always visible) */}
      <div className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="px-4 py-3 grid grid-cols-3 items-center">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen((s) => !s)}
            className="inline-flex items-center justify-center rounded-md p-2 text-[#1a1a1a] hover:bg-[#f5f5f5] justify-self-start"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
              {open ? (
                <path fillRule="evenodd" d="M6.225 4.811a1 1 0 0 1 1.414 0L12 9.172l4.361-4.36a1 1 0 1 1 1.414 1.414L13.414 10.586l4.36 4.361a1 1 0 0 1-1.414 1.414L12 12l-4.361 4.361a1 1 0 1 1-1.414-1.414l4.36-4.361-4.36-4.361a1 1 0 0 1 0-1.414Z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M4.5 6.75A.75.75 0 0 1 5.25 6h13.5a.75.75 0 0 1 0 1.5H5.25A.75.75 0 0 1 4.5 6.75Zm0 5.25a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H5.25a.75.75 0 0 1-.75-.75Zm.75 4.5a.75.75 0 0 0 0 1.5h13.5a.75.75 0 0 0 0-1.5H5.25Z" clipRule="evenodd" />
              )}
            </svg>
          </button>
          <div className="text-lg font-semibold justify-self-center" style={{ fontFamily: "var(--font-admin-serif)" }}>MO Admin</div>
          <Link
            href="/admin/shops"
            className="justify-self-end inline-flex items-center rounded-full bg-[#FF6600] px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-orange-600"
          >
            Shops
          </Link>
        </div>
      </div>

      {/* Sidebar removed for full-width pages; use drawer menu instead */}
      <aside className="hidden fixed inset-y-0 left-0 w-64 border-r border-gray-200 bg-white px-4 py-6 flex-col">
        <div className="px-1">
          <div className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-admin-serif)" }}>MO Admin</div>
          <div className="mt-1 text-sm text-gray-500">Operations</div>
        </div>
        <nav className="mt-6 space-y-1 flex-1">
          {topNav.map((n) => {
            const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`block px-3 py-2 rounded-lg transition-colors border ${active ? "border-[#bfa37a] bg-[#f5f5f5]" : "border-transparent hover:border-[#e5e5e5] hover:bg-[#f5f5f5]"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={logout}
            className="w-full px-3 py-2 rounded-lg text-sm border border-[#bfa37a] text-[#1a1a1a] hover:bg-[#bfa37a] hover:text-white transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Drawer menu (works on all sizes) */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-80 bg-white border-r border-gray-200 p-5 flex flex-col">
            <div className="flex items-center justify-between">
              <div className="text-xl font-semibold" style={{ fontFamily: "var(--font-admin-serif)" }}>MO Admin</div>
              <button
                onClick={() => setEditing((e) => !e)}
                className="text-xs rounded border px-2 py-1 hover:bg-gray-50"
              >
                {editing ? "Done" : "Edit"}
              </button>
            </div>
            <nav className="mt-5 space-y-1 flex-1">
              {topNav.map((n, i) => {
                const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
                return editing ? (
                  <div key={n.href} className="flex items-center gap-2 px-1 py-1">
                    <button aria-label="Up" onClick={() => moveWithin("top", i, -1)} className="h-6 w-6 rounded border">▲</button>
                    <button aria-label="Down" onClick={() => moveWithin("top", i, +1)} className="h-6 w-6 rounded border">▼</button>
                    <button aria-label="Move to More" onClick={() => moveBetween("top", i)} className="h-6 w-6 rounded border">→</button>
                    <span className="flex-1 px-2 py-2 rounded border bg-gray-50">{n.label}</span>
                  </div>
                ) : (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={`block px-3 py-2 rounded-lg transition-colors border ${active ? "border-[#bfa37a] bg-[#f5f5f5]" : "border-transparent hover:border-[#e5e5e5] hover:bg-[#f5f5f5]"}`}
                  >
                    {n.label}
                  </Link>
                );
              })}
              <div className="mt-6 pt-4 border-t text-xs uppercase tracking-wide text-gray-500">More</div>
              {moreNav.map((n, i) => {
                const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
                return editing ? (
                  <div key={n.href} className="flex items-center gap-2 px-1 py-1">
                    <button aria-label="Up" onClick={() => moveWithin("more", i, -1)} className="h-6 w-6 rounded border">▲</button>
                    <button aria-label="Down" onClick={() => moveWithin("more", i, +1)} className="h-6 w-6 rounded border">▼</button>
                    <button aria-label="Move to Top" onClick={() => moveBetween("more", i)} className="h-6 w-6 rounded border">←</button>
                    <span className="flex-1 px-2 py-2 rounded border bg-gray-50">{n.label}</span>
                  </div>
                ) : (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={`block px-3 py-2 rounded-lg transition-colors border ${active ? "border-[#bfa37a] bg-[#f5f5f5]" : "border-transparent hover:border-[#e5e5e5] hover:bg-[#f5f5f5]"}`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <button
              onClick={() => { setOpen(false); logout(); }}
              className="w-full px-3 py-2 rounded-lg text-sm border border-[#bfa37a] text-[#1a1a1a] hover:bg-[#bfa37a] hover:text-white transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="ml-0">
        <div className="p-4 sm:p-6 lg:p-8 bg-[#ffffff] min-h-screen">{children}</div>
      </main>
    </div>
  );
}
