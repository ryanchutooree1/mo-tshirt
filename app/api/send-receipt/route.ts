// app/api/send-email/route.ts
import nodemailer from 'nodemailer';
import { NextResponse } from 'next/server';

type Body = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

export async function POST(req: Request) {
  try {
    const body: Body = await req.json();
    const { to, subject, text = '', html = '' } = body;

    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = (String(process.env.SMTP_SECURE || 'true') === 'true') || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || user;

    if (!user || !pass) {
      return NextResponse.json({ error: 'SMTP credentials not configured' }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    // Optional: verify connection (helpful when debugging deployment)
    await transporter.verify();

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    // don't leak full info in production logs; return the id for debug
    return NextResponse.json({ ok: true, messageId: info.messageId });
  } catch (err: any) {
    // log error server-side, but return a clean message
    const message = err?.message || String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
