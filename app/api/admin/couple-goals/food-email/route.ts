import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { hasAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/firebase";

export const runtime = "nodejs";

type CoupleSettings = {
  sendTime?: string;
  emailEnabled?: boolean;
  recipients?: unknown;
  lastFoodEmailDayKey?: string;
};

type CoupleData = {
  settings?: CoupleSettings;
  foodPlan?: Record<string, unknown>;
};

type FoodEmailAction = "manual" | "test" | "cron";

const STORAGE_DOC = doc(db, "coupleGoals", "workspace");
const MAURITIUS_TIMEZONE = "Indian/Mauritius";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatFrom(name: string, address: string) {
  const cleanName = name.replace(/[<>"]/g, "").trim();
  return cleanName ? `${cleanName} <${address}>` : address;
}

function resolveFromAddress(rawFrom: string | undefined, smtpUser: string | undefined) {
  const fallbackAddress = (smtpUser || "").trim();
  const safeFallbackAddress = EMAIL_RE.test(fallbackAddress)
    ? fallbackAddress
    : "no-reply@example.com";
  const fallbackName = "MO T-SHIRT";
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

function getMauritiusClock(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: MAURITIUS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(now);
  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";

  return {
    dayKey: `${read("year")}-${read("month")}-${read("day")}`,
    weekday: read("weekday"),
    hhmm: `${read("hour")}:${read("minute")}`,
  };
}

function isCronAuthorized(req: Request) {
  const secret = String(process.env.CRON_SECRET || process.env.IOT_CRON_SECRET || "").trim();
  if (!secret) return process.env.NODE_ENV !== "production";

  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return false;
}

function normalizeRecipients(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
    .filter((email) => EMAIL_RE.test(email));
}

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function getFoodForDay(data: CoupleData, weekday: string) {
  const food = data.foodPlan?.[weekday];
  return typeof food === "string" && food.trim() ? food.trim() : "Not planned";
}

function buildEmail(weekday: string, food: string, test: boolean) {
  const subject = test ? "[Test] Today's Food Plan" : "Today's Food Plan";
  const text = `Good morning,

Today is ${weekday}.
Food planned for today: ${food}.

Have a good day.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111827">
  <p>Good morning,</p>
  <p>Today is <strong>${weekday}</strong>.<br/>Food planned for today: <strong>${food}</strong>.</p>
  <p>Have a good day.</p>
</div>`;

  return { subject, text, html };
}

async function loadCoupleData() {
  const snapshot = await getDoc(STORAGE_DOC);
  return (snapshot.exists() ? snapshot.data() : {}) as CoupleData;
}

async function sendFoodEmail(action: FoodEmailAction) {
  const data = await loadCoupleData();
  const settings = data.settings || {};
  const clock = getMauritiusClock();
  const sendTime = isValidTime(settings.sendTime) ? settings.sendTime : "07:00";
  const recipients = normalizeRecipients(settings.recipients);

  if (action === "cron") {
    if (settings.emailEnabled === false) {
      return { sent: false, reason: "Food email is disabled." };
    }
    if (clock.hhmm < sendTime) {
      return { sent: false, reason: `Not due yet. Due at ${sendTime} ${MAURITIUS_TIMEZONE}.` };
    }
    if (settings.lastFoodEmailDayKey === clock.dayKey) {
      return { sent: false, reason: "Already sent today." };
    }
  }

  if (recipients.length === 0) {
    return { sent: false, reason: "No valid recipients configured.", status: 400 };
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || "true") === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = resolveFromAddress(process.env.SMTP_FROM, user);

  if (!host || !user || !pass) {
    return { sent: false, reason: "Email not configured.", status: 500 };
  }

  const food = getFoodForDay(data, clock.weekday);
  const message = buildEmail(clock.weekday, food, action === "test");
  // @ts-expect-error nodemailer does not ship local declarations in this project.
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: recipients.join(", "),
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  if (action !== "test") {
    await setDoc(
      STORAGE_DOC,
      {
        settings: {
          ...settings,
          recipients,
          sendTime,
          lastFoodEmailDayKey: clock.dayKey,
          lastFoodEmailSentAt: serverTimestamp(),
        },
      },
      { merge: true }
    );
  }

  return {
    sent: true,
    day: clock.weekday,
    food,
    recipients,
  };
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized scheduler request." }, { status: 401 });
  }

  try {
    const result = await sendFoodEmail("cron");
    return NextResponse.json(result, { status: result.status || 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Food email failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await hasAdminSession(await cookies()))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const payload = (await req.json().catch(() => ({}))) as { action?: string };
    const action: FoodEmailAction = payload.action === "test" ? "test" : "manual";
    const result = await sendFoodEmail(action);
    return NextResponse.json(result, { status: result.status || 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Food email failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
