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
const MAX_TANVI_LOGO_COUNT = 2;
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
  side?: string;
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

function getWhatsappDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  return {
    clientName: safeText(raw.clientName, 120),
    phone: safeText(raw.phone, 80),
    email: safeText(raw.email, 160),
    product: safeText(raw.product, 160),
    quantity: safePositiveNumber(raw.quantity),
    color: safeText(raw.color, 120),
    printMethod: safeText(raw.printMethod, 120),
    deadline: safeText(raw.deadline, 120),
    total: safePositiveNumber(raw.total),
    notes: safeText(raw.notes, 2_000),
    frontLogoDescription: safeText(raw.frontLogoDescription, 500),
    backLogoDescription: safeText(raw.backLogoDescription, 500),
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
    throw new Error("Upload front logo, back logo, or both only.");
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
        label: safeText(draft.label, 80) || (draft.side === "back" ? "Back logo" : "Front logo"),
        description: safeText(draft.description, 500),
        quantity: safeText(draft.quantity, 80),
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
  const replacedLabels = new Set(nextAttachments.map((attachment) => attachment.label.toLowerCase()));

  return [
    ...currentAttachments.filter((attachment) => {
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
      updatePayload.name = whatsappDetails.clientName || "WhatsApp client";
      updatePayload.phone = whatsappDetails.phone;
      updatePayload.email = whatsappDetails.email;
      updatePayload.source = "WhatsApp";
      updatePayload.quantity = whatsappDetails.quantity || "";
      updatePayload.printMethod = whatsappDetails.printMethod;
      updatePayload.deadline = whatsappDetails.deadline;
      updatePayload.notes = whatsappDetails.notes;
      updatePayload.message = whatsappDetails.notes || "Updated from Tanvi WhatsApp intake";
      updatePayload.garments = [
        {
          garment: whatsappDetails.product || "WhatsApp order",
          color: whatsappDetails.color,
          size: "",
          quantity: whatsappDetails.quantity || 1,
        },
      ];
      updatePayload["designBrief.product"] = whatsappDetails.product;
      updatePayload["designBrief.color"] = whatsappDetails.color;
      updatePayload["designBrief.totalQty"] = whatsappDetails.quantity || "";
      updatePayload["designBrief.printMethod"] = whatsappDetails.printMethod;
      updatePayload["designBrief.deadline"] = whatsappDetails.deadline;
      updatePayload["designBrief.clientNotes"] = whatsappDetails.notes;
      updatePayload["designBrief.frontLogoDescription"] = whatsappDetails.frontLogoDescription;
      updatePayload["designBrief.backLogoDescription"] = whatsappDetails.backLogoDescription;
      updatePayload["quote.total"] = whatsappDetails.total || 0;
      updatePayload["quote.currency"] = "Rs";
      updatePayload["quote.lines"] = [
        {
          description: whatsappDetails.product || "WhatsApp order",
          quantity: whatsappDetails.quantity || 1,
          unitPrice: "",
        },
      ];
    }

    if (uploadedWhatsappAttachments.length) {
      const nextAttachments = mergeWhatsappAttachments(
        currentData.attachments,
        uploadedWhatsappAttachments
      );
      updatePayload.attachments = nextAttachments;
      updatePayload.attachment = nextAttachments[0] || null;
      updatePayload["designBrief.frontLogo"] = nextAttachments.some(
        (attachment) => safeText(attachment.label, 80).toLowerCase() === "front logo"
      );
      updatePayload["designBrief.backLogo"] = nextAttachments.some(
        (attachment) => safeText(attachment.label, 80).toLowerCase() === "back logo"
      );
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
