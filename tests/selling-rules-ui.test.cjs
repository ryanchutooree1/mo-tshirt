// Synthetic local UI tests. No real database, credentials, commercial rules or quotations.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "..");
const requireRepo = createRequire(root + "/package.json");
const React = requireRepo("react");
const ts = requireRepo("typescript");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3007/admin/quotation-approval/selling-rules", pretendToBeVisual: true });
for (const key of ["window", "document", "HTMLElement", "HTMLDialogElement", "Element", "Node", "Event", "MouseEvent", "MutationObserver", "getComputedStyle"]) global[key] = dom.window[key];
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { if (this.hasAttribute("open")) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } };
const { render, screen, fireEvent, cleanup, act, waitFor } = requireRepo("@testing-library/react");
const rules = requireRepo("./src/lib/selling-rules.ts");
const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(root + "/" + file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, console, window, document, navigator, structuredClone, AbortSignal, fetch: (...args) => global.fetch(...args), require(name) {
    if (name === "next/dynamic") return { __esModule: true, default: () => load("src/components/admin/selling-rules/SellingRulesWorkspace.tsx").default };
    if (name === "next/link") return { __esModule: true, default: ({ href, children, ...rest }) => React.createElement("a", { href, ...rest }, children) };
    if (name === "@/lib/selling-rules") return rules;
    if (name === "./SellingRulesWorkspace") return load("src/components/admin/selling-rules/SellingRulesWorkspace.tsx");
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    return requireRepo(name);
  } }, { filename: file });
  modules.set(file, mod.exports); return mod.exports;
}
const App = load("src/components/admin/selling-rules/SellingRulesWorkspace.tsx").default;
const Reference = load("src/components/admin/selling-rules/SellingRulesReference.tsx").default;
let saved, puts, gets, copied, responseStatus, failLoad, confirmation, pending;
function reset() {
  const config = structuredClone(rules.EMPTY_SELLING_RULES_CONFIG);
  for (const [index, offer] of rules.SELLING_RULE_OFFERS.entries()) config.offers[offer.id].priceMUR = 17.5 + index;
  config.rules.inclusions = "garment_and_print"; config.rules.poloMethod = "vinyl"; config.rules.depositPercent = 50; config.rules.delivery = "customer_paid"; config.rules.bulkReviewMinimum = 11;
  config.rules.deliveryOptions = [{ id: "post_standard", label: "Synthetic post", priceMUR: 3.5, description: "Synthetic local fixture service" }];
  saved = { config, revision: 1, canEdit: true, viewerId: "synthetic-owner", updatedAt: "2026-01-01T12:00:00.000Z", updatedBy: "Synthetic owner", history: [] };
  puts = []; gets = 0; copied = ""; responseStatus = 0; failLoad = false; confirmation = true; pending = null;
}
window.confirm = () => confirmation;
Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => { copied = text; } }, configurable: true });
global.fetch = async (url, options) => {
  assert.equal(url, "/api/admin/quotes/selling-rules");
  if (options?.method === "PUT") {
    const body = JSON.parse(options.body); puts.push(body);
    if (pending) await pending.promise;
    if (responseStatus) return Response.json({ error: responseStatus === 409 ? "Rules changed in another tab" : "Save interrupted" }, { status: responseStatus });
    assert.equal(body.revision, saved.revision);
    saved = { ...saved, config: rules.validateSellingRulesConfig(body.config), revision: saved.revision + 1 };
  } else { gets++; if (failLoad) return Response.json({ error: "Synthetic unavailable" }, { status: 503 }); }
  return Response.json(saved);
};
const mount = async (props = {}) => { render(React.createElement(App, props)); await waitFor(() => assert.ok(screen.getByRole("heading", { name: "Choose your print" }))); };
const click = async name => { await act(async () => { fireEvent.click(screen.getByRole("button", { name })); }); };
let passed = 0, failures = 0;
async function test(name, fn) { reset(); try { await fn(); passed++; console.log("PASS " + name); } catch (error) { failures++; console.error("FAIL " + name + "\n" + error.stack); } finally { cleanup(); } }
(async () => {
  await test("reads five saved offers without writing and keeps unknowns explicit", async () => {
    await mount(); assert.equal(puts.length, 0); assert.equal(screen.getAllByRole("button", { pressed: false }).length, 4); assert.equal(screen.getAllByText("Needs confirmation").length >= 3, true); assert.ok(screen.getByText("Indicative"));
  });
  await test("quantity, order-level delivery and bulk review use the selected rules", async () => {
    await mount(); fireEvent.change(screen.getByLabelText("How many items?"), { target: { value: "11" } }); fireEvent.change(screen.getByLabelText("Delivery / collection"), { target: { value: "post_standard" } });
    assert.ok(screen.getByText("Rs 192.5")); assert.ok(screen.getByText("Rs 196")); assert.ok(screen.getByText("Bulk price review"));
    await click("Copy internal estimate"); assert.match(copied, /INTERNAL ESTIMATE/); assert.match(copied, /Selling rules version 1/); assert.match(copied, /no discount applied/); assert.equal(puts.length, 0);
  });
  await test("invalid quantity clears the calculation and cannot copy a misleading result", async () => {
    await mount(); fireEvent.change(screen.getByLabelText("How many items?"), { target: { value: "1.5" } }); assert.match(screen.getByText(/Enter a whole number/).textContent, /1,000,000/); assert.equal(screen.getByRole("button", { name: "Copy internal estimate" }).disabled, true);
  });
  await test("owner saves only the intended price without clearing hidden policies", async () => {
    saved.config.rules.rushPolicy = "Synthetic approved policy"; await mount(); await click("Edit prices"); fireEvent.change(screen.getByLabelText("T-shirt · small front price"), { target: { value: "23.25" } }); await click("Save rules");
    await waitFor(() => assert.ok(screen.getByRole("status"))); assert.equal(puts.length, 1); assert.equal(saved.config.offers.tee_small_front.priceMUR, 23.25); assert.equal(saved.config.rules.rushPolicy, "Synthetic approved policy"); assert.equal(saved.revision, 2);
  });
  await test("cancel and Escape retain unsaved edits when discard is declined", async () => {
    await mount(); await click("Edit prices"); fireEvent.change(screen.getByLabelText("T-shirt · small front price"), { target: { value: "99" } }); confirmation = false; await click("Cancel"); assert.equal(screen.getByRole("dialog").open, true); fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true })); assert.equal(screen.getByRole("dialog").open, true); confirmation = true; await click("Cancel"); assert.equal(puts.length, 0); assert.equal(saved.config.offers.tee_small_front.priceMUR, 17.5);
  });
  await test("in-flight save prevents later field edits and repeat submissions", async () => {
    await mount(); await click("Edit prices"); fireEvent.change(screen.getByLabelText("T-shirt · small front price"), { target: { value: "21" } }); let resolve; pending = { promise: new Promise(done => { resolve = done; }) };
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save rules" })); });
    assert.equal(screen.getByLabelText("T-shirt · small front price").closest("fieldset").disabled, true); assert.equal(screen.getByRole("button", { name: "Saving…" }).disabled, true); assert.equal(screen.getByRole("button", { name: "Cancel" }).disabled, true); assert.equal(puts.length, 1);
    await act(async () => resolve()); await waitFor(() => assert.ok(screen.getByText(/Selling rules saved/)));
  });
  await test("stale revision preserves the draft, blocks overwrite and supports explicit reload", async () => {
    await mount(); await click("Edit prices"); fireEvent.change(screen.getByLabelText("T-shirt · small front price"), { target: { value: "22" } }); responseStatus = 409; await click("Save rules"); assert.equal(screen.getByLabelText("T-shirt · small front price").value, "22"); assert.equal(screen.getByRole("button", { name: "Save rules" }).disabled, true); responseStatus = 0; await click("Load latest saved rules"); await waitFor(() => assert.ok(screen.getByRole("heading", { name: "Choose your print" }))); assert.equal(puts.length, 1); assert.equal(saved.config.offers.tee_small_front.priceMUR, 17.5);
  });
  await test("read-only team and embedded reference cannot edit configuration", async () => {
    saved.canEdit = false; await mount(); assert.equal(screen.queryByRole("button", { name: "Edit prices" }), null); assert.equal(screen.queryByRole("button", { name: "Edit details" }), null); assert.equal(puts.length, 0);
  });
  await test("failed initial read never presents an empty writable configuration", async () => {
    failLoad = true; render(React.createElement(App)); await waitFor(() => assert.ok(screen.getByRole("alert"))); assert.equal(screen.queryByRole("button", { name: "Set prices" }), null); assert.equal(puts.length, 0); failLoad = false; await click("Try again"); await waitFor(() => assert.ok(screen.getByRole("heading", { name: "Choose your print" })));
  });
  await test("quote reference opens and closes repeatedly without writing or changing quote fields", async () => {
    render(React.createElement("div", null, React.createElement("input", { "aria-label": "Synthetic quote", defaultValue: "Keep this draft" }), React.createElement(Reference)));
    for (let i = 0; i < 2; i++) { await click("Selling rules"); await waitFor(() => assert.ok(screen.getByRole("heading", { name: "Choose your print" }))); assert.equal(screen.queryByRole("button", { name: "Edit prices" }), null); await click("Back to quote"); await waitFor(() => assert.equal(screen.queryByRole("heading", { name: "Choose your print" }), null)); }
    assert.equal(screen.getByLabelText("Synthetic quote").value, "Keep this draft"); assert.equal(puts.length, 0);
  });
  await test("SPA unmount and return offers owner-scoped draft recovery", async () => {
    await mount(); await click("Edit prices"); fireEvent.change(screen.getByLabelText("T-shirt · small front price"), { target: { value: "26" } }); cleanup();
    await mount(); await click("Recover edits"); assert.equal(screen.getByLabelText("T-shirt · small front price").value, "26"); assert.equal(puts.length, 0); await click("Cancel");
  });
  await test("a late save from an unmounted view cannot erase newer recovered edits", async () => {
    await mount(); await click("Edit prices"); fireEvent.change(screen.getByLabelText("T-shirt · small front price"), { target: { value: "41" } }); let resolve; pending = { promise: new Promise(done => { resolve = done; }) };
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save rules" }))); cleanup();
    await mount(); await click("Recover edits"); fireEvent.change(screen.getByLabelText("T-shirt · small front price"), { target: { value: "42" } });
    await act(async () => resolve()); cleanup(); await mount(); await click("Recover edits"); assert.equal(screen.getByLabelText("T-shirt · small front price").value, "42"); assert.equal(screen.getByRole("button", { name: "Save rules" }).disabled, true); await click("Cancel");
  });
  await test("draft recovery cannot overwrite a newer saved version", async () => {
    await mount(); await click("Edit prices"); fireEvent.change(screen.getByLabelText("T-shirt · small front price"), { target: { value: "29" } }); cleanup(); saved.revision = 2;
    await mount(); await click("Recover edits"); assert.equal(screen.getByLabelText("T-shirt · small front price").value, "29"); assert.equal(screen.getByRole("button", { name: "Save rules" }).disabled, true); await click("Cancel");
  });
  await test("successfully normalized policy text does not leave a stale recovery", async () => {
    await mount(); await click("Edit details"); fireEvent.change(screen.getByLabelText("Bulk orders"), { target: { value: "  Synthetic approved bulk rule  " } }); await click("Save rules"); cleanup(); await mount(); assert.equal(screen.queryByRole("button", { name: "Recover edits" }), null); assert.equal(saved.config.rules.bulkPolicy, "Synthetic approved bulk rule");
  });
  await test("a different signed-in owner cannot recover another owner's edits", async () => {
    await mount(); await click("Edit prices"); fireEvent.change(screen.getByLabelText("T-shirt · small front price"), { target: { value: "32" } }); cleanup(); saved.viewerId = "another-synthetic-owner";
    await mount(); assert.equal(screen.queryByRole("button", { name: "Recover edits" }), null); assert.equal(puts.length, 0);
  });
  await test("print-only configuration avoids garment-inclusive labels", async () => {
    saved.config.rules.inclusions = "print_only"; await mount(); assert.ok(screen.getByText("Printing only", { selector: "small" })); assert.equal(screen.queryByText("Garment estimate"), null);
  });
  if (process.env.SELLING_RULES_PREVIEW_DIR) {
    reset(); await mount(); const target = process.env.SELLING_RULES_PREVIEW_DIR; fs.mkdirSync(target, { recursive: true }); const css = fs.readFileSync(root + "/src/components/admin/selling-rules/selling-rules.module.css", "utf8");
    fs.writeFileSync(target + "/index.html", `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f6f8fa}button,input,select,textarea{font:inherit}dialog:not([open]){display:none}${css}</style></head><body>${document.body.innerHTML}</body></html>`); cleanup();
  }
  console.log(`${passed} SELLING RULES UI TESTS PASSED; ${failures} FAILED`); dom.window.close(); if (failures) process.exitCode = 1;
})().catch(error => { console.error(error); cleanup(); dom.window.close(); process.exitCode = 1; });
