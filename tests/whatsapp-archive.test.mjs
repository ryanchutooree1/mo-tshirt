import assert from "node:assert/strict";
import test from "node:test";
import { encryptArchiveBytes, decryptArchiveBytes } from "../src/lib/whatsapp-archive-crypto.ts";
import { hasAdminPageAccess, hasAdminApiAccess } from "../src/lib/admin-access.ts";

test("archive encryption rejects tampering, wrong key, and file identity substitution", () => {
  const previous = process.env.WHATSAPP_ARCHIVE_ENCRYPTION_KEY;
  try {
    process.env.WHATSAPP_ARCHIVE_ENCRYPTION_KEY = "a".repeat(64);
    const input = Buffer.from("Private conversation sample");
    const encrypted = encryptArchiveBytes(input, "file:a:1");
    assert.equal(encrypted.includes(input), false);
    assert.deepEqual(decryptArchiveBytes(encrypted, "file:a:1"), input);
    assert.throws(() => decryptArchiveBytes(encrypted, "file:a:2"));
    const changed = Buffer.from(encrypted); changed[changed.length - 1] ^= 1;
    assert.throws(() => decryptArchiveBytes(changed, "file:a:1"));
    process.env.WHATSAPP_ARCHIVE_ENCRYPTION_KEY = "b".repeat(64);
    assert.throws(() => decryptArchiveBytes(encrypted, "file:a:1"));
  } finally {
    if (previous === undefined) delete process.env.WHATSAPP_ARCHIVE_ENCRYPTION_KEY;
    else process.env.WHATSAPP_ARCHIVE_ENCRYPTION_KEY = previous;
  }
});

test("WhatsApp stays owner-only even if a staff session contains its page permission", () => {
  for (const allowed of [[], ["/admin"], ["/admin/whatsapp"]]) {
    assert.equal(hasAdminPageAccess(allowed, "/admin/whatsapp", { isOwner: false }), false);
    assert.equal(hasAdminApiAccess(allowed, "/api/admin/whatsapp", { isOwner: false }), false);
  }
  assert.equal(hasAdminPageAccess([], "/admin/whatsapp", { isOwner: true }), true);
  assert.equal(hasAdminApiAccess([], "/api/admin/whatsapp", { isOwner: true }), true);
});

