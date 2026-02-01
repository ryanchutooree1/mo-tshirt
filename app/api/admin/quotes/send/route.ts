import { NextResponse } from "next/server";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

type SendPayload = {
  quoteId: string;
  to: string;
  subject?: string;
  message?: string;
  pdfBase64: string;
  quote?: Record<string, unknown>;
};

function parsePdfBase64(input: string) {
  if (!input) return null;
  if (input.startsWith("data:")) {
    const [, base64] = input.split("base64,");
    return base64 ? Buffer.from(base64, "base64") : null;
  }
  return Buffer.from(input, "base64");
}

export async function POST(req: Request) {
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
    const rawFrom = process.env.SMTP_FROM;
    const from = rawFrom
      ? rawFrom.includes("@")
        ? rawFrom
        : user
          ? `${rawFrom} <${user}>`
          : rawFrom
      : user || "no-reply@example.com";

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

    const subject = payload.subject || "Your quotation from MO T-SHIRT";
    const message =
      payload.message ||
      "Hi! Please find your quotation attached.\n\nBest regards,\nMo T-Shirt Team";

    const mailOptions: Record<string, unknown> = {
      from,
      to: payload.to,
      subject,
      text: message,
      html: `<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#111;">
  <p>${message.replace(/\n/g, "<br/>")}</p>
</div>`,
      attachments: [
        {
          filename: `quotation-${payload.quoteId}.pdf`,
          content: buffer,
          contentType: "application/pdf",
        },
      ],
    };

    await transporter.sendMail(mailOptions);

    await updateDoc(doc(db, "quotes", payload.quoteId), {
      status: "sent",
      approvedAt: serverTimestamp(),
      sentAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      quote: payload.quote || null,
      lastEmailTo: payload.to,
      lastEmailSubject: subject,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("quotes:send", err);
    return NextResponse.json({ error: "Failed to send quote." }, { status: 500 });
  }
}
