import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getPrintPartnerById } from "@/lib/partner-registry";
import {
  getPrintPartner,
  inferPartnerPrintPlacementFromText,
  isPrintPartnerId,
  normalizePartnerClientStatus,
  normalizePartnerPrintPlacement,
  normalizePrintPartnerIds,
  normalizePartnerVisibleFields,
  PARTNER_PRINT_PLACEMENT_LABELS,
  PARTNER_PRODUCTION_STATUSES,
  type PartnerDecision,
  type PartnerClientStatus,
  type PartnerOrderAttachment,
  type PartnerOrderDetails,
  type PartnerPrintPlacement,
  type PartnerPrintPlacementSource,
  type PartnerOrderView,
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

type QuoteAttachment = {
  label?: string;
  description?: string;
  quantity?: string | number | null;
  filename?: string;
  contentType?: string;
  size?: number | null;
  url?: string;
};

type QuoteLine = {
  description?: string;
  quantity?: number | string;
};

type DesignBrief = {
  product?: string;
  color?: string;
  printMethod?: string;
  frontText?: string;
  backText?: string;
  frontLogo?: boolean;
  backLogo?: boolean;
  selectedSizes?: { size?: string; quantity?: number }[];
  totalQty?: number;
  rush?: boolean;
  delivery?: string;
  deadline?: string;
  clientNotes?: string;
};

type RawPartnerAssignment = {
  id?: unknown;
  name?: unknown;
  visibleTo?: unknown;
  lockedBy?: unknown;
  visibleFields?: unknown;
  requestStatus?: unknown;
  productionStatus?: unknown;
  clientStatus?: unknown;
  completionDays?: unknown;
  managerPrice?: unknown;
  price?: unknown;
  comments?: unknown;
  missingInformation?: unknown;
  printPlacement?: unknown;
  assignedAt?: unknown;
  respondedAt?: unknown;
  updatedAt?: unknown;
  responses?: unknown;
};

type RawQuote = {
  garments?: QuoteGarmentLine[];
  printMethod?: string;
  deadline?: string;
  notes?: string;
  message?: string;
  delivery?: string;
  designBrief?: Record<string, unknown> | null;
  attachment?: QuoteAttachment | null;
  attachments?: QuoteAttachment[];
  partner?: RawPartnerAssignment | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  quote?: {
    documentNumber?: string;
    lines?: QuoteLine[];
  };
};

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

function timestampMillis(value: string | null) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function normalizeDesignText(value: unknown) {
  const text = safeString(value);
  if (!text) return "";
  const lower = text.toLowerCase();
  if (lower === "off" || lower === "none" || lower === "n/a") return "";
  return text;
}

function parseDesignBrief(value: unknown): DesignBrief | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const selectedSizes = Array.isArray(raw.selectedSizes)
    ? raw.selectedSizes
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return { size: "", quantity: 0 };
          }
          const entry = item as Record<string, unknown>;
          return {
            size: safeString(entry.size),
            quantity: safeNumber(entry.quantity, 0),
          };
        })
        .filter((item) => item.size && item.quantity > 0)
    : [];

  return {
    product: safeString(raw.product),
    color: safeString(raw.color),
    printMethod: safeString(raw.printMethod),
    frontText: normalizeDesignText(raw.frontText),
    backText: normalizeDesignText(raw.backText),
    frontLogo: Boolean(raw.frontLogo),
    backLogo: Boolean(raw.backLogo),
    selectedSizes,
    totalQty: safeNumber(raw.totalQty, 0),
    rush: Boolean(raw.rush),
    delivery: safeString(raw.delivery),
    deadline: safeString(raw.deadline),
    clientNotes: safeString(raw.clientNotes),
  };
}

function getQuoteAttachments(quote: RawQuote) {
  if (Array.isArray(quote.attachments) && quote.attachments.length) {
    return quote.attachments.filter((entry) =>
      Boolean(entry?.filename || entry?.url || entry?.label || entry?.description)
    );
  }
  return quote.attachment ? [quote.attachment] : [];
}

function formatSizeRows(sizes: { size?: string; quantity?: number }[]) {
  return sizes
    .filter((entry) => entry.size && safeNumber(entry.quantity, 0) > 0)
    .map((entry) => `${entry.size} x ${safeNumber(entry.quantity, 0)}`);
}

function getClientNotes(quote: RawQuote, designBrief: DesignBrief | null) {
  if (designBrief?.clientNotes?.trim()) return designBrief.clientNotes.trim();
  if (designBrief) return "";
  const raw = (quote.notes || quote.message || "").trim();
  if (!raw) return "";
  const marker = raw.match(/Client notes:\s*([\s\S]*)$/i);
  if (marker?.[1]?.trim()) return marker[1].trim();
  return raw;
}

function inferPrintPlacement(data: RawQuote, designBrief: DesignBrief | null) {
  const frontRequested = Boolean(
    designBrief?.frontLogo || designBrief?.frontText
  );
  const backRequested = Boolean(designBrief?.backLogo || designBrief?.backText);
  const briefPlacement = inferPartnerPrintPlacementFromText(
    [
      designBrief?.frontText || "",
      designBrief?.backText || "",
      designBrief?.clientNotes || "",
    ].join(" "),
    { front: frontRequested, back: backRequested }
  );

  if (briefPlacement !== "not_set") {
    return {
      placement: briefPlacement,
      source: "client" as PartnerPrintPlacementSource,
    };
  }

  const quotePlacement = inferPartnerPrintPlacementFromText(
    [
      data.printMethod || "",
      data.notes || "",
      data.message || "",
      ...(data.quote?.lines || []).map((line) => line.description || ""),
      ...getQuoteAttachments(data).map((attachment) =>
        [
          attachment.label || "",
          attachment.description || "",
          attachment.filename || "",
        ].join(" ")
      ),
    ].join(" ")
  );

  return {
    placement: quotePlacement,
    source:
      quotePlacement === "not_set"
        ? ("unset" as PartnerPrintPlacementSource)
        : ("admin" as PartnerPrintPlacementSource),
  };
}

function hasVisibleField(fields: PartnerVisibleField[], field: PartnerVisibleField) {
  return fields.includes(field);
}

function normalizeDecision(value: unknown): PartnerDecision {
  if (value === "accepted" || value === "rejected" || value === "needs_info") {
    return value;
  }
  return "pending";
}

function normalizeProductionStatus(value: unknown): PartnerProductionStatus {
  if (
    typeof value === "string" &&
    PARTNER_PRODUCTION_STATUSES.includes(value as PartnerProductionStatus)
  ) {
    return value as PartnerProductionStatus;
  }
  return "not_started";
}

function normalizeClientStatus(value: unknown): PartnerClientStatus {
  return normalizePartnerClientStatus(value);
}

function getAssignedPartnerIds(partner: RawPartnerAssignment) {
  const visibleTo = normalizePrintPartnerIds(partner.visibleTo);
  if (visibleTo.length) return visibleTo;
  return isPrintPartnerId(partner.id) ? [partner.id] : [];
}

function getLockedPartnerId(partner: RawPartnerAssignment) {
  return isPrintPartnerId(partner.lockedBy) ? partner.lockedBy : null;
}

function getPartnerResponses(partner: RawPartnerAssignment) {
  if (!partner.responses || typeof partner.responses !== "object" || Array.isArray(partner.responses)) {
    return {};
  }
  return partner.responses as Record<string, RawPartnerAssignment>;
}

function getPartnerResponse(partner: RawPartnerAssignment, partnerId: PrintPartnerId) {
  const responses = getPartnerResponses(partner);
  const response = responses[partnerId];
  return response && typeof response === "object" && !Array.isArray(response)
    ? response
    : null;
}

function getResponseValue(
  partner: RawPartnerAssignment,
  response: RawPartnerAssignment | null,
  key: keyof RawPartnerAssignment
) {
  if (response && Object.prototype.hasOwnProperty.call(response, key)) {
    return response[key];
  }
  return partner[key];
}

function canPartnerReadAssignment(partner: RawPartnerAssignment, partnerId: PrintPartnerId) {
  const assignedPartnerIds = getAssignedPartnerIds(partner);
  const lockedBy = getLockedPartnerId(partner);

  if (lockedBy && lockedBy !== partnerId) return false;
  return assignedPartnerIds.includes(partnerId);
}

function attachmentHasContent(attachment: QuoteAttachment) {
  return Boolean(
    attachment.url ||
      attachment.filename ||
      attachment.label ||
      attachment.description
  );
}

function sanitizeAttachments(attachments: QuoteAttachment[]) {
  const visibleAttachments = attachments.filter(attachmentHasContent);
  const openableAttachments = visibleAttachments.filter((attachment) =>
    Boolean(attachment.url)
  );
  const partnerAttachments = openableAttachments.length
    ? openableAttachments
    : visibleAttachments;

  return partnerAttachments
    .map((attachment, index) => {
      return {
        label: attachment.label || attachment.description || `Artwork ${index + 1}`,
        filename: attachment.filename || `artwork-${index + 1}`,
        contentType: attachment.contentType || "",
        ...(attachment.url ? { url: attachment.url } : {}),
        quantity:
          attachment.quantity === undefined || attachment.quantity === null
            ? undefined
            : String(attachment.quantity),
      } satisfies PartnerOrderAttachment;
    });
}

export function sanitizePartnerOrder(
  id: string,
  data: RawQuote,
  partnerId: PrintPartnerId,
  partnerConfigOverride?: PrintPartner | null
): PartnerOrderView | null {
  const partner = data.partner || {};
  if (!canPartnerReadAssignment(partner, partnerId)) return null;

  const assignedPartnerIds = getAssignedPartnerIds(partner);
  const lockedBy = getLockedPartnerId(partner);
  const partnerResponse = getPartnerResponse(partner, partnerId);
  const partnerConfig = partnerConfigOverride || getPrintPartner(partnerId);
  const visibleFields = normalizePartnerVisibleFields(partner.visibleFields);
  const designBrief = parseDesignBrief(data.designBrief);
  const responsePrintPlacement = normalizePartnerPrintPlacement(
    partnerResponse?.printPlacement
  );
  const adminPrintPlacement = normalizePartnerPrintPlacement(partner.printPlacement);
  const inferredPrintPlacement = inferPrintPlacement(data, designBrief);
  let printPlacement: PartnerPrintPlacement = inferredPrintPlacement.placement;
  let printPlacementSource: PartnerPrintPlacementSource = inferredPrintPlacement.source;

  if (adminPrintPlacement !== "not_set") {
    printPlacement = adminPrintPlacement;
    printPlacementSource = "admin";
  }

  if (responsePrintPlacement !== "not_set") {
    printPlacement = responsePrintPlacement;
    printPlacementSource = "partner";
  }

  const garments = Array.isArray(data.garments) ? data.garments : [];
  const quoteLines = Array.isArray(data.quote?.lines) ? data.quote?.lines || [] : [];
  const garmentRows = garments
    .filter((entry) => safeNumber(entry.quantity, 0) > 0 || safeString(entry.garment))
    .map((entry) => formatQuoteGarmentDescription(entry));
  const fallbackLineRows = quoteLines
    .filter((line) => safeString(line.description))
    .map((line) => {
      const quantity = safeNumber(line.quantity, 0);
      return quantity > 0
        ? `${safeString(line.description)} x ${quantity}`
        : safeString(line.description);
    });
  const sizeRows = designBrief?.selectedSizes?.length
    ? formatSizeRows(designBrief.selectedSizes)
    : garments
        .filter((entry) => safeString(entry.size) || safeNumber(entry.quantity, 0) > 0)
        .map((entry) => {
          const size = safeString(entry.size) || "Size n/a";
          const quantity = safeNumber(entry.quantity, 0);
          return quantity > 0 ? `${size} x ${quantity}` : size;
        });
  const colors = designBrief?.color
    ? [designBrief.color]
    : sortQuoteColors(garments.map((entry) => safeString(entry.color)).filter(Boolean));
  const designRows: string[] = [];
  if (printPlacement !== "not_set") {
    designRows.push(`Print placement: ${PARTNER_PRINT_PLACEMENT_LABELS[printPlacement]}`);
  }
  if (designBrief?.frontText) designRows.push(`Front text: ${designBrief.frontText}`);
  if (designBrief?.backText) designRows.push(`Back text: ${designBrief.backText}`);
  if (designBrief?.frontLogo) designRows.push("Front logo");
  if (designBrief?.backLogo) designRows.push("Back logo");
  if (designBrief?.rush) designRows.push("Rush order");

  const details: PartnerOrderDetails = {};
  if (hasVisibleField(visibleFields, "artwork")) {
    details.artwork = sanitizeAttachments(getQuoteAttachments(data));
  }
  if (hasVisibleField(visibleFields, "garments")) {
    details.garments = garmentRows.length ? garmentRows : fallbackLineRows;
  }
  if (hasVisibleField(visibleFields, "sizes")) {
    details.sizes = sizeRows;
  }
  if (hasVisibleField(visibleFields, "colors")) {
    details.colors = colors;
  }
  if (hasVisibleField(visibleFields, "print")) {
    details.print = designBrief?.printMethod || data.printMethod || "";
  }
  if (hasVisibleField(visibleFields, "deadline")) {
    details.deadline = designBrief?.deadline || data.deadline || "";
  }
  if (hasVisibleField(visibleFields, "design")) {
    details.design = designRows;
  }
  if (hasVisibleField(visibleFields, "notes")) {
    details.notes = getClientNotes(data, designBrief);
  }
  if (hasVisibleField(visibleFields, "delivery")) {
    details.delivery = designBrief?.delivery || data.delivery || "";
  }

  const piecesFromBrief = safeNumber(designBrief?.totalQty, 0);
  const piecesFromGarments = garments.reduce(
    (sum, entry) => sum + safeNumber(entry.quantity, 0),
    0
  );
  const product =
    (hasVisibleField(visibleFields, "garments") &&
      (designBrief?.product || safeString(garments[0]?.garment) || fallbackLineRows[0])) ||
    "";
  const print =
    (hasVisibleField(visibleFields, "print") &&
      (designBrief?.printMethod || data.printMethod || "")) ||
    "";
  const deadline =
    (hasVisibleField(visibleFields, "deadline") &&
      (designBrief?.deadline || data.deadline || "")) ||
    "";
  const rawManagerPrice = safeNumber(
    getResponseValue(partner, partnerResponse, "managerPrice"),
    0
  );
  const rawPrice = safeNumber(getResponseValue(partner, partnerResponse, "price"), 0);
  const decision = normalizeDecision(getResponseValue(partner, partnerResponse, "requestStatus"));
  const managerPrice =
    rawManagerPrice > 0 ? rawManagerPrice : decision === "pending" && rawPrice > 0 ? rawPrice : null;

  return {
    id,
    code: data.quote?.documentNumber || `Q-${id.slice(-5).toUpperCase()}`,
    partnerId,
    partnerName: partnerConfig.name,
    assignedPartnerIds,
    lockedBy,
    isShared: assignedPartnerIds.length > 1 && !lockedBy,
    visibleFields,
    assignedAt: timestampIso(partner.assignedAt),
    createdAt: timestampIso(data.createdAt),
    updatedAt:
      timestampIso(getResponseValue(partner, partnerResponse, "updatedAt")) ||
      timestampIso(partner.updatedAt) ||
      timestampIso(data.updatedAt),
    decision,
    productionStatus: normalizeProductionStatus(
      getResponseValue(partner, partnerResponse, "productionStatus")
    ),
    clientStatus: normalizeClientStatus(partner.clientStatus),
    printPlacement,
    printPlacementSource,
    completionDays: safeNumber(getResponseValue(partner, partnerResponse, "completionDays"), 0) > 0
      ? safeNumber(getResponseValue(partner, partnerResponse, "completionDays"), 0)
      : null,
    managerPrice,
    price: rawPrice > 0
      ? rawPrice
      : null,
    comments: safeString(getResponseValue(partner, partnerResponse, "comments")),
    missingInformation: safeString(
      getResponseValue(partner, partnerResponse, "missingInformation")
    ),
    details,
    summary: {
      product,
      pieces:
        hasVisibleField(visibleFields, "sizes") || hasVisibleField(visibleFields, "garments")
          ? piecesFromBrief || piecesFromGarments || null
          : null,
      deadline,
      print,
    },
  } satisfies PartnerOrderView;
}

export async function listPartnerOrders(partnerId: PrintPartnerId) {
  const partnerConfig = await getPrintPartnerById(partnerId);
  const [legacySnap, visibleSnap] = await Promise.all([
    getDocs(query(collection(db, "quotes"), where("partner.id", "==", partnerId))),
    getDocs(
      query(collection(db, "quotes"), where("partner.visibleTo", "array-contains", partnerId))
    ),
  ]);
  const docsById = new Map<string, (typeof legacySnap.docs)[number]>();
  [...legacySnap.docs, ...visibleSnap.docs].forEach((docSnap) => {
    docsById.set(docSnap.id, docSnap);
  });

  return [...docsById.values()]
    .map((docSnap) =>
      sanitizePartnerOrder(
        docSnap.id,
        docSnap.data() as RawQuote,
        partnerId,
        partnerConfig
      )
    )
    .filter((entry): entry is PartnerOrderView => Boolean(entry))
    .sort((left, right) => {
      const leftDate = timestampMillis(left.assignedAt || left.createdAt || left.updatedAt);
      const rightDate = timestampMillis(right.assignedAt || right.createdAt || right.updatedAt);
      return rightDate - leftDate;
    });
}

export async function readRawPartnerQuote(
  partnerId: PrintPartnerId,
  quoteId: string
) {
  const snap = await getDoc(doc(db, "quotes", quoteId));
  if (!snap.exists()) return null;

  const data = snap.data() as RawQuote;
  if (!data.partner || !canPartnerReadAssignment(data.partner, partnerId)) return null;
  const partnerConfig = await getPrintPartnerById(partnerId);

  return {
    ref: snap.ref,
    data,
    view: sanitizePartnerOrder(snap.id, data, partnerId, partnerConfig),
  };
}
