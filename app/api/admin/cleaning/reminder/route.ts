import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-request";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ReminderTask = {
  title: string;
  detail: string;
};

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] || character);
}

function formatFrom(name: string, address: string) {
  const cleanName = name.replace(/[<>\"]/g, "").trim();
  return cleanName ? `${cleanName} <${address}>` : address;
}

function resolveFromAddress(rawFrom: string | undefined, smtpUser: string) {
  const safeFallback = EMAIL_RE.test(smtpUser) ? smtpUser : "no-reply@example.com";
  const raw = (rawFrom || "").trim();
  if (!raw) return formatFrom("MO T-SHIRT", safeFallback);
  const bracketMatch = raw.match(/^(.*)<([^>]*)>\s*$/);
  if (bracketMatch) {
    const address = (bracketMatch[2] || "").trim();
    return formatFrom((bracketMatch[1] || "MO T-SHIRT").trim(), EMAIL_RE.test(address) ? address : safeFallback);
  }
  return EMAIL_RE.test(raw) ? raw : formatFrom(raw, safeFallback);
}

function normalizeTasks(value: unknown): ReminderTask[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 60).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    const title = clean(raw.title, 160);
    if (!title) return [];
    return [{ title, detail: clean(raw.detail, 500) }];
  });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest("/api/admin/cleaning/reminder"))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const recipient = clean(body.recipient, 320).toLowerCase();
    const senderName = body.senderName === "Tanvi" ? "Tanvi" : "Ryan";
    const sundayLabel = clean(body.sundayLabel, 80) || "this Sunday";
    const notes = clean(body.notes, 2_000);
    const tasks = normalizeTasks(body.tasks);

    if (!EMAIL_RE.test(recipient)) {
      return NextResponse.json({ error: "Add a valid recipient email." }, { status: 400 });
    }
    if (!tasks.length) {
      return NextResponse.json({ error: "Add at least one cleaning task." }, { status: 400 });
    }

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER || "";
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
      return NextResponse.json({ error: "Email delivery is not configured." }, { status: 503 });
    }

    const textTasks = tasks.map((task, index) => `${index + 1}. ${task.title}${task.detail ? `\n   ${task.detail}` : ""}`).join("\n");
    const htmlTasks = tasks.map((task, index) => `
      <tr>
        <td style="width:34px;padding:14px 8px 14px 14px;border-bottom:1px solid #e5e7eb;color:#64748b;font-weight:700;vertical-align:top">${String(index + 1).padStart(2, "0")}</td>
        <td style="padding:14px 14px 14px 8px;border-bottom:1px solid #e5e7eb">
          <strong style="display:block;color:#17221f">${escapeHtml(task.title)}</strong>
          ${task.detail ? `<span style="display:block;margin-top:3px;color:#64748b;font-size:14px">${escapeHtml(task.detail)}</span>` : ""}
        </td>
      </tr>`).join("");
    const notesText = notes ? `\n\nNotes for this Sunday:\n${notes}` : "";
    const notesHtml = notes ? `<div style="margin-top:20px;padding:16px;border-radius:12px;background:#f1f5f3"><strong>Notes for this Sunday</strong><p style="margin:6px 0 0;white-space:pre-wrap;color:#475569">${escapeHtml(notes)}</p></div>` : "";

    // @ts-expect-error nodemailer does not ship local declarations in this project.
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || "true") === "true",
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    await transporter.sendMail({
      from: resolveFromAddress(process.env.SMTP_FROM, user),
      to: recipient,
      subject: `Sunday cleaning plan — ${sundayLabel}`,
      text: `Hello Adel,\n\nHere is the cleaning routine for ${sundayLabel}. Please follow the tasks in this order.\n\nTime: 8:30 AM – 12:00 PM\nPickup: Taxi Stand, Chemin Grenier\n\n${textTasks}${notesText}\n\nThank you,\n${senderName}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#17221f;max-width:620px;margin:auto">
        <div style="padding:24px;border-radius:18px 18px 0 0;background:#172f4a;color:#fff">
          <div style="color:#9cf5c9;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Sunday cleaning</div>
          <h1 style="margin:7px 0 0;font-size:26px">Tasks for ${escapeHtml(sundayLabel)}</h1>
          <p style="margin:8px 0 0;color:#d7e5df">8:30 AM – 12:00 PM · Taxi Stand, Chemin Grenier</p>
        </div>
        <div style="padding:24px;border:1px solid #dfe7e3;border-top:0;border-radius:0 0 18px 18px">
          <p>Hello Adel,</p>
          <p>Please follow these cleaning tasks in order:</p>
          <table style="width:100%;margin-top:18px;border-collapse:collapse;border:1px solid #dfe7e3;border-radius:12px">${htmlTasks}</table>
          ${notesHtml}
          <p style="margin:24px 0 0">Thank you,<br><strong>${senderName}</strong></p>
        </div>
      </div>`,
    });

    return NextResponse.json({ sent: true });
  } catch {
    return NextResponse.json({ error: "The cleaning reminder email could not be sent." }, { status: 500 });
  }
}
