import { NextResponse } from "next/server";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

type ParsedPayload = {
  name: string;
  email: string;
  message: string;
  phone?: string;
  garment?: string;
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
  garments?: { garment?: string; size?: string; quantity?: string | number }[] | string;
  attachments?:
    | {
        label?: string;
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

    if (!label && !quantity && !url && !filename && !contentType && parsedSize === null) {
      return null;
    }

    return {
      ...(label ? { label } : {}),
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
        phone: form.get("phone")?.toString(),
        garment: form.get("garment")?.toString(),
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
      phone,
      garment,
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

    if (!safeName || !safeMessage) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    if (!safeEmail && !safePhone) {
      return NextResponse.json({ error: "Provide an email or phone number." }, { status: 400 });
    }

    if (safeEmail && !isValidEmail(safeEmail)) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 });
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
    const emailAttachments: { filename: string; content: Buffer; contentType?: string }[] = [];

    for (const currentFile of requestFiles) {
      const typeOk = allowedTypes.includes(currentFile.type || "");
      const sizeOk = typeof currentFile.size === "number" ? currentFile.size <= maxSize : true;
      if (!typeOk) {
        return NextResponse.json(
          { error: "Unsupported file type. Use PNG, JPG, WEBP, SVG, HEIC, or PDF." },
          { status: 400 }
        );
      }
      if (!sizeOk) {
        return NextResponse.json({ error: "File too large. Max 5MB per file." }, { status: 400 });
      }
      const buffer = Buffer.from(await currentFile.arrayBuffer());
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
      ? String(notes ?? "").trim()
      : notes && notes.trim()
        ? notes
        : safeMessage;
    const sourceValue = formatValue(source);
    const parsedGarments: { garment?: string; size?: string; quantity?: string | number }[] = (() => {
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
    const formatGarmentLine = (entry: {
      garment?: string;
      size?: string;
      quantity?: string | number;
    }) => {
      const garmentName = formatValue(entry.garment);
      const sizeValue = formatValue(entry.size);
      const quantityValue = formatValue(entry.quantity);
      const sizeLabel = sizeValue !== "n/a" ? ` (${sizeValue})` : "";
      return `${garmentName}${sizeLabel} x ${quantityValue}`;
    };
    const garmentsSummary = parsedGarments.length
      ? parsedGarments.map(formatGarmentLine).join(", ")
      : formatGarmentLine({ garment, size, quantity });
    const parsedAttachments = parseAttachmentList(attachments);
    const storedAttachments: QuoteAttachment[] = (() => {
      const normalizedAttachments = parsedAttachments.map((entry, index) => ({
        ...entry,
        filename: entry.filename || requestFiles[index]?.name || "attachment",
        contentType: entry.contentType || requestFiles[index]?.type || "application/octet-stream",
        size:
          typeof entry.size === "number"
            ? entry.size
            : typeof requestFiles[index]?.size === "number"
              ? requestFiles[index].size
              : null,
      }));
      if (normalizedAttachments.length) return normalizedAttachments;

      if (attachmentUrl || attachmentName || attachmentType || attachmentSize || requestFiles.length) {
        const fallbackFile = requestFiles[0] || null;
        const fallbackSize =
          typeof attachmentSize === "string" && attachmentSize.trim()
            ? Number(attachmentSize)
            : typeof attachmentSize === "number"
              ? attachmentSize
              : typeof fallbackFile?.size === "number"
                ? fallbackFile.size
                : null;

        return [
          {
            url: attachmentUrl || undefined,
            filename: attachmentName || fallbackFile?.name || "attachment",
            contentType: attachmentType || fallbackFile?.type || "application/octet-stream",
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
        garments: parsedGarments.length ? parsedGarments : [{ garment, size, quantity }],
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
        const mailOptions: Record<string, unknown> = {
          from,
          to: user,
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
        return NextResponse.json(
          { message: "Thanks! We received your message.", quoteId },
          { status: 200 }
        );
      } catch {
        // Fall through to success without email if nodemailer not available
        return NextResponse.json(
          { message: "Received. Email not sent (mailer unavailable).", quoteId },
          { status: 200 }
        );
      }
    }

    // No SMTP configured; acknowledge without sending
    return NextResponse.json({ message: "Received. Email disabled.", quoteId }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
}
