// All storage, database and sessions below are synthetic. No external service is contacted.
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
const hash = q => packet.productionPacketFingerprint(packet.buildProductionPacket('q', q));
const quote = () => {
  const value = {
    status: 'approved', clientDecision: 'accepted', printMethod: 'DTF', printPlacement: 'Front chest', printDimensions: '20 x 25 cm',
    quote: { total: 1000, currency: 'Rs', lines: [{ description: 'T-shirt', quantity: 2, unitPrice: 500 }] },
    garments: [{ garment: 'T-shirt', color: 'Black', size: 'M', quantity: 2 }],
    attachments: [
      { filename: 'logo.png', url: '/logo.png', role: 'print-artwork' },
      { filename: 'old-front.png', url: '/old-front.png', role: 'final-mockup', side: 'front' },
      { filename: 'old-back.png', url: '/old-back.png', role: 'final-mockup', side: 'back' },
    ],
    designBrief: { finalMockups: { front: '/old-front.png', back: '/old-back.png' } },
    printJobHandoff: { version: 0, payments: [], preview: { id: 'stale-preview' }, delivery: null, priceConfirmation: null },
  };
  value.printJobHandoff.priceConfirmation = { id: 'old-agreement', packetFingerprint: hash(value) };
  return value;
};

function setup(options = {}) {
  const initial = options.quote || quote();
  const records = new Map([['quotes/q', initial]]), writes = [], uploads = [];
  if (options.order) records.set('transactions/order', options.order);
  let gate = Promise.resolve(), uploadNumber = 0;
  const snapshot = key => ({ exists: () => records.has(key), data: () => records.has(key) ? structuredClone(records.get(key)) : undefined });
  const firestore = {
    doc: (_db, ...parts) => parts.join('/'),
    collection: (_db, name) => name,
    where: (key, op, value) => ({ key, value }),
    limit: value => ({ limit: value }),
    query: (name, ...clauses) => ({ name, clauses }),
    getDocs: async request => ({ docs: [...records].filter(([key, value]) => key.startsWith(request.name + '/') && request.clauses.filter(clause => clause.key).every(clause => value[clause.key] === clause.value)).map(([key]) => ({ id: key.slice(request.name.length + 1) })) }),
    runTransaction: async (_db, fn) => {
      const previous = gate; let release; gate = new Promise(resolve => { release = resolve; }); await previous;
      try {
        const pending = [];
        const result = await fn({ get: async key => snapshot(key), set: (key, value) => pending.push({ key, value }), update: (key, value) => pending.push({ key, value, merge: true }) });
        for (const operation of pending) {
          writes.push(operation);
          records.set(operation.key, operation.merge ? { ...records.get(operation.key), ...structuredClone(operation.value) } : structuredClone(operation.value));
        }
        return result;
      } finally { release(); }
    },
  };
  const uploadStore = { storePublicUploadBuffer: async input => {
    uploads.push(input); uploadNumber += 1;
    return { uploadId: `mockup-${uploadNumber}`, url: `/api/quotation/uploads/mockup-${uploadNumber}`, filename: input.filename, contentType: input.contentType, size: input.buffer.length, sessionId: input.sessionId, uploadedAt: new Date().toISOString() };
  } };
  const store = load('src/lib/final-mockup-upload-store.ts', {
    sharp: options.sharp || (() => ({ metadata: async () => ({ width: 100, height: 100 }), stats: async () => ({}) })),
    'node:crypto': nodeCrypto, 'firebase/firestore': firestore, './firebase': { db: {} }, './public-upload-store': uploadStore,
    './print-job-handoff': domain, './production-packet': packet,
  });
  const api = load('app/api/admin/print-jobs/[id]/mockup/route.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/admin-request': { getAdminRequestSession: async () => options.signedIn === false ? null : { ...actor, allowedPages: options.allowed === false ? [] : ['/admin/quotation-approval'], isOwner: false } },
    '@/lib/admin-access': { hasAdminPageAccess: pages => pages.includes('/admin/quotation-approval') },
    '@/lib/print-job-handoff': domain,
    '@/lib/request-safety': { isRequestOriginAllowed: req => !req.headers.get('origin') || req.headers.get('origin') === new URL(req.url).origin, isContentLengthWithinLimit: (headers, max) => !headers.get('content-length') || Number(headers.get('content-length')) <= max },
    '@/lib/final-mockup-upload-store': store,
  });
  const input = { requestId: 'request-001', side: 'front', filename: 'final-front.png', contentType: 'image/png', buffer: png };
  const form = changes => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ requestId: input.requestId, side: input.side, file: new File([png], input.filename, { type: input.contentType }), ...changes })) data.append(key, value);
    return data;
  };
  const post = (data = form(), { id = 'q', headers = {} } = {}) => api.POST(new Request(`https://site.test/api/admin/print-jobs/${id}/mockup`, { method: 'POST', headers: { origin: 'https://site.test', ...headers }, body: data }), { params: Promise.resolve({ id }) });
  return { records, writes, uploads, store, input, form, post, add: (changes = {}, user = actor) => store.addFinalMockup('q', { ...input, ...changes }, user) };
}

test('front upload replaces only the front mockup and updates its saved design URL', async () => {
  const s = setup(), response = await s.add(), saved = s.records.get('quotes/q');
  assert.equal(response.ok, true); assert.equal(response.quoteId, 'q'); assert.equal(response.requestId, 'request-001'); assert.equal(response.side, 'front'); assert.equal(response.replayed, false);
  assert.equal(s.uploads.length, 1); assert.deepEqual(s.uploads[0].buffer, png);
  assert.deepEqual(saved.attachments.map(file => [file.role, file.side, file.url]), [
    ['print-artwork', undefined, '/logo.png'], ['final-mockup', 'back', '/old-back.png'], ['final-mockup', 'front', '/api/quotation/uploads/mockup-1'],
  ]);
  assert.equal(saved.designBrief.finalMockups.front, '/api/quotation/uploads/mockup-1');
  assert.equal(saved.designBrief.finalMockups.back, '/old-back.png');
  assert.equal(saved.printJobHandoff.version, 1); assert.equal(saved.printJobHandoff.preview, null); assert.equal(saved.printJobHandoff.priceConfirmation, null);
  assert.equal(saved.attachments[2].source, 'admin-final-mockup'); assert.equal(saved.attachments[2].uploadedBy.userId, actor.userId);
});

test('exact retry replays one stored upload and a separate back request replaces only the back', async () => {
  const s = setup(); await s.add(); const replay = await s.add();
  assert.equal(replay.replayed, true); assert.equal(s.uploads.length, 1); assert.equal(s.records.get('quotes/q').attachments.length, 3);
  await assert.rejects(s.add({ filename: 'different.png' }), /request ID/);
  await assert.rejects(s.add({}, { ...actor, userId: 'another-user' }), /request ID/);
  await s.add({ requestId: 'request-002', side: 'back', filename: 'final-back.png' });
  const mockups = s.records.get('quotes/q').attachments.filter(file => file.role === 'final-mockup');
  assert.deepEqual(mockups.map(file => file.side).sort(), ['back', 'front']); assert.equal(s.uploads.length, 2);
});

test('an attached request cannot replay success after a newer mockup replaces that side', async () => {
  const s = setup(); await s.add();
  const saved = s.records.get('quotes/q');
  saved.attachments = saved.attachments.map(file => file.role === 'final-mockup' && file.side === 'front' ? { ...file, uploadId: 'newer', url: '/newer-front.png' } : file);
  saved.designBrief.finalMockups.front = '/newer-front.png';
  await assert.rejects(s.add(), /replaced by a newer mockup/);
  assert.equal(s.uploads.length, 1);
});

test('released, sending and payment-like jobs are blocked before storage', async () => {
  for (const state of ['released', 'sending', 'unknown', 'sent']) {
    const q = quote();
    if (state === 'released') q.productionRelease = { state: 'released' };
    else q.printJobHandoff.delivery = { state, mode: 'live' };
    const s = setup({ quote: q }); await assert.rejects(s.add(), /released, sending or unconfirmed/); assert.equal(s.uploads.length, 0);
  }
  const payment = setup(); payment.records.get('quotes/q').paymentEvidence = { filename: 'payment-proof.png', url: '/private.png' };
  await assert.rejects(payment.add({ filename: 'payment-proof.png' }), /payment|invoice/); assert.equal(payment.uploads.length, 0);
  const closed = setup({ order: { quoteId: 'q', status: 'delivered' } });
  await assert.rejects(closed.add(), /Reopen and review/); assert.equal(closed.uploads.length, 0);
});

test('route enforces session, access, origin and exact multipart fields', async () => {
  for (const options of [{ signedIn: false }, { allowed: false }]) {
    const s = setup(options); assert.ok([401, 403].includes((await s.post()).status)); assert.equal(s.uploads.length, 0);
  }
  const cross = setup(); assert.equal((await cross.post(cross.form(), { headers: { origin: 'https://other.test' } })).status, 403); assert.equal(cross.uploads.length, 0);
  const badSide = setup(); assert.equal((await badSide.post(badSide.form({ side: 'side' }))).status, 400); assert.equal(badSide.uploads.length, 0);
  const extra = setup(), form = extra.form(); form.append('role', 'final-mockup'); assert.equal((await extra.post(form)).status, 400); assert.equal(extra.uploads.length, 0);
});

test('only bounded matching still PNG, JPG and WEBP images pass validation', async () => {
  const { store } = setup();
  for (const [name, mime, data] of [
    ['a.png', 'image/png', png], ['a.jpg', 'image/jpeg', Buffer.from([255, 216, 255, 224])], ['a.webp', 'image/webp', Buffer.from('RIFFxxxxWEBP')],
  ]) await assert.doesNotReject(() => store.validateFinalMockupFile(name, mime, data));
  for (const [name, mime, data] of [
    ['a.pdf', 'application/pdf', Buffer.from('%PDF-1.4')], ['a.png', 'image/png', Buffer.from('<html>')], ['a.jpg', 'image/png', png],
    ['a.png', 'image/png', Buffer.alloc(0)], ['a.png', 'image/png', Buffer.alloc(store.MAX_FINAL_MOCKUP_BYTES + 1)],
  ]) await assert.rejects(() => store.validateFinalMockupFile(name, mime, data));
});
