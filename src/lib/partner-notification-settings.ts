import {
  getPrintPartners,
  savePrintPartners,
} from "@/lib/partner-registry";
import type { PrintPartnerId } from "@/lib/partners";

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

function getPartnerEmails(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : "")).filter(Boolean);
  }

  if (typeof value !== "string") return [];
  return value
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function parsePartnerNotificationSettings(
  value: unknown
): ParsedPartnerNotificationSettings {
  const settings = Array.isArray(value)
    ? value
        .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
        .map((entry) => {
          const raw = entry as Record<string, unknown>;
          const emails = getPartnerEmails(raw.emails ?? raw.email);
          return {
            partnerId: String(raw.partnerId || ""),
            partnerName: String(raw.partnerName || raw.name || "Partner"),
            path: String(raw.path || ""),
            email: emails[0] || "",
            emails,
            emailNotificationsEnabled: Boolean(raw.emailNotificationsEnabled),
          };
        })
    : [];

  return { settings, invalidEntries: [], missingEmailEntries: [] };
}

export async function getPartnerNotificationSettings() {
  const partners = await getPrintPartners();
  return partners.map((partner) => ({
    partnerId: partner.id,
    partnerName: partner.name,
    path: partner.path,
    email: partner.email,
    emails: partner.emails,
    emailNotificationsEnabled: partner.emailNotificationsEnabled,
  }));
}

export async function savePartnerNotificationSettings(value: unknown) {
  const parsed = parsePartnerNotificationSettings(value);
  const partners = await getPrintPartners({ includeInactive: true });
  const notificationsById = new Map(
    parsed.settings.map((setting) => [setting.partnerId, setting])
  );

  return savePrintPartners(
    partners.map((partner) => {
      const notification = notificationsById.get(partner.id);
      if (!notification) return partner;
      return {
        ...partner,
        email: notification.email,
        emails: notification.emails,
        emailNotificationsEnabled: notification.emailNotificationsEnabled,
      };
    })
  ).then((updated) =>
    updated.map((partner) => ({
      partnerId: partner.id,
      partnerName: partner.name,
      path: partner.path,
      email: partner.email,
      emails: partner.emails,
      emailNotificationsEnabled: partner.emailNotificationsEnabled,
    }))
  );
}
