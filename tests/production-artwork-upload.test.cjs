// All storage, database and sessions below are synthetic. No services are contacted.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const nodeCrypto = require('node:crypto');
function load(file, modules = {}) {
 const exports = {};
 const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
 vm.runInNewContext(source, { exports, require: name => { if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`); return modules[name]; }, Date, Intl, URL, Request, Response, File, Buffer, console: { error() {} } });
 return exports;
}
const inbox = load('src/lib/quotation-inbox.ts');
const visuals = load('src/lib/print-job-visuals.ts');
const workflow = load('src/lib/print-job-workflow.ts', { './quotation-inbox': inbox, './print-job-visuals': visuals });
const packet = load('src/lib/production-packet.ts', { 'node:crypto': nodeCrypto, './print-job-workflow': workflow });
const domain = load('src/lib/print-job-handoff.ts', { 'node:crypto': nodeCrypto, './production-packet': packet });
const actor = { userId: 'synthetic-staff', displayName: 'Team', email: 'staff@example.test' };
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const quote = () => ({ status: 'approved', clientDecision: 'accepted', printMethod: 'DTF', printPlacement: 'Front chest', printDimensions: '20 x 25 cm', quote: { total: 1000, currency: 'Rs', lines: [{ description: 'T-shirt', quantity: 2, unitPrice: 500 }] }, garments: [{ garment: 'T-shirt', color: 'Black', size: 'M', quantity: 2 }], attachments: [{ filename: 'original.png', url: '/old.png', role: 'print-artwork' }], printJobHandoff: { version: 0, payments: [], preview: { id: 'stale-preview' }, delivery: null, priceConfirmation: { id: 'old-agreement' } } });
const hash = q => packet.productionPacketFingerprint(packet.buildProductionPacket('q', q));
function setup(options = {}) {
 const initial = options.quote || quote();
 initial.printJobHandoff ||= { version: 0 };
 if (initial.printJobHandoff.priceConfirmation) initial.printJobHandoff.priceConfirmation.packetFingerprint = hash(initial);
 const records = new Map([['quotes/q', initial]]), writes = [], uploads = [];
 if (options.order) records.set('transactions/order', options.order);
 let gate = Promise.resolve(), failAttach = Boolean(options.failAttach);
 const snapshot = key => ({ exists: () => records.has(key), data: () => records.has(key) ? structuredClone(records.get(key)) : undefined });
 const firestore = {
  doc: (_db, ...parts) => parts.join('/'), collection: (_db, name) => name, where: (key, op, value) => ({ key, value }), limit: value => ({ limit: value }), query: (name, ...clauses) => ({ name, clauses }),
  getDocs: async request => ({ docs: [...records].filter(([key, value]) => key.startsWith(request.name + '/') && request.clauses.filter(c => c.key).every(c => value[c.key] === c.value)).map(([key]) => ({ id: key.slice(request.name.length + 1) })) }),
  runTransaction: async (_db, fn) => {
   const previous = gate; let release; gate = new Promise(r => release = r); await previous;
   try {
    const pending = [];
    const result = await fn({ get: async key => snapshot(key), set: (key, value) => pending.push({ key, value }), update: (key, value) => pending.push({ key, value, merge: true }) });
    if (failAttach && pending.some(op => op.key === 'quotes/q')) { failAttach = false; throw new Error('Synthetic attachment write failure'); }
    for (const operation of pending) { writes.push(operation); records.set(operation.key, operation.merge ? { ...records.get(operation.key), ...structuredClone(operation.value) } : structuredClone(operation.value)); }
    return result;
   } finally { release(); }
  }
 };
 const uploadStore = { storePublicUploadBuffer: async input => { uploads.push(input); if (options.duringUpload) await options.duringUpload(records); if (options.failUpload) throw new Error('Synthetic uncertain upload'); return { uploadId: 'source-001', url: '/api/quotation/uploads/source-001', filename: input.filename, contentType: input.contentType, size: input.buffer.length, sessionId: input.sessionId, uploadedAt: new Date().toISOString() }; } };
 const store = load('src/lib/production-artwork-upload-store.ts', { sharp: options.sharp || (() => ({ metadata: async () => ({ width: 1, height: 1 }), stats: async () => ({}) })), 'node:crypto': nodeCrypto, 'firebase/firestore': firestore, './firebase': { db: {} }, './public-upload-store': uploadStore, './print-job-handoff': domain, './production-packet': packet });
 const api = load('app/api/admin/print-jobs/[id]/artwork/route.ts', { 'next/server': { NextResponse: { json: Response.json } }, '@/lib/admin-request': { getAdminRequestSession: async () => options.signedIn === false ? null : { ...actor, allowedPages: options.allowed === false ? [] : ['/admin/tanvi'], isOwner: false } }, '@/lib/admin-access': { hasAdminPageAccess: pages => pages.includes('/admin/tanvi') }, '@/lib/print-job-handoff': domain, '@/lib/request-safety': { isRequestOriginAllowed: req => !req.headers.get('origin') || req.headers.get('origin') === new URL(req.url).origin, isContentLengthWithinLimit: (headers, max) => !headers.get('content-length') || Number(headers.get('content-length')) <= max }, '@/lib/production-artwork-upload-store': store });
 const input = { requestId: 'request-001', expectedVersion: 0, packetFingerprint: hash(initial), role: 'print-artwork', filename: 'new-artwork.png', contentType: 'image/png', buffer: png };
 const form = changes => { const data = new FormData(); for (const [key, value] of Object.entries({ requestId: input.requestId, expectedVersion: '0', packetFingerprint: input.packetFingerprint, role: 'print-artwork', file: new File([png], input.filename, { type: input.contentType }), ...changes })) data.append(key, value); return data; };
 const post = (data = form(), { id = 'q', headers = {} } = {}) => api.POST(new Request('https://site.test/api/admin/print-jobs/' + id + '/artwork', { method: 'POST', headers: { origin: 'https://site.test', ...headers }, body: data }), { params: Promise.resolve({ id }) });
 return { records, writes, uploads, store, input, form, post, add: (changes = {}, user = actor) => store.addProductionArtwork('q', { ...input, ...changes }, user) };
}
test('exact original appended; earlier files/settings remain; new file needs details and renewed price review', async () => {
 const s = setup(), before = structuredClone(s.records.get('quotes/q'));
 const response = await s.post(); assert.equal(response.status, 200); const data = await response.json();
 assert.equal(data.ok, true); assert.equal(data.quoteId, 'q'); assert.equal(data.version, 1);
 assert.equal(s.uploads.length, 1); assert.deepEqual(s.uploads[0].buffer, png);
 const saved = s.records.get('quotes/q'), added = saved.attachments[1];
 assert.deepEqual(saved.attachments[0], before.attachments[0]); assert.equal(added.originalUrl, added.url); assert.equal(added.originalUploadId, added.uploadId); assert.equal(added.originalProvenance, 'staff-upload'); assert.equal(added.source, 'production-workspace-original'); assert.equal(added.role, 'print-artwork'); assert.equal(added.backgroundRemovalMethod, undefined);
 assert.equal(saved.printJobHandoff.preview, null); assert.equal(saved.printJobHandoff.priceConfirmation, null);
 const view = packet.buildProductionPacket('q', saved); assert.equal(view.artworks[0].widthCm, 20); assert.equal(view.artworks[0].placement, 'Front chest'); assert.equal(view.artworks[1].placement, ''); assert.equal(view.artworks[1].widthCm, null); assert.equal(view.artworks[1].processed, null); assert.equal(packet.productionPacketReadiness(view).ready, false);
});
test('repeated exact request returns verified same attachment without another storage call', async () => {
 const s = setup(); await s.add(); const count = s.writes.length; const again = await s.add(); assert.equal(again.replayed, true); assert.equal(s.uploads.length, 1); assert.equal(s.writes.length, count); assert.equal(s.records.get('quotes/q').attachments.length, 2);
 await assert.rejects(s.add({ filename: 'different.png' }), /request ID/); await assert.rejects(s.add({}, { ...actor, userId: 'another-user' }), /request ID/); assert.equal(s.uploads.length, 1);
});
test('failed final attachment is retried from stored original without orphan-producing reupload', async () => {
 const s = setup({ failAttach: true }); await assert.rejects(s.add(), /write failure/); assert.equal(s.uploads.length, 1); assert.equal(s.records.get('quotes/q').attachments.length, 1);
 const result = await s.add(); assert.equal(result.ok, true); assert.equal(s.uploads.length, 1); assert.equal(s.records.get('quotes/q').attachments.length, 2);
});
test('uncertain source write keeps operation reserved and never blindly repeats external storage', async () => {
 const s = setup({ failUpload: true }); await assert.rejects(s.add(), /uncertain upload/); await assert.rejects(s.add(), /in progress or unconfirmed/); assert.equal(s.uploads.length, 1); assert.equal(s.records.get('quotes/q').attachments.length, 1);
});
test('same-operation concurrent submissions produce one source and one attachment', async () => {
 const s = setup(); const outcomes = await Promise.allSettled([s.add(), s.add()]); assert.ok(outcomes.some(value => value.status === 'fulfilled')); assert.equal(s.uploads.length, 1); assert.equal(s.records.get('quotes/q').attachments.length, 2);
});
test('stale packet or version, missing quote, closed linked order and active release refuse before uploading', async () => {
 for (const patch of [{ expectedVersion: 1 }, { packetFingerprint: 'a'.repeat(64) }]) { const s = setup(); await assert.rejects(s.add(patch), /changed/); assert.equal(s.uploads.length, 0); }
 const missing = setup(); missing.records.delete('quotes/q'); assert.equal((await missing.post()).status, 404); assert.equal(missing.uploads.length, 0);
 for (const state of ['sending', 'unknown', 'released', 'sent']) {
  const q = quote(); if (state === 'released') q.productionRelease = { state: 'released' }; else q.printJobHandoff.delivery = { state, mode: 'live', requestId: 'send-one' };
  const s = setup({ quote: q }); await assert.rejects(s.add(), /released, sending or unconfirmed/); assert.equal(s.uploads.length, 0);
 }
 const closed = setup({ order: { quoteId: 'q', status: 'delivered' } }); await assert.rejects(closed.add(), /Reopen/); assert.equal(closed.uploads.length, 0);
});
test('intervening edit or send after storage blocks atomic attachment and preserves originals', async () => {
 for (const mutate of [q => q.printJobHandoff.version++, q => q.attachments.push({ filename: 'other.png', url: '/other.png' }), q => { q.productionRelease = { state: 'released' }; }]) {
  const s = setup({ duringUpload: async records => mutate(records.get('quotes/q')) }); await assert.rejects(s.add(), /changed|released/); assert.equal(s.uploads.length, 1); assert.ok(!s.records.get('quotes/q').attachments.some(file => file.uploadId === 'source-001'));
 }
});
test('legacy singular source is preserved and role cannot convert a mockup or payment document', async () => {
 const q = quote(); q.attachment = q.attachments[0]; delete q.attachments; const s = setup({ quote: q }); await s.add(); assert.equal(s.records.get('quotes/q').attachments[0].url, '/old.png');
 for (const patch of [{ role: 'final-mockup' }, { filename: 'bank-proof.png' }]) { const bad = setup(); await assert.rejects(bad.add(patch)); assert.equal(bad.uploads.length, 0); }
});
test('session, access, origin, media, streaming size and duplicate-field gates prevent upload writes', async () => {
 for (const options of [{ signedIn: false }, { allowed: false }]) { const s = setup(options); assert.ok([401, 403].includes((await s.post()).status)); assert.equal(s.writes.length, 0); }
 for (const headers of [{ origin: 'https://other.test' }, { 'sec-fetch-site': 'cross-site' }, { 'content-length': String(8 * 1024 * 1024) }, { 'content-type': 'application/json' }]) { const s = setup(); assert.ok([403, 413, 415].includes((await s.post(s.form(), { headers })).status)); assert.equal(s.writes.length, 0); }
 const s = setup(), duplicate = s.form(); duplicate.append('role', 'print-artwork'); assert.equal((await s.post(duplicate)).status, 400);
 const tooBig = new Uint8Array(s.store.MAX_PRODUCTION_ARTWORK_REQUEST_BYTES + 1); assert.equal((await s.post(tooBig, { headers: { 'content-type': 'multipart/form-data; boundary=synthetic' } })).status, 413); assert.equal(s.uploads.length, 0);
});
test('only bounded, matching raster/PDF headers allowed; SVG and active PDF content are never served', async () => {
 const { store } = setup();
 for (const [name, mime, data] of [['a.png', 'image/png', png], ['a.jpg', 'image/jpeg', Buffer.from([255, 216, 255, 224])], ['a.webp', 'image/webp', Buffer.from('RIFFxxxxWEBP')], ['a.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n')]]) await assert.doesNotReject(() => store.validateProductionArtworkFile(name, mime, data));
 for (const [name, mime, data] of [['a.svg', 'image/svg+xml', Buffer.from('<svg/>')], ['a.png', 'image/png', Buffer.from('<html>')], ['a.jpg', 'image/png', png], ['a.png', 'image/png', Buffer.alloc(0)], ['a.png', 'image/png', Buffer.alloc(store.MAX_PRODUCTION_ARTWORK_BYTES + 1)], ['a.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n/Java#53cript\n%%EOF')], ['a.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n/ObjStm\n%%EOF')]]) await assert.rejects(() => store.validateProductionArtworkFile(name, mime, data));
});

test('plain job upload can keep its packet fingerprint but still clears client approval', async () => {
 const q = quote(); q.printMethod = 'No printing'; const s = setup({ quote: q }), previous = hash(s.records.get('quotes/q')); const response = await s.add();
 assert.equal(response.packetFingerprint, previous); assert.equal(response.version, 1); assert.equal(s.records.get('quotes/q').printJobHandoff.priceConfirmation, null);
});

test('existing local sharp validates decoding without altering original source bytes', async () => {
 const sharp = require('sharp'), s = setup({ sharp });
 const valid = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#123456' } }).png().toBuffer();
 await assert.doesNotReject(s.store.validateProductionArtworkFile('valid.png', 'image/png', valid));
 await assert.rejects(s.store.validateProductionArtworkFile('broken.png', 'image/png', png), /damaged/);
 const result = await s.add({ buffer: valid }); assert.equal(result.ok, true); assert.deepEqual(s.uploads[0].buffer, valid);
});

test('neutral payment-evidence filename collision is rejected before storing another original', async () => {
 const q = quote(); q.paymentEvidence = { filename: 'new-artwork.png', url: '/private.png' }; const s = setup({ quote: q });
 await assert.rejects(s.add(), /matches payment evidence/); assert.equal(s.uploads.length, 0); assert.equal(s.writes.length, 0);
});
