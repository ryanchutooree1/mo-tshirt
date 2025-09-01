"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

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

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b shadow-sm bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
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
      </header>
      <div className="pt-2">{children}</div>
    </div>
  );
}
