import { NextResponse } from "next/server";
import { doc, getDoc } from "firebase/firestore";
import { isAdminRequest } from "@/lib/admin-request";
import { db } from "@/lib/firebase";
import {
  getPartnerNotificationSettings,
  type PartnerNotificationSetting,
} from "@/lib/partner-notification-settings";
import {
  PARTNER_PRINT_PLACEMENT_LABELS,
  getPrintPartner,
  normalizePartnerPrintPlacement,
  normalizePrintPartnerIds,
  type PrintPartnerId,
} from "@/lib/partners";
import { SITE_URL } from "@/lib/seo";
import {
  formatQuoteGarmentDescription,
  type QuoteGarmentLine,
} from "@/lib/shops";

type RawQuote = {
  name?: string;
  printMethod?: string;
  deadline?: string;
  garments?: QuoteGarmentLine[];
  quote?: {
    documentNumber?: string;
  };
  designBrief?: {
    product?: string;
    totalQty?: number;
    printMethod?: string;
    deadline?: string;
  } | null;
  partner?: {
    printPlacement?: unknown;
  } | null;
};

type SentNotification = {
  partnerId: PrintPartnerId;
  partnerName: string;
  email: string;
};

type SkippedNotification = {
  partnerId: PrintPartnerId;
  partnerName: string;
  reason: string;
};

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

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getGarmentSummary(data: RawQuote) {
  const garments = Array.isArray(data.garments) ? data.garments : [];
  const rows = garments
    .filter((entry) => safeNumber(entry.quantity) > 0 || safeText(entry.garment))
    .slice(0, 3)
    .map((entry) => formatQuoteGarmentDescription(entry));

  if (rows.length) return rows.join(", ");
  return safeText(data.designBrief?.product) || "Production order";
}

function getTotalPieces(data: RawQuote) {
  const briefQty = safeNumber(data.designBrief?.totalQty);
  if (briefQty > 0) return briefQty;

  const garments = Array.isArray(data.garments) ? data.garments : [];
  const total = garments.reduce((sum, entry) => sum + safeNumber(entry.quantity), 0);
  return total > 0 ? total : null;
}

function buildMessage({
  quoteId,
  quote,
  partner,
}: {
  quoteId: string;
  quote: RawQuote;
  partner: PartnerNotificationSetting;
}) {
  const orderCode = quote.quote?.documentNumber || `Q-${quoteId.slice(-5).toUpperCase()}`;
  const pieces = getTotalPieces(quote);
  const printPlacement = normalizePartnerPrintPlacement(quote.partner?.printPlacement);
  const partnerPath = getPrintPartner(partner.partnerId).path;
  const partnerUrl = `${SITE_URL}${partnerPath}`;
  const rows = [
    ["Order", orderCode],
    ["Garment", getGarmentSummary(quote)],
    ["Quantity", pieces ? `${pieces} pc${pieces > 1 ? "s" : ""}` : "Not set"],
    ["Print method", safeText(quote.designBrief?.printMethod) || safeText(quote.printMethod) || "Not set"],
    ["Print placement", PARTNER_PRINT_PLACEMENT_LABELS[printPlacement]],
    ["Deadline", safeText(quote.designBrief?.deadline) || safeText(quote.deadline) || "Not set"],
  ];
  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const htmlRows = rows
    .map(([label, value]) => {
      return `<tr>
  <td style="padding:6px 12px 6px 0; font-weight:700; vertical-align:top; white-space:nowrap;">${escapeHtml(label)}</td>
  <td style="padding:6px 0; color:#111;">${escapeHtml(value)}</td>
</tr>`;
    })
    .join("");

  return {
    subject: `New MO T-SHIRT order ${orderCode}`,
    text: `Hi ${partner.partnerName},

Ryan moved an order to your MO T-SHIRT partner desk.

${textRows}

Open your partner page:
${partnerUrl}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#111;">
  <p>Hi ${escapeHtml(partner.partnerName)},</p>
  <p>Ryan moved an order to your <strong>MO T-SHIRT partner desk</strong>.</p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; max-width:560px;">
    ${htmlRows}
  </table>
  <p style="margin-top:16px;">
    <a href="${escapeHtml(partnerUrl)}" style="display:inline-block; border-radius:12px; background:#111827; color:#fff; padding:10px 14px; text-decoration:none; font-weight:700;">
      Open partner page
    </a>
  </p>
</div>`,
  };
}

export async function POST(req: Request) {
  if (!(await isAdminRequest("/api/admin/partners/order-notification"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const quoteId = safeText(body?.quoteId);
  const partnerIds = normalizePrintPartnerIds(body?.partnerIds);

  if (!quoteId || !partnerIds.length) {
    return NextResponse.json(
      { error: "Missing quote or partner details." },
      { status: 400 }
    );
  }

  const quoteSnap = await getDoc(doc(db, "quotes", quoteId));
  if (!quoteSnap.exists()) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }

  const settings = await getPartnerNotificationSettings();
  const requestedSettings = partnerIds
    .map((partnerId) => settings.find((setting) => setting.partnerId === partnerId))
    .filter((setting): setting is PartnerNotificationSetting => Boolean(setting));
  const skipped: SkippedNotification[] = [];
  const enabledSettings = requestedSettings.filter((setting) => {
    if (!setting.emailNotificationsEnabled) {
      skipped.push({
        partnerId: setting.partnerId,
        partnerName: setting.partnerName,
        reason: "Notifications are disabled.",
      });
      return false;
    }

    if (!setting.email) {
      skipped.push({
        partnerId: setting.partnerId,
        partnerName: setting.partnerName,
        reason: "No email configured.",
      });
      return false;
    }

    return true;
  });

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || "true") === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = resolveFromAddress(process.env.SMTP_FROM, user);

  if (!enabledSettings.length) {
    return NextResponse.json({ sent: [], skipped });
  }

  if (!host || !user || !pass) {
    return NextResponse.json({
      sent: [],
      skipped: [
        ...skipped,
        ...enabledSettings.map((setting) => ({
          partnerId: setting.partnerId,
          partnerName: setting.partnerName,
          reason: "Email server is not configured.",
        })),
      ],
    });
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
    const quote = quoteSnap.data() as RawQuote;
    const sent: SentNotification[] = [];

    for (const partner of enabledSettings) {
      const message = buildMessage({ quoteId, quote, partner });
      await transporter.sendMail({
        from,
        to: partner.email,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      sent.push({
        partnerId: partner.partnerId,
        partnerName: partner.partnerName,
        email: partner.email,
      });
    }

    return NextResponse.json({ sent, skipped });
  } catch (error) {
    console.error("partner-order-notification:post", error);
    return NextResponse.json(
      { error: "Failed to send partner email notification." },
      { status: 500 }
    );
  }
}
