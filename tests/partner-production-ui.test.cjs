// Synthetic React checks only. All requests stay in memory.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3007/admin/workspace?partner=yan', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'getComputedStyle']) global[key] = dom.window[key];
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, act, cleanup, waitFor } = require('@testing-library/react');
function load(file, modules = {}) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
 { exports, require: name => name in modules ? modules[name] : require(name), Date, Intl, URLSearchParams, fetch: (...args) => global.fetch(...args), console, setTimeout, clearTimeout }, { filename: file });
 return exports;
}
const partners = load('src/lib/partners.ts');
const Page = load('src/components/admin/PartnerProductionPage.tsx', {
 '@/lib/partners': partners,
 '@/admin/AdminThemeContext': { useAdminTheme: () => ({ theme: 'light', toggleTheme() {} }) },
 '@/components/admin/BackgroundRemoverPage': { default: () => null, __esModule: true },
 'next/image': { default: props => React.createElement('img', { alt: props.alt, src: typeof props.src === 'string' ? props.src : '' }), __esModule: true },
}).default;
function fixture(id, decision = 'accepted') {
 const products = [{ product: 'Synthetic shirt', color: id === 'a' ? 'Blue' : 'White', size: 'M', quantity: 2 }];
 const file = { url: '/synthetic/original.svg', name: 'original.svg', contentType: 'image/svg+xml', sizeBytes: 123, provenance: 'client-upload' };
 return { id, code: `Q-${id.toUpperCase()}`, partnerId: 'yan', partnerName: 'Synthetic Yan', assignedPartnerIds: ['yan'], lockedBy: 'yan', isShared: false,
 visibleFields: partners.DEFAULT_PARTNER_VISIBLE_FIELDS, assignedAt: `2026-10-0${id === 'a' ? 2 : 1}T00:00:00Z`, createdAt: null, updatedAt: null, decision, productionStatus: 'not_started', clientStatus: 'confirmed_half_payment', printPlacement: 'small_front_only', printPlacementSource: 'admin', completionDays: null, managerPrice: null, price: null, comments: id === 'b' ? 'B-only notes' : 'A-only notes', missingInformation: '',
 details: { artwork: [{ filename: file.name, label: 'Source', contentType: file.contentType, url: file.url }] }, summary: { product: 'Synthetic shirt', pieces: 2, print: 'DTF', deadline: '2026-10-20' },
 production: { released: true, releaseId: `release-${id}`, packetFingerprint: id.repeat(64), readyToStart: decision === 'accepted', active: true, blockers: decision === 'accepted' ? [] : ['Accept this released job before starting production.'], startedAtIso: null, blanksReceived: false,
 packet: { version: 1, quoteId: id, reference: `Q-${id.toUpperCase()}`, products, quantity: 2, printMethod: 'DTF', deadline: { date: '2026-10-20', label: '2026-10-20' }, artworks: [{ key: 'art', label: 'Front logo', side: 'front', source: file, processed: { ...file, name: 'processed.png', url: '/synthetic/processed.png' }, useForPrint: true, selectedVariant: 'source', selectedFile: file, placement: 'Left chest', widthCm: 20, heightCm: 25, targetProductIndexes: [0] }], mockups: [{ key: 'mockup', label: 'Front mockup', side: 'front', file: { ...file, url: '/synthetic/mockup.png', name: 'mockup.png' } }] } } };
}
let records, requests, deferredStart, failure;
function reset(items = [fixture('a')]) {
 records = new Map(items.map(item => [item.id, item])); requests = []; deferredStart = null; failure = null;
 global.fetch = async (url, options = {}) => {
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ url, body });
  if (url.startsWith('/api/partners/session?')) return Response.json({});
  if (url.startsWith('/api/partners/orders?')) return Response.json({ orders: [...records.values()] });
  const match = url.match(/^\/api\/partners\/orders\/([ab])$/);
  assert.ok(match, `No real endpoint allowed: ${url}`);
  if (body.action === 'start-production' && deferredStart) await deferredStart.promise;
  if (failure) return Response.json({ error: failure }, { status: 409 });
  const order = structuredClone(records.get(match[1]));
  if (body.action === 'start-production') { order.productionStatus = 'in_progress'; order.production.startedAtIso = '2026-10-02T06:00:00Z'; order.production.blanksReceived = true; order.production.readyToStart = false; }
  else { order.decision = body.decision; order.comments = body.comments; order.productionStatus = body.productionStatus; order.production.readyToStart = body.decision === 'accepted'; order.production.blockers = []; }
  records.set(order.id, order); return Response.json({ order });
 };
}
async function mount() {
 const partnerId = records.get('a').partnerId;
 render(React.createElement(Page, { partnerId, initialPartner: { id: partnerId, name: 'Synthetic Yan', active: true, productionNotes: [], supportsLogoPrintPlacements: false }, managerName: 'Synthetic manager' }));
 await screen.findByLabelText('Comments for Synthetic manager');
 await waitFor(() => assert.equal(screen.getByLabelText('Comments for Synthetic manager').value, records.get('a').comments));
 await act(async () => {});
}
async function run() {
 reset([fixture('a', 'pending')]); await mount();
 assert.equal(screen.getByRole('button', { name: 'Start production', exact: true }).disabled, true);
 fireEvent.click(screen.getByRole('button', { name: 'Accept', exact: true }));
 fireEvent.click(screen.getByRole('button', { name: 'Save acceptance', exact: true }));
 await waitFor(() => assert.equal(records.get('a').decision, 'accepted'));
 assert.equal(requests.filter(r => r.body).length, 1); assert.equal(requests.find(r => r.body).body.productionStatus, 'not_started');
 assert.equal(records.get('a').production.startedAtIso, null);
 await waitFor(() => assert.equal(screen.getByRole('checkbox', { name: /I received and checked/ }).disabled, false));
 assert.ok(screen.getByText('20 × 25 cm', { exact: false }));
 assert.ok(screen.getByText('2 printed pieces for this artwork')); 
 assert.ok(screen.getByRole('link', { name: /Approved print download \(source\): original.svg/ }));
 assert.ok(screen.getByRole('link', { name: /Original client upload: original.svg/ }));
 assert.ok(screen.getByRole('link', { name: /Processed version: processed.png/ }));
 assert.ok(screen.getByRole('link', { name: /Mockup reference: mockup.png/ }));
 fireEvent.click(screen.getByRole('checkbox', { name: /I received and checked/ }));
 fireEvent.click(screen.getByRole('button', { name: 'Start production', exact: true }));
 await waitFor(() => assert.equal(records.get('a').productionStatus, 'in_progress'));
 const start = requests.find(r => r.body?.action === 'start-production').body;
 assert.equal(start.blanksReceived, true); assert.equal(start.releaseId, 'release-a'); assert.deepEqual(start.receivedProducts, fixture('a').production.packet.products);
 cleanup();

 // A pending start must never copy A's draft into B or move the selected job back to A.
 reset([fixture('a'), fixture('b')]); await mount();
 let resolve; deferredStart = { promise: new Promise(done => resolve = done) };
 fireEvent.click(screen.getByRole('checkbox', { name: /I received and checked/ }));
 fireEvent.click(screen.getByRole('button', { name: 'Start production', exact: true }));
 const bButton = screen.getAllByRole('button').find(button => /Q-B/.test(button.textContent)); assert.ok(bButton); fireEvent.click(bButton);
 await waitFor(() => assert.equal(screen.getByLabelText('Comments for Synthetic manager').value, 'B-only notes'));
 assert.equal(screen.getByRole('checkbox', { name: /I received and checked/ }).checked, false);
 await act(async () => resolve());
 await waitFor(() => assert.equal(records.get('a').productionStatus, 'in_progress'));
 assert.equal(screen.getByLabelText('Comments for Synthetic manager').value, 'B-only notes');
 assert.equal(screen.getByRole('checkbox', { name: /I received and checked/ }).checked, false);
 fireEvent.click(screen.getByRole('button', { name: 'Save acceptance', exact: true }));
 await waitFor(() => assert.equal(requests.filter(r => r.body).length, 2));
 const saveB = requests.filter(r => r.body).at(-1); assert.match(saveB.url, /\/b$/); assert.equal(saveB.body.comments, 'B-only notes');
 await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Save acceptance', exact: true }).disabled, false));
 await act(async () => {});
 cleanup();

 reset(); await mount(); failure = 'The released packet changed. Reload before starting.';
 await waitFor(() => assert.equal(screen.getByRole('checkbox', { name: /I received and checked/ }).disabled, false));
 fireEvent.click(screen.getByRole('checkbox', { name: /I received and checked/ }));
 assert.equal(screen.getByRole('button', { name: 'Start production', exact: true }).disabled, false);
 fireEvent.click(screen.getByRole('button', { name: 'Start production', exact: true }));
 await screen.findByText(failure); assert.equal(records.get('a').productionStatus, 'not_started'); cleanup();
 // Other partners retain their existing status workflow and do not see Yan-only release controls.
 const legacy = fixture('a'); legacy.partnerId = 'shabanaz'; legacy.partnerName = 'Synthetic Shabanaz'; legacy.production = { requiresRelease: false, released: false, releaseId: null, packetFingerprint: null, packet: null, readyToStart: false, active: true, blockers: [], startedAtIso: null, blanksReceived: false }; legacy.price = 150; legacy.completionDays = 3;
 reset([legacy]); await mount();
 assert.equal(screen.queryByRole('button', { name: 'Start production', exact: true }), null);
 assert.equal(screen.queryByText(/current release and garment receipt/), null);
 const statusSelect = screen.getByLabelText('Production status');
 for (const option of Array.from(statusSelect.options)) assert.equal(option.disabled, false);
 fireEvent.change(statusSelect, { target: { value: 'completed' } });
 fireEvent.click(screen.getByRole('button', { name: 'Save acceptance', exact: true }));
 await waitFor(() => assert.equal(records.get('a').productionStatus, 'completed'));
 await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Save acceptance', exact: true }).disabled, false));
 assert.equal(requests.find(r => r.body).body.productionStatus, 'completed'); cleanup();

 console.log('PASS partner UI: separate acceptance/start, canonical source + mockup downloads, exact receipt, stale rejection, deferred A/B navigation, non-Yan legacy status scope');
}
run().catch(error => { console.error(error); cleanup(); process.exitCode = 1; });
