const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, modules = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(modules, name), `Unexpected import: ${name}`);
      return modules[name];
    },
    console: { error() {} },
  });
  return exports;
}

const money = load("src/lib/money.ts");
const shops = load("src/lib/shops.ts", { "@/lib/money": money });

function setup({ records = [], signedIn = false, failRead = false } = {}) {
  const queries = [];
  const modules = {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "next/headers": { cookies: async () => ({}) },
    "firebase/firestore": {
      collection: (_db, name) => name,
      query: (collection, ...constraints) => ({ collection, constraints }),
      where: (field, operator, value) => ({ field, operator, value }),
      orderBy: (field, direction) => ({ field, direction }),
      getDocs: async (query) => {
        queries.push(query);
        if (failRead) throw new Error("Synthetic database failure");
        return {
          docs: records
            .filter((record) => query.constraints.every((c) => c.operator !== "==" || record[c.field] === c.value))
            .map(({ id, ...data }) => ({ id, data: () => data })),
        };
      },
    },
    "@/lib/firebase": { db: {} },
    "@/lib/shops": shops,
    "@/lib/shops-api": {},
    "@/lib/admin-auth": { hasAdminSession: async () => signedIn },
  };
  return {
    queries,
    publicRoute: load("app/api/shops/route.ts", modules),
    adminRoute: load("app/api/admin/shops/route.ts", modules),
    quoteOptionsRoute: load("app/api/quote-options/route.ts", modules),
  };
}

// Synthetic fixtures only. Never copy production buying prices into tests.
const product = {
  id: "synthetic-shirt",
  title: "Plain T-Shirt",
  isActive: true,
  inStock: true,
  colors: ["White"],
  photoUrl: "/synthetic-shirt.png",
  basePrice: 50,
  pickupPrice: 5,
  deliveryFee: 10,
  sizePrices: [
    { size: "M", price: 50, buyingPrice: 31, profit: 19, privateNote: "SYNTHETIC_PRIVATE" },
    { size: "S", price: 0, buyingPrice: 0, profit: 0 },
    { size: "L", price: 60, buyingPrice: null, profit: null },
    { size: "XL", price: 70 },
  ],
};

test("public shop prices contain only size and selling price, without mutating saved data", async () => {
  const records = [structuredClone(product)];
  const original = structuredClone(records);
  const response = await setup({ records }).publicRoute.GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.items[0].sizePrices, [
    { size: "S", price: 0 },
    { size: "M", price: 50 },
    { size: "L", price: 60 },
    { size: "XL", price: 70 },
  ]);
  assert.doesNotMatch(JSON.stringify(body), /buyingPrice|profit|SYNTHETIC_PRIVATE/);
  assert.deepEqual(records, original);
  for (const field of ["basePrice", "pickupPrice", "deliveryFee", "photoUrl", "colors", "inStock"]) {
    assert.deepEqual(body.items[0][field], product[field]);
  }
});

test("public catalog preserves normalization, invalid-price filtering, and active-only selection", async () => {
  const records = [
    { ...product, sizePrices: [
      { size: "XXL", price: "90", buyingPrice: 20, profit: 70 },
      { size: "S", price: "55" },
      { size: "M", price: -1 },
      { size: "L", price: "not-a-price" },
      { size: "", price: 10 },
      null,
    ] },
    { ...product, id: "inactive", isActive: false },
    { ...product, id: "legacy", title: "Other", sizePrices: undefined, sizes: ["XL", "S", "S"] },
  ];
  const app = setup({ records });
  const body = await (await app.publicRoute.GET()).json();
  assert.equal(app.queries[0].collection, "shops");
  assert.deepEqual(body.items.map((item) => item.id), [product.id, "legacy"]);
  assert.deepEqual(body.items[0].sizePrices, [{ size: "S", price: 55 }, { size: "2XL", price: 90 }]);
  assert.deepEqual(body.items[0].sizes, ["S", "2XL"]);
  assert.deepEqual(body.items[1].sizePrices, []);
  assert.deepEqual(body.items[1].sizes, ["S", "XL"]);
});

test("authenticated admin retains buying prices and profit", async () => {
  const body = await (await setup({ records: [product], signedIn: true }).adminRoute.GET()).json();
  const bySize = Object.fromEntries(body.items[0].sizePrices.map((entry) => [entry.size, entry]));
  assert.deepEqual(bySize.M, { size: "M", price: 50, buyingPrice: 31, profit: 19 });
  assert.deepEqual(bySize.S, { size: "S", price: 0, buyingPrice: 0, profit: 0 });
  assert.deepEqual(bySize.L, { size: "L", price: 60, buyingPrice: null, profit: null });
});

test("anonymous admin requests are rejected before reading shop records", async () => {
  const app = setup({ records: [product] });
  assert.equal((await app.adminRoute.GET()).status, 401);
  assert.equal(app.queries.length, 0);
});

test("public quote options do not expose commercial pricing", async () => {
  const response = await setup({ records: [product] }).quoteOptionsRoute.GET();
  assert.equal(response.status, 200);
  assert.doesNotMatch(JSON.stringify(await response.json()), /buyingPrice|profit|SYNTHETIC_PRIVATE/);
});

test("public shop failures return a generic error without records", async () => {
  const response = await setup({ records: [product], failRead: true }).publicRoute.GET();
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Failed to load shops." });
});
