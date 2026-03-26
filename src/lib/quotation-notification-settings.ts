import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const SETTINGS_COLLECTION = "adminSettings";
const QUOTATION_NOTIFICATION_DOC = "quotationNotifications";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedQuotationNotificationRecipients = {
  recipients: string[];
  invalidEntries: string[];
};

export function parseQuotationNotificationRecipients(
  value: unknown
): ParsedQuotationNotificationRecipients {
  const rawEntries = Array.isArray(value)
    ? value.flatMap((entry) => (typeof entry === "string" ? entry.split(/[\n,;]+/g) : []))
    : typeof value === "string"
      ? value.split(/[\n,;]+/g)
      : [];

  const seen = new Set<string>();
  const recipients: string[] = [];
  const invalidEntries: string[] = [];

  for (const entry of rawEntries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const normalized = trimmed.toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      invalidEntries.push(trimmed);
      continue;
    }

    if (seen.has(normalized)) continue;
    seen.add(normalized);
    recipients.push(normalized);
  }

  return { recipients, invalidEntries };
}

function getDefaultRecipients() {
  return parseQuotationNotificationRecipients(process.env.SMTP_USER || "").recipients;
}

export async function getQuotationNotificationRecipients() {
  const settingsRef = doc(db, SETTINGS_COLLECTION, QUOTATION_NOTIFICATION_DOC);
  const snap = await getDoc(settingsRef);
  if (!snap.exists()) {
    return getDefaultRecipients();
  }

  const parsed = parseQuotationNotificationRecipients(
    (snap.data() as { recipients?: unknown }).recipients
  );

  return parsed.recipients.length ? parsed.recipients : getDefaultRecipients();
}

export async function saveQuotationNotificationRecipients(value: unknown) {
  const parsed = parseQuotationNotificationRecipients(value);

  await setDoc(
    doc(db, SETTINGS_COLLECTION, QUOTATION_NOTIFICATION_DOC),
    {
      recipients: parsed.recipients,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return parsed.recipients;
}
