"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BadgeCheck,
  BadgeDollarSign,
  Bot,
  BriefcaseBusiness,
  Building2,
  Calculator,
  Camera,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  Database,
  Eraser,
  ExternalLink,
  FileSignature,
  FolderArchive,
  Gem,
  Handshake,
  Headphones,
  Heart,
  HeartHandshake,
  House,
  Landmark,
  LayoutDashboard,
  Layers3,
  LogOut,
  Mail,
  Menu,
  MonitorCog,
  Moon,
  Network,
  NotebookPen,
  PackageSearch,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  PenTool,
  PiggyBank,
  Printer,
  RadioTower,
  ReceiptText,
  Scale,
  ScanText,
  Search,
  Settings,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Store,
  Sun,
  Truck,
  UserRoundCog,
  Users,
  UsersRound,
  Warehouse,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import {
  ADMIN_PAGE_OPTIONS,
  ALL_ADMIN_PAGE_PATHS,
  type AdminPagePath,
} from "@/lib/admin-access";
import { signOutAdminFromFirebase } from "@/lib/firebase-admin-client-auth";
import AdminProfileEditor from "@/components/admin/AdminProfileEditor";
import {
  defaultAdminProfile,
  type AdminProfile,
} from "@/lib/admin-profile";

type AdminSessionSummary = {
  displayName: string;
  email: string;
  allowedPages: AdminPagePath[];
  isOwner: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  paths: AdminPagePath[];
};

const SIDEBAR_COLLAPSED_KEY = "admin-sidebar-collapsed-v1";
const SIDEBAR_GROUPS_KEY = "admin-sidebar-groups-v2";

const DAILY_PATHS: AdminPagePath[] = ["/admin", "/admin/inbox", "/admin/quotation-approval", "/admin/orders", "/admin/inventory", "/admin/clients"];
const NAV_GROUPS: NavGroup[] = [
  { id: "daily", label: "Your work", paths: DAILY_PATHS },
  {
    id: "core",
    label: "Core",
    paths: ["/admin", "/admin/orders", "/admin/pos", "/admin/clients"],
  },
  {
    id: "commerce",
    label: "Commerce",
    paths: [
      "/admin/quotation-approval",
      "/admin/shops",
      "/admin/ready-made-uniforms",
      "/admin/design-studio",
      "/admin/background-remover",
      "/admin/ai-assistant",
    ],
  },
  {
    id: "operations",
    label: "Operations",
    paths: [
      "/admin/inventory",
      "/admin/tanvi",
      "/admin/partners",
      "/admin/prescription-ocr",
      "/admin/dms",
      "/admin/iot",
    ],
  },
  {
    id: "insights",
    label: "Insights",
    paths: [
      "/admin/analytics",
      "/admin/tracking",
      "/admin/accounting",
      "/admin/finance-freedom",
      "/admin/business-value",
      "/admin/automation",
    ],
  },
  {
    id: "planning",
    label: "Planning",
    paths: [
      "/admin/business-os",
      "/admin/business-notes",
      "/admin/business-details",
      "/admin/his-dream-life",
      "/admin/her-dream-life",
      "/admin/our-dream",
      "/admin/couple-goals",
      "/admin/house-inventory",
    ],
  },
  {
    id: "system",
    label: "System",
    paths: ["/admin/docker-postgres", "/admin/settings"],
  },
];

const LABEL_OVERRIDES: Partial<Record<AdminPagePath, string>> = {
  "/admin/quotation-approval": "Quotes & Invoices",
  "/admin/shops": "Products",
  "/admin/ready-made-uniforms": "Uniforms",
  "/admin/inventory": "Stock & Products",
  "/admin/inventory-photo-log": "Inventory Photo Log",
  "/admin/inventory-department": "Inventory Department",
  "/admin/dms": "Documents",
  "/admin/iot": "IoT Control",
  "/admin/docker-postgres": "Database",
};

const PAGE_ICONS: Partial<Record<AdminPagePath, LucideIcon>> = {
  "/admin/inbox": Mail,
  "/admin": LayoutDashboard,
  "/admin/orders": ShoppingBag,
  "/admin/pos": CreditCard,
  "/admin/clients": Users,
  "/admin/quotation-approval": ReceiptText,
  "/admin/contracts": FileSignature,
  "/admin/shops": Store,
  "/admin/ready-made-uniforms": Shirt,
  "/admin/design-studio": Palette,
  "/admin/background-remover": Eraser,
  "/admin/ai-assistant": Bot,
  "/admin/inventory": PackageSearch,
  "/admin/inventory-photo-log": Camera,
  "/admin/tanvi": Workflow,
  "/admin/partners": Handshake,
  "/admin/prescription-ocr": ScanText,
  "/admin/dms": FolderArchive,
  "/admin/iot": RadioTower,
  "/admin/management": BriefcaseBusiness,
  "/admin/sales": BadgeDollarSign,
  "/admin/marketing": Zap,
  "/admin/customer-service": Headphones,
  "/admin/design": PenTool,
  "/admin/production": Printer,
  "/admin/purchasing": ShoppingCart,
  "/admin/inventory-department": Warehouse,
  "/admin/logistics": Truck,
  "/admin/quality": BadgeCheck,
  "/admin/finance": Landmark,
  "/admin/hr": UserRoundCog,
  "/admin/technology": MonitorCog,
  "/admin/legal-compliance": Scale,
  "/admin/analytics": Activity,
  "/admin/tracking": Search,
  "/admin/accounting": Calculator,
  "/admin/finance-freedom": PiggyBank,
  "/admin/business-value": Gem,
  "/admin/automation": Zap,
  "/admin/business-os": Network,
  "/admin/business-notes": NotebookPen,
  "/admin/business-details": Building2,
  "/admin/his-dream-life": CircleUserRound,
  "/admin/her-dream-life": Heart,
  "/admin/our-dream": UsersRound,
  "/admin/couple-goals": HeartHandshake,
  "/admin/house-inventory": House,
  "/admin/docker-postgres": Database,
  "/admin/settings": Settings,
};

const OPTION_BY_PATH = new Map(ADMIN_PAGE_OPTIONS.map((option) => [option.path, option]));

function isNavPathActive(path: AdminPagePath, pathname: string) {
  if (path === "/admin/iot" && pathname === "/iot") return true;
  if (path === "/admin") return pathname === "/admin";
  return pathname === path || pathname.startsWith(`${path}/`);
}

function pageLabel(path: AdminPagePath) {
  return LABEL_OVERRIDES[path] || OPTION_BY_PATH.get(path)?.label || path;
}

function pageHref(path: AdminPagePath) {
  return path === "/admin/tanvi" ? "/admin/workspace" : path;
}

function activePagePath(pathname: string) {
  if (pathname === "/admin/workspace") return "/admin/tanvi" as AdminPagePath;
  return [...ALL_ADMIN_PAGE_PATHS]
    .sort((left, right) => right.length - left.length)
    .find((path) => isNavPathActive(path, pathname));
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "RC";
}

function AdminAvatar({
  name,
  src,
  zoom,
  offsetX,
  offsetY,
  className,
  sizes,
}: {
  name: string;
  src: string | null;
  zoom: number;
  offsetX: number;
  offsetY: number;
  className: string;
  sizes: string;
}) {
  const positionX = Math.min(100, Math.max(0, 50 - offsetX));
  const positionY = Math.min(100, Math.max(0, 50 - offsetY));

  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}>
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes={sizes}
          className="object-cover object-center"
          unoptimized={src.startsWith("data:")}
          style={{
            objectPosition: `${positionX}% ${positionY}%`,
            transform: `scale(${zoom})`,
            transformOrigin: `${positionX}% ${positionY}%`,
          }}
        />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}

export default function AdminChrome({
  children,
  initialSession,
}: {
  children: React.ReactNode;
  initialSession: AdminSessionSummary | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useAdminTheme();
  const isDark = theme === "dark";
  const isPartnerDesk =
    (pathname === "/admin/workspace" && !initialSession) ||
    pathname === "/admin/yan_list" ||
    pathname === "/admin/shab_list" ||
    (pathname.startsWith("/admin/partners/") && pathname !== "/admin/partners");

  const session = initialSession;
  const initialProfile = useMemo(
    () => defaultAdminProfile({
      displayName: session?.displayName || "Administrator",
      isOwner: session?.isOwner === true,
    }),
    [session]
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [focusedQuoteReview, setFocusedQuoteReview] = useState(false);
  const [navQuery, setNavQuery] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profile, setProfile] = useState<AdminProfile>(initialProfile);
  const [profileLoadState, setProfileLoadState] = useState<"loading" | "ready" | "error">(
    session ? "loading" : "ready"
  );
  const [profileReloadKey, setProfileReloadKey] = useState(0);
  const [profileNotice, setProfileNotice] = useState("");
  const [isDesktop, setIsDesktop] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV_GROUPS.map((group) => [group.id, group.id === "daily"]))
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const profileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const editProfileActionRef = useRef<HTMLButtonElement>(null);
  const profileEditorOpenerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setProfile(initialProfile);
    if (!session) {
      setProfileLoadState("ready");
      return;
    }
    setProfileLoadState("loading");
    let ignore = false;
    const controller = new AbortController();
    void fetch("/api/admin/profile", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.profile) throw new Error(body?.error || "Could not load profile.");
        if (ignore) return;
        setProfile(body.profile as AdminProfile);
        setProfileLoadState("ready");
      })
      .catch((error) => {
        if (ignore || (error instanceof DOMException && error.name === "AbortError")) return;
        setProfileLoadState("error");
      });
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [initialProfile, profileReloadKey, session]);

  useEffect(() => {
    if (!profileNotice) return;
    const timeout = window.setTimeout(() => setProfileNotice(""), 4_000);
    return () => window.clearTimeout(timeout);
  }, [profileNotice]);

  useEffect(() => {
    if (!profileOpen) return;
    const frame = window.requestAnimationFrame(() => editProfileActionRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [profileOpen]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true");
      const storedGroups = localStorage.getItem(SIDEBAR_GROUPS_KEY);
      if (storedGroups) setOpenGroups((current) => ({ ...current, ...JSON.parse(storedGroups) }));
    } catch {}
  }, []);

  useEffect(() => {
    const syncFocusedQuoteReview = () => {
      const quoteId = new URLSearchParams(window.location.search).get("quoteId");
      setFocusedQuoteReview(pathname === "/admin/quotation-approval" && Boolean(quoteId));
    };

    syncFocusedQuoteReview();
    window.addEventListener("popstate", syncFocusedQuoteReview);
    return () => window.removeEventListener("popstate", syncFocusedQuoteReview);
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      setIsDesktop(media.matches);
      if (media.matches) setMobileOpen(false);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {}
  }, [collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(openGroups));
    } catch {}
  }, [openGroups]);

  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
    setNavQuery("");
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setMobileOpen(false);
        setProfileOpen((current) => {
          if (current) window.requestAnimationFrame(() => profileMenuButtonRef.current?.focus());
          return false;
        });
        setNavQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = mobilePanelRef.current;
    const menuButton = mobileMenuButtonRef.current;
    const initialFocusable = panel?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    initialFocusable?.[0]?.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = panel?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    panel?.addEventListener("keydown", trapFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      panel?.removeEventListener("keydown", trapFocus);
      menuButton?.focus();
    };
  }, [mobileOpen]);

  const visiblePages = useMemo(() => {
    if (!session) return new Set<AdminPagePath>();
    if (session.isOwner) return new Set<AdminPagePath>(ALL_ADMIN_PAGE_PATHS);
    const allowed = new Set<AdminPagePath>(session.allowedPages);
    if (allowed.has("/admin/tanvi")) {
      allowed.add("/admin/quotation-approval");
      allowed.add("/admin/house-inventory");
    }
    return allowed;
  }, [session]);

  const currentPath = activePagePath(pathname);
  const currentLabel = currentPath ? pageLabel(currentPath) : "Admin";
  const currentGroup = NAV_GROUPS.find((group) => currentPath && group.paths.includes(currentPath));

  useEffect(() => {
    if (!currentGroup) return;
    if (currentGroup.id !== "daily") setToolsOpen(true);
    setOpenGroups((current) => (current[currentGroup.id] ? current : { ...current, [currentGroup.id]: true }));
  }, [currentGroup]);

  const searchResults = useMemo(() => {
    const queryValue = navQuery.trim().toLowerCase();
    if (!queryValue) return [];
    return ADMIN_PAGE_OPTIONS.filter((option) => {
      if (!visiblePages.has(option.path)) return false;
      return `${pageLabel(option.path)} ${option.group} ${option.path}`.toLowerCase().includes(queryValue);
    }).slice(0, 8);
  }, [navQuery, visiblePages]);

  const displayName = profile.displayName;
  const displayEmail = session?.email || "Administrator · Mauritius";
  const isOwnerProfile = session?.isOwner === true;
  const displayHeadline = profile.headline;
  const displayLocation = profile.location;
  const avatarSource = profile.avatarDataUrl || (isOwnerProfile ? "/ryan-chutooree.jpg" : null);
  const firstName = displayName.split(/\s+/).filter(Boolean)[0] || "Admin";
  const profileSubtitle = [displayLocation, displayHeadline].filter(Boolean).join(" · ") || displayEmail;

  const restoreProfileEditorFocus = useCallback(() => {
    const opener = profileEditorOpenerRef.current;
    const target = opener?.isConnected ? opener : profileMenuButtonRef.current;
    window.requestAnimationFrame(() => target?.focus());
    profileEditorOpenerRef.current = null;
  }, []);

  const closeProfileEditor = useCallback(() => {
    setProfileEditorOpen(false);
    restoreProfileEditorFocus();
  }, [restoreProfileEditorFocus]);

  const openProfileEditor = useCallback((opener: HTMLElement | null) => {
    if (profileLoadState !== "ready") {
      if (profileLoadState === "error") {
        setProfileLoadState("loading");
        setProfileReloadKey((current) => current + 1);
        setProfileNotice("Profile could not load. Retrying now…");
      } else {
        setProfileNotice("Your profile is still loading…");
      }
      return;
    }
    profileEditorOpenerRef.current = opener;
    setProfileOpen(false);
    setMobileOpen(false);
    setProfileEditorOpen(true);
  }, [profileLoadState]);

  async function logout() {
    await Promise.allSettled([
      fetch("/api/logout", { method: "POST" }),
      signOutAdminFromFirebase(),
    ]);
    router.replace("/login");
  }

  function openSearchResult(path: AdminPagePath) {
    setNavQuery("");
    searchRef.current?.blur();
    router.push(pageHref(path));
  }

  if (isPartnerDesk) {
    return <div className="min-h-screen bg-[#f6f8fb] text-slate-950">{children}</div>;
  }

  const sidebarCollapsed = collapsed || focusedQuoteReview;

  const sidebar = (
    <aside
      className={`admin-workspace-sidebar flex h-full flex-col overflow-hidden border-r border-white/[0.07] bg-[#141921] text-white transition-[width] duration-300 ${
        sidebarCollapsed ? "lg:w-[68px]" : "lg:w-[272px]"
      } w-[min(300px,calc(100vw-48px))] max-w-full`}
    >
      <div className={`admin-workspace-sidebar-brand flex h-[92px] shrink-0 items-center border-b border-white/[0.07] px-5 ${sidebarCollapsed ? "lg:justify-center lg:px-2" : ""}`}>
        <Link href="/admin" className="flex min-w-0 items-center gap-3" aria-label="MO T-SHIRT daily workspace">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
            <Image src="/logo_transparent.webp" alt="" width={1291} height={435} className="h-auto w-10 object-contain" />
          </span>
          <span className={`min-w-0 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
            <span className="block truncate text-[21px] font-bold tracking-[-0.04em]">Mo T-Shirt</span>
            <span className="mt-0.5 block truncate text-[11px] text-white/45">The business, together</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className={`min-h-0 flex-1 overscroll-contain overflow-y-auto px-3 py-4 touch-pan-y [-webkit-overflow-scrolling:touch] [scrollbar-color:rgba(255,255,255,0.18)_transparent] ${sidebarCollapsed ? "lg:px-2" : ""}`} aria-label="Administrator navigation">
        <div className={`relative mb-3 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            value={navQuery}
            onChange={(event) => setNavQuery(event.target.value)}
            placeholder="Find any tool..."
            aria-label="Find an admin tool"
            className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.055] pl-9 pr-3 text-base text-white outline-none placeholder:text-white/40 focus:border-white/20 sm:text-xs"
          />
        </div>
        {NAV_GROUPS.map((group) => {
            const queryValue = navQuery.trim().toLowerCase();
            const items = group.paths.filter((path) => {
              if (!visiblePages.has(path)) return false;
              if (group.id !== "daily" && DAILY_PATHS.includes(path)) return false;
              if (!queryValue) return true;
              return `${pageLabel(path)} ${group.label} ${path}`.toLowerCase().includes(queryValue);
            });
            if (!items.length && group.id !== "daily") return null;
            if (group.id !== "daily" && !toolsOpen && !queryValue) return null;
            const expanded = group.id === "daily" || (sidebarCollapsed && isDesktop) || Boolean(queryValue) ? true : openGroups[group.id] === true;
            return (
              <div key={group.id} className="mb-2">
                <button
                  type="button"
                  onClick={() => setOpenGroups((current) => ({ ...current, [group.id]: !expanded }))}
                  disabled={group.id === "daily"}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.16em] text-white/35 transition hover:text-white/65 ${
                    sidebarCollapsed ? "lg:hidden" : ""
                  }`}
                  aria-expanded={expanded}
                >
                  {group.label}
                  {group.id !== "daily" && <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? "rotate-0" : "-rotate-90"}`} />}
                </button>
                {expanded ? (
                  <div className="space-y-1">
                    {items.map((path) => {
                      const active = isNavPathActive(path, pathname);
                      const Icon = PAGE_ICONS[path] || ChevronRight;
                      return (
                        <Link
                          key={path}
                          href={pageHref(path)}
                          title={sidebarCollapsed ? pageLabel(path) : undefined}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setMobileOpen(false)}
                          className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition ${
                            active
                              ? "bg-white text-[#0b1115] shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
                              : "text-white/62 hover:bg-white/[0.07] hover:text-white"
                          } ${sidebarCollapsed ? "lg:justify-center lg:px-0" : ""}`}
                        >
                          <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-[#f0442a]" : "text-white/52 group-hover:text-white/85"}`} />
                          <span className={`truncate ${sidebarCollapsed ? "lg:hidden" : ""}`}>{pageLabel(path)}</span>
                          {active ? <span className={`ml-auto h-1.5 w-1.5 rounded-full bg-[#f0442a] ${sidebarCollapsed ? "lg:hidden" : ""}`} /> : null}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
                {group.id === "daily" && <button type="button" onClick={() => setToolsOpen((open) => !open)} aria-expanded={toolsOpen} title={sidebarCollapsed ? "All tools" : undefined} className={`mt-5 flex min-h-11 w-full items-center gap-3 rounded-xl border border-white/10 px-3 text-[13px] font-medium text-white/65 hover:bg-white/10 hover:text-white ${sidebarCollapsed ? "lg:justify-center lg:px-0" : ""}`}><Layers3 className="h-[18px] w-[18px] shrink-0" /><span className={sidebarCollapsed ? "lg:hidden" : ""}>All tools</span><ChevronDown className={`ml-auto h-4 w-4 ${toolsOpen ? "rotate-180" : ""} ${sidebarCollapsed ? "lg:hidden" : ""}`} /></button>}
              </div>
            );
          })}
      </nav>

      <div className={`shrink-0 border-t border-white/[0.07] p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] ${sidebarCollapsed ? "lg:px-2 lg:pt-2" : ""}`}>
        <button
          type="button"
          onClick={(event) => openProfileEditor(event.currentTarget)}
          title={sidebarCollapsed ? "Edit profile" : undefined}
          aria-label={`Edit profile for ${displayName}`}
          aria-disabled={profileLoadState === "loading"}
          className={`group flex min-h-11 w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0442a]/70 ${sidebarCollapsed ? "lg:justify-center lg:p-1" : ""}`}
        >
          <AdminAvatar
            name={displayName}
            src={avatarSource}
            zoom={profile.avatarZoom}
            offsetX={profile.avatarOffsetX}
            offsetY={profile.avatarOffsetY}
            sizes="36px"
            className="h-9 w-9 bg-white text-xs font-bold text-[#141921] ring-1 ring-white/20"
          />
          <span className={`min-w-0 flex-1 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
            <span className="block truncate text-xs font-semibold">{displayName}</span>
            <span className="mt-0.5 block truncate text-[10px] text-white/42">{profileSubtitle}</span>
          </span>
          <Pencil className={`h-3.5 w-3.5 text-white/35 transition group-hover:text-white/65 ${sidebarCollapsed ? "lg:hidden" : ""}`} />
        </button>
      </div>
    </aside>
  );

  return (
    <div className={`flex min-h-dvh w-full max-w-full overflow-x-clip ${isDark ? "bg-[#050806] text-white" : "bg-[#f7f8fa] text-slate-950"}`}>
      <div className="sticky top-0 hidden h-dvh shrink-0 self-start lg:block">{sidebar}</div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Administrator navigation">
          <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />
          <div ref={mobilePanelRef} className="absolute inset-y-0 left-0 shadow-[24px_0_80px_rgba(0,0,0,0.45)]">{sidebar}</div>
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <header className={`admin-workspace-header sticky top-0 z-40 flex h-16 items-center gap-2 border-b px-3 backdrop-blur-xl sm:gap-3 sm:px-5 ${
          isDark ? "border-white/10 bg-[#080d0a]/92" : "border-slate-200/80 bg-white/92"
        }`}>
          <button
            ref={mobileMenuButtonRef}
            type="button"
            onClick={() => setMobileOpen(true)}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border lg:hidden ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}
            aria-label="Open administrator navigation"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1 sm:hidden">
            <div className={`truncate text-[9px] font-bold uppercase tracking-[0.14em] ${isDark ? "text-white/35" : "text-slate-400"}`}>{currentGroup?.label || "Workspace"}</div>
            <div className="truncate text-xs font-bold">{currentLabel}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (focusedQuoteReview) {
                setFocusedQuoteReview(false);
                return;
              }
              setCollapsed((current) => !current);
            }}
            className={`hidden rounded-xl border p-2.5 transition lg:inline-flex ${isDark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-50"}`}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>

          <div className="hidden min-w-0 sm:block lg:w-[220px]">
            <div className={`truncate text-[10px] font-bold uppercase tracking-[0.16em] ${isDark ? "text-white/35" : "text-slate-400"}`}>{currentGroup?.label || "Workspace"}</div>
            <div className="truncate text-sm font-bold tracking-[-0.02em]">{currentLabel}</div>
          </div>

          <div className="relative mx-auto hidden min-w-0 max-w-[560px] flex-1 md:block">
            <Search className={`pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${isDark ? "text-white/35" : "text-slate-400"}`} />
            <input
              ref={searchRef}
              value={navQuery}
              onChange={(event) => setNavQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchResults[0]) openSearchResult(searchResults[0].path);
              }}
              placeholder="Search all administrator modules..."
              aria-label="Search administrator modules"
              className={`h-10 w-full rounded-xl border pl-10 pr-14 text-xs outline-none transition ${
                isDark
                  ? "border-white/10 bg-white/[0.055] text-white placeholder:text-white/30 focus:border-white/25"
                  : "border-slate-200 bg-slate-50/70 text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
              }`}
            />
            <kbd className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border px-1.5 py-0.5 text-[9px] ${isDark ? "border-white/10 text-white/35" : "border-slate-200 text-slate-400"}`}>⌘ K</kbd>
            {navQuery.trim() ? (
              <div className={`absolute inset-x-0 top-[calc(100%+8px)] overflow-hidden rounded-2xl border p-2 shadow-[0_24px_80px_rgba(15,23,42,0.18)] ${
                isDark ? "border-white/10 bg-[#101613]" : "border-slate-200 bg-white"
              }`}>
                {searchResults.length ? searchResults.map((option) => {
                  const Icon = PAGE_ICONS[option.path] || ChevronRight;
                  const group = NAV_GROUPS.find((entry) => entry.paths.includes(option.path));
                  return (
                    <button
                      key={option.path}
                      type="button"
                      onClick={() => openSearchResult(option.path)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${isDark ? "hover:bg-white/7" : "hover:bg-slate-50"}`}
                    >
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${isDark ? "bg-white/7" : "bg-slate-100"}`}><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{pageLabel(option.path)}</span><span className={`block text-[10px] ${isDark ? "text-white/35" : "text-slate-400"}`}>{group?.label}</span></span>
                      <ChevronRight className={`h-4 w-4 ${isDark ? "text-white/25" : "text-slate-300"}`} />
                    </button>
                  );
                }) : <div className={`px-3 py-6 text-center text-xs ${isDark ? "text-white/40" : "text-slate-400"}`}>No administrator module found.</div>}
              </div>
            ) : null}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              ref={profileMenuButtonRef}
              type="button"
              onClick={toggleTheme}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border transition ${isDark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setProfileOpen((current) => !current)}
              className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border p-1.5 pr-1.5 transition sm:pr-2.5 ${isDark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              aria-expanded={profileOpen}
              aria-label={`Open profile menu for ${displayName}`}
            >
              <AdminAvatar
                name={displayName}
                src={avatarSource}
                zoom={profile.avatarZoom}
                offsetX={profile.avatarOffsetX}
                offsetY={profile.avatarOffsetY}
                sizes="28px"
                className={`h-7 w-7 text-[10px] font-bold ${isDark ? "bg-white text-[#141921]" : "bg-[#141921] text-white"}`}
              />
              <span className="hidden text-xs font-semibold xl:block">{firstName}</span>
              <ChevronDown className="hidden h-3.5 w-3.5 opacity-45 sm:block" />
            </button>
          </div>
        </header>

        {profileOpen ? (
          <>
          <button type="button" tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => {
            setProfileOpen(false);
            window.requestAnimationFrame(() => profileMenuButtonRef.current?.focus());
          }} aria-label="Close profile menu" />
          <div role="region" aria-label="Profile actions" className={`fixed right-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-50 max-h-[calc(100dvh-5.5rem)] w-[calc(100vw-1.5rem)] max-w-[320px] overflow-y-auto rounded-2xl border shadow-[0_24px_80px_rgba(15,23,42,0.2)] sm:right-5 ${isDark ? "border-white/10 bg-[#101613]" : "border-slate-200 bg-white"}`}>
            <div className={`border-b p-4 ${isDark ? "border-white/10" : "border-slate-100"}`}>
              <div className="flex items-center gap-3">
                <AdminAvatar
                  name={displayName}
                  src={avatarSource}
                  zoom={profile.avatarZoom}
                  offsetX={profile.avatarOffsetX}
                  offsetY={profile.avatarOffsetY}
                  sizes="48px"
                  className={`h-12 w-12 text-xs font-bold ${isDark ? "bg-white text-[#141921]" : "bg-[#141921] text-white"}`}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{displayName}</div>
                  {displayHeadline ? <div className={`mt-0.5 truncate text-[11px] ${isDark ? "text-white/52" : "text-slate-600"}`}>{displayHeadline}</div> : null}
                  <div className={`mt-0.5 truncate text-[10px] ${isDark ? "text-white/35" : "text-slate-400"}`}>{displayEmail}</div>
                </div>
              </div>
              <div className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${isDark ? "bg-white/7 text-white/65" : "bg-slate-100 text-slate-600"}`}>{isOwnerProfile ? `Owner · ${displayLocation || "Mauritius"}` : (displayLocation || "Team access")}</div>
            </div>
            <div className="p-2">
              <button ref={editProfileActionRef} type="button" onClick={(event) => openProfileEditor(event.currentTarget)} aria-disabled={profileLoadState === "loading"} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold ${isDark ? "hover:bg-white/7" : "hover:bg-slate-50"}`}><Pencil className="h-4 w-4" /> {profileLoadState === "ready" ? "Edit profile" : profileLoadState === "error" ? "Retry profile" : "Loading profile…"}</button>
              {visiblePages.has("/admin/settings") ? <Link href="/admin/settings" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold ${isDark ? "hover:bg-white/7" : "hover:bg-slate-50"}`}><Settings className="h-4 w-4" /> Workspace settings</Link> : null}
              <Link href="/" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold ${isDark ? "hover:bg-white/7" : "hover:bg-slate-50"}`}><ExternalLink className="h-4 w-4" /> Visit Mauritius store</Link>
              <button type="button" onClick={logout} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-rose-600 ${isDark ? "hover:bg-rose-400/10" : "hover:bg-rose-50"}`}><LogOut className="h-4 w-4" /> Sign out</button>
            </div>
          </div>
          </>
        ) : null}

        <AdminProfileEditor
          open={profileEditorOpen}
          profile={profile}
          email={displayEmail}
          fallbackAvatarUrl={isOwnerProfile ? "/ryan-chutooree.jpg" : null}
          onClose={closeProfileEditor}
          onSaved={(savedProfile) => {
            setProfile(savedProfile);
            setProfileOpen(false);
            setProfileNotice("Profile updated successfully.");
            closeProfileEditor();
          }}
        />

        {profileNotice ? (
          <div role="status" aria-live="polite" className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[90] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border px-4 py-3 text-center text-xs font-semibold shadow-[0_18px_60px_rgba(0,0,0,0.22)] sm:left-auto sm:right-5 sm:w-auto sm:translate-x-0 ${isDark ? "border-white/10 bg-[#142019] text-white" : "border-slate-200 bg-white text-slate-800"}`}>
            {profileNotice}
          </div>
        ) : null}

        <div className="min-w-0">
          <div className={`${pathname === "/admin" || pathname === "/admin/workspace" ? "" : "admin-page-shell admin-minimal p-3 sm:p-5 lg:p-6"} min-h-[calc(100dvh-4rem)]`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
