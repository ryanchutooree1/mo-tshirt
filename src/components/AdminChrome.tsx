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
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b shadow-sm bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          {/* Mobile toggle */}
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen((s) => !s)}
            className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
              {open ? (
                <path fillRule="evenodd" d="M6.225 4.811a1 1 0 0 1 1.414 0L12 9.172l4.361-4.36a1 1 0 1 1 1.414 1.414L13.414 10.586l4.36 4.361a1 1 0 0 1-1.414 1.414L12 12l-4.361 4.361a1 1 0 1 1-1.414-1.414l4.36-4.361-4.36-4.361a1 1 0 0 1 0-1.414Z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M4.5 6.75A.75.75 0 0 1 5.25 6h13.5a.75.75 0 0 1 0 1.5H5.25A.75.75 0 0 1 4.5 6.75Zm0 5.25a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H5.25a.75.75 0 0 1-.75-.75Zm.75 4.5a.75.75 0 0 0 0 1.5h13.5a.75.75 0 0 0 0-1.5H5.25Z" clipRule="evenodd" />
              )}
            </svg>
          </button>

          <div className="font-extrabold tracking-tight">MO Admin</div>
          <nav className="hidden md:flex items-center gap-2 ml-4">
            {nav.map((n) => {
              const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                    active
                      ? "bg-white text-slate-900 border-white"
                      : "border-white/30 text-white/90 hover:bg-white/10"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={logout} className="px-3 py-1.5 rounded-lg text-sm border border-white/40 hover:bg-white/10">
              Logout
            </button>
          </div>
        </div>
        {/* Mobile menu panel */}
        {open && (
          <div className="md:hidden border-t border-white/10 bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-slate-900/80">
            <nav className="max-w-7xl mx-auto px-4 py-3 grid grid-cols-1 gap-2" aria-label="Mobile Admin">
              {nav.map((n) => {
                const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={`px-3 py-2 rounded-lg text-sm border transition ${
                      active
                        ? "bg-white text-slate-900 border-white"
                        : "border-white/30 text-white/90 hover:bg-white/10"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
              <button
                onClick={() => { setOpen(false); logout(); }}
                className="px-3 py-2 rounded-lg text-sm border border-white/40 text-white/90 hover:bg-white/10 text-left"
              >
                Logout
              </button>
            </nav>
          </div>
        )}
      </header>
      <div className="pt-2">{children}</div>
    </div>
  );
}
