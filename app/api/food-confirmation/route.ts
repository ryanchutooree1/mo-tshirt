import { NextResponse } from "next/server";
import { doc, getDoc, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { verifyFoodConfirmationLink } from "@/lib/food-confirmation-links";
import {
  buildDinnerConfirmationEmail,
  getFoodForDay,
  normalizeFoodName,
  normalizeRecipients,
} from "@/lib/food-planning";
import { db } from "@/lib/firebase";
import {
  CONTACT_RATE_LIMIT,
  evaluateRequestRateLimit,
  getRateLimitHeaders,
  isContentLengthWithinLimit,
  isRequestOriginAllowed,
} from "@/lib/request-safety";

export const runtime = "nodejs";

type CoupleData = {
  settings?: { recipients?: unknown };
  foodPlan?: Record<string, unknown>;
};

type ConfirmationData = {
  confirmationStatus?: "processing" | "confirmed" | "failed";
  confirmedFood?: string;
  processingStartedAtMs?: number;
};

const STORAGE_DOC = doc(db, "coupleGoals", "workspace");
const PROCESSING_TIMEOUT_MS = 5 * 60_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function responseHeaders() {
  return { "Cache-Control": "private, no-store, max-age=0" };
}

function readLink(req: Request, body?: Record<string, unknown>) {
  const url = new URL(req.url);
  return {
    dayKey: String(body?.day || url.searchParams.get("day") || ""),
    expires: String(body?.expires || url.searchParams.get("expires") || ""),
    token: String(body?.token || url.searchParams.get("token") || ""),
  };
}

function weekdayForDayKey(dayKey: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${dayKey}T12:00:00Z`)
  );
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

async function loadConfirmation(dayKey: string) {
  const [workspaceSnapshot, confirmationSnapshot] = await Promise.all([
    getDoc(STORAGE_DOC),
    getDoc(doc(db, "coupleGoals", "workspace", "foodConfirmations", dayKey)),
  ]);
  return {
    workspace: (workspaceSnapshot.exists() ? workspaceSnapshot.data() : {}) as CoupleData,
    confirmation: (confirmationSnapshot.exists() ? confirmationSnapshot.data() : {}) as ConfirmationData,
  };
}

export async function GET(req: Request) {
  try {
    const link = readLink(req);
    if (!verifyFoodConfirmationLink(link)) {
      return NextResponse.json({ error: "This confirmation link is invalid or has expired." }, { status: 403, headers: responseHeaders() });
    }

    const weekday = weekdayForDayKey(link.dayKey);
    const { workspace, confirmation } = await loadConfirmation(link.dayKey);
    const confirmed = confirmation.confirmationStatus === "confirmed";
    const food = confirmed
      ? normalizeFoodName(confirmation.confirmedFood)
      : getFoodForDay(workspace.foodPlan, weekday);
    if (!food) {
      return NextResponse.json({ error: `No food is planned for ${weekday}.` }, { status: 404, headers: responseHeaders() });
    }

    return NextResponse.json(
      { day: link.dayKey, weekday, food, confirmed },
      { headers: responseHeaders() }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load the food plan.";
    return NextResponse.json({ error: message }, { status: 500, headers: responseHeaders() });
  }
}

export async function POST(req: Request) {
  const rateLimit = evaluateRequestRateLimit(req.headers, {
    ...CONTACT_RATE_LIMIT,
    scope: "food-confirmation",
    maxRequests: 10,
  });
  const headers = { ...responseHeaders(), ...getRateLimitHeaders(rateLimit) };
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429, headers });
  }
  if (!isRequestOriginAllowed(req)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  }
  if (!isContentLengthWithinLimit(req.headers, 4_096)) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413, headers });
  }

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });
    const link = readLink(req, body);
    if (!verifyFoodConfirmationLink(link)) {
      return NextResponse.json({ error: "This confirmation link is invalid or has expired." }, { status: 403, headers });
    }
    const food = normalizeFoodName(body.food);
    if (!food) {
      return NextResponse.json({ error: "Enter tonight's food before confirming." }, { status: 400, headers });
    }

    const snapshot = await getDoc(STORAGE_DOC);
    const workspace = (snapshot.exists() ? snapshot.data() : {}) as CoupleData;
    const recipients = normalizeRecipients(workspace.settings?.recipients);
    if (recipients.length === 0) {
      return NextResponse.json({ error: "No confirmation email recipient is configured." }, { status: 400, headers });
    }

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER || "";
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
      return NextResponse.json({ error: "Confirmation email is not configured." }, { status: 503, headers });
    }

    const weekday = weekdayForDayKey(link.dayKey);
    const confirmationRef = doc(db, "coupleGoals", "workspace", "foodConfirmations", link.dayKey);
    const claim = await runTransaction(db, async (transaction) => {
      const [currentWorkspaceSnapshot, currentConfirmationSnapshot] = await Promise.all([
        transaction.get(STORAGE_DOC),
        transaction.get(confirmationRef),
      ]);
      const currentConfirmation = (currentConfirmationSnapshot.exists()
        ? currentConfirmationSnapshot.data()
        : {}) as ConfirmationData;
      if (currentConfirmation.confirmationStatus === "confirmed") {
        return { status: "confirmed" as const, food: normalizeFoodName(currentConfirmation.confirmedFood) || food };
      }
      if (
        currentConfirmation.confirmationStatus === "processing" &&
        Date.now() - (currentConfirmation.processingStartedAtMs || 0) < PROCESSING_TIMEOUT_MS
      ) {
        return { status: "processing" as const, food };
      }

      const currentWorkspace = (currentWorkspaceSnapshot.exists()
        ? currentWorkspaceSnapshot.data()
        : {}) as CoupleData;
      transaction.set(
        confirmationRef,
        {
          dayKey: link.dayKey,
          weekday,
          confirmationStatus: "processing",
          requestedFood: food,
          processingStartedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      transaction.set(
        STORAGE_DOC,
        { foodPlan: { ...(currentWorkspace.foodPlan || {}), [weekday]: food } },
        { merge: true }
      );
      return { status: "claimed" as const, food };
    });

    if (claim.status === "confirmed") {
      return NextResponse.json({ confirmed: true, alreadyConfirmed: true, food: claim.food, weekday }, { headers });
    }
    if (claim.status === "processing") {
      return NextResponse.json({ error: "Confirmation is already being processed." }, { status: 409, headers });
    }

    try {
      const port = Number(process.env.SMTP_PORT || 465);
      const secure = String(process.env.SMTP_SECURE || "true") === "true";
      const message = buildDinnerConfirmationEmail(weekday, food);
      // @ts-expect-error nodemailer does not ship local declarations in this project.
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
      await transporter.sendMail({
        from: resolveFromAddress(process.env.SMTP_FROM, user),
        to: recipients.join(", "),
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      await setDoc(
        confirmationRef,
        {
          confirmationStatus: "confirmed",
          confirmedFood: food,
          confirmedAt: serverTimestamp(),
          confirmationEmailRecipients: recipients,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      return NextResponse.json({ confirmed: true, food, weekday }, { headers });
    } catch (error) {
      await setDoc(
        confirmationRef,
        {
          confirmationStatus: "failed",
          lastError: error instanceof Error ? error.message.slice(0, 300) : "Email delivery failed",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      throw new Error("The confirmation email could not be sent. Please try again.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to confirm dinner.";
    return NextResponse.json({ error: message }, { status: 500, headers });
  }
}
