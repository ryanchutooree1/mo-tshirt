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
};

function isValidEmail(email: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
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
        file: form.get("file") instanceof File ? (form.get("file") as File) : null,
      };
    } else {
      const json = await req.json();
      payload = json;
    }

    const { name, email, message, phone, garment, printMethod, quantity, deadline, notes, source, file, delivery } = payload;

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

    const extraLines = [
      `Phone: ${phone || "n/a"}`,
      `Garment: ${garment || "n/a"}`,
      `Print method: ${printMethod || "n/a"}`,
      `Quantity: ${quantity || "n/a"}`,
      `Deadline: ${deadline || "n/a"}`,
      `Notes: ${notes || "n/a"}`,
      `Source: ${source || "n/a"}`,
      `Delivery: ${delivery || "n/a"}`,
    ].join("\n");

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
        const text = `Name: ${name}\nEmail: ${email}\n${extraLines}\n\n${message}`;
        const mailOptions: Record<string, unknown> = {
          from,
          to: user,
          replyTo: email,
          subject,
          text,
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
