// Isolated React/DOM state integration tests. All persistence is an in-memory double.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const vm = require("vm");
const assert = require("assert/strict");
const path = require("path");
const root = path.resolve(__dirname, "..");
const requireRepo = require("module").createRequire(root + "/package.json");
const React = require("react");
const ts = requireRepo("typescript");
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3007/admin/x5-execution",
  pretendToBeVisual: true,
});
for (const k of [
  "window",
  "document",
  "HTMLElement",
  "HTMLDialogElement",
  "HTMLInputElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "MutationObserver",
  "getComputedStyle",
])
  global[k] = dom.window[k];
Object.defineProperty(global, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
window.requestAnimationFrame = global.requestAnimationFrame;
HTMLElement.prototype.scrollIntoView = function () {};
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
let confirmation = true;
window.confirm = () => confirmation;
const {
  render,
  screen,
  within,
  waitFor,
  cleanup,
  fireEvent,
  act,
} = require("@testing-library/react");
const aura = requireRepo("./src/lib/aura.ts");
let saved = {
  workspace: structuredClone(aura.EMPTY_AURA_WORKSPACE),
  revision: 0,
  accountScope: "A",
};
let fail = 0;
let puts = 0;
let slow = 25;
let account = "A";
global.fetch = window.fetch = async (url, options) => {
  if (url === "/api/admin/session")
    return Response.json({ session: { userId: account } });
  if (options?.method === "PUT") {
    puts++;
    await new Promise((r) => setTimeout(r, slow));
    if (fail) {
      const code = fail;
      fail = 0;
      return Response.json(
        {
          error: code === 409 ? "Newer saved data exists" : "Save interrupted",
        },
        { status: code },
      );
    }
    const body = JSON.parse(options.body);
    if (body.accountScope !== account)
      return Response.json(
        { error: "Account changed", code: "ACCOUNT_CHANGED" },
        { status: 409 },
      );
    if (body.revision !== saved.revision)
      return Response.json({ error: "Conflict" }, { status: 409 });
    saved = {
      workspace: aura.validateAuraWorkspace(body.workspace),
      revision: saved.revision + 1,
      accountScope: account,
    };
  }
  return Response.json(saved);
};
const code = ts.transpileModule(
  fs.readFileSync(
    root + "/src/components/admin/aura/AuraWorkspace.tsx",
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const moduleObj = { exports: {} };
const customRequire = (name) =>
  name === "next/link"
    ? { __esModule: true, default: (props) => React.createElement("a", props) }
    : name === "@/lib/aura"
      ? aura
      : name.endsWith(".module.css")
        ? {
            __esModule: true,
            default: new Proxy({}, { get: (_, key) => String(key) }),
          }
        : requireRepo(name);
vm.runInNewContext(
  code,
  {
    module: moduleObj,
    exports: moduleObj.exports,
    require: customRequire,
    console,
    window,
    document,
    crypto: require("crypto").webcrypto,
    fetch: global.fetch,
    AbortSignal,
    HTMLElement,
    queueMicrotask,
    setTimeout,
    clearTimeout,
  },
  { filename: "AuraWorkspace.test.js" },
);
const App = moduleObj.exports.default;
function byLabel(root, pattern) {
  const labels = [...root.querySelectorAll("label")];
  const label = labels.find((el) =>
    pattern instanceof RegExp
      ? pattern.test(el.textContent)
      : el.textContent.trim().startsWith(pattern),
  );
  if (!label)
    throw new Error(
      "Missing label " +
        pattern +
        " available " +
        labels.map((l) => l.textContent),
    );
  return label.querySelector("input,textarea,select");
}
(async () => {
  const user = {
    click: async (el) => {
      await act(async () => {
        fireEvent.click(el);
      });
    },
    type: async (el, text) => {
      await act(async () => {
        fireEvent.change(el, { target: { value: el.value + text } });
      });
    },
    dblClick: async (el) => {
      await act(async () => {
        fireEvent.click(el);
        fireEvent.click(el);
      });
    },
  };
  render(React.createElement(App));
  await screen.findByRole("heading", { name: "Your next meaningful moves." });
  console.log("PASS empty workspace loads");
  await user.click(screen.getByRole("button", { name: "Define an outcome" }));
  let d = screen.getByRole("dialog");
  await user.type(d.querySelector("input"), "Build a useful skill");
  let success = byLabel(d, "I will know it worked when…");
  await user.type(success, "I can show a finished practice project");
  await user.type(
    byLabel(d, "Action 1"),
    "Complete a focused practice session",
  );
  slow = 200;
  await user.click(within(d).getByRole("button", { name: "Create my path" }));
  assert.equal(byLabel(d, "Outcome name").closest("fieldset").disabled, true);
  await waitFor(() =>
    assert.equal(Boolean(screen.queryByRole("dialog")), false),
  );
  assert.equal(saved.workspace.goals.length, 1);
  console.log("PASS create/save + slow-save fields disabled");
  await user.click(screen.getByRole("button", { name: "Today", exact: true }));
  let before = puts;
  await user.dblClick(
    screen.getByRole("button", {
      name: "Complete Complete a focused practice session",
    }),
  );
  await waitFor(() =>
    assert.equal(
      saved.workspace.goals[0].actions[0].completedAt !== null,
      true,
    ),
  );
  assert.equal(puts, before + 1);
  console.log("PASS double-click sends one action mutation");
  await user.click(screen.getByRole("button", { name: "Review evidence" }));
  d = screen.getByRole("dialog");
  assert.equal(
    within(d).getByRole("button", { name: "Verify as achieved" }).disabled,
    true,
  );
  await user.type(
    byLabel(d, "Outcome evidence"),
    "Finished and reviewed the project",
  );
  await user.click(
    within(d).getByRole("button", { name: "Verify as achieved" }),
  );
  await waitFor(() =>
    assert.equal(saved.workspace.goals[0].status, "achieved"),
  );
  await user.click(within(d).getByRole("button", { name: "Reopen this goal" }));
  await waitFor(() => assert.equal(saved.workspace.goals[0].status, "active"));
  console.log("PASS explicit evidence required, achieve and reopen");
  await user.click(within(d).getByRole("button", { name: "Close dialog" }));
  await user.click(
    screen.getByRole("button", { name: "What happened?", exact: true }),
  );
  d = screen.getByRole("dialog");
  await user.type(
    byLabel(d, "What happened?"),
    "I missed an important meeting detail",
  );
  await user.type(
    byLabel(d, /What can I learn/),
    "Write and confirm commitments",
  );
  await user.type(
    byLabel(d, /My next practical action/),
    "Bring a notebook next time",
  );
  await user.click(byLabel(d, "Create a reusable checklist from this lesson"));
  await user.type(byLabel(d, "Checklist name"), "Meeting preparation");
  await user.type(byLabel(d, "When should I use it?"), "Before a meeting");
  await user.type(byLabel(d, "Checklist step 1"), "Bring a notebook and pen");
  await user.click(
    byLabel(d, "I’ve reviewed this checklist and want to use it"),
  );
  await user.click(within(d).getByRole("button", { name: "Save this lesson" }));
  await waitFor(() =>
    assert.equal(Boolean(screen.queryByRole("dialog")), false),
  );
  assert.equal(saved.workspace.lessons[0].practice.adopted, true);
  await user.click(byLabel(document, "Bring a notebook and pen"));
  await waitFor(() =>
    assert.equal(
      Object.values(saved.workspace.lessons[0].practice.checks)[0].length,
      1,
    ),
  );
  console.log("PASS plain-language lesson and adopted recurring checklist");
  await user.click(
    screen.getByRole("button", { name: "Edit lesson / checklist" }),
  );
  d = screen.getByRole("dialog");
  await user.type(byLabel(d, /What can I learn/), " and listen");
  fail = 409;
  await user.click(within(d).getByRole("button", { name: "Save this lesson" }));
  await within(d).findByRole("button", {
    name: "Reload saved data; keep my draft",
  });
  await user.click(
    within(d).getByRole("button", { name: "Reload saved data; keep my draft" }),
  );
  await waitFor(() =>
    assert.equal(
      within(d).queryByRole("button", {
        name: "Reload saved data; keep my draft",
      }),
      null,
    ),
  );
  assert.match(byLabel(d, /What can I learn/).value, /and listen/);
  await user.click(within(d).getByRole("button", { name: "Save this lesson" }));
  await waitFor(() =>
    assert.equal(Boolean(screen.queryByRole("dialog")), false),
  );
  assert.match(saved.workspace.lessons[0].lesson, /and listen/);
  console.log("PASS conflict recovery keeps draft and saves");
  await user.click(
    screen.getByRole("button", { name: "What happened?", exact: true }),
  );
  d = screen.getByRole("dialog");
  await user.type(byLabel(d, "What happened?"), "This should stay unsaved");
  confirmation = false;
  await user.click(
    within(d).getByRole("button", { name: "Cancel", exact: true }),
  );
  assert.ok(screen.getByRole("dialog"));
  confirmation = true;
  await user.click(
    within(d).getByRole("button", { name: "Cancel", exact: true }),
  );
  await waitFor(() =>
    assert.equal(Boolean(screen.queryByRole("dialog")), false),
  );
  assert.equal(saved.workspace.lessons.length, 1);
  console.log("PASS cancel confirmation preserves or discards draft");
  cleanup();
  render(React.createElement(App));
  await screen.findByRole("heading", { name: "Your next meaningful moves." });
  assert.ok(screen.getByRole("heading", { name: "Meeting preparation" }));
  assert.equal(byLabel(document, "Bring a notebook and pen").checked, true);
  console.log("PASS saved data refresh/remount persistence");
  await user.click(screen.getByRole("button", { name: "Review evidence" }));
  d = screen.getByRole("dialog");
  await user.click(
    within(d).getByRole("button", { name: "Archive", exact: true }),
  );
  await waitFor(() =>
    assert.equal(saved.workspace.goals[0].status, "archived"),
  );
  await user.click(
    within(d).getByRole("button", { name: "Restore this goal" }),
  );
  await waitFor(() => assert.equal(saved.workspace.goals[0].status, "active"));
  await user.click(within(d).getByRole("button", { name: "Reset actions" }));
  await waitFor(() =>
    assert.equal(saved.workspace.goals[0].actions[0].completedAt, null),
  );
  await user.click(within(d).getByRole("button", { name: "Close dialog" }));
  await user.click(screen.getByRole("button", { name: "Undo", exact: true }));
  await waitFor(() =>
    assert.notEqual(saved.workspace.goals[0].actions[0].completedAt, null),
  );
  console.log("PASS archive/restore, reset and undo");
  await user.click(
    screen.getByRole("button", { name: "What happened?", exact: true }),
  );
  d = screen.getByRole("dialog");
  await user.type(
    byLabel(d, "What happened?"),
    "A transient save failure test",
  );
  fail = 503;
  await user.click(within(d).getByRole("button", { name: "Save this lesson" }));
  await within(d).findByRole("alert");
  assert.equal(
    byLabel(d, "What happened?").value,
    "A transient save failure test",
  );
  await user.click(
    within(d).getByRole("button", { name: "Cancel", exact: true }),
  );
  await waitFor(() =>
    assert.equal(Boolean(screen.queryByRole("dialog")), false),
  );
  console.log("PASS save error retains unsaved draft");
  await user.click(
    screen.getByRole("button", { name: "What happened?", exact: true }),
  );
  d = screen.getByRole("dialog");
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  await waitFor(() =>
    assert.equal(Boolean(screen.queryByRole("dialog")), false),
  );
  assert.match(window.location.pathname, /x5-execution/);
  console.log("PASS Back dismisses modal without leaving workspace");
  await user.click(
    screen.getByRole("button", { name: "What happened?", exact: true }),
  );
  d = screen.getByRole("dialog");
  await user.type(byLabel(d, "What happened?"), "Private A draft");
  account = "B";
  await user.click(within(d).getByRole("button", { name: "Save this lesson" }));
  await waitFor(() =>
    assert.equal(Boolean(screen.queryByRole("dialog")), false),
  );
  assert.ok(screen.getByText(/Your signed-in account changed/));
  assert.equal(saved.workspace.lessons.length, 1);
  assert.equal(screen.queryByText("Private A draft"), null);
  console.log(
    "PASS account switch clears private draft, refuses wrong-account write",
  );
  cleanup();
  dom.window.close();
  console.log("ALL UI STATE TESTS PASSED");
  process.exit(0);
})().catch((error) => {
  console.error(error);
  cleanup();
  dom.window.close();
  process.exit(1);
});
