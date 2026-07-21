import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { hasAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/firebase";
import { buildQuoteResponseUrl } from "@/lib/quote-response-links";
import { storePublicUploadBuffer } from "@/lib/public-upload-store";

type SendPayload = {
  quoteId: string;
  to: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  subject?: string;
  message?: string;
  pdfBase64?: string;
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

function cleanString(value: unknown, maxLength = 4_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseQuotePayload(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function readSendPayload(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const pdf = form.get("pdf");
    return {
      payload: {
        quoteId: cleanString(form.get("quoteId"), 160),
        to: cleanString(form.get("to"), 254),
        clientName: cleanString(form.get("clientName"), 160),
        clientEmail: cleanString(form.get("clientEmail"), 254),
        clientPhone: cleanString(form.get("clientPhone"), 80),
        subject: cleanString(form.get("subject"), 300),
        message: cleanString(form.get("message"), 8_000),
        quote: parseQuotePayload(form.get("quote")),
      } satisfies SendPayload,
      buffer: pdf instanceof File && pdf.size > 0
        ? Buffer.from(await pdf.arrayBuffer())
        : null,
    };
  }

  const payload = (await req.json()) as SendPayload;
  return {
    payload,
    buffer: parsePdfBase64(payload.pdfBase64 || ""),
  };
}

function getPublicSendError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "";
  if (code === "EAUTH") return "The email account rejected the login. Please update the SMTP app password.";
  if (code === "ECONNECTION" || code === "ETIMEDOUT" || code === "ESOCKET") {
    return "The email server could not be reached. Please try again.";
  }
  return "The email could not be sent. Please try again.";
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
  const startedAt = Date.now();
  const requestId = req.headers.get("x-vercel-id") || crypto.randomUUID();
  if (!(await hasAdminSession(await cookies()))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { payload, buffer } = await readSendPayload(req);
    console.log(JSON.stringify({ level: "info", msg: "quotation_email_start", requestId, quoteId: payload.quoteId }));
    if (!payload?.quoteId || !payload?.to || !buffer) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    if (!EMAIL_RE.test(payload.to)) {
      return NextResponse.json({ error: "The client email address is invalid." }, { status: 400 });
    }
    if (buffer.byteLength > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "The quotation PDF is too large." }, { status: 413 });
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = String(process.env.SMTP_SECURE || "true") === "true";
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = resolveFromAddress(process.env.SMTP_FROM, user);

    if (!host || !user || !pass) {
      console.error(JSON.stringify({ level: "error", msg: "quotation_email_config_missing", requestId }));
      return NextResponse.json({ error: "Email sending is not configured." }, { status: 500 });
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
    const pdfFilename = `${documentSlug}-${payload.quoteId}.pdf`;
    const quotationDocument = responseLinks
      ? await storePublicUploadBuffer({
          buffer,
          filename: pdfFilename,
          contentType: "application/pdf",
          size: buffer.byteLength,
          sessionId: payload.quoteId,
          sessionPrefix: "quotation-document",
          source: "quotation-response-document",
          maxUploadBytes: 10 * 1024 * 1024,
        })
      : null;

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
          filename: pdfFilename,
          content: buffer,
          contentType: "application/pdf",
        },
      ],
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        msg: "quotation_email_smtp_failed",
        requestId,
        code: error && typeof error === "object" && "code" in error ? String(error.code) : "unknown",
        ms: Date.now() - startedAt,
      }));
      return NextResponse.json({ error: getPublicSendError(error) }, { status: 502 });
    }

    const cleanClientName = (payload.clientName || "").trim();
    const cleanClientEmail = (payload.clientEmail || "").trim();
    const cleanClientPhone = (payload.clientPhone || "").trim();
    let warning = "";
    try {
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
        ...(quotationDocument ? { quotationDocument } : {}),
        ...(responseLinks ? { clientResponseLinksSentAt: serverTimestamp() } : {}),
      });
    } catch (error) {
      warning = "Email sent, but the quotation status could not be updated.";
      console.error(JSON.stringify({ level: "error", msg: "quotation_email_status_sync_failed", requestId, quoteId: payload.quoteId }));
    }

    console.log(JSON.stringify({ level: "info", msg: "quotation_email_sent", requestId, quoteId: payload.quoteId, ms: Date.now() - startedAt }));
    return NextResponse.json({ ok: true, warning: warning || undefined }, { status: 200 });
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      msg: "quotation_email_failed",
      requestId,
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - startedAt,
    }));
    return NextResponse.json({ error: getPublicSendError(err) }, { status: 500 });
  }
}
