import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-request";
import { db } from "@/lib/firebase";
import { getPrintPartners } from "@/lib/partner-registry";
import {
  DEFAULT_PARTNER_VISIBLE_FIELDS,
  normalizePartnerClientStatus,
  normalizePartnerPrintPlacement,
  normalizePartnerVisibleFields,
  normalizePrintPartnerIds,
  type PrintPartnerId,
} from "@/lib/partners";
import { mapTanviQuote } from "@/lib/tanvi-quotes";
import {
  isContentLengthWithinLimit,
  isRequestOriginAllowed,
} from "@/lib/request-safety";
import { storePublicUploadBuffer } from "@/lib/public-upload-store";

const MAX_TANVI_UPDATE_BYTES = 16 * 1024 * 1024;
const MAX_TANVI_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_TANVI_LOGO_COUNT = 12;
const TANVI_ALLOWED_LOGO_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/heic",
  "image/heif",
  "application/pdf",
];

type PartnerPriceDraft = {
  price: number | null;
};

type TanviAttachmentDraft = {
  label?: string;
  description?: string;
  quantity?: string | number | null;
  lineId?: string;
  product?: string;
  color?: string;
  size?: string;
  printPlacement?: string;
};

type WhatsappLineDetails = {
  id: string;
  product: string;
  color: string;
  size: string;
  quantity: number | null;
  printPlacement: string;
  frontLogoDescription: string;
  backLogoDescription: string;
};

const TANVI_STEP_KEYS = new Set([
  "client_onboarding",
  "artwork",
  "route_prices",
  "client_approval",
  "partner_answer",
  "print_start",
]);

function safeText(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safePositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getPrintPlacementLabel(value: string) {
  if (value === "back") return "Back printing only";
  if (value === "front_back") return "Front and back printing";
  return "Front printing only";
}

function getWhatsappLineItems(value: unknown): WhatsappLineDetails[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const raw = entry as Record<string, unknown>;
      const product = safeText(raw.product, 160);
      const color = safeText(raw.color, 120);
      const size = safeText(raw.size, 80);
      const quantity = safePositiveNumber(raw.quantity);
      const printPlacement = safeText(raw.printPlacement, 40);
      const normalizedPlacement =
        printPlacement === "back" || printPlacement === "front_back"
          ? printPlacement
          : "front";
      const sharedLogoDescription = safeText(raw.logoDescription, 500);
      const frontLogoDescription = safeText(raw.frontLogoDescription, 500) || sharedLogoDescription;
      const backLogoDescription = safeText(raw.backLogoDescription, 500) || sharedLogoDescription;

      if (!product && !color && !size && !quantity && !frontLogoDescription && !backLogoDescription) return null;

      return {
        id: safeText(raw.id, 80) || `line-${index + 1}`,
        product,
        color,
        size,
        quantity,
        printPlacement: normalizedPlacement,
        frontLogoDescription,
        backLogoDescription,
      };
    })
    .filter((entry): entry is WhatsappLineDetails => Boolean(entry));
}

function getLineSummary(line: WhatsappLineDetails, index: number) {
  const logoDescriptions = [
    line.frontLogoDescription ? `Front: ${line.frontLogoDescription}` : "",
    line.backLogoDescription ? `Back: ${line.backLogoDescription}` : "",
  ].filter(Boolean);
  const rows = [
    line.quantity ? `${line.quantity} pcs` : "",
    line.product || `Item ${index + 1}`,
    line.color,
    line.size ? `Size ${line.size}` : "",
    getPrintPlacementLabel(line.printPlacement),
    logoDescriptions.length ? logoDescriptions.join(" / ") : `Logo ${index + 1}`,
  ].filter(Boolean);
  return rows.join(" - ");
}

function getWhatsappDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const lineItems = getWhatsappLineItems(raw.lineItems);
  const fallbackQuantity = safePositiveNumber(raw.quantity);
  const fallbackLine =
    lineItems.length
      ? []
      : [{
          id: "line-1",
          product: safeText(raw.product, 160),
          color: safeText(raw.color, 120),
          size: "",
          quantity: fallbackQuantity,
          printPlacement: safeText(raw.printMethod, 120).toLowerCase().includes("back") ? "back" : "front",
          frontLogoDescription: safeText(raw.frontLogoDescription, 500),
          backLogoDescription: safeText(raw.backLogoDescription, 500),
        }].filter((line) =>
          line.product ||
          line.color ||
          line.quantity ||
          line.frontLogoDescription ||
          line.backLogoDescription
        );
  const normalizedLineItems = lineItems.length ? lineItems : fallbackLine;
  const totalQty = normalizedLineItems.reduce(
    (sum, line) => sum + (line.quantity || 0),
    0
  );
  const productSummary = normalizedLineItems.length
    ? normalizedLineItems.map((line, index) => getLineSummary(line, index)).join("; ")
    : safeText(raw.product, 160);
  const colorSummary = Array.from(new Set(normalizedLineItems.map((line) => line.color).filter(Boolean))).join(", ");
  const printSummary = Array.from(
    new Set(normalizedLineItems.map((line) => getPrintPlacementLabel(line.printPlacement)))
  ).join(", ");

  return {
    clientName: safeText(raw.clientName, 120),
    phone: safeText(raw.phone, 80),
    email: safeText(raw.email, 160),
    product: productSummary,
    quantity: totalQty || fallbackQuantity,
    color: colorSummary || safeText(raw.color, 120),
    printMethod: printSummary || safeText(raw.printMethod, 120),
    deadline: safeText(raw.deadline, 120),
    total: safePositiveNumber(raw.total),
    notes: safeText(raw.notes, 2_000),
    frontLogoDescription:
      safeText(raw.frontLogoDescription, 500) ||
      normalizedLineItems.find((line) => line.frontLogoDescription)?.frontLogoDescription ||
      "",
    backLogoDescription:
      safeText(raw.backLogoDescription, 500) ||
      normalizedLineItems.find((line) => line.backLogoDescription)?.backLogoDescription ||
      "",
    lineItems: normalizedLineItems,
  };
}

function parseJsonObject(value: unknown) {
  if (!value || typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseAttachmentDrafts(value: unknown): TanviAttachmentDraft[] {
  if (!value || typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === "object") : [];
  } catch {
    return [];
  }
}

async function parseTanviUpdateRequest(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    const body = await req.json().catch(() => ({}));
    return {
      body,
      files: [] as File[],
      attachmentDrafts: [] as TanviAttachmentDraft[],
    };
  }

  const formData = await req.formData();
  return {
    body: {
      whatsappDetails: parseJsonObject(formData.get("whatsappDetails")),
    },
    files: formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0),
    attachmentDrafts: parseAttachmentDrafts(formData.get("attachments")),
  };
}

async function storeWhatsappAttachments(files: File[], drafts: TanviAttachmentDraft[]) {
  if (files.length > MAX_TANVI_LOGO_COUNT) {
    throw new Error("Upload up to 12 logo files per WhatsApp order.");
  }

  const uploadSessionId = `tanvi-whatsapp-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;

  return Promise.all(
    files.map(async (file, index) => {
      if (!TANVI_ALLOWED_LOGO_TYPES.includes(file.type || "")) {
        throw new Error("Unsupported logo type. Use PNG, JPG, WEBP, SVG, HEIC, or PDF.");
      }
      if (file.size > MAX_TANVI_LOGO_BYTES) {
        throw new Error("Logo is too large. Keep each file under 5MB.");
      }

      const draft = drafts[index] || {};
      const upload = await storePublicUploadBuffer({
        buffer: Buffer.from(await file.arrayBuffer()),
        filename: file.name || `logo-${index + 1}`,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        sessionId: uploadSessionId,
        sessionPrefix: "tanvi-whatsapp",
        source: "tanvi-whatsapp-upload",
        maxUploadBytes: MAX_TANVI_LOGO_BYTES,
      });

      return {
        label: safeText(draft.label, 80) || `Logo ${index + 1}`,
        description: [
          safeText(draft.description, 500),
          safeText(draft.product, 120),
          safeText(draft.color, 80),
          safeText(draft.size, 40) ? `Size ${safeText(draft.size, 40)}` : "",
          safeText(draft.printPlacement, 40)
            ? getPrintPlacementLabel(safeText(draft.printPlacement, 40))
            : "",
        ].filter(Boolean).join(" - "),
        quantity: safeText(draft.quantity, 80),
        lineId: safeText(draft.lineId, 80),
        printPlacement: safeText(draft.printPlacement, 40),
        url: upload.url,
        filename: upload.filename,
        contentType: upload.contentType,
        size: upload.size,
      };
    })
  );
}

function mergeWhatsappAttachments(currentValue: unknown, nextAttachments: Awaited<ReturnType<typeof storeWhatsappAttachments>>) {
  const currentAttachments = Array.isArray(currentValue)
    ? currentValue.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
    : [];
  const replacedLineIds = new Set(nextAttachments.map((attachment) => attachment.lineId).filter(Boolean));
  const replacedLabels = new Set(nextAttachments.map((attachment) => attachment.label.toLowerCase()));

  return [
    ...currentAttachments.filter((attachment) => {
      const lineId = safeText(attachment.lineId, 80);
      if (lineId && replacedLineIds.has(lineId)) return false;
      const label = safeText(attachment.label, 80).toLowerCase();
      return !replacedLabels.has(label);
    }),
    ...nextAttachments,
  ];
}

function getCurrentPartnerIds(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const raw = value as Record<string, unknown>;
  const visibleTo = normalizePrintPartnerIds(raw.visibleTo);
  if (visibleTo.length) return visibleTo;
  return normalizePrintPartnerIds([raw.id]);
}

function arePartnerRoutesSame(left: PrintPartnerId[], right: PrintPartnerId[]) {
  return left.length === right.length && left.every((partnerId) => right.includes(partnerId));
}

function getPartnerPriceDrafts(value: unknown, allowedPartnerIds: Set<string>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return new Map<PrintPartnerId, PartnerPriceDraft>();
  }

  const drafts = new Map<PrintPartnerId, PartnerPriceDraft>();
  Object.entries(value as Record<string, unknown>).forEach(([rawPartnerId, rawDraft]) => {
    const partnerId = normalizePrintPartnerIds([rawPartnerId])[0];
    if (!partnerId || !allowedPartnerIds.has(partnerId)) return;
    if (!rawDraft || typeof rawDraft !== "object" || Array.isArray(rawDraft)) return;
    const price = Number((rawDraft as Record<string, unknown>).price);
    drafts.set(partnerId, {
      price: Number.isFinite(price) && price > 0 ? price : null,
    });
  });

  return drafts;
}

function getTanviStepCheckUpdates(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return new Map<string, boolean>();
  }

  const updates = new Map<string, boolean>();
  Object.entries(value as Record<string, unknown>).forEach(([key, checked]) => {
    if (!TANVI_STEP_KEYS.has(key)) return;
    if (typeof checked !== "boolean") return;
    updates.set(key, checked);
  });

  return updates;
}

function getCurrentPartnerResponse(currentPartner: unknown, partnerId: PrintPartnerId) {
  if (!currentPartner || typeof currentPartner !== "object" || Array.isArray(currentPartner)) {
    return {};
  }
  const responses = (currentPartner as Record<string, unknown>).responses;
  if (!responses || typeof responses !== "object" || Array.isArray(responses)) {
    return {};
  }
  const response = (responses as Record<string, unknown>)[partnerId];
  return response && typeof response === "object" && !Array.isArray(response)
    ? (response as Record<string, unknown>)
    : {};
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isRequestOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  if (!isContentLengthWithinLimit(req.headers, MAX_TANVI_UPDATE_BYTES)) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  if (!(await isAdminRequest("/api/admin/tanvi/quotes"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing quote id." }, { status: 400 });
  }

  const { body, files, attachmentDrafts } = await parseTanviUpdateRequest(req);
  const quoteRef = doc(db, "quotes", id);
  const quoteSnap = await getDoc(quoteRef);
  if (!quoteSnap.exists()) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }

  try {
    const allPartners = await getPrintPartners({ includeInactive: true });
    const activePartners = allPartners.filter((partner) => partner.active);
    const activeById = new Map(activePartners.map((partner) => [partner.id, partner]));
    const activeIds = new Set(activePartners.map((partner) => partner.id));
    const currentData = quoteSnap.data() as Record<string, unknown>;
    const currentPartner = currentData.partner;
    const routePartnerIds = normalizePrintPartnerIds(body?.partnerIds).filter((partnerId) =>
      activeById.has(partnerId)
    );
    const partnerPriceDrafts = getPartnerPriceDrafts(body?.partnerPrices, activeIds);
    const stepCheckUpdates = getTanviStepCheckUpdates(body?.tanviStepChecks);
    const whatsappDetails = getWhatsappDetails(body?.whatsappDetails);
    const uploadedWhatsappAttachments = await storeWhatsappAttachments(files, attachmentDrafts);
    const nextClientStatus =
      body?.clientStatus === undefined
        ? null
        : normalizePartnerClientStatus(body.clientStatus);
    const updatePayload: Record<string, unknown> = {
      "partner.updatedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (routePartnerIds.length) {
      const currentPartnerIds = getCurrentPartnerIds(currentPartner);
      const sameRoute = arePartnerRoutesSame(currentPartnerIds, routePartnerIds);
      const singlePartner =
        routePartnerIds.length === 1 ? activeById.get(routePartnerIds[0]) : null;
      const routeLabel = routePartnerIds
        .map((partnerId) => activeById.get(partnerId)?.name)
        .filter(Boolean)
        .join(" + ");
      const visibleFields = normalizePartnerVisibleFields(
        body?.visibleFields || DEFAULT_PARTNER_VISIBLE_FIELDS
      );
      const printPlacement = normalizePartnerPrintPlacement(body?.printPlacement);

      updatePayload["partner.id"] = singlePartner?.id || null;
      updatePayload["partner.name"] = singlePartner?.name || routeLabel;
      updatePayload["partner.visibleTo"] = routePartnerIds;
      updatePayload["partner.lockedBy"] = null;
      updatePayload["partner.visibleFields"] = visibleFields;
      updatePayload["partner.printPlacement"] = printPlacement;

      if (!sameRoute) {
        updatePayload["partner.assignedAt"] = serverTimestamp();
        updatePayload["partner.requestStatus"] = "pending";
        updatePayload["partner.productionStatus"] = "not_started";
        updatePayload["partner.clientStatus"] = nextClientStatus || "not_set";
        updatePayload["partner.completionDays"] = null;
        updatePayload["partner.price"] = null;
        updatePayload["partner.comments"] = "";
        updatePayload["partner.missingInformation"] = "";
        updatePayload["partner.respondedAt"] = null;
        updatePayload["partner.responses"] = {};
      }
    }

    if (nextClientStatus) {
      updatePayload["partner.clientStatus"] = nextClientStatus;
    }

    partnerPriceDrafts.forEach((draft, partnerId) => {
      const partner = activeById.get(partnerId);
      if (!partner) return;
      const currentResponse = getCurrentPartnerResponse(currentPartner, partnerId);
      updatePayload[`partner.responses.${partnerId}.partnerId`] = partnerId;
      updatePayload[`partner.responses.${partnerId}.partnerName`] = partner.name;
      updatePayload[`partner.responses.${partnerId}.requestStatus`] =
        currentResponse.requestStatus || "pending";
      updatePayload[`partner.responses.${partnerId}.productionStatus`] =
        currentResponse.productionStatus || "not_started";
      updatePayload[`partner.responses.${partnerId}.printPlacement`] =
        currentResponse.printPlacement || normalizePartnerPrintPlacement(body?.printPlacement);
      updatePayload[`partner.responses.${partnerId}.managerPrice`] = draft.price;
      updatePayload[`partner.responses.${partnerId}.price`] = draft.price;
      updatePayload[`partner.responses.${partnerId}.updatedAt`] = serverTimestamp();
      updatePayload[`partner.responses.${partnerId}.comments`] = currentResponse.comments || "";
      updatePayload[`partner.responses.${partnerId}.missingInformation`] =
        currentResponse.missingInformation || "";
    });

    if (partnerPriceDrafts.size === 1) {
      const firstDraft = Array.from(partnerPriceDrafts.values())[0];
      updatePayload["partner.managerPrice"] = firstDraft.price;
      updatePayload["partner.price"] = firstDraft.price;
    }

    stepCheckUpdates.forEach((checked, key) => {
      updatePayload[`tanviStepChecks.${key}`] = checked;
    });

    if (whatsappDetails) {
      const garmentLines = whatsappDetails.lineItems.length
        ? whatsappDetails.lineItems.map((line) => ({
            garment: line.product || "WhatsApp order",
            color: line.color,
            size: line.size,
            quantity: line.quantity || 1,
          }))
        : [
            {
              garment: whatsappDetails.product || "WhatsApp order",
              color: whatsappDetails.color,
              size: "",
              quantity: whatsappDetails.quantity || 1,
            },
          ];
      const quoteLines = whatsappDetails.lineItems.length
        ? whatsappDetails.lineItems.map((line, index) => ({
            description: getLineSummary(line, index),
            quantity: line.quantity || 1,
            unitPrice: "",
          }))
        : [
            {
              description: whatsappDetails.product || "WhatsApp order",
              quantity: whatsappDetails.quantity || 1,
              unitPrice: "",
            },
          ];

      updatePayload.name = whatsappDetails.clientName || "WhatsApp client";
      updatePayload.phone = whatsappDetails.phone;
      updatePayload.email = whatsappDetails.email;
      updatePayload.source = "WhatsApp";
      updatePayload.quantity = whatsappDetails.quantity || "";
      updatePayload.printMethod = whatsappDetails.printMethod;
      updatePayload.deadline = whatsappDetails.deadline;
      updatePayload.notes = whatsappDetails.notes;
      updatePayload.message = whatsappDetails.notes || "Updated from Tanvi WhatsApp intake";
      updatePayload.garments = garmentLines;
      updatePayload["designBrief.product"] = whatsappDetails.product;
      updatePayload["designBrief.color"] = whatsappDetails.color;
      updatePayload["designBrief.totalQty"] = whatsappDetails.quantity || "";
      updatePayload["designBrief.printMethod"] = whatsappDetails.printMethod;
      updatePayload["designBrief.deadline"] = whatsappDetails.deadline;
      updatePayload["designBrief.clientNotes"] = whatsappDetails.notes;
      updatePayload["designBrief.lineItems"] = whatsappDetails.lineItems;
      updatePayload["designBrief.frontLogo"] = whatsappDetails.lineItems.some(
        (line) => line.printPlacement === "front" || line.printPlacement === "front_back"
      );
      updatePayload["designBrief.backLogo"] = whatsappDetails.lineItems.some(
        (line) => line.printPlacement === "back" || line.printPlacement === "front_back"
      );
      updatePayload["designBrief.frontLogoDescription"] = whatsappDetails.frontLogoDescription;
      updatePayload["designBrief.backLogoDescription"] = whatsappDetails.backLogoDescription;
      updatePayload["quote.total"] = whatsappDetails.total || 0;
      updatePayload["quote.currency"] = "Rs";
      updatePayload["quote.lines"] = quoteLines;
    }

    if (uploadedWhatsappAttachments.length) {
      const nextAttachments = mergeWhatsappAttachments(
        currentData.attachments,
        uploadedWhatsappAttachments
      );
      updatePayload.attachments = nextAttachments;
      updatePayload.attachment = nextAttachments[0] || null;
    }

    await updateDoc(quoteRef, updatePayload);
    const updatedSnap = await getDoc(quoteRef);

    return NextResponse.json({
      quote: mapTanviQuote(id, updatedSnap.data() || {}, allPartners),
    });
  } catch (error) {
    console.error("tanvi:quote:update", error);
    return NextResponse.json(
      { error: "Failed to update Tanvi desk." },
      { status: 500 }
    );
  }
}
