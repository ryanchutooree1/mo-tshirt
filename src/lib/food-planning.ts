export const MAURITIUS_TIMEZONE = "Indian/Mauritius";
export const FOOD_REMINDER_TIME = "08:00";
export const WEEK_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type FoodWeekday = (typeof WEEK_DAYS)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[1-9]\d{7,14}$/;

export function getMauritiusClock(now = new Date()) {
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
    weekday: read("weekday") as FoodWeekday,
    hhmm: `${read("hour")}:${read("minute")}`,
  };
}

export function normalizeRecipients(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
        .filter((email) => EMAIL_RE.test(email))
    )
  );
}

export function normalizeWhatsAppNumber(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().replace(/^whatsapp:/i, "").replace(/[\s()-]/g, "");
  if (!PHONE_RE.test(normalized)) return "";
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}

export function normalizeFoodName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}

export function getFoodForDay(foodPlan: Record<string, unknown> | undefined, weekday: string) {
  return normalizeFoodName(foodPlan?.[weekday]);
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] || character;
  });
}

export function buildDinnerConfirmationEmail(weekday: string, food: string) {
  const safeWeekday = escapeHtml(weekday);
  const safeFood = escapeHtml(food);
  return {
    subject: `Tonight's dinner: ${food}`,
    text: `Dinner has been confirmed for tonight.\n\n${weekday}: ${food}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#111827">
  <p>Dinner has been confirmed for tonight.</p>
  <p><strong>${safeWeekday}: ${safeFood}</strong></p>
</div>`,
  };
}

export function buildFoodReminderMessage(weekday: string, food: string, confirmationUrl: string) {
  return `Good morning! Tonight's preset meal for ${weekday} is ${food}. Confirm it or change the meal here: ${confirmationUrl}`;
}
