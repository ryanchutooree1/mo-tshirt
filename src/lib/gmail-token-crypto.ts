import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
export type SavedGmailConnection = { refreshToken: string; email: string; clientId: string; connectedAt: string; expiresAt: string | null };
const aad = Buffer.from("mo-tshirt:gmail-connection:v1");
function key(secret: string) {
  if (secret.length < 20) throw new Error("Gmail token encryption is not configured.");
  return createHash("sha256").update(aad).update(secret).digest();
}
export function encryptGmailConnection(connection: SavedGmailConnection, secret: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(connection), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptGmailConnection(envelope: string, secret: string): SavedGmailConnection {
  const [version, iv, tag, ciphertext, extra] = envelope.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext || extra) throw new Error("Invalid Gmail token storage.");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64url"));
  decipher.setAAD(aad); decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const result = JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8"));
  if (!result.refreshToken || typeof result.refreshToken !== "string" || !result.clientId || typeof result.clientId !== "string" || !result.email || typeof result.email !== "string") throw new Error("Invalid Gmail token storage.");
  return result;
}
