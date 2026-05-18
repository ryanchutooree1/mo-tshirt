export const PRINT_PARTNERS = [
  {
    id: "yan",
    name: "Yan",
    path: "/admin/yan_list",
  },
  {
    id: "shabanaz",
    name: "Shabanaz",
    path: "/admin/shab_list",
  },
] as const;

export type PrintPartnerId = (typeof PRINT_PARTNERS)[number]["id"];

export type PartnerVisibleField =
  | "artwork"
  | "garments"
  | "sizes"
  | "colors"
  | "print"
  | "deadline"
  | "design"
  | "notes"
  | "delivery";

export type PartnerDecision = "pending" | "accepted" | "rejected" | "needs_info";

export type PartnerProductionStatus =
  | "not_started"
  | "in_progress"
  | "waiting_for_tshirts_from_ryan"
  | "completed"
  | "will_post_tomorrow"
  | "ryan_to_collect";

export type PartnerOrderAttachment = {
  label: string;
  filename: string;
  contentType: string;
  url?: string;
  quantity?: string;
};

export type PartnerOrderDetails = Partial<{
  artwork: PartnerOrderAttachment[];
  garments: string[];
  sizes: string[];
  colors: string[];
  print: string;
  deadline: string;
  design: string[];
  notes: string;
  delivery: string;
}>;

export type PartnerOrderView = {
  id: string;
  code: string;
  partnerId: PrintPartnerId;
  partnerName: string;
  assignedPartnerIds: PrintPartnerId[];
  lockedBy: PrintPartnerId | null;
  isShared: boolean;
  visibleFields: PartnerVisibleField[];
  assignedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  decision: PartnerDecision;
  productionStatus: PartnerProductionStatus;
  completionDays: number | null;
  price: number | null;
  comments: string;
  missingInformation: string;
  details: PartnerOrderDetails;
  summary: {
    product: string;
    pieces: number | null;
    deadline: string;
    print: string;
  };
};

export const PARTNER_VISIBLE_FIELD_OPTIONS: {
  key: PartnerVisibleField;
  label: string;
  description: string;
}[] = [
  {
    key: "artwork",
    label: "Artwork / logo",
    description: "Uploaded logo and design files only.",
  },
  {
    key: "garments",
    label: "Garment",
    description: "Product type and garment lines.",
  },
  {
    key: "sizes",
    label: "Sizes",
    description: "Size and quantity breakdown.",
  },
  {
    key: "colors",
    label: "Colours",
    description: "Requested shirt colours.",
  },
  {
    key: "print",
    label: "Print method",
    description: "DTF, screen print, embroidery, or other method.",
  },
  {
    key: "deadline",
    label: "Deadline",
    description: "Date or timing promise.",
  },
  {
    key: "design",
    label: "Design placement",
    description: "Front/back print details and text.",
  },
  {
    key: "notes",
    label: "Job notes",
    description: "Only operational notes you choose to share.",
  },
  {
    key: "delivery",
    label: "Delivery mode",
    description: "Delivery or pickup method without customer address.",
  },
];

export const DEFAULT_PARTNER_VISIBLE_FIELDS: PartnerVisibleField[] = [
  "artwork",
  "garments",
  "sizes",
  "colors",
  "print",
  "deadline",
  "design",
];

export const PARTNER_DECISION_LABELS: Record<PartnerDecision, string> = {
  pending: "Waiting for response",
  accepted: "Accepted",
  rejected: "Rejected",
  needs_info: "Needs information",
};

export const PARTNER_DECISION_TONES: Record<PartnerDecision, string> = {
  pending: "border-slate-200 bg-slate-50 text-slate-700",
  accepted: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-rose-200 bg-rose-50 text-rose-800",
  needs_info: "border-amber-200 bg-amber-50 text-amber-800",
};

export const PARTNER_PRODUCTION_STATUS_LABELS: Record<
  PartnerProductionStatus,
  string
> = {
  not_started: "Not started",
  in_progress: "In progress",
  waiting_for_tshirts_from_ryan: "Waiting for t-shirts from Ryan",
  completed: "Completed",
  will_post_tomorrow: "Will post tomorrow",
  ryan_to_collect: "Ryan to collect",
};

export const PARTNER_PRODUCTION_STATUSES: PartnerProductionStatus[] = [
  "not_started",
  "in_progress",
  "waiting_for_tshirts_from_ryan",
  "completed",
  "will_post_tomorrow",
  "ryan_to_collect",
];

const PARTNER_ID_SET = new Set<string>(PRINT_PARTNERS.map((partner) => partner.id));
const VISIBLE_FIELD_SET = new Set<PartnerVisibleField>(
  PARTNER_VISIBLE_FIELD_OPTIONS.map((field) => field.key)
);
const PRODUCTION_STATUS_SET = new Set<PartnerProductionStatus>(
  PARTNER_PRODUCTION_STATUSES
);
const DECISION_SET = new Set<PartnerDecision>([
  "pending",
  "accepted",
  "rejected",
  "needs_info",
]);

export function isPrintPartnerId(value: unknown): value is PrintPartnerId {
  return typeof value === "string" && PARTNER_ID_SET.has(value);
}

export function getPrintPartner(partnerId: PrintPartnerId) {
  return PRINT_PARTNERS.find((partner) => partner.id === partnerId) || PRINT_PARTNERS[0];
}

export function normalizePrintPartnerIds(value: unknown) {
  const rawIds = Array.isArray(value) ? value : [];
  const seen = new Set<PrintPartnerId>();
  const ids: PrintPartnerId[] = [];

  rawIds.forEach((entry) => {
    if (!isPrintPartnerId(entry)) return;
    if (seen.has(entry)) return;
    seen.add(entry);
    ids.push(entry);
  });

  return ids;
}

export function getPrintPartnerRouteLabel(partnerIds: PrintPartnerId[]) {
  const ids = normalizePrintPartnerIds(partnerIds);
  if (!ids.length) return "No partner";
  return ids.map((partnerId) => getPrintPartner(partnerId).name).join(" + ");
}

export function normalizePartnerVisibleFields(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_PARTNER_VISIBLE_FIELDS;

  const seen = new Set<PartnerVisibleField>();
  const fields: PartnerVisibleField[] = [];

  value.forEach((entry) => {
    if (typeof entry !== "string") return;
    if (!VISIBLE_FIELD_SET.has(entry as PartnerVisibleField)) return;
    const field = entry as PartnerVisibleField;
    if (seen.has(field)) return;
    seen.add(field);
    fields.push(field);
  });

  return fields.length ? fields : DEFAULT_PARTNER_VISIBLE_FIELDS;
}

export function isPartnerDecision(value: unknown): value is PartnerDecision {
  return typeof value === "string" && DECISION_SET.has(value as PartnerDecision);
}

export function isPartnerProductionStatus(
  value: unknown
): value is PartnerProductionStatus {
  return (
    typeof value === "string" &&
    PRODUCTION_STATUS_SET.has(value as PartnerProductionStatus)
  );
}
