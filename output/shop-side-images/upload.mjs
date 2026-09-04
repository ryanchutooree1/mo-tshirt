import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import nextEnv from '@next/env';

// Run from the repository root after reviewing the generated images.
// Uses the same authenticated upload and save routes as the shop administrator.
nextEnv.loadEnvConfig(process.cwd());
const origin = 'http://localhost:3000';
const directory = path.dirname(new URL(import.meta.url).pathname);
const targets = JSON.parse(await fs.readFile(path.join(directory, 'targets.json')));
const receiptsPath = path.join(directory, 'upload-receipts.json');
const receipts = JSON.parse(await fs.readFile(receiptsPath, 'utf8').catch(() => '[]'));
const login = await fetch(`${origin}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
});
assert(login.ok, `Login failed: ${login.status}`);
const cookie = login.headers.getSetCookie().find(value => value.startsWith('admin-auth=')).split(';')[0];
async function catalog() {
  const response = await fetch(`${origin}/api/admin/shops`, { headers: { Cookie: cookie } });
  assert(response.ok, `Catalog failed: ${response.status}`);
  return (await response.json()).items;
}
const items = await catalog();
for (const target of targets) {
  if (receipts.some(record => record.id === target.id && record.saved)) continue;
  const filePath = path.join(directory, 'generated', `${target.slug}-side.png`);
  const bytes = await fs.readFile(filePath).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!bytes) continue;
  const item = items.find(entry => entry.id === target.id);
  assert(item, `Missing product ${target.id}`);
  assert.equal(item.title, target.title);
  assert.deepEqual(item.colors, target.colors);
  const previousReceipt = receipts.find(record => record.id === target.id);
  assert(!item.sidePhotoUrl || item.sidePhotoUrl === previousReceipt?.url, `Side view already exists: ${target.slug}`);
  let receipt = previousReceipt;
  if (!receipt) {
    const form = new FormData();
    form.append('file', new File([bytes], `${target.slug}-side.png`, { type: 'image/png' }));
    const upload = await fetch(`${origin}/api/admin/shops/upload`, {
      method: 'POST', headers: { Cookie: cookie, Origin: origin }, body: form,
    });
    assert(upload.ok, `Upload failed for ${target.slug}: ${upload.status}`);
    const data = await upload.json();
    assert(data.ok && data.url, `Invalid upload for ${target.slug}`);
    receipt = { id: target.id, slug: target.slug, url: data.url, uploadId: data.uploadId, saved: false };
    receipts.push(receipt);
    await fs.writeFile(receiptsPath, JSON.stringify(receipts, null, 2));
  }
  const response = await fetch(`${origin}/api/admin/shops/${encodeURIComponent(item.id)}`, {
    method: 'PUT', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...item, sidePhotoUrl: receipt.url }),
  });
  assert(response.ok, `Save failed for ${target.slug}: ${response.status}`);
  receipt.saved = true;
  await fs.writeFile(receiptsPath, JSON.stringify(receipts, null, 2));
  console.log(`Saved ${target.slug} (${receipts.filter(entry => entry.saved).length}/${targets.length})`);
}
const after = await catalog();
for (const receipt of receipts.filter(entry => entry.saved)) {
  assert.equal(after.find(item => item.id === receipt.id)?.sidePhotoUrl, receipt.url);
}
console.log(`Verified ${receipts.filter(entry => entry.saved).length} saved side views.`);
