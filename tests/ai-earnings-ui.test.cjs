// Isolated React/DOM integration tests. Every record and request is synthetic;
// persistence is an account-scoped in-memory double, never a production service.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const vm = require("vm");
const assert = require("assert/strict");
const path = require("path");
const root = path.resolve(__dirname, "..");
const requireRepo = require("module").createRequire(root + "/package.json");
const React = require("react");
const ts = requireRepo("typescript");
const domain = requireRepo("./src/lib/ai-earnings.ts");
const TODAY = "2026-10-10";
const earnings = { ...domain, todayInMauritius: () => TODAY };
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3007/admin/x5-execution/ai-earnings",
  pretendToBeVisual: true,
});
for (const key of [
  "window", "document", "HTMLElement", "HTMLAnchorElement", "HTMLInputElement", "Element", "Node",
  "Event", "MouseEvent", "KeyboardEvent", "MutationObserver", "getComputedStyle",
]) global[key] = dom.window[key];
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
window.requestAnimationFrame = global.requestAnimationFrame;
HTMLElement.prototype.scrollIntoView = function () {};
const { render, screen, within, waitFor, cleanup, fireEvent, act } = require("@testing-library/react");

const API = "/api/admin/ai-earnings";
let account;
let saved;
let requests;
let confirmations;
let confirmation;
let delay;
let failNextPut;
let failNextGet;
let sessionStatus;
let sessionNetworkFailure;
let successfulPutScope;
let deferredNextGet;
function emptySnapshot(scope) {
  return { ledger: structuredClone(domain.EMPTY_AI_EARNINGS_LEDGER), revision: 0, accountScope: scope };
}
function reset() {
  account = "synthetic-account-A";
  saved = new Map([[account, emptySnapshot(account)], ["synthetic-account-B", emptySnapshot("synthetic-account-B")]]);
  requests = [];
  confirmations = [];
  confirmation = true;
  delay = 15;
  failNextPut = null;
  failNextGet = null;
  sessionStatus = 200;
  sessionNetworkFailure = false;
  successfulPutScope = null;
  deferredNextGet = null;
}
window.confirm = (message) => { confirmations.push(message); return confirmation; };
global.fetch = window.fetch = async (url, options = {}) => {
  const method = options.method || "GET";
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ url, method, body });
  if (url === "/api/admin/session") {
    assert.equal(method, "GET");
    if (sessionNetworkFailure) throw new Error("Synthetic session network outage");
    return Response.json({ session: { userId: account } }, { status: sessionStatus });
  }
  assert.equal(url, API, "The test must never access an unexpected endpoint");
  assert.ok(method === "GET" || method === "PUT");
  if (method === "GET") {
    if (deferredNextGet) {
      const pending = deferredNextGet;
      deferredNextGet = null;
      return pending;
    }
    if (failNextGet) {
      const failure = failNextGet; failNextGet = null;
      return Response.json({ error: "Synthetic read interruption" }, { status: failure });
    }
    return Response.json(saved.get(account));
  }
  await new Promise((resolve) => setTimeout(resolve, delay));
  if (failNextPut) {
    const failure = failNextPut; failNextPut = null;
    if (failure === "network") throw new Error("Synthetic network interruption");
    return Response.json({ error: "Synthetic save interruption" }, { status: failure });
  }
  if (body.accountScope !== account) {
    return Response.json({ error: "Account changed", code: "ACCOUNT_CHANGED" }, { status: 409 });
  }
  const base = saved.get(account);
  if (body.revision !== base.revision) {
    return Response.json({ error: "A newer saved ledger exists" }, { status: 409 });
  }
  const next = {
    ledger: domain.validateAiEarningsLedger(body.ledger),
    revision: base.revision + 1,
    accountScope: account,
  };
  // A malformed success response must also be rejected by the client.
  if (successfulPutScope) return Response.json({ ...next, accountScope: successfulPutScope });
  saved.set(account, next);
  return Response.json(next);
};
const code = ts.transpileModule(fs.readFileSync(root + "/src/components/admin/aura/AiEarnings.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleObj = { exports: {} };
const customRequire = (name) => name === "next/link"
  ? { __esModule: true, default: (props) => React.createElement("a", props) }
  : name === "@/lib/ai-earnings"
    ? earnings
    : name.endsWith(".module.css")
      ? { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }
      : requireRepo(name);
vm.runInNewContext(code, {
  module: moduleObj, exports: moduleObj.exports, require: customRequire,
  console, window, document, crypto: require("crypto").webcrypto, fetch: global.fetch,
  AbortSignal, HTMLElement, HTMLAnchorElement, Element, URL, queueMicrotask, setTimeout, clearTimeout,
}, { filename: "AiEarnings.test.js" });
const App = moduleObj.exports.default;
const currentSaved = () => saved.get(account);
const puts = () => requests.filter((request) => request.method === "PUT");
const form = () => screen.getByRole("form", { name: "AI earnings project form" });
const project = (name) => screen.getByRole("heading", { name, exact: true }).closest("article");
const money = domain.formatEarningsMoney;
const user = {
  click: async (element) => { await act(async () => { fireEvent.click(element); }); },
  fill: async (element, value) => { await act(async () => { fireEvent.change(element, { target: { value } }); }); },
};
async function mount() {
  render(React.createElement(App));
  await waitFor(() => assert.equal(screen.getByRole("button", { name: "New project", exact: true }).disabled, false));
}
async function startProject(name = "Synthetic AI layout project", currency = "MUR", agreed = "1000.00") {
  await user.click(screen.getByRole("button", { name: "New project", exact: true }));
  const fields = within(form());
  await user.fill(fields.getByLabelText(/^Project name/), name);
  await user.fill(fields.getByLabelText(/^Client or customer/), "Synthetic client");
  await user.fill(fields.getByLabelText(/^What was sold/), "Delivered layout files");
  await user.fill(fields.getByLabelText(/^How AI helped/), "AI assisted draft variants, then human review");
  await user.fill(fields.getByLabelText(/^Currency/), currency);
  await user.fill(fields.getByLabelText(/^Agreed total/), agreed);
  return form();
}
async function addEvent(kind, amount, date = "2026-10-05", note = "Synthetic evidence") {
  const payment = kind === "payment";
  await user.click(within(form()).getByRole("button", { name: payment ? "Add received payment" : "Add direct cost" }));
  const region = within(form()).getByRole("region", { name: payment ? "Received payments" : "Direct costs" });
  const rows = within(region).getAllByRole("group");
  const fields = within(rows.at(-1));
  await user.fill(fields.getByLabelText(payment ? "Payment date" : "Direct cost date"), date);
  await user.fill(fields.getByLabelText(payment ? /^Payment amount/ : /^Direct cost amount/), amount);
  await user.fill(fields.getByLabelText("Reference or note"), note);
}
async function submit() {
  await user.click(within(form()).getByRole("button", { name: "Save project", exact: true }));
  await waitFor(() => assert.equal(Boolean(screen.queryByRole("form", { name: "AI earnings project form" })), false));
  assert.ok(document.activeElement === screen.getByRole("button", { name: "New project", exact: true }), "Successful save restores keyboard focus to New project");
}
function metric(currency, label) {
  const group = screen.getByRole("heading", { name: `${currency} overview` }).parentElement.parentElement;
  return within(group).getByText(label, { exact: true }).parentElement.querySelector("strong").textContent;
}
function assertMetric(currency, label, amount) {
  assert.equal(metric(currency, label), money(amount, currency));
}
async function test(name, fn) {
  reset();
  try { await fn(); console.log("PASS " + name); }
  finally { cleanup(); }
}

(async () => {
  await test("empty ledger makes no historical-zero or estimated-income claim", async () => {
    await mount();
    assert.ok(screen.getByRole("heading", { name: "Your first earnings record starts here" }));
    assert.ok(screen.getByText(/This is an empty ledger, not a claim about your past earnings/));
    assert.equal(Boolean(screen.queryByRole("region", { name: "AI earnings totals" })), false);
    assert.equal(puts().length, 0);
    await startProject("Agreed but unpaid", "MUR", "1000.00");
    assert.ok(within(form()).getByText(/Use a confirmed agreement, not a quote/));
    assert.ok(within(form()).getByText(/Only money actually received/));
    await submit();
    assertMetric("MUR", "Confirmed receipts", 0);
    assertMetric("MUR", "Pending agreed balance", 100000);
    assertMetric("MUR", "Net after recorded costs", 0);
    assert.ok(screen.getByText(/Costs incomplete or unknown/));
    assert.ok(screen.getByText(/Provisional · complete profit not known/));
    assert.ok(screen.getByText(/Quotes, estimates and time savings are never received income/));
  });

  await test("partial payments, actual costs, unknown costs, persistence and stable edit IDs", async () => {
    await mount();
    await startProject();
    await addEvent("payment", "250.25", "2026-10-02", "Synthetic partial receipt A");
    await addEvent("payment", "100.50", "2026-10-05", "Synthetic partial receipt B");
    await addEvent("cost", "50.10", "2026-10-03", "Synthetic paid tool cost");
    assert.equal(within(form()).getByLabelText(/^Currency/).disabled, true);
    await submit();
    const first = structuredClone(currentSaved().ledger.entries[0]);
    assert.equal(first.agreedAmountMinor, 100000);
    assert.deepEqual(first.payments.map((event) => event.amountMinor), [25025, 10050]);
    assert.deepEqual(first.costs.map((event) => event.amountMinor), [5010]);
    assert.equal(first.costsComplete, false);
    assertMetric("MUR", "Confirmed receipts", 35075);
    assertMetric("MUR", "Pending agreed balance", 64925);
    assertMetric("MUR", "Recorded direct costs", 5010);
    assertMetric("MUR", "Net after recorded costs", 30065);
    cleanup();
    await mount();
    assert.ok(project(first.project));
    assertMetric("MUR", "Confirmed receipts", 35075);
    await user.click(within(project(first.project)).getByRole("button", { name: "Edit & add payments" }));
    assert.equal(within(form()).getByLabelText(/^Project name/).value, first.project);
    assert.equal(within(form()).getByLabelText(/^Agreed total/).value, "1000.00");
    assert.deepEqual(within(form()).getAllByLabelText(/^Payment amount/).map((input) => input.value), ["250.25", "100.50"]);
    await user.fill(within(form()).getByLabelText(/^Project name/), "Synthetic updated project");
    await addEvent("payment", "200.00", "2026-10-07", "Synthetic partial receipt C");
    await user.click(within(form()).getByRole("checkbox", { name: /I’ve recorded all direct costs/ }));
    await submit();
    const edited = currentSaved().ledger.entries[0];
    assert.equal(currentSaved().ledger.entries.length, 1);
    assert.equal(edited.id, first.id);
    assert.deepEqual(edited.payments.slice(0, 2), first.payments);
    assert.deepEqual(edited.costs, first.costs);
    assert.equal(new Set([edited.id, ...edited.payments.map((event) => event.id), ...edited.costs.map((event) => event.id)]).size, 5);
    assert.equal(edited.costsComplete, true);
    assertMetric("MUR", "Confirmed receipts", 55075);
    assertMetric("MUR", "Pending agreed balance", 44925);
    assertMetric("MUR", "Net after recorded costs", 50065);
    assert.ok(screen.getByText(/Cash-basis net · not full business profit/));
    assert.ok(screen.getByText("Costs complete", { exact: true }));
  });

  await test("rapid submit/clicks send one save and lock fields until completion", async () => {
    await mount();
    const editor = await startProject();
    await addEvent("payment", "20.00");
    delay = 100;
    const button = within(editor).getByRole("button", { name: "Save project", exact: true });
    await act(async () => { fireEvent.click(button); fireEvent.click(button); fireEvent.submit(editor); });
    assert.equal(puts().length, 1);
    assert.equal(within(editor).getByLabelText(/^Project name/).closest("fieldset").disabled, true);
    assert.equal(within(editor).getByRole("button", { name: "Saving…" }).disabled, true);
    assert.equal(within(editor).getByRole("button", { name: "Cancel", exact: true }).disabled, true);
    await waitFor(() => assert.equal(Boolean(screen.queryByRole("form")), false));
    assert.equal(puts().length, 1);
    assert.equal(currentSaved().ledger.entries.length, 1);
    assert.equal(currentSaved().revision, 1);
  });

  for (const failure of [503, "network"]) {
    await test(`${failure} save failure preserves unsaved draft and retries its stable IDs`, async () => {
      await mount();
      await startProject("Synthetic retry draft");
      await addEvent("payment", "55.55");
      failNextPut = failure;
      await user.click(within(form()).getByRole("button", { name: "Save project", exact: true }));
      await screen.findByRole("alert");
      assert.equal(within(form()).getByLabelText(/^Project name/).value, "Synthetic retry draft");
      assert.equal(within(form()).getByLabelText(/^Payment amount/).value, "55.55");
      assert.equal(currentSaved().ledger.entries.length, 0);
      assert.equal(currentSaved().revision, 0);
      assert.equal(within(form()).getByRole("button", { name: "Save project", exact: true }).disabled, false);
      const attempted = structuredClone(puts()[0].body);
      await submit();
      assert.equal(puts().length, 2);
      assert.deepEqual(puts()[1].body, attempted);
      assert.equal(currentSaved().ledger.entries[0].id, attempted.ledger.entries[0].id);
      assert.equal(currentSaved().ledger.entries[0].payments[0].id, attempted.ledger.entries[0].payments[0].id);
      assert.equal(Boolean(screen.queryByRole("alert")), false);
    });
  }

  await test("revision conflict cannot overwrite; only confirmed reload discards the draft", async () => {
    await mount();
    await startProject("Synthetic shared project");
    await submit();
    await user.click(within(project("Synthetic shared project")).getByRole("button", { name: "Edit & add payments" }));
    await user.fill(within(form()).getByLabelText(/^Project name/), "Synthetic stale draft");
    const server = structuredClone(currentSaved());
    server.revision += 1;
    server.ledger.entries[0].project = "Synthetic newer remote version";
    saved.set(account, server);
    await user.click(within(form()).getByRole("button", { name: "Save project", exact: true }));
    const reload = await screen.findByRole("button", { name: "Load latest saved ledger" });
    assert.equal(currentSaved().ledger.entries[0].project, "Synthetic newer remote version");
    assert.equal(within(form()).getByLabelText(/^Project name/).value, "Synthetic stale draft");
    assert.equal(within(form()).getByRole("button", { name: "Save project", exact: true }).disabled, true);
    assert.equal(within(form()).getByLabelText(/^Project name/).closest("fieldset").disabled, true);
    const attempts = puts().length;
    await act(async () => { fireEvent.submit(form()); });
    assert.equal(puts().length, attempts);
    confirmation = false;
    await user.click(reload);
    assert.equal(within(form()).getByLabelText(/^Project name/).value, "Synthetic stale draft");
    assert.match(confirmations.at(-1), /Discard this unsaved draft/);
    confirmation = true;
    await user.click(reload);
    await screen.findByRole("heading", { name: "Synthetic newer remote version" });
    assert.equal(Boolean(screen.queryByRole("form")), false);
    assert.equal(Boolean(screen.queryByRole("alert")), false);
    assert.equal(puts().length, attempts);
    await user.click(within(project("Synthetic newer remote version")).getByRole("button", { name: "Edit & add payments" }));
    await user.fill(within(form()).getByLabelText(/^Project name/), "Synthetic safely rebased edit");
    await submit();
    assert.equal(puts().at(-1).body.revision, server.revision);
    assert.equal(currentSaved().ledger.entries[0].project, "Synthetic safely rebased edit");
  });

  await test("account change on PUT drops private draft and rejects wrong-account writes", async () => {
    await mount();
    await startProject("Synthetic private A draft");
    await addEvent("payment", "77.00");
    account = "synthetic-account-B";
    await user.click(within(form()).getByRole("button", { name: "Save project", exact: true }));
    await screen.findByText(/Your signed-in account changed or your session expired/);
    assert.equal(Boolean(screen.queryByRole("form")), false);
    assert.equal(Boolean(screen.queryByDisplayValue("Synthetic private A draft")), false);
    assert.equal(saved.get("synthetic-account-A").ledger.entries.length, 0);
    assert.equal(saved.get("synthetic-account-B").ledger.entries.length, 0);
    assert.equal(puts()[0].body.accountScope, "synthetic-account-A");
    await user.click(screen.getByRole("button", { name: "Open current account’s ledger" }));
    await waitFor(() => assert.equal(screen.getByRole("button", { name: "New project", exact: true }).disabled, false));
    await startProject("Synthetic B project", "USD", "");
    await submit();
    assert.equal(puts().at(-1).body.accountScope, "synthetic-account-B");
    assert.equal(currentSaved().ledger.entries[0].project, "Synthetic B project");
  });

  await test("focus account check discards saved private view and unsaved draft", async () => {
    await mount();
    await startProject("Synthetic private saved A project");
    await submit();
    await startProject("Synthetic private unsaved A project");
    account = "synthetic-account-B";
    await act(async () => { fireEvent(window, new Event("focus")); });
    await screen.findByText(/No draft was copied to another account/);
    assert.equal(Boolean(screen.queryByRole("form")), false);
    assert.equal(Boolean(screen.queryByRole("heading", { name: "Synthetic private saved A project" })), false);
    assert.equal(Boolean(screen.queryByDisplayValue("Synthetic private unsaved A project")), false);
    assert.equal(saved.get("synthetic-account-A").ledger.entries.length, 1);
    assert.equal(saved.get("synthetic-account-B").ledger.entries.length, 0);
    assert.equal(puts().length, 1);
  });

  await test("account change during in-flight save prevents late response restoring private draft", async () => {
    await mount();
    await startProject("Synthetic in-flight A draft");
    delay = 100;
    await user.click(within(form()).getByRole("button", { name: "Save project", exact: true }));
    account = "synthetic-account-B";
    await act(async () => { fireEvent(window, new Event("focus")); });
    await screen.findByText(/No draft was copied to another account/);
    await user.click(screen.getByRole("button", { name: "Open current account’s ledger" }));
    await waitFor(() => assert.equal(screen.getByRole("button", { name: "New project", exact: true }).disabled, false));
    assert.equal(Boolean(screen.queryByRole("form")), false);
    assert.equal(Boolean(screen.queryByDisplayValue("Synthetic in-flight A draft")), false);
    assert.equal(currentSaved().ledger.entries.length, 0);
    assert.equal(saved.get("synthetic-account-A").ledger.entries.length, 0);
  });

  await test("mismatched successful account response is rejected", async () => {
    await mount();
    await startProject("Synthetic wrong-success draft");
    successfulPutScope = "synthetic-account-B";
    await user.click(within(form()).getByRole("button", { name: "Save project", exact: true }));
    await screen.findByText(/No draft was copied to another account/);
    assert.equal(Boolean(screen.queryByRole("form")), false);
    assert.equal(currentSaved().ledger.entries.length, 0);
  });

  await test("temporary focus network failure preserves draft; expired session removes it", async () => {
    await mount();
    await startProject("Synthetic offline draft");
    sessionNetworkFailure = true;
    await act(async () => { fireEvent(window, new Event("focus")); });
    assert.equal(within(form()).getByLabelText(/^Project name/).value, "Synthetic offline draft");
    assert.equal(Boolean(screen.queryByRole("alert")), false);
    sessionNetworkFailure = false;
    sessionStatus = 401;
    await act(async () => { fireEvent(window, new Event("focus")); });
    await screen.findByText(/No draft was copied to another account/);
    assert.equal(Boolean(screen.queryByRole("form")), false);
    assert.equal(puts().length, 0);
  });

  await test("archive confirmation, excluded totals and lossless restore", async () => {
    await mount();
    await startProject("Synthetic archive target");
    await addEvent("payment", "400.00");
    await addEvent("cost", "40.00");
    await submit();
    const original = structuredClone(currentSaved().ledger.entries[0]);
    confirmation = false;
    await user.click(within(project(original.project)).getByRole("button", { name: "Archive", exact: true }));
    assert.equal(puts().length, 1);
    assert.equal(currentSaved().ledger.entries[0].archived, false);
    confirmation = true;
    const archive = within(project(original.project)).getByRole("button", { name: "Archive", exact: true });
    await act(async () => { fireEvent.click(archive); fireEvent.click(archive); });
    await waitFor(() => assert.equal(currentSaved().ledger.entries[0].archived, true));
    assert.equal(puts().length, 2);
    assert.equal(Boolean(screen.queryByRole("region", { name: "AI earnings totals" })), false);
    assert.equal(Boolean(screen.queryByRole("heading", { name: original.project })), false);
    await user.click(screen.getByRole("button", { name: "Archived (1)" }));
    assert.ok(screen.getByRole("heading", { name: "Archived projects" }));
    const restore = within(project(original.project)).getByRole("button", { name: "Restore", exact: true });
    await act(async () => { fireEvent.click(restore); fireEvent.click(restore); });
    await waitFor(() => assert.equal(currentSaved().ledger.entries[0].archived, false));
    assert.equal(puts().length, 3);
    assert.deepEqual(currentSaved().ledger.entries[0], original);
    assertMetric("MUR", "Confirmed receipts", 40000);
    assertMetric("MUR", "Recorded direct costs", 4000);
    assertMetric("MUR", "Net after recorded costs", 36000);
    await user.click(screen.getByRole("button", { name: "Show active projects" }));
    assert.ok(project(original.project));
  });

  await test("currency groups stay separate; earlier receipts only reduce agreed pending balance", async () => {
    await mount();
    await startProject("Synthetic MUR work", "MUR", "1000.00");
    await addEvent("payment", "100.00", "2026-09-30", "Synthetic earlier receipt");
    await addEvent("payment", "200.00", "2026-10-04");
    await addEvent("cost", "25.00");
    await submit();
    await startProject("Synthetic USD work", "USD", "500.00");
    await addEvent("payment", "50.00");
    await addEvent("cost", "10.00");
    await submit();
    assertMetric("MUR", "Confirmed receipts", 20000);
    assertMetric("MUR", "Pending agreed balance", 70000);
    assertMetric("MUR", "Recorded direct costs", 2500);
    assertMetric("MUR", "Net after recorded costs", 17500);
    assertMetric("USD", "Confirmed receipts", 5000);
    assertMetric("USD", "Pending agreed balance", 45000);
    assertMetric("USD", "Recorded direct costs", 1000);
    assertMetric("USD", "Net after recorded costs", 4000);
    assert.ok(screen.getByText(/Currencies stay separate; there is no exchange-rate conversion/));
    assert.equal(screen.getAllByRole("heading", { name: /overview$/ }).length, 2);
  });

  await test("accessible form labels, required evidence, row removal, unknown agreement and cancel", async () => {
    await mount();
    await startProject("Synthetic accessible project", "EUR", "");
    const fields = within(form());
    assert.ok(document.activeElement === fields.getByRole("heading", { name: "New project", exact: true }));
    for (const label of [/^Project name/, /^What was sold/, /^How AI helped/]) assert.equal(fields.getByLabelText(label).required, true);
    await addEvent("payment", "15.00");
    await addEvent("cost", "2.00");
    for (const label of ["Payment date", /^Payment amount/, "Direct cost date", /^Direct cost amount/]) assert.ok(fields.getByLabelText(label));
    assert.equal(fields.getByLabelText("Payment date").max, TODAY);
    await user.click(fields.getByRole("button", { name: "Remove payment 1" }));
    await user.click(fields.getByRole("button", { name: "Remove direct cost 1" }));
    assert.equal(Boolean(fields.queryByLabelText(/^Payment amount/)), false);
    assert.equal(Boolean(fields.queryByLabelText(/^Direct cost amount/)), false);
    assert.equal(fields.getByLabelText(/^Currency/).disabled, false);
    confirmation = false;
    await user.click(fields.getByRole("button", { name: "Cancel", exact: true }));
    assert.equal(within(form()).getByLabelText(/^Project name/).value, "Synthetic accessible project");
    confirmation = true;
    await user.click(fields.getByRole("button", { name: "Cancel", exact: true }));
    assert.equal(Boolean(screen.queryByRole("form")), false);
    assert.equal(puts().length, 0);
    assert.ok(document.activeElement === screen.getByRole("button", { name: "New project", exact: true }));
    await startProject("Synthetic unknown agreement", "EUR", "");
    await submit();
    assert.equal(currentSaved().ledger.entries[0].agreedAmountMinor, null);
    assert.ok(within(project("Synthetic unknown agreement")).getByText("Not agreed / unknown"));
  });

  await test("invalid money is rejected locally without a persistence attempt", async () => {
    await mount();
    await startProject("Synthetic invalid money");
    await addEvent("payment", "12.345");
    await user.click(within(form()).getByRole("button", { name: "Save project", exact: true }));
    assert.match(screen.getByRole("alert").textContent, /positive amount with at most two decimal places/);
    assert.equal(puts().length, 0);
    assert.equal(within(form()).getByLabelText(/^Payment amount/).value, "12.345");
    await user.fill(within(form()).getByLabelText(/^Payment amount/), "12.34");
    await submit();
    assert.equal(currentSaved().ledger.entries[0].payments[0].amountMinor, 1234);
  });

  await test("initial read failure can retry without writing an empty ledger", async () => {
    failNextGet = 503;
    render(React.createElement(App));
    await screen.findByRole("alert");
    assert.equal(Boolean(screen.queryByRole("region", { name: "AI earnings totals" })), false);
    assert.equal(Boolean(screen.queryByRole("heading", { name: "Your first earnings record starts here" })), false);
    assert.equal(screen.getByRole("button", { name: "New project", exact: true }).disabled, true);
    await user.click(screen.getByRole("button", { name: "Open current account’s ledger" }));
    await screen.findByRole("heading", { name: "Your first earnings record starts here" });
    assert.equal(puts().length, 0);
  });

  for (const refocus of [true, false]) {
    await test(`late initial A response never exposes A after account switch (${refocus ? "with focus" : "without focus"})`, async () => {
      await mount();
      await startProject("Synthetic secret old-account record");
      await addEvent("payment", "88.00");
      await submit();
      const capturedA = structuredClone(currentSaved());
      cleanup();
      let release;
      deferredNextGet = new Promise((resolve) => { release = () => resolve(Response.json(capturedA)); });
      render(React.createElement(App));
      await screen.findByText("Opening your private ledger…");
      account = "synthetic-account-B";
      if (refocus) {
        await act(async () => { fireEvent(window, new Event("focus")); });
        await screen.findByRole("heading", { name: "Your first earnings record starts here" });
      }
      await act(async () => { release(); });
      if (!refocus) {
        await screen.findByText(/No draft was copied to another account/);
        await user.click(screen.getByRole("button", { name: "Open current account’s ledger" }));
        await screen.findByRole("heading", { name: "Your first earnings record starts here" });
      }
      assert.equal(Boolean(screen.queryByRole("heading", { name: "Synthetic secret old-account record" })), false);
      assert.equal(Boolean(screen.queryByRole("region", { name: "AI earnings totals" })), false);
      assert.equal(saved.get("synthetic-account-B").ledger.entries.length, 0);
      assert.equal(saved.get("synthetic-account-A").ledger.entries.length, 1);
    });
  }

  await test("same-account SPA remount recovers unsaved fields and original stable IDs", async () => {
    await mount();
    await startProject("Synthetic navigation recovery");
    await addEvent("payment", "123.45");
    failNextPut = 503;
    await user.click(within(form()).getByRole("button", { name: "Save project", exact: true }));
    await screen.findByRole("alert");
    const originalAttempt = structuredClone(puts()[0].body);
    cleanup();
    render(React.createElement(App));
    await screen.findByText(/Your unsaved draft was recovered. Review it/);
    assert.equal(within(form()).getByLabelText(/^Project name/).value, "Synthetic navigation recovery");
    assert.equal(within(form()).getByLabelText(/^Payment amount/).value, "123.45");
    assert.equal(within(form()).getByRole("button", { name: "Save project", exact: true }).disabled, false);
    assert.ok(document.activeElement === within(form()).getByRole("heading", { name: "New project", exact: true }));
    assert.equal(window.localStorage.length, 0);
    assert.equal(window.sessionStorage.length, 0);
    await submit();
    assert.deepEqual(puts()[1].body, originalAttempt);
    cleanup();
    await mount();
    assert.equal(Boolean(screen.queryByRole("form")), false, "A saved draft must not reappear after another remount");
    assert.equal(currentSaved().ledger.entries.length, 1);
  });

  await test("repeated SPA recovery retains original revision and never silently rebases a stale draft", async () => {
    await mount();
    await startProject("Synthetic recovery base");
    await submit();
    await user.click(within(project("Synthetic recovery base")).getByRole("button", { name: "Edit & add payments" }));
    await user.fill(within(form()).getByLabelText(/^Project name/), "Synthetic recovery stale draft");
    const server = structuredClone(currentSaved());
    server.revision += 1;
    server.ledger.entries[0].project = "Synthetic recovery newer saved version";
    saved.set(account, server);
    for (let pass = 0; pass < 2; pass += 1) {
      cleanup();
      render(React.createElement(App));
      await screen.findByText(/saved ledger changed while you were away/);
      assert.equal(within(form()).getByLabelText(/^Project name/).value, "Synthetic recovery stale draft");
      assert.equal(within(form()).getByRole("button", { name: "Save project", exact: true }).disabled, true);
      await act(async () => { fireEvent.submit(form()); });
      assert.equal(puts().length, 1);
      assert.equal(currentSaved().ledger.entries[0].project, server.ledger.entries[0].project);
    }
    confirmation = false;
    await user.click(within(form()).getByRole("button", { name: "Cancel", exact: true }));
    assert.equal(within(form()).getByLabelText(/^Project name/).value, "Synthetic recovery stale draft");
    confirmation = true;
    await user.click(within(form()).getByRole("button", { name: "Cancel", exact: true }));
    await waitFor(() => assert.equal(screen.getByRole("button", { name: "New project", exact: true }).disabled, false));
    assert.equal(Boolean(screen.queryByRole("form")), false);
    assert.equal(Boolean(screen.queryByRole("alert")), false);
    assert.ok(project("Synthetic recovery newer saved version"));
    assert.equal(within(project("Synthetic recovery newer saved version")).getByRole("button", { name: "Edit & add payments" }).disabled, false);
    assert.ok(document.activeElement === screen.getByRole("button", { name: "New project", exact: true }));
  });

  await test("SPA recovery never copies an A draft into B or retains it for a later A visit", async () => {
    await mount();
    await startProject("Synthetic unrecoverable A secret");
    await addEvent("payment", "45.00");
    cleanup();
    account = "synthetic-account-B";
    await mount();
    assert.equal(Boolean(screen.queryByRole("form")), false);
    assert.equal(Boolean(screen.queryByDisplayValue("Synthetic unrecoverable A secret")), false);
    assert.equal(currentSaved().ledger.entries.length, 0);
    cleanup();
    account = "synthetic-account-A";
    await mount();
    assert.equal(Boolean(screen.queryByRole("form")), false);
    assert.equal(puts().length, 0);
  });

  await test("same-tab external SPA link and tab close protect drafts; confirmed leave discards recovery", async () => {
    await mount();
    await startProject("Synthetic navigation guard draft");
    const anchor = document.createElement("a");
    anchor.href = "/admin/orders";
    anchor.textContent = "Synthetic other admin navigation";
    let navigations = 0;
    anchor.addEventListener("click", (event) => { navigations += 1; event.preventDefault(); });
    document.body.appendChild(anchor);
    try {
      confirmation = false;
      const blocked = new MouseEvent("click", { bubbles: true, cancelable: true });
      await act(async () => { anchor.dispatchEvent(blocked); });
      assert.equal(blocked.defaultPrevented, true);
      assert.equal(navigations, 0);
      assert.match(confirmations.at(-1), /Leave and discard this unsaved project draft/);
      assert.equal(within(form()).getByLabelText(/^Project name/).value, "Synthetic navigation guard draft");
      const closing = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(closing);
      assert.equal(closing.defaultPrevented, true);
      confirmation = true;
      await user.click(anchor);
      assert.equal(navigations, 1);
      cleanup();
      await mount();
      assert.equal(Boolean(screen.queryByRole("form")), false);
      assert.equal(puts().length, 0);
    } finally { anchor.remove(); }
  });

  console.log("ALL AI EARNINGS UI STATE TESTS PASSED");
  dom.window.close();
})().catch((error) => {
  console.error(error);
  cleanup();
  dom.window.close();
  process.exitCode = 1;
});
