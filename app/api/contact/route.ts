import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { name, email, message } = await req.json();

    if (!name || !email || !message) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = String(process.env.SMTP_SECURE || "true") === "true";
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || user || "no-reply@example.com";

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
        const text = `Name: ${name}\nEmail: ${email}\n\n${message}`;
        await transporter.sendMail({ from, to: user, replyTo: email, subject, text });
        return NextResponse.json({ message: "Thanks! We received your message." }, { status: 200 });
      } catch {
        // Fall through to success without email if nodemailer not available
        return NextResponse.json({ message: "Received. Email not sent (mailer unavailable)." }, { status: 200 });
      }
    }

    // No SMTP configured; acknowledge without sending
    return NextResponse.json({ message: "Received. Email disabled." }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
}
