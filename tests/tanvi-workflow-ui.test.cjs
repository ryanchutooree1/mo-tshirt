// Synthetic-only React integration tests. Every backend call is intercepted in
// memory; no real network, email, credential, or customer record is used.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const requireRepo = createRequire(root + '/package.json');
const React = requireRepo('react');
const ts = requireRepo('typescript');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3007/admin/tanvi', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'getComputedStyle']) global[key] = dom.window[key];
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, within, fireEvent, act, cleanup, waitFor } = requireRepo('@testing-library/react');
const NOW = Date.parse('2026-10-01T08:00:00Z');
const TODAY = '2026-10-01';
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return NOW; } }
const compiled = new Map();
function loadDomain(file) {
  const filename = path.resolve(root, 'src/lib', file);
  if (compiled.has(filename)) return compiled.get(filename);
  const moduleObj = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: moduleObj, exports: moduleObj.exports, require: name => name.startsWith('./') ? loadDomain(name.slice(2).replace(/\.ts$/, '') + '.ts') : requireRepo(name), Date: FixedDate, Intl, URL, Error, console }, { filename });
  compiled.set(filename, moduleObj.exports);
  return moduleObj.exports;
}
const domain = loadDomain('print-job-handoff.ts');
const API = '/api/admin/print-jobs';
const SETTINGS = `${API}/handoff-settings`;
const ACTOR = { userId: 'synthetic-owner', displayName: 'Synthetic owner', email: 'owner@synthetic.example.test' };
const TEST_RECIPIENT = 'review@synthetic.example.test';
const REGISTRY = { partners: [{ id: 'yan', name: 'Synthetic production partner', email: 'partner@synthetic.example.test', active: true, emailNotificationsEnabled: false }] };
let records, settings, requests, faults, pendingGates, operationResults, callbacks, owner, sendState, confirmation, confirmations;
function fixture(id = 'synthetic-a') {
  return { name: `Synthetic client ${id}`, email: 'client@synthetic.example.test', status: 'approved', clientDecision: 'accepted', printMethod: 'DTF',
    quote: { documentNumber: `Q-${id}`, documentType: 'quotation', currency: 'Rs', total: 1000, lines: [{ description: 'Synthetic cotton shirt', quantity: 10, unitPrice: 100, color: 'Blue', size: 'L' }], paymentStatus: 'Paid', amountReceived: 1000 },
    attachments: [{ filename: 'synthetic-print.png', url: 'https://assets.synthetic.example.test/print.png' }],
    paymentEvidence: { verificationStatus: 'confirmed' }, paymentReceipt: { documentNumber: 'AUTO-SYNTHETIC', amountReceived: 1000 },
    printJobWorkflow: { stage: 'confirmed', version: 7 },
    printJobHandoff: { version: 0, priceConfirmation: null, payments: [], preview: null, delivery: null } };
}
function reset() {
  records = new Map([['synthetic-a', fixture()], ['synthetic-b', fixture('synthetic-b')]]);
  settings = { version: 3, configured: true, partnerId: 'yan', testEnabled: true, testRecipient: TEST_RECIPIENT, testDate: TODAY, requiredPaymentPercent: 50, liveEnabled: false, updatedAtIso: new Date(NOW).toISOString() };
  requests = []; faults = []; pendingGates = []; operationResults = new Map(); callbacks = { dirty: [], busy: [], updated: [], settings: [], saved: [], close: [] };
  owner = true; sendState = 'sent'; confirmation = true; confirmations = [];
}
function getView(id) { return structuredClone(domain.buildHandoffView(id, records.get(id), settings, REGISTRY, 'https://app.synthetic.example.test', owner, NOW)); }
function seedPrice(id = 'synthetic-a') {
  const q = records.get(id), pricing = domain.quotePricing(q);
  q.printJobHandoff.priceConfirmation = { id: 'synthetic-price', pricingFingerprint: pricing.fingerprint, lifecycleFingerprint: domain.handoffLifecycleFingerprint(q), agreedTotal: pricing.quotedTotal, currency: pricing.currency, note: 'Synthetic client agreement', actor: ACTOR, confirmedAtIso: new Date(NOW).toISOString() };
  q.printJobHandoff.version++;
}
function seedPayment(amount = 500, id = 'synthetic-a') {
  const q = records.get(id); q.printJobHandoff.payments.push({ id: 'synthetic-payment', amountReceived: amount, currency: 'Rs', paymentDate: TODAY, reference: 'SYNTHETIC-BANK-001', evidenceId: '', note: 'Synthetic bank verification', actor: ACTOR, confirmedAtIso: new Date(NOW).toISOString() }); q.printJobHandoff.version++;
}
function ready(amount = 500) { seedPrice(); seedPayment(amount); }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); const gate = { promise, resolve }; pendingGates.push(gate); return gate; }
function fault(method, url, extra) { faults.push({ method, url, ...extra }); }
function applyAction(id, raw) {
  const action = domain.validateHandoffAction(raw, NOW);
  const replayKey = `${id}:${action.requestId}`;
  if (operationResults.has(replayKey)) return structuredClone(operationResults.get(replayKey));
  const q = records.get(id), stored = q.printJobHandoff;
  if (action.action !== 'send' && action.expectedVersion !== stored.version) throw new domain.HandoffError('Synthetic stale version. Reload before saving.', 409);
  if (action.action === 'confirm-price') {
    const pricing = domain.quotePricing(q);
    if (action.pricingFingerprint !== pricing.fingerprint || action.agreedTotal !== pricing.quotedTotal) throw new domain.HandoffError('Synthetic stale price.', 409);
    stored.priceConfirmation = { id: action.requestId, pricingFingerprint: action.pricingFingerprint, lifecycleFingerprint: domain.handoffLifecycleFingerprint(q), agreedTotal: action.agreedTotal, currency: pricing.currency, note: action.note, actor: ACTOR, confirmedAtIso: new Date(NOW).toISOString() };
    stored.preview = null; stored.version++;
  } else if (action.action === 'verify-payment') {
    assert.equal(getView(id).gates.priceAgreed, true, 'The fake backend also enforces current price approval');
    stored.payments.push({ id: action.requestId, amountReceived: action.amountReceived, currency: 'Rs', paymentDate: action.paymentDate, reference: action.reference, evidenceId: action.evidenceId, note: action.note, actor: ACTOR, confirmedAtIso: new Date(NOW).toISOString() });
    stored.preview = null; stored.version++;
  } else if (action.action === 'preview') {
    stored.preview = structuredClone(domain.prepareHandoffPreview(id, q, settings, REGISTRY, 'https://app.synthetic.example.test', action.requestId, NOW)); stored.version++;
  } else {
    assert.equal(getView(id).gates.canPreview, true);
    assert.equal(action.previewId, stored.preview.id); assert.equal(action.previewFingerprint, stored.preview.fingerprint);
    assert.deepEqual(stored.preview.recipients, [TEST_RECIPIENT], 'Only the exact synthetic test recipient can be used');
    assert.equal(stored.preview.mode, 'test');
    stored.delivery = { state: sendState, requestId: action.requestId, previewId: action.previewId, previewFingerprint: action.previewFingerprint, mode: 'test', recipients: [TEST_RECIPIENT], claimedAtIso: new Date(NOW).toISOString() }; stored.version++;
  }
  const response = { view: getView(id), preview: stored.preview };
  operationResults.set(replayKey, structuredClone(response));
  return response;
}
window.confirm = message => { confirmations.push(message); return confirmation; };
global.fetch = window.fetch = async (url, options = {}) => {
  const method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null;
  assert.equal(typeof url, 'string');
  assert.ok(url === '/api/admin/session' || url === SETTINGS || /^\/api\/admin\/print-jobs\/[^/]+\/handoff$/.test(url), `Unexpected endpoint is blocked: ${url}`);
  assert.ok(['GET', 'POST', 'PUT'].includes(method), 'No unapproved request method');
  requests.push({ url, method, body, signal: options.signal, cache: options.cache });
  const index = faults.findIndex(item => item.method === method && item.url === url);
  const failure = index < 0 ? {} : faults.splice(index, 1)[0];
  let status = failure.status || 200, response;
  if (failure.status || failure.network) response = { error: failure.error || 'Synthetic request interruption. Your entries are still here.' };
  else {
    try {
      if (url === '/api/admin/session') { assert.equal(method, 'GET'); response = { session: { userId: ACTOR.userId, isOwner: owner } }; }
      else if (url === SETTINGS) {
        if (!owner) { status = 403; response = { error: 'Owner access is required.' }; }
        else if (method === 'GET') response = { settings: structuredClone(settings) };
        else {
          assert.equal(method, 'PUT'); const update = domain.validateHandoffSettings(body);
          assert.equal(update.testEnabled, true); assert.equal(update.liveEnabled, false); assert.equal(update.requiredPaymentPercent, 50);
          if (update.expectedVersion !== settings.version) throw new domain.HandoffError('Synthetic settings changed. Reload before saving.', 409);
          settings = { ...settings, ...update, version: settings.version + 1 }; response = { settings: structuredClone(settings) };
        }
      } else {
        const id = decodeURIComponent(url.slice(API.length + 1, -'/handoff'.length));
        assert.ok(records.has(id), 'All accessed quotes must be synthetic fixtures');
        if (method === 'GET') response = { view: getView(id) };
        else { assert.equal(method, 'POST'); response = applyAction(id, body); }
        if (failure.wrongId) response.view.quoteId = failure.wrongId;
      }
    } catch (error) { if (error.name === 'HandoffError') { status = error.status; response = { error: error.message }; } else throw error; }
  }
  // Capture results before delay and deliberately ignore abort, proving UI lifecycle guards.
  if (failure.gate) await failure.gate.promise;
  if (failure.network || failure.loseResponse) throw new Error('Synthetic response lost');
  return Response.json(response, { status });
};
function MockProductEditor(props) {
  return React.createElement('section', { 'aria-label': 'Synthetic product editor', 'data-quote-id': props.quoteId, 'data-revision': props.revision, 'data-user-id': props.userId, 'data-blocked': String(props.blocked) },
    React.createElement('button', { type: 'button', disabled: props.blocked, onClick: () => props.onDirtyChange(true) }, 'Edit synthetic products'),
    React.createElement('button', { type: 'button', disabled: props.blocked, onClick: () => { props.onDirtyChange(false); props.onUpdated(); } }, 'Save synthetic products'));
}
const mod = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(root + '/src/components/admin/print-jobs/TanviHandoffPanel.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { module: mod, exports: mod.exports, console, window, document, navigator, Date: FixedDate, Intl, URL, Error, AbortController, AbortSignal, fetch: global.fetch, crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout,
  require(name) {
    if (name === '@/components/admin/QuoteProductEditor') return { __esModule: true, default: MockProductEditor };
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    return requireRepo(name);
  },
}, { filename: 'TanviHandoffPanel.test.js' });
const App = mod.exports.default, SettingsApp = mod.exports.HandoffSettingsPanel;
const endpoint = id => `${API}/${encodeURIComponent(id || 'synthetic-a')}/handoff`;
const mutations = () => requests.filter(item => item.method !== 'GET');
const posts = () => requests.filter(item => item.method === 'POST');
const actions = () => posts().map(item => item.body.action);
const panel = () => screen.getByRole('region', { name: 'Tanvi production workflow' });
const field = name => screen.getByLabelText(name);
const button = name => screen.getByRole('button', { name, exact: true });
const priceCheck = () => screen.getByRole('checkbox', { name: /The client agreed to this exact quote total/ });
const bankCheck = () => screen.getByRole('checkbox', { name: /I checked that this money was actually received/ });
const sendCheck = () => screen.getByRole('checkbox', { name: /I checked the recipient, finished design and print files/ });
const click = async element => { await act(async () => { fireEvent.click(element); }); };
const fill = async (element, value) => { await act(async () => { fireEvent.change(element, { target: { value } }); }); };
const submit = async name => { await act(async () => { fireEvent.submit(screen.getByRole('form', { name })); }); };
const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const props = (extra = {}) => ({ quoteId: 'synthetic-a', onDirtyChange: value => callbacks.dirty.push(value), onBusyChange: value => callbacks.busy.push(value), onUpdated: () => callbacks.updated.push(true), onOpenSettings: () => callbacks.settings.push(true), ...extra });
async function mount(extra) { const rendered = render(React.createElement(App, props(extra))); await waitFor(() => assert.ok(screen.queryByRole('heading', { name: /Price\. Payment\. Send\.|Production email sent/ }))); return rendered; }
async function mountSettings() { const rendered = render(React.createElement(SettingsApp, { onSaved: () => callbacks.saved.push(true), onClose: () => callbacks.close.push(true) })); await waitFor(() => assert.ok(!field('Test recipient email').disabled || screen.queryByRole('alert'))); return rendered; }
async function confirmPrice() { await click(priceCheck()); await click(button('Confirm client price')); }
async function enterPayment(value = '500') { await fill(field(/Total money received for this job/), value); await fill(field('WhatsApp / payment reference'), 'SYNTHETIC-BANK-002'); await click(bankCheck()); }
async function reviewEmail() { await click(button('Review test email')); await waitFor(() => assert.ok(screen.queryByLabelText('Production email preview'))); }
function amount(label) { return within(panel()).getByText(label, { exact: true }).parentElement.querySelector('strong').textContent; }
let passed = 0, failures = 0;
async function test(name, run) {
  reset();
  try { await run(); passed++; console.log('PASS ' + name); }
  catch (error) { failures++; console.error('FAIL ' + name + '\n' + error.stack); }
  finally { cleanup(); await act(async () => { for (const gate of pendingGates) gate.resolve(); }); }
}
(async () => {
  await test('mount reads only; accepted quotation, Paid label and automatic receipt never confirm price or payment', async () => {
    await mount(); assert.deepEqual(mutations(), []); assert.deepEqual(actions(), []);
    assert.equal(requests.filter(item => item.url === endpoint()).length, 1); assert.equal(requests.filter(item => item.url === '/api/admin/session').length, 1);
    assert.ok(requests.every(item => item.cache === 'no-store')); assert.equal(button('Confirm client price').disabled, true);
    assert.equal(screen.queryByRole('button', { name: 'Review test email' }), null); assert.equal(amount('Verified received'), 'Rs 0'); assert.equal(amount('Balance remaining'), 'Rs 1,000');
    assert.deepEqual(callbacks.dirty, [false]); assert.deepEqual([...new Set(callbacks.busy)], [false]); assert.equal(callbacks.updated.length, 0);
    const steps = screen.getByRole('list', { name: 'Three steps before printing' }); assert.equal(within(steps).getAllByRole('listitem').length, 3);
    const link = screen.getByRole('link', { name: 'View saved quotation PDF' }); assert.equal(link.getAttribute('href'), '/api/admin/print-jobs/synthetic-a/document'); assert.equal(link.target, '_blank'); assert.match(link.rel, /noopener/);
    const editor = screen.getByRole('region', { name: 'Synthetic product editor' }); assert.equal(editor.dataset.userId, ACTOR.userId);
  });

  await test('three-step flow needs explicit price, bank verification, preview, exact recipient review and send acknowledgement', async () => {
    const workflowBefore = structuredClone(records.get('synthetic-a').printJobWorkflow);
    await mount(); await fill(field(/Client agreement note/), '  Synthetic client agreed on WhatsApp  ');
    assert.equal(mutations().length, 0); assert.equal(callbacks.dirty.at(-1), true); assert.equal(button('Test email setup').disabled, true);
    await click(priceCheck()); assert.equal(mutations().length, 0); await click(button('Confirm client price'));
    assert.deepEqual(actions(), ['confirm-price']); assert.equal(posts()[0].body.note, 'Synthetic client agreed on WhatsApp'); assert.equal(posts()[0].body.agreedTotal, 1000); assert.equal(posts()[0].body.expectedVersion, 0);
    assert.match(posts()[0].body.pricingFingerprint, /^[a-f0-9]{64}$/); assert.equal(callbacks.dirty.at(-1), false); assert.ok(screen.getByText(/Earlier payment evidence exists/));
    assert.equal(button('Verify received payment').disabled, true); await enterPayment(); assert.deepEqual(actions(), ['confirm-price']);
    await click(button('Verify received payment')); assert.deepEqual(actions(), ['confirm-price', 'verify-payment']);
    assert.equal(posts()[1].body.amountReceived, 500); assert.equal(posts()[1].body.paymentDate, TODAY); assert.equal(posts()[1].body.acknowledgeBankReceipt, true); assert.equal(posts()[1].body.expectedVersion, 1);
    assert.equal(amount('Verified received'), 'Rs 500'); assert.equal(amount('Balance remaining'), 'Rs 500'); assert.ok(screen.getByText('TEST EMAIL ONLY')); assert.equal(screen.queryByLabelText('Production email preview'), null);
    await reviewEmail(); assert.deepEqual(actions(), ['confirm-price', 'verify-payment', 'preview']);
    const preview = screen.getByLabelText('Production email preview'); assert.match(preview.textContent, new RegExp(TEST_RECIPIENT.replaceAll('.', '\\.'))); assert.match(preview.textContent, /TEST ONLY.*DO NOT PRODUCE/); assert.match(preview.textContent, /synthetic-print\.png/); assert.match(preview.textContent, /Synthetic cotton shirt/);
    assert.ok(!preview.textContent.includes('partner@synthetic.example.test')); assert.ok(!preview.textContent.includes('client@synthetic.example.test')); assert.equal(button('Send this test email').disabled, true);
    await click(button('Send this test email')); assert.equal(posts().length, 3); await click(sendCheck()); assert.equal(callbacks.dirty.at(-1), true); assert.equal(posts().length, 3);
    await click(button('Send this test email')); assert.deepEqual(actions(), ['confirm-price', 'verify-payment', 'preview', 'send']);
    const send = posts()[3].body; assert.equal(send.acknowledgeSend, true); assert.match(send.previewFingerprint, /^[a-f0-9]{64}$/); assert.equal(send.previewId, records.get('synthetic-a').printJobHandoff.preview.id); assert.equal(Object.hasOwn(send, 'recipients'), false);
    assert.ok(screen.getByRole('heading', { name: 'Production email sent' })); assert.equal(screen.queryByRole('button', { name: 'Send this test email' }), null); assert.equal(callbacks.dirty.at(-1), false);
    assert.equal(callbacks.updated.length, 4); assert.deepEqual(callbacks.busy.filter((value, index, all) => index === 0 || value !== all[index - 1]), [false, true, false, true, false, true, false, true, false]); assert.deepEqual(records.get('synthetic-a').printJobWorkflow, workflowBefore);
  });

  await test('received amount is cumulative: below half stays at payment, half releases review, full shows zero balance', async () => {
    seedPrice(); seedPayment(200); await mount(); assert.equal(amount('Verified received'), 'Rs 200');
    await enterPayment('499.99'); await click(button('Verify received payment')); assert.ok(screen.getByRole('form', { name: 'Verify received payment' })); assert.equal(screen.queryByRole('button', { name: 'Review test email' }), null); assert.equal(amount('Verified received'), 'Rs 499.99');
    await enterPayment('500'); await click(button('Verify received payment')); assert.ok(button('Review test email')); assert.equal(amount('Verified received'), 'Rs 500'); assert.equal(amount('Balance remaining'), 'Rs 500');
    await click(button('Update received total')); await enterPayment('1000'); await click(button('Verify received payment')); assert.equal(amount('Verified received'), 'Rs 1,000'); assert.equal(amount('Balance remaining'), 'Rs 0');
    assert.deepEqual(posts().map(item => item.body.amountReceived), [499.99, 500, 1000]); assert.equal(posts().some(item => ['preview', 'send'].includes(item.body.action)), false);
  });

  await test('all four actions lock same-tick duplicate submissions and report busy until their responses settle', async () => {
    await mount(); await click(priceCheck());
    for (const action of ['confirm-price', 'verify-payment', 'preview', 'send']) {
      if (action === 'verify-payment') await enterPayment();
      if (action === 'send') await click(sendCheck());
      const gate = deferred(); fault('POST', endpoint(), { gate }); const before = posts().length;
      await act(async () => {
        if (action === 'confirm-price' || action === 'verify-payment') { const form = screen.getByRole('form', { name: action === 'confirm-price' ? 'Confirm client price' : 'Verify received payment' }); fireEvent.submit(form); fireEvent.submit(form); }
        else { const target = button(action === 'preview' ? 'Review test email' : 'Send this test email'); fireEvent.click(target); fireEvent.click(target); }
      });
      assert.equal(posts().length, before + 1, `${action} should acquire the immediate duplicate lock`); assert.equal(callbacks.busy.at(-1), true); assert.equal(button('Reload handover status').disabled, true);
      await act(async () => { gate.resolve(); }); assert.equal(callbacks.busy.at(-1), false);
    }
    assert.deepEqual(actions(), ['confirm-price', 'verify-payment', 'preview', 'send']); assert.equal(callbacks.updated.length, 4);
  });

  await test('network price failure keeps agreement and note, then retries the same idempotency key', async () => {
    await mount(); await fill(field(/Client agreement note/), 'Synthetic retained agreement'); await click(priceCheck()); fault('POST', endpoint(), { network: true });
    await click(button('Confirm client price')); assert.match(screen.getByRole('alert').textContent, /Synthetic response lost/); assert.equal(priceCheck().checked, true); assert.equal(field(/Client agreement note/).value, 'Synthetic retained agreement'); assert.equal(callbacks.dirty.at(-1), true); assert.equal(callbacks.updated.length, 0); assert.equal(callbacks.busy.at(-1), false);
    const originalId = posts()[0].body.requestId; await click(button('Confirm client price')); assert.equal(posts()[1].body.requestId, originalId); assert.equal(callbacks.updated.length, 1); assert.equal(callbacks.dirty.at(-1), false);
  });

  await test('stale payment response preserves amount, date, reference and bank acknowledgement without advancing', async () => {
    seedPrice(); await mount(); await enterPayment('650'); await fill(field('Payment date'), '2026-09-30'); fault('POST', endpoint(), { status: 409, error: 'Synthetic stale version. Reload before saving.' });
    await click(button('Verify received payment')); assert.match(screen.getByRole('alert').textContent, /stale version/); assert.equal(field(/Total money received for this job/).value, '650'); assert.equal(field('Payment date').value, '2026-09-30'); assert.equal(field('WhatsApp / payment reference').value, 'SYNTHETIC-BANK-002'); assert.equal(bankCheck().checked, true); assert.equal(callbacks.dirty.at(-1), true); assert.equal(callbacks.updated.length, 0); assert.equal(screen.queryByRole('button', { name: 'Review test email' }), null);
  });

  await test('lost successful price response retries idempotently without a second confirmation', async () => {
    await mount(); await click(priceCheck()); fault('POST', endpoint(), { loseResponse: true }); await click(button('Confirm client price'));
    assert.ok(screen.getByRole('alert')); assert.equal(records.get('synthetic-a').printJobHandoff.version, 1); const id = posts()[0].body.requestId;
    await click(button('Confirm client price')); assert.equal(posts()[1].body.requestId, id); assert.equal(records.get('synthetic-a').printJobHandoff.version, 1); assert.equal(callbacks.updated.length, 1);
  });

  await test('failed preview is retryable but uncertain send blocks another send until status is reloaded', async () => {
    ready(); await mount(); fault('POST', endpoint(), { status: 409, error: 'Synthetic preview is stale.' }); await click(button('Review test email'));
    assert.ok(screen.getByRole('alert')); assert.equal(screen.queryByLabelText('Production email preview'), null); assert.equal(actions().includes('send'), false);
    await reviewEmail(); await click(sendCheck()); fault('POST', endpoint(), { status: 503, error: 'Synthetic send interruption.' }); await click(button('Send this test email'));
    assert.match(screen.getByRole('alert').textContent, /send interruption/); assert.match(panel().textContent, /Another send is blocked/); assert.equal(screen.queryByLabelText('Production email preview'), null); assert.equal(screen.queryByRole('button', { name: 'Send this test email' }), null); assert.equal(callbacks.dirty.at(-1), false);
    assert.equal(actions().filter(value => value === 'send').length, 1); await click(button('Reload handover status')); assert.ok(button('Review test email')); assert.equal(actions().filter(value => value === 'send').length, 1);
  });

  for (const state of ['sent', 'sending', 'unknown']) await test(`${state} delivery blocks all resend controls on mount and after reload`, async () => {
    ready(); records.get('synthetic-a').printJobHandoff.delivery = { state, mode: 'test', recipients: [TEST_RECIPIENT], requestId: 'synthetic-send', previewId: 'synthetic-preview', previewFingerprint: 'a'.repeat(64), claimedAtIso: new Date(NOW).toISOString() };
    await mount(); assert.equal(screen.queryByRole('button', { name: 'Review test email' }), null); assert.equal(screen.queryByRole('button', { name: 'Send this test email' }), null);
    assert.match(panel().textContent, state === 'sent' ? /Sent to review@synthetic\.example\.test/ : /Another send is blocked/); await click(button('Reload handover status')); assert.deepEqual(mutations(), []); assert.equal(screen.queryByRole('button', { name: 'Review test email' }), null);
  });

  await test('unknown send result does not suggest retry and clears the send acknowledgement', async () => {
    ready(); sendState = 'unknown'; await mount(); await reviewEmail(); await click(sendCheck()); await click(button('Send this test email'));
    assert.match(screen.getByRole('status').textContent, /Delivery is unconfirmed/); assert.match(panel().textContent, /Another send is blocked/); assert.equal(screen.queryByRole('button', { name: 'Send this test email' }), null); assert.equal(callbacks.dirty.at(-1), false);
  });

  await test('expired test setup stays visibly test-only with review blocked and no fallback to live', async () => {
    ready(); settings.testDate = '2000-01-01'; await mount(); assert.ok(screen.getByText('TEST EMAIL ONLY')); assert.equal(button('Review test email').disabled, true); assert.match(panel().textContent, /test date is not today/); assert.ok(!panel().textContent.includes('partner@synthetic.example.test')); await click(button('Review test email')); assert.deepEqual(mutations(), []);
  });

  await test('product dirtiness blocks price, reload and setup; save reloads once and reports clean', async () => {
    await mount(); await click(button('Edit synthetic products')); assert.equal(callbacks.dirty.at(-1), true); assert.equal(priceCheck().disabled, true); assert.equal(field(/Client agreement note/).disabled, true); assert.equal(button('Reload handover status').disabled, true); assert.equal(button('Test email setup').disabled, true);
    const before = requests.length; await click(button('Save synthetic products')); assert.equal(callbacks.dirty.at(-1), false); assert.equal(callbacks.updated.length, 1); assert.equal(requests.length, before + 1); assert.deepEqual(mutations(), []);
    await click(button('Test email setup')); assert.equal(callbacks.settings.length, 1); await fill(field(/Client agreement note/), 'Synthetic pending note'); assert.equal(screen.getByRole('region', { name: 'Synthetic product editor' }).dataset.blocked, 'true');
  });

  await test('staff cannot see owner setup and dirty reload requires explicit discard', async () => {
    owner = false; await mount(); assert.equal(screen.queryByRole('button', { name: 'Test email setup' }), null);
    await fill(field(/Client agreement note/), 'Keep this synthetic note'); confirmation = false; const before = requests.length; await click(button('Reload handover status'));
    assert.equal(confirmations.length, 1); assert.equal(requests.length, before); assert.equal(field(/Client agreement note/).value, 'Keep this synthetic note');
    confirmation = true; await click(button('Reload handover status')); assert.equal(requests.length, before + 1); assert.equal(field(/Client agreement note/).value, ''); assert.equal(callbacks.dirty.at(-1), false); assert.deepEqual(mutations(), []);
  });

  await test('changing only payment date marks the form dirty', async () => {
    seedPrice(); await mount(); assert.equal(callbacks.dirty.at(-1), false); await fill(field('Payment date'), '2026-09-30'); assert.equal(callbacks.dirty.at(-1), true, 'A payment-date edit must be protected by the workspace unsaved-change guard');
  });


  await test('successfully verifying a custom payment date marks the saved form clean', async () => {
    seedPrice(); await mount(); await enterPayment(); await fill(field('Payment date'), '2026-09-30'); await click(button('Verify received payment')); assert.ok(button('Review test email')); assert.equal(callbacks.dirty.at(-1), false, 'A successfully saved date must not leave a phantom unsaved edit');
  });

  await test('ordinary parent callback rerenders preserve unsaved form entries without reloading', async () => {
    const rendered = await mount(); await fill(field(/Client agreement note/), 'Synthetic retained parent rerender'); const before = requests.length;
    rendered.rerender(React.createElement(App, props())); await tick(); assert.equal(field(/Client agreement note/).value, 'Synthetic retained parent rerender'); assert.equal(requests.length, before, 'Callback identity alone must not reload and discard the current form');
  });

  await test('switching away from a dirty product editor does not disable the next quote', async () => {
    const rendered = await mount(); await click(button('Edit synthetic products')); rendered.rerender(React.createElement(App, props({ quoteId: 'synthetic-b' }))); await tick(); assert.equal(priceCheck().disabled, false); assert.equal(callbacks.dirty.at(-1), false);
  });

  await test('failed and wrong-job initial GETs offer explicit retry without making a mutation', async () => {
    fault('GET', endpoint(), { status: 503 }); render(React.createElement(App, props())); await waitFor(() => assert.ok(screen.queryByRole('alert'))); assert.ok(button('Retry')); assert.deepEqual(mutations(), []);
    fault('GET', endpoint(), { wrongId: 'synthetic-b' }); await click(button('Retry')); assert.match(screen.getByRole('alert').textContent, /wrong job/); assert.deepEqual(mutations(), []); await click(button('Retry')); assert.ok(button('Confirm client price'));
  });

  await test('wrong-job mutation response retains the current price form and does not notify success', async () => {
    await mount(); await fill(field(/Client agreement note/), 'Synthetic exact current job'); await click(priceCheck()); fault('POST', endpoint(), { wrongId: 'synthetic-b' }); await click(button('Confirm client price'));
    assert.match(screen.getByRole('alert').textContent, /could not be verified/); assert.equal(priceCheck().checked, true); assert.equal(field(/Client agreement note/).value, 'Synthetic exact current job'); assert.equal(callbacks.updated.length, 0);
  });

  await test('late old GET after quote change cannot replace the new job', async () => {
    ready(); const gate = deferred(); fault('GET', endpoint(), { gate }); const rendered = render(React.createElement(App, props())); await tick();
    rendered.rerender(React.createElement(App, props({ quoteId: 'synthetic-b' }))); await waitFor(() => assert.ok(screen.queryByRole('form', { name: 'Confirm client price' })));
    assert.equal(requests.find(item => item.url === endpoint()).signal.aborted, true); await act(async () => { gate.resolve(); });
    assert.ok(screen.getByRole('form', { name: 'Confirm client price' })); assert.equal(screen.getByRole('region', { name: 'Synthetic product editor' }).dataset.quoteId, 'synthetic-b'); assert.equal(screen.queryByRole('button', { name: 'Review test email' }), null); assert.deepEqual(mutations(), []);
  });

  await test('late old POST after quote change cannot overwrite the new job or fire its success callback', async () => {
    const rendered = await mount(); await click(priceCheck()); const gate = deferred(); fault('POST', endpoint(), { gate }); await click(button('Confirm client price')); assert.equal(callbacks.busy.at(-1), true);
    rendered.rerender(React.createElement(App, props({ quoteId: 'synthetic-b' }))); await tick(); await act(async () => { gate.resolve(); });
    assert.equal(callbacks.updated.length, 0, 'Old quote mutation must not notify the newly selected job'); assert.ok(screen.getByRole('form', { name: 'Confirm client price' })); assert.equal(screen.getByRole('region', { name: 'Synthetic product editor' }).dataset.quoteId, 'synthetic-b'); assert.equal(callbacks.busy.at(-1), false);
  });

  await test('unmount suppresses pending workflow mutation success callbacks', async () => {
    const rendered = await mount(); await click(priceCheck()); const gate = deferred(); fault('POST', endpoint(), { gate }); await click(button('Confirm client price')); rendered.unmount(); const before = structuredClone(callbacks); await act(async () => { gate.resolve(); }); assert.deepEqual(callbacks, before);
  });

  await test('settings mount is GET-only; explicit owner save fixes test mode, half-payment policy and never enables live', async () => {
    settings.liveEnabled = true; settings.testEnabled = false; settings.requiredPaymentPercent = null; settings.testDate = '2000-01-01'; await mountSettings(); assert.deepEqual(mutations(), []);
    assert.equal(field('Test date · Mauritius').value, TODAY); assert.equal(field('Test recipient email').value, TEST_RECIPIENT); await fill(field('Test recipient email'), 'owner@synthetic.example.test'); await click(button('Save test-only setup'));
    assert.equal(mutations().length, 1); assert.equal(mutations()[0].method, 'PUT'); assert.equal(mutations()[0].url, SETTINGS);
    assert.deepEqual(mutations()[0].body, { expectedVersion: 3, partnerId: 'yan', testEnabled: true, testRecipient: 'owner@synthetic.example.test', testDate: TODAY, requiredPaymentPercent: 50, liveEnabled: false }); assert.equal(callbacks.saved.length, 1); assert.equal(callbacks.close.length, 0); assert.equal(REGISTRY.partners[0].emailNotificationsEnabled, false);
  });

  await test('settings owner denial fails closed and cannot PUT', async () => {
    owner = false; await mountSettings(); assert.match(screen.getByRole('alert').textContent, /Owner access/); assert.equal(field('Test recipient email').disabled, true); assert.equal(button('Save test-only setup').disabled, true); await click(button('Save test-only setup')); assert.deepEqual(mutations(), []); await click(button('Cancel')); assert.equal(callbacks.close.length, 1);
  });

  await test('settings duplicate submit is locked and Cancel stays disabled during save', async () => {
    await mountSettings(); const gate = deferred(); fault('PUT', SETTINGS, { gate }); const form = field('Test recipient email').closest('form'); await act(async () => { fireEvent.submit(form); fireEvent.submit(form); });
    assert.equal(mutations().length, 1); assert.equal(button('Saving…').disabled, true); assert.equal(button('Cancel').disabled, true); assert.equal(field('Test recipient email').disabled, true); await click(button('Cancel')); assert.equal(callbacks.close.length, 0); await act(async () => { gate.resolve(); }); assert.equal(callbacks.saved.length, 1);
  });

  await test('stale settings failure preserves recipient and date, does not call saved, and never switches to live', async () => {
    await mountSettings(); await fill(field('Test recipient email'), 'another-owner@synthetic.example.test'); await fill(field('Test date · Mauritius'), '2026-10-02'); fault('PUT', SETTINGS, { status: 409, error: 'Synthetic settings changed. Reload before saving.' }); await click(button('Save test-only setup'));
    assert.match(screen.getByRole('alert').textContent, /settings changed/); assert.equal(field('Test recipient email').value, 'another-owner@synthetic.example.test'); assert.equal(field('Test date · Mauritius').value, '2026-10-02'); assert.equal(callbacks.saved.length, 0); assert.equal(button('Save test-only setup').disabled, false); assert.equal(mutations()[0].body.liveEnabled, false);
  });

  await test('unmount suppresses pending settings save callback', async () => {
    const rendered = await mountSettings(); const gate = deferred(); fault('PUT', SETTINGS, { gate }); await click(button('Save test-only setup')); rendered.unmount(); await act(async () => { gate.resolve(); }); assert.equal(callbacks.saved.length, 0, 'An unmounted settings panel must not call onSaved');
  });

  console.log(`${passed} TANVI WORKFLOW UI TESTS PASSED; ${failures} FAILED`); dom.window.close(); if (failures) process.exitCode = 1;
})().catch(error => { console.error(error); cleanup(); dom.window.close(); process.exitCode = 1; });
