import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  DEFAULT_PRODUCTION_MANAGER,
  DEFAULT_PRINT_PARTNERS,
  formatPartnerNameFromId,
  getPrintPartnerPath,
  isPrintPartnerId,
  type PartnerPaymentDetails,
  type ProductionManager,
  type PrintPartner,
  type PrintPartnerId,
} from "@/lib/partners";

const SETTINGS_COLLECTION = "adminSettings";
const PRINT_PARTNERS_DOC = "printPartners";
const LEGACY_NOTIFICATION_DOC = "partnerNotifications";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type StoredPrintPartner = PrintPartner & {
  password?: string;
};

type StoredPartnerRegistry = {
  manager: ProductionManager;
  partners: StoredPrintPartner[];
};

type SavePrintPartnerInput = Partial<PrintPartner> & {
  password?: unknown;
  paymentDetails?: Partial<PartnerPaymentDetails> | null;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return cleanString(value).toLowerCase();
}

function normalizeManager(value: unknown): ProductionManager {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_PRODUCTION_MANAGER;
  }

  const raw = value as Partial<Record<keyof ProductionManager, unknown>>;
  return {
    name: cleanString(raw.name) || DEFAULT_PRODUCTION_MANAGER.name,
    email: normalizeEmail(raw.email),
  };
}

function getEmailCandidates(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((entry) => getEmailCandidates(entry));
  if (typeof value !== "string") return [];
  return value
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeEmails(value: unknown, fallback: string[] = []) {
  const candidates = value === undefined ? fallback : getEmailCandidates(value);
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

function normalizePartnerId(value: unknown, fallbackName: unknown) {
  const preferred = cleanString(value);
  if (isPrintPartnerId(preferred)) return preferred;

  const fromName = cleanString(fallbackName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return isPrintPartnerId(fromName) ? fromName : "";
}

function getDefaultPartnerPassword(partnerId: PrintPartnerId) {
  if (partnerId === "yan") {
    return (
      process.env.PARTNER_YAN_PASSWORD ||
      process.env.NEXT_PARTNER_YAN_PASSWORD ||
      "Samsam"
    );
  }

  if (partnerId === "shabanaz") {
    return (
      process.env.PARTNER_SHABANAZ_PASSWORD ||
      process.env.NEXT_PARTNER_SHABANAZ_PASSWORD ||
      "Paulpaul"
    );
  }

  return "";
}

function normalizePaymentDetails(value: unknown): PartnerPaymentDetails | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<Record<keyof PartnerPaymentDetails, unknown>>;
  const paymentDetails = {
    fullName: cleanString(raw.fullName),
    bankName: cleanString(raw.bankName),
    bankAccountNumber: cleanString(raw.bankAccountNumber),
    juiceNumber: cleanString(raw.juiceNumber),
  };

  return Object.values(paymentDetails).some(Boolean) ? paymentDetails : null;
}

function getProductionNotes(value: unknown, fallback: string[] = []) {
  if (Array.isArray(value)) {
    return value.map(cleanString).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return fallback;
}

function getRawPartnerEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function stripPassword(partner: StoredPrintPartner): PrintPartner {
  const fallbackPassword = getDefaultPartnerPassword(partner.id);
  return {
    id: partner.id,
    name: partner.name,
    path: partner.path,
    active: partner.active,
    productionNotes: partner.productionNotes,
    paymentDetails: partner.paymentDetails || null,
    email: partner.email,
    emails: partner.emails,
    emailNotificationsEnabled: partner.emailNotificationsEnabled,
    supportsLogoPrintPlacements: partner.supportsLogoPrintPlacements,
    hasPassword: Boolean(partner.password || fallbackPassword),
  };
}

function normalizeStoredPartner(
  value: unknown,
  fallback?: StoredPrintPartner
): StoredPrintPartner | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as SavePrintPartnerInput;
  const id = normalizePartnerId(raw.id, raw.name || fallback?.name);
  if (!id) return null;

  const emails = normalizeEmails(raw.emails ?? raw.email, fallback?.emails || []);
  const paymentDetails = normalizePaymentDetails(raw.paymentDetails) || fallback?.paymentDetails || null;
  const rawPassword = cleanString(raw.password);
  const password = rawPassword || fallback?.password || getDefaultPartnerPassword(id);

  return {
    id,
    name: cleanString(raw.name) || fallback?.name || formatPartnerNameFromId(id),
    path: getPrintPartnerPath(id),
    active: typeof raw.active === "boolean" ? raw.active : fallback?.active ?? true,
    productionNotes: getProductionNotes(raw.productionNotes, fallback?.productionNotes || []),
    paymentDetails,
    email: emails[0] || "",
    emails,
    emailNotificationsEnabled:
      typeof raw.emailNotificationsEnabled === "boolean"
        ? raw.emailNotificationsEnabled
        : fallback?.emailNotificationsEnabled ?? false,
    supportsLogoPrintPlacements:
      typeof raw.supportsLogoPrintPlacements === "boolean"
        ? raw.supportsLogoPrintPlacements
        : fallback?.supportsLogoPrintPlacements ?? false,
    hasPassword: Boolean(password),
    password,
  };
}

function defaultStoredPartners(): StoredPrintPartner[] {
  return DEFAULT_PRINT_PARTNERS.map((partner) => ({
    ...partner,
    password: getDefaultPartnerPassword(partner.id),
  }));
}

async function getLegacyNotificationMap() {
  const snap = await getDoc(doc(db, SETTINGS_COLLECTION, LEGACY_NOTIFICATION_DOC));
  if (!snap.exists()) return new Map<string, { emails: string[]; enabled: boolean }>();

  const rawPartners = (snap.data() as { partners?: unknown }).partners;
  const entries = getRawPartnerEntries(rawPartners);
  const map = new Map<string, { emails: string[]; enabled: boolean }>();

  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const raw = entry as { partnerId?: unknown; email?: unknown; emails?: unknown; emailNotificationsEnabled?: unknown };
    const id = normalizePartnerId(raw.partnerId, raw.partnerId);
    if (!id) return;
    map.set(id, {
      emails: normalizeEmails(raw.emails ?? raw.email, []),
      enabled: typeof raw.emailNotificationsEnabled === "boolean" ? raw.emailNotificationsEnabled : false,
    });
  });

  if (rawPartners && typeof rawPartners === "object" && !Array.isArray(rawPartners)) {
    Object.entries(rawPartners as Record<string, unknown>).forEach(([id, entry]) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
      const raw = entry as { email?: unknown; emails?: unknown; emailNotificationsEnabled?: unknown };
      const partnerId = normalizePartnerId(id, id);
      if (!partnerId) return;
      map.set(partnerId, {
        emails: normalizeEmails(raw.emails ?? raw.email, []),
        enabled: typeof raw.emailNotificationsEnabled === "boolean" ? raw.emailNotificationsEnabled : false,
      });
    });
  }

  return map;
}

async function readStoredRegistry(): Promise<StoredPartnerRegistry> {
  const snap = await getDoc(doc(db, SETTINGS_COLLECTION, PRINT_PARTNERS_DOC));
  if (!snap.exists()) {
    const legacyNotifications = await getLegacyNotificationMap();
    const partners = defaultStoredPartners().map((partner) => {
      const legacy = legacyNotifications.get(partner.id);
      if (!legacy) return partner;
      return {
        ...partner,
        email: legacy.emails[0] || "",
        emails: legacy.emails,
        emailNotificationsEnabled: legacy.enabled,
      };
    });
    return { manager: DEFAULT_PRODUCTION_MANAGER, partners };
  }

  const rawData = snap.data() as { manager?: unknown; partners?: unknown };
  const rawPartners = rawData.partners;
  const fallbackById = new Map(defaultStoredPartners().map((partner) => [partner.id, partner]));
  const partners = getRawPartnerEntries(rawPartners)
    .map((entry) => {
      const id = entry && typeof entry === "object" && !Array.isArray(entry)
        ? normalizePartnerId((entry as { id?: unknown }).id, (entry as { name?: unknown }).name)
        : "";
      return normalizeStoredPartner(entry, id ? fallbackById.get(id) : undefined);
    })
    .filter((partner): partner is StoredPrintPartner => Boolean(partner));

  return {
    manager: normalizeManager(rawData.manager),
    partners,
  };
}

async function readStoredPartners() {
  return (await readStoredRegistry()).partners;
}

function validatePartners(partners: StoredPrintPartner[]) {
  const seen = new Set<string>();
  const invalidEmails: string[] = [];
  const missingEmails: string[] = [];
  const missingPasswords: string[] = [];

  partners.forEach((partner) => {
    if (seen.has(partner.id)) {
      throw new Error(`Duplicate partner ID: ${partner.id}`);
    }
    seen.add(partner.id);

    partner.emails.forEach((email) => {
      if (!EMAIL_RE.test(email)) invalidEmails.push(`${partner.name}: ${email}`);
    });

    if (partner.emailNotificationsEnabled && !partner.emails.length) {
      missingEmails.push(partner.name);
    }

    if (partner.active && !partner.password) {
      missingPasswords.push(partner.name);
    }
  });

  if (invalidEmails.length) {
    throw new Error(`Invalid email address: ${invalidEmails.join(", ")}`);
  }

  if (missingEmails.length) {
    throw new Error(`Add an email for: ${missingEmails.join(", ")}`);
  }

  if (missingPasswords.length) {
    throw new Error(`Add a partner password for: ${missingPasswords.join(", ")}`);
  }
}

function validateManager(manager: ProductionManager) {
  if (manager.email && !EMAIL_RE.test(manager.email)) {
    throw new Error(`Invalid manager email address: ${manager.email}`);
  }
}

export async function getPrintPartners(options: { includeInactive?: boolean } = {}) {
  const partners = await readStoredPartners();
  return partners
    .filter((partner) => options.includeInactive || partner.active)
    .map(stripPassword);
}

export async function getProductionManager() {
  return (await readStoredRegistry()).manager;
}

export async function getPrintPartnerRegistry(
  options: { includeInactive?: boolean } = {}
) {
  const registry = await readStoredRegistry();
  return {
    manager: registry.manager,
    partners: registry.partners
      .filter((partner) => options.includeInactive || partner.active)
      .map(stripPassword),
  };
}

export async function getPrintPartnerById(
  partnerId: PrintPartnerId,
  options: { includeInactive?: boolean } = {}
) {
  if (!isPrintPartnerId(partnerId)) return null;
  const partners = await readStoredPartners();
  const partner = partners.find((entry) => entry.id === partnerId);
  if (!partner || (!options.includeInactive && !partner.active)) return null;
  return stripPassword(partner);
}

export async function normalizeRegisteredPrintPartnerIds(value: unknown) {
  const ids = Array.isArray(value) ? value.filter(isPrintPartnerId) : [];
  const partners = await getPrintPartners();
  const allowed = new Set(partners.map((partner) => partner.id));
  const seen = new Set<string>();

  return ids.filter((id) => {
    if (!allowed.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export async function getPrintPartnerRouteLabel(partnerIds: PrintPartnerId[]) {
  const partners = await getPrintPartners();
  const byId = new Map(partners.map((partner) => [partner.id, partner.name]));
  const labels = partnerIds
    .filter((id) => byId.has(id))
    .map((id) => byId.get(id));

  return labels.length ? labels.join(" + ") : "No partner";
}

export async function savePrintPartners(value: unknown, managerValue?: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Partner list is invalid.");
  }

  const existingRegistry = await readStoredRegistry();
  const fallbackById = new Map(existingRegistry.partners.map((partner) => [partner.id, partner]));
  const partners = value
    .map((entry) => {
      const id = entry && typeof entry === "object" && !Array.isArray(entry)
        ? normalizePartnerId((entry as { id?: unknown }).id, (entry as { name?: unknown }).name)
        : "";
      return normalizeStoredPartner(entry, id ? fallbackById.get(id) : undefined);
    })
    .filter((partner): partner is StoredPrintPartner => Boolean(partner));

  validatePartners(partners);
  const manager =
    managerValue === undefined
      ? existingRegistry.manager
      : normalizeManager(managerValue);
  validateManager(manager);

  await setDoc(
    doc(db, SETTINGS_COLLECTION, PRINT_PARTNERS_DOC),
    {
      manager,
      partners,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return partners.map(stripPassword);
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

export async function verifyPartnerPassword(
  partnerId: PrintPartnerId,
  password: string
) {
  const partners = await readStoredPartners();
  const partner = partners.find((entry) => entry.id === partnerId && entry.active);
  if (!partner || !partner.password) return false;
  return constantTimeEqual(password, partner.password);
}

export async function getPartnerByPassword(password: string) {
  const partners = await readStoredPartners();
  return partners
    .filter((partner) => partner.active && partner.password)
    .find((partner) => constantTimeEqual(password, partner.password || "")) || null;
}
