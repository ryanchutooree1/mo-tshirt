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
  emailNotificationsEnabled?: unknown;
};

export type PartnerNotificationSetting = {
  partnerId: PrintPartnerId;
  partnerName: string;
  path: string;
  email: string;
  emailNotificationsEnabled: boolean;
};

export type ParsedPartnerNotificationSettings = {
  settings: PartnerNotificationSetting[];
  invalidEntries: string[];
  missingEmailEntries: string[];
};

const DEFAULT_PARTNER_NOTIFICATIONS: Record<
  PrintPartnerId,
  { email: string; emailNotificationsEnabled: boolean }
> = {
  yan: {
    email: "",
    emailNotificationsEnabled: false,
  },
  shabanaz: {
    email: "jshabbanaz@gmail.com",
    emailNotificationsEnabled: true,
  },
};

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
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
    const email = normalizeEmail(raw?.email ?? defaults.email);
    const emailNotificationsEnabled =
      typeof raw?.emailNotificationsEnabled === "boolean"
        ? raw.emailNotificationsEnabled
        : defaults.emailNotificationsEnabled;

    if (email && !EMAIL_RE.test(email)) {
      invalidEntries.push(`${partner.name}: ${email}`);
    }

    if (emailNotificationsEnabled && !email) {
      missingEmailEntries.push(partner.name);
    }

    return {
      partnerId: partner.id,
      partnerName: partner.name,
      path: partner.path,
      email,
      emailNotificationsEnabled,
    } satisfies PartnerNotificationSetting;
  });

  return { settings, invalidEntries, missingEmailEntries };
}

function settingsToStoredMap(settings: PartnerNotificationSetting[]) {
  return settings.reduce<Record<string, { email: string; emailNotificationsEnabled: boolean }>>(
    (acc, setting) => {
      if (!isPrintPartnerId(setting.partnerId)) return acc;
      acc[setting.partnerId] = {
        email: normalizeEmail(setting.email),
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
