"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Camera,
  Home,
  LogOut,
  Moon,
  PackageSearch,
  Settings,
  Sun,
} from "lucide-react";
import { createContext, useContext } from "react";
import { useAdminTheme } from "@/admin/AdminThemeContext";

type MobShellProps = {
  children: React.ReactNode;
  session: {
    displayName: string;
    isOwner: boolean;
  } | null;
  externalBasePath: string;
};

type NavigationItem = {
  key: string;
  label: string;
  path: string;
  icon: typeof Home;
  ownerOnly?: boolean;
};

const NAVIGATION: NavigationItem[] = [
  { key: "home", label: "Home", path: "", icon: Home, ownerOnly: true },
  { key: "photo-log", label: "Photo Log", path: "/photo-log", icon: Camera },
  {
    key: "inventory",
    label: "Inventory",
    path: "/inventory",
    icon: PackageSearch,
    ownerOnly: true,
  },
  {
    key: "settings",
    label: "Settings",
    path: "/settings",
    icon: Settings,
    ownerOnly: true,
  },
];

const MobBasePathContext = createContext("/mob");

export function useMobHref(path: string) {
  return hrefFor(useContext(MobBasePathContext), path);
}

function hrefFor(basePath: string, path: string) {
  if (!basePath) return path || "/";
  return `${basePath}${path}`;
}

export default function MobShell({
  children,
  session,
  externalBasePath,
}: MobShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useAdminTheme();
  const isDark = theme === "dark";
  const visibleNavigation = NAVIGATION.filter(
    (item) => !item.ownerOnly || session?.isOwner
  );

  function isActive(item: NavigationItem) {
    const internalPath = item.path ? `/mob${item.path}` : "/mob";
    if (item.key === "home") {
      return pathname === internalPath || pathname === "/";
    }
    return (
      pathname === internalPath ||
      pathname.endsWith(item.path) ||
      pathname.startsWith(`${internalPath}/`)
    );
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
  }

  return (
    <MobBasePathContext.Provider value={externalBasePath}>
    <div
      className={`min-h-dvh pb-[calc(5.25rem+env(safe-area-inset-bottom))] ${
        isDark ? "bg-[#070b08] text-white" : "bg-[#f5f6f7] text-slate-950"
      }`}
    >
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-xl ${
          isDark
            ? "border-white/10 bg-[#07100a]/90"
            : "border-slate-200/80 bg-white/92"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3 px-3 sm:px-5">
          <Link
            href={hrefFor(externalBasePath, "")}
            className="flex min-w-0 items-center gap-2.5"
            aria-label="MO Mobile Shop home"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-white shadow-sm ring-1 ring-slate-200/80">
              <Image
                src="/icon.png"
                alt=""
                width={512}
                height={512}
                className="h-8 w-8 object-contain"
                priority
              />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-black tracking-[-0.03em]">
                MO Mobile Shop
              </span>
              <span
                className={`block truncate text-[9px] font-bold uppercase tracking-[0.14em] ${
                  isDark ? "text-white/35" : "text-slate-400"
                }`}
              >
                {session?.isOwner ? "Owner workspace" : "Worker capture"}
              </span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <span
              className={`hidden max-w-36 truncate text-[11px] font-bold sm:block ${
                isDark ? "text-white/45" : "text-slate-500"
              }`}
            >
              {session?.displayName || "MO Team"}
            </span>
            <button
              type="button"
              onClick={toggleTheme}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full border ${
                isDark
                  ? "border-white/10 bg-white/5 hover:bg-white/10"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full border ${
                isDark
                  ? "border-white/10 bg-white/5 hover:bg-white/10"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto min-w-0 max-w-[1500px] p-3 sm:p-5 lg:p-6">
        {children}
      </div>

      <nav
        className={`fixed inset-x-0 bottom-0 z-50 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl ${
          isDark
            ? "border-white/10 bg-[#07100a]/94"
            : "border-slate-200 bg-white/94"
        }`}
        aria-label="Mobile shop navigation"
      >
        <div
          className="mx-auto grid h-[72px] max-w-xl"
          style={{
            gridTemplateColumns: `repeat(${visibleNavigation.length}, minmax(0, 1fr))`,
          }}
        >
          {visibleNavigation.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={hrefFor(externalBasePath, item.path)}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-extrabold transition ${
                  active
                    ? "text-orange-500"
                    : isDark
                      ? "text-white/45 hover:text-white"
                      : "text-slate-400 hover:text-slate-700"
                }`}
              >
                {active ? (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-orange-500" />
                ) : null}
                <Icon className="h-5 w-5" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
    </MobBasePathContext.Provider>
  );
}
