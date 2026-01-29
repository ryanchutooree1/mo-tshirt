import { NextResponse } from "next/server";

type ParsedPayload = {
  name: string;
  email: string;
  message: string;
  phone?: string;
  garment?: string;
  printMethod?: string;
  quantity?: string | number;
  deadline?: string;
  notes?: string;
  source?: string;
  file?: File | null;
  delivery?: string;
  deliveryName?: string;
  deliveryAddress?: string;
  deliveryPhone?: string;
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
        printMethod: form.get("printMethod")?.toString(),
        quantity: form.get("quantity")?.toString(),
        deadline: form.get("deadline")?.toString(),
        notes: form.get("notes")?.toString(),
        source: form.get("source")?.toString(),
        delivery: form.get("delivery")?.toString(),
        deliveryName: form.get("deliveryName")?.toString(),
        deliveryAddress: form.get("deliveryAddress")?.toString(),
        deliveryPhone: form.get("deliveryPhone")?.toString(),
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
      printMethod,
      quantity,
      deadline,
      notes,
      source,
      file,
      delivery,
      deliveryName,
      deliveryAddress,
      deliveryPhone,
    } = payload;

    if (!name || !email || !message) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    }

    const allowedTypes = ["image/png", "image/jpeg", "application/pdf"];
    const maxSize = 5 * 1024 * 1024; // 5MB
    let attachment: { filename: string; content: Buffer; contentType?: string } | null = null;

    if (file) {
      const typeOk = allowedTypes.includes(file.type || "");
      const sizeOk = typeof file.size === "number" ? file.size <= maxSize : true;
      if (!typeOk) {
        return NextResponse.json({ error: "Unsupported file type. Use PNG, JPG, or PDF." }, { status: 400 });
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
    const from = process.env.SMTP_FROM || user || "no-reply@example.com";

    const formatValue = (value: string | number | null | undefined) => {
      const trimmed = value === undefined || value === null ? "" : String(value).trim();
      return trimmed ? trimmed : "n/a";
    };
    const notesValue = notes && notes.trim() ? notes : message;
    const sourceValue = formatValue(source);
    const textLines = [
      `Source: ${sourceValue}`,
      `Name: ${formatValue(name)}`,
      `Email: ${formatValue(email)}`,
      `Phone: ${formatValue(phone)}`,
      `Garment: ${formatValue(garment)}`,
      `Print method: ${formatValue(printMethod)}`,
      `Quantity: ${formatValue(quantity)}`,
      `Deadline: ${formatValue(deadline)}`,
      `Notes: ${formatValue(notesValue)}`,
      `Delivery: ${formatValue(delivery)}`,
      `Delivery name: ${formatValue(deliveryName)}`,
      `Delivery address: ${formatValue(deliveryAddress)}`,
      `Delivery phone: ${formatValue(deliveryPhone)}`,
    ];
    const text = textLines.join("\n");

    const rows = [
      ["Source", source],
      ["Name", name],
      ["Email", email],
      ["Phone", phone],
      ["Garment", garment],
      ["Print method", printMethod],
      ["Quantity", quantity],
      ["Deadline", deadline],
      ["Notes", notesValue],
      ["Delivery", delivery],
      ["Delivery name", deliveryName],
      ["Delivery address", deliveryAddress],
      ["Delivery phone", deliveryPhone],
    ];
    const htmlRows = rows
      .map(([label, value]) => {
        const safeValue = escapeHtml(formatValue(value)).replace(/\n/g, "<br/>");
        const isSource = label === "Source";
        const labelStyle = isSource
          ? "padding:6px 12px 6px 0; font-weight:700; font-size:16px; vertical-align:top; white-space:nowrap;"
          : "padding:4px 12px 4px 0; font-weight:700; vertical-align:top; white-space:nowrap;";
        const valueStyle = isSource
          ? "padding:6px 0; color:#111; font-size:16px; font-weight:600;"
          : "padding:4px 0; color:#111;";
        return `<tr>
  <td style="${labelStyle}">${escapeHtml(label)}</td>
  <td style="${valueStyle}">${safeValue}</td>
</tr>`;
      })
      .join("");
    const html = `<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#111;">
  <p style="margin:0 0 12px;">New contact request</p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
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

        const subject = `New contact from ${name}`;
        const mailOptions: Record<string, unknown> = {
          from,
          to: user,
          replyTo: email,
          subject,
          text,
          html,
        };
        if (attachment) {
          mailOptions.attachments = [attachment];
        }
        await transporter.sendMail(mailOptions);
        return NextResponse.json({ message: "Thanks! We received your message." }, { status: 200 });
      } catch {
        // Fall through to success without email if nodemailer not available
        return NextResponse.json({ message: "Received. Email not sent (mailer unavailable)." }, { status: 200 });
      }
    }

    // No SMTP configured; acknowledge without sending
    return NextResponse.json({ message: "Received. Email disabled." }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
}
