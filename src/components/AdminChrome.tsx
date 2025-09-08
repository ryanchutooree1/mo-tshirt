"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = { href: string; label: string };

const nav: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/pos", label: "POS" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/contracts", label: "Contracts" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/accounting", label: "Accounting" },
  { href: "/admin/dms", label: "DMS" },
];

export default function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

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
    <div className="min-h-screen bg-white text-[#1a1a1a]">
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen((s) => !s)}
            className="inline-flex items-center justify-center rounded-md p-2 text-[#1a1a1a] hover:bg-[#f5f5f5]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
              {open ? (
                <path fillRule="evenodd" d="M6.225 4.811a1 1 0 0 1 1.414 0L12 9.172l4.361-4.36a1 1 0 1 1 1.414 1.414L13.414 10.586l4.36 4.361a1 1 0 0 1-1.414 1.414L12 12l-4.361 4.361a1 1 0 1 1-1.414-1.414l4.36-4.361-4.36-4.361a1 1 0 0 1 0-1.414Z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M4.5 6.75A.75.75 0 0 1 5.25 6h13.5a.75.75 0 0 1 0 1.5H5.25A.75.75 0 0 1 4.5 6.75Zm0 5.25a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H5.25a.75.75 0 0 1-.75-.75Zm.75 4.5a.75.75 0 0 0 0 1.5h13.5a.75.75 0 0 0 0-1.5H5.25Z" clipRule="evenodd" />
              )}
            </svg>
          </button>
          <div className="text-lg font-semibold" style={{ fontFamily: "var(--font-admin-serif)" }}>MO Admin</div>
          <div />
        </div>
      </div>

      {/* Sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 border-r border-gray-200 bg-white px-4 py-6 flex-col">
        <div className="px-1">
          <div className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-admin-serif)" }}>MO Admin</div>
          <div className="mt-1 text-sm text-gray-500">Operations</div>
        </div>
        <nav className="mt-6 space-y-1 flex-1">
          {nav.map((n) => {
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

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-white border-r border-gray-200 p-5 flex flex-col">
            <div className="text-xl font-semibold" style={{ fontFamily: "var(--font-admin-serif)" }}>MO Admin</div>
            <nav className="mt-5 space-y-1 flex-1">
              {nav.map((n) => {
                const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
                return (
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
      <main className="md:ml-64">
        <div className="p-4 sm:p-6 lg:p-8 bg-[#ffffff] min-h-screen">{children}</div>
      </main>
    </div>
  );
}
