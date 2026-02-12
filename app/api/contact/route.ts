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
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: string | number;
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

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let payload: ParsedPayload = { name: "", email: "", message: "" };

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
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
        attachmentUrl: form.get("attachmentUrl")?.toString(),
        attachmentName: form.get("attachmentName")?.toString(),
        attachmentType: form.get("attachmentType")?.toString(),
        attachmentSize: form.get("attachmentSize")?.toString(),
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
      attachmentUrl,
      attachmentName,
      attachmentType,
      attachmentSize,
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
    let attachment: { filename: string; content: Buffer; contentType?: string } | null = null;

    if (file) {
      const typeOk = allowedTypes.includes(file.type || "");
      const sizeOk = typeof file.size === "number" ? file.size <= maxSize : true;
      if (!typeOk) {
        return NextResponse.json({ error: "Unsupported file type. Use PNG, JPG, WEBP, SVG, HEIC, or PDF." }, { status: 400 });
      }
      if (!sizeOk) {
        return NextResponse.json({ error: "File too large. Max 5MB." }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      attachment = {
        filename: file.name || "attachment",
        content: buffer,
        contentType: file.type || undefined,
      };
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = String(process.env.SMTP_SECURE || "true") === "true";
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const rawFrom = process.env.SMTP_FROM;
    const from = rawFrom
      ? rawFrom.includes("@")
        ? rawFrom
        : user
          ? `${rawFrom} <${user}>`
          : rawFrom
      : user || "no-reply@example.com";

    const formatValue = (value: string | number | null | undefined) => {
      const trimmed = value === undefined || value === null ? "" : String(value).trim();
      return trimmed ? trimmed : "n/a";
    };
    const notesValue = notes && notes.trim() ? notes : safeMessage;
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

    const attachmentMeta = file
      ? {
          filename: file.name || "attachment",
          contentType: file.type || "application/octet-stream",
          size: typeof file.size === "number" ? file.size : null,
        }
      : null;

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
        attachment: attachmentUrl
          ? {
              url: attachmentUrl,
              filename: attachmentName || attachmentMeta?.filename || "attachment",
              contentType: attachmentType || attachmentMeta?.contentType || "application/octet-stream",
              size:
                typeof attachmentSize === "string"
                  ? Number(attachmentSize)
                  : typeof attachmentSize === "number"
                    ? attachmentSize
                    : attachmentMeta?.size || null,
            }
          : attachmentMeta,
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
      "",
      "Delivery Info:",
      `  Name: ${formatValue(deliveryName)}`,
      `  Address: ${formatValue(deliveryAddress)}`,
      `  Post code: ${formatValue(deliveryPostCode)}`,
      `  Phone: ${formatValue(deliveryPhone)}`,
    ];
    const text = textLines.join("\n");

    const contactRows = [
      ["Name", safeName],
      ["Email", safeEmail],
      ["Phone", safePhone],
    ];
    const orderRows = [
      ["Garments", garmentsSummary],
      ["Print method", printMethod],
      ["Deadline", deadline],
      ["Notes", notesValue],
      ["Delivery", delivery],
    ];
    const deliveryRows = [
      ["Name", deliveryName],
      ["Address", deliveryAddress],
      ["Post code", deliveryPostCode],
      ["Phone", deliveryPhone],
    ];
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
        if (attachment) {
          mailOptions.attachments = [attachment];
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
