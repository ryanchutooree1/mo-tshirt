export type PartnerPaymentDetails = {
  fullName: string;
  bankName: string;
  bankAccountNumber: string;
  juiceNumber: string;
};

export type PrintPartner = {
  id: string;
  name: string;
  path: string;
  active: boolean;
  productionNotes: string[];
  paymentDetails?: PartnerPaymentDetails | null;
  email: string;
  emails: string[];
  emailNotificationsEnabled: boolean;
  supportsLogoPrintPlacements: boolean;
  hasPassword?: boolean;
};

export const DEFAULT_PRINT_PARTNERS: PrintPartner[] = [
  {
    id: "yan",
    name: "Yan",
    path: "/admin/yan_list",
    active: true,
    productionNotes: [],
    paymentDetails: {
      fullName: "Yan Chineah",
      bankName: "Mauritius Commercial Bank (MCB)",
      bankAccountNumber: "000449132366",
      juiceNumber: "57934043",
    },
    email: "",
    emails: [],
    emailNotificationsEnabled: false,
    supportsLogoPrintPlacements: false,
    hasPassword: true,
  },
  {
    id: "shabanaz",
    name: "Shabbanaz",
    path: "/admin/shab_list",
    active: true,
    productionNotes: [
      "Accepts DTF Printing and Serigraphy Printing orders.",
      "Minimum order: 15-20 T-Shirts.",
    ],
    paymentDetails: {
      fullName: "Shabbanaz Bibi Jaunnoo",
      bankName: "Mauritius Commercial Bank (MCB)",
      bankAccountNumber: "000449789454",
      juiceNumber: "58388176",
    },
    email: "jshabbanaz@gmail.com",
    emails: ["jshabbanaz@gmail.com"],
    emailNotificationsEnabled: true,
    supportsLogoPrintPlacements: true,
    hasPassword: true,
  },
] satisfies PrintPartner[];

export const PRINT_PARTNERS = DEFAULT_PRINT_PARTNERS;

export type PrintPartnerId = string;

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

export type PartnerClientStatus =
  | "not_set"
  | "quotation_sent"
  | "waiting_client_response"
  | "changes_needed"
  | "confirmed_half_payment";

export type PartnerPrintPlacement =
  | "not_set"
  | "small_front_only"
  | "large_front_only"
  | "back_only"
  | "front_back"
  | "small_front_back"
  | "logo_only"
  | "logo_front_back"
  | "sleeve_only"
  | "custom";

export type PartnerPrintPlacementSource = "partner" | "admin" | "client" | "unset";

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
  clientStatus: PartnerClientStatus;
  printPlacement: PartnerPrintPlacement;
  printPlacementSource: PartnerPrintPlacementSource;
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

export const PARTNER_CLIENT_STATUS_LABELS: Record<PartnerClientStatus, string> = {
  not_set: "Not set",
  quotation_sent: "Quotation sent",
  waiting_client_response: "Waiting for client response",
  changes_needed: "Changes need to be made",
  confirmed_half_payment: "Client confirmed with half payment",
};

export const PARTNER_CLIENT_STATUS_OPTIONS: {
  value: PartnerClientStatus;
  label: string;
}[] = [
  { value: "not_set", label: PARTNER_CLIENT_STATUS_LABELS.not_set },
  { value: "quotation_sent", label: PARTNER_CLIENT_STATUS_LABELS.quotation_sent },
  {
    value: "waiting_client_response",
    label: PARTNER_CLIENT_STATUS_LABELS.waiting_client_response,
  },
  { value: "changes_needed", label: PARTNER_CLIENT_STATUS_LABELS.changes_needed },
  {
    value: "confirmed_half_payment",
    label: PARTNER_CLIENT_STATUS_LABELS.confirmed_half_payment,
  },
];

export const PARTNER_PRINT_PLACEMENT_LABELS: Record<PartnerPrintPlacement, string> = {
  not_set: "Use client/admin request",
  small_front_only: "Small Front Printing only",
  large_front_only: "Large Front Printing only",
  back_only: "Back Printing only",
  front_back: "Front + Back Printing",
  small_front_back: "Small Front + Back Printing",
  logo_only: "Logo Printing only",
  logo_front_back: "Logo Front + Back Printing",
  sleeve_only: "Sleeve Printing only",
  custom: "Other / see notes",
};

export const PARTNER_PRINT_PLACEMENT_OPTIONS: {
  value: PartnerPrintPlacement;
  label: string;
}[] = [
  { value: "not_set", label: PARTNER_PRINT_PLACEMENT_LABELS.not_set },
  { value: "small_front_only", label: PARTNER_PRINT_PLACEMENT_LABELS.small_front_only },
  { value: "large_front_only", label: PARTNER_PRINT_PLACEMENT_LABELS.large_front_only },
  { value: "back_only", label: PARTNER_PRINT_PLACEMENT_LABELS.back_only },
  { value: "front_back", label: PARTNER_PRINT_PLACEMENT_LABELS.front_back },
  { value: "small_front_back", label: PARTNER_PRINT_PLACEMENT_LABELS.small_front_back },
  { value: "sleeve_only", label: PARTNER_PRINT_PLACEMENT_LABELS.sleeve_only },
  { value: "custom", label: PARTNER_PRINT_PLACEMENT_LABELS.custom },
];

export const SHABANAZ_PRINT_PLACEMENT_OPTIONS: {
  value: PartnerPrintPlacement;
  label: string;
}[] = [
  ...PARTNER_PRINT_PLACEMENT_OPTIONS,
  { value: "logo_only", label: PARTNER_PRINT_PLACEMENT_LABELS.logo_only },
  {
    value: "logo_front_back",
    label: PARTNER_PRINT_PLACEMENT_LABELS.logo_front_back,
  },
];

const PARTNER_ID_RE = /^[a-z0-9][a-z0-9_-]{1,48}$/;
const VISIBLE_FIELD_SET = new Set<PartnerVisibleField>(
  PARTNER_VISIBLE_FIELD_OPTIONS.map((field) => field.key)
);
const PRODUCTION_STATUS_SET = new Set<PartnerProductionStatus>(
  PARTNER_PRODUCTION_STATUSES
);
const CLIENT_STATUS_SET = new Set<PartnerClientStatus>(
  PARTNER_CLIENT_STATUS_OPTIONS.map((status) => status.value)
);
const PRINT_PLACEMENT_SET = new Set<PartnerPrintPlacement>(
  Object.keys(PARTNER_PRINT_PLACEMENT_LABELS) as PartnerPrintPlacement[]
);
const DECISION_SET = new Set<PartnerDecision>([
  "pending",
  "accepted",
  "rejected",
  "needs_info",
]);

export function isPrintPartnerId(value: unknown): value is PrintPartnerId {
  return typeof value === "string" && PARTNER_ID_RE.test(value);
}

export function getPrintPartnerPath(partnerId: PrintPartnerId) {
  if (partnerId === "yan") return "/admin/yan_list";
  if (partnerId === "shabanaz") return "/admin/shab_list";
  return `/admin/partners/${partnerId}`;
}

export function formatPartnerNameFromId(partnerId: PrintPartnerId) {
  return partnerId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "Partner";
}

export function getPrintPartner(partnerId: PrintPartnerId) {
  return (
    PRINT_PARTNERS.find((partner) => partner.id === partnerId) || {
      id: partnerId,
      name: formatPartnerNameFromId(partnerId),
      path: getPrintPartnerPath(partnerId),
      active: true,
      productionNotes: [],
      paymentDetails: null,
      email: "",
      emails: [],
      emailNotificationsEnabled: false,
      supportsLogoPrintPlacements: false,
      hasPassword: false,
    }
  );
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

export function isPartnerClientStatus(value: unknown): value is PartnerClientStatus {
  return (
    typeof value === "string" &&
    CLIENT_STATUS_SET.has(value as PartnerClientStatus)
  );
}

export function normalizePartnerClientStatus(value: unknown): PartnerClientStatus {
  return isPartnerClientStatus(value) ? value : "not_set";
}

export function isPartnerPrintPlacement(value: unknown): value is PartnerPrintPlacement {
  return (
    typeof value === "string" &&
    PRINT_PLACEMENT_SET.has(value as PartnerPrintPlacement)
  );
}

export function normalizePartnerPrintPlacement(value: unknown): PartnerPrintPlacement {
  return isPartnerPrintPlacement(value) ? value : "not_set";
}

export function inferPartnerPrintPlacementFromText(
  value: string,
  flags: { front?: boolean; back?: boolean; sleeve?: boolean } = {}
): PartnerPrintPlacement {
  const text = value.toLowerCase();
  const hasSmallFront = /\b(small front|front left|left chest|chest logo|pocket)\b/.test(text);
  const hasLargeFront = /\b(big front|large front|full front|front large)\b/.test(text);
  const hasFront = /\b(front|chest)\b/.test(text) || hasSmallFront || hasLargeFront;
  const hasBack = /\b(back|rear)\b/.test(text);
  const hasSleeve = /\bsleeve\b/.test(text);
  const front = Boolean(flags.front || hasFront);
  const back = Boolean(flags.back || hasBack);
  const sleeve = Boolean(flags.sleeve || hasSleeve);

  if (front && back && hasSmallFront) return "small_front_back";
  if (front && back) return "front_back";
  if (hasLargeFront) return "large_front_only";
  if (front || hasSmallFront) return "small_front_only";
  if (back) return "back_only";
  if (sleeve) return "sleeve_only";
  return "not_set";
}
