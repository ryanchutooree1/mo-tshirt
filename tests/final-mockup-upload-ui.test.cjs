// Synthetic component/upload tests only: no production reads, writes or network calls.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "..");
const requireRepo = createRequire(root + "/package.json");
const React = requireRepo("react");
const ts = requireRepo("typescript");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3007/admin/quotation-approval", pretendToBeVisual: true });
for (const key of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "MutationObserver", "getComputedStyle", "File", "FormData"]) global[key] = dom.window[key];
Object.defineProperty(global, "navigator", { configurable: true, value: dom.window.navigator });
global.IS_REACT_ACT_ENVIRONMENT = true;

const { render, screen, fireEvent, act, cleanup, waitFor } = requireRepo("@testing-library/react");
let fetchCalls = [], fetchImpl, uploaded, uuidNumber = 0;
const code = ts.transpileModule(
  fs.readFileSync(root + "/src/components/admin/print-jobs/FinalMockupUpload.tsx", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }
).outputText;
const mod = { exports: {} };
vm.runInNewContext(code, {
  module: mod,
  exports: mod.exports,
  console,
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  File: dom.window.File,
  FormData: dom.window.FormData,
  Error,
  URL,
  crypto: { randomUUID: () => `synthetic-request-${++uuidNumber}` },
  AbortController,
  fetch: async (...args) => { fetchCalls.push(args); return fetchImpl(...args); },
  require(name) {
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    return requireRepo(name);
  },
}, { filename: "FinalMockupUpload.test.js" });
const FinalMockupUpload = mod.exports.default;

const successfulResponse = (quoteId = "quote-one", requestId = "synthetic-request-1") => ({
  ok: true,
  async json() { return { ok: true, quoteId, requestId }; },
});
const makeFile = (name = "final-mockup.png", bytes = "synthetic-image", type = "image/png") => new File([bytes], name, { type });
const mount = (props = {}) => render(React.createElement(FinalMockupUpload, {
  quoteId: "quote-one",
  mockups: [],
  onUploaded: () => { uploaded += 1; },
  ...props,
}));
const picker = () => screen.getByLabelText(/final mockup file/i);

test.beforeEach(() => {
  cleanup();
  fetchCalls = [];
  uploaded = 0;
  uuidNumber = 0;
  fetchImpl = async () => successfulResponse();
});
test.after(() => { cleanup(); dom.window.close(); });

test("front and back are explicit choices and an existing mockup changes the action label", () => {
  mount({ mockups: [{ url: "/front.png", name: "Front", side: "front", kind: "mockup", adminUploaded: true }] });
  const front = screen.getByRole("button", { name: "Front" });
  const back = screen.getByRole("button", { name: "Back" });
  assert.equal(front.getAttribute("aria-pressed"), "true");
  assert.equal(back.getAttribute("aria-pressed"), "false");
  fireEvent.click(back);
  assert.equal(front.getAttribute("aria-pressed"), "false");
  assert.equal(back.getAttribute("aria-pressed"), "true");
  assert.ok(screen.getByRole("button", { name: "Replace / add" }));
  assert.equal(picker().getAttribute("aria-label"), "Back final mockup file");
});

test("a late response from the previous order cannot update the newly opened order", async () => {
  let release;
  fetchImpl = () => new Promise(resolve => { release = resolve; });
  const view = mount();
  const file = makeFile();
  await act(async () => { fireEvent.change(picker(), { target: { files: [file] } }); });
  assert.equal(fetchCalls.length, 1);
  view.rerender(React.createElement(FinalMockupUpload, {
    quoteId: "quote-two",
    mockups: [],
    onUploaded: () => { uploaded += 1; },
  }));
  await act(async () => { release(successfulResponse("quote-one", "synthetic-request-1")); });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(uploaded, 0);
  assert.equal(Boolean(screen.queryByRole("status")), false);
  assert.equal(screen.getByRole("button", { name: "Upload final mockup" }).disabled, false);
});

test("valid back image posts the expected multipart fields and reports success", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  const file = makeFile("approved-back.webp", "RIFFsyntheticWEBP", "image/webp");
  await act(async () => { fireEvent.change(picker(), { target: { files: [file] } }); });
  await waitFor(() => assert.equal(uploaded, 1));
  assert.equal(fetchCalls.length, 1);
  const [url, options] = fetchCalls[0];
  assert.equal(url, "/api/admin/print-jobs/quote-one/mockup");
  assert.equal(options.method, "POST");
  assert.equal(options.body.get("file"), file);
  assert.equal(options.body.get("side"), "back");
  assert.equal(options.body.get("requestId"), "synthetic-request-1");
  assert.match(screen.getByRole("status").textContent, /Back mockup uploaded/);
});

test("oversized and unsupported files are rejected before fetch", async () => {
  mount();
  const oversized = makeFile("too-large.png", new Uint8Array(4 * 1024 * 1024 + 1));
  fireEvent.change(picker(), { target: { files: [oversized] } });
  assert.match(screen.getByRole("alert").textContent, /no larger than 4MB/);
  const wrongType = makeFile("mockup.gif", "GIF89a", "image/gif");
  fireEvent.change(picker(), { target: { files: [wrongType] } });
  assert.match(screen.getByRole("alert").textContent, /PNG, JPG or WEBP/);
  assert.equal(fetchCalls.length, 0);
  assert.equal(uploaded, 0);
});

test("uncertain failure keeps the same attempt and retry succeeds without choosing again", async () => {
  let call = 0;
  fetchImpl = async (_url, options) => {
    call += 1;
    if (call === 1) return { ok: false, status: 500, async json() { return { error: "Synthetic uncertain upload" }; } };
    return successfulResponse("quote-one", options.body.get("requestId"));
  };
  mount();
  const file = makeFile();
  await act(async () => { fireEvent.change(picker(), { target: { files: [file] } }); });
  await waitFor(() => assert.match(screen.getByRole("alert").textContent, /Synthetic uncertain upload/));
  const retry = screen.getByRole("button", { name: "Retry upload" });
  await act(async () => { fireEvent.click(retry); });
  await waitFor(() => assert.equal(uploaded, 1));
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0][1].body.get("file"), file);
  assert.equal(fetchCalls[1][1].body.get("file"), file);
  assert.equal(fetchCalls[0][1].body.get("requestId"), fetchCalls[1][1].body.get("requestId"));
  assert.match(screen.getByRole("status").textContent, /Front mockup uploaded/);
});
