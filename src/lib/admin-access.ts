export type AdminPagePath =
  | "/admin"
  | "/admin/orders"
  | "/admin/pos"
  | "/admin/clients"
  | "/admin/contracts"
  | "/admin/shops"
  | "/admin/ready-made-uniforms"
  | "/admin/inventory"
  | "/admin/quotation-approval"
  | "/admin/tanvi"
  | "/admin/partners"
  | "/admin/design-studio"
  | "/admin/background-remover"
  | "/admin/ai-assistant"
  | "/admin/prescription-ocr"
  | "/admin/analytics"
  | "/admin/tracking"
  | "/admin/accounting"
  | "/admin/finance-freedom"
  | "/admin/business-value"
  | "/admin/business-os"
  | "/admin/management"
  | "/admin/sales"
  | "/admin/marketing"
  | "/admin/customer-service"
  | "/admin/design"
  | "/admin/production"
  | "/admin/purchasing"
  | "/admin/inventory-department"
  | "/admin/logistics"
  | "/admin/quality"
  | "/admin/finance"
  | "/admin/hr"
  | "/admin/technology"
  | "/admin/docker-postgres"
  | "/admin/legal-compliance"
  | "/admin/automation"
  | "/admin/dms"
  | "/admin/iot"
  | "/admin/business-notes"
  | "/admin/business-details"
  | "/admin/his-dream-life"
  | "/admin/her-dream-life"
  | "/admin/our-dream"
  | "/admin/settings";

export type AdminPermissionGroup =
  | "Overview"
  | "Departments"
  | "Sales"
  | "Operations"
  | "Insights"
  | "Planning"
  | "Administration";

export type AdminPageOption = {
  path: AdminPagePath;
  label: string;
  description: string;
  group: AdminPermissionGroup;
};

export const ADMIN_PAGE_OPTIONS: AdminPageOption[] = [
  {
    path: "/admin",
    label: "Dashboard",
    description: "Overview, KPIs, and quick actions.",
    group: "Overview",
  },
  {
    path: "/admin/orders",
    label: "Orders",
    description: "Transactions, order status, and payment follow-up.",
    group: "Sales",
  },
  {
    path: "/admin/pos",
    label: "POS",
    description: "Checkout, invoicing, and held orders.",
    group: "Sales",
  },
  {
    path: "/admin/clients",
    label: "Clients",
    description: "Customer records and relationship notes.",
    group: "Sales",
  },
  {
    path: "/admin/contracts",
    label: "Contracts",
    description: "Agreement tracking and contract records.",
    group: "Sales",
  },
  {
    path: "/admin/shops",
    label: "Shops",
    description: "Catalog items and shop content management.",
    group: "Sales",
  },
  {
    path: "/admin/ready-made-uniforms",
    label: "Ready-Made Uniforms",
    description: "Uniform style codes, images, and public page content.",
    group: "Sales",
  },
  {
    path: "/admin/quotation-approval",
    label: "Quotation / Invoice",
    description: "Quotes, invoices, and artwork follow-up.",
    group: "Sales",
  },
  {
    path: "/admin/tanvi",
    label: "Tanvi Desk",
    description: "Production manager routing, blockers, and partner follow-up.",
    group: "Operations",
  },
  {
    path: "/admin/partners",
    label: "Partners",
    description: "Partner pages, payment details, and order notification routing.",
    group: "Operations",
  },
  {
    path: "/admin/design-studio",
    label: "Design Studio",
    description: "Garment design tools and quotation intake.",
    group: "Sales",
  },
  {
    path: "/admin/background-remover",
    label: "Background Remover",
    description: "Remove image backgrounds and export transparent PNG files.",
    group: "Sales",
  },
  {
    path: "/admin/ai-assistant",
    label: "Sales AI",
    description: "AI assistant review, training, and leads.",
    group: "Sales",
  },
  {
    path: "/admin/prescription-ocr",
    label: "Prescription OCR",
    description: "Private OCR test page for prescription photo extraction.",
    group: "Operations",
  },
  {
    path: "/admin/inventory",
    label: "Inventory",
    description: "Products, stock, and pricing updates.",
    group: "Operations",
  },
  {
    path: "/admin/dms",
    label: "DMS",
    description: "Document storage and file management.",
    group: "Operations",
  },
  {
    path: "/admin/iot",
    label: "IoT Control Center",
    description: "Connected devices and automations.",
    group: "Operations",
  },
  {
    path: "/admin/analytics",
    label: "Analytics",
    description: "Traffic and performance analytics.",
    group: "Insights",
  },
  {
    path: "/admin/tracking",
    label: "Tracking",
    description: "Operational tracking and monitoring views.",
    group: "Insights",
  },
  {
    path: "/admin/accounting",
    label: "Accounting",
    description: "Financial records and account views.",
    group: "Insights",
  },
  {
    path: "/admin/finance-freedom",
    label: "Finance Freedom",
    description: "Financial planning and freedom dashboard.",
    group: "Insights",
  },
  {
    path: "/admin/business-value",
    label: "Business Value",
    description: "Business valuation and strategic metrics.",
    group: "Insights",
  },
  {
    path: "/admin/business-os",
    label: "Business OS",
    description: "Operating system for offers, SOPs, roles, numbers, and bottlenecks.",
    group: "Planning",
  },
  {
    path: "/admin/management",
    label: "Management Department",
    description: "CEO decisions, roles, blockers, and leadership rhythm.",
    group: "Departments",
  },
  {
    path: "/admin/sales",
    label: "Sales Department",
    description: "Lead intake, quotes, account management, and paid-order handoff.",
    group: "Departments",
  },
  {
    path: "/admin/marketing",
    label: "Marketing Department",
    description: "Campaigns, content, lead sources, and proof library.",
    group: "Departments",
  },
  {
    path: "/admin/customer-service",
    label: "Customer Service Department",
    description: "Client updates, issues, reviews, and retention.",
    group: "Departments",
  },
  {
    path: "/admin/design",
    label: "Design Department",
    description: "Artwork intake, approvals, revisions, and production files.",
    group: "Departments",
  },
  {
    path: "/admin/production",
    label: "Production Department",
    description: "Production seats, daily queue, blockers, and finishing handoff.",
    group: "Departments",
  },
  {
    path: "/admin/purchasing",
    label: "Purchasing Department",
    description: "Suppliers, purchases, receiving, and reorder control.",
    group: "Departments",
  },
  {
    path: "/admin/inventory-department",
    label: "Inventory Department",
    description: "Stock ownership, reservations, cycle counts, and catalog accuracy.",
    group: "Departments",
  },
  {
    path: "/admin/logistics",
    label: "Logistics Department",
    description: "Pickup, delivery, routing, and proof of delivery.",
    group: "Departments",
  },
  {
    path: "/admin/quality",
    label: "Quality Department",
    description: "Quality gates, defects, root causes, and reprint prevention.",
    group: "Departments",
  },
  {
    path: "/admin/finance",
    label: "Finance Department",
    description: "Cash, margin, bookkeeping, credit control, and approvals.",
    group: "Departments",
  },
  {
    path: "/admin/hr",
    label: "HR Department",
    description: "Seats, hiring, onboarding, training, and performance rhythm.",
    group: "Departments",
  },
  {
    path: "/admin/technology",
    label: "Technology Department",
    description: "Systems, data quality, automations, devices, and access control.",
    group: "Departments",
  },
  {
    path: "/admin/docker-postgres",
    label: "Docker PostgreSQL",
    description: "Test a Docker-backed PostgreSQL database connection.",
    group: "Administration",
  },
  {
    path: "/admin/legal-compliance",
    label: "Legal & Compliance Department",
    description: "Contracts, policies, records, privacy, and risk control.",
    group: "Departments",
  },
  {
    path: "/admin/automation",
    label: "Automation",
    description: "Automation logs and scheduled actions.",
    group: "Insights",
  },
  {
    path: "/admin/business-notes",
    label: "Business Notes",
    description: "Internal notes, reminders, and references.",
    group: "Planning",
  },
  {
    path: "/admin/business-details",
    label: "Business Details",
    description: "Company information and copy-ready details.",
    group: "Planning",
  },
  {
    path: "/admin/his-dream-life",
    label: "His Dream Life",
    description: "Personal planning workspace.",
    group: "Planning",
  },
  {
    path: "/admin/her-dream-life",
    label: "Her Dream Life",
    description: "Personal planning workspace.",
    group: "Planning",
  },
  {
    path: "/admin/our-dream",
    label: "Our Dream Life",
    description: "Shared planning workspace.",
    group: "Planning",
  },
  {
    path: "/admin/settings",
    label: "Settings",
    description: "Workspace controls for storage, admin access, and routing.",
    group: "Administration",
  },
];

export const ADMIN_PAGE_GROUPS: AdminPermissionGroup[] = [
  "Overview",
  "Departments",
  "Sales",
  "Operations",
  "Insights",
  "Planning",
  "Administration",
];

export const ALL_ADMIN_PAGE_PATHS = ADMIN_PAGE_OPTIONS.map(
  (option) => option.path
) as AdminPagePath[];

const ADMIN_PAGE_PATH_SET = new Set<AdminPagePath>(ALL_ADMIN_PAGE_PATHS);
const ADMIN_PATHS_BY_LENGTH = [...ALL_ADMIN_PAGE_PATHS].sort(
  (left, right) => right.length - left.length
);

export const DEFAULT_TOP_NAV_PATHS: AdminPagePath[] = [
  "/admin/pos",
  "/admin/clients",
  "/admin/ai-assistant",
  "/admin/contracts",
  "/admin/shops",
  "/admin/ready-made-uniforms",
  "/admin/quotation-approval",
  "/admin/tanvi",
  "/admin/design-studio",
  "/admin/background-remover",
  "/admin/analytics",
  "/admin/tracking",
  "/admin/accounting",
  "/admin/finance-freedom",
  "/admin/business-value",
  "/admin/business-os",
  "/admin/management",
  "/admin/sales",
  "/admin/marketing",
  "/admin/customer-service",
  "/admin/design",
  "/admin/production",
  "/admin/purchasing",
  "/admin/inventory-department",
  "/admin/logistics",
  "/admin/quality",
  "/admin/finance",
  "/admin/hr",
  "/admin/technology",
  "/admin/docker-postgres",
  "/admin/legal-compliance",
  "/admin/prescription-ocr",
  "/admin/dms",
  "/admin/iot",
  "/admin/business-notes",
  "/admin/business-details",
  "/admin/his-dream-life",
  "/admin/her-dream-life",
  "/admin/our-dream",
];

export const DEFAULT_MORE_NAV_PATHS: AdminPagePath[] = [
  "/admin",
  "/admin/orders",
  "/admin/inventory",
  "/admin/automation",
  "/admin/partners",
  "/admin/settings",
];

export const SHARED_FIREBASE_AUTH_PAGE_PATHS: AdminPagePath[] = [
  "/admin/dms",
  "/admin/quotation-approval",
];

export function normalizeAdminAllowedPages(value: unknown) {
  if (!Array.isArray(value)) return [] as AdminPagePath[];

  const seen = new Set<AdminPagePath>();
  const normalized: AdminPagePath[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") continue;
    if (!ADMIN_PAGE_PATH_SET.has(entry as AdminPagePath)) continue;

    const pagePath = entry as AdminPagePath;
    if (seen.has(pagePath)) continue;
    seen.add(pagePath);
    normalized.push(pagePath);
  }

  return normalized;
}

export function resolveAdminPagePath(pathname: string) {
  if (pathname === "/iot") return "/admin/iot" as AdminPagePath;

  for (const pagePath of ADMIN_PATHS_BY_LENGTH) {
    if (pathname === pagePath || pathname.startsWith(`${pagePath}/`)) {
      return pagePath;
    }
  }

  return null;
}

export function resolveAdminApiPermission(pathname: string) {
  if (pathname.startsWith("/api/admin/tanvi")) return "/admin/tanvi" as AdminPagePath;
  if (pathname.startsWith("/api/admin/settings")) return "/admin/settings" as AdminPagePath;
  if (pathname.startsWith("/api/admin/partners")) return "/admin/partners" as AdminPagePath;
  if (pathname.startsWith("/api/admin/docker-postgres")) return "/admin/docker-postgres" as AdminPagePath;
  if (pathname.startsWith("/api/admin/ai-assistant")) return "/admin/ai-assistant" as AdminPagePath;
  if (pathname.startsWith("/api/admin/quotes")) return "/admin/quotation-approval" as AdminPagePath;
  if (pathname.startsWith("/api/admin/ready-made-uniforms")) return "/admin/ready-made-uniforms" as AdminPagePath;
  if (pathname.startsWith("/api/admin/shops")) return "/admin/shops" as AdminPagePath;
  if (pathname.startsWith("/api/tuya/")) return "/admin/iot" as AdminPagePath;
  return null;
}

export function hasAdminPageAccess(
  allowedPages: AdminPagePath[],
  pathname: string,
  options?: { isOwner?: boolean }
) {
  if (options?.isOwner) return true;

  const requiredPage = resolveAdminPagePath(pathname);
  if (!requiredPage) return false;
  if (
    requiredPage === "/admin/quotation-approval" &&
    allowedPages.includes("/admin/tanvi")
  ) {
    return true;
  }
  return allowedPages.includes(requiredPage);
}

export function hasAdminApiAccess(
  allowedPages: AdminPagePath[],
  pathname: string,
  options?: { isOwner?: boolean }
) {
  if (options?.isOwner) return true;

  const requiredPage = resolveAdminApiPermission(pathname);
  if (!requiredPage) return true;
  if (
    requiredPage === "/admin/quotation-approval" &&
    allowedPages.includes("/admin/tanvi")
  ) {
    return true;
  }
  return allowedPages.includes(requiredPage);
}

export function canUseSharedStorageAuth(
  allowedPages: AdminPagePath[],
  options?: { isOwner?: boolean }
) {
  if (options?.isOwner) return true;
  if (allowedPages.includes("/admin/tanvi")) return true;
  return SHARED_FIREBASE_AUTH_PAGE_PATHS.some((pagePath) =>
    allowedPages.includes(pagePath)
  );
}

export function getAdminLandingPath(
  allowedPages: AdminPagePath[],
  options?: { isOwner?: boolean }
) {
  if (options?.isOwner) return "/admin";

  const ordered = [...DEFAULT_MORE_NAV_PATHS, ...DEFAULT_TOP_NAV_PATHS];
  const firstAllowed = ordered.find((path) => allowedPages.includes(path));
  return firstAllowed || "/login";
}
