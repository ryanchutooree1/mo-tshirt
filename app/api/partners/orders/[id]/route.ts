import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { runTransaction, serverTimestamp } from "firebase/firestore";
import { readAdminSession } from "@/lib/admin-auth";
import { readPartnerSession } from "@/lib/partner-auth";
import { readRawPartnerQuote, readLinkedPartnerOrder, sanitizePartnerOrder } from "@/lib/partner-orders";
import { db } from "@/lib/firebase";
import { PartnerProductionError, validatePartnerProductionChange, type PartnerProductionActor } from "@/lib/partner-production";
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

const MAX_UPDATE_REQUEST_BYTES = 32_768;
const MAX_TEXT_LENGTH = 1_500;
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
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1e9) return null;
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

async function partnerOrderActor(partnerId: string): Promise<PartnerProductionActor | null> {
  const cookieStore = await cookies();
  const adminSession = await readAdminSession(cookieStore);
  if (adminSession?.isOwner) return { userId: adminSession.userId, displayName: adminSession.displayName, kind: "owner" };
  const partnerSession = await readPartnerSession(cookieStore);
  return partnerSession?.partnerId === partnerId
    ? { userId: `partner:${partnerId}`, displayName: partnerSession.displayName, kind: "partner" }
    : null;
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
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).length > MAX_UPDATE_REQUEST_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }
  const body = (() => { try { return JSON.parse(rawBody); } catch { return null; } })();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  }
  const partnerId = body?.partnerId;

  if (!id || id.length > 180 || /[\/\\\u0000-\u001f]/.test(id) || id === "." || id === "..") {
    return NextResponse.json({ error: "Missing order id." }, { status: 400 });
  }

  if (!isPrintPartnerId(partnerId)) {
    return NextResponse.json({ error: "Unknown partner." }, { status: 400 });
  }

  const actor = await partnerOrderActor(partnerId);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const existing = await readRawPartnerQuote(partnerId, id);
  if (!existing?.view) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  if ((body.decision !== undefined && !isPartnerDecision(body.decision)) ||
      (body.productionStatus !== undefined && !isPartnerProductionStatus(body.productionStatus)) ||
      (body.action !== undefined && body.action !== "save-response" && body.action !== "start-production")) {
    return NextResponse.json({ error: "Invalid partner decision, status or action." }, { status: 400 });
  }
  const partner = await getPrintPartnerById(partnerId);
  if (!partner || !partner.active) {
    return NextResponse.json({ error: "Unknown or inactive partner." }, { status: 400 });
  }
  let shouldNotifyManagerAction = false;
  try {
    const updatedView = await runTransaction(db, async (transaction) => {
      const currentSnap = await transaction.get(existing.ref);
      if (!currentSnap.exists()) throw new PartnerOrderUpdateError("Order not found.", 404);
      const currentData = currentSnap.data() as typeof existing.data;
      const currentPartner = currentData.partner && typeof currentData.partner === "object"
        ? currentData.partner as Record<string, unknown> : {};
      if (!canReadCurrentPartnerAssignment(currentPartner, partnerId)) {
        throw new PartnerOrderUpdateError("This order has already been accepted by another partner.", 409);
      }
      const linkedOrder = await readLinkedPartnerOrder(id, currentData, (ref) => transaction.get(ref));
      const current = sanitizePartnerOrder(id, currentData, partnerId, partner, linkedOrder);
      if (!current) throw new PartnerOrderUpdateError("Order not found.", 404);
      // Start is independent of the response form and cannot simultaneously accept a job.
      const starting = body.action === "start-production";
      if (starting && !current.production.packet) {
        throw new PartnerOrderUpdateError("Ask the manager to share the complete released packet before starting production.", 409);
      }
      if (current.production.released && body.printPlacement !== undefined && body.printPlacement !== current.printPlacement) {
        throw new PartnerOrderUpdateError("The released print specifications are read-only. Ask the manager to review changes.", 409);
      }
      const decision: PartnerDecision = starting ? current.decision : body.decision ?? current.decision;
      const requestedStatus: PartnerProductionStatus = starting ? "in_progress" : body.productionStatus ?? current.productionStatus;
      const completionDays = starting || body.completionDays === undefined ? current.completionDays : cleanOptionalNumber(body.completionDays);
      const price = starting || body.price === undefined ? current.price : cleanOptionalNumber(body.price);
      const comments = starting || body.comments === undefined ? current.comments : cleanText(body.comments);
      const missingInformation = starting || body.missingInformation === undefined ? current.missingInformation : cleanText(body.missingInformation);
      const printPlacement: PartnerPrintPlacement = starting || !isPartnerPrintPlacement(body.printPlacement) ? current.printPlacement : body.printPlacement;
      const change = validatePartnerProductionChange({
        quoteId: id, quote: currentData, partnerId, order: linkedOrder, decision,
        currentStatus: current.productionStatus, nextStatus: requestedStatus,
        completionDays, price, action: body.action, releaseId: body.releaseId,
        packetFingerprint: body.packetFingerprint, blanksReceived: body.blanksReceived,
        receivedProducts: body.receivedProducts, actor,
      });
      const nextProductionStatus = change.status;
      const assignedPartnerIds = getAssignedPartnerIds(currentPartner);
      const lockedBy = getLockedPartnerId(currentPartner);
      const isUnlockedSharedAssignment = assignedPartnerIds.length > 1 && !lockedBy;
      const shouldUpdateMainResponse = decision === "accepted" || !isUnlockedSharedAssignment;
      const now = new Date();
      const responseForView = {
        requestStatus: decision, productionStatus: nextProductionStatus,
        completionDays, managerPrice: current.managerPrice, price, comments,
        missingInformation, printPlacement, respondedAt: now, updatedAt: now,
      };
      const responsePayload = { ...responseForView, respondedAt: serverTimestamp(), updatedAt: serverTimestamp() };
      const updatePayload: Record<string, unknown> = {
        [`partner.responses.${partnerId}`]: responsePayload,
        "partner.updatedAt": serverTimestamp(), updatedAt: serverTimestamp(),
      };
      if (change.writeStart) updatePayload.productionStart = change.start;
      if (shouldUpdateMainResponse) {
        for (const key of ["requestStatus", "productionStatus", "completionDays", "price", "comments", "missingInformation", "printPlacement", "respondedAt"] as const) {
          updatePayload[`partner.${key}`] = responsePayload[key];
        }
        if (nextProductionStatus !== current.productionStatus) {
          updatePayload["partner.productionStatusUpdatedAtIso"] = now.toISOString();
        }
      }
      if (decision === "accepted") {
        updatePayload["partner.id"] = partner.id;
        updatePayload["partner.name"] = partner.name;
        updatePayload["partner.visibleTo"] = [partner.id];
        updatePayload["partner.lockedBy"] = partner.id;
      }
      transaction.update(existing.ref, updatePayload);
      shouldNotifyManagerAction = !starting && (decision === "needs_info" || Boolean(missingInformation)) &&
        (decision !== current.decision || missingInformation !== current.missingInformation || comments !== current.comments);
      return sanitizePartnerOrder(id, {
        ...currentData,
        ...(change.writeStart ? { productionStart: change.start } : {}),
        partner: {
          ...currentPartner,
          responses: { ...getPartnerResponses(currentPartner), [partnerId]: responseForView },
          updatedAt: now,
          ...(shouldUpdateMainResponse ? responseForView : {}),
          ...(nextProductionStatus !== current.productionStatus ? { productionStatusUpdatedAtIso: now.toISOString() } : {}),
          ...(decision === "accepted" ? { id: partner.id, name: partner.name, visibleTo: [partner.id], lockedBy: partner.id } : {}),
        },
      }, partnerId, partner, linkedOrder);
    });

    let actionEmailSent = false;
    let actionEmailWarning = "";

    if (updatedView && shouldNotifyManagerAction) {
      try {
        const manager = await getProductionManager();
        const managerEmail =
          manager.email?.trim() || process.env.PARTNER_MANAGER_EMAIL?.trim();
        if (!managerEmail) throw new Error("Manager email is not configured. The response was saved, but no notification was sent.");
        await sendManagerActionEmail(
          buildManagerActionEmail({
            managerName: manager.name,
            orderCode: updatedView.code,
            partnerName: updatedView.partnerName,
            product: updatedView.summary.product,
            pieces: updatedView.summary.pieces,
            deadline: updatedView.summary.deadline,
            print: updatedView.summary.print,
            decision: updatedView.decision,
            completionDays: updatedView.completionDays,
            price: updatedView.price,
            comments: updatedView.comments,
            missingInformation: updatedView.missingInformation,
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
    if (error instanceof PartnerOrderUpdateError || error instanceof PartnerProductionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("partners:orders:update", error);
    return NextResponse.json(
      { error: "Failed to update partner order." },
      { status: 500 }
    );
  }
}
