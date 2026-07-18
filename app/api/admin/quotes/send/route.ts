import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { hasAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/firebase";
import { buildQuoteResponseUrl } from "@/lib/quote-response-links";

type SendPayload = {
  quoteId: string;
  to: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  subject?: string;
  message?: string;
  pdfBase64: string;
  quote?: Record<string, unknown>;
};

type DocumentType = "quotation" | "invoice" | "partial_receipt" | "receipt";

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  quotation: "quotation",
  invoice: "invoice",
  partial_receipt: "partial receipt",
  receipt: "receipt",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatFrom(name: string, address: string) {
  const cleanName = name.replace(/[<>"]/g, "").trim();
  return cleanName ? `${cleanName} <${address}>` : address;
}

function resolveFromAddress(rawFrom: string | undefined, smtpUser: string | undefined) {
  const fallbackAddress = (smtpUser || "").trim();
  const safeFallbackAddress = EMAIL_RE.test(fallbackAddress) ? fallbackAddress : "no-reply@example.com";
  const fallbackName = "Mo T-Shirt";
  const raw = (rawFrom || "").trim();
  if (!raw) return formatFrom(fallbackName, safeFallbackAddress);

  const bracketMatch = raw.match(/^(.*)<([^>]*)>\s*$/);
  if (bracketMatch) {
    const namePart = (bracketMatch[1] || "").trim();
    const addressPart = (bracketMatch[2] || "").trim();
    if (EMAIL_RE.test(addressPart)) {
      return formatFrom(namePart, addressPart);
    }
    return formatFrom(namePart || fallbackName, safeFallbackAddress);
  }

  if (EMAIL_RE.test(raw)) return raw;
  return formatFrom(raw, safeFallbackAddress);
}

function parseDocumentType(value: unknown): DocumentType {
  if (value === "quotation" || value === "invoice" || value === "partial_receipt" || value === "receipt") {
    return value;
  }
  return "quotation";
}

function parsePdfBase64(input: string) {
  if (!input) return null;
  if (input.startsWith("data:")) {
    const [, base64] = input.split("base64,");
    return base64 ? Buffer.from(base64, "base64") : null;
  }
  return Buffer.from(input, "base64");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function responseButton(label: string, url: string, background: string) {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;margin:6px 8px 6px 0;padding:12px 18px;border-radius:9px;background:${background};color:#fff;text-decoration:none;font-weight:700;">${label}</a>`;
}

export async function POST(req: Request) {
  if (!(await hasAdminSession(await cookies()))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const payload = (await req.json()) as SendPayload;
    if (!payload?.quoteId || !payload?.to || !payload?.pdfBase64) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const buffer = parsePdfBase64(payload.pdfBase64);
    if (!buffer) {
      return NextResponse.json({ error: "Invalid PDF payload." }, { status: 400 });
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = String(process.env.SMTP_SECURE || "true") === "true";
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = resolveFromAddress(process.env.SMTP_FROM, user);

    if (!host || !user || !pass) {
      return NextResponse.json({ error: "Email not configured." }, { status: 500 });
    }

    // @ts-expect-error nodemailer may not be installed yet
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    const documentType = parseDocumentType(payload.quote?.documentType);
    const documentLabel = DOCUMENT_LABELS[documentType];
    const documentSlug = documentType.replace(/_/g, "-");
    const subject = payload.subject || `Your ${documentLabel} from MO T-SHIRT`;
    const message =
      payload.message ||
      `Hi! Please find your ${documentLabel} attached.\n\nBest regards,\nMo T-Shirt Team`;
    const responseLinks = documentType === "quotation"
      ? {
          accept: buildQuoteResponseUrl(payload.quoteId, "accept"),
          changes: buildQuoteResponseUrl(payload.quoteId, "changes"),
          reject: buildQuoteResponseUrl(payload.quoteId, "reject"),
        }
      : null;
    const responseButtons = responseLinks
      ? `<div style="margin-top:22px;padding:18px;border-radius:12px;background:#f6f7f8;">
  <p style="margin:0 0 10px;font-weight:700;">Please respond to this quotation:</p>
  ${responseButton("Accept quotation", responseLinks.accept, "#16803c")}
  ${responseButton("Request changes", responseLinks.changes, "#c56a00")}
  ${responseButton("Reject quotation", responseLinks.reject, "#a62929")}
</div>`
      : "";
    const plainTextMessage = responseLinks
      ? `${message}\n\nAccept quotation: ${responseLinks.accept}\nRequest changes: ${responseLinks.changes}\nReject quotation: ${responseLinks.reject}`
      : message;

    const mailOptions: Record<string, unknown> = {
      from,
      to: payload.to,
      subject,
      text: plainTextMessage,
      html: `<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#111;line-height:1.5;">
  <p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>
  ${responseButtons}
</div>`,
      attachments: [
        {
          filename: `${documentSlug}-${payload.quoteId}.pdf`,
          content: buffer,
          contentType: "application/pdf",
        },
      ],
    };

    await transporter.sendMail(mailOptions);

    const cleanClientName = (payload.clientName || "").trim();
    const cleanClientEmail = (payload.clientEmail || "").trim();
    const cleanClientPhone = (payload.clientPhone || "").trim();
    await updateDoc(doc(db, "quotes", payload.quoteId), {
      status: "sent",
      approvedAt: serverTimestamp(),
      sentAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      quote: payload.quote || null,
      ...(cleanClientName ? { name: cleanClientName } : {}),
      ...(cleanClientEmail ? { email: cleanClientEmail } : {}),
      ...(cleanClientPhone ? { phone: cleanClientPhone } : {}),
      lastEmailTo: payload.to,
      lastEmailSubject: subject,
      ...(responseLinks ? { clientResponseLinksSentAt: serverTimestamp() } : {}),
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("quotes:send", err);
    return NextResponse.json({ error: "Failed to send quote." }, { status: 500 });
  }
}
