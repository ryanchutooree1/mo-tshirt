// Isolated uploader UI with synthetic files and fetch only; no real upload service.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://site.test/' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'getComputedStyle']) global[key] = dom.window[key];
Object.defineProperty(global, 'navigator', { configurable: true, value: dom.window.navigator });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, act, cleanup, waitFor } = require('@testing-library/react');
const exportsObject = {};
let calls = [], handler;
const oldHash = 'a'.repeat(64);
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/admin/print-jobs/ProductionArtworkUpload.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, {
 exports: exportsObject,
 require: name => name === './tanvi-workflow.module.css' ? { __esModule: true, default: {} } : name === 'lucide-react' ? { Upload: () => null } : require(name),
 crypto: { randomUUID: (() => { let count = 0; return () => `request-${++count}-synthetic`; })() },
 FormData, File, console,
 fetch: async (url, init) => { const call = { url, form: init.body }; calls.push(call); return handler(call); }
});
const Component = exportsObject.default;
const makeFile = () => new File(['synthetic-image'], 'client-logo.png', { type: 'image/png' });
const good = (call, patch = {}) => ({ ok: true, status: 200, json: async () => ({ ok: true, quoteId: 'q', requestId: call.form.get('requestId'), uploadId: 'uploaded-source', fileKey: 'file-' + 'b'.repeat(24), version: 1, packetFingerprint: 'c'.repeat(64), ...patch }) });
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function mount(overrides = {}) {
 const uploaded = [], busy = [];
 const props = { quoteId: 'q', expectedVersion: 0, packetFingerprint: oldHash, disabled: false, onUploaded: () => uploaded.push(true), onBusyChange: value => busy.push(value), ...overrides };
 const view = render(React.createElement(Component, props));
 return { props, view, uploaded, busy };
}
function select(file = makeFile()) { fireEvent.change(screen.getByLabelText(/Original print file/), { target: { files: [file] } }); }
function confirm() { fireEvent.click(screen.getByRole('checkbox', { name: /This is print artwork/ })); }
const submit = () => screen.getByRole('button', { name: /Add print file|Retry same upload|Adding print file/ });
test.beforeEach(() => { calls = []; handler = call => good(call); });
test.afterEach(cleanup);

test('file selection alone never uploads; explicit print-artwork acknowledgment and Add are required', async () => {
 const s = mount(); select(); assert.equal(calls.length, 0); assert.equal(submit().disabled, true); confirm();
 await act(async () => fireEvent.click(submit()));
 assert.equal(calls.length, 1); assert.equal(calls[0].url, '/api/admin/print-jobs/q/artwork'); assert.equal(calls[0].form.get('role'), 'print-artwork'); assert.equal(calls[0].form.get('expectedVersion'), '0'); assert.equal(calls[0].form.get('packetFingerprint'), oldHash);
 assert.equal(await calls[0].form.get('file').text(), 'synthetic-image'); assert.equal(s.uploaded.length, 1); assert.equal(screen.queryByRole('checkbox'), null); assert.equal(screen.getByLabelText(/Original print file/).value, ''); assert.deepEqual(s.busy, [true, false]);
});
test('same-tick repeated clicks use one operation and busy guard', async () => {
 const gate = deferred(); handler = call => gate.promise.then(() => good(call)); const s = mount(); select(); confirm();
 await act(async () => { const button = submit(); fireEvent.click(button); fireEvent.click(button); });
 assert.equal(calls.length, 1); assert.equal(submit().disabled, true);
 await act(async () => gate.resolve()); assert.equal(s.uploaded.length, 1);
});
test('plain job keeps same approved packet fingerprint but verified success still reloads', async () => {
 handler = call => good(call, { packetFingerprint: oldHash }); const s = mount(); select(); confirm(); await act(async () => fireEvent.click(submit())); assert.equal(s.uploaded.length, 1);
});
test('uncertain failure retains exact file and operation ID on explicit retry', async () => {
 handler = () => ({ ok: false, status: 500, json: async () => ({ error: 'Synthetic uncertain save' }) });
 const s = mount(); select(); confirm(); await act(async () => fireEvent.click(submit()));
 assert.match(screen.getByRole('alert').textContent, /uncertain/); assert.equal(screen.getByLabelText(/Original print file/).disabled, true); assert.equal(s.uploaded.length, 0);
 const firstId = calls[0].form.get('requestId'); handler = call => good(call);
 await act(async () => fireEvent.click(submit())); assert.equal(calls.length, 2); assert.equal(calls[1].form.get('requestId'), firstId); assert.equal(s.uploaded.length, 1);
});
test('malformed success, wrong quote/request or unadvanced version never invokes completion', async () => {
 for (const patch of [{ ok: false }, { quoteId: 'other' }, { requestId: 'wrong' }, { version: 0 }, { uploadId: '' }, { fileKey: 'bad' }, { packetFingerprint: 'bad' }]) {
  handler = call => good(call, patch); const s = mount(); select(); confirm(); await act(async () => fireEvent.click(submit())); assert.equal(s.uploaded.length, 0); assert.match(screen.getByRole('alert').textContent, /could not be verified/); cleanup();
 }
});
test('late response after switching jobs or unmount never refreshes the new job', async () => {
 for (const unmount of [false, true]) {
  const gate = deferred(); handler = call => gate.promise.then(() => good(call)); const s = mount(); select(); confirm(); await act(async () => fireEvent.click(submit()));
  if (unmount) s.view.unmount(); else s.view.rerender(React.createElement(Component, { ...s.props, quoteId: 'another-job' }));
  await act(async () => gate.resolve()); assert.equal(s.uploaded.length, 0); cleanup();
 }
});
test('unsupported contents rejection restores picker for a corrected file', async () => {
 handler = () => ({ ok: false, status: 415, json: async () => ({ error: 'Export a valid file' }) }); const s = mount(); select(); confirm(); await act(async () => fireEvent.click(submit()));
 assert.equal(screen.getByLabelText(/Original print file/).disabled, false); select(new File(['valid'], 'corrected.png', { type: 'image/png' })); confirm(); handler = call => good(call); await act(async () => fireEvent.click(submit())); assert.notEqual(calls[0].form.get('requestId'), calls[1].form.get('requestId')); assert.equal(s.uploaded.length, 1);
});
test('disabled upload and oversize originals never contact the service', async () => {
 const s = mount({ disabled: true }); assert.equal(submit().disabled, true); assert.equal(screen.getByLabelText(/Original print file/).disabled, true); s.view.unmount();
 mount(); select(new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })); confirm(); await act(async () => fireEvent.click(submit())); assert.equal(calls.length, 0); await waitFor(() => assert.match(screen.getByRole('alert').textContent, /4MB/));
});
