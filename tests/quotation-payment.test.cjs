const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, modules = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, require: (name) => { if (!(name in modules)) throw new Error(name); return modules[name]; },
    Buffer, File, URL, URLSearchParams, console, crypto,
  });
  return exports;
}
const payment = load('src/lib/quotation-payment.ts');

test('email asks for the full total, includes Juice and both proof options', () => {
  const email = payment.buildQuotationPaymentInstructions({ total: 1150, documentNumber: 'Q-2A1W6', currency: 'Rs' }, 'demo', 'Ryan');
  for (const part of [email.text, email.html]) {
    assert.match(part, /Rs 1,150.00/);
    assert.match(part, /57701144/);
    assert.match(part, /Q-2A1W6/);
    assert.match(part, /Accept quotation/);
    assert.match(part, /our website/);
  }
  assert.match(email.html, /cid:mcb-juice/);
  assert.ok(!email.html.includes('<a '));
  assert.ok(!email.text.includes('https://wa.me/'));
});

test('credited payments are subtracted and paid orders are not asked to pay again', () => {
  assert.equal(payment.quotationPaymentSummary({total: 1150, amountReceived: 150}, 'demo').amount, 'Rs 1,000.00');
  assert.match(payment.buildQuotationPaymentInstructions({total: 500, amountReceived: 500}, 'demo').text, /No balance remains/);
  assert.equal(payment.quotationPaymentSummary({}, 'demo').balance, null);
});

test('reference and client name cannot inject email HTML or break WhatsApp links', () => {
  const reference = '<script>alert(1)</script> & Q';
  const email = payment.buildQuotationPaymentInstructions({total: 500, documentNumber: reference}, 'demo', 'A & B');
  assert.ok(!email.html.includes('<script>'));
  const link = new URL(payment.paymentWhatsAppUrl(reference, 'A & B'));
  assert.equal(link.pathname, '/23059883880');
  assert.match(link.searchParams.get('text'), /Name: A & B/);
  assert.ok(link.searchParams.get('text').includes(reference));
});

function responseRoute(valid = true) {
  const writes = [];
  const modules = {
    'next/server': {NextResponse: {json: (body, options) => Response.json(body, options)}},
    'firebase/firestore': {
      doc: () => 'quotes/demo', getDoc: async () => ({exists: () => true, data: () => ({quote: {total: 500, amountReceived: 0}})}),
      updateDoc: async (_ref, data) => writes.push(data), arrayUnion: (...values) => values, serverTimestamp: () => 123,
    },
    '@/lib/firebase': {db: {}},
    '@/lib/quote-response-links': {isQuoteResponseAction: (a) => ['accept', 'changes', 'reject'].includes(a), verifyQuoteResponseLink: () => valid},
    '@/lib/request-safety': {CONTACT_RATE_LIMIT: {}, evaluateRequestRateLimit: () => ({allowed: true}), getRateLimitHeaders: () => ({}), isContentLengthWithinLimit: () => true, isRequestOriginAllowed: () => true},
    '@/lib/public-upload-store': {storePublicUploadBuffer: async () => ({uploadId: 'proof', url: '/api/quotation-uploads/proof', filename: 'demo.png', contentType: 'image/png', size: 100})},
    '@/lib/quotation-upload-paths': {normalizeQuotationUploadUrl: (url) => url},
  };
  const route = load('app/api/quotes/[id]/respond/route.ts', modules);
  const send = async (file) => {
    const body = new FormData();
    body.set('action', 'accept'); body.set('token', 'demo'); body.set('expires', '123');
    if (file) body.set('paymentScreenshot', file);
    return route.POST(new Request('https://site.test/api/quotes/demo/respond', {method: 'POST', body}), {params: Promise.resolve({id: 'demo'})});
  };
  return {send, writes};
}

test('acceptance requires a valid signed link and payment screenshot', async () => {
  const invalid = responseRoute(false);
  assert.equal((await invalid.send()).status, 403);
  assert.equal(invalid.writes.length, 0);
  const missing = responseRoute();
  assert.equal((await missing.send()).status, 400);
  assert.equal(missing.writes.length, 0);
});

test('uploaded proof is linked to the quote and awaits review without crediting money', async () => {
  const route = responseRoute();
  const response = await route.send(new File(['demo'], 'demo.png', {type: 'image/png'}));
  assert.equal(response.status, 200);
  const write = route.writes[0];
  assert.equal(write.clientDecision, 'accepted');
  assert.equal(write.paymentEvidence.verificationStatus, 'pending_manual_confirmation');
  assert.equal(write.clientResponseHistory[0].paymentEvidence.url, '/api/quotation-uploads/proof');
  assert.equal(write.amountReceived, undefined);
  assert.equal(write.paymentStatus, undefined);
  assert.equal((await response.json()).quote.amountReceived, 0);
});
