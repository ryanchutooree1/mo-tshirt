// Synthetic browser and upload fixtures only; no external uploads, email or records.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'getComputedStyle']) global[key] = dom.window[key];
Object.defineProperty(global, 'navigator', { configurable: true, value: dom.window.navigator });
global.IS_REACT_ACT_ENVIRONMENT = true;
URL.createObjectURL = () => 'blob:synthetic-preview';
URL.revokeObjectURL = () => {};
const { render, screen, fireEvent, act, cleanup, waitFor } = require('@testing-library/react');
let uploads = [], submitted = [], processing = [], failUpload = false;
let remove = async () => ({ blob: new Blob(['transparent-result'], { type: 'image/png' }), method: 'solid-color' });
const upload = async input => {
  uploads.push(input);
  if (failUpload) throw new Error('Synthetic upload failure');
  return { attachment: { name: input.filename, url: `/api/quotation/uploads/test-${uploads.length}`, contentType: input.file.type, size: input.file.size, uploadedAt: '2026-10-01T00:00:00Z' }, sessionId: input.sessionId };
};
const cache = new Map();
function load(relative) {
  let filename = path.resolve(root, relative);
  if (!fs.existsSync(filename) && filename.endsWith('.ts')) filename = filename.slice(0, -3) + '.js';
  if (cache.has(filename)) return cache.get(filename);
  const loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = module.paths;
  const original = loaded.require.bind(loaded);
  loaded.require = name => {
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.endsWith('/automatic-background-removal') || name === './automatic-background-removal') return { canAutomaticallyRemoveBackground: file => file.type.startsWith('image/'), removeBackgroundAutomatically: async (...args) => { processing.push(args[0]); return remove(...args); } };
    if (name.endsWith('/public-artwork-upload') || name === './public-artwork-upload') return { uploadPublicArtwork: upload };
    if (name === '@/hooks/useJourneyTracking') return { useJourneyTracking: () => ({ start() {}, attach() {}, complete() {} }) };
    if (name === '@/lib/analytics') return { trackProductInterest() {} };
    if (name === '@/data/work') return { CONTACT_EMAIL: 'example@example.test', CONTACT_PHONE_DISPLAY: '0000', CONTACT_TEL: '0000', getWhatsAppUrl: () => '#' };
    if (name === 'next/image') return { __esModule: true, default: ({ unoptimized, fill, ...props }) => React.createElement('img', props) };
    if (name === 'next/link' || name === '@/components/TrackedWhatsAppLink') return { __esModule: true, default: ({ trackingSource, trackingLocation, ...props }) => React.createElement('a', props) };
    if (name.startsWith('@/components/')) return new Proxy({}, { get: () => () => null });
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
    if (name.startsWith('./')) return load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)));
    return original(name);
  };
  let source = fs.readFileSync(filename, 'utf8');
  if (filename.endsWith('PremiumDesignStudioClient.tsx')) source += '\nexport { ArtworkUploadSlot };\n';
  loaded._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  cache.set(filename, loaded.exports);
  return loaded.exports;
}
const { selectOriginalArtwork, applyArtworkResult, uploadArtworkWithOriginal, validateArtworkUploadBatch } = load('src/lib/original-artwork-upload.ts');
const { ArtworkUploadSlot } = load('src/components/PremiumDesignStudioClient.tsx');
const QuoteForm = load('src/components/QuoteForm.tsx').default;
const makeFile = (name = 'generic-logo.jpg', data = 'untouched-client-bytes', type = 'image/jpeg') => new File([data], name, { type });
const maxBytes = 5 * 1024 * 1024;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
test.beforeEach(() => {
  uploads = []; submitted = []; processing = []; failUpload = false;
  remove = async () => ({ blob: new Blob(['transparent-result'], { type: 'image/png' }), method: 'solid-color' });
  global.fetch = async (url, init) => {
    if (url === '/api/quote-options') return { ok: true, json: async () => ({ colors: ['Black'] }) };
    assert.equal(url, '/api/contact'); submitted.push(init.body);
    return { ok: false, json: async () => ({ error: 'Synthetic review response' }) };
  };
});
test.afterEach(cleanup);

test('raw artwork uploads exactly once and retains exact storage metadata without invented processing', async () => {
  const raw = makeFile();
  const result = await uploadArtworkWithOriginal({ selection: selectOriginalArtwork(raw), sessionId: 'synthetic-session', maxBytes });
  assert.equal(uploads.length, 1); assert.equal(uploads[0].file, raw);
  assert.equal(await uploads[0].file.text(), 'untouched-client-bytes');
  assert.equal(result.originalUrl, result.url); assert.equal(result.originalFilename, result.filename);
  assert.equal(result.originalSize, raw.size); assert.equal(result.originalContentType, raw.type);
  assert.equal(result.originalProvenance, 'client-upload'); assert.equal(Object.hasOwn(result, 'backgroundRemovalMethod'), false);
});
test('processed pair preserves raw bytes and one logical entry with actual method and same session', async () => {
  const selected = selectOriginalArtwork(makeFile());
  const processed = makeFile('cutout.png', 'different-transparent-bytes', 'image/png');
  const result = await uploadArtworkWithOriginal({ selection: applyArtworkResult(selected, selected.source, processed, 'ai'), sessionId: 'synthetic-session', maxBytes });
  assert.equal(uploads.length, 2); assert.equal(uploads[0].file, selected.source.file); assert.equal(uploads[1].file, processed);
  assert.equal(uploads[0].sessionId, uploads[1].sessionId); assert.notEqual(result.originalUrl, result.url);
  assert.equal(result.originalFilename, 'generic-logo.jpg'); assert.equal(result.filename, 'cutout.png'); assert.equal(result.backgroundRemovalMethod, 'ai');
});
test('replacement and clear invalidate stale pairs even if the same File is reselected', () => {
  const raw = makeFile(), before = selectOriginalArtwork(raw), after = selectOriginalArtwork(raw), result = makeFile('cutout.png');
  assert.equal(applyArtworkResult(after, before.source, result, 'ai'), after);
  assert.equal(applyArtworkResult(null, before.source, result, 'ai'), null);
  const processed = applyArtworkResult(before, before.source, result, 'solid-color');
  const restored = applyArtworkResult(processed, before.source, raw);
  assert.equal(restored.file, raw); assert.equal(restored.source, before.source); assert.equal(Object.hasOwn(restored, 'backgroundRemovalMethod'), false);
});
test('full-batch preflight enforces 12 logical entries, 5MiB files, and 15MiB unique original + result bytes', () => {
  const raw = makeFile();
  assert.doesNotThrow(() => validateArtworkUploadBatch(Array.from({ length: 12 }, () => selectOriginalArtwork(raw))));
  assert.throws(() => validateArtworkUploadBatch(Array.from({ length: 13 }, () => selectOriginalArtwork(raw))), /12/);
  assert.throws(() => validateArtworkUploadBatch([selectOriginalArtwork(makeFile('oversized.png', new Uint8Array(maxBytes + 1)))]), /5MB/);
  assert.throws(() => validateArtworkUploadBatch([selectOriginalArtwork(makeFile('empty.png', ''))]), /non-empty/);
  const selections = Array.from({ length: 2 }, () => { const selected = selectOriginalArtwork(makeFile('raw.png', new Uint8Array(maxBytes))); return applyArtworkResult(selected, selected.source, makeFile('processed.png', new Uint8Array(maxBytes)), 'ai'); });
  assert.throws(() => validateArtworkUploadBatch(selections), /15MB/);
  assert.doesNotThrow(() => validateArtworkUploadBatch(selections.slice(0, 1), [makeFile('mockup.png', new Uint8Array(maxBytes))]));
  assert.equal(uploads.length, 0);
});
test('shared submission cache avoids duplicate source uploads across logical entries', async () => {
  const raw = makeFile(), uploadCache = new Map();
  const results = await Promise.all([1, 2].map(() => uploadArtworkWithOriginal({ selection: selectOriginalArtwork(raw), sessionId: 'same', maxBytes, uploadCache })));
  assert.equal(uploads.length, 1); assert.equal(results[0].url, results[1].url);
});
function slotHarness(initial = makeFile()) {
  let selection = selectOriginalArtwork(initial), revision = 0;
  const props = () => ({ side: 'front', source: selection?.source ?? null, file: selection?.file ?? null, url: selection ? 'blob:preview' : null, active: true,
    onChoose() {}, onDrop() {}, onPosition() {}, onRemove() { selection = null; revision++; refresh(); },
    onBeginProcessing(source) { return selection?.source === source ? ++revision : null; },
    onBackgroundRemoved(file, source, version, method) { if (selection?.source !== source || revision !== version) return false; selection = applyArtworkResult(selection, source, file, method); refresh(); return true; },
  });
  let refresh;
  function Harness() {
    const [, setVersion] = React.useState(0);
    refresh = () => setVersion(version => version + 1);
    return React.createElement(ArtworkUploadSlot, props());
  }
  const mounted = render(React.createElement(Harness));
  return { get selection() { return selection; }, replace(file) { revision++; selection = selectOriginalArtwork(file); refresh(); }, mounted, props, Harness };
}
const smart = () => screen.getByRole('button', { name: 'Smart background removal for front artwork' });
const ai = () => screen.getByRole('button', { name: 'Use free AI background remover on front artwork' });
test('studio repeated processing and remount keep using raw source and cache methods correctly', async () => {
  const raw = makeFile(), harness = slotHarness(raw);
  await act(async () => { fireEvent.click(smart()); });
  await act(async () => { fireEvent.click(ai()); });
  assert.deepEqual(processing, [raw, raw]); assert.equal(harness.selection.source.file, raw);
  await act(async () => { fireEvent.click(smart()); }); assert.equal(processing.length, 2);
  harness.mounted.unmount();
  render(React.createElement(harness.Harness));
  await act(async () => { fireEvent.click(ai()); }); assert.equal(processing[2], raw);
});
test('studio replacement/clear while removal is pending cannot resurrect old artwork or progress', async () => {
  const pending = deferred(); remove = () => pending.promise;
  const harness = slotHarness(), replacement = makeFile('replacement.png');
  await act(async () => { fireEvent.click(smart()); });
  assert.equal(screen.getByRole('button', { name: 'Replace' }).disabled, false);
  await act(async () => { harness.replace(replacement); pending.resolve({ blob: new Blob(['stale']), method: 'ai' }); });
  assert.equal(harness.selection.file, replacement); assert.equal(screen.queryByRole('progressbar'), null);
  const cleared = deferred(); remove = () => cleared.promise;
  await act(async () => { fireEvent.click(smart()); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove' })); cleared.resolve({ blob: new Blob(['stale']), method: 'ai' }); });
  assert.equal(harness.selection, null); assert.ok(screen.getByRole('button', { name: 'Upload front artwork' }));
});
test('studio failed second processing restores the original and removes processing metadata', async () => {
  const raw = makeFile(), harness = slotHarness(raw);
  await act(async () => { fireEvent.click(smart()); }); assert.notEqual(harness.selection.file, raw);
  remove = async () => { throw new Error('Synthetic removal failure'); };
  await act(async () => { fireEvent.click(ai()); });
  assert.equal(harness.selection.file, raw); assert.equal(harness.selection.backgroundRemovalMethod, undefined);
  assert.ok(screen.getByText('Synthetic removal failure'));
});
test('studio superseded processing failure clears stale local busy state without reverting newer artwork', async () => {
  const gate = deferred(); remove = () => gate.promise;
  const harness = slotHarness();
  await act(async () => { fireEvent.click(smart()); });
  const current = harness.props();
  const newerRequest = current.onBeginProcessing(current.source);
  const newerResult = makeFile('newer-result.png', 'newer', 'image/png');
  await act(async () => { current.onBackgroundRemoved(newerResult, current.source, newerRequest, 'ai'); gate.reject(new Error('Superseded failure')); });
  assert.equal(harness.selection.file, newerResult); assert.equal(harness.selection.backgroundRemovalMethod, 'ai');
  assert.equal(screen.queryByRole('progressbar'), null); assert.equal(smart().disabled, false);
});
async function mountQuote(file = makeFile()) {
  const mounted = render(React.createElement(QuoteForm));
  await act(async () => {});
  fireEvent.change(screen.getByLabelText('Print side'), { target: { value: 'small_front_only' } });
  fireEvent.change(mounted.container.querySelector('input[type=file]'), { target: { files: [file] } });
  return mounted;
}
async function submitQuote() { await act(async () => { fireEvent.submit(screen.getByRole('form', { name: 'Request a quote' })); }); }
test('QuoteForm submits one linked raw + processed pair and retries processing from raw', async () => {
  const raw = makeFile(); await mountQuote(raw); await submitQuote();
  assert.equal(submitted.length, 1); let attachments = JSON.parse(submitted[0].get('attachments'));
  assert.equal(attachments.length, 1); assert.notEqual(attachments[0].originalUrl, attachments[0].url);
  assert.equal(attachments[0].originalFilename, raw.name); assert.equal(attachments[0].backgroundRemovalMethod, 'solid-color');
  assert.equal(submitted[0].get('emailUploadedAttachments'), 'true'); assert.equal(submitted[0].getAll('files').length, 0);
  await submitQuote(); assert.deepEqual(processing, [raw, raw]);
});
test('QuoteForm removal failure saves raw once with no false transparent provenance', async () => {
  const raw = makeFile(); remove = async () => { throw new Error('Synthetic removal failure'); };
  await mountQuote(raw); await submitQuote();
  assert.equal(uploads.length, 1); assert.equal(uploads[0].file, raw);
  const [attachment] = JSON.parse(submitted[0].get('attachments'));
  assert.equal(attachment.originalUrl, attachment.url); assert.equal(Object.hasOwn(attachment, 'backgroundRemovalMethod'), false);
});
test('QuoteForm upload errors recover submitting state and allow a clean retry', async () => {
  await mountQuote(); failUpload = true; await submitQuote();
  assert.equal(submitted.length, 0); assert.equal(screen.getByRole('button', { name: 'Get my quote' }).disabled, false);
  assert.ok(screen.getByText('Synthetic upload failure'));
  failUpload = false; await submitQuote(); assert.equal(submitted.length, 1);
});
test('QuoteForm rejects oversized originals before processing or uploading', async () => {
  await mountQuote(makeFile('large.png', new Uint8Array(maxBytes + 1))); await submitQuote();
  assert.equal(processing.length, 0); assert.equal(uploads.length, 0); assert.equal(submitted.length, 0);
  assert.equal(screen.getByRole('button', { name: 'Get my quote' }).disabled, false);
  assert.match(screen.getByRole('status').textContent, /5MB/);
});
test('QuoteForm PDF stays an unprocessed retained original with one upload', async () => {
  const pdf = makeFile('generic-artwork.pdf', 'synthetic-pdf', 'application/pdf');
  await mountQuote(pdf); await submitQuote();
  assert.equal(processing.length, 0); assert.equal(uploads.length, 1);
  const [attachment] = JSON.parse(submitted[0].get('attachments'));
  assert.equal(attachment.url, attachment.originalUrl); assert.equal(attachment.contentType, 'application/pdf');
  assert.equal(attachment.backgroundRemovalMethod, undefined);
});
test('QuoteForm oversized generated output keeps raw and never uploads a fabricated transparent version', async () => {
  const raw = makeFile(); remove = async () => ({ blob: new Blob([new Uint8Array(maxBytes + 1)]), method: 'ai' });
  await mountQuote(raw); await submitQuote();
  assert.equal(uploads.length, 1); assert.equal(uploads[0].file, raw);
  const [attachment] = JSON.parse(submitted[0].get('attachments'));
  assert.equal(attachment.url, attachment.originalUrl); assert.equal(attachment.backgroundRemovalMethod, undefined);
});
test('QuoteForm checks combined source and derived bytes before any upload', async () => {
  const size = 4 * 1024 * 1024;
  remove = async () => ({ blob: new Blob([new Uint8Array(size)]), method: 'ai' });
  const mounted = await mountQuote(makeFile('front.jpg', new Uint8Array(size)));
  fireEvent.change(screen.getByLabelText('Print side'), { target: { value: 'front_back' } });
  fireEvent.change(mounted.container.querySelectorAll('input[type=file]')[1], { target: { files: [makeFile('back.jpg', new Uint8Array(size))] } });
  await submitQuote();
  assert.equal(processing.length, 2); assert.equal(uploads.length, 0); assert.equal(submitted.length, 0);
  assert.match(screen.getByRole('status').textContent, /15MB/);
});
test('QuoteForm same-tick duplicate submission runs one upload batch', async () => {
  const gate = deferred(); remove = () => gate.promise;
  await mountQuote();
  await act(async () => {
    const form = screen.getByRole('form', { name: 'Request a quote' });
    fireEvent.submit(form); fireEvent.submit(form);
  });
  assert.equal(processing.length, 1);
  await act(async () => { gate.resolve({ blob: new Blob(['processed']), method: 'already-transparent' }); });
  await waitFor(() => assert.equal(submitted.length, 1));
  assert.equal(uploads.length, 2);
  assert.equal(JSON.parse(submitted[0].get('attachments'))[0].backgroundRemovalMethod, 'already-transparent');
});
