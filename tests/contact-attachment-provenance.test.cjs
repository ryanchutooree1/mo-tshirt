const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { File } = require('node:buffer');
const crypto = require('node:crypto').webcrypto;
const MiB = 1024 * 1024;
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiled = new Map(['src/lib/quotation-upload-paths.ts', 'src/lib/contact-attachment-provenance.ts', 'app/api/contact/route.ts'].map(file => [file, compile(file)]));

function setup({ smtp = false, blocked = false, oversized = false } = {}) {
  const records = new Map();
  const chunks = new Map();
  const reads = [];
  const writes = [];
  const storedFiles = [];
  const mails = [];
  const after = [];
  const modules = {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) }, after: callback => after.push(callback) },
    'firebase/firestore': {
      doc: (_db, ...parts) => parts.join('/'), collection: (_db, ...parts) => parts.join('/'),
      getDoc: async key => { reads.push(key); return { exists: () => records.has(key), data: () => records.get(key) }; },
      orderBy: () => null, limit: count => ({ count }), query: (key, _order, limit) => ({ key, limit: limit.count }),
      getDocs: async ({ key, limit }) => { reads.push(key); const values = (chunks.get(key) || []).slice(0, limit); return { empty: !values.length, docs: values.map(value => ({ data: () => value })) }; },
      addDoc: async (target, value) => { writes.push({ target, value }); return { id: 'quote-test' }; }, serverTimestamp: () => 123,
    },
    '@/lib/firebase': { db: {} },
    '@/lib/seo': { SITE_URL: 'https://www.mo-tshirt.mu' },
    '@/lib/shops': { formatQuoteGarmentDescription: () => 'T-Shirt' },
    '@/lib/request-safety': {
      CONTACT_RATE_LIMIT: {}, evaluateRequestRateLimit: () => ({ allowed: !blocked, blocked }), getRateLimitHeaders: () => ({ 'x-rate-limit': 'checked' }),
      isContentLengthWithinLimit: () => !oversized,
      isRequestOriginAllowed: req => req.headers.get('origin') === 'https://www.mo-tshirt.mu',
    },
    '@/lib/quotation-notification-settings': { getQuotationNotificationRecipients: async () => ['staff@example.test'] },
    '@/lib/public-upload-store': { storePublicUploadBuffer: async input => { storedFiles.push(input); return { url: '/api/quotation/uploads/multipart', filename: input.filename, contentType: input.contentType, size: input.size }; } },
    '@/lib/quote-auto-pricing': { buildAutomaticQuotePricing: () => ({ lines: [], deliveryFee: 0, subtotal: 0, total: 0, pricedLineCount: 0, lineCount: 0, requiresReview: true }) },
    nodemailer: { createTransport: () => ({ sendMail: async mail => mails.push(mail) }) },
  };
  const load = file => { const exports = {}; vm.runInNewContext(compiled.get(file), { exports, require: name => { if (!modules[name]) throw new Error(name); return modules[name]; }, Buffer, File, URL, Number, Date, crypto, process: { env: smtp ? { SMTP_HOST: 'smtp.example.test', SMTP_USER: 'sender@example.test', SMTP_PASS: 'not-a-real-credential' } : {} }, console: { error() {} } }); return exports; };
  modules['@/lib/quotation-upload-paths'] = load('src/lib/quotation-upload-paths.ts');
  const provenance = modules['@/lib/contact-attachment-provenance'] = load('src/lib/contact-attachment-provenance.ts');
  const route = load('app/api/contact/route.ts');
  function addUpload(id, { size = 4, filename = `${id}.png`, contentType = 'image/png', sessionId = 'web-order-test', data, ...overrides } = {}) {
    records.set(`quotationUploads/${id}`, { uploadId: id, filename, contentType, size, sessionId, source: 'web-order-chunked-upload', uploadState: 'ready', chunkSize: 512 * 1024, chunkCount: Math.ceil(size / (512 * 1024)), uploadedAtIso: '2026-10-01T08:00:00Z', ...overrides });
    if (data) chunks.set(`quotationUploads/${id}/chunks`, Array.from({ length: Math.ceil(data.length / (512 * 1024)) }, (_, index) => { const bytes = data.subarray(index * 512 * 1024, (index + 1) * 512 * 1024); return { index, byteSize: bytes.length, data: bytes.toString('base64') }; }));
    return { url: `/api/quotation/uploads/${id}`, filename, contentType, size };
  }
  function pair(original = addUpload('original'), current = addUpload('processed')) { return { role: 'print-artwork', ...current, originalUrl: original.url, originalFilename: original.filename, originalContentType: original.contentType, originalSize: original.size, originalProvenance: 'client-upload', ...(original.url !== current.url ? { backgroundRemovalMethod: 'ai' } : {}) }; }
  const send = (payload = {}, { origin = 'https://www.mo-tshirt.mu', form } = {}) => route.POST(new Request('https://www.mo-tshirt.mu/api/contact', { method: 'POST', headers: { origin, ...(!form ? { 'content-type': 'application/json' } : {}) }, body: form || JSON.stringify({ name: 'Test client', email: 'client@example.test', message: 'Test quote', ...payload }) }));
  return { records, chunks, reads, writes, storedFiles, mails, after, addUpload, pair, send, provenance, quote: () => writes[0]?.value, flushMail: async () => { for (const callback of after) await callback(); } };
}

function formWithFile(file) { const form = new FormData(); form.set('name', 'Test client'); form.set('email', 'client@example.test'); form.set('message', 'Test quote'); form.append('files', file); return form; }

test('a validated source/processed pair persists in one attachment and in the legacy first-attachment alias', async () => {
  const s = setup(); const pair = s.pair(); const response = await s.send({ attachments: [pair] });
  assert.equal(response.status, 200); assert.equal(s.quote().attachments.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(s.quote().attachment)), pair);
  assert.equal(s.storedFiles.length, 0);
});
test('same-URL raw originals reuse one lookup and one retained-byte allocation', async () => {
  const s = setup(); const raw = s.addUpload('raw', { size: 5 * MiB }); const pair = s.pair(raw, raw);
  assert.equal((await s.send({ attachments: [pair, pair, pair] })).status, 200);
  assert.deepEqual(s.reads, ['quotationUploads/raw']); assert.equal(s.quote().attachment.backgroundRemovalMethod, undefined);
});
test('already-transparent PNG conversion can retain a distinct original', async () => {
  const s = setup(); const pair = { ...s.pair(), backgroundRemovalMethod: 'already-transparent' };
  assert.equal((await s.send({ attachments: [pair] })).status, 200);
  assert.equal(s.quote().attachment.backgroundRemovalMethod, 'already-transparent');
});
test('legacy requests, external old artwork links and unsupported provenance do not gain an original stamp', async () => {
  const s = setup(); const attachment = { url: 'https://old-cdn.example.test/file.png', filename: 'old.png', originalUrl: '/api/quotation/uploads/source', originalProvenance: 'untrusted', backgroundRemovalMethod: 'ai' };
  assert.equal((await s.send({ attachments: [attachment] })).status, 200);
  assert.equal(s.quote().attachment.url, attachment.url); assert.equal(s.quote().attachment.originalUrl, undefined); assert.equal(s.quote().attachment.originalProvenance, undefined); assert.equal(s.quote().attachment.backgroundRemovalMethod, undefined); assert.equal(s.reads.length, 0);
});
test('new explicit provenance with missing fields, including an otherwise empty entry, fails without writes', async () => {
  for (const key of ['url', 'filename', 'contentType', 'size', 'originalUrl', 'originalFilename', 'originalContentType', 'originalSize']) {
    const s = setup(); const pair = s.pair(); delete pair[key];
    assert.equal((await s.send({ attachments: [pair] })).status, 400, key); assert.equal(s.writes.length, 0);
  }
  const s = setup(); assert.equal((await s.send({ attachments: [{ originalProvenance: 'client-upload' }] })).status, 400); assert.equal(s.writes.length, 0);
});
test('external, executable, credential-bearing, query, fragment and non-upload original links fail before storage access', async () => {
  for (const originalUrl of ['https://evil.test/api/quotation/uploads/original', 'javascript:alert(1)', '//evil.test/api/quotation/uploads/original', 'https://user:pass@www.mo-tshirt.mu/api/quotation/uploads/original', '/api/quotation/uploads/original?x=1', '/api/quotation/uploads/original#x', '/api/shops/uploads/original', '/api/quotation/uploads/a%2fb', '/api/quotation/uploads/a\\b']) {
    const s = setup(); assert.equal((await s.send({ attachments: [{ ...s.pair(), originalUrl }] })).status, 400, originalUrl); assert.equal(s.reads.length, 0); assert.equal(s.writes.length, 0);
  }
});
test('same-origin absolute and legacy alias URLs normalize only after validation', async () => {
  const s = setup(); const pair = s.pair(); pair.originalUrl = 'https://www.mo-tshirt.mu/api/ai-assistant/uploads/original';
  assert.equal((await s.send({ attachments: [pair] })).status, 200); assert.equal(s.quote().attachment.originalUrl, '/api/quotation/uploads/original');
});
test('missing, incomplete and historical direct uploads cannot be labelled original', async () => {
  for (const mutation of [record => record.uploadState = 'uploading', record => delete record.uploadState, record => record.source = 'web-order-upload', record => record.chunkCount = 5, record => delete record.uploadedAtIso, record => record.size = -1]) {
    const s = setup(); const pair = s.pair(); mutation(s.records.get('quotationUploads/original'));
    assert.equal((await s.send({ attachments: [pair] })).status, 400); assert.equal(s.writes.length, 0);
  }
  const s = setup(); const pair = s.pair(); s.records.delete('quotationUploads/original'); assert.equal((await s.send({ attachments: [pair] })).status, 400);
});
test('forged metadata and cross-session pairings fail before quote storage', async () => {
  for (const patch of [{ originalFilename: 'fake.png' }, { originalContentType: 'application/pdf' }, { originalSize: 5 }, { filename: 'fake.png' }, { contentType: 'application/pdf' }, { size: 5 }, { backgroundRemovalMethod: 'invented' }]) {
    const s = setup(); assert.equal((await s.send({ attachments: [{ ...s.pair(), ...patch }] })).status, 400); assert.equal(s.writes.length, 0);
  }
  const s = setup(); const pair = s.pair(); s.records.get('quotationUploads/processed').sessionId = 'web-order-other'; assert.equal((await s.send({ attachments: [pair] })).status, 400);
});
test('non-image and unchanged raw uploads cannot claim a completed removal', async () => {
  for (const same of [true, false]) {
    const s = setup(); const raw = s.addUpload('raw', { contentType: same ? 'image/png' : 'application/pdf' }); const current = same ? raw : s.addUpload('current');
    assert.equal((await s.send({ attachments: [{ ...s.pair(raw, current), backgroundRemovalMethod: 'ai' }] })).status, 400);
  }
});
test('new pair files retain 5MiB per-file and 15MiB unique total limits, including mockups', async () => {
  const s = setup(); const tooBig = s.addUpload('large', { size: 5 * MiB + 1 }); assert.equal((await s.send({ attachments: [s.pair(tooBig, tooBig)] })).status, 400);
  for (const over of [false, true]) {
    const s = setup(); const original = s.addUpload('original', { size: 5 * MiB }); const current = s.addUpload('current', { size: 5 * MiB }); const mockup = s.addUpload('mockup', { size: 5 * MiB }); const attachments = [s.pair(original, current), { ...mockup, role: 'final-mockup' }];
    if (over) attachments.push(s.addUpload('extra', { size: 1 }));
    assert.equal((await s.send({ attachments })).status, over ? 400 : 200); if (over) assert.equal(s.writes.length, 0);
  }
});
test('twelve logical entries stay valid; thirteen reject before lookup or storage', async () => {
  for (const count of [12, 13]) {
    const s = setup(); const raw = s.addUpload('raw'); const pair = s.pair(raw, raw);
    assert.equal((await s.send({ attachments: Array(count).fill(pair) })).status, count === 12 ? 200 : 400);
    if (count === 13) { assert.equal(s.reads.length, 0); assert.equal(s.writes.length, 0); }
  }
});
test('multipart parsing supports new metadata and ordinary multipart files stay backward-compatible and unstamped', async () => {
  const s = setup(); const form = formWithFile(new File([Buffer.from('raw')], 'raw.png', { type: 'image/png' }));
  assert.equal((await s.send({}, { form })).status, 200); assert.equal(s.storedFiles.length, 1); assert.equal(s.quote().attachment.originalProvenance, undefined);
  const paired = setup(); const pairForm = new FormData(); pairForm.set('name', 'Client'); pairForm.set('phone', '123'); pairForm.set('message', 'Quote'); pairForm.set('attachments', JSON.stringify([paired.pair()]));
  assert.equal((await paired.send({}, { form: pairForm })).status, 200); assert.equal(paired.quote().attachment.originalProvenance, 'client-upload');
});
test('email upload opt-in preserves submitted/current bytes, never adds a second original file, and deduplicates links', async () => {
  const s = setup({ smtp: true }); const originalBytes = Buffer.from('raw-source'); const currentBytes = Buffer.from('display-file');
  const original = s.addUpload('original', { size: originalBytes.length, data: originalBytes }); const current = s.addUpload('processed', { size: currentBytes.length, data: currentBytes }); const pair = s.pair(original, current);
  assert.equal((await s.send({ attachments: [pair, pair], emailUploadedAttachments: true })).status, 200); await s.flushMail();
  assert.equal(s.mails.length, 1); assert.equal(s.mails[0].attachments.length, 1); assert.equal(s.mails[0].attachments[0].content.toString(), 'display-file');
  assert.equal(s.mails[0].to, 'staff@example.test'); assert.match(s.mails[0].text, /Original upload: https:\/\/www\.mo-tshirt\.mu\/api\/quotation\/uploads\/original/);
  assert.equal(s.reads.includes('quotationUploads/original/chunks'), false);
});
test('Studio style requests stay link-only with no chunk hydration or email attachment additions', async () => {
  const s = setup({ smtp: true }); assert.equal((await s.send({ attachments: [s.pair()] })).status, 200); await s.flushMail();
  assert.equal(s.mails[0].attachments, undefined); assert.equal(s.reads.some(key => key.endsWith('/chunks')), false);
});
test('missing or corrupt email upload chunks fail closed before saving or scheduling an email', async () => {
  for (const broken of ['missing', 'size', 'index', 'extra']) {
    const s = setup({ smtp: true }); const original = s.addUpload('original'); const current = s.addUpload('current', { data: Buffer.from('test') }); const values = s.chunks.get('quotationUploads/current/chunks');
    if (broken === 'missing') s.chunks.delete('quotationUploads/current/chunks');
    if (broken === 'size') values[0].byteSize = 3;
    if (broken === 'index') values[0].index = 1;
    if (broken === 'extra') values.push({ ...values[0], index: 1 });
    assert.equal((await s.send({ attachments: [s.pair(original, current)], emailUploadedAttachments: true })).status, 400); assert.equal(s.writes.length, 0); assert.equal(s.after.length, 0);
  }
});
test('origin, declared request-size and rate-limit protections still precede all attachment reads', async () => {
  for (const config of [{ blocked: true }, { oversized: true }, {}]) {
    const s = setup(config); const response = await s.send({ attachments: [s.pair()] }, config.blocked || config.oversized ? {} : { origin: 'https://evil.test' });
    assert.equal(response.status, config.blocked ? 429 : config.oversized ? 413 : 403); assert.equal(s.reads.length, 0); assert.equal(s.writes.length, 0);
  }
});
