import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { decryptGmailConnection, encryptGmailConnection, type SavedGmailConnection } from "./gmail-token-crypto";
import { INBOX_EMAIL } from "./gmail-inbox";
const ref = () => doc(db, "integrations", "gmail-oauth");
function encryptionSecret() { return (process.env.GMAIL_TOKEN_ENCRYPTION_KEY || process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_GMAIL_CLIENT_SECRET || "").trim(); }
export async function readSavedGmailConnection(): Promise<SavedGmailConnection | null> {
  const record = (await getDoc(ref())).data();
  if (!record?.encrypted) return null;
  const saved = decryptGmailConnection(record.encrypted, encryptionSecret());
  const clientId = (process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_GMAIL_CLIENT_ID || "").trim();
  if (saved.email !== INBOX_EMAIL || saved.clientId !== clientId) throw new Error("Reconnect the configured Gmail mailbox.");
  return saved;
}
export async function getSavedGmailToken() { return (await readSavedGmailConnection())?.refreshToken; }
export async function saveGmailConnection(connection: SavedGmailConnection) {
  if (connection.email !== INBOX_EMAIL) throw new Error("Incorrect Gmail account.");
  await setDoc(ref(), { encrypted: encryptGmailConnection(connection, encryptionSecret()) });
}
