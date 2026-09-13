import { NextResponse } from "next/server";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { isAdminRequest } from "@/lib/admin-request";
import { db } from "@/lib/firebase";
import {
  escapeHtml,
  FOOD_REMINDER_TIME,
  getMauritiusClock,
  getMauritiusPlanningWeekKey,
  normalizeRecipients,
} from "@/lib/food-planning";
import { getProductionManager } from "@/lib/partner-registry";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";

type CoupleSettings = {
  emailEnabled?: boolean;
  weeklyEmailEnabled?: boolean;
  weeklyPlannerEmail?: string;
  recipients?: unknown;
  lastWeeklyPlannerEmailDayKey?: string;
  lastWeeklyPlannerEmailHourKey?: string;
  weeklyPlanConfirmedWeekKey?: string;
};

type CoupleData = {
  settings?: CoupleSettings;
  foodPlan?: Record<string, unknown>;
  eatOutside?: Record<string, unknown>;
};

const STORAGE_DOC = doc(db, "coupleGoals", "workspace");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FOOD_PLANNING_URL = `${SITE_URL}/admin/tanvi-home`;

function isCronAuthorized(req: Request) {
  const secret = String(process.env.CRON_SECRET || process.env.IOT_CRON_SECRET || "").trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function formatFrom(name: string, address: string) {
  const cleanName = name.replace(/[<>"]/g, "").trim();
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

function buildWeeklyPlannerEmail(
  foodPlan: Record<string, unknown> | undefined,
  eatOutside: Record<string, unknown> | undefined,
  isReminder: boolean
) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const rows = days.map((day) => {
    const food =
      eatOutside?.[day] === true
        ? "Eat Outside"
        : typeof foodPlan?.[day] === "string" && foodPlan[day].trim()
          ? foodPlan[day].trim()
          : "Not planned";
    return { day, food };
  });
  const textPlan = rows.map(({ day, food }) => `${day}: ${food}`).join("\n");
  const htmlPlan = rows
    .map(
      ({ day, food }) =>
        `<tr><td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-weight:700">${day}</td><td style="padding:7px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml(food)}</td></tr>`
    )
    .join("");

  return {
    subject: isReminder ? "Reminder: Confirm this week's meals" : "Plan this week's meals",
    text: `Good morning Tanvi,\n\nPlease fill or update the food plan for the whole week. When the plan is ready, press Confirm This Week's Plan on the website to stop the hourly reminders.\n\nCurrent plan:\n${textPlan}\n\nReview and confirm Food Planning: ${FOOD_PLANNING_URL}\n\nIf your remembered login has expired, sign in and you will be returned directly to Food Planning.`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#111827;max-width:600px;margin:auto">
  <h1 style="font-size:25px;margin:0 0 12px">${isReminder ? "Reminder: confirm this week&apos;s meals" : "Plan this week&apos;s meals"}</h1>
  <p>Good morning Tanvi,</p>
  <p>Please fill or update the food plan for the whole week.</p>
  <p>When the plan is ready, press <strong>Confirm This Week&apos;s Plan</strong> on the website to stop the hourly reminders.</p>
  <table style="width:100%;border-collapse:collapse;margin:20px 0;border:1px solid #e5e7eb;border-radius:12px">${htmlPlan}</table>
  <p style="margin:26px 0"><a href="${FOOD_PLANNING_URL}" style="display:inline-block;padding:13px 22px;border-radius:10px;background:#059669;color:#fff;text-decoration:none;font-weight:700">Review and Confirm Food Plan</a></p>
  <p style="font-size:13px;color:#6b7280">If your remembered login has expired, sign in and you will be returned directly to Food Planning.</p>
</div>`,
  };
}

async function loadCoupleData() {
  const snapshot = await getDoc(STORAGE_DOC);
  return (snapshot.exists() ? snapshot.data() : {}) as CoupleData;
}

async function sendWeeklyPlannerEmail(action: "manual" | "cron") {
  const data = await loadCoupleData();
  const settings = data.settings || {};
  const now = new Date();
  const clock = getMauritiusClock(now);
  const enabled = settings.weeklyEmailEnabled ?? settings.emailEnabled ?? true;
  const hour = Number(clock.hhmm.slice(0, 2));
  const hourKey = `${clock.dayKey}T${String(hour).padStart(2, "0")}`;
  const weekKey = getMauritiusPlanningWeekKey(now);

  if (action === "cron" && !enabled) {
    return { sent: false, reason: "Weekly food-planning email is paused." };
  }
  if (action === "cron" && clock.weekday !== "Sunday") {
    return { sent: false, reason: "Weekly food-planning email is only sent on Sunday." };
  }
  if (action === "cron" && hour < 8) {
    return { sent: false, reason: "Sunday food-planning emails begin at 08:00 Mauritius time." };
  }
  if (action === "cron" && settings.weeklyPlanConfirmedWeekKey === weekKey) {
    return { sent: false, reason: "This week's food plan is confirmed." };
  }
  if (action === "cron" && settings.lastWeeklyPlannerEmailHourKey === hourKey) {
    return { sent: false, reason: "The reminder for this hour was already sent." };
  }

  const manager = await getProductionManager();
  const recipient = String(settings.weeklyPlannerEmail || manager.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(recipient)) {
    return { sent: false, reason: "Add a valid weekly planner email in Food Planning.", status: 400 };
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return { sent: false, reason: "Email delivery is not configured.", status: 503 };
  }

  const isReminder = settings.lastWeeklyPlannerEmailDayKey === clock.dayKey;
  const message = buildWeeklyPlannerEmail(data.foodPlan, data.eatOutside, isReminder);
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
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  await setDoc(
    STORAGE_DOC,
    {
      settings: {
        ...settings,
        recipients: normalizeRecipients(settings.recipients),
        sendTime: FOOD_REMINDER_TIME,
        weeklyEmailEnabled: enabled,
        weeklyPlannerEmail: recipient,
        lastWeeklyPlannerEmailDayKey: clock.dayKey,
        lastWeeklyPlannerEmailHourKey: hourKey,
        lastWeeklyPlannerEmailSentAt: serverTimestamp(),
      },
    },
    { merge: true }
  );

  return { sent: true, day: clock.weekday, reminder: isReminder };
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized scheduler request." }, { status: 401 });
  }
  try {
    const result = await sendWeeklyPlannerEmail("cron");
    return NextResponse.json(result, { status: result.status || 200 });
  } catch {
    return NextResponse.json({ error: "Weekly food-planning email failed." }, { status: 500 });
  }
}

export async function POST() {
  if (!(await isAdminRequest("/api/admin/couple-goals/food-email"))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  try {
    const result = await sendWeeklyPlannerEmail("manual");
    return NextResponse.json(result, { status: result.status || 200 });
  } catch {
    return NextResponse.json({ error: "Weekly food-planning email failed." }, { status: 500 });
  }
}
