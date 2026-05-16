import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { serverTimestamp, updateDoc } from "firebase/firestore";
import { readAdminSession } from "@/lib/admin-auth";
import { readPartnerSession } from "@/lib/partner-auth";
import { readRawPartnerQuote, sanitizePartnerOrder } from "@/lib/partner-orders";
import {
  isPartnerDecision,
  isPartnerProductionStatus,
  isPrintPartnerId,
  type PartnerDecision,
  type PartnerProductionStatus,
} from "@/lib/partners";
import {
  isContentLengthWithinLimit,
  isRequestOriginAllowed,
} from "@/lib/request-safety";

const MAX_UPDATE_REQUEST_BYTES = 8_192;
const MAX_TEXT_LENGTH = 1_500;

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_TEXT_LENGTH);
}

function cleanOptionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

async function canUpdatePartnerOrder(partnerId: string | null) {
  if (!isPrintPartnerId(partnerId)) return false;

  const cookieStore = await cookies();
  const adminSession = await readAdminSession(cookieStore);
  if (adminSession?.isOwner) return true;

  const partnerSession = await readPartnerSession(cookieStore);
  return partnerSession?.partnerId === partnerId;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isRequestOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  if (!isContentLengthWithinLimit(req.headers, MAX_UPDATE_REQUEST_BYTES)) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const partnerId = body?.partnerId;

  if (!id) {
    return NextResponse.json({ error: "Missing order id." }, { status: 400 });
  }

  if (!isPrintPartnerId(partnerId)) {
    return NextResponse.json({ error: "Unknown partner." }, { status: 400 });
  }

  if (!(await canUpdatePartnerOrder(partnerId))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const existing = await readRawPartnerQuote(partnerId, id);
  if (!existing?.view) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const decision: PartnerDecision = isPartnerDecision(body?.decision)
    ? body.decision
    : existing.view.decision;
  const productionStatus: PartnerProductionStatus = isPartnerProductionStatus(
    body?.productionStatus
  )
    ? body.productionStatus
    : existing.view.productionStatus;
  const completionDays = cleanOptionalNumber(body?.completionDays);
  const price = cleanOptionalNumber(body?.price);
  const comments = cleanText(body?.comments);
  const missingInformation = cleanText(body?.missingInformation);

  const nextProductionStatus =
    decision === "accepted" && productionStatus === "not_started"
      ? "in_progress"
      : productionStatus;

  try {
    await updateDoc(existing.ref, {
      "partner.requestStatus": decision,
      "partner.productionStatus": nextProductionStatus,
      "partner.completionDays": completionDays,
      "partner.price": price,
      "partner.comments": comments,
      "partner.missingInformation": missingInformation,
      "partner.respondedAt": serverTimestamp(),
      "partner.updatedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const updatedView = sanitizePartnerOrder(
      id,
      {
        ...existing.data,
        partner: {
          ...(existing.data.partner || {}),
          requestStatus: decision,
          productionStatus: nextProductionStatus,
          completionDays,
          price,
          comments,
          missingInformation,
          updatedAt: new Date(),
        },
      },
      partnerId
    );

    return NextResponse.json({ order: updatedView });
  } catch (error) {
    console.error("partners:orders:update", error);
    return NextResponse.json(
      { error: "Failed to update partner order." },
      { status: 500 }
    );
  }
}
