import { NextResponse } from "next/server";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  formatQuoteGarmentDescription,
  type QuoteGarmentLine,
} from "@/lib/shops";
import {
  CONTACT_RATE_LIMIT,
  evaluateRequestRateLimit,
  getRateLimitHeaders,
  isContentLengthWithinLimit,
  isRequestOriginAllowed,
} from "@/lib/request-safety";
import { getQuotationNotificationRecipients } from "@/lib/quotation-notification-settings";
import { storePublicUploadBuffer } from "@/lib/public-upload-store";

type ParsedPayload = {
  name: string;
  email: string;
  message: string;
  website?: string;
  phone?: string;
  garment?: string;
  color?: string;
  size?: string;
  printMethod?: string;
  quantity?: string | number;
  deadline?: string;
  notes?: string;
  source?: string;
  file?: File | null;
  delivery?: string;
  deliveryName?: string;
  deliveryAddress?: string;
  deliveryPostCode?: string;
  deliveryPhone?: string;
  garments?: QuoteGarmentLine[] | string;
  attachments?:
    | {
        label?: string;
        description?: string;
        quantity?: string | number | null;
        url?: string;
        filename?: string;
        contentType?: string;
        size?: string | number | null;
      }[]
    | string;
  files?: File[];
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: string | number;
  designBrief?: string | Record<string, unknown>;
};

type QuoteAttachment = {
  label?: string;
  description?: string;
  quantity?: string | number | null;
  url?: string;
  filename?: string;
  contentType?: string;
  size?: number | null;
};

function isValidEmail(email: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parseAttachmentList(value: unknown): QuoteAttachment[] {
  if (!value) return [];

  const normalizeAttachment = (entry: unknown): QuoteAttachment | null => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const source = entry as Record<string, unknown>;
    const label = typeof source.label === "string" ? source.label.trim() : "";
    const description = typeof source.description === "string" ? source.description.trim() : "";
    const quantity =
      typeof source.quantity === "number"
        ? source.quantity
        : typeof source.quantity === "string" && source.quantity.trim()
          ? source.quantity.trim()
          : null;
    const url = typeof source.url === "string" ? source.url.trim() : "";
    const filename = typeof source.filename === "string" ? source.filename.trim() : "";
    const contentType = typeof source.contentType === "string" ? source.contentType.trim() : "";
    const rawSize = source.size;
    const parsedSize =
      typeof rawSize === "number"
        ? rawSize
        : typeof rawSize === "string" && rawSize.trim()
          ? Number(rawSize)
          : null;

    if (!label && !description && !quantity && !url && !filename && !contentType && parsedSize === null) {
      return null;
    }

    return {
      ...(label ? { label } : {}),
      ...(description ? { description } : {}),
      ...(quantity !== null ? { quantity } : {}),
      ...(url ? { url } : {}),
      ...(filename ? { filename } : {}),
      ...(contentType ? { contentType } : {}),
      ...(Number.isFinite(parsedSize) ? { size: parsedSize as number } : {}),
    };
  };

  if (Array.isArray(value)) {
    return value.map(normalizeAttachment).filter((entry): entry is QuoteAttachment => Boolean(entry));
  }
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map(normalizeAttachment).filter((entry): entry is QuoteAttachment => Boolean(entry))
      : [];
  } catch {
    return [];
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CONTACT_REQUEST_BYTES = 15 * 1024 * 1024;
const MAX_CONTACT_NAME_LENGTH = 120;
const MAX_CONTACT_EMAIL_LENGTH = 254;
const MAX_CONTACT_PHONE_LENGTH = 40;
const MAX_CONTACT_MESSAGE_LENGTH = 2_000;
const MAX_CONTACT_NOTES_LENGTH = 4_000;
const MAX_EMAIL_ATTACHMENT_COUNT = 12;
const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024;

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

export async function POST(req: Request) {
  const rateLimitResult = evaluateRequestRateLimit(req.headers, CONTACT_RATE_LIMIT);
  const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
  const json = (body: Record<string, unknown>, status: number) =>
    NextResponse.json(body, { status, headers: rateLimitHeaders });

  if (!rateLimitResult.allowed) {
    return json(
      {
        error: rateLimitResult.blocked
          ? "Too many requests. Please try again in 30 minutes."
          : "Too many requests. Please wait a moment and try again.",
      },
      429
    );
  }

  if (!isRequestOriginAllowed(req)) {
    return json({ error: "Origin not allowed." }, 403);
  }

  if (!isContentLengthWithinLimit(req.headers, MAX_CONTACT_REQUEST_BYTES)) {
    return json({ error: "Payload too large." }, 413);
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let payload: ParsedPayload = { name: "", email: "", message: "" };

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const files = form
        .getAll("files")
        .filter((entry): entry is File => entry instanceof File && entry.size > 0);
      payload = {
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        message: String(form.get("message") ?? ""),
        website: form.get("website")?.toString(),
        phone: form.get("phone")?.toString(),
        garment: form.get("garment")?.toString(),
        color: form.get("color")?.toString(),
        size: form.get("size")?.toString(),
        printMethod: form.get("printMethod")?.toString(),
        quantity: form.get("quantity")?.toString(),
        deadline: form.get("deadline")?.toString(),
        notes: form.get("notes")?.toString(),
        source: form.get("source")?.toString(),
        delivery: form.get("delivery")?.toString(),
        deliveryName: form.get("deliveryName")?.toString(),
        deliveryAddress: form.get("deliveryAddress")?.toString(),
        deliveryPostCode: form.get("deliveryPostCode")?.toString(),
        deliveryPhone: form.get("deliveryPhone")?.toString(),
        garments: form.get("garments")?.toString(),
        attachments: form.get("attachments")?.toString(),
        files,
        attachmentUrl: form.get("attachmentUrl")?.toString(),
        attachmentName: form.get("attachmentName")?.toString(),
        attachmentType: form.get("attachmentType")?.toString(),
        attachmentSize: form.get("attachmentSize")?.toString(),
        designBrief: form.get("designBrief")?.toString(),
        file: form.get("file") instanceof File ? (form.get("file") as File) : null,
      };
    } else {
      const json = await req.json();
      payload = json;
    }

    const {
      name,
      email,
      message,
      website,
      phone,
      garment,
      color,
      size,
      printMethod,
      quantity,
      deadline,
      notes,
      source,
      file,
      delivery,
      deliveryName,
      deliveryAddress,
      deliveryPostCode,
      deliveryPhone,
      garments,
      attachments,
      files,
      attachmentUrl,
      attachmentName,
      attachmentType,
      attachmentSize,
      designBrief,
    } = payload;

    const safeName = String(name ?? "").trim();
    const safeEmail = String(email ?? "").trim();
    const safePhone = String(phone ?? "").trim();
    const safeMessage = String(message ?? "").trim();
    const safeNotes = String(notes ?? "").trim();
    const honeypot = String(website ?? "").trim();

    if (honeypot) {
      return json({ message: "Thanks! We received your message." }, 200);
    }

    if (
      safeName.length > MAX_CONTACT_NAME_LENGTH ||
      safeEmail.length > MAX_CONTACT_EMAIL_LENGTH ||
      safePhone.length > MAX_CONTACT_PHONE_LENGTH ||
      safeMessage.length > MAX_CONTACT_MESSAGE_LENGTH ||
      safeNotes.length > MAX_CONTACT_NOTES_LENGTH
    ) {
      return json({ error: "One or more fields are too long." }, 400);
    }

    if (!safeName || !safeMessage) {
      return json({ error: "Missing required fields." }, 400);
    }

    if (!safeEmail && !safePhone) {
      return json({ error: "Provide an email or phone number." }, 400);
    }

    if (safeEmail && !isValidEmail(safeEmail)) {
      return json({ error: "Invalid email." }, 400);
    }

    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/svg+xml",
      "image/heic",
      "image/heif",
      "application/pdf",
    ];
    const maxSize = 5 * 1024 * 1024; // 5MB
    const requestFiles = Array.isArray(files)
      ? files.filter((entry): entry is File => entry instanceof File && entry.size > 0)
      : file
        ? [file]
        : [];

    if (requestFiles.length > MAX_EMAIL_ATTACHMENT_COUNT) {
      return json({ error: "Too many files. Send up to 12 attachments." }, 400);
    }

    const totalAttachmentBytes = requestFiles.reduce(
      (sum, currentFile) => sum + (typeof currentFile.size === "number" ? currentFile.size : 0),
      0
    );
    if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return json({ error: "Attachments are too large. Keep the total under 15MB." }, 400);
    }

    const emailAttachments: { filename: string; content: Buffer; contentType?: string }[] = [];
    const acceptedFiles: { file: File; buffer: Buffer }[] = [];

    for (const currentFile of requestFiles) {
      const typeOk = allowedTypes.includes(currentFile.type || "");
      const sizeOk = typeof currentFile.size === "number" ? currentFile.size <= maxSize : true;
      if (!typeOk) {
        return json({ error: "Unsupported file type. Use PNG, JPG, WEBP, SVG, HEIC, or PDF." }, 400);
      }
      if (!sizeOk) {
        return json({ error: "File too large. Max 5MB per file." }, 400);
      }
      const buffer = Buffer.from(await currentFile.arrayBuffer());
      acceptedFiles.push({ file: currentFile, buffer });
      emailAttachments.push({
        filename: currentFile.name || "attachment",
        content: buffer,
        contentType: currentFile.type || undefined,
      });
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = String(process.env.SMTP_SECURE || "true") === "true";
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = resolveFromAddress(process.env.SMTP_FROM, user);

    const formatValue = (value: unknown) => {
      const trimmed = value === undefined || value === null ? "" : String(value).trim();
      return trimmed ? trimmed : "n/a";
    };
    const parsedDesignBrief = parseJsonObject(designBrief);
    const notesValue = parsedDesignBrief
      ? safeNotes
      : safeNotes
        ? safeNotes
        : safeMessage;
    const sourceValue = formatValue(source);
    const parsedGarments: QuoteGarmentLine[] = (() => {
      if (!garments) return [];
      if (Array.isArray(garments)) return garments;
      if (typeof garments === "string") {
        try {
          const parsed = JSON.parse(garments);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    })();
    const formatGarmentLine = (entry: QuoteGarmentLine) => {
      const garmentName = formatQuoteGarmentDescription(entry);
      const quantityValue = formatValue(entry.quantity);
      return `${garmentName} x ${quantityValue}`;
    };
    const garmentsSummary = parsedGarments.length
      ? parsedGarments.map(formatGarmentLine).join(", ")
      : formatGarmentLine({ garment, color, size, quantity });
    const parsedAttachments = parseAttachmentList(attachments);
    if (parsedAttachments.length > MAX_EMAIL_ATTACHMENT_COUNT) {
      return json({ error: "Too many artwork attachments." }, 400);
    }
    const uploadSessionId = `quote-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    const uploadedRequestAttachments = await Promise.all(
      acceptedFiles.map(async ({ file: currentFile, buffer }, index) => {
        const upload = await storePublicUploadBuffer({
          buffer,
          filename: currentFile.name || `attachment-${index + 1}`,
          contentType: currentFile.type || "application/octet-stream",
          size: currentFile.size || buffer.byteLength,
          sessionId: uploadSessionId,
          sessionPrefix: "quote",
          source: "quote-form-upload",
          maxUploadBytes: maxSize,
        });

        return {
          url: upload.url,
          filename: upload.filename,
          contentType: upload.contentType,
          size: upload.size,
        } satisfies QuoteAttachment;
      })
    );
    const storedAttachments: QuoteAttachment[] = (() => {
      const normalizedAttachments = parsedAttachments.map((entry, index) => {
        const uploadedAttachment = uploadedRequestAttachments[index];

        return {
          ...entry,
          url: entry.url || uploadedAttachment?.url,
          filename:
            entry.filename ||
            uploadedAttachment?.filename ||
            requestFiles[index]?.name ||
            "attachment",
          contentType:
            entry.contentType ||
            uploadedAttachment?.contentType ||
            requestFiles[index]?.type ||
            "application/octet-stream",
          size:
            typeof entry.size === "number"
              ? entry.size
              : uploadedAttachment?.size ??
                (typeof requestFiles[index]?.size === "number"
                  ? requestFiles[index].size
                  : null),
        };
      });
      if (normalizedAttachments.length) return normalizedAttachments;

      if (attachmentUrl || attachmentName || attachmentType || attachmentSize || requestFiles.length) {
        const fallbackFile = requestFiles[0] || null;
        const fallbackUpload = uploadedRequestAttachments[0];
        const fallbackSize =
          typeof attachmentSize === "string" && attachmentSize.trim()
            ? Number(attachmentSize)
            : typeof attachmentSize === "number"
              ? attachmentSize
              : typeof fallbackUpload?.size === "number"
                ? fallbackUpload.size
              : typeof fallbackFile?.size === "number"
                ? fallbackFile.size
                : null;

        return [
          {
            url: attachmentUrl || fallbackUpload?.url,
            filename: attachmentName || fallbackUpload?.filename || fallbackFile?.name || "attachment",
            contentType:
              attachmentType ||
              fallbackUpload?.contentType ||
              fallbackFile?.type ||
              "application/octet-stream",
            size: Number.isFinite(fallbackSize) ? Number(fallbackSize) : null,
          },
        ];
      }

      return [];
    })();
    const formatAttachmentValue = (entry: QuoteAttachment, index: number) => {
      const lines = [
        entry.filename || `attachment-${index + 1}`,
        entry.label ? `Label: ${entry.label}` : "",
        entry.description ? `Description: ${entry.description}` : "",
        entry.quantity ? `Qty: ${entry.quantity}` : "",
        entry.url ? `URL: ${entry.url}` : "URL: Attached to email",
      ].filter(Boolean);
      return lines.join("\n");
    };

    let quoteId: string | null = null;
    try {
      const ref = await addDoc(collection(db, "quotes"), {
        name: safeName,
        email: safeEmail,
        phone: safePhone,
        message: safeMessage,
        garments: parsedGarments.length
          ? parsedGarments
          : [{ garment, color, size, quantity }],
        printMethod: printMethod || "",
        quantity: quantity || "",
        deadline: deadline || "",
        notes: notesValue || "",
        source: sourceValue || "",
        delivery: delivery || "",
        deliveryName: deliveryName || "",
        deliveryAddress: deliveryAddress || "",
        deliveryPostCode: deliveryPostCode || "",
        deliveryPhone: deliveryPhone || "",
        designBrief: parsedDesignBrief,
        attachments: storedAttachments,
        attachment: storedAttachments[0] || null,
        status: "new",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      quoteId = ref.id;
    } catch (err) {
      console.error("quotes:add", err);
    }

    const textLines = [
      "New Quotation Request",
      `Source: ${sourceValue}`,
      "",
      "Client Info:",
      `  Name: ${formatValue(safeName)}`,
      `  Email: ${formatValue(safeEmail)}`,
      `  Phone: ${formatValue(safePhone)}`,
      "",
      "Order Details:",
      `  Garments: ${garmentsSummary}`,
      `  Print method: ${formatValue(printMethod)}`,
      `  Deadline: ${formatValue(deadline)}`,
      `  Notes: ${formatValue(notesValue)}`,
      `  Delivery: ${formatValue(delivery)}`,
    ];
    if (storedAttachments.length) {
      textLines.push("", "Artwork Files:");
      storedAttachments.forEach((entry, index) => {
        textLines.push(`  ${index + 1}. ${formatAttachmentValue(entry, index).replace(/\n/g, " | ")}`);
      });
    }
    textLines.push(
      "",
      "Delivery Info:",
      `  Name: ${formatValue(deliveryName)}`,
      `  Address: ${formatValue(deliveryAddress)}`,
      `  Post code: ${formatValue(deliveryPostCode)}`,
      `  Phone: ${formatValue(deliveryPhone)}`
    );
    const text = textLines.join("\n");

    const contactRows: [string, unknown][] = [
      ["Name", safeName],
      ["Email", safeEmail],
      ["Phone", safePhone],
    ];
    const orderRows: [string, unknown][] = [
      ["Garments", garmentsSummary],
      ["Print method", printMethod],
      ["Deadline", deadline],
      ["Notes", notesValue],
      ["Delivery", delivery],
    ];
    const deliveryRows: [string, unknown][] = [
      ["Name", deliveryName],
      ["Address", deliveryAddress],
      ["Post code", deliveryPostCode],
      ["Phone", deliveryPhone],
    ];
    const attachmentRows: [string, unknown][] = storedAttachments.map((entry, index) => [
      entry.label || `Design ${index + 1}`,
      formatAttachmentValue(entry, index),
    ]);
    const renderRow = (label: string, value: unknown) => {
      const safeValue = escapeHtml(formatValue(value)).replace(/\n/g, "<br/>");
      const labelStyle = "padding:6px 12px 6px 0; font-weight:700; vertical-align:top; white-space:nowrap;";
      const valueStyle = "padding:6px 0; color:#111;";
      return `<tr>
  <td style="${labelStyle}">${escapeHtml(label)}</td>
  <td style="${valueStyle}">${safeValue}</td>
</tr>`;
    };
    const renderSection = (title: string, rows: [string, unknown][]) => {
      const sectionHeader = `<tr>
  <td colspan="2" style="padding:10px 0 6px; font-weight:800; font-size:15px; border-bottom:1px solid #e5e7eb; color:#111;">${escapeHtml(title)}</td>
</tr>`;
      const sectionRows = rows.map(([label, value]) => renderRow(label, value)).join("");
      return `${sectionHeader}${sectionRows}`;
    };
    const htmlRows = [
      renderSection("Client Info", contactRows),
      `<tr><td colspan="2" style="height:10px;"></td></tr>`,
      renderSection("Order Details", orderRows),
      `<tr><td colspan="2" style="height:10px;"></td></tr>`,
      storedAttachments.length
        ? `${renderSection("Artwork Files", attachmentRows)}<tr><td colspan="2" style="height:10px;"></td></tr>`
        : "",
      renderSection("Delivery Info", deliveryRows),
    ].join("");
    const html = `<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#111;">
  <div style="margin:0 0 6px; font-size:20px; font-weight:800;">New Quotation Request</div>
  <div style="margin:0 0 14px; font-size:16px; font-weight:700; color:#111;">Source: ${escapeHtml(sourceValue)}</div>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; max-width:520px;">
    ${htmlRows}
  </table>
</div>`;

    if (host && user && pass) {
      try {
        // @ts-expect-error nodemailer may not be installed yet
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass },
        });

        const subject = `New Website Quotation from ${safeName}`;
        const notificationRecipients = await getQuotationNotificationRecipients();
        const mailOptions: Record<string, unknown> = {
          from,
          to: notificationRecipients.length ? notificationRecipients.join(", ") : user,
          subject,
          text,
          html,
        };
        if (safeEmail) {
          mailOptions.replyTo = safeEmail;
        }
        if (emailAttachments.length) {
          mailOptions.attachments = emailAttachments;
        }
        await transporter.sendMail(mailOptions);
        return json({ message: "Thanks! We received your message.", quoteId }, 200);
      } catch {
        // Fall through to success without email if nodemailer not available
        return json({ message: "Received. Email not sent (mailer unavailable).", quoteId }, 200);
      }
    }

    // No SMTP configured; acknowledge without sending
    return json({ message: "Received. Email disabled.", quoteId }, 200);
  } catch {
    return json({ error: "Invalid payload." }, 400);
  }
}
