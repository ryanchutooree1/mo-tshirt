// Synthetic UI/Firestore tests only: no production reads, writes or auth calls.
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "..");
const requireRepo = createRequire(root + "/package.json");
const React = requireRepo("react");
const ts = requireRepo("typescript");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3007/admin/quotation-approval", pretendToBeVisual: true });
for (const key of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "MutationObserver", "getComputedStyle"]) global[key] = dom.window[key];
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, act, fireEvent, cleanup, waitFor } = requireRepo("@testing-library/react");
const fakeDb = { synthetic: true };
let records, operations, callbacks, authCalls, failAuth, failTransaction, loseResponse, pending, fetchCalls, popup;
function reset() {
  records = new Map(); operations = []; callbacks = []; authCalls = 0; failAuth = false;
  failTransaction = false; loseResponse = false; pending = null; fetchCalls = [];
  popup = { closed: false, opener: {}, location: { href: "about:blank" }, close() { this.closed = true; } };
  window.open = () => popup;
}
const firestore = {
  collection(database, name) { assert.equal(database, fakeDb); assert.equal(name, "quotes"); operations.push({ kind: "collection", name }); return { name }; },
  doc(collection) { assert.equal(collection.name, "quotes"); const id = `synthetic-blank-${operations.filter((entry) => entry.kind === "allocate").length + 1}`; operations.push({ kind: "allocate", id }); return { id }; },
  serverTimestamp() { return { syntheticServerTimestamp: true }; },
  async runTransaction(database, callback) {
    assert.equal(database, fakeDb); operations.push({ kind: "transaction" });
    if (pending) { const gate = pending; pending = null; await gate.promise; }
    if (failTransaction) { failTransaction = false; throw new Error("Synthetic transaction failure"); }
    const staged = [];
    await callback({
      async get(target) { operations.push({ kind: "get", id: target.id }); return { exists: () => records.has(target.id) }; },
      set(target, value) { assert.ok(operations.some((entry) => entry.kind === "get" && entry.id === target.id), "Read existing draft before writing"); operations.push({ kind: "set", id: target.id }); staged.push([target.id, structuredClone(value)]); },
    });
    for (const [id, value] of staged) records.set(id, value);
    if (loseResponse) { loseResponse = false; throw new Error("Synthetic response lost after commit"); }
  },
};
const mod = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(root + "/src/components/admin/print-jobs/NewQuotationDraft.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, {
  module: mod, exports: mod.exports, console, URL, window: dom.window, document: dom.window.document,
  fetch: async (url, options) => {
    fetchCalls.push({ url, options });
    return { ok: true, async json() { return { whatsappUrl: "https://wa.me/23057123456?text=Quotation" }; } };
  },
  require(name) {
    if (name === "firebase/firestore") return firestore;
    if (name === "@/lib/firebase") return { db: fakeDb };
    if (name === "@/lib/firebase-admin-client-auth") return { ensureAdminFirebaseSession: async () => { authCalls++; if (failAuth) throw new Error("Synthetic auth failure"); } };
    if (name === "@/lib/quotation-whatsapp") return { normalizeWhatsAppPhone: value => String(value || "").replace(/\D/g, "").length >= 8 ? String(value).replace(/\D/g, "") : null };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    return requireRepo(name);
  },
}, { filename: "NewQuotationDraft.test.js" });
const App = mod.exports.default;
const mount = () => render(React.createElement(App, { onCreated: (id, intent) => callbacks.push({ id, intent }) }));
const fill = (name, value) => fireEvent.change(screen.getByLabelText(name), { target: { value } });
const setSizes = (value = "S: 2, M: 3") => fill("Sizes & quantities", value);
const clickDraft = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save draft" })); }); };
const saved = async () => { await waitFor(() => assert.equal(callbacks.length, 1)); };
const sets = () => operations.filter((entry) => entry.kind === "set");
const allocations = () => operations.filter((entry) => entry.kind === "allocate");
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
let failures = 0, passed = 0;
async function test(name, fn) {
  reset();
  try { await fn(); passed++; console.log("PASS " + name); }
  catch (error) { failures++; console.error("FAIL " + name + "\n" + error.stack); }
  finally { cleanup(); }
}
(async () => {
  await test("render is read/write/auth free and starts with a focused plain quotation form", async () => {
    mount(); assert.ok(screen.getByRole("heading", { name: "New plain quotation" }));
    assert.equal(screen.getByRole("radio", { name: "Normal customer" }).getAttribute("aria-checked"), "true");
    assert.equal(screen.getByLabelText("Approved unit price in Rs").value, "150");
    assert.equal(authCalls, 0); assert.equal(operations.length, 0); assert.equal(records.size, 0); assert.deepEqual(callbacks, []);
  });
  await test("normal plain quotation uses Customer when the name is blank and saves complete Rs lines", async () => {
    mount(); setSizes(); await clickDraft(); await saved();
    assert.equal(authCalls, 1); assert.equal(allocations().length, 1); assert.equal(sets().length, 1); assert.equal(records.size, 1);
    const [id, record] = [...records][0]; assert.deepEqual(callbacks[0], { id, intent: "draft" });
    assert.equal(record.status, "review"); assert.equal(record.quote.documentType, "quotation");
    assert.equal(record.quote.documentNumber, `Q-${id.slice(-8).toUpperCase()}`);
    assert.equal(record.quote.paymentStatus, "Quotation only"); assert.equal(record.quote.currency, "Rs");
    assert.equal(record.quote.subtotal, 750); assert.equal(record.quote.total, 750); assert.equal(record.quote.amountReceived, 0);
    assert.equal(record.name, "Customer"); assert.equal(record.quote.clientCompany, "Customer"); assert.equal(record.email, ""); assert.equal(record.phone, "");
    assert.equal(record.printMethod, "No customization"); assert.deepEqual(record.plainQuotation, { customerType: "normal", approvedUnitPrice: 150 });
    assert.deepEqual(record.garments.map(({ size, quantity }) => ({ size, quantity })), [{ size: "S", quantity: 2 }, { size: "M", quantity: 3 }]);
    assert.deepEqual(record.quote.lines.map(({ quantity, unitPrice }) => ({ quantity, unitPrice })), [{ quantity: 2, unitPrice: 150 }, { quantity: 3, unitPrice: 150 }]);
    assert.match(record.quote.documentDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(record.quote.validUntil, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(screen.getByRole("status").textContent.includes("saved as a draft")); assert.equal(fetchCalls.length, 0);
    for (const key of ["bankDetails", "bankAccount", "accountNumber", "clientDecision", "paymentEvidence", "paymentReceipt", "sentAt"]) assert.equal(Object.hasOwn(record, key) || Object.hasOwn(record.quote, key), false);
  });
  await test("bulk create-and-send uses the approved price and duplicate clicks create and prepare once", async () => {
    mount(); fireEvent.click(screen.getByRole("radio", { name: "Bulk buyer" }));
    fill(/Phone \/ WhatsApp/, "5712 3456"); fill(/Customer name/, "Bulk Buyer Ltd"); setSizes("XL: 20"); fill("Approved unit price in Rs", "150");
    const gate = deferred(); pending = gate; const button = screen.getByRole("button", { name: "Create & send" });
    await act(async () => { fireEvent.click(button); fireEvent.click(button); });
    assert.equal(authCalls, 1); assert.equal(allocations().length, 1); assert.equal(screen.getByRole("button", { name: "Preparing…" }).disabled, true); assert.equal(callbacks.length, 0);
    await act(async () => { gate.resolve(); }); await saved();
    await waitFor(() => assert.ok(screen.getByRole("status").textContent.includes("WhatsApp is ready")));
    const [id, record] = [...records][0];
    assert.deepEqual(callbacks[0], { id, intent: "send" }); assert.equal(sets().length, 1); assert.equal(records.size, 1); assert.equal(fetchCalls.length, 1);
    assert.equal(record.name, "Bulk Buyer Ltd"); assert.equal(record.quantity, 20); assert.equal(record.quote.total, 3000);
    assert.deepEqual(record.plainQuotation, { customerType: "bulk", approvedUnitPrice: 150 });
    assert.equal(record.quote.lines[0].priceSetByName, "Approved bulk price");
    assert.equal(JSON.parse(fetchCalls[0].options.body).quoteId, id); assert.match(popup.location.href, /^https:\/\/wa\.me\/23057123456/);
  });
  await test("lost-success retry reuses the original ID and preserves edits already made to its draft", async () => {
    mount(); setSizes("L: 1"); loseResponse = true; await clickDraft();
    await waitFor(() => assert.ok(screen.getByRole("alert"))); assert.equal(callbacks.length, 0); assert.equal(records.size, 1);
    const id = [...records.keys()][0]; const original = records.get(id);
    original.name = "Synthetic later edit"; original.quote.lines[0].description = "Synthetic edited line"; original.syntheticRevision = 2;
    const before = structuredClone(original);
    await clickDraft(); await saved();
    assert.deepEqual(callbacks[0], { id, intent: "draft" }); assert.equal(allocations().length, 1); assert.equal(sets().length, 1); assert.equal(records.size, 1);
    assert.deepEqual(records.get(id), before); assert.equal(operations.filter((entry) => entry.kind === "get").length, 2);
  });
  await test("transaction failure before persistence retries the same allocated ID", async () => {
    mount(); setSizes("M: 2"); failTransaction = true; await clickDraft();
    await waitFor(() => assert.ok(screen.getByRole("alert"))); assert.equal(records.size, 0); assert.equal(allocations().length, 1);
    assert.match(screen.getByRole("alert").textContent, /Retry safely; the same quotation is reused/);
    const id = allocations()[0].id; await clickDraft(); await saved();
    assert.deepEqual(callbacks[0], { id, intent: "draft" }); assert.equal(allocations().length, 1); assert.equal(sets().length, 1);
  });
  await test("authentication failure performs no Firestore allocation or write and offers retry", async () => {
    mount(); setSizes("M: 1"); failAuth = true; await clickDraft();
    await waitFor(() => assert.ok(screen.getByRole("alert"))); assert.equal(operations.length, 0); assert.equal(callbacks.length, 0);
    assert.equal(screen.getByRole("button", { name: "Save draft" }).disabled, false);
    failAuth = false; await clickDraft(); await saved(); assert.equal(records.size, 1);
  });
  console.log(`${passed} NEW QUOTATION DRAFT UI TESTS PASSED; ${failures} FAILED`);
  dom.window.close(); if (failures) process.exitCode = 1;
})().catch((error) => { console.error(error); cleanup(); dom.window.close(); process.exitCode = 1; });
