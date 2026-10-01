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
let records, operations, callbacks, authCalls, failAuth, failTransaction, loseResponse, pending;
function reset() { records = new Map(); operations = []; callbacks = []; authCalls = 0; failAuth = false; failTransaction = false; loseResponse = false; pending = null; }
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
  module: mod, exports: mod.exports, console,
  require(name) {
    if (name === "firebase/firestore") return firestore;
    if (name === "@/lib/firebase") return { db: fakeDb };
    if (name === "@/lib/firebase-admin-client-auth") return { ensureAdminFirebaseSession: async () => { authCalls++; if (failAuth) throw new Error("Synthetic auth failure"); } };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    return requireRepo(name);
  },
}, { filename: "NewQuotationDraft.test.js" });
const App = mod.exports.default;
const mount = () => render(React.createElement(App, { onCreated: (id) => callbacks.push(id) }));
const clickCreate = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Create blank quotation" })); }); };
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
  await test("render is read/write/auth free until the user explicitly creates a blank quotation", async () => {
    mount(); assert.ok(screen.getByRole("heading", { name: "Start a new quotation" }));
    assert.equal(authCalls, 0); assert.equal(operations.length, 0); assert.equal(records.size, 0); assert.deepEqual(callbacks, []);
  });
  await test("explicit creation writes one generic draft and opens its stable ID", async () => {
    mount(); await clickCreate(); await saved();
    assert.equal(authCalls, 1); assert.equal(allocations().length, 1); assert.equal(sets().length, 1); assert.equal(records.size, 1);
    const [id, record] = [...records][0]; assert.equal(callbacks[0], id);
    assert.equal(record.status, "review"); assert.equal(record.quote.documentType, "quotation");
    assert.equal(record.quote.documentNumber, `Q-${id.slice(-8).toUpperCase()}`);
    assert.equal(record.quote.paymentStatus, "Quotation only"); assert.equal(record.quote.total, 0); assert.equal(record.quote.amountReceived, 0);
    assert.equal(record.name, "Walk-in client"); assert.equal(record.email, ""); assert.equal(record.phone, "");
    assert.equal(record.quote.lines[0].unitPrice, ""); assert.equal(record.garments[0].quantity, 1);
    assert.match(record.quote.documentDate, /^\d{4}-\d{2}-\d{2}$/);
    for (const key of ["bankDetails", "bankAccount", "accountNumber", "clientDecision", "paymentEvidence", "paymentReceipt", "sentAt"]) assert.equal(Object.hasOwn(record, key) || Object.hasOwn(record.quote, key), false);
  });
  await test("duplicate same-tick clicks create one draft and pending transaction disables the button", async () => {
    mount(); const gate = deferred(); pending = gate;
    const button = screen.getByRole("button", { name: "Create blank quotation" });
    await act(async () => { fireEvent.click(button); fireEvent.click(button); });
    assert.equal(authCalls, 1); assert.equal(allocations().length, 1); assert.equal(screen.getByRole("button", { name: "Creating…" }).disabled, true); assert.equal(callbacks.length, 0);
    await act(async () => { gate.resolve(); }); await saved();
    assert.equal(sets().length, 1); assert.equal(records.size, 1); assert.equal(callbacks.length, 1);
  });
  await test("lost-success retry reuses the original ID and preserves edits already made to its draft", async () => {
    mount(); loseResponse = true; await clickCreate();
    await waitFor(() => assert.ok(screen.getByRole("alert"))); assert.equal(callbacks.length, 0); assert.equal(records.size, 1);
    const id = [...records.keys()][0]; const original = records.get(id);
    original.name = "Synthetic later edit"; original.quote.lines[0].description = "Synthetic edited line"; original.syntheticRevision = 2;
    const before = structuredClone(original);
    await clickCreate(); await saved();
    assert.equal(callbacks[0], id); assert.equal(allocations().length, 1); assert.equal(sets().length, 1); assert.equal(records.size, 1);
    assert.deepEqual(records.get(id), before); assert.equal(operations.filter((entry) => entry.kind === "get").length, 2);
  });
  await test("transaction failure before persistence retries the same allocated ID", async () => {
    mount(); failTransaction = true; await clickCreate();
    await waitFor(() => assert.ok(screen.getByRole("alert"))); assert.equal(records.size, 0); assert.equal(allocations().length, 1);
    assert.match(screen.getByRole("alert").textContent, /Retry safely; the same draft is reused/);
    const id = allocations()[0].id; await clickCreate(); await saved();
    assert.equal(callbacks[0], id); assert.equal(allocations().length, 1); assert.equal(sets().length, 1);
  });
  await test("authentication failure performs no Firestore allocation or write and offers retry", async () => {
    mount(); failAuth = true; await clickCreate();
    await waitFor(() => assert.ok(screen.getByRole("alert"))); assert.equal(operations.length, 0); assert.equal(callbacks.length, 0);
    assert.equal(screen.getByRole("button", { name: "Create blank quotation" }).disabled, false);
    failAuth = false; await clickCreate(); await saved(); assert.equal(records.size, 1);
  });
  console.log(`${passed} NEW QUOTATION DRAFT UI TESTS PASSED; ${failures} FAILED`);
  dom.window.close(); if (failures) process.exitCode = 1;
})().catch((error) => { console.error(error); cleanup(); dom.window.close(); process.exitCode = 1; });
