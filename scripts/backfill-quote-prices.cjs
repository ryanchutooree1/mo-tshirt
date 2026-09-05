// Dry run by default. Uses the existing Firebase CLI session; never sends quotes.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { buildMissingPricePatch } = require('../src/lib/quote-price-backfill');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const backupDir = args.find(arg => arg.startsWith('--backup='))?.slice(9);
const database = args.find(arg => arg.startsWith('--database='))?.slice(11) || '(default)';
const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
const root = `https://firestore.googleapis.com/v1/projects/pocket-entreprise-app/databases/${database}/documents`;
async function request(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${config.tokens.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Firestore request failed: ${response.status}`);
  return response.json();
}
function decode(v) {
  if (v.mapValue) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([key, value]) => [key, decode(value)]));
  if (v.arrayValue) return (v.arrayValue.values || []).map(decode);
  if (v.integerValue !== undefined) return Number(v.integerValue);
  return v.stringValue ?? v.doubleValue ?? v.booleanValue ?? v.timestampValue ?? null;
}
function encode(v) {
  if (v === null) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([key, value]) => [key, encode(value)])) } };
  if (typeof v === 'number') return { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  return { stringValue: String(v) };
}
(async () => {
  const rows = await request(root + ':runQuery', { structuredQuery: { from: [{ collectionId: 'quotes' }] } });
  const candidates = rows.filter(row => row.document).flatMap(({ document }) => {
    const patch = buildMissingPricePatch(decode({ mapValue: { fields: document.fields } }));
    return patch ? [{ document, patch }] : [];
  });
  console.log(JSON.stringify({ candidates: candidates.length, quotes: candidates.map(({ document, patch }) => ({ id: document.name.split('/').pop(), total: patch.quote.total, needsReview: patch.automaticPricing.requiresReview })) }));
  if (!apply || !candidates.length) return;
  if (!backupDir) throw new Error('--backup directory is required before applying changes');
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `quote-prices-before-${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify(candidates.map(row => row.document), null, 2), { mode: 0o600 });
  // Atomic commit and update-time preconditions protect concurrent staff edits.
  if (candidates.length > 450) throw new Error('Too many records for one atomic batch');
  await request(root + ':commit', { writes: candidates.map(({ document, patch }) => {
    const fields = encode(patch).mapValue.fields;
    const previous = document.fields.quote?.mapValue?.fields;
    if (previous) {
      const next = fields.quote.mapValue.fields;
      // Preserve exact Firestore types on fields outside the pricing repair.
      fields.quote.mapValue.fields = { ...previous, lines: next.lines, subtotal: next.subtotal, deliveryFee: next.deliveryFee, total: next.total };
      const oldLines = previous.lines?.arrayValue?.values || [];
      next.lines.arrayValue.values = next.lines.arrayValue.values.map((line, index) => {
        const old = oldLines[index];
        const oldValue = old && decode(old);
        return oldValue && (Number(oldValue.unitPrice) > 0 || oldValue.priceSource === 'manual' || oldValue.includeInTotals === false) ? old : line;
      });
    }
    return { update: { name: document.name, fields }, updateMask: { fieldPaths: ['quote', 'automaticPricing'] }, currentDocument: { updateTime: document.updateTime } };
  }) });
  console.log(`Updated ${candidates.length} quotes. Backup: ${backup}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
