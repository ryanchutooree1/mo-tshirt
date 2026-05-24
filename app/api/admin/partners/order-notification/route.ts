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
  emails: string[];
};

type SkippedNotification = {
  partnerId: PrintPartnerId;
  partnerName: string;
  reason: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const partnerPath = partner.path;
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

Next steps:
1. Check if the logo/artwork is provided.
2. Accept or reject the order.
3. If accepted, add completion days and your price.
4. Use Missing information when Ryan needs to get something from the client.

Open your partner page:
${partnerUrl}

This internal production notice was sent by MO T-SHIRT after Ryan moved this order.`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#111;">
  <p>Hi ${escapeHtml(partner.partnerName)},</p>
  <p>Ryan moved an order to your <strong>MO T-SHIRT partner desk</strong>.</p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; max-width:560px;">
    ${htmlRows}
  </table>
  <div style="margin-top:16px; padding:12px; border:1px solid #fed7aa; border-radius:12px; background:#fff7ed;">
    <p style="margin:0 0 8px; font-weight:700;">Next steps</p>
    <ol style="margin:0; padding-left:20px; color:#333;">
      <li>Check if the logo/artwork is provided.</li>
      <li>Accept or reject the order.</li>
      <li>If accepted, add completion days and your price.</li>
      <li>Use Missing information when Ryan needs to get something from the client.</li>
    </ol>
  </div>
  <p style="margin-top:16px; margin-bottom:4px; font-weight:700;">Partner desk link</p>
  <p style="margin-top:0;">
    <a href="${escapeHtml(partnerUrl)}" style="color:#0f766e; text-decoration:underline; word-break:break-all;">
      ${escapeHtml(partnerUrl)}
    </a>
  </p>
  <p style="margin-top:16px; color:#555; font-size:12px;">
    This internal production notice was sent by MO T-SHIRT after Ryan moved this order.
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

    if (!setting.emails.length) {
      skipped.push({
        partnerId: setting.partnerId,
        partnerName: setting.partnerName,
        reason: "No email recipients configured.",
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
  const sender = resolveMailSender(process.env.SMTP_FROM, user);

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
        from: sender.header,
        replyTo: sender.header,
        to: partner.emails.join(", "),
        envelope: {
          from: sender.address,
          to: partner.emails,
        },
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: {
          "X-Entity-Ref-ID": `partner-order-${quoteId}-${partner.partnerId}`,
          "X-Auto-Response-Suppress": "All",
        },
      });
      sent.push({
        partnerId: partner.partnerId,
        partnerName: partner.partnerName,
        email: partner.email,
        emails: partner.emails,
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
