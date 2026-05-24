import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { runTransaction, serverTimestamp } from "firebase/firestore";
import { readAdminSession } from "@/lib/admin-auth";
import { readPartnerSession } from "@/lib/partner-auth";
import { readRawPartnerQuote, sanitizePartnerOrder } from "@/lib/partner-orders";
import { db } from "@/lib/firebase";
import {
  getPrintPartnerById,
  getProductionManager,
} from "@/lib/partner-registry";
import { SITE_URL } from "@/lib/seo";
import {
  isPartnerDecision,
  isPartnerPrintPlacement,
  isPartnerProductionStatus,
  isPrintPartnerId,
  normalizePrintPartnerIds,
  type PartnerDecision,
  type PartnerPrintPlacement,
  type PartnerProductionStatus,
  type PrintPartnerId,
} from "@/lib/partners";
import {
  isContentLengthWithinLimit,
  isRequestOriginAllowed,
} from "@/lib/request-safety";

const MAX_UPDATE_REQUEST_BYTES = 8_192;
const MAX_TEXT_LENGTH = 1_500;
const FALLBACK_MANAGER_EMAIL = "ryanchutooree@gmail.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class PartnerOrderUpdateError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatFrom(name: string, address: string) {
  const cleanName = name.replace(/[<>"]/g, "").trim();
  return cleanName ? `${cleanName} <${address}>` : address;
}

function resolveMailSender(rawFrom: string | undefined, smtpUser: string | undefined) {
  const fallbackAddress = (smtpUser || "").trim();
  const safeFallbackAddress = EMAIL_RE.test(fallbackAddress)
    ? fallbackAddress
    : "no-reply@example.com";
  const fallbackName = "MO T-SHIRT";
  const raw = (rawFrom || "").trim();

  if (!raw) {
    return {
      address: safeFallbackAddress,
      header: formatFrom(fallbackName, safeFallbackAddress),
    };
  }

  const bracketMatch = raw.match(/^(.*)<([^>]*)>\s*$/);
  if (bracketMatch) {
    const namePart = (bracketMatch[1] || "").trim();
    const addressPart = (bracketMatch[2] || "").trim();
    if (EMAIL_RE.test(addressPart)) {
      return {
        address: addressPart,
        header: formatFrom(namePart || fallbackName, addressPart),
      };
    }
    return {
      address: safeFallbackAddress,
      header: formatFrom(namePart || fallbackName, safeFallbackAddress),
    };
  }

  if (EMAIL_RE.test(raw)) {
    return { address: raw, header: formatFrom(fallbackName, raw) };
  }

  return {
    address: safeFallbackAddress,
    header: formatFrom(raw, safeFallbackAddress),
  };
}

function emailRow(label: string, value: string) {
  return [label, value || "Not set"] as const;
}

function buildManagerActionEmail({
  managerName,
  orderCode,
  partnerName,
  product,
  pieces,
  deadline,
  print,
  decision,
  completionDays,
  price,
  comments,
  missingInformation,
}: {
  managerName: string;
  orderCode: string;
  partnerName: string;
  product: string;
  pieces: number | null;
  deadline: string;
  print: string;
  decision: PartnerDecision;
  completionDays: number | null;
  price: number | null;
  comments: string;
  missingInformation: string;
}) {
  const rows = [
    emailRow("Order", orderCode),
    emailRow("Partner", partnerName),
    emailRow("Decision", decision === "needs_info" ? "Needs information" : decision),
    emailRow("Garment", product),
    emailRow("Quantity", pieces ? `${pieces} pcs` : ""),
    emailRow("Print method", print),
    emailRow("Deadline", deadline),
    emailRow("Completion days", completionDays ? `${completionDays}` : ""),
    emailRow("Partner price", price ? `Rs ${price}` : ""),
    emailRow("Missing information", missingInformation),
    emailRow("Comments", comments),
  ];
  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const htmlRows = rows
    .map(([label, value]) => {
      return `<tr>
  <td style="padding:7px 12px 7px 0; font-weight:700; vertical-align:top; white-space:nowrap;">${escapeHtml(label)}</td>
  <td style="padding:7px 0; color:#111; white-space:pre-wrap;">${escapeHtml(value)}</td>
</tr>`;
    })
    .join("");
  const adminUrl = `${SITE_URL}/admin/quotation-approval`;

  return {
    subject: `${managerName} action needed for ${orderCode}`,
    text: `Hi ${managerName},

${partnerName} needs your action before this order can continue.

${textRows}

Open Quotation Approval:
${adminUrl}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#111;">
  <p>Hi ${escapeHtml(managerName)},</p>
  <p><strong>${escapeHtml(partnerName)}</strong> needs your action before this order can continue.</p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; max-width:720px;">
    ${htmlRows}
  </table>
  <p style="margin-top:16px;">
    <a href="${escapeHtml(adminUrl)}" style="display:inline-block; border-radius:12px; background:#f97316; color:#fff; padding:10px 14px; text-decoration:none; font-weight:700;">
      Open Quotation Approval
    </a>
  </p>
</div>`,
  };
}

async function sendManagerActionEmail(
  message: ReturnType<typeof buildManagerActionEmail>,
  managerEmail: string
) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || "true") === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const sender = resolveMailSender(process.env.SMTP_FROM, user);

  if (!host || !user || !pass) {
    throw new Error("Email server is not configured.");
  }

  // @ts-expect-error nodemailer may not be installed yet
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: sender.header,
    replyTo: sender.header,
    to: managerEmail,
    envelope: {
      from: sender.address,
      to: [managerEmail],
    },
    subject: message.subject,
    text: message.text,
    html: message.html,
    headers: {
      "X-Entity-Ref-ID": `partner-action-${message.subject.replace(/[^a-z0-9-]/gi, "-")}`,
      "X-Auto-Response-Suppress": "All",
    },
  });
}

function getAssignedPartnerIds(partner: Record<string, unknown>) {
  const visibleTo = normalizePrintPartnerIds(partner.visibleTo);
  if (visibleTo.length) return visibleTo;
  return isPrintPartnerId(partner.id) ? [partner.id] : [];
}

function getLockedPartnerId(partner: Record<string, unknown>) {
  return isPrintPartnerId(partner.lockedBy) ? partner.lockedBy : null;
}

function getPartnerResponses(partner: Record<string, unknown>) {
  if (!partner.responses || typeof partner.responses !== "object" || Array.isArray(partner.responses)) {
    return {};
  }
  return partner.responses as Record<string, unknown>;
}

function canReadCurrentPartnerAssignment(
  partner: Record<string, unknown>,
  partnerId: PrintPartnerId
) {
  const assignedPartnerIds = getAssignedPartnerIds(partner);
  const lockedBy = getLockedPartnerId(partner);

  if (lockedBy && lockedBy !== partnerId) return false;
  return assignedPartnerIds.includes(partnerId);
}

async function canUpdatePartnerOrder(partnerId: string | null) {
  if (!isPrintPartnerId(partnerId)) return false;
  if (!(await getPrintPartnerById(partnerId))) return false;

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
  const printPlacement: PartnerPrintPlacement = isPartnerPrintPlacement(
    body?.printPlacement
  )
    ? body.printPlacement
    : existing.view.printPlacement;
  const shouldNotifyManagerAction =
    (decision === "needs_info" || Boolean(missingInformation)) &&
    (decision !== existing.view.decision ||
      missingInformation !== existing.view.missingInformation ||
      comments !== existing.view.comments);

  const nextProductionStatus =
    decision === "accepted" && productionStatus === "not_started"
      ? "in_progress"
      : productionStatus;
  const partner = await getPrintPartnerById(partnerId);
  if (!partner) {
    return NextResponse.json({ error: "Unknown partner." }, { status: 400 });
  }
  const responseForView = {
    requestStatus: decision,
    productionStatus: nextProductionStatus,
    completionDays,
    price,
    comments,
    missingInformation,
    printPlacement,
    respondedAt: new Date(),
    updatedAt: new Date(),
  };

  try {
    const updatedView = await runTransaction(db, async (transaction) => {
      const currentSnap = await transaction.get(existing.ref);
      if (!currentSnap.exists()) {
        throw new PartnerOrderUpdateError("Order not found.", 404);
      }

      const currentData = currentSnap.data() as typeof existing.data;
      const currentPartner =
        currentData.partner && typeof currentData.partner === "object"
          ? (currentData.partner as Record<string, unknown>)
          : {};

      if (!canReadCurrentPartnerAssignment(currentPartner, partnerId)) {
        throw new PartnerOrderUpdateError(
          "This order has already been accepted by another partner.",
          409
        );
      }

      const assignedPartnerIds = getAssignedPartnerIds(currentPartner);
      const lockedBy = getLockedPartnerId(currentPartner);
      const isUnlockedSharedAssignment = assignedPartnerIds.length > 1 && !lockedBy;
      const shouldUpdateMainResponse =
        decision === "accepted" || !isUnlockedSharedAssignment;
      const responsePayload = {
        requestStatus: decision,
        productionStatus: nextProductionStatus,
        completionDays,
        price,
        comments,
        missingInformation,
        printPlacement,
        respondedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const updatePayload: Record<string, unknown> = {
        [`partner.responses.${partnerId}`]: responsePayload,
        "partner.updatedAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (shouldUpdateMainResponse) {
        updatePayload["partner.requestStatus"] = decision;
        updatePayload["partner.productionStatus"] = nextProductionStatus;
        updatePayload["partner.completionDays"] = completionDays;
        updatePayload["partner.price"] = price;
        updatePayload["partner.comments"] = comments;
        updatePayload["partner.missingInformation"] = missingInformation;
        updatePayload["partner.printPlacement"] = printPlacement;
        updatePayload["partner.respondedAt"] = serverTimestamp();
      }

      if (decision === "accepted") {
        updatePayload["partner.id"] = partner.id;
        updatePayload["partner.name"] = partner.name;
        updatePayload["partner.visibleTo"] = [partner.id];
        updatePayload["partner.lockedBy"] = partner.id;
      }

      transaction.update(existing.ref, updatePayload);

      const responses = {
        ...getPartnerResponses(currentPartner),
        [partnerId]: responseForView,
      };
      const partnerForView = {
        ...currentPartner,
        responses,
        updatedAt: new Date(),
        ...(shouldUpdateMainResponse
          ? {
              requestStatus: decision,
              productionStatus: nextProductionStatus,
              completionDays,
              price,
              comments,
              missingInformation,
              printPlacement,
              respondedAt: new Date(),
            }
          : {}),
        ...(decision === "accepted"
          ? {
              id: partner.id,
              name: partner.name,
              visibleTo: [partner.id],
              lockedBy: partner.id,
            }
          : {}),
      };

      return sanitizePartnerOrder(
        id,
        {
          ...currentData,
          partner: partnerForView,
        },
        partnerId,
        partner
      );
    });

    let actionEmailSent = false;
    let actionEmailWarning = "";

    if (updatedView && shouldNotifyManagerAction) {
      try {
        const manager = await getProductionManager();
        const managerEmail =
          manager.email || process.env.PARTNER_MANAGER_EMAIL || FALLBACK_MANAGER_EMAIL;
        await sendManagerActionEmail(
          buildManagerActionEmail({
            managerName: manager.name,
            orderCode: updatedView.code,
            partnerName: updatedView.partnerName,
            product: updatedView.summary.product,
            pieces: updatedView.summary.pieces,
            deadline: updatedView.summary.deadline,
            print: updatedView.summary.print,
            decision,
            completionDays,
            price,
            comments,
            missingInformation,
          }),
          managerEmail
        );
        actionEmailSent = true;
      } catch (emailError) {
        console.error("partners:orders:manager-action-email", emailError);
        actionEmailWarning =
          emailError instanceof Error
            ? emailError.message
            : "Manager action email could not be sent.";
      }
    }

    return NextResponse.json({
      order: updatedView,
      actionEmailSent,
      ...(actionEmailWarning ? { actionEmailWarning } : {}),
    });
  } catch (error) {
    if (error instanceof PartnerOrderUpdateError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("partners:orders:update", error);
    return NextResponse.json(
      { error: "Failed to update partner order." },
      { status: 500 }
    );
  }
}
