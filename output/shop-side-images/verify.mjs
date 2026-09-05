import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const directory = path.dirname(new URL(import.meta.url).pathname);
const origin = 'http://localhost:3000';
const before = JSON.parse(await fs.readFile(path.join(directory, 'catalog-before.json'))).items;
const receipts = JSON.parse(await fs.readFile(path.join(directory, 'upload-receipts.json')));
assert.equal(receipts.length, 56);
assert(receipts.every(item => item.saved));
const response = await fetch(`${origin}/api/shops`);
assert(response.ok);
const after = (await response.json()).items;
assert.equal(after.length, before.length);
assert(after.every(item => item.sidePhotoUrl));
for (const original of before) {
  const current = after.find(item => item.id === original.id);
  assert(current);
  for (const key of Object.keys(original)) {
    if (key === 'sidePhotoUrl' && !original.sidePhotoUrl) continue;
    assert.deepEqual(current[key], original[key], `${original.id}: ${key} changed`);
  }
}
const checked = [];
for (let offset = 0; offset < receipts.length; offset += 4) {
  const results = await Promise.allSettled(receipts.slice(offset, offset + 4).map(async receipt => {
    assert.equal(after.find(item => item.id === receipt.id).sidePhotoUrl, receipt.url);
    const dimensions = {};
    for (const variant of ['full', 'thumbnail']) {
      const url = new URL(receipt.url, origin);
      if (variant === 'thumbnail') url.searchParams.set('variant', 'thumbnail');
      const image = await fetch(url, { signal: AbortSignal.timeout(60000) });
      assert(image.ok, `${receipt.slug} ${variant}: HTTP ${image.status}`);
      assert(image.headers.get('content-type')?.startsWith('image/'));
      const bytes = Buffer.from(await image.arrayBuffer());
      const metadata = await sharp(bytes).metadata();
      assert(metadata.width > 0 && metadata.height > 0);
      if (variant === 'full') assert(metadata.width >= 1000 && metadata.height >= 1000);
      if (variant === 'thumbnail') assert(metadata.width <= 320 && metadata.height <= 320);
      dimensions[variant] = { width: metadata.width, height: metadata.height, bytes: bytes.length };
    }
    return { id: receipt.id, slug: receipt.slug, url: receipt.url, dimensions };
  }));
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason;
    checked.push(result.value);
  }
  console.log(`Verified images and thumbnails: ${checked.length}/${receipts.length}`);
}
const report = {
  verifiedAt: new Date().toISOString(),
  productCount: after.length,
  generatedSideViews: checked.length,
  existingSideViewsPreserved: before.filter(item => item.sidePhotoUrl).length,
  allProductsHaveSideView: true,
  otherProductFieldsUnchanged: true,
  checked,
};
await fs.writeFile(path.join(directory, 'verification.json'), JSON.stringify(report, null, 2));
console.log('All product images verified. Existing catalog fields unchanged.');
