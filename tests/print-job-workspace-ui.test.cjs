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
const ACTOR = { userId: "synthetic-owner", displayName: "Synthetic owner", email: "owner@example.test" };
let quoteRecords, orderRecords, enquiries, requests, confirmations, confirmation;
let failNextGet, failNextPatch, loseNextPatchResponse, deferredPatch, clipFailure, clipboardWrites, queueFlags, warnings;
function workflow(stage, extra = {}) {
  return { stage, reason: "Synthetic team context", nextAction: "", followUpDate: "", closureKind: stage === "declined" ? "shop_declined" : null, updatedAtIso: new Date(NOW).toISOString(), updatedBy: ACTOR, version: 1, ...extra };
}
function quote(id, name, stage, extra = {}) {
  return { id, data: { name, source: "form", status: "review", createdAt: NOW, email: `${id}@example.test`, phone: "0000000000", quote: { documentNumber: `Q-${id}`, currency: "Rs", total: 1200, lines: [{ description: "Cotton T-shirt", quantity: 12, unitPrice: 100, color: "Blue", size: "L" }] }, printJobWorkflow: workflow(stage), ...extra } };
}
function reset() {
  quoteRecords = [
    quote("alpha", "Alpha New", "new", { createdAt: NOW - 8000, printJobWorkflow: workflow("new", { reason: "" }) }),
    quote("bravo", "Bravo Details", "needs_details", { source: "WhatsApp", createdAt: NOW - 7000 }),
    quote("charlie", "Charlie Waiting", "awaiting_client", { source: "Design studio", createdAt: NOW - 6000 }),
    quote("delta", "Delta Confirmed", "confirmed", { source: "Team", createdAt: NOW - 5000, orderTransactionId: "order-delta", quote: { documentNumber: "INV-DELTA", documentType: "invoice", currency: "Rs", total: 2400, paymentStatus: "Paid", lines: [{ description: "Cotton polo", quantity: 12, unitPrice: 200, color: "Navy", size: "XL" }] }, paymentReceipt: { documentNumber: "AUTO-DELTA" }, attachments: [{ filename: "Synthetic artwork.pdf", url: "https://example.test/artwork.pdf" }], message: "Synthetic conference uniforms", delivery: "Collection", deadline: "2026-12-20" }),
    quote("echo", "Echo Production", "production", { source: "Team", createdAt: NOW - 4000, attachments: [{ filename: "Synthetic logo.png", mimeType: "image/png", url: "https://example.test/synthetic-logo.png" }] }),
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
    const kind = String(loader).includes("QuoteEditorPage") ? "quote" : "order";
    return (props) => React.createElement(MockEditor, { ...props, kind });
  } };
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
const list = () => screen.getByRole("region", { name: "Print jobs", exact: true });
const rows = () => within(list()).queryAllByRole("button", { name: /^Open job for / });
const rowNames = () => rows().map((row) => row.getAttribute("aria-label").replace(/^Open job for /, "").split(",")[0]);
const overview = () => screen.getByRole("complementary", { name: /^Job overview for / });
const dialog = () => screen.getByRole("dialog", { name: "What happens next?" });
const form = () => screen.getByRole("form", { name: "Update job stage" });
const user = {
  click: async (element) => { await act(async () => { element.focus(); fireEvent.click(element); await new Promise((resolve) => setTimeout(resolve, 8)); }); },
  fill: async (element, value) => { await act(async () => { fireEvent.change(element, { target: { value } }); }); },
  key: async (element, key, options = {}) => { await act(async () => { fireEvent.keyDown(element, { key, ...options }); }); },
};
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
async function mount(props = {}) { const rendered = render(React.createElement(App, props)); await waitFor(() => assert.equal(Boolean(screen.queryByText("Getting your jobs in order")), false)); return rendered; }
async function category(name) { await user.click(within(screen.getByRole("navigation", { name: "Job categories" })).getByRole("button", { name: new RegExp(`^${name}`) })); }
async function openJob(name = "Alpha New") { const row = screen.getByRole("button", { name: new RegExp(`^Open job for ${name},`) }); await user.click(row); return row; }
async function startUpdate(name = "Alpha New", action = "Update stage") { await openJob(name); const button = within(overview()).getByRole("button", { name: action, exact: true }); await user.click(button); return button; }
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

(async () => {
  await test("all eight categories are distinct and active/attention hide closed jobs", async () => {
    await mount();
    assert.equal(rows().length, 6);
    assert.equal(rowNames().includes("Golf Completed"), false);
    assert.equal(rowNames().includes("Hotel Declined"), false);
    for (const stage of domain.PRINT_JOB_STAGES) {
      await category(stage.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      assert.equal(rows().length, 1, `${stage.label} has its own queue`);
      assert.match(rows()[0].getAttribute("aria-label"), new RegExp(stage.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
    }
    await category("All records"); assert.equal(rows().length, 8);
    await category("Needs attention"); assert.equal(rows().length, 4);
    assert.ok(rowNames().every((name) => !/Completed|Declined/.test(name)));
    assert.equal(patches().length, 0);
  });

  await test("search matches client, contact, garment and document; source and sorting combine", async () => {
    await mount();
    const search = screen.getByRole("textbox", { name: "Search jobs" });
    for (const term of ["Delta", "delta@example.test", "Cotton polo", "INV-DELTA", "AUTO-DELTA", "ORDER-DELTA"]) {
      await user.fill(search, term); assert.deepEqual(rowNames(), ["Delta Confirmed"]);
    }
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    await user.fill(screen.getByRole("combobox", { name: "Filter by source" }), "team");
    assert.deepEqual(rowNames().slice().sort(), ["Delta Confirmed", "Echo Production"]);
    await user.fill(screen.getByRole("combobox", { name: "Filter by source" }), "all");
    await user.fill(screen.getByRole("combobox", { name: "Sort jobs" }), "newest"); assert.equal(rowNames()[0], "Foxtrot Ready");
    await user.fill(screen.getByRole("combobox", { name: "Sort jobs" }), "oldest"); assert.equal(rowNames()[0], "Alpha New");
    await user.fill(screen.getByRole("combobox", { name: "Sort jobs" }), "name"); assert.deepEqual(rowNames(), rowNames().slice().sort());
    await user.fill(search, "no-such-synthetic-record"); assert.ok(screen.getByRole("heading", { name: "No matching jobs" }));
    await user.click(screen.getByRole("button", { name: "View active jobs" })); assert.equal(rows().length, 6);
  });

  await test("artwork is visible before the print brief with the customer name kept as secondary text", async () => {
    await mount();
    const row = screen.getByRole("button", { name: "Open job for Echo Production, In production" });
    const image = within(row).getByRole("img", { name: "Logo / artwork for Echo Production" });
    assert.equal(image.getAttribute("src"), "https://example.test/synthetic-logo.png");
    assert.equal(image.getAttribute("loading"), "lazy");
    const title = within(row).getByText("12 pieces · Cotton T-shirt");
    const customer = within(row).getByText("Echo Production", { exact: true });
    assert.ok(image.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING, "Artwork precedes the print brief in reading order");
    assert.ok(title.compareDocumentPosition(customer) & Node.DOCUMENT_POSITION_FOLLOWING, "Print brief precedes the secondary customer name");
    assert.equal(title.className, "printTitle"); assert.equal(customer.className, "clientName");
    await openJob("Echo Production");
    assert.ok(within(overview()).getByRole("img", { name: "Logo / artwork for Echo Production" }));
    const preview = within(overview()).getByRole("link", { name: "View full-size artwork" });
    assert.equal(preview.href, "https://example.test/synthetic-logo.png"); assert.equal(preview.target, "_blank"); assert.match(preview.rel, /noopener/);
  });

  await test("missing, non-image and broken artwork have distinct readable fallbacks", async () => {
    await mount();
    const missing = screen.getByRole("button", { name: "Open job for Alpha New, New enquiry" });
    assert.ok(within(missing).getByText("No artwork yet")); assert.equal(within(missing).queryAllByRole("img").length, 0);
    const file = screen.getByRole("button", { name: "Open job for Delta Confirmed, Confirmed" });
    assert.ok(within(file).getByText("Artwork file")); assert.equal(within(file).queryAllByRole("img").length, 0);
    const row = screen.getByRole("button", { name: "Open job for Echo Production, In production" });
    await act(async () => { fireEvent.error(within(row).getByRole("img", { name: "Logo / artwork for Echo Production" })); });
    assert.ok(within(row).getByText("Preview unavailable")); assert.equal(within(row).queryAllByRole("img").length, 0);
    await openJob("Echo Production");
    await act(async () => { fireEvent.error(within(overview()).getByRole("img", { name: "Logo / artwork for Echo Production" })); });
    assert.ok(within(overview()).getByText("Preview unavailable"));
    assert.ok(within(overview()).getByRole("button", { name: "Update stage", exact: true }));
  });

  await test("a refreshed artwork URL recovers from a failed preview without remounting the workspace", async () => {
    await mount();
    let row = screen.getByRole("button", { name: "Open job for Echo Production, In production" });
    await act(async () => { fireEvent.error(within(row).getByRole("img", { name: "Logo / artwork for Echo Production" })); });
    assert.ok(within(row).getByText("Preview unavailable"));
    quoteRecords.find((entry) => entry.id === "echo").data.attachments[0].url = "https://example.test/replaced-logo.png";
    await act(async () => { window.dispatchEvent(new Event("email-intake-updated")); });
    await waitFor(() => {
      row = screen.getByRole("button", { name: "Open job for Echo Production, In production" });
      assert.equal(within(row).getByRole("img", { name: "Logo / artwork for Echo Production" }).getAttribute("src"), "https://example.test/replaced-logo.png");
    });
  });

  await test("coloured stage/action hooks retain labels while search, source filter and stage dialog still work", async () => {
    await mount();
    const navigation = screen.getByRole("navigation", { name: "Job categories" });
    for (const stage of domain.PRINT_JOB_STAGES) {
      const button = Array.from(navigation.querySelectorAll("button")).find((entry) => entry.dataset.stage === stage.id);
      assert.ok(button, `Category ${stage.id} has its colour hook`); assert.ok(button.textContent.includes(stage.label));
    }
    await user.fill(screen.getByRole("textbox", { name: "Search jobs" }), "Echo");
    await user.fill(screen.getByRole("combobox", { name: "Filter by source" }), "team");
    assert.deepEqual(rowNames(), ["Echo Production"]);
    const row = rows()[0];
    assert.equal(row.querySelector(".badge").dataset.stage, "production");
    assert.equal(row.querySelector(".rowAction").dataset.stage, "production");
    assert.ok(row.querySelector(".rowAction").textContent.includes("Check production"));
    await openJob("Echo Production");
    assert.equal(overview().querySelector(".nextCard").dataset.stage, "production");
    await user.click(within(overview()).getByRole("button", { name: "Update stage", exact: true }));
    assert.equal(within(dialog()).getByLabelText(/Job stage/).value, "production");
    await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    assert.equal(Boolean(screen.queryByRole("dialog")), false); assert.deepEqual(rowNames(), ["Echo Production"]); assert.equal(patches().length, 0);
  });

  await test("overview unifies documents, payment evidence, print brief and safe artwork; close restores focus", async () => {
    await mount(); const opener = await openJob("Delta Confirmed"); const detail = overview();
    assert.ok(document.activeElement === detail, "Keyboard focus should be restored to the expected control");
    assert.ok(within(detail).getByRole("heading", { name: "Documents & payment" }));
    assert.ok(within(detail).getByText("Payment recorded · unverified"));
    assert.ok(within(detail).getByText(/An automatic receipt exists. It does not prove payment was received or verified/));
    assert.ok(within(detail).getByRole("button", { name: /AUTO-DELTA\s*receipt · auto-generated/ }));
    assert.ok(within(detail).getByRole("button", { name: /INV-DELTA\s*invoice/ }));
    assert.ok(within(detail).getByRole("button", { name: /ORDER-DELTA\s*order/ }));
    assert.ok(within(detail).getByText("Navy · XL · × 12"));
    assert.ok(within(detail).getByText("20 Dec 2026"));
    assert.ok(within(detail).getByText(/Production record: Pending/));
    const artwork = within(detail).getByRole("link", { name: "Synthetic artwork.pdf", hidden: true });
    assert.equal(artwork.href, "https://example.test/artwork.pdf"); assert.match(artwork.rel, /noopener/);
    await user.click(within(detail).getByRole("button", { name: "Close job overview" }));
    await waitFor(() => assert.ok(document.activeElement === opener, "Keyboard focus should be restored to the expected control"));
    assert.equal(Boolean(screen.queryByRole("complementary")), false);
  });

  await test("waiting and missing-details updates require reasons and save next action/date only to workflow", async () => {
    await mount(); await startUpdate("Alpha New", "Waiting for client");
    assert.equal(within(dialog()).getByLabelText(/Job stage/).value, "awaiting_client");
    await submitStage(); assert.equal(patches().length, 0); assert.ok(within(dialog()).getByRole("alert"));
    await user.fill(within(dialog()).getByLabelText(/What are we waiting for/), "  Artwork approval and sizes  ");
    await user.fill(within(dialog()).getByLabelText("Next action"), "Ask for final artwork");
    await user.fill(within(dialog()).getByLabelText("Follow-up date"), "2026-12-12");
    const before = JSON.stringify(quoteRecords[0].data.quote);
    await submitStage(); await saved();
    assert.equal(patches()[0].body.stage, "awaiting_client"); assert.equal(patches()[0].body.reason, "Artwork approval and sizes");
    assert.equal(patches()[0].body.nextAction, "Ask for final artwork"); assert.equal(patches()[0].body.followUpDate, "2026-12-12");
    assert.equal(patches()[0].body.expectedVersion, 1); assert.equal(patches()[0].body.targetType, "quote");
    assert.equal(JSON.stringify(quoteRecords[0].data.quote), before);
    assert.ok(screen.getByRole("status").textContent.includes("No customer message was sent"));
    await category("All active"); await startUpdate();
    await user.fill(within(dialog()).getByLabelText(/Job stage/), "needs_details");
    await user.fill(within(dialog()).getByLabelText(/Which details are missing/), "   ");
    await submitStage(); assert.equal(patches().length, 1);
    await user.fill(within(dialog()).getByLabelText(/Which details are missing/), "Sizes missing");
    await submitStage(); await saved(); assert.equal(patches()[1].body.stage, "needs_details");
  });

  await test("decline requires reason; suggested or edited reply is copied but never sent or stored", async () => {
    await mount(); await startUpdate("Alpha New", "Unable to fulfil");
    await submitStage(); assert.equal(patches().length, 0);
    await user.fill(within(dialog()).getByLabelText("Reason for closing"), "Cannot meet the delivery date.");
    const reply = within(dialog()).getByRole("textbox", { name: "Customer reply draft" });
    assert.match(reply.value, /Hi Alpha,/); assert.match(reply.value, /Cannot meet the delivery date/);
    await user.click(within(dialog()).getByRole("button", { name: "Copy reply draft" }));
    assert.deepEqual(clipboardWrites, [reply.value]); assert.equal(patches().length, 0);
    await user.fill(reply, "Synthetic reviewed customer reply");
    await user.click(within(dialog()).getByRole("button", { name: "Copy reply draft" }));
    assert.equal(clipboardWrites[1], "Synthetic reviewed customer reply");
    await submitStage(); await saved();
    assert.equal(patches()[0].body.stage, "declined"); assert.equal(patches()[0].body.closureKind, "shop_declined");
    assert.equal(patches()[0].body.nextAction, ""); assert.equal(patches()[0].body.followUpDate, "");
    assert.equal(JSON.stringify(patches()[0].body).includes("Synthetic reviewed customer reply"), false);
    assert.equal(rowNames().includes("Alpha New"), false);
    await category("Declined / cancelled"); assert.ok(rowNames().includes("Alpha New"));
    assert.ok(requests.every(({ url, method }) => url === API || method === "PATCH"));
  });

  await test("closure outcome changes suggested reply and clipboard failure preserves selectable draft", async () => {
    await mount(); await startUpdate("Alpha New", "Unable to fulfil");
    await user.fill(within(dialog()).getByLabelText("Outcome"), "client_declined");
    assert.match(within(dialog()).getByLabelText("Customer reply draft").value, /won’t be proceeding with this quotation/);
    await user.fill(within(dialog()).getByLabelText("Outcome"), "cancelled");
    assert.match(within(dialog()).getByLabelText("Customer reply draft").value, /cancellation of this request/);
    clipFailure = true;
    await user.click(within(dialog()).getByRole("button", { name: "Copy reply draft" }));
    assert.match(within(dialog()).getByRole("alert").textContent, /Select the draft text and copy it manually/);
    assert.ok(within(dialog()).getByLabelText("Customer reply draft").value.length > 0);
    assert.equal(patches().length, 0);
  });

  await test("completion requires actual handover acknowledgement and does not mutate payment/order data", async () => {
    await mount(); await startUpdate("Delta Confirmed");
    const beforeOrder = JSON.stringify(orderRecords), beforeQuote = JSON.stringify(quoteRecords.find((entry) => entry.id === "delta").data.quote);
    await user.fill(within(dialog()).getByLabelText(/Job stage/), "completed");
    await submitStage(); assert.equal(patches().length, 0); assert.match(within(dialog()).getByRole("alert").textContent, /collection or delivery/);
    await user.click(within(dialog()).getByRole("checkbox", { name: /I have confirmed/ }));
    await submitStage(); await saved();
    assert.equal(patches()[0].body.acknowledgeCompletion, true);
    assert.equal(JSON.stringify(orderRecords), beforeOrder); assert.equal(JSON.stringify(quoteRecords.find((entry) => entry.id === "delta").data.quote), beforeQuote);
    assert.equal(rowNames().includes("Delta Confirmed"), false);
    await category("Completed"); await openJob("Delta Confirmed");
    assert.ok(within(overview()).getByText("Payment recorded · unverified"));
  });

  await test("close, cancel and Escape restore focus; changed notes require discard confirmation", async () => {
    await mount(); let opener = await startUpdate();
    assert.ok(document.activeElement === dialog(), "Keyboard focus should be restored to the expected control");
    await user.click(within(dialog()).getByRole("button", { name: "Close stage update" }));
    assert.equal(Boolean(screen.queryByRole("dialog")), false); assert.ok(document.activeElement === opener, "Keyboard focus should be restored to the expected control"); assert.equal(confirmations.length, 0);
    await user.click(opener); await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    assert.ok(document.activeElement === opener, "Keyboard focus should be restored to the expected control");
    await user.click(opener); await user.key(dialog(), "Escape"); assert.ok(document.activeElement === opener, "Keyboard focus should be restored to the expected control");
    await user.click(opener); await user.fill(within(dialog()).getByLabelText("Team note / reason"), "Keep this synthetic draft");
    confirmation = false; await user.key(dialog(), "Escape");
    assert.equal(within(dialog()).getByLabelText("Team note / reason").value, "Keep this synthetic draft");
    assert.match(confirmations.at(-1), /Discard this unsaved stage update/);
    confirmation = true; await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    assert.equal(Boolean(screen.queryByRole("dialog")), false); assert.ok(document.activeElement === opener, "Keyboard focus should be restored to the expected control"); assert.equal(patches().length, 0);
  });

  await test("stage-only and outcome-only changes are protected by discard confirmation", async () => {
    await mount(); await startUpdate();
    await user.fill(within(dialog()).getByLabelText(/Job stage/), "production");
    confirmation = false; await user.key(dialog(), "Escape");
    assert.ok(screen.queryByRole("dialog"), "Changing only a stage must not silently discard the update");
    assert.match(confirmations.at(-1), /Discard this unsaved stage update/);
    confirmation = true; await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    await user.click(within(overview()).getByRole("button", { name: "Unable to fulfil" }));
    await user.fill(within(dialog()).getByLabelText("Outcome"), "cancelled");
    confirmation = false; await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    assert.ok(screen.queryByRole("dialog"), "Changing only closure outcome must not silently discard the update");
    assert.equal(within(dialog()).getByLabelText("Outcome").value, "cancelled");
  });

  await test("dialog Tab trap wraps both directions", async () => {
    await mount(); await startUpdate();
    const close = within(dialog()).getByRole("button", { name: "Close stage update" });
    const save = within(dialog()).getByRole("button", { name: "Save stage" });
    await user.key(dialog(), "Tab", { shiftKey: true }); assert.ok(document.activeElement === save, "Keyboard focus should be restored to the expected control");
    await user.key(save, "Tab"); assert.ok(document.activeElement === close, "Keyboard focus should be restored to the expected control");
    await user.key(close, "Tab", { shiftKey: true }); assert.ok(document.activeElement === save, "Keyboard focus should be restored to the expected control");
  });

  await test("duplicate submit is one request; pending save blocks dismissal and returns opener focus", async () => {
    await mount(); const opener = await startUpdate();
    await user.fill(within(dialog()).getByLabelText(/Job stage/), "confirmed");
    const gate = deferred(); deferredPatch = gate;
    await act(async () => { fireEvent.submit(form()); fireEvent.submit(form()); });
    assert.equal(patches().length, 1);
    assert.equal(within(dialog()).getByRole("button", { name: "Cancel" }).disabled, true);
    assert.equal(within(dialog()).getByRole("button", { name: "Saving stage…" }).disabled, true);
    await user.key(dialog(), "Escape"); assert.ok(screen.queryByRole("dialog"));
    await act(async () => { gate.resolve(); }); await saved();
    assert.equal(patches().length, 1); assert.ok(document.activeElement === opener, "Keyboard focus should be restored to the expected control");
  });

  for (const failure of [500, 409, "network"]) await test(`${failure} save failure preserves stage, reason, next action, date and edited reply`, async () => {
    await mount(); await startUpdate();
    await user.fill(within(dialog()).getByLabelText("Next action"), "Synthetic retry action");
    await user.fill(within(dialog()).getByLabelText("Follow-up date"), "2026-12-17");
    await user.fill(within(dialog()).getByLabelText(/Job stage/), "declined");
    await user.fill(within(dialog()).getByLabelText("Reason for closing"), "Synthetic unsaved reason");
    await user.fill(within(dialog()).getByLabelText("Customer reply draft"), "Synthetic preserved reply");
    failNextPatch = failure; await submitStage();
    await waitFor(() => assert.ok(within(dialog()).getByRole("alert")));
    assert.equal(within(dialog()).getByLabelText(/Job stage/).value, "declined");
    assert.equal(within(dialog()).getByLabelText("Reason for closing").value, "Synthetic unsaved reason");
    assert.equal(within(dialog()).getByLabelText("Customer reply draft").value, "Synthetic preserved reply");
    assert.equal(within(dialog()).getByRole("button", { name: "Save stage" }).disabled, false);
    assert.equal(quoteRecords[0].data.printJobWorkflow.stage, "new");
    if (failure === 409) assert.match(within(dialog()).getByRole("alert").textContent, /Someone updated this job/);
    await user.fill(within(dialog()).getByLabelText(/Job stage/), "awaiting_client");
    assert.equal(within(dialog()).getByLabelText("Next action").value, "Synthetic retry action");
    assert.equal(within(dialog()).getByLabelText("Follow-up date").value, "2026-12-17");
    assert.equal(patches().length, 1);
  });

  await test("retry after failed save uses the same request ID for the same payload", async () => {
    await mount(); await startUpdate(); await user.fill(within(dialog()).getByLabelText("Team note / reason"), "Synthetic retry note");
    failNextPatch = 500; await submitStage(); await waitFor(() => assert.ok(within(dialog()).getByRole("alert")));
    const first = patches()[0].body; await submitStage(); await saved();
    assert.deepEqual(patches()[1].body, first); assert.equal(quoteRecords[0].data.printJobWorkflow.version, 2);
  });

  await test("document editors get IDs and explicit blank creation; dirty Back and navigation require confirmation", async () => {
    await mount(); await openJob("Delta Confirmed");
    const editorOpener = within(overview()).getByRole("button", { name: "Open quote & invoice editor" });
    await user.click(editorOpener);
    let editor = screen.getByRole("region", { name: "Synthetic quote editor" });
    assert.equal(editor.dataset.recordId, "delta"); assert.equal(editor.dataset.embedded, "true");
    const back = screen.getByRole("button", { name: "Back to jobs" }); assert.ok(document.activeElement === back, "Keyboard focus should be restored to the expected control");
    await user.click(within(editor).getByRole("button", { name: "Make synthetic document dirty" }));
    assert.ok(screen.getByText("Unsaved changes"));
    confirmation = false; await user.click(back); assert.ok(screen.getByRole("region", { name: "Synthetic quote editor" }));
    assert.match(confirmations.at(-1), /Discard your unsaved document edits and return/);
    const closing = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(closing); assert.equal(closing.defaultPrevented, true);
    const anchor = document.createElement("a"); anchor.href = "/admin/orders"; anchor.textContent = "Synthetic outside route"; document.body.appendChild(anchor);
    try { const event = new MouseEvent("click", { bubbles: true, cancelable: true }); await act(async () => { anchor.dispatchEvent(event); }); assert.equal(event.defaultPrevented, true); assert.match(confirmations.at(-1), /Discard your unsaved document edits and leave/); }
    finally { anchor.remove(); }
    confirmation = true; await user.click(back); await waitFor(() => assert.ok(document.activeElement === editorOpener, "Editor opener should regain keyboard focus"));
    await user.click(within(overview()).getByRole("button", { name: "Production & delivery record" }));
    editor = screen.getByRole("region", { name: "Synthetic order editor" }); assert.equal(editor.dataset.recordId, "order-delta");
    await user.click(screen.getByRole("button", { name: "Back to jobs" }));
    await user.click(screen.getByRole("button", { name: "New quotation" }));
    assert.ok(screen.getByRole("region", { name: "Synthetic new quotation creation" }));
    assert.equal(Boolean(screen.queryByRole("region", { name: "Synthetic quote editor" })), false);
    const historyLength = window.history.length;
    await user.click(screen.getByRole("button", { name: "Create synthetic blank quotation" }));
    editor = screen.getByRole("region", { name: "Synthetic quote editor" }); assert.equal(editor.dataset.recordId, "synthetic-created-quote");
    assert.equal(window.history.length, historyLength, "Creating a draft replaces the creation history entry");
    assert.equal(patches().length, 0);
  });

  await test("raw email enquiry updates use intake target and its review opens the enquiry editor", async () => {
    enquiries = [{ id: "synthetic-intake", subject: "Synthetic pending enquiry", status: "needs_details", email: "pending@example.test", draft: { name: "Indigo Enquiry", phone: "", lines: [] }, summary: "Sizes missing", lastReplyAt: new Date(NOW).toISOString(), updatedAtIso: new Date(NOW).toISOString() }];
    await mount(); await openJob("Indigo Enquiry");
    await user.click(within(overview()).getByRole("button", { name: "Review enquiry & reply" }));
    assert.ok(screen.getByRole("region", { name: "Synthetic enquiry editor" }));
    await user.click(screen.getByRole("button", { name: "Back to jobs" }));
    await user.click(within(overview()).getByRole("button", { name: "Waiting for client" }));
    await user.fill(within(dialog()).getByLabelText(/What are we waiting for/), "Need customer sizes");
    await submitStage(); await saved();
    assert.equal(patches()[0].url, `${API}/synthetic-intake`); assert.equal(patches()[0].body.targetType, "intake"); assert.equal(patches()[0].body.expectedVersion, 0);
  });

  await test("email enquiry drafts use the same dirty guard and converted quotes open the existing editor", async () => {
    enquiries = [{ id: "synthetic-intake", subject: "Synthetic pending enquiry", status: "needs_details", email: "pending@example.test", draft: { name: "Indigo Enquiry", phone: "", lines: [] }, summary: "Sizes missing", lastReplyAt: new Date(NOW).toISOString(), updatedAtIso: new Date(NOW).toISOString() }];
    await mount(); await openJob("Indigo Enquiry");
    await user.click(within(overview()).getByRole("button", { name: "Review enquiry & reply" }));
    await user.click(screen.getByRole("button", { name: "Make synthetic enquiry dirty" }));
    confirmation = false; await user.click(screen.getByRole("button", { name: "Back to jobs" }));
    assert.ok(screen.getByRole("region", { name: "Synthetic enquiry editor" })); assert.ok(screen.getByText("Unsaved changes"));
    const historyLength = window.history.length;
    await user.click(screen.getByRole("button", { name: "Open synthetic converted quote" }));
    assert.equal(window.history.length, historyLength, "Opening a converted quote replaces the enquiry history entry");
    assert.equal(window.history.state.printDeskEditor.id, "synthetic-converted-quote");
    const editor = screen.getByRole("region", { name: "Synthetic quote editor" });
    assert.equal(editor.dataset.recordId, "synthetic-converted-quote");
    await user.click(screen.getByRole("button", { name: "Back to jobs" }));
    assert.equal(Boolean(screen.queryByRole("region", { name: "Synthetic enquiry editor" })), false);
    assert.equal(Boolean(screen.queryByRole("region", { name: "Synthetic quote editor" })), false);
    assert.ok(screen.getByRole("region", { name: "Print jobs", exact: true }));
  });

  await test("background refresh pins dirty enquiry snapshot until the draft is saved", async () => {
    enquiries = [{ id: "synthetic-intake", subject: "Synthetic draft before refresh", status: "review", email: "pending@example.test", draft: { name: "Indigo Enquiry", phone: "", lines: [] }, summary: "Original extracted draft", lastReplyAt: new Date(NOW).toISOString(), updatedAtIso: new Date(NOW).toISOString() }];
    await mount(); await openJob("Indigo Enquiry");
    await user.click(within(overview()).getByRole("button", { name: "Review enquiry & reply" }));
    await user.click(screen.getByRole("button", { name: "Make synthetic enquiry dirty" }));
    let editor = screen.getByRole("region", { name: "Synthetic enquiry editor" });
    assert.equal(editor.dataset.status, "review"); assert.equal(editor.dataset.quoteId, "");
    enquiries[0] = { ...enquiries[0], status: "ready", quoteId: "synthetic-background-quote", subject: "Synthetic converted draft after refresh", summary: "Background conversion completed" };
    const readsBefore = requests.filter((entry) => entry.method === "GET").length;
    await act(async () => { window.dispatchEvent(new Event("email-intake-updated")); });
    await waitFor(() => assert.equal(requests.filter((entry) => entry.method === "GET").length, readsBefore + 1));
    editor = screen.getByRole("region", { name: "Synthetic enquiry editor" });
    assert.equal(editor.dataset.status, "review"); assert.equal(editor.dataset.quoteId, "");
    assert.ok(within(editor).getByText("Synthetic draft before refresh"));
    assert.ok(screen.getByText("Unsaved changes"));
    await user.click(within(editor).getByRole("button", { name: "Mark synthetic enquiry saved" }));
    await waitFor(() => assert.equal(screen.getByRole("region", { name: "Synthetic enquiry editor" }).dataset.status, "ready"));
    editor = screen.getByRole("region", { name: "Synthetic enquiry editor" });
    assert.equal(editor.dataset.quoteId, "synthetic-background-quote");
    assert.ok(within(editor).getByText("Synthetic converted draft after refresh"));
    assert.equal(Boolean(screen.queryByText("Unsaved changes")), false);
    assert.equal(patches().length, 0);
  });

  await test("empty/read-only queue and GET failure stay actionable without manufacturing records", async () => {
    quoteRecords = []; orderRecords = []; queueFlags.canQuotes = false;
    await mount(); assert.ok(screen.getByRole("heading", { name: "No jobs in this category" }));
    assert.equal(screen.getByRole("button", { name: "New quotation" }).disabled, true); assert.equal(rows().length, 0);
    cleanup(); failNextGet = 503; await mount();
    assert.ok(screen.getByRole("heading", { name: "The job list is unavailable" }));
    assert.match(screen.getByRole("alert").textContent, /Synthetic job list interruption/);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => assert.equal(Boolean(screen.queryByRole("alert")), false)); assert.equal(rows().length, 0);
  });

  await test("refresh failure retains last loaded records and an explicit stale warning", async () => {
    await mount(); failNextGet = 503;
    await user.click(screen.getByRole("button", { name: "Refresh job list" }));
    await waitFor(() => assert.ok(screen.getByRole("alert")));
    assert.match(screen.getByRole("alert").textContent, /Last loaded records are still shown/); assert.equal(rows().length, 6);
    await user.click(screen.getByRole("button", { name: "Retry" })); await waitFor(() => assert.equal(Boolean(screen.queryByRole("alert")), false));
  });

  await test("source warnings and email check are explicit and never send customer messages", async () => {
    queueFlags.canInbox = true; warnings = ["Synthetic production source unavailable"];
    await mount(); assert.match(screen.getByRole("alert").textContent, /Synthetic production source unavailable/);
    await user.click(screen.getByRole("button", { name: "Check email" }));
    assert.ok(screen.getByRole("status").textContent.includes("Email checked"));
    assert.deepEqual(requests.filter((entry) => entry.method === "POST"), [{ url: "/api/admin/inbox/intake", method: "POST", body: { action: "sync" } }]);
  });

  await test("legacy quote deep links select the right closed category and preserve its overview", async () => {
    window.history.replaceState({}, "", "/admin/quotation-approval?quoteId=golf");
    await mount(); await waitFor(() => assert.ok(screen.queryByRole("region", { name: "Synthetic quote editor" })));
    assert.equal(screen.getByRole("region", { name: "Synthetic quote editor" }).dataset.recordId, "golf");
    await user.click(screen.getByRole("button", { name: "Back to jobs" }));
    await waitFor(() => assert.ok(screen.queryByRole("complementary", { name: "Job overview for Golf Completed" })));
    assert.deepEqual(rowNames(), ["Golf Completed"]);
    assert.ok(within(overview()).getByRole("button", { name: "Reopen / change stage" }));
  });


  await test("pagination reveals remaining records and search resets the visible page", async () => {
    quoteRecords = Array.from({ length: 37 }, (_, index) => quote(`page-${index}`, `Page ${String(index).padStart(2, "0")}`, "new")); orderRecords = [];
    await mount(); assert.equal(rows().length, 30);
    await user.click(screen.getByRole("button", { name: /Show more jobs 7 remaining/ })); assert.equal(rows().length, 37);
    await user.fill(screen.getByRole("textbox", { name: "Search jobs" }), "Page 36"); assert.deepEqual(rowNames(), ["Page 36"]);
    await user.click(screen.getByRole("button", { name: "Clear search" })); assert.equal(rows().length, 30);
  });

  await test("real concurrent workflow update rejects stale version without overwriting either team's work", async () => {
    await mount(); await startUpdate();
    await user.fill(within(dialog()).getByLabelText("Team note / reason"), "My synthetic unsaved note");
    quoteRecords[0].data.printJobWorkflow = workflow("production", { version: 2, reason: "A different team member updated production" });
    await submitStage(); await waitFor(() => assert.ok(within(dialog()).getByRole("alert")));
    assert.match(within(dialog()).getByRole("alert").textContent, /Someone updated this job/);
    assert.equal(within(dialog()).getByLabelText("Team note / reason").value, "My synthetic unsaved note");
    assert.equal(quoteRecords[0].data.printJobWorkflow.reason, "A different team member updated production");
    assert.equal(quoteRecords[0].data.printJobWorkflow.version, 2);
    assert.equal(patches()[0].body.expectedVersion, 1);
    confirmation = false; await user.key(dialog(), "Escape"); assert.ok(screen.queryByRole("dialog"));
  });

  await test("lost success response retries idempotently without a duplicate workflow event", async () => {
    await mount(); await startUpdate();
    await user.fill(within(dialog()).getByLabelText("Team note / reason"), "Synthetic committed note");
    loseNextPatchResponse = true; await submitStage(); await waitFor(() => assert.ok(within(dialog()).getByRole("alert")));
    assert.equal(quoteRecords[0].data.printJobWorkflow.version, 2); assert.equal(quoteRecords[0].data.printJobWorkflowHistory.length, 1);
    await submitStage(); await saved();
    assert.deepEqual(patches()[0].body, patches()[1].body);
    assert.equal(quoteRecords[0].data.printJobWorkflow.version, 2); assert.equal(quoteRecords[0].data.printJobWorkflowHistory.length, 1);
  });

  await test("new quotation Back restores focus to its opener when there is no selected job", async () => {
    await mount(); const opener = screen.getByRole("button", { name: "New quotation" });
    await user.click(opener); await user.click(screen.getByRole("button", { name: "Back to jobs" }));
    await waitFor(() => assert.ok(document.activeElement === opener, "New quotation should regain keyboard focus"));
  });

  await test("browser Back rejects dirty editor dismissal, accepts explicit discard, and Forward restores editor", async () => {
    await mount(); await openJob("Delta Confirmed");
    await user.click(within(overview()).getByRole("button", { name: "Open quote & invoice editor" }));
    const editorState = window.history.state;
    assert.equal(editorState.printDeskEditor.id, "delta");
    await user.click(screen.getByRole("button", { name: "Make synthetic document dirty" }));
    confirmation = false; await popTo({});
    assert.ok(screen.getByRole("region", { name: "Synthetic quote editor" })); assert.ok(screen.getByText("Unsaved changes"));
    assert.match(confirmations.at(-1), /Discard your unsaved changes and go back/);
    assert.equal(window.history.state.printDeskEditor.id, "delta");
    confirmation = true; await popTo({});
    assert.equal(Boolean(screen.queryByRole("region", { name: "Synthetic quote editor" })), false);
    await popTo(editorState);
    assert.equal(screen.getByRole("region", { name: "Synthetic quote editor" }).dataset.recordId, "delta");
    assert.equal(Boolean(screen.queryByText("Unsaved changes")), false);
  });

  await test("browser Back protects dirty stage draft and beforeunload, then closes on approved discard", async () => {
    await mount(); await startUpdate();
    assert.ok(window.history.state.printDeskStage);
    await user.fill(within(dialog()).getByLabelText("Team note / reason"), "Synthetic browser history draft");
    const closing = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(closing); assert.equal(closing.defaultPrevented, true);
    confirmation = false; await popTo({});
    assert.equal(within(dialog()).getByLabelText("Team note / reason").value, "Synthetic browser history draft");
    assert.ok(window.history.state.printDeskStage);
    assert.match(confirmations.at(-1), /Discard your unsaved changes and go back/);
    confirmation = true; await popTo({});
    assert.equal(Boolean(screen.queryByRole("dialog")), false); assert.equal(patches().length, 0);
  });

  await test("browser Back cannot dismiss an in-flight stage save", async () => {
    await mount(); await startUpdate();
    const gate = deferred(); deferredPatch = gate;
    await submitStage(); await popTo({});
    assert.ok(screen.queryByRole("dialog")); assert.ok(window.history.state.printDeskStage);
    assert.equal(within(dialog()).getByRole("button", { name: "Saving stage…" }).disabled, true);
    await act(async () => { gate.resolve(); }); await saved(); assert.equal(patches().length, 1);
  });

  await test("explicit stage close removes stale dialog state before a later navigation", async () => {
    await mount(); await startUpdate();
    await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    assert.equal(Boolean(window.history.state?.printDeskStage), false);
    assert.equal(Boolean(screen.queryByRole("dialog")), false);
    await popTo(window.history.state);
    assert.equal(Boolean(screen.queryByRole("dialog")), false);
  });

  await test("requestedQuoteId rerenders the same workspace with the correct quote, including an unloaded legacy ID", async () => {
    const mounted = await mount({ requestedQuoteId: "alpha" });
    await waitFor(() => assert.ok(screen.queryByRole("region", { name: "Synthetic quote editor" })));
    assert.equal(screen.getByRole("region", { name: "Synthetic quote editor" }).dataset.recordId, "alpha");
    await act(async () => { mounted.rerender(React.createElement(App, { requestedQuoteId: "delta" })); });
    assert.equal(screen.getByRole("region", { name: "Synthetic quote editor" }).dataset.recordId, "delta");
    await act(async () => { mounted.rerender(React.createElement(App, { requestedQuoteId: "synthetic-unloaded-legacy" })); });
    assert.equal(screen.getByRole("region", { name: "Synthetic quote editor" }).dataset.recordId, "synthetic-unloaded-legacy");
    assert.equal(patches().length, 0);
  });

  console.log(`${passed} PRINT JOB WORKSPACE UI TESTS PASSED; ${failures} FAILED`);
  dom.window.close();
  if (failures) process.exitCode = 1;
})().catch((error) => { console.error(error); cleanup(); dom.window.close(); process.exitCode = 1; });
