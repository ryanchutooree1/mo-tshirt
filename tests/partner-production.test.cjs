const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function loader(overrides = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { exports, require: name => name in overrides ? overrides[name] : name.startsWith('@/') ? load('src/' + name.slice(2) + '.ts') : name.startsWith('./') ? load(path.resolve(path.dirname(file), name) + '.ts') : require(name), Date, Intl, URL, TextEncoder, Buffer, process: { env: {} }, console: { error() {} } }, { filename: file });
    return exports;
  }
  return load;
}
const load = loader(), packet = load('src/lib/production-packet.ts'), production = load('src/lib/partner-production.ts');
const now = '2026-10-02T06:00:00.000Z';
const actor = { userId: 'partner:yan', displayName: 'Synthetic Yan', kind: 'partner' };
function quote() {
  return { status: 'approved', clientDecision: 'accepted', printMethod: 'DTF', printPlacement: 'Front chest', printDimensions: '20 x 25 cm', deadline: '2026-10-20',
    quote: { documentNumber: 'Q-SYNTHETIC', currency: 'Rs', total: 1000, lines: [{ description: 'Shirt', color: 'Blue', size: 'M', quantity: 2, unitPrice: 500 }] },
    garments: [{ garment: 'Shirt', color: 'Blue', size: 'M', quantity: 2 }],
    partner: { id: 'yan', visibleTo: ['yan'], requestStatus: 'pending', productionStatus: 'not_started' },
    attachments: [{ role: 'print-artwork', filename: 'processed.png', contentType: 'image/png', url: '/uploads/processed.png', originalFilename: 'client-original.svg', originalContentType: 'image/svg+xml', originalUrl: '/uploads/original.svg', originalSize: 321, originalProvenance: 'client-upload' }],
    email: 'PRIVATE-CUSTOMER', paymentEvidence: { url: '/uploads/PRIVATE-proof.png', verificationStatus: 'confirmed' }, paymentReceipt: { amountReceived: 1000 },
  };
}
function releasedQuote() {
  const q = quote(), p = packet.buildProductionPacket('q', q), fingerprint = packet.productionPacketFingerprint(p), pricing = packet.productionQuotePricing(q), lifecycle = packet.productionLifecycleFingerprint(q);
  q.printJobHandoff = { version: 3,
    priceConfirmation: { id: 'agreement', pricingFingerprint: pricing.fingerprint, packetFingerprint: fingerprint, lifecycleFingerprint: lifecycle, agreedTotal: 1000, currency: 'Rs', confirmedAtIso: now },
    payments: [{ id: 'payment', amountReceived: 500, currency: 'Rs', confirmedAtIso: now }],
    delivery: { state: 'sent', mode: 'live', requestId: 'send-id', previewFingerprint: 'a'.repeat(64), messageId: 'mail-id' },
  };
  q.productionRelease = { version: 1, id: 'release-id', state: 'released', mode: 'live', partnerId: 'yan', requestId: 'send-id', previewId: 'preview-id', previewFingerprint: 'a'.repeat(64), packetFingerprint: fingerprint, packet: p, priceConfirmationId: 'agreement', paymentRecordId: 'payment', pricingFingerprint: pricing.fingerprint, lifecycleFingerprint: lifecycle, releasedAtIso: now, messageId: 'mail-id' };
  return q;
}
const base = q => ({ quoteId: 'q', quote: q, partnerId: 'yan', decision: 'accepted', currentStatus: 'not_started', nextStatus: 'not_started', completionDays: null, price: null, actor, now });
const start = q => ({ ...base(q), action: 'start-production', releaseId: q.productionRelease?.id, packetFingerprint: q.productionRelease?.packetFingerprint, receivedProducts: q.productionRelease?.packet.products, blanksReceived: true });
const json = value => JSON.parse(JSON.stringify(value));

test('legacy acceptance requires server-side positive price and days and never starts production', () => {
  for (const fields of [{}, { price: 100 }, { completionDays: 2 }, { price: 0, completionDays: 2 }, { price: 100, completionDays: -1 }]) assert.throws(() => production.validatePartnerProductionChange({ ...base(quote()), ...fields }), /positive completion days/);
  assert.equal(production.validatePartnerProductionChange({ ...base(quote()), completionDays: 2, price: 100 }).status, 'not_started');
});
test('released acknowledgement needs no new quote and explicit start requires exact receipt', () => {
  const q = releasedQuote(); assert.equal(packet.productionReleaseReadiness('q', q).ready, true);
  assert.equal(production.validatePartnerProductionChange(base(q)).status, 'not_started');
  for (const fields of [{ blanksReceived: false }, { receivedProducts: [] }, { releaseId: 'stale' }, { packetFingerprint: 'b'.repeat(64) }, { decision: 'pending' }]) assert.throws(() => production.validatePartnerProductionChange({ ...start(q), ...fields }));
  const result = production.validatePartnerProductionChange(start(q));
  assert.equal(result.status, 'in_progress'); assert.equal(result.writeStart, true);
  assert.deepEqual(json(result.start.products), json(q.productionRelease.packet.products)); assert.deepEqual(json(result.start.actor), actor); assert.equal(result.start.startedAtIso, now);
});
test('generic response cannot bypass explicit start or jump straight to completion', () => {
  for (const status of ['in_progress', 'completed', 'will_post_tomorrow', 'ryan_to_collect']) for (const q of [quote(), releasedQuote()]) assert.throws(() => production.validatePartnerProductionChange({ ...base(q), completionDays: 2, price: 100, nextStatus: status }), /Start production/);
});
test('start retry preserves original checked quantities, actor and time; completion requires same valid release', () => {
  const q = releasedQuote(); q.productionStart = production.validatePartnerProductionChange(start(q)).start;
  const retry = production.validatePartnerProductionChange({ ...start(q), currentStatus: 'in_progress', now: '2026-10-03T00:00:00Z' });
  assert.equal(retry.writeStart, false); assert.equal(retry.start.startedAtIso, now);
  assert.equal(production.validatePartnerProductionChange({ ...base(q), currentStatus: 'in_progress', nextStatus: 'completed' }).status, 'completed');
  q.garments[0].size = 'L'; assert.throws(() => production.validatePartnerProductionChange({ ...base(q), currentStatus: 'in_progress', nextStatus: 'completed' }), /changed/);
});
test('test-only, failed/unknown delivery, stale file, changed price, insufficient payment and cancellation all fail closed', () => {
  for (const change of [q => q.printJobHandoff.delivery.mode = 'test', q => q.printJobHandoff.delivery.state = 'unknown', q => q.attachments[0].originalUrl = '/uploads/changed.svg', q => q.quote.total = 1100, q => q.printJobHandoff.payments[0].amountReceived = 499.99, q => q.printJobHandoff.payments = [], q => q.printJobWorkflow = { stage: 'declined', version: 1 }, q => q.clientDecision = 'rejected']) {
    const q = releasedQuote(); change(q); assert.throws(() => production.validatePartnerProductionChange(start(q)));
  }
});
test('wrong partner, forged receipt actor and missing release cannot authorize production', () => {
  const q = releasedQuote(); assert.throws(() => production.validatePartnerProductionChange({ ...start(q), partnerId: 'other' }));
  q.productionStart = { ...production.validatePartnerProductionChange(start(q)).start, actor: {} };
  assert.throws(() => production.validatePartnerProductionChange({ ...base(q), nextStatus: 'completed' }), /Start production/);
  delete q.productionRelease; assert.throws(() => production.validatePartnerProductionChange({ ...start(q), completionDays: 2, price: 100 }));
});

function setup(initial = quote(), options = {}) {
  const records = new Map([['quotes/q', initial], ...(options.order ? [['transactions/order', options.order]] : [])]), writes = [], reads = [];
  const snap = ref => ({ id: ref.split('/').at(-1), ref, exists: () => records.has(ref), data: () => structuredClone(records.get(ref)) });
  const at = (object, field) => field.split('.').reduce((o, k) => o?.[k], object);
  const firestore = { doc: (_db, ...parts) => parts.join('/'), collection: (_db, name) => name, where: (key, op, value) => ({ key, op, value }), limit: n => ({ limit: n }), query: (name, ...clauses) => ({ name, clauses }), serverTimestamp: () => new Date(now),
    getDoc: async ref => { reads.push(ref); return snap(ref); },
    getDocs: async query => ({ docs: [...records].filter(([key, value]) => key.startsWith(query.name + '/') && query.clauses.filter(c => c.key).every(c => c.op === 'array-contains' ? at(value, c.key)?.includes(c.value) : at(value, c.key) === c.value)).map(([key]) => snap(key)) }),
    runTransaction: async (_db, fn) => {
      if (options.beforeTransaction) options.beforeTransaction(records.get('quotes/q'));
      const pending = []; const result = await fn({ get: firestore.getDoc, update: (ref, data) => pending.push({ ref, data }) });
      for (const entry of pending) { writes.push(entry); const current = records.get(entry.ref); for (const [field, value] of Object.entries(entry.data)) { const parts = field.split('.'); const key = parts.pop(); let parent = current; for (const part of parts) parent = parent[part] ||= {}; parent[key] = structuredClone(value); } }
      return result;
    },
  };
  const partner = { id: 'yan', name: 'Synthetic Yan', active: options.active !== false, productionNotes: [], supportsLogoPrintPlacements: false };
  const modules = { 'firebase/firestore': firestore, '@/lib/firebase': { db: {} }, 'next/headers': { cookies: async () => ({}) },
    '@/lib/partner-registry': { getPrintPartnerById: async id => id === 'yan' ? partner : null, getProductionManager: async () => { if (options.manager) return options.manager; throw new Error('No email allowed in tests'); } },
    '@/lib/admin-auth': { readAdminSession: async () => options.owner ? { isOwner: true, userId: 'owner', displayName: 'Synthetic Owner' } : null },
    '@/lib/partner-auth': { readPartnerSession: async () => options.signedIn === false ? null : { partnerId: options.sessionPartner || 'yan', displayName: 'Synthetic Yan' } },
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } }, '@/lib/seo': { SITE_URL: 'https://app.synthetic.example.test' },
    '@/lib/request-safety': { isRequestOriginAllowed: req => req.headers.get('origin') === 'https://app.synthetic.example.test', isContentLengthWithinLimit: (headers, max) => !headers.get('content-length') || Number(headers.get('content-length')) <= max },
  };
  const local = loader(modules), serializer = local('src/lib/partner-orders.ts'), api = local('app/api/partners/orders/[id]/route.ts');
  const patch = (body, extra = {}) => api.PATCH(new Request('https://app.synthetic.example.test/api/partners/orders/q', { method: 'PATCH', headers: { origin: 'https://app.synthetic.example.test', 'content-type': 'application/json', ...extra.headers }, body: extra.raw ?? JSON.stringify({ partnerId: 'yan', ...body }) }), { params: Promise.resolve({ id: 'q' }) });
  return { records, writes, reads, serializer, patch };
}

test('PATCH enforces authentication, existing partner lock and current transaction assignment', async () => {
  for (const options of [{ signedIn: false }, { sessionPartner: 'other' }]) { const s = setup(quote(), options); assert.equal((await s.patch({ decision: 'accepted', price: 100, completionDays: 2 })).status, 401); assert.equal(s.reads.length, 0); }
  const locked = quote(); locked.partner.lockedBy = 'other'; const s = setup(locked); assert.equal((await s.patch({ decision: 'accepted', price: 100, completionDays: 2 })).status, 404); assert.equal(s.writes.length, 0);
  const race = setup(quote(), { beforeTransaction: q => q.partner.lockedBy = 'other' }); assert.equal((await race.patch({ decision: 'accepted', price: 100, completionDays: 2 })).status, 409); assert.equal(race.writes.length, 0);
});
test('PATCH legacy validation is server-side and acknowledgement preserves not_started', async () => {
  for (const fields of [{}, { price: -1, completionDays: 2 }, { price: true, completionDays: 2 }, { price: 100, completionDays: 'NaN' }]) { const s = setup(); assert.equal((await s.patch({ decision: 'accepted', ...fields })).status, 400); assert.equal(s.writes.length, 0); }
  const s = setup(); const response = await s.patch({ decision: 'accepted', price: 100, completionDays: 2 }); assert.equal(response.status, 200); assert.equal((await response.json()).order.productionStatus, 'not_started'); assert.equal(s.records.get('quotes/q').productionStart, undefined);
});
test('PATCH released accept -> checked start -> completed records receipt only and never touches inventory', async () => {
  const s = setup(releasedQuote()); assert.equal((await s.patch({ decision: 'accepted' })).status, 200);
  let q = s.records.get('quotes/q'); assert.equal(q.partner.productionStatus, 'not_started');
  const payload = { action: 'start-production', releaseId: q.productionRelease.id, packetFingerprint: q.productionRelease.packetFingerprint, blanksReceived: true, receivedProducts: q.productionRelease.packet.products };
  assert.equal((await s.patch({ ...payload, blanksReceived: false })).status, 400);
  assert.equal((await s.patch(payload)).status, 200); q = s.records.get('quotes/q'); const startTime = q.productionStart.startedAtIso;
  assert.equal(q.partner.productionStatus, 'in_progress'); assert.equal(q.productionStart.actor.userId, 'partner:yan');
  assert.equal((await s.patch(payload)).status, 200); assert.equal(q.productionStart.startedAtIso, startTime);
  assert.equal((await s.patch({ productionStatus: 'completed' })).status, 200);
  assert.ok(s.writes.every(entry => entry.ref === 'quotes/q')); assert.equal(q.productionStart.blanksReceived, true);
});
test('PATCH direct production/completion and cancelled linked orders are blocked without writes', async () => {
  for (const status of ['in_progress', 'completed', 'will_post_tomorrow', 'ryan_to_collect']) { const s = setup(releasedQuote()); assert.equal((await s.patch({ decision: 'accepted', productionStatus: status })).status, 409); assert.equal(s.writes.length, 0); }
  for (const explicit of [true, false]) { const q = releasedQuote(); if (explicit) q.orderTransactionId = 'order'; const s = setup(q, { order: { quoteId: 'q', status: 'Cancelled' } }); assert.equal((await s.patch({ decision: 'accepted' })).status, 409); assert.equal(s.writes.length, 0); }
});
test('PATCH rejects oversized and malformed bodies before writes and ignores forged start decision', async () => {
  for (const extra of [{ raw: '{' }, { raw: 'x'.repeat(40000) }, { headers: { origin: 'https://evil.test' } }]) { const s = setup(); assert.ok([400,403,413].includes((await s.patch({}, extra)).status)); assert.equal(s.writes.length, 0); }
  const q = releasedQuote(), s = setup(q); assert.equal((await s.patch({ ...start(q), decision: 'accepted', quote: undefined, actor: undefined })).status, 409); assert.equal(s.writes.length, 0);
});
test('serializer exposes only canonical released production packet and retains safe legacy originals', () => {
  const q = releasedQuote(), s = setup(q), view = s.serializer.sanitizePartnerOrder('q', q, 'yan');
  assert.deepEqual(json(view.production.packet), json(q.productionRelease.packet)); assert.equal(view.production.released, true);
  assert.ok(!JSON.stringify(view).includes('PRIVATE')); assert.ok(!JSON.stringify(view).includes('paymentRecordId'));
  const legacy = quote(); legacy.attachments.push({ filename: 'missing.pdf', label: 'Missing file' });
  const v = s.serializer.sanitizePartnerOrder('q', legacy, 'yan'); assert.equal(v.details.artwork.length, 2); assert.equal(v.details.artwork[0].originalFilename, 'client-original.svg'); assert.equal(v.details.artwork[0].originalSize, 321); assert.equal(v.details.artwork[1].url, undefined); assert.equal(v.production.released, false);
  q.partner.visibleFields = ['garments']; assert.equal(s.serializer.sanitizePartnerOrder('q', q, 'yan').production.packet, null);
});

test('PATCH cannot start when production fields are hidden even with a correct forged receipt', async () => {
 const q = releasedQuote(); q.partner.visibleFields = ['garments']; q.partner.requestStatus = 'accepted';
 const s = setup(q); const result = await s.patch({ action: 'start-production', releaseId: q.productionRelease.id, packetFingerprint: q.productionRelease.packetFingerprint, blanksReceived: true, receivedProducts: q.productionRelease.packet.products });
 assert.equal(result.status, 409); assert.equal(s.writes.length, 0);
});

test('legacy partner files exclude private receipt aliases and cannot leak Yan canonical packet to other partners', () => {
 const q = quote(); q.attachments.push({ filename: 'bank-receipt.png', role: 'final-mockup', url: '/private/receipt.png' }, { filename: 'generic.png', url: q.paymentEvidence.url });
 q.designBrief = { finalMockups: { front: '/private/receipt.png', back: q.paymentEvidence.url } };
 const s = setup(q); const view = s.serializer.sanitizePartnerOrder('q', q, 'yan');
 assert.equal(view.details.artwork.length, 1); assert.equal(view.details.mockups.length, 0); assert.ok(!JSON.stringify(view).includes('/private/')); assert.ok(!JSON.stringify(view).includes('PRIVATE'));
 const released = releasedQuote(); released.partner.visibleTo = ['yan', 'other'];
 const other = s.serializer.sanitizePartnerOrder('q', released, 'other'); assert.equal(other.production.packet, null); assert.equal(other.production.releaseId, null); assert.equal(other.production.released, false);
});

test('missing configured manager email saves the response and warns without any fallback send', async () => {
  const s=setup(quote(), {manager:{name:'Synthetic manager',email:''}});
  const response=await s.patch({decision:'needs_info',missingInformation:'Confirm the synthetic print placement'});
  assert.equal(response.status,200);const body=await response.json();
  assert.equal(body.actionEmailSent,false);assert.match(body.actionEmailWarning,/Manager email is not configured/);
  assert.equal(s.records.get('quotes/q').partner.requestStatus,'needs_info');
  assert.ok(!fs.readFileSync('app/api/partners/orders/[id]/route.ts','utf8').includes('FALLBACK_MANAGER_EMAIL'));
});
