import { NextResponse } from "next/server";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { hasTuyaKeys, sendDeviceCommand } from "../../../../../lib/tuya";

export const runtime = "nodejs";
export const maxDuration = 60;

const ADMIN_ID = "mo-owner";

type DailyAutomation = {
  id: string;
  name: string;
  deviceId: string;
  deviceName: string;
  code: string;
  value: boolean;
  triggerType: "manual" | "daily";
  dailyTime: string;
  timezone: string;
  enabled: boolean;
};

type DueInfo = {
  due: boolean;
  runKey: string;
  dayKey: string;
  hhmm: string;
  timezone: string;
};

function readEnvSecret() {
  return String(process.env.CRON_SECRET || process.env.IOT_CRON_SECRET || "").trim();
}

function isCronAuthorized(req: Request) {
  const secret = readEnvSecret();

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const auth = req.headers.get("authorization") || "";
  const bearer = `Bearer ${secret}`;
  if (auth === bearer) return true;

  const xSecret = req.headers.get("x-cron-secret") || "";
  if (xSecret === secret) return true;

  return false;
}

function toString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function isValidDailyTime(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function getZonedClock(now: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  const year = map.year || "0000";
  const month = map.month || "00";
  const day = map.day || "00";
  const hour = map.hour || "00";
  const minute = map.minute || "00";

  return {
    dayKey: `${year}-${month}-${day}`,
    hhmm: `${hour}:${minute}`,
  };
}

function getDueInfo(automation: DailyAutomation, now: Date): DueInfo {
  if (!automation.enabled || automation.triggerType !== "daily") {
    return { due: false, runKey: "", dayKey: "", hhmm: "", timezone: "" };
  }

  const time = automation.dailyTime.trim();
  if (!isValidDailyTime(time)) {
    return { due: false, runKey: "", dayKey: "", hhmm: "", timezone: "" };
  }

  const preferredZone = automation.timezone.trim() || "UTC";
  let zone = preferredZone;

  let clock: { dayKey: string; hhmm: string };
  try {
    clock = getZonedClock(now, zone);
  } catch {
    zone = "UTC";
    clock = getZonedClock(now, zone);
  }

  if (clock.hhmm !== time) {
    return { due: false, runKey: "", dayKey: "", hhmm: clock.hhmm, timezone: zone };
  }

  return {
    due: true,
    runKey: `${clock.dayKey}:${time}`,
    dayKey: clock.dayKey,
    hhmm: clock.hhmm,
    timezone: zone,
  };
}

function toAutomation(id: string, data: Record<string, unknown>): DailyAutomation {
  return {
    id,
    name: toString(data.name, "IoT automation") || "IoT automation",
    deviceId: toString(data.deviceId, "").trim(),
    deviceName: toString(data.deviceName, "Device").trim() || "Device",
    code: toString(data.code, "").trim(),
    value: Boolean(data.value),
    triggerType: data.triggerType === "daily" ? "daily" : "manual",
    dailyTime: toString(data.dailyTime, ""),
    timezone: toString(data.timezone, "UTC"),
    enabled: data.enabled !== false,
  };
}

async function claimRun(automationId: string, runKey: string) {
  const ref = doc(db, "users", ADMIN_ID, "iotAutomations", automationId);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;

    const current = snap.data() as Record<string, unknown>;
    if (current.enabled === false) return false;
    if (String(current.triggerType || "") !== "daily") return false;

    const lastRunKey = String(current.lastRunKey || "");
    if (lastRunKey === runKey) return false;

    tx.update(ref, {
      lastRunKey: runKey,
      lastRunStatus: "idle",
      lastRunNote: "Queued by scheduler",
      updatedAt: serverTimestamp(),
      lastRunSource: "cron",
    });

    return true;
  });
}

async function logRun(payload: Record<string, unknown>) {
  await addDoc(collection(db, "users", ADMIN_ID, "iotAutomationLogs"), {
    ...payload,
    at: serverTimestamp(),
  });
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized scheduler request." }, { status: 401 });
  }

  if (!hasTuyaKeys()) {
    return NextResponse.json({ ok: false, error: "Tuya keys missing on server." }, { status: 500 });
  }

  const now = new Date();

  try {
    const snap = await getDocs(collection(db, "users", ADMIN_ID, "iotAutomations"));
    const all = snap.docs.map((docSnap) => toAutomation(docSnap.id, docSnap.data() as Record<string, unknown>));

    const candidates = all.filter((item) => item.enabled && item.triggerType === "daily");
    let dueCount = 0;
    let claimedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const automation of candidates) {
      const due = getDueInfo(automation, now);
      if (!due.due) continue;
      dueCount += 1;

      if (!automation.deviceId || !automation.code) {
        failedCount += 1;
        await updateDoc(doc(db, "users", ADMIN_ID, "iotAutomations", automation.id), {
          lastRunAt: serverTimestamp(),
          lastRunStatus: "error",
          lastRunNote: "Missing deviceId or command code",
          updatedAt: serverTimestamp(),
          lastRunSource: "cron",
        });
        await logRun({
          automationId: automation.id,
          automationName: automation.name,
          status: "error",
          note: "Missing deviceId or command code",
          runKey: due.runKey,
          triggerType: "daily",
        });
        continue;
      }

      const claimed = await claimRun(automation.id, due.runKey);
      if (!claimed) continue;
      claimedCount += 1;

      try {
        const response = await sendDeviceCommand(automation.deviceId, automation.code, automation.value);
        successCount += 1;

        const okNote = response.msg
          ? `Scheduler executed: ${response.msg}`
          : `Scheduler executed at ${due.hhmm} ${due.timezone}`;

        await updateDoc(doc(db, "users", ADMIN_ID, "iotAutomations", automation.id), {
          lastRunAt: serverTimestamp(),
          lastRunStatus: "success",
          lastRunNote: okNote,
          updatedAt: serverTimestamp(),
          lastRunSource: "cron",
        });

        await logRun({
          automationId: automation.id,
          automationName: automation.name,
          status: "success",
          note: okNote,
          runKey: due.runKey,
          triggerType: "daily",
          deviceId: automation.deviceId,
          code: automation.code,
          value: automation.value,
        });
      } catch (error) {
        failedCount += 1;
        const message = error instanceof Error ? error.message : "Unknown scheduler error";

        await updateDoc(doc(db, "users", ADMIN_ID, "iotAutomations", automation.id), {
          lastRunAt: serverTimestamp(),
          lastRunStatus: "error",
          lastRunNote: message,
          updatedAt: serverTimestamp(),
          lastRunSource: "cron",
        });

        await logRun({
          automationId: automation.id,
          automationName: automation.name,
          status: "error",
          note: message,
          runKey: due.runKey,
          triggerType: "daily",
          deviceId: automation.deviceId,
          code: automation.code,
          value: automation.value,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: candidates.length,
      due: dueCount,
      claimed: claimedCount,
      success: successCount,
      failed: failedCount,
      at: now.toISOString(),
    });
  } catch (error) {
    console.error("tuya:automation:tick", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Scheduler execution failed.",
      },
      { status: 500 }
    );
  }
}
