import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

function key() {
  const secret = process.env.WHATSAPP_ARCHIVE_ENCRYPTION_KEY || process.env.CRON_SECRET;
  if (!secret || secret.length < 32) throw new Error("A strong server archive encryption secret is required.");
  return Buffer.from(hkdfSync("sha256", secret, "mo-tshirt-whatsapp-archive-v1", "content-encryption", 32));
}

export function encryptArchiveBytes(bytes: Uint8Array, identity: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(identity));
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptArchiveBytes(encrypted: Buffer, identity: string) {
  if (encrypted.length < 29 || encrypted[0] !== 1) throw new Error("Invalid archive envelope.");
  const decipher = createDecipheriv("aes-256-gcm", key(), encrypted.subarray(1, 13));
  decipher.setAAD(Buffer.from(identity));
  decipher.setAuthTag(encrypted.subarray(13, 29));
  return Buffer.concat([decipher.update(encrypted.subarray(29)), decipher.final()]);
}
