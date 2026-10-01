// Isolated print-desk integration tests. Every quote, order, enquiry and response
// is synthetic. The strict fetch double cannot call a production service.
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "..");
const requireRepo = createRequire(root + "/package.json");
const ts = requireRepo("typescript");
const React = requireRepo("react");
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3007/admin/quotation-approval",
  pretendToBeVisual: true,
});
for (const key of ["window", "document", "HTMLElement", "HTMLAnchorElement", "HTMLInputElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "MutationObserver", "getComputedStyle"]) global[key] = dom.window[key];
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
window.scrollTo = () => {};
HTMLElement.prototype.scrollIntoView = function () {};
const { render, screen, within, waitFor, cleanup, fireEvent, act } = requireRepo("@testing-library/react");

const compiled = new Map();
function loadDomain(file) {
  const filename = path.resolve(root, "src/lib", file);
  if (compiled.has(filename)) return compiled.get(filename);
  const moduleObj = { exports: {} };
  const customRequire = (name) => name.startsWith("./")
    ? loadDomain(name.slice(2).replace(/\.ts$/, "") + ".ts")
    : requireRepo(name);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module: moduleObj, exports: moduleObj.exports, require: customRequire, URL, Intl, Date, Error, console }, { filename });
  compiled.set(filename, moduleObj.exports);
  return moduleObj.exports;
}
const domain = loadDomain("print-job-workflow.ts");
const inbox = loadDomain("quotation-inbox.ts");
const API = "/api/admin/print-jobs";
const NOW = Date.parse("2026-10-01T10:00:00Z");
const ACTOR = { userId: "synthetic-owner", displayName: "Synthetic owner", email: "owner@synthetic.example.test" };
let quoteRecords, orderRecords, enquiries, requests, confirmations, confirmation;
let failNextGet, failNextPatch, loseNextPatchResponse, deferredPatch, clipFailure, clipboardWrites, queueFlags, warnings;
function workflow(stage, extra = {}) {
  return { stage, reason: "Synthetic team context", nextAction: "", followUpDate: "", closureKind: stage === "declined" ? "shop_declined" : null, updatedAtIso: new Date(NOW).toISOString(), updatedBy: ACTOR, version: 1, ...extra };
}
function quote(id, name, stage, extra = {}) {
  return { id, data: { name, source: "form", status: "review", createdAt: NOW, email: `${id}@synthetic.example.test`, phone: "0000000000", quote: { documentNumber: `Q-${id}`, currency: "Rs", total: 1200, lines: [{ description: "Cotton T-shirt", quantity: 12, unitPrice: 100, color: "Blue", size: "L" }] }, printJobWorkflow: workflow(stage), ...extra } };
}
function reset() {
  quoteRecords = [
    quote("alpha", "Alpha New", "new", { createdAt: NOW - 8000, printJobWorkflow: workflow("new", { reason: "" }) }),
    quote("bravo", "Bravo Details", "needs_details", { source: "WhatsApp", createdAt: NOW - 7000 }),
    quote("charlie", "Charlie Waiting", "awaiting_client", { source: "Design studio", createdAt: NOW - 6000 }),
    quote("delta", "Delta Confirmed", "confirmed", { source: "Team", createdAt: NOW - 5000, orderTransactionId: "order-delta", quote: { documentNumber: "INV-DELTA", documentType: "invoice", currency: "Rs", total: 2400, paymentStatus: "Paid", lines: [{ description: "Cotton polo", quantity: 12, unitPrice: 200, color: "Navy", size: "XL" }] }, paymentReceipt: { documentNumber: "AUTO-DELTA" }, attachments: [{ filename: "Synthetic artwork.pdf", url: "https://synthetic.example.test/artwork.pdf" }], message: "Synthetic conference uniforms", delivery: "Collection", deadline: "2026-12-20" }),
    quote("echo", "Echo Production", "production", { source: "Team", createdAt: NOW - 4000, attachments: [{ filename: "Synthetic front mockup.png", role: "final-mockup", side: "front", contentType: "image/png", url: "https://synthetic.example.test/front-mockup.png" }, { filename: "Synthetic back mockup.png", role: "final-mockup", side: "back", contentType: "image/png", url: "https://synthetic.example.test/back-mockup.png" }, { filename: "Synthetic logo.png", role: "print-artwork", side: "front", contentType: "image/png", url: "https://synthetic.example.test/synthetic-logo.png" }] }),
    quote("foxtrot", "Foxtrot Ready", "ready", { source: "Email", createdAt: NOW - 3000 }),
    quote("golf", "Golf Completed", "completed", { source: "Team", createdAt: NOW - 2000 }),
    quote("hotel", "Hotel Declined", "declined", { source: "Email", createdAt: NOW - 1000 }),
  ];
  orderRecords = [{ id: "order-delta", data: { quoteId: "delta", customerName: "Delta Confirmed", invoiceNumber: "ORDER-DELTA", amount: 2400, status: "Pending", products: [{ product: "Cotton polo", quantity: 12, unitPrice: 200, color: "Navy", size: "XL" }] } }];
  enquiries = [];
  requests = []; confirmations = []; confirmation = true;
  failNextGet = null; failNextPatch = null; loseNextPatchResponse = false; deferredPatch = null;
  clipFailure = false; clipboardWrites = [];
  queueFlags = { canQuotes: true, canOrders: true, canInbox: false };
  warnings = [];
  window.history.replaceState({}, "", "/admin/quotation-approval");
}
function jobs() { return [...domain.buildPrintJobs(quoteRecords, orderRecords, NOW), ...domain.buildPendingEmailJobs(enquiries, quoteRecords.map((entry) => entry.id), NOW)]; }
function snapshot() { return { items: jobs(), warnings, ...queueFlags, updatedAt: NOW, enquiries }; }
window.confirm = (message) => { confirmations.push(message); return confirmation; };
Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { if (clipFailure) throw new Error("Synthetic clipboard failure"); clipboardWrites.push(text); } } });
global.fetch = window.fetch = async (url, options = {}) => {
  const method = options.method || "GET";
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ url, method, body });
  if (url === API && method === "GET") {
    if (failNextGet) { const failure = failNextGet; failNextGet = null; return Response.json({ error: "Synthetic job list interruption" }, { status: failure }); }
    return Response.json(snapshot());
  }
  if (url === "/api/admin/inbox/intake" && method === "POST") {
    assert.deepEqual(body, { action: "sync" });
    return Response.json({ ok: true });
  }
  assert.equal(method, "PATCH", "No unapproved write or customer message may leave the test");
  assert.match(url, /^\/api\/admin\/print-jobs\/[^/]+$/, "The test must never access an unexpected endpoint");
  if (deferredPatch) { const gate = deferredPatch; deferredPatch = null; await gate.promise; }
  if (failNextPatch) {
    const failure = failNextPatch; failNextPatch = null;
    if (failure === "network") throw new Error("Synthetic network failure");
    return Response.json({ error: failure === 409 ? "Someone updated this job. Reload it before saving your changes." : "Synthetic stage save interruption" }, { status: failure });
  }
  const id = decodeURIComponent(url.slice(API.length + 1));
  const target = body.targetType === "intake" ? enquiries.find((entry) => entry.id === id) : quoteRecords.find((entry) => entry.id === id)?.data;
  assert.ok(target, "Updates must target a known synthetic job");
  const linkedOrder = orderRecords.find((entry) => entry.id === target.orderTransactionId)?.data;
  try {
    const result = domain.buildPrintJobWorkflowUpdate(body.targetType === "intake" ? { ...target, intake: target } : target, domain.validatePrintJobUpdate(body), ACTOR, new Date(NOW + 1000).toISOString(), linkedOrder);
    if (!result.replayed) { target.printJobWorkflow = result.workflow; target.printJobWorkflowHistory = [...(target.printJobWorkflowHistory || []), result.historyEntry]; }
    if (loseNextPatchResponse) { loseNextPatchResponse = false; return Promise.reject(new Error("Synthetic response lost after persistence")); }
    return Response.json({ ok: true, workflow: result.workflow, replayed: result.replayed });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
};
function MockEditor({ kind, ...props }) {
  return React.createElement("section", { "aria-label": `Synthetic ${kind} editor`, "data-record-id": props.initialQuoteId || props.initialOrderId || "", "data-embedded": String(Boolean(props.embedded)) },
    React.createElement("button", { onClick: () => props.onDirtyChange(true) }, "Make synthetic document dirty"),
    React.createElement("button", { onClick: () => props.onDirtyChange(false) }, "Mark synthetic document saved"));
}
const customRequire = (name) => {
  if (name === "next/dynamic") return { __esModule: true, default: (loader) => {
    if (String(loader).includes("NewQuotationDraft")) return ({ onCreated }) => React.createElement("section", { "aria-label": "Synthetic new quotation creation" }, React.createElement("button", { onClick: () => onCreated("synthetic-created-quote") }, "Create synthetic blank quotation"));
    assert.equal(String(loader).includes("QuoteEditorPage"), false, "The legacy quote editor must never mount in the simplified workflow");
    const kind = "order";
    return (props) => React.createElement(MockEditor, { ...props, kind });
  } };
  if (name === "./TanviHandoffPanel") return { __esModule: true,
    default: ({ quoteId, refreshKey, onDirtyChange, onBusyChange, onUpdated, onOpenSettings }) => React.createElement("section", { "aria-label": "Synthetic Tanvi workflow", "data-quote-id": quoteId, "data-refresh-key": refreshKey },
      React.createElement("button", { onClick: () => onDirtyChange(true) }, "Make synthetic handoff dirty"),
      React.createElement("button", { onClick: () => onDirtyChange(false) }, "Mark synthetic handoff saved"),
      React.createElement("button", { onClick: () => onBusyChange(true) }, "Start synthetic handoff action"),
      React.createElement("button", { onClick: () => onBusyChange(false) }, "Finish synthetic handoff action"),
      React.createElement("button", { onClick: onUpdated }, "Refresh synthetic handoff"),
      React.createElement("button", { onClick: onOpenSettings }, "Open synthetic test settings")),
    HandoffSettingsPanel: ({ onClose, onSaved }) => React.createElement("section", { "aria-label": "Synthetic handoff settings" },
      React.createElement("button", { onClick: onClose }, "Cancel synthetic settings"),
      React.createElement("button", { onClick: onSaved }, "Save synthetic settings")),
  };
  if (name === "@/admin/AdminThemeContext") return { useAdminTheme: () => ({ theme: "dark" }) };
  if (name === "@/lib/print-job-workflow") return domain;
  if (name === "@/lib/quotation-inbox") return inbox;
  if (name === "@/components/admin/EmailEnquiryDetails") return { __esModule: true, default: ({ intake, onDirtyChange, onOpenQuote }) => React.createElement("section", { "aria-label": "Synthetic enquiry editor", "data-status": intake.status, "data-quote-id": intake.quoteId || "" }, intake.subject, React.createElement("button", { onClick: () => onDirtyChange(true) }, "Make synthetic enquiry dirty"), React.createElement("button", { onClick: () => onDirtyChange(false) }, "Mark synthetic enquiry saved"), React.createElement("button", { onClick: () => { onDirtyChange(false); onOpenQuote("synthetic-converted-quote"); } }, "Open synthetic converted quote")) };
  if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  return requireRepo(name);
};
const componentModule = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(root + "/src/components/admin/print-jobs/PrintJobWorkspace.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, {
  module: componentModule, exports: componentModule.exports, require: customRequire, console,
  window, document, navigator, crypto: require("node:crypto").webcrypto, fetch: global.fetch,
  AbortController, AbortSignal, HTMLElement, HTMLAnchorElement, Element, URL, URLSearchParams,
  requestAnimationFrame, setTimeout, clearTimeout, setInterval, clearInterval,
}, { filename: "PrintJobWorkspace.test.js" });
const App = componentModule.exports.default;
const patches = () => requests.filter((request) => request.method === "PATCH");
const list = () => screen.getByRole("complementary", { name: "Client design list" });
const rows = () => within(list()).queryAllByRole("button", { name: /^Open job for / });
const rowNames = () => rows().map((row) => row.getAttribute("aria-label").replace(/^Open job for /, "").split(",")[0]);
const overview = () => screen.getByLabelText(/^Job overview for /);
const dialog = () => screen.getByRole("dialog", { name: "What happens next?" });
const form = () => screen.getByRole("form", { name: "Update job stage" });
const user = {
  click: async (element) => { await act(async () => { element.focus(); fireEvent.click(element); await new Promise((resolve) => setTimeout(resolve, 8)); }); },
  fill: async (element, value) => { await act(async () => { fireEvent.change(element, { target: { value } }); }); },
  key: async (element, key, options = {}) => { await act(async () => { fireEvent.keyDown(element, { key, ...options }); }); },
};
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
async function mount(props = {}) { const rendered = render(React.createElement(App, props)); await waitFor(() => assert.equal(Boolean(screen.queryByText("Loading client designs…")), false)); return rendered; }
async function status(value) { await user.fill(screen.getByRole("combobox", { name: "Job status" }), value); }
async function openJob(name = "Alpha New") { const row = screen.getByRole("button", { name: new RegExp(`^Open job for ${name},`) }); await user.click(row); return row; }
async function startUpdate(name = "Alpha New", action = "Change job status") { await openJob(name); const button = within(overview()).getByRole("button", { name: action, exact: true }); await user.click(button); return button; }
async function submitStage() { await act(async () => { fireEvent.submit(form()); }); }
async function saved() { await waitFor(() => assert.equal(Boolean(screen.queryByRole("dialog")), false)); await act(async () => { await new Promise((resolve) => setTimeout(resolve, 8)); }); }
async function popTo(state) { await act(async () => { window.history.replaceState(state, "", window.location.href); window.dispatchEvent(new window.PopStateEvent("popstate", { state })); }); }
let failures = 0, passed = 0;
async function test(name, fn) {
  reset();
  try { await fn(); passed++; console.log("PASS " + name); }
  catch (error) { failures++; console.error("FAIL " + name + "\n" + error.stack); }
  finally { cleanup(); await act(async () => { await new Promise((resolve) => setTimeout(resolve, 12)); }); }
}

const handoff = () => screen.getByRole("region", { name: "Synthetic Tanvi workflow" });
function addEnquiry() { enquiries = [{ id: "synthetic-intake", subject: "Synthetic enquiry", status: "review", email: "pending@synthetic.example.test", draft: { name: "Indigo Enquiry", phone: "", lines: [] }, summary: "Sizes missing", lastReplyAt: new Date(NOW).toISOString(), updatedAtIso: new Date(NOW).toISOString() }]; }

(async () => {
  await test("one status dropdown replaces category tabs and defaults to active clients", async () => {
    await mount(); assert.equal(rows().length, 6);
    assert.equal(Boolean(screen.queryByRole("navigation", { name: "Job categories" })), false);
    assert.equal(screen.getAllByRole("combobox").length, 1);
    assert.equal(screen.getByRole("combobox", { name: "Job status" }).value, "active");
    assert.ok(screen.getByRole("heading", { name: "Pick the client’s design" }));
    for (const stage of domain.PRINT_JOB_STAGES) { await status(stage.id); assert.equal(rows().length, 1); assert.ok(rows()[0].getAttribute("aria-label").endsWith(stage.label)); }
    await status("all"); assert.equal(rows().length, 8);
    await status("attention"); assert.equal(rows().length, 4);
    assert.ok(rowNames().every((name) => !/Completed|Declined/.test(name))); assert.equal(patches().length, 0);
  });

  await test("search filters client, contact, garment and document while keeping the selected job open", async () => {
    await mount(); await openJob("Echo Production");
    const search = screen.getByRole("textbox", { name: "Search jobs" });
    for (const term of ["Delta", "delta@synthetic.example.test", "Cotton polo", "INV-DELTA", "AUTO-DELTA", "ORDER-DELTA"]) {
      await user.fill(search, term); assert.deepEqual(rowNames(), ["Delta Confirmed"]);
      assert.equal(handoff().dataset.quoteId, "echo");
    }
    await user.fill(search, "No-such-client"); assert.ok(screen.getByRole("heading", { name: "No matching clients" }));
    await user.fill(search, ""); await status("completed"); assert.deepEqual(rowNames(), ["Golf Completed"]);
    assert.equal(handoff().dataset.quoteId, "echo");
  });

  await test("client list displays saved mockups and print artwork; selected design shows front and back", async () => {
    await mount(); const row = screen.getByRole("button", { name: "Open job for Echo Production, In production" });
    assert.equal(within(row).getByRole("img", { name: "Finished product · Front" }).getAttribute("src"), "https://synthetic.example.test/front-mockup.png");
    assert.ok(within(row).getByRole("img", { name: "Finished product · Back" }));
    assert.ok(within(row).getByRole("img", { name: "Print artwork · Front" }));
    assert.ok(within(row).getByText("Echo Production", { exact: true }));
    await openJob("Echo Production"); assert.equal(rows().length, 6, "Opening a client retains the left list");
    assert.ok(within(overview()).getByRole("heading", { name: "Finished product" }));
    assert.ok(within(overview()).getByRole("heading", { name: "Logos & print artwork" }));
    assert.equal(within(overview()).getAllByRole("img").length, 3);
    assert.equal(handoff().dataset.quoteId, "echo");
    assert.equal(Boolean(screen.queryByRole("region", { name: "Synthetic quote editor" })), false);
    assert.ok(document.activeElement === overview()); assert.equal(patches().length, 0);
  });

  await test("missing, non-image and failed image previews remain readable and recover after refresh", async () => {
    await mount(); await openJob();
    assert.ok(within(overview()).getByText("No finished-product mockup is saved for this request."));
    assert.ok(within(overview()).getByText("No print artwork attached yet."));
    await openJob("Delta Confirmed");
    assert.ok(within(overview()).getByText(/supplied files have no image preview/));
    const file = within(overview()).getByRole("link", { name: "Synthetic artwork.pdf", hidden: true });
    assert.equal(file.href, "https://synthetic.example.test/artwork.pdf"); assert.match(file.rel, /noopener/);
    await openJob("Echo Production");
    await act(async () => { fireEvent.error(within(overview()).getByRole("img", { name: "Finished product · Front" })); });
    assert.ok(within(overview()).getByText("Preview unavailable"));
    quoteRecords.find((entry) => entry.id === "echo").data.attachments[0].url = "https://synthetic.example.test/revised-front.png";
    await act(async () => { window.dispatchEvent(new Event("email-intake-updated")); });
    await waitFor(() => assert.equal(within(overview()).getByRole("img", { name: "Finished product · Front" }).getAttribute("src"), "https://synthetic.example.test/revised-front.png"));
  });

  await test("dirty handoff entries protect client changes, client-list close and browser navigation", async () => {
    await mount(); await openJob(); await user.click(within(handoff()).getByRole("button", { name: "Make synthetic handoff dirty" }));
    confirmation = false; await openJob("Echo Production"); assert.equal(handoff().dataset.quoteId, "alpha");
    assert.match(confirmations.at(-1), /Discard your unsaved entries and open another job/);
    await user.click(within(overview()).getByRole("button", { name: "Client list" })); assert.equal(handoff().dataset.quoteId, "alpha");
    await popTo({}); assert.equal(handoff().dataset.quoteId, "alpha"); assert.match(confirmations.at(-1), /Discard your unsaved changes/);
    const unloading = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unloading); assert.equal(unloading.defaultPrevented, true);
    assert.equal(within(overview()).getByRole("button", { name: "Change job status" }).disabled, true);
    confirmation = true; await openJob("Echo Production"); assert.equal(handoff().dataset.quoteId, "echo");
  });

  await test("in-flight handoff prevents changing clients, new quotation, close and browser Back", async () => {
    await mount(); await openJob(); await user.click(within(handoff()).getByRole("button", { name: "Start synthetic handoff action" }));
    await openJob("Echo Production"); assert.equal(handoff().dataset.quoteId, "alpha");
    assert.match(screen.getByRole("status").textContent, /Wait for the current action/);
    assert.equal(screen.getByRole("button", { name: "New quotation" }).disabled, true);
    await user.click(within(overview()).getByRole("button", { name: "Client list" })); assert.equal(handoff().dataset.quoteId, "alpha");
    await popTo({}); assert.ok(screen.queryByRole("region", { name: "Synthetic Tanvi workflow" }), "Browser Back must retain an in-flight handoff");
    assert.equal(handoff().dataset.quoteId, "alpha");
    await user.click(within(handoff()).getByRole("button", { name: "Finish synthetic handoff action" }));
    await openJob("Echo Production"); assert.equal(handoff().dataset.quoteId, "echo");
  });

  await test("client-list close restores focus and switching clients retains a single history editor entry", async () => {
    await mount(); await openJob(); const length = window.history.length;
    const row = await openJob("Echo Production"); assert.equal(window.history.length, length);
    assert.equal(window.history.state.printDeskEditor.id, "echo");
    await user.click(within(overview()).getByRole("button", { name: "Client list" }));
    await waitFor(() => assert.ok(document.activeElement === row)); assert.ok(screen.getByRole("heading", { name: "Pick the client’s design" }));
  });

  await test("waiting status needs reason and saves only workflow without customer communications", async () => {
    await mount(); await startUpdate("Alpha New", "Waiting for client");
    await submitStage(); assert.equal(patches().length, 0); assert.ok(within(dialog()).getByRole("alert"));
    await user.fill(within(dialog()).getByLabelText(/What are we waiting for/), "  Artwork approval and sizes  ");
    await user.fill(within(dialog()).getByLabelText("Next action"), "Ask for final artwork");
    await user.fill(within(dialog()).getByLabelText("Follow-up date"), "2026-12-12");
    const before = JSON.stringify(quoteRecords[0].data.quote);
    await submitStage(); await saved();
    assert.equal(patches()[0].body.stage, "awaiting_client"); assert.equal(patches()[0].body.reason, "Artwork approval and sizes");
    assert.equal(patches()[0].body.followUpDate, "2026-12-12"); assert.equal(patches()[0].body.expectedVersion, 1);
    assert.equal(JSON.stringify(quoteRecords[0].data.quote), before); assert.match(screen.getByRole("status").textContent, /No customer message was sent/);
  });

  await test("decline reply is reviewed/copied only; completion requires explicit actual handover", async () => {
    await mount(); await startUpdate("Alpha New", "Unable to fulfil");
    await user.fill(within(dialog()).getByLabelText("Reason for closing"), "Synthetic capacity limit");
    await user.fill(within(dialog()).getByLabelText("Customer reply draft"), "Synthetic reviewed reply");
    await user.click(within(dialog()).getByRole("button", { name: "Copy reply draft" })); assert.deepEqual(clipboardWrites, ["Synthetic reviewed reply"]);
    await submitStage(); await saved(); assert.equal(patches()[0].body.stage, "declined");
    assert.equal(JSON.stringify(patches()[0].body).includes("Synthetic reviewed reply"), false);
    await startUpdate("Delta Confirmed"); const before = JSON.stringify(orderRecords);
    await user.fill(within(dialog()).getByLabelText(/Job stage/), "completed"); await submitStage(); assert.equal(patches().length, 1);
    await user.click(within(dialog()).getByRole("checkbox", { name: /I have confirmed/ }));
    await submitStage(); await saved(); assert.equal(patches()[1].body.acknowledgeCompletion, true); assert.equal(JSON.stringify(orderRecords), before);
  });

  await test("stage modal traps focus, guards discarded changes and closes with restored focus", async () => {
    await mount(); const opener = await startUpdate();
    assert.ok(document.activeElement === dialog());
    const close = within(dialog()).getByRole("button", { name: "Close stage update" });
    const save = within(dialog()).getByRole("button", { name: "Save stage" });
    await user.key(dialog(), "Tab", { shiftKey: true }); assert.ok(document.activeElement === save);
    await user.key(save, "Tab"); assert.ok(document.activeElement === close);
    await user.fill(within(dialog()).getByLabelText(/Job stage/), "production"); confirmation = false;
    await user.key(dialog(), "Escape"); assert.ok(screen.queryByRole("dialog"));
    confirmation = true; await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    assert.equal(Boolean(screen.queryByRole("dialog")), false); assert.ok(document.activeElement === opener);
  });

  await test("duplicate stage submit locks dismissal and a stale conflict preserves the draft", async () => {
    await mount(); await startUpdate(); await user.fill(within(dialog()).getByLabelText("Team note / reason"), "Synthetic pending note");
    const gate = deferred(); deferredPatch = gate; failNextPatch = 409;
    await act(async () => { fireEvent.submit(form()); fireEvent.submit(form()); }); assert.equal(patches().length, 1);
    await user.key(dialog(), "Escape"); assert.ok(screen.queryByRole("dialog"));
    await act(async () => { gate.resolve(); }); await waitFor(() => assert.ok(within(dialog()).getByRole("alert")));
    assert.equal(within(dialog()).getByLabelText("Team note / reason").value, "Synthetic pending note");
    assert.match(within(dialog()).getByRole("alert").textContent, /Someone updated/);
  });

  await test("new quotation remains explicit and then opens the new three-step panel without legacy editor", async () => {
    await mount(); await user.click(screen.getByRole("button", { name: "New quotation" }));
    assert.ok(screen.getByRole("region", { name: "Synthetic new quotation creation" })); assert.equal(patches().length, 0);
    const length = window.history.length;
    await user.click(screen.getByRole("button", { name: "Create synthetic blank quotation" }));
    assert.equal(handoff().dataset.quoteId, "synthetic-created-quote"); assert.equal(window.history.length, length);
    await user.click(screen.getByRole("button", { name: "Back to clients" })); assert.ok(screen.getByRole("heading", { name: "Pick the client’s design" }));
  });

  await test("enquiry dirty guard pins snapshot through background conversion until saved", async () => {
    addEnquiry(); await mount(); await openJob("Indigo Enquiry");
    assert.ok(screen.getByRole("heading", { name: "Complete the enquiry first" }));
    await user.click(within(overview()).getByRole("button", { name: "Review enquiry", exact: true }));
    await user.click(screen.getByRole("button", { name: "Make synthetic enquiry dirty" }));
    confirmation = false; await user.click(screen.getByRole("button", { name: "Back to clients" })); assert.ok(screen.getByRole("region", { name: "Synthetic enquiry editor" }));
    enquiries[0] = { ...enquiries[0], status: "ready", quoteId: "converted", subject: "Synthetic refreshed enquiry" };
    await act(async () => { window.dispatchEvent(new Event("email-intake-updated")); });
    assert.equal(screen.getByRole("region", { name: "Synthetic enquiry editor" }).dataset.status, "review");
    await user.click(screen.getByRole("button", { name: "Mark synthetic enquiry saved" }));
    await waitFor(() => assert.equal(screen.getByRole("region", { name: "Synthetic enquiry editor" }).dataset.status, "ready"));
    await user.click(screen.getByRole("button", { name: "Open synthetic converted quote" })); assert.equal(handoff().dataset.quoteId, "synthetic-converted-quote");
  });

  await test("test settings return to selected job, refresh the panel, and explicitly report no email sent", async () => {
    await mount(); await openJob(); const revision = Number(handoff().dataset.refreshKey);
    await user.click(within(handoff()).getByRole("button", { name: "Open synthetic test settings" }));
    assert.ok(screen.getByRole("region", { name: "Synthetic handoff settings" }));
    await user.click(screen.getByRole("button", { name: "Save synthetic settings" }));
    assert.equal(Number(handoff().dataset.refreshKey), revision + 1);
    assert.match(screen.getByRole("status").textContent, /No email has been sent/); assert.equal(requests.filter((entry) => entry.method !== "GET").length, 0);
    cleanup(); await mount({ openSetup: true }); assert.ok(screen.getByRole("region", { name: "Synthetic handoff settings" }));
  });

  await test("empty and failed client list stay read-only and recover through Retry", async () => {
    quoteRecords = []; orderRecords = []; queueFlags.canQuotes = false; await mount();
    assert.ok(screen.getByRole("heading", { name: "No matching clients" })); assert.equal(screen.getByRole("button", { name: "New quotation" }).disabled, true);
    cleanup(); failNextGet = 503; await mount(); assert.match(screen.getByRole("alert").textContent, /Synthetic job list interruption/);
    await user.click(screen.getByRole("button", { name: "Retry" })); await waitFor(() => assert.equal(Boolean(screen.queryByRole("alert")), false));
    assert.equal(rows().length, 0);
  });

  await test("refresh failure retains existing list and selection, and email check cannot send client mail", async () => {
    queueFlags.canInbox = true; await mount(); await openJob(); failNextGet = 503;
    await user.click(screen.getByRole("button", { name: "Refresh job list" })); assert.ok(screen.getByRole("alert"));
    assert.equal(rows().length, 6); assert.equal(handoff().dataset.quoteId, "alpha");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await user.click(screen.getByRole("button", { name: "Check email" }));
    assert.deepEqual(requests.filter((entry) => entry.method === "POST"), [{ url: "/api/admin/inbox/intake", method: "POST", body: { action: "sync" } }]);
  });

  await test("pagination and legacy requested IDs work with the simplified selected-design workflow", async () => {
    quoteRecords = Array.from({ length: 37 }, (_, index) => quote(`page-${index}`, `Page ${String(index).padStart(2, "0")}`, "new")); orderRecords = [];
    const mounted = await mount(); assert.equal(rows().length, 30);
    await user.click(screen.getByRole("button", { name: "Show more clients" })); assert.equal(rows().length, 37);
    await user.fill(screen.getByRole("textbox", { name: "Search jobs" }), "Page 36"); assert.deepEqual(rowNames(), ["Page 36"]);
    await act(async () => { mounted.rerender(React.createElement(App, { requestedQuoteId: "page-36" })); }); assert.equal(handoff().dataset.quoteId, "page-36");
    await act(async () => { mounted.rerender(React.createElement(App, { requestedQuoteId: "synthetic-unloaded-legacy" })); }); assert.equal(handoff().dataset.quoteId, "synthetic-unloaded-legacy");
  });

  console.log(`${passed} SIMPLE PRINT JOB WORKSPACE UI TESTS PASSED; ${failures} FAILED`);
  dom.window.close(); if (failures) process.exitCode = 1;
})().catch((error) => { console.error(error); cleanup(); dom.window.close(); process.exitCode = 1; });
