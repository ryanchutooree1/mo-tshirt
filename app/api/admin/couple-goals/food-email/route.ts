import { NextResponse } from "next/server";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { isAdminRequest } from "@/lib/admin-request";
import { buildFoodConfirmationUrl } from "@/lib/food-confirmation-links";
import {
  buildFoodReminderMessage,
  FOOD_REMINDER_TIME,
  getFoodForDay,
  getMauritiusClock,
  normalizeWhatsAppNumber,
} from "@/lib/food-planning";
import { db } from "@/lib/firebase";
import { dispatchWhatsAppMessage } from "@/lib/openclaw-whatsapp";

export const runtime = "nodejs";

type CoupleSettings = {
  emailEnabled?: boolean;
  whatsappEnabled?: boolean;
  whatsappNumber?: string;
  lastFoodReminderDayKey?: string;
};

type CoupleData = {
  settings?: CoupleSettings;
  foodPlan?: Record<string, unknown>;
};

const STORAGE_DOC = doc(db, "coupleGoals", "workspace");

function isCronAuthorized(req: Request) {
  const secret = String(process.env.CRON_SECRET || process.env.IOT_CRON_SECRET || "").trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function loadCoupleData() {
  const snapshot = await getDoc(STORAGE_DOC);
  return (snapshot.exists() ? snapshot.data() : {}) as CoupleData;
}

async function sendFoodConfirmationReminder(action: "manual" | "cron") {
  const data = await loadCoupleData();
  const settings = data.settings || {};
  const clock = getMauritiusClock();
  const enabled = settings.whatsappEnabled ?? settings.emailEnabled ?? true;
  const whatsappNumber = normalizeWhatsAppNumber(
    settings.whatsappNumber || process.env.FOOD_PLANNING_WHATSAPP_TO
  );

  if (action === "cron" && !enabled) {
    return { sent: false, reason: "Daily WhatsApp reminder is paused." };
  }
  if (action === "cron" && settings.lastFoodReminderDayKey === clock.dayKey) {
    return { sent: false, reason: "Today's WhatsApp reminder was already sent." };
  }
  if (!whatsappNumber) {
    return { sent: false, reason: "Add a valid WhatsApp number in Food Planning.", status: 400 };
  }

  const food = getFoodForDay(data.foodPlan, clock.weekday);
  if (!food) {
    return { sent: false, reason: `Add a food preset for ${clock.weekday}.`, status: 400 };
  }

  const confirmationUrl = buildFoodConfirmationUrl(clock.dayKey);
  const text = buildFoodReminderMessage(clock.weekday, food, confirmationUrl);
  const delivery = await dispatchWhatsAppMessage({
    to: whatsappNumber,
    text,
    template: {
      twilioContentSid: process.env.TWILIO_FOOD_REMINDER_CONTENT_SID?.trim(),
      metaTemplateName: process.env.WHATSAPP_FOOD_REMINDER_TEMPLATE?.trim(),
      metaLanguageCode: process.env.WHATSAPP_FOOD_REMINDER_TEMPLATE_LANGUAGE?.trim() || "en",
      parameters: [clock.weekday, food, confirmationUrl],
    },
  });

  if (delivery.simulated) {
    return {
      sent: false,
      reason: "WhatsApp delivery is not configured. Add Twilio or Meta credentials.",
      status: 503,
    };
  }

  await setDoc(
    STORAGE_DOC,
    {
      settings: {
        ...settings,
        sendTime: FOOD_REMINDER_TIME,
        whatsappEnabled: enabled,
        whatsappNumber,
        lastFoodReminderDayKey: clock.dayKey,
        lastFoodReminderSentAt: serverTimestamp(),
        lastFoodReminderProvider: delivery.provider,
        lastFoodReminderMessageId: delivery.messageId,
      },
    },
    { merge: true }
  );

  return { sent: true, day: clock.weekday, food, provider: delivery.provider };
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized scheduler request." }, { status: 401 });
  }
  try {
    const result = await sendFoodConfirmationReminder("cron");
    return NextResponse.json(result, { status: result.status || 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WhatsApp reminder failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  if (!(await isAdminRequest("/api/admin/couple-goals/food-email"))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  try {
    const result = await sendFoodConfirmationReminder("manual");
    return NextResponse.json(result, { status: result.status || 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WhatsApp reminder failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
