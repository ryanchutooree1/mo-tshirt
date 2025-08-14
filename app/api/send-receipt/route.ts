import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const { to, subject, text, pdfUrl } = await req.json();
    if (!to || !pdfUrl) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    // Fetch the PDF into a Buffer (to attach)
    const res = await fetch(pdfUrl);
    if (!res.ok) throw new Error('Failed to fetch PDF from storage');
    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,          // e.g. 'smtp.gmail.com'
      port: Number(process.env.SMTP_PORT),  // e.g. 465
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
      auth: {
        user: process.env.SMTP_USER,        // your SMTP user
        pass: process.env.SMTP_PASS,        // your SMTP password/app password
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: subject || 'Your Receipt',
      text: text || 'Please find your receipt attached.',
      attachments: [
        {
          filename: 'receipt.pdf',
          content: buf,
          contentType: 'application/pdf',
        },
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to send email' }, { status: 500 });
  }
}