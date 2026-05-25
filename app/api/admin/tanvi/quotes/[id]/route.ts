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

const MAX_TANVI_UPDATE_BYTES = 12_288;

type PartnerPriceDraft = {
  price: number | null;
};

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

  const body = await req.json().catch(() => ({}));
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
      updatePayload[`partner.responses.${partnerId}.price`] = draft.price;
      updatePayload[`partner.responses.${partnerId}.updatedAt`] = serverTimestamp();
      updatePayload[`partner.responses.${partnerId}.comments`] = currentResponse.comments || "";
      updatePayload[`partner.responses.${partnerId}.missingInformation`] =
        currentResponse.missingInformation || "";
    });

    if (partnerPriceDrafts.size === 1) {
      const firstDraft = Array.from(partnerPriceDrafts.values())[0];
      updatePayload["partner.price"] = firstDraft.price;
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
