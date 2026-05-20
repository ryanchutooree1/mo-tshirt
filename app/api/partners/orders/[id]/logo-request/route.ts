import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readAdminSession } from "@/lib/admin-auth";
import { readPartnerSession } from "@/lib/partner-auth";
import { readRawPartnerQuote } from "@/lib/partner-orders";
import {
  getPrintPartner,
  isPrintPartnerId,
  type PrintPartnerId,
} from "@/lib/partners";
import {
  formatQuoteGarmentDescription,
  type QuoteGarmentLine,
} from "@/lib/shops";
import { SITE_URL } from "@/lib/seo";
import {
  isContentLengthWithinLimit,
  isRequestOriginAllowed,
} from "@/lib/request-safety";

const RYAN_LOGO_REQUEST_EMAIL = "ryanchutooree@gmail.com";
const MAX_LOGO_REQUEST_BYTES = 2_048;
const MAX_FIELD_LENGTH = 240;

type RawQuoteForLogoRequest = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
  notes?: unknown;
  printMethod?: unknown;
  deadline?: unknown;
  delivery?: unknown;
  deliveryName?: unknown;
  deliveryAddress?: unknown;
  deliveryPostCode?: unknown;
  deliveryPhone?: unknown;
  garments?: QuoteGarmentLine[];
  quote?: {
    documentNumber?: unknown;
    clientCompany?: unknown;
    clientAddress?: unknown;
    clientBrn?: unknown;
    clientVat?: unknown;
  };
  designBrief?: {
    product?: unknown;
    color?: unknown;
    printMethod?: unknown;
    totalQty?: unknown;
    deadline?: unknown;
    clientNotes?: unknown;
  } | null;
};

function safeText(value: unknown, maxLength = MAX_FIELD_LENGTH) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveFromAddress(rawFrom: string | undefined, fallbackUser: string | undefined) {
  const fallbackAddress = fallbackUser || "no-reply@example.com";
  const safeFallbackAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fallbackAddress)
    ? fallbackAddress
    : "no-reply@example.com";
  if (!rawFrom) return safeFallbackAddress;

  const match = rawFrom.match(/<([^>]+)>/);
  const addressPart = (match?.[1] || rawFrom).trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addressPart)) {
    return rawFrom;
  }

  return safeFallbackAddress;
}

function getGarmentSummary(quote: RawQuoteForLogoRequest) {
  const garments = Array.isArray(quote.garments) ? quote.garments : [];
  const rows = garments
    .filter((entry) => safeNumber(entry.quantity) > 0 || safeText(entry.garment))
    .slice(0, 5)
    .map((entry) => formatQuoteGarmentDescription(entry));

  if (rows.length) return rows.join(", ");
  return safeText(quote.designBrief?.product) || "Not set";
}

function getTotalPieces(quote: RawQuoteForLogoRequest) {
  const briefQty = safeNumber(quote.designBrief?.totalQty);
  if (briefQty > 0) return `${briefQty}`;

  const garments = Array.isArray(quote.garments) ? quote.garments : [];
  const total = garments.reduce((sum, entry) => sum + safeNumber(entry.quantity), 0);
  return total > 0 ? `${total}` : "Not set";
}

function row(label: string, value: string) {
  return [label, value || "Not set"] as const;
}

function buildEmail({
  quoteId,
  quote,
  partnerId,
  attachmentFilename,
  attachmentLabel,
}: {
  quoteId: string;
  quote: RawQuoteForLogoRequest;
  partnerId: PrintPartnerId;
  attachmentFilename: string;
  attachmentLabel: string;
}) {
  const partner = getPrintPartner(partnerId);
  const orderCode =
    safeText(quote.quote?.documentNumber) || `Q-${quoteId.slice(-5).toUpperCase()}`;
  const rows = [
    row("Order", orderCode),
    row("Quote ID", quoteId),
    row("Partner desk", partner.name),
    row("Missing file", attachmentFilename || attachmentLabel || "Logo / artwork"),
    row("Client name", safeText(quote.name)),
    row("Client email", safeText(quote.email)),
    row("Client phone", safeText(quote.phone)),
    row("Company", safeText(quote.quote?.clientCompany)),
    row("Billing address", safeText(quote.quote?.clientAddress)),
    row("BRN", safeText(quote.quote?.clientBrn)),
    row("VAT", safeText(quote.quote?.clientVat)),
    row("Delivery method", safeText(quote.delivery)),
    row("Delivery name", safeText(quote.deliveryName)),
    row("Delivery phone", safeText(quote.deliveryPhone)),
    row("Delivery address", safeText(quote.deliveryAddress)),
    row("Delivery post code", safeText(quote.deliveryPostCode)),
    row("Product", safeText(quote.designBrief?.product) || getGarmentSummary(quote)),
    row("Garments", getGarmentSummary(quote)),
    row("Color", safeText(quote.designBrief?.color)),
    row("Quantity", getTotalPieces(quote)),
    row(
      "Print method",
      safeText(quote.designBrief?.printMethod) || safeText(quote.printMethod)
    ),
    row("Deadline", safeText(quote.designBrief?.deadline) || safeText(quote.deadline)),
    row(
      "Client notes",
      safeText(quote.designBrief?.clientNotes, 1_000) ||
        safeText(quote.notes, 1_000) ||
        safeText(quote.message, 1_000)
    ),
  ];
  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const htmlRows = rows
    .map(([label, value]) => {
      return `<tr>
  <td style="padding:7px 12px 7px 0; font-weight:700; vertical-align:top; white-space:nowrap;">${escapeHtml(label)}</td>
  <td style="padding:7px 0; color:#111;">${escapeHtml(value)}</td>
</tr>`;
    })
    .join("");
  const adminUrl = `${SITE_URL}/admin/quotation-approval`;

  return {
    subject: `Upload logo for ${orderCode}`,
    text: `Hi Ryan,

Please upload the logo/artwork for ${orderCode}.

The partner only sees an email-only placeholder, so they cannot open this file from the partner desk.

${textRows}

Open Quotation Approval:
${adminUrl}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#111;">
  <p>Hi Ryan,</p>
  <p>Please upload the logo/artwork for <strong>${escapeHtml(orderCode)}</strong>.</p>
  <p>The partner only sees an email-only placeholder, so they cannot open this file from the partner desk.</p>
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

async function canRequestLogoUpload(partnerId: string | null) {
  if (!isPrintPartnerId(partnerId)) return false;

  const cookieStore = await cookies();
  const adminSession = await readAdminSession(cookieStore);
  if (adminSession?.isOwner) return true;

  const partnerSession = await readPartnerSession(cookieStore);
  return partnerSession?.partnerId === partnerId;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isRequestOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  if (!isContentLengthWithinLimit(req.headers, MAX_LOGO_REQUEST_BYTES)) {
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

  if (!(await canRequestLogoUpload(partnerId))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const existing = await readRawPartnerQuote(partnerId, id);
  if (!existing?.view) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || "true") === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = resolveFromAddress(process.env.SMTP_FROM, user);

  if (!host || !user || !pass) {
    return NextResponse.json(
      { error: "Email server is not configured." },
      { status: 500 }
    );
  }

  try {
    // @ts-expect-error nodemailer may not be installed yet
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    const message = buildEmail({
      quoteId: id,
      quote: existing.data as RawQuoteForLogoRequest,
      partnerId,
      attachmentFilename: safeText(body?.attachmentFilename),
      attachmentLabel: safeText(body?.attachmentLabel),
    });

    await transporter.sendMail({
      from,
      to: RYAN_LOGO_REQUEST_EMAIL,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    return NextResponse.json({
      ok: true,
      message: `Asked Ryan to upload the logo for ${existing.view.code}.`,
    });
  } catch (error) {
    console.error("partners:logo-request", error);
    return NextResponse.json(
      { error: "Failed to send logo upload request." },
      { status: 500 }
    );
  }
}
