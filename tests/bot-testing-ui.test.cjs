// Synthetic DOM tests: unexpected endpoints fail immediately. No live credentials or services.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const ts = require("typescript");
const React = require("react");
const domain = require("../src/lib/bot-testing.ts");
const access = require("../src/lib/admin-access.ts");
const profile = require("../src/lib/admin-profile.ts");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:3007/admin/bot-testing", pretendToBeVisual: true });
for (const key of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "MutationObserver", "getComputedStyle", "localStorage"]) global[key] = dom.window[key];
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
const { render, screen, within, act, fireEvent, cleanup, waitFor } = require("@testing-library/react");
let theme, account, isOwner, sessionStatus, requests, sessionGate, pathname, allowIntake, links;
global.fetch = window.fetch = async (url, options = {}) => {
  requests.push({ url, method: options.method || "GET", signal: options.signal });
  if (url === "/api/admin/session") {
    assert.equal(options.method || "GET", "GET");
    if (sessionGate) { const pending = sessionGate; sessionGate = null; await pending.promise; }
    return Response.json({ session: { userId: account, isOwner } }, { status: sessionStatus });
  }
  if (url === "/api/admin/profile") return Response.json({ profile: profile.defaultAdminProfile({ displayName: "Synthetic owner", isOwner: true }) });
  if (url === "/api/admin/inbox/intake" && allowIntake) return new Promise(() => {});
  assert.fail(`Unexpected service request: ${url}`);
};
function load(relative, mocks = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "..", relative), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod, exports: mod.exports, console, window, document, localStorage, URLSearchParams, AbortController, setTimeout, clearTimeout, DOMException,
    fetch: (...args) => global.fetch(...args),
    require: name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === "@/admin/AdminThemeContext") return { useAdminTheme: () => ({ theme, ready: true, toggleTheme: () => { theme = theme === "light" ? "dark" : "light"; } }) };
      if (name === "@/lib/bot-testing") return domain;
      if (name === "@/lib/admin-access") return access;
      if (name === "@/lib/admin-profile") return profile;
      return require(name);
    },
  }, { filename: relative });
  return mod.exports.default;
}
const App = load("src/components/admin/BotTestingWorkspace.tsx");
const Intake = load("src/components/admin/EmailIntakeAutoSync.tsx");
const Chrome = load("src/components/AdminChrome.tsx", {
  "@/components/admin/EmailIntakeAutoSync": { __esModule: true, default: Intake },
  "@/components/admin/AdminProfileEditor": { __esModule: true, default: () => null },
  "@/lib/firebase-admin-client-auth": { signOutAdminFromFirebase: async () => {} },
  "next/navigation": { usePathname: () => pathname, useRouter: () => ({ replace() {}, push() {} }) },
  "next/link": { __esModule: true, default: ({ prefetch, ...props }) => { links.push({ href: props.href, prefetch }); return React.createElement("a", props); } },
  "next/image": { __esModule: true, default: ({ fill, unoptimized, ...props }) => React.createElement("img", props) },
});
const ownerA = "synthetic-owner-A";
const ownerB = "synthetic-owner-B";
const button = name => screen.getByRole("button", { name, exact: true });
const records = () => within(screen.getByRole("region", { name: "Synthetic records" }));
const saved = id => domain.restoreTestState(window.sessionStorage.getItem(domain.testStorageKey(id)));
const click = async name => { await act(async () => { fireEvent.click(button(name)); }); };
const waitDone = async () => { await waitFor(() => assert.equal(button("Create quote").disabled, false)); };
const start = async (id = ownerA) => {
  const view = render(React.createElement(App, { accountId: id, key: id }));
  await waitDone(); return view;
};
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
let passed = 0, failed = 0;
async function check(name, fn) {
  theme = "light"; account = ownerA; isOwner = true; sessionStatus = 200; requests = []; sessionGate = null; pathname = "/admin/bot-testing"; allowIntake = false; links = [];
  window.sessionStorage.clear(); window.localStorage.clear();
  try { await fn(); passed++; console.log("PASS " + name); }
  catch (error) { failed++; console.error("FAIL " + name + "\n" + error.stack); }
  finally { cleanup(); }
}
(async () => {
  await check("entry uses only read-only session checks and labels simulation honestly", async () => {
    await start();
    assert.ok(screen.getByText("AI not connected"));
    assert.ok(screen.getByText("Simulation · Deterministic responses"));
    assert.equal(requests.length, 1); assert.equal(requests[0].url, "/api/admin/session");
    assert.equal(saved(ownerA).quote, "none");
  });
  await check("same-tick duplicate submissions run once and full workflow is synthetic", async () => {
    await start();
    await act(async () => { fireEvent.click(button("Create quote")); fireEvent.click(button("Create quote")); });
    assert.equal(button("Create quote").disabled, true);
    await waitDone();
    assert.equal(saved(ownerA).messages.length, 3);
    for (const name of ["Create quote", "Accept quote", "Create invoice", "Create invoice", "Mark invoice paid"]) { await click(name); await waitDone(); }
    assert.equal(saved(ownerA).quote, "accepted"); assert.equal(saved(ownerA).invoice, "paid");
    assert.ok(records().getByText("TEST-Q001")); assert.ok(records().getByText("TEST-I001"));
    assert.equal(requests.every(r => r.url === "/api/admin/session" && r.method === "GET"), true);
  });
  await check("cancelled delayed responses cannot change test records", async () => {
    await start(); sessionGate = deferred(); const gate = sessionGate;
    await click("Create quote"); await click("Cancel simulation");
    await act(async () => { gate.resolve(); });
    assert.equal(saved(ownerA).quote, "none"); assert.equal(records().getAllByText("Not created", { selector: "span" }).length, 2);
  });
  await check("reset during a pending run prevents stale persistence", async () => {
    await start(); sessionGate = deferred(); const gate = sessionGate;
    await click("Create quote"); await click("Reset test");
    await act(async () => { gate.resolve(); });
    assert.equal(saved(ownerA).quote, "none"); assert.equal(saved(ownerA).messages.length, 1);
    await click("Create invoice"); await waitDone(); assert.equal(saved(ownerA).invoice, "none");
  });
  await check("navigation/unmount aborts pending verification and prevents writes", async () => {
    const view = await start(); sessionGate = deferred(); const gate = sessionGate;
    await click("Create quote"); const pending = requests.at(-1);
    view.unmount(); assert.equal(pending.signal.aborted, true);
    await act(async () => { gate.resolve(); }); assert.equal(window.sessionStorage.getItem(domain.testStorageKey(ownerA)), null);
  });
  await check("scenario changes reset quote, invoice and conversation", async () => {
    await start(); await click("Create quote"); await waitDone();
    await act(async () => { fireEvent.change(screen.getByLabelText("Example customer workflow"), { target: { value: "polos" } }); });
    assert.equal(saved(ownerA).scenarioId, "polos"); assert.equal(saved(ownerA).quote, "none"); assert.equal(saved(ownerA).messages.length, 1);
    assert.ok(screen.getByText("TEST · Example Restaurant"));
  });
  await check("separate owner accounts restore only their own browser-tab state", async () => {
    const view = await start(); await click("Create quote"); await waitDone(); view.unmount();
    account = ownerB; const other = await start(ownerB); assert.equal(saved(ownerB).quote, "none"); assert.equal(records().queryByText("TEST-Q001"), null); other.unmount();
    account = ownerA; await start(); assert.ok(records().getByText("TEST-Q001"));
  });
  await check("account changes, revoked owner access and verification errors lock and clear state", async () => {
    for (const failure of ["account", "role", "unauthorized", "unavailable"]) {
      account = ownerA; isOwner = true; sessionStatus = 200;
      const view = await start(); await click("Create quote"); await waitDone();
      if (failure === "account") account = ownerB;
      if (failure === "role") isOwner = false;
      if (failure === "unauthorized") sessionStatus = 401;
      if (failure === "unavailable") sessionStatus = 503;
      await click("Accept quote");
      await waitFor(() => assert.ok(screen.getByText("Sign in again to use this owner-only test area.")));
      assert.equal(window.sessionStorage.getItem(domain.testStorageKey(ownerA)), null);
      assert.equal(button("Create quote").disabled, true); assert.equal(records().queryByText("TEST-Q001"), null);
      view.unmount();
    }
  });
  await check("focus detects an account switch before another run", async () => {
    await start(); await click("Create quote"); await waitDone(); account = ownerB;
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => assert.equal(button("Create quote").disabled, true));
    assert.equal(saved(ownerA).quote, "none");
  });
  await check("blocked storage keeps a usable in-memory workflow and visible notice", async () => {
    await start(); const original = dom.window.Storage.prototype.setItem;
    dom.window.Storage.prototype.setItem = () => { throw new Error("Synthetic storage denial"); };
    try {
      await click("Create quote"); await waitDone();
      assert.ok(records().getByText("TEST-Q001"));
      assert.ok(screen.getByRole("status").textContent.includes("storage is unavailable"));
    } finally { dom.window.Storage.prototype.setItem = original; }
  });
  await check("dark theme preserves the visible controls and simulation labels", async () => {
    theme = "dark"; await start(); assert.ok(document.querySelector("main").className.includes("text-white"));
    assert.ok(screen.getByText("AI not connected")); assert.equal(button("Reset test").disabled, false);
  });
  await check("admin chrome hides Bot Testing from non-owners and suppresses inbox intake on nested test routes", async () => {
    for (const location of ["/admin/bot-testing", "/admin/bot-testing/nested"]) {
      pathname = location;
      const view = render(React.createElement(Chrome, { initialSession: { displayName: "Synthetic owner", email: "test@example.invalid", allowedPages: access.ALL_ADMIN_PAGE_PATHS, isOwner: true } }, "Synthetic page"));
      await waitFor(() => assert.ok(requests.some(r => r.url === "/api/admin/profile")));
      assert.equal(requests.some(r => r.url.includes("/inbox/intake")), false);
      assert.equal(links.every(link => link.prefetch === false), true, "Test route must not prefetch other workspaces");
      assert.ok(screen.getAllByRole("link", { name: "Bot Testing" }).length > 0);
      view.unmount();
    }
    requests = [];
    render(React.createElement(Chrome, { initialSession: { displayName: "Synthetic staff", email: "staff@example.invalid", allowedPages: ["/admin/bot-testing"], isOwner: false } }, "Synthetic page"));
    assert.equal(screen.queryByRole("link", { name: "Bot Testing" }), null);
  });
  await check("leaving a live admin page aborts the browser's pending inbox intake request", async () => {
    allowIntake = true; pathname = "/admin/quotation-approval";
    const session = { displayName: "Synthetic owner", email: "test@example.invalid", allowedPages: access.ALL_ADMIN_PAGE_PATHS, isOwner: true };
    const view = render(React.createElement(Chrome, { initialSession: session }, "Synthetic page"));
    await waitFor(() => assert.ok(requests.some(r => r.url === "/api/admin/inbox/intake")));
    const pending = requests.find(r => r.url === "/api/admin/inbox/intake");
    pathname = "/admin/bot-testing"; view.rerender(React.createElement(Chrome, { initialSession: session }, "Synthetic page"));
    assert.equal(pending.signal.aborted, true);
    assert.equal(requests.filter(r => r.url === "/api/admin/inbox/intake").length, 1);
  });
  console.log(`${passed} passed; ${failed} failed`);
  dom.window.close(); if (failed) process.exitCode = 1;
})();
