const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadRoute(modules) {
  const exports = {};
  const source = ts.transpileModule(
    fs.readFileSync("app/api/admin/quotes/[id]/route.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    require(name) {
      if (!(name in modules)) throw new Error(`Missing test module: ${name}`);
      return modules[name];
    },
    Response,
    Request,
    Headers,
    console,
    crypto,
  });
  return exports;
}

function setup({ session = { isOwner: true, allowedPages: ["/admin/quotation-approval"] }, access = true, password = "correct", quote = {}, linked = false } = {}) {
  const calls = { reads: 0, deletes: 0, links: 0 };
  const route = loadRoute({
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "firebase/firestore": {
      arrayUnion: value => value,
      collection: (_db, name) => name,
      deleteDoc: async () => { calls.deletes += 1; },
      doc: (_db, name, id) => `${name}/${id}`,
      getDoc: async () => { calls.reads += 1; return { exists: () => true, data: () => quote }; },
      getDocs: async () => { calls.links += 1; return { empty: !linked }; },
      limit: count => ({ count }),
      query: (...parts) => parts,
      serverTimestamp: () => 123,
      updateDoc: async () => {},
      where: (...parts) => parts,
    },
    "@/lib/admin-auth": { getAdminPasswordFromEnv: () => "correct" },
    "@/lib/admin-users": { verifyManagedAdminCredentials: async (_email, candidate) => candidate === password },
    "@/lib/admin-request": { getAdminRequestSession: async () => session },
    "@/lib/admin-access": { hasAdminPageAccess: () => access },
    "@/lib/firebase": { db: {} },
    "@/lib/production-manager-auth": { verifyProductionManagerPassword: async candidate => candidate === password },
    "@/lib/request-safety": {
      isContentLengthWithinLimit: headers => Number(headers.get("content-length") || 0) <= 16 * 1024,
      isRequestOriginAllowed: request => request.headers.get("origin") === "https://www.mo-tshirt.mu",
    },
  });
  const remove = (candidate = password, options = {}) => route.DELETE(new Request("https://www.mo-tshirt.mu/api/admin/quotes/q-1", {
    method: "DELETE",
    headers: {
      origin: options.origin || "https://www.mo-tshirt.mu",
      "content-type": "application/json",
      ...(options.contentLength ? { "content-length": options.contentLength } : {}),
    },
    body: JSON.stringify({ password: candidate }),
  }), { params: Promise.resolve({ id: options.id || "q-1" }) });
  return { calls, remove };
}

test("quotation deletion requires scoped access, a same-origin bounded request and a safe id", async () => {
  for (const [scenario, options, expected] of [
    [{ session: null }, {}, 401],
    [{ access: false }, {}, 403],
    [{}, { origin: "https://attacker.test" }, 403],
    [{}, { contentLength: String(17 * 1024) }, 413],
    [{}, { id: "../q" }, 400],
  ]) {
    const state = setup(scenario);
    assert.equal((await state.remove("correct", options)).status, expected);
    assert.equal(state.calls.reads, 0);
    assert.equal(state.calls.deletes, 0);
  }
});

test("wrong password cannot inspect or delete a quotation", async () => {
  const state = setup();
  const response = await state.remove("wrong");
  assert.equal(response.status, 401);
  assert.equal(state.calls.reads, 0);
  assert.equal(state.calls.deletes, 0);
});

test("a quotation linked to an order cannot be deleted", async () => {
  for (const scenario of [{ quote: { orderTransactionId: "order-1" } }, { linked: true }]) {
    const state = setup(scenario);
    const response = await state.remove();
    assert.equal(response.status, 409);
    assert.equal(state.calls.reads, 1);
    assert.equal(state.calls.deletes, 0);
  }
});

test("an unlinked quotation is deleted after password confirmation", async () => {
  const state = setup();
  const response = await state.remove();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(state.calls.reads, 1);
  assert.equal(state.calls.links, 1);
  assert.equal(state.calls.deletes, 1);
});
