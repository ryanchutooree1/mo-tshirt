// Synthetic React checks only. Every request is mocked; no real partner writes or emails.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3007/admin/workspace?partner=yan', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'getComputedStyle']) global[key] = dom.window[key];
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
// Keep assertion values scalar: React DOM nodes contain circular fiber graphs that
// Node assertion diagnostics can expand until the process runs out of memory.
const { render, screen, fireEvent, act, cleanup, waitFor, within } = require('@testing-library/react');
function load(file, modules = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
    { exports, require: name => name in modules ? modules[name] : require(name), Date, Intl, URLSearchParams, fetch: (...args) => global.fetch(...args), console, setTimeout, clearTimeout }, { filename: file });
  return exports;
}
const partners = load('src/lib/partners.ts');
const yanView = load('src/lib/yan-production-view.ts');
const YanActions = load('src/components/admin/YanProductionActions.tsx', { '@/lib/yan-production-view': yanView });
const Page = load('src/components/admin/PartnerProductionPage.tsx', {
  '@/lib/partners': partners,
  '@/lib/yan-production-view': yanView,
  './YanProductionActions': YanActions,
  '@/admin/AdminThemeContext': { useAdminTheme: () => ({ theme: 'light', toggleTheme() {} }) },
  '@/components/admin/BackgroundRemoverPage': { default: () => null, __esModule: true },
  'next/image': { default: props => React.createElement('img', { alt: props.alt, src: typeof props.src === 'string' ? props.src : '' }), __esModule: true },
}).default;
const ACCEPT_BLOCKER = 'Accept this released job before starting production.';
const STALE_BLOCKER = 'The released packet changed. Reload before starting.';
const CLOSED_BLOCKER = 'This production assignment is no longer active.';
const REJECTED_BLOCKER = 'This job has been rejected.';
function fixture(id, decision = 'accepted') {
  const products = [{ product: 'Synthetic shirt', color: id === 'a' ? 'Blue' : 'White', size: 'M', quantity: 2 }];
  const file = { url: '/synthetic/original.svg', name: 'original.svg', contentType: 'image/svg+xml', sizeBytes: 123, provenance: 'client-upload' };
  return {
    id, code: `Q-${id.toUpperCase()}`, partnerId: 'yan', partnerName: 'Synthetic Yan', assignedPartnerIds: ['yan'], lockedBy: 'yan', isShared: false,
    visibleFields: partners.DEFAULT_PARTNER_VISIBLE_FIELDS, assignedAt: id === 'a' ? '2026-10-02T00:00:00Z' : '2026-10-01T00:00:00Z', createdAt: null, updatedAt: null,
    decision, productionStatus: 'not_started', clientStatus: 'confirmed_half_payment', printPlacement: 'small_front_only', printPlacementSource: 'admin', completionDays: null, managerPrice: null, price: null, comments: `${id.toUpperCase()}-only notes`, missingInformation: '',
    details: { artwork: [{ filename: file.name, label: 'Source', contentType: file.contentType, url: file.url }] }, summary: { product: 'Synthetic shirt', pieces: 2, print: 'DTF', deadline: '2026-10-20' },
    production: {
      requiresRelease: true, released: true, releaseId: `release-${id}`, packetFingerprint: id.padEnd(64, '0').slice(0, 64), readyToStart: decision === 'accepted', active: true, blockers: decision === 'accepted' ? [] : [ACCEPT_BLOCKER], startedAtIso: null, blanksReceived: false,
      packet: { version: 1, quoteId: id, reference: `Q-${id.toUpperCase()}`, products, quantity: 2, printMethod: 'DTF', deadline: { date: '2026-10-20', label: '2026-10-20' }, artworks: [{ key: 'art', label: 'Front logo', side: 'front', source: file, processed: { ...file, name: 'processed.png', url: '/synthetic/processed.png' }, useForPrint: true, selectedVariant: 'source', selectedFile: file, placement: 'Left chest', widthCm: 20, heightCm: 25, targetProductIndexes: [0] }], mockups: [{ key: 'mockup', label: 'Front mockup', side: 'front', file: { ...file, url: '/synthetic/mockup.png', name: 'mockup.png' } }] },
    },
  };
}
function earlierOffer(id = 'offer') {
  const order = fixture(id, 'pending');
  Object.assign(order.production, { released: false, releaseId: null, packetFingerprint: null, packet: null, readyToStart: false, blockers: ['No approved production release.'] });
  return order;
}
function started(id = 'a') {
  const order = fixture(id);
  order.productionStatus = 'in_progress';
  Object.assign(order.production, { startedAtIso: '2026-10-02T06:00:00Z', blanksReceived: true, readyToStart: false });
  return order;
}
function blocked(order, blocker) {
  order.production.readyToStart = false;
  order.production.blockers = [blocker];
  return order;
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
let records, requests, hold, failure;
function reset(items = [fixture('a')]) {
  records = new Map(items.map(item => [item.id, structuredClone(item)]));
  requests = []; hold = null; failure = null;
  global.fetch = async (url, options = {}) => {
    assert.equal(typeof url, 'string');
    assert.ok(url.startsWith('/api/partners/'), `No external endpoint allowed: ${url}`);
    const body = options.body ? JSON.parse(options.body) : null;
    const request = { url, method: options.method || 'GET', body };
    requests.push(request);
    if (url.startsWith('/api/partners/session?')) { assert.equal(request.method, 'GET'); return Response.json({}); }
    if (url.startsWith('/api/partners/orders?')) { assert.equal(request.method, 'GET'); return Response.json({ orders: [...records.values()] }); }
    const match = url.match(/^\/api\/partners\/orders\/([a-z0-9-]+)$/);
    assert.ok(match && records.has(match[1]), `No unmocked write/email endpoint allowed: ${url}`);
    assert.equal(request.method, 'PATCH');
    assert.equal(body.partnerId, records.get(match[1]).partnerId);
    const pendingFailure = failure;
    if (hold?.matches(request)) await hold.gate.promise;
    if (pendingFailure) return Response.json({ error: pendingFailure }, { status: 409 });
    const order = structuredClone(records.get(match[1]));
    if (body.action === 'start-production') {
      order.productionStatus = 'in_progress';
      Object.assign(order.production, { startedAtIso: '2026-10-02T06:00:00Z', blanksReceived: true, readyToStart: false });
    } else {
      for (const key of ['decision', 'comments', 'missingInformation', 'productionStatus', 'printPlacement']) order[key] = body[key];
      order.completionDays = body.completionDays ? Number(body.completionDays) : null;
      order.price = body.price ? Number(body.price) : null;
      order.production.readyToStart = body.decision === 'accepted' && !order.production.startedAtIso;
      order.production.blockers = body.decision === 'accepted' ? [] : [body.decision === 'rejected' ? REJECTED_BLOCKER : ACCEPT_BLOCKER];
    }
    records.set(order.id, order);
    return Response.json({ order });
  };
}
const writes = () => requests.filter(request => request.method !== 'GET');
const button = name => screen.getByRole('button', { name, exact: typeof name === 'string' });
const notes = () => screen.getByLabelText('Comments for Synthetic manager');
const card = id => within(document.querySelector('aside')).getByRole('button', { name: new RegExp(`^Q-${id.toUpperCase()}\\s`) });
const cards = () => within(document.querySelector('aside')).queryAllByRole('button').filter(node => /^Q-/.test(node.textContent));
function openNotes() {
  const summary = screen.getByText('Questions, notes & other updates');
  if (!summary.parentElement.open) fireEvent.click(summary);
}
async function mount({ partnerId = [...records.values()][0].partnerId, expected = 'a' } = {}) {
  render(React.createElement(Page, { partnerId, initialPartner: { id: partnerId, name: partnerId === 'yan' ? 'Synthetic Yan' : 'Synthetic Shabanaz', active: true, productionNotes: [], supportsLogoPrintPlacements: false }, managerName: 'Synthetic manager' }));
  await screen.findByRole('heading', { name: partnerId === 'yan' ? 'Your production jobs' : 'Assigned orders' });
  if (expected) await waitFor(() => assert.equal(notes().value, records.get(expected).comments));
  await act(async () => {});
}
async function select(id) {
  fireEvent.click(card(id));
  await waitFor(() => assert.equal(notes().value, records.get(id).comments));
}
async function releaseRequest(gate) {
  await act(async () => { gate.resolve(); await gate.promise; });
  await waitFor(() => assert.equal(Boolean(screen.queryByRole('button', { name: /^Saving/ })), false));
}
function snapshot(name) {
  if (!process.env.YAN_UI_SNAPSHOT_DIR) return;
  const stylesDir = '.next/static/chunks';
  const css = fs.existsSync(stylesDir) ? fs.readdirSync(stylesDir).filter(file => file.endsWith('.css')).map(file => fs.readFileSync(path.join(stylesDir, file), 'utf8')).join('\n') : '';
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="#f1f5f9"/><path d="M230 65L160 92 105 180 180 220 210 176V365H430V176L460 220 535 180 480 92 410 65Q320 130 230 65" fill="#284e88"/><text x="325" y="220" text-anchor="middle" fill="white" font-family="sans-serif" font-size="30">MO</text></svg>').toString('base64');
  const html = document.body.innerHTML.replace(/\/synthetic\/(?:original\.svg|processed\.png|mockup\.png)/g, svg);
  fs.mkdirSync(process.env.YAN_UI_SNAPSHOT_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.YAN_UI_SNAPSHOT_DIR, name), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Synthetic Yan production preview</title><style>${css}</style></head><body>${html}</body></html>`);
}
async function check(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  finally { cleanup(); }
}
async function run() {
  await check('Yan presentation helper classifies released queue, offers, and all terminal states', async () => {
    assert.equal(yanView.yanQueueView(fixture('a')), 'production');
    assert.equal(yanView.yanQueueView(earlierOffer()), 'offers');
    assert.equal(yanView.yanNextAction(fixture('a', 'pending'), false), 'accept');
    assert.equal(yanView.yanNextAction(fixture('a'), false), 'receive');
    assert.equal(yanView.yanNextAction(fixture('a'), true), 'start');
    assert.equal(yanView.yanNextAction(started(), false), 'ready');
    assert.equal(yanView.yanNextAction(earlierOffer(), false), 'blocked');
    for (const status of ['completed', 'ryan_to_collect', 'will_post_tomorrow']) {
      const order = started(); order.productionStatus = status;
      assert.equal(yanView.yanQueueView(order), 'history');
      assert.equal(yanView.yanNextAction(order, true), 'done');
    }
    const closed = fixture('closed'); closed.production.active = false;
    for (const order of [closed, fixture('rejected', 'rejected')]) {
      assert.equal(yanView.yanQueueView(order), 'history');
      assert.equal(yanView.yanNextAction(order, true), 'done');
    }
  });

  await check('default released queue and accessible offers/history; all navigation is read-only', async () => {
    const closed = blocked(fixture('closed'), CLOSED_BLOCKER); closed.production.active = false;
    const rejected = blocked(fixture('rejected', 'rejected'), REJECTED_BLOCKER);
    const finished = ['completed', 'ryan_to_collect', 'will_post_tomorrow'].map((status, index) => { const order = started(`done-${index}`); order.productionStatus = status; return order; });
    reset([earlierOffer(), fixture('a', 'pending'), fixture('b'), closed, rejected, ...finished]);
    const before = structuredClone([...records]);
    await mount();
    assert.equal(button('Production (2)').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(cards().map(node => node.querySelector('p').textContent), ['Q-A', 'Q-B']);
    assert.equal(Boolean(screen.queryByRole('button', { name: 'Accept', exact: true })), false);
    assert.equal(Boolean(screen.queryByLabelText('Production status')), false);
    snapshot('yan-production-preview.html');
    fireEvent.change(screen.getByLabelText('Search orders'), { target: { value: 'Q-B' } });
    await waitFor(() => assert.equal(notes().value, 'B-only notes'));
    assert.equal(cards().length, 1);
    fireEvent.change(screen.getByLabelText('Search orders'), { target: { value: 'does-not-exist' } });
    assert.equal(cards().length, 0);
    fireEvent.click(button('Earlier offers (1)'));
    await waitFor(() => assert.equal(notes().value, 'OFFER-only notes'));
    assert.equal(screen.getByLabelText('Search orders').value, '');
    assert.ok(screen.getByText('Quotation offer only. A current approved release is required before production.'));
    assert.ok(screen.getByLabelText('Completion days'));
    assert.equal(button('Start production').disabled, true);
    fireEvent.click(button('History (5)'));
    for (const order of [closed, rejected, ...finished]) {
      await select(order.id);
      assert.equal(Boolean(screen.queryByRole('button', { name: /^(Accept job|Confirm shirts received|Start printing|Mark ready for collection)$/ })), false);
      if (order.production.blockers.length) assert.ok(screen.getByText(order.production.blockers[0]));
    }
    fireEvent.click(button('Production (2)'));
    fireEvent.click(button('Next'));
    await waitFor(() => assert.equal(notes().value, 'B-only notes'));
    fireEvent.click(button('Previous'));
    await waitFor(() => assert.equal(notes().value, 'A-only notes'));
    fireEvent.change(screen.getByLabelText('Sort queue'), { target: { value: 'deadline' } });
    fireEvent.click(button('Back to queue'));
    fireEvent.click(button('Refresh'));
    await waitFor(() => assert.equal(button('Refresh').disabled, false));
    assert.equal(writes().length, 0);
    assert.deepEqual([...records], before);
  });

  await check('empty Production view keeps earlier offers discoverable without starting them', async () => {
    reset([earlierOffer()]); await mount({ expected: null });
    await screen.findByRole('heading', { name: 'No released production jobs yet' });
    fireEvent.click(button('Earlier offers (1)'));
    await waitFor(() => assert.equal(notes().value, 'OFFER-only notes'));
    assert.equal(button('Start production').disabled, true);
    assert.equal(writes().length, 0);
  });

  await check('released job with unshared packet stays blocked instead of falling back to legacy production controls', async () => {
    const order = blocked(fixture('a'), 'Ask the manager to share all released production fields before starting.');
    order.production.packet = null;
    reset([order]); await mount();
    assert.ok(screen.getByRole('heading', { name: 'Waiting for release' }));
    assert.ok(screen.getByText(order.production.blockers[0]));
    assert.equal(Boolean(screen.queryByLabelText('Production status')), false);
    assert.equal(Boolean(screen.queryByRole('button', { name: /^(Accept job|Confirm shirts received|Start printing|Start production)$/ })), false);
    openNotes();
    assert.equal(button('Save notes').disabled, true);
    assert.equal(writes().length, 0);
  });

  await check('inactive unreleased history retains details with legacy response controls disabled', async () => {
    const order = earlierOffer('a'); order.production.active = false; order.production.blockers = [CLOSED_BLOCKER];
    reset([order]); await mount({ expected: null });
    fireEvent.click(button('History (1)'));
    await waitFor(() => assert.equal(notes().value, 'A-only notes'));
    assert.equal(button('Accept').closest('fieldset').disabled, true);
    assert.equal(notes().closest('fieldset').disabled, true);
    assert.equal(button('Start production').disabled, true);
    assert.equal(writes().length, 0);
  });

  await check('Accept job performs one separate acknowledgement, even with repeated clicks', async () => {
    const order = fixture('a', 'pending'); order.missingInformation = 'Old request';
    reset([order]); await mount();
    const gate = deferred(); hold = { gate, matches: request => !request.body.action };
    const accept = button('Accept job');
    fireEvent.click(accept); fireEvent.click(accept);
    assert.equal(writes().length, 1);
    assert.deepEqual(writes()[0].body, { partnerId: 'yan', decision: 'accepted', productionStatus: 'not_started', printPlacement: 'small_front_only', completionDays: '', price: '', comments: 'A-only notes', missingInformation: '' });
    assert.equal(records.get('a').decision, 'pending');
    await releaseRequest(gate);
    assert.equal(records.get('a').decision, 'accepted');
    assert.equal(records.get('a').production.startedAtIso, null);
    assert.equal(records.get('a').production.blanksReceived, false);
    assert.equal(button('Confirm shirts received').disabled, false);
    assert.equal(writes().length, 1);
  });

  await check('local receipt and recheck, exact multirow start, downloads, and existing collection status', async () => {
    const order = fixture('a');
    order.production.packet.products = [
      { product: 'Synthetic shirt', color: 'Blue', size: 'M', quantity: 2 },
      { product: 'Synthetic shirt', color: 'Blue', size: 'L', quantity: 4 },
      { product: 'Synthetic polo', color: 'Black', size: 'XL', quantity: 3 },
    ];
    order.production.packet.quantity = 9;
    order.production.packet.artworks[0].targetProductIndexes = [0, 2];
    reset([order]); await mount();
    assert.ok(screen.getByText('20 × 25 cm', { exact: false }));
    assert.ok(screen.getByText('5 printed pieces for this artwork'));
    for (const name of ['Approved print download (source): original.svg', 'Original client upload: original.svg', 'Processed version: processed.png', 'Mockup reference: mockup.png']) {
      assert.match(screen.getByRole('link', { name }).getAttribute('href'), /^\/api\/shops\/download\?/);
    }
    const before = structuredClone(records.get('a'));
    fireEvent.click(button('Confirm shirts received'));
    assert.equal(button('Start printing').disabled, false);
    assert.equal(writes().length, 0);
    assert.deepEqual(records.get('a'), before);
    fireEvent.click(button('Recheck shirts'));
    assert.equal(Boolean(screen.queryByRole('button', { name: 'Start printing', exact: true })), false);
    fireEvent.click(button('Confirm shirts received'));
    const gate = deferred(); hold = { gate, matches: request => request.body.action === 'start-production' };
    const start = button('Start printing'); fireEvent.click(start); fireEvent.click(start);
    assert.equal(writes().length, 1);
    assert.deepEqual(writes()[0].body, { partnerId: 'yan', action: 'start-production', releaseId: 'release-a', packetFingerprint: order.production.packetFingerprint, blanksReceived: true, receivedProducts: order.production.packet.products });
    await releaseRequest(gate);
    assert.equal(records.get('a').productionStatus, 'in_progress');
    assert.equal(button('Mark ready for collection').disabled, false);
    snapshot('yan-production-started-preview.html');
    fireEvent.click(button('Mark ready for collection'));
    await waitFor(() => assert.equal(records.get('a').productionStatus, 'ryan_to_collect'));
    await screen.findByRole('heading', { name: 'Production ready' });
    assert.equal(button('History (1)').getAttribute('aria-pressed'), 'true');
    assert.equal(writes().length, 2);
    assert.equal(writes()[1].body.productionStatus, 'ryan_to_collect');
    assert.equal(writes()[1].body.action, undefined);
    assert.equal(writes().filter(request => request.body.action === 'start-production').length, 1);
    fireEvent.click(button('History (1)'));
    await screen.findByRole('heading', { name: 'Production ready' });
    assert.equal(Boolean(screen.queryByRole('button', { name: 'Mark ready for collection', exact: true })), false);
  });

  await check('server stale start error is visible, does not mutate, and clears the receipt confirmation', async () => {
    reset(); await mount(); failure = STALE_BLOCKER;
    fireEvent.click(button('Confirm shirts received')); fireEvent.click(button('Start printing'));
    await screen.findByText(STALE_BLOCKER);
    assert.equal(records.get('a').productionStatus, 'not_started');
    assert.equal(records.get('a').production.blanksReceived, false);
    assert.equal(Boolean(screen.queryByRole('button', { name: 'Start printing', exact: true })), false);
    assert.equal(button('Confirm shirts received').disabled, false);
    assert.equal(writes().length, 1);
  });

  await check('stale/payment gates before start and stale/closed/rejected gates after start cannot mutate', async () => {
    for (const [order, primary, view] of [
      [blocked(fixture('a', 'pending'), STALE_BLOCKER), 'Accept job', 'production'],
      [blocked(fixture('a'), STALE_BLOCKER), 'Confirm shirts received', 'production'],
      [blocked(fixture('a'), 'Client payment must be verified.'), 'Confirm shirts received', 'production'],
      [blocked(started(), STALE_BLOCKER), 'Mark ready for collection', 'production'],
      [Object.assign(blocked(started(), CLOSED_BLOCKER), { production: { ...started().production, active: false, blockers: [CLOSED_BLOCKER] } }), null, 'history'],
      [blocked(Object.assign(started(), { decision: 'rejected' }), REJECTED_BLOCKER), null, 'history'],
    ]) {
      reset([order]); await mount({ expected: view === 'production' ? 'a' : null });
      if (view === 'history') { fireEvent.click(button('History (1)')); await waitFor(() => assert.equal(notes().value, 'A-only notes')); }
      assert.ok(screen.getByText(order.production.blockers[0]));
      if (primary) { assert.equal(button(primary).disabled, true); fireEvent.click(button(primary)); }
      else assert.equal(Boolean(screen.queryByRole('button', { name: /^(Accept job|Confirm shirts received|Start printing|Mark ready for collection)$/ })), false);
      openNotes();
      for (const label of ['Save notes', 'Send question', order.production.startedAtIso ? 'Will post tomorrow' : 'Decline job']) {
        const control = button(label); assert.equal(control.disabled, true); fireEvent.click(control);
      }
      assert.equal(writes().length, 0);
      cleanup();
    }
  });

  await check('refresh invalidates local receipt when a released packet becomes stale', async () => {
    reset(); await mount(); fireEvent.click(button('Confirm shirts received'));
    records.set('a', blocked(fixture('a'), STALE_BLOCKER));
    fireEvent.click(button('Refresh'));
    await waitFor(() => {
      assert.equal(Boolean(screen.queryByText(STALE_BLOCKER)), true);
      assert.equal(Boolean(screen.queryByRole('button', { name: 'Start printing', exact: true })), false);
      assert.equal(button('Confirm shirts received').disabled, true);
    });
    assert.equal(writes().length, 0);
  });

  await check('server rejects stale after-start collection without changing production state', async () => {
    reset([started()]); await mount(); failure = STALE_BLOCKER;
    fireEvent.click(button('Mark ready for collection'));
    await screen.findByText(STALE_BLOCKER);
    assert.equal(records.get('a').productionStatus, 'in_progress');
    assert.equal(writes().length, 1);
    assert.equal(writes()[0].body.productionStatus, 'ryan_to_collect');
  });

  await check('pending A start never selects A again or overwrites B notes/receipt; repeated writes are blocked', async () => {
    reset([fixture('a'), fixture('b')]); await mount();
    const gate = deferred(); hold = { gate, matches: request => request.body.action === 'start-production' };
    fireEvent.click(button('Confirm shirts received'));
    const start = button('Start printing'); fireEvent.click(start); fireEvent.click(start);
    await select('b'); openNotes();
    fireEvent.change(notes(), { target: { value: 'B local edit while A starts' } });
    assert.equal(Boolean(screen.queryByRole('button', { name: 'Start printing', exact: true })), false);
    assert.equal(button('Saving…').disabled, true);
    fireEvent.click(button('Save notes'));
    assert.equal(writes().length, 1);
    await releaseRequest(gate);
    assert.equal(records.get('a').productionStatus, 'in_progress');
    assert.equal(notes().value, 'B local edit while A starts');
    assert.equal(button('Confirm shirts received').disabled, false);
    assert.equal(Boolean(screen.queryByText('Production started. Your garment receipt check has been recorded.')), false);
    fireEvent.click(button('Save notes'));
    await waitFor(() => assert.equal(records.get('b').comments, 'B local edit while A starts'));
    assert.equal(writes().length, 2);
    assert.equal(writes()[1].url, '/api/partners/orders/b');
    assert.equal(writes()[1].body.comments, 'B local edit while A starts');
    assert.equal(writes()[1].body.productionStatus, 'not_started');
    await screen.findByText('Saved.');
    await select('a'); assert.equal(button('Mark ready for collection').disabled, false);
  });

  await check('pending A acceptance preserves B draft and does not leak A success notice', async () => {
    reset([fixture('a', 'pending'), fixture('b')]); await mount();
    const gate = deferred(); hold = { gate, matches: request => request.url.endsWith('/a') };
    fireEvent.click(button('Accept job')); await select('b'); openNotes();
    fireEvent.change(notes(), { target: { value: 'B draft remains isolated' } });
    await releaseRequest(gate);
    assert.equal(records.get('a').decision, 'accepted');
    assert.equal(notes().value, 'B draft remains isolated');
    assert.equal(Boolean(screen.queryByText('Saved.')), false);
    assert.equal(button('Confirm shirts received').disabled, false);
    assert.equal(writes().length, 1);
  });

  await check('pending A collection update does not switch B to History or overwrite its local draft', async () => {
    reset([started('a'), fixture('b')]); await mount();
    const gate = deferred(); hold = { gate, matches: request => request.url.endsWith('/a') };
    fireEvent.click(button('Mark ready for collection')); await select('b'); openNotes();
    fireEvent.change(notes(), { target: { value: 'B draft while A finishes' } });
    await releaseRequest(gate);
    assert.equal(records.get('a').productionStatus, 'ryan_to_collect');
    assert.equal(button('Production (1)').getAttribute('aria-pressed'), 'true');
    assert.equal(button('History (1)').getAttribute('aria-pressed'), 'false');
    assert.equal(notes().value, 'B draft while A finishes');
    assert.equal(Boolean(screen.queryByText('Saved.')), false);
    assert.equal(writes().length, 1);
  });

  await check('pending A start error does not leak into B; navigation resets unsaved receipt only', async () => {
    reset([fixture('a'), fixture('b')]); await mount();
    fireEvent.click(button('Confirm shirts received')); await select('b'); await select('a');
    assert.equal(button('Confirm shirts received').disabled, false);
    assert.equal(writes().length, 0);
    const gate = deferred(); hold = { gate, matches: request => request.url.endsWith('/a') }; failure = STALE_BLOCKER;
    fireEvent.click(button('Confirm shirts received')); fireEvent.click(button('Start printing')); await select('b'); openNotes();
    fireEvent.change(notes(), { target: { value: 'B draft after A failure' } });
    await releaseRequest(gate);
    assert.equal(notes().value, 'B draft after A failure');
    assert.equal(Boolean(screen.queryByText(STALE_BLOCKER)), false);
    assert.equal(button('Confirm shirts received').disabled, false);
    assert.equal(records.get('a').productionStatus, 'not_started');
    assert.equal(writes().length, 1);
  });

  await check('non-Yan partners retain legacy decisions, quotations, statuses, and save payload', async () => {
    const legacy = fixture('a'); legacy.partnerId = 'shabanaz'; legacy.partnerName = 'Synthetic Shabanaz';
    legacy.production = { requiresRelease: false, released: false, releaseId: null, packetFingerprint: null, packet: null, readyToStart: false, active: true, blockers: [], startedAtIso: null, blanksReceived: false };
    legacy.price = 150; legacy.completionDays = 3;
    reset([legacy]); await mount();
    assert.equal(Boolean(screen.queryByRole('navigation', { name: 'Job views' })), false);
    assert.equal(Boolean(screen.queryByRole('region', { name: 'Production next action' })), false);
    assert.equal(Boolean(screen.queryByRole('button', { name: /^(Accept job|Confirm shirts received|Start printing)$/ })), false);
    assert.equal(Boolean(screen.queryByRole('button', { name: 'Start production', exact: true })), false);
    assert.ok(button('Accept')); assert.ok(button('Need info')); assert.ok(button('Reject'));
    assert.equal(screen.getByLabelText('Completion days').value, '3');
    assert.equal(screen.getByLabelText('Suggested price').value, '150');
    const status = screen.getByLabelText('Production status');
    for (const option of Array.from(status.options)) assert.equal(option.disabled, false);
    fireEvent.change(status, { target: { value: 'completed' } });
    fireEvent.click(button('Save acceptance'));
    await waitFor(() => assert.equal(records.get('a').productionStatus, 'completed'));
    await waitFor(() => assert.equal(button('Save acceptance').disabled, false));
    assert.deepEqual(writes()[0].body, { partnerId: 'shabanaz', decision: 'accepted', productionStatus: 'completed', printPlacement: 'small_front_only', completionDays: '3', price: '150', comments: 'A-only notes', missingInformation: '' });
  });
}
run().catch(error => { console.error(error); cleanup(); process.exitCode = 1; });
