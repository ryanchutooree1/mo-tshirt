const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, modules) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, process, console: { error() {} },
    require(name) {
      assert.ok(Object.hasOwn(modules, name), `Unexpected import ${name}`);
      return modules[name];
    },
  });
  return exports;
}

// This suite can never target live Firestore. It uses only synthetic records.
test("shop CRUD, query, batches and timestamps round-trip through the real server SDK", {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  assert.equal(process.env.NODE_ENV, "test");
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  assert.ok(!process.env.VERCEL);
  const server = load("src/lib/shops-server.ts", {
    "server-only": {},
    "@google-cloud/firestore": require("@google-cloud/firestore"),
    "google-auth-library": { ExternalAccountClient: { fromJSON() { throw new Error("No live federation in emulator test"); } } },
    "@vercel/oidc": { getVercelOidcToken() { throw new Error("No live token in emulator test"); } },
  });
  const money = load("src/lib/money.ts", {});
  const shops = load("src/lib/shops.ts", { "@/lib/money": money });
  const payloads = load("src/lib/shops-api.ts", { "@/lib/shops": shops });
  let signedIn = true;
  const modules = {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "next/headers": { cookies: async () => ({}) },
    "@/lib/admin-auth": { hasAdminSession: async () => signedIn },
    "@/lib/shops-server": server,
    "@/lib/shops": shops,
    "@/lib/shops-api": payloads,
  };
  const routes = Object.fromEntries(["shops", "quote-options", "admin/shops", "admin/shops/[id]", "admin/shops/[id]/studio-images", "admin/shops/reorder", "admin/shops/normalize-sizes"].map((name) => [name, load(`app/api/${name}/route.ts`, modules)]));
  const request = (body) => new Request("http://localhost/api/admin/shops", { method: "POST", body: JSON.stringify(body) });
  const ids = [];
  const collection = server.shopCollection();
  try {
    const fixture = {
      title: "Synthetic Plain T-Shirt", colors: ["White"], isActive: true,
      sizePrices: [{ size: "M", price: 100, buyingPrice: 60, profit: 40 }],
    };
    const created = await routes["admin/shops"].POST(request(fixture));
    assert.equal(created.status, 200);
    const { id } = await created.json(); ids.push(id);
    const params = { params: Promise.resolve({ id }) };
    let saved = (await server.shopDocument(id).get()).data();
    assert.ok(saved.createdAt.toMillis() > 0);
    assert.ok(saved.updatedAt.toMillis() > 0);
    assert.deepEqual(saved.sizePrices, fixture.sizePrices);
    const adminBody = await (await routes["admin/shops"].GET()).json();
    assert.deepEqual(adminBody.items.find((item) => item.id === id).sizePrices, fixture.sizePrices);
    let publicBody = await (await routes.shops.GET()).json();
    assert.deepEqual(publicBody.items.find((item) => item.id === id).sizePrices, [{ size: "M", price: 100 }]);
    assert.doesNotMatch(JSON.stringify(publicBody), /buyingPrice|profit/);
    assert.equal((await routes["quote-options"].GET()).status, 200);

    const updated = await routes["admin/shops/[id]"].PUT(request({ ...fixture, isActive: false }), params);
    assert.equal(updated.status, 200);
    publicBody = await (await routes.shops.GET()).json();
    assert.ok(!publicBody.items.some((item) => item.id === id));
    assert.equal((await routes["admin/shops/[id]/studio-images"].PUT(request({ studioPhotoUrl: "/synthetic-front.png" }), params)).status, 200);
    assert.equal((await server.shopDocument(id).get()).data().studioPhotoUrl, "/synthetic-front.png");
    assert.equal((await routes["admin/shops/reorder"].POST(request({ items: [{ id, position: 12 }] }))).status, 200);
    assert.equal((await server.shopDocument(id).get()).data().position, 12);
    await server.shopDocument(id).update({ sizes: ["XXL"], sizePrices: [{ ...fixture.sizePrices[0], size: "XXL" }] });
    const normalized = await routes["admin/shops/normalize-sizes"].POST();
    assert.equal(normalized.status, 200);
    assert.ok((await normalized.json()).updated >= 1);
    saved = (await server.shopDocument(id).get()).data();
    assert.equal(saved.sizePrices[0].size, "2XL");
    assert.equal(saved.sizePrices[0].buyingPrice, fixture.sizePrices[0].buyingPrice);
    assert.equal(saved.sizePrices[0].profit, fixture.sizePrices[0].profit);

    // Every admin operation must reject before touching data, even valid payloads.
    signedIn = false;
    const before = JSON.stringify(saved);
    for (const call of [
      () => routes["admin/shops"].GET(),
      () => routes["admin/shops"].POST(request(fixture)),
      () => routes["admin/shops/[id]"].PUT(request(fixture), params),
      () => routes["admin/shops/[id]"].DELETE(request({}), params),
      () => routes["admin/shops/[id]/studio-images"].PUT(request({ studioPhotoUrl: "/changed.png" }), params),
      () => routes["admin/shops/reorder"].POST(request({ id, position: 99 })),
      () => routes["admin/shops/normalize-sizes"].POST(),
    ]) assert.equal((await call()).status, 401);
    assert.equal(JSON.stringify((await server.shopDocument(id).get()).data()), before);
    signedIn = true;
    assert.equal((await routes["admin/shops"].POST(request({}))).status, 400);
    assert.equal((await routes["admin/shops/[id]/studio-images"].PUT(request({ studioPhotoUrl: "javascript:alert(1)" }), params)).status, 400);
    assert.equal((await routes["admin/shops/reorder"].POST(request({ items: [] }))).status, 400);
    assert.equal((await routes["admin/shops/[id]"].DELETE(request({}), params)).status, 200);
    assert.equal((await server.shopDocument(id).get()).exists, false);
    assert.equal((await routes["admin/shops/[id]"].PUT(request(fixture), params)).status, 500);
  } finally {
    await Promise.all(ids.map((id) => server.shopDocument(id).delete()));
    await collection.firestore.terminate();
  }
});
