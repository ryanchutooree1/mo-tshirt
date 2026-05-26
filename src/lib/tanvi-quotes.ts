import {
  formatPartnerNameFromId,
  getPrintPartnerRouteLabel,
  normalizePartnerClientStatus,
  normalizePartnerPrintPlacement,
  normalizePrintPartnerIds,
  normalizePartnerVisibleFields,
  PARTNER_PRODUCTION_STATUS_LABELS,
  type PartnerClientStatus,
  type PartnerDecision,
  type PartnerPrintPlacement,
  type PartnerProductionStatus,
  type PartnerVisibleField,
  type PrintPartner,
  type PrintPartnerId,
} from "@/lib/partners";
import {
  formatQuoteGarmentDescription,
  sortQuoteColors,
  type QuoteGarmentLine,
} from "@/lib/shops";

type FirestoreTimestampLike = {
  toDate?: () => Date;
  seconds?: number;
};

type RawAttachment = {
  label?: unknown;
  description?: unknown;
  quantity?: unknown;
  filename?: unknown;
  contentType?: unknown;
  size?: unknown;
  url?: unknown;
};

type RawQuote = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
  notes?: unknown;
  source?: unknown;
  status?: unknown;
  quantity?: unknown;
  printMethod?: unknown;
  deadline?: unknown;
  delivery?: unknown;
  garments?: QuoteGarmentLine[];
  attachment?: RawAttachment | null;
  attachments?: RawAttachment[];
  partner?: unknown;
  tanviStepChecks?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  designBrief?: Record<string, unknown> | null;
  quote?: {
    documentType?: unknown;
    documentNumber?: unknown;
    clientCompany?: unknown;
    paymentStatus?: unknown;
    currency?: unknown;
    total?: unknown;
    lines?: { description?: unknown; quantity?: unknown }[];
  };
};

export type TanviPartnerResponse = {
  partnerId: PrintPartnerId;
  partnerName: string;
  requestStatus: PartnerDecision;
  productionStatus: PartnerProductionStatus;
  printPlacement: PartnerPrintPlacement;
  completionDays: number | null;
  price: number | null;
  comments: string;
  missingInformation: string;
  respondedAt: string | null;
  updatedAt: string | null;
};

export type TanviArtworkAttachment = {
  label: string;
  description: string;
  quantity: string;
  filename: string;
  contentType: string;
  size: number | null;
  url: string;
};

export type TanviStepKey =
  | "client_onboarding"
  | "artwork"
  | "route_prices"
  | "client_approval"
  | "partner_answer"
  | "print_start";

export type TanviQuotePartner = {
  id: PrintPartnerId | null;
  name: string;
  visibleTo: PrintPartnerId[];
  visibleLabel: string;
  lockedBy: PrintPartnerId | null;
  visibleFields: PartnerVisibleField[];
  requestStatus: PartnerDecision;
  productionStatus: PartnerProductionStatus;
  clientStatus: PartnerClientStatus;
  printPlacement: PartnerPrintPlacement;
  completionDays: number | null;
  price: number | null;
  comments: string;
  missingInformation: string;
  assignedAt: string | null;
  respondedAt: string | null;
  updatedAt: string | null;
  responses: TanviPartnerResponse[];
};

export type TanviQuoteSummary = {
  id: string;
  code: string;
  status: string;
  documentType: string;
  clientName: string;
  clientCompany: string;
  email: string;
  phone: string;
  source: string;
  product: string;
  garmentSummary: string;
  pieces: number | null;
  colors: string[];
  printMethod: string;
  deadline: string;
  delivery: string;
  notes: string;
  currency: string;
  total: number | null;
  artwork: TanviArtworkAttachment[];
  artworkCount: number;
  hasOpenArtwork: boolean;
  hasEmailOnlyArtwork: boolean;
  tanviStepChecks: Record<TanviStepKey, boolean>;
  createdAt: string | null;
  updatedAt: string | null;
  partner: TanviQuotePartner;
};

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTimestamp(value: unknown) {
  if (!value) return null;
  if (typeof (value as FirestoreTimestampLike)?.toDate === "function") {
    return (value as FirestoreTimestampLike).toDate!();
  }
  if (typeof (value as FirestoreTimestampLike)?.seconds === "number") {
    return new Date((value as FirestoreTimestampLike).seconds! * 1000);
  }
  if (value instanceof Date) return value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timestampIso(value: unknown) {
  return parseTimestamp(value)?.toISOString() || null;
}

function parseDecision(value: unknown): PartnerDecision {
  if (
    value === "accepted" ||
    value === "rejected" ||
    value === "needs_info" ||
    value === "pending"
  ) {
    return value;
  }
  return "pending";
}

function parseProductionStatus(value: unknown): PartnerProductionStatus {
  return typeof value === "string" && value in PARTNER_PRODUCTION_STATUS_LABELS
    ? (value as PartnerProductionStatus)
    : "not_started";
}

function getPartnerName(partnerId: PrintPartnerId, partnerById: Map<string, PrintPartner>) {
  return partnerById.get(partnerId)?.name || formatPartnerNameFromId(partnerId);
}

function getRouteLabel(partnerIds: PrintPartnerId[], partnerById: Map<string, PrintPartner>) {
  const names = normalizePrintPartnerIds(partnerIds)
    .map((partnerId) => partnerById.get(partnerId)?.name || formatPartnerNameFromId(partnerId))
    .filter(Boolean);
  return names.length ? names.join(" + ") : getPrintPartnerRouteLabel(partnerIds);
}

function getRawResponses(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parsePartnerResponse(
  partnerId: PrintPartnerId,
  value: unknown,
  partnerById: Map<string, PrintPartner>
): TanviPartnerResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const price = safeNumber(raw.price, 0);
  const completionDays = safeNumber(raw.completionDays, 0);

  return {
    partnerId,
    partnerName: getPartnerName(partnerId, partnerById),
    requestStatus: parseDecision(raw.requestStatus),
    productionStatus: parseProductionStatus(raw.productionStatus),
    printPlacement: normalizePartnerPrintPlacement(raw.printPlacement),
    completionDays: completionDays > 0 ? completionDays : null,
    price: price > 0 ? price : null,
    comments: safeString(raw.comments),
    missingInformation: safeString(raw.missingInformation),
    respondedAt: timestampIso(raw.respondedAt),
    updatedAt: timestampIso(raw.updatedAt),
  };
}

function parsePartnerAssignment(
  value: unknown,
  partnerById: Map<string, PrintPartner>
): TanviQuotePartner {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      id: null,
      name: "Not routed",
      visibleTo: [],
      visibleLabel: "Not routed",
      lockedBy: null,
      visibleFields: normalizePartnerVisibleFields([]),
      requestStatus: "pending",
      productionStatus: "not_started",
      clientStatus: "not_set",
      printPlacement: "not_set",
      completionDays: null,
      price: null,
      comments: "",
      missingInformation: "",
      assignedAt: null,
      respondedAt: null,
      updatedAt: null,
      responses: [],
    };
  }

  const raw = value as Record<string, unknown>;
  const partnerId = normalizePrintPartnerIds([raw.id])[0] || null;
  const visibleTo = normalizePrintPartnerIds(raw.visibleTo);
  const assignedPartnerIds = visibleTo.length
    ? visibleTo
    : partnerId
      ? [partnerId]
      : [];
  const lockedBy = normalizePrintPartnerIds([raw.lockedBy])[0] || null;
  const responses = Object.entries(getRawResponses(raw.responses))
    .map(([rawPartnerId, response]) => {
      const responsePartnerId = normalizePrintPartnerIds([rawPartnerId])[0];
      return responsePartnerId
        ? parsePartnerResponse(responsePartnerId, response, partnerById)
        : null;
    })
    .filter((response): response is TanviPartnerResponse => Boolean(response));
  const activePartnerId = lockedBy || partnerId;
  const activeResponse =
    (activePartnerId &&
      responses.find((response) => response.partnerId === activePartnerId)) ||
    null;
  const price = safeNumber(raw.price, 0);
  const completionDays = safeNumber(raw.completionDays, 0);
  const routeLabel = getRouteLabel(assignedPartnerIds, partnerById);

  return {
    id: activePartnerId || partnerId,
    name: safeString(raw.name) || (activePartnerId ? getPartnerName(activePartnerId, partnerById) : routeLabel),
    visibleTo: assignedPartnerIds,
    visibleLabel: routeLabel,
    lockedBy,
    visibleFields: normalizePartnerVisibleFields(raw.visibleFields),
    requestStatus: activeResponse?.requestStatus || parseDecision(raw.requestStatus),
    productionStatus: activeResponse?.productionStatus || parseProductionStatus(raw.productionStatus),
    clientStatus: normalizePartnerClientStatus(raw.clientStatus),
    printPlacement:
      activeResponse?.printPlacement && activeResponse.printPlacement !== "not_set"
        ? activeResponse.printPlacement
        : normalizePartnerPrintPlacement(raw.printPlacement),
    completionDays: activeResponse?.completionDays || (completionDays > 0 ? completionDays : null),
    price: activeResponse?.price || (price > 0 ? price : null),
    comments: activeResponse?.comments || safeString(raw.comments),
    missingInformation: activeResponse?.missingInformation || safeString(raw.missingInformation),
    assignedAt: timestampIso(raw.assignedAt),
    respondedAt: activeResponse?.respondedAt || timestampIso(raw.respondedAt),
    updatedAt: activeResponse?.updatedAt || timestampIso(raw.updatedAt),
    responses,
  };
}

function getAttachments(quote: RawQuote) {
  const attachments =
    Array.isArray(quote.attachments) && quote.attachments.length
      ? quote.attachments
      : quote.attachment
        ? [quote.attachment]
        : [];

  return attachments.filter((attachment) =>
    Boolean(
      safeString(attachment?.filename) ||
        safeString(attachment?.label) ||
        safeString(attachment?.description) ||
        safeString(attachment?.url)
    )
  );
}

function getTanviStepChecks(value: unknown): Record<TanviStepKey, boolean> {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return {
    client_onboarding: Boolean(raw.client_onboarding),
    artwork: Boolean(raw.artwork),
    route_prices: Boolean(raw.route_prices),
    client_approval: Boolean(raw.client_approval),
    partner_answer: Boolean(raw.partner_answer),
    print_start: Boolean(raw.print_start),
  };
}

function sanitizeArtwork(attachments: RawAttachment[]): TanviArtworkAttachment[] {
  return attachments.map((attachment, index) => {
    const label = safeString(attachment.label) || safeString(attachment.description);
    return {
      label: label || `Artwork ${index + 1}`,
      description: safeString(attachment.description),
      quantity: safeString(attachment.quantity),
      filename: safeString(attachment.filename) || label || `artwork-${index + 1}`,
      contentType: safeString(attachment.contentType),
      size: safeNumber(attachment.size, 0) > 0 ? safeNumber(attachment.size, 0) : null,
      url: safeString(attachment.url),
    };
  });
}

function getDesignBrief(quote: RawQuote) {
  return quote.designBrief && typeof quote.designBrief === "object" && !Array.isArray(quote.designBrief)
    ? quote.designBrief
    : {};
}

function getGarmentRows(quote: RawQuote) {
  const garments = Array.isArray(quote.garments) ? quote.garments : [];
  return garments
    .filter((entry) => safeNumber(entry.quantity) > 0 || safeString(entry.garment))
    .map((entry) => formatQuoteGarmentDescription(entry));
}

function getPieces(quote: RawQuote, designBrief: Record<string, unknown>) {
  const briefQty = safeNumber(designBrief.totalQty, 0);
  if (briefQty > 0) return briefQty;

  const garments = Array.isArray(quote.garments) ? quote.garments : [];
  const garmentTotal = garments.reduce(
    (sum, entry) => sum + safeNumber(entry.quantity, 0),
    0
  );
  if (garmentTotal > 0) return garmentTotal;

  const quantity = safeNumber(quote.quantity, 0);
  return quantity > 0 ? quantity : null;
}

function getProduct(quote: RawQuote, designBrief: Record<string, unknown>) {
  const briefProduct = safeString(designBrief.product);
  if (briefProduct) return briefProduct;
  const garmentRows = getGarmentRows(quote);
  if (garmentRows.length) return garmentRows[0];
  const firstLine = quote.quote?.lines?.find((line) => safeString(line.description));
  return safeString(firstLine?.description) || "Not set";
}

function getColors(quote: RawQuote, designBrief: Record<string, unknown>) {
  const briefColor = safeString(designBrief.color);
  if (briefColor) return [briefColor];
  return sortQuoteColors(
    (Array.isArray(quote.garments) ? quote.garments : [])
      .map((entry) => safeString(entry.color))
      .filter(Boolean)
  );
}

export function mapTanviQuote(
  id: string,
  data: Record<string, unknown>,
  partners: PrintPartner[]
): TanviQuoteSummary {
  const quote = data as RawQuote;
  const partnerById = new Map(partners.map((partner) => [partner.id, partner]));
  const designBrief = getDesignBrief(quote);
  const attachments = getAttachments(quote);
  const garmentRows = getGarmentRows(quote);
  const total = safeNumber(quote.quote?.total, 0);

  return {
    id,
    code: safeString(quote.quote?.documentNumber) || `Q-${id.slice(-5).toUpperCase()}`,
    status: safeString(quote.status) || "new",
    documentType: safeString(quote.quote?.documentType) || "quotation",
    clientName: safeString(quote.name) || safeString(quote.quote?.clientCompany) || "Client not set",
    clientCompany: safeString(quote.quote?.clientCompany),
    email: safeString(quote.email),
    phone: safeString(quote.phone),
    source: safeString(quote.source) || "Quotation",
    product: getProduct(quote, designBrief),
    garmentSummary: garmentRows.join(", ") || "No garment lines",
    pieces: getPieces(quote, designBrief),
    colors: getColors(quote, designBrief),
    printMethod:
      safeString(designBrief.printMethod) ||
      safeString(quote.printMethod) ||
      "Not set",
    deadline:
      safeString(designBrief.deadline) ||
      safeString(quote.deadline) ||
      "No deadline",
    delivery: safeString(quote.delivery),
    notes:
      safeString(designBrief.clientNotes) ||
      safeString(quote.notes) ||
      safeString(quote.message),
    currency: safeString(quote.quote?.currency) || "Rs",
    total: total > 0 ? total : null,
    artwork: sanitizeArtwork(attachments),
    artworkCount: attachments.length,
    hasOpenArtwork: attachments.some((attachment) => Boolean(safeString(attachment.url))),
    hasEmailOnlyArtwork: attachments.some((attachment) => !safeString(attachment.url)),
    tanviStepChecks: getTanviStepChecks(quote.tanviStepChecks),
    createdAt: timestampIso(quote.createdAt),
    updatedAt: timestampIso(quote.updatedAt),
    partner: parsePartnerAssignment(quote.partner, partnerById),
  };
}
