import { arrayUnion, doc, getDoc, updateDoc } from "firebase/firestore";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-request";
import { db } from "@/lib/firebase";
import { getPrintPartners, getProductionManager } from "@/lib/partner-registry";
import { SITE_URL } from "@/lib/seo";

const MAX_REPLY_LENGTH = 2_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function safeText(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
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
  const fallback = {
    header: formatFrom("MO T-Shirt", fallbackAddress),
    address: fallbackAddress,
  };

  if (!rawFrom) return fallback;
  const trimmed = rawFrom.trim();
  const match = trimmed.match(/<([^>]+)>/);
  const address = (match ? match[1] : trimmed).trim();
  if (!EMAIL_RE.test(address)) return fallback;
  return {
    header: match ? trimmed : formatFrom("MO T-Shirt", address),
    address,
  };
}

function getQuoteCode(quoteId: string, data: Record<string, unknown>) {
  const quote = data.quote && typeof data.quote === "object" && !Array.isArray(data.quote)
    ? data.quote as Record<string, unknown>
    : {};
  return safeText(quote.documentNumber, 80) || `Q-${quoteId.slice(-5).toUpperCase()}`;
}

function buildReplyEmail({
  quoteCode,
  clientName,
  partnerName,
  managerName,
  message,
}: {
  quoteCode: string;
  clientName: string;
  partnerName: string;
  managerName: string;
  message: string;
}) {
  const adminUrl = `${SITE_URL}/admin/workspace`;
  const subject = `Tanvi reply for ${quoteCode}`;
  const rows = [
    ["Quote", quoteCode],
    ["Client", clientName || "Not set"],
    ["Partner", partnerName],
    ["From", managerName || "Tanvi"],
  ];
  const text = [
    `Hi ${partnerName},`,
    "",
    `${managerName || "Tanvi"} replied to your production comment:`,
    "",
    message,
    "",
    rows.map(([label, value]) => `${label}: ${value}`).join("\n"),
    `Dashboard: ${adminUrl}`,
  ].join("\n");
  const htmlRows = rows
    .map(([label, value]) => `<tr><td style="padding:6px 10px;color:#64748b;">${escapeHtml(label)}</td><td style="padding:6px 10px;font-weight:700;">${escapeHtml(value)}</td></tr>`)
    .join("");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
      <p>Hi ${escapeHtml(partnerName)},</p>
      <p><strong>${escapeHtml(managerName || "Tanvi")}</strong> replied to your production comment:</p>
      <div style="white-space:pre-wrap;border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#f8fafc;">${escapeHtml(message)}</div>
      <table style="margin-top:14px;border-collapse:collapse;">${htmlRows}</table>
      <p style="margin-top:14px;"><a href="${adminUrl}">Open Tanvi dashboard</a></p>
    </div>
  `;
  return { subject, text, html };
}

export async function POST(req: Request, context: RouteContext) {
  if (!(await isAdminRequest("/api/admin/tanvi/quotes"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing quote id." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const partnerId = safeText(body?.partnerId, 80);
  const message = safeText(body?.message, MAX_REPLY_LENGTH);
  if (!partnerId) {
    return NextResponse.json({ error: "Select a partner before sending." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Write a reply before sending." }, { status: 400 });
  }

  const quoteRef = doc(db, "quotes", id);
  const quoteSnap = await getDoc(quoteRef);
  if (!quoteSnap.exists()) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }

  const partners = await getPrintPartners({ includeInactive: true });
  const partner = partners.find((entry) => entry.id === partnerId);
  if (!partner) {
    return NextResponse.json({ error: "Partner not found." }, { status: 404 });
  }
  const emails = partner.emails.filter((email) => EMAIL_RE.test(email));
  if (!emails.length) {
    return NextResponse.json({ error: `No email is configured for ${partner.name}.` }, { status: 400 });
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || "true") === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const sender = resolveMailSender(process.env.SMTP_FROM, user);

  if (!host || !user || !pass) {
    return NextResponse.json({ error: "Email server is not configured." }, { status: 500 });
  }

  const manager = await getProductionManager();
  const quoteData = quoteSnap.data() as Record<string, unknown>;
  const quoteCode = getQuoteCode(id, quoteData);
  const clientName = safeText(quoteData.name, 120);
  const email = buildReplyEmail({
    quoteCode,
    clientName,
    partnerName: partner.name,
    managerName: manager.name,
    message,
  });

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
    to: emails.join(", "),
    envelope: {
      from: sender.address,
      to: emails,
    },
    subject: email.subject,
    text: email.text,
    html: email.html,
    headers: {
      "X-Entity-Ref-ID": `tanvi-partner-reply-${id}-${partner.id}`,
      "X-Auto-Response-Suppress": "All",
    },
  });

  await updateDoc(quoteRef, {
    partnerReplies: arrayUnion({
      partnerId: partner.id,
      partnerName: partner.name,
      message,
      sentBy: manager.name || "Tanvi",
      sentTo: emails,
      sentAt: new Date().toISOString(),
    }),
  });

  return NextResponse.json({
    ok: true,
    sent: {
      partnerId: partner.id,
      partnerName: partner.name,
      emails,
    },
  });
}
