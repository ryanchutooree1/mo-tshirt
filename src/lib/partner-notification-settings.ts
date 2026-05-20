import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  PRINT_PARTNERS,
  isPrintPartnerId,
  type PrintPartnerId,
} from "@/lib/partners";

const SETTINGS_COLLECTION = "adminSettings";
const PARTNER_NOTIFICATION_DOC = "partnerNotifications";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type StoredPartnerNotification = {
  email?: unknown;
  emails?: unknown;
  emailNotificationsEnabled?: unknown;
};

export type PartnerNotificationSetting = {
  partnerId: PrintPartnerId;
  partnerName: string;
  path: string;
  email: string;
  emails: string[];
  emailNotificationsEnabled: boolean;
};

export type ParsedPartnerNotificationSettings = {
  settings: PartnerNotificationSetting[];
  invalidEntries: string[];
  missingEmailEntries: string[];
};

const DEFAULT_PARTNER_NOTIFICATIONS: Record<
  PrintPartnerId,
  { emails: string[]; emailNotificationsEnabled: boolean }
> = {
  yan: {
    emails: [],
    emailNotificationsEnabled: false,
  },
  shabanaz: {
    emails: ["jshabbanaz@gmail.com"],
    emailNotificationsEnabled: true,
  },
};

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getEmailCandidates(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => getEmailCandidates(entry));
  }

  if (typeof value !== "string") return [];
  return value
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeEmails(value: unknown, fallback: string[]): string[] {
  const source = value === undefined ? fallback : value;
  const candidates = getEmailCandidates(source);
  const seen = new Set<string>();
  const emails: string[] = [];

  candidates.forEach((entry) => {
    const email = normalizeEmail(entry);
    if (!email || seen.has(email)) return;
    seen.add(email);
    emails.push(email);
  });

  return emails;
}

function getRawPartnerSettings(value: unknown, partnerId: PrintPartnerId) {
  if (Array.isArray(value)) {
    return value.find((entry) => {
      return (
        entry &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        (entry as { partnerId?: unknown }).partnerId === partnerId
      );
    }) as StoredPartnerNotification | undefined;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const raw = value as Record<string, unknown>;
    const direct = raw[partnerId];
    if (direct && typeof direct === "object" && !Array.isArray(direct)) {
      return direct as StoredPartnerNotification;
    }
  }

  return undefined;
}

export function parsePartnerNotificationSettings(
  value: unknown
): ParsedPartnerNotificationSettings {
  const invalidEntries: string[] = [];
  const missingEmailEntries: string[] = [];

  const settings = PRINT_PARTNERS.map((partner) => {
    const defaults = DEFAULT_PARTNER_NOTIFICATIONS[partner.id];
    const raw = getRawPartnerSettings(value, partner.id);
    const emails = normalizeEmails(raw?.emails ?? raw?.email, defaults.emails);
    const email = emails[0] || "";
    const emailNotificationsEnabled =
      typeof raw?.emailNotificationsEnabled === "boolean"
        ? raw.emailNotificationsEnabled
        : defaults.emailNotificationsEnabled;

    emails.forEach((entry) => {
      if (!EMAIL_RE.test(entry)) {
        invalidEntries.push(`${partner.name}: ${entry}`);
      }
    });

    if (emailNotificationsEnabled && !emails.length) {
      missingEmailEntries.push(partner.name);
    }

    return {
      partnerId: partner.id,
      partnerName: partner.name,
      path: partner.path,
      email,
      emails,
      emailNotificationsEnabled,
    } satisfies PartnerNotificationSetting;
  });

  return { settings, invalidEntries, missingEmailEntries };
}

function settingsToStoredMap(settings: PartnerNotificationSetting[]) {
  return settings.reduce<Record<string, { email: string; emails: string[]; emailNotificationsEnabled: boolean }>>(
    (acc, setting) => {
      if (!isPrintPartnerId(setting.partnerId)) return acc;
      const emails = normalizeEmails(setting.emails, setting.email ? [setting.email] : []);
      acc[setting.partnerId] = {
        email: emails[0] || "",
        emails,
        emailNotificationsEnabled: Boolean(setting.emailNotificationsEnabled),
      };
      return acc;
    },
    {}
  );
}

export async function getPartnerNotificationSettings() {
  const settingsRef = doc(db, SETTINGS_COLLECTION, PARTNER_NOTIFICATION_DOC);
  const snap = await getDoc(settingsRef);
  if (!snap.exists()) {
    return parsePartnerNotificationSettings(null).settings;
  }

  const rawPartners = (snap.data() as { partners?: unknown }).partners;
  return parsePartnerNotificationSettings(rawPartners).settings;
}

export async function savePartnerNotificationSettings(value: unknown) {
  const parsed = parsePartnerNotificationSettings(value);

  if (parsed.invalidEntries.length) {
    throw new Error(`Invalid email address: ${parsed.invalidEntries.join(", ")}`);
  }

  if (parsed.missingEmailEntries.length) {
    throw new Error(`Add an email for: ${parsed.missingEmailEntries.join(", ")}`);
  }

  await setDoc(
    doc(db, SETTINGS_COLLECTION, PARTNER_NOTIFICATION_DOC),
    {
      partners: settingsToStoredMap(parsed.settings),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return parsed.settings;
}
