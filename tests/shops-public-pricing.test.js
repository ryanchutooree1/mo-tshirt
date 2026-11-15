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
    URL,
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
const pricing = load("src/lib/shop-customer-pricing.ts");
const publicShop = load("src/lib/shops-public-api.ts", { "@/lib/shops": shops, "@/lib/shop-customer-pricing": pricing });
const adminPayloads = load("src/lib/shops-api.ts", { "@/lib/shops": shops, "@/lib/shop-customer-pricing": pricing });

function setup({ records = [], signedIn = false, failRead = false } = {}) {
  const queries = [];
  const modules = {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "next/headers": { cookies: async () => ({}) },
    "@/lib/shops-server": {
      logShopServerError() {},
      shopCollection: () => {
        const constraints = [];
        const chain = {
          where: (field, operator, value) => { constraints.push({ field, operator, value }); return chain; },
          orderBy: (field, direction) => { constraints.push({ field, direction }); return chain; },
          get: async () => {
            queries.push({ collection: "shops", constraints });
            if (failRead) throw new Error("Synthetic database failure");
            return {
              docs: records
                .filter((record) => constraints.every((c) => c.operator !== "==" || record[c.field] === c.value))
                .map(({ id, ...data }) => ({ id, data: () => data })),
            };
          },
        };
        return chain;
      },
    },
    "@/lib/shops": shops,
    "@/lib/shops-api": adminPayloads,
    "@/lib/shops-public-api": publicShop,
    "@/lib/shop-customer-pricing": pricing,
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
    { size: "S", price: 200 },
    { size: "M", price: 200 },
    { size: "L", price: 200 },
    { size: "XL", price: 200 },
  ]);
  assert.doesNotMatch(JSON.stringify(body), /buyingPrice|profit|SYNTHETIC_PRIVATE/);
  assert.deepEqual(records, original);
  assert.equal(body.items[0].basePrice, 200);
  assert.ok(!Object.hasOwn(body.items[0], "pickupPrice"));
  assert.ok(!Object.hasOwn(body.items[0], "studioSizePrices"));
  for (const field of ["deliveryFee", "photoUrl", "colors", "inStock"]) {
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
  assert.deepEqual(body.items[0].sizePrices, [{ size: "S", price: 200 }, { size: "2XL", price: 300 }]);
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


test("plain T-shirts show customer price by selected size for every colour without adding variants", async () => {
  const colors = ["Fir Green", "Aqua", "Red", "Baby Pink"];
  const sizes = ["1 Yr", "3 Years Old", "14 Years", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];
  const records = colors.map((color) => ({
    ...product, id: color, colors: [color], sizePrices: sizes.map((size) => ({ size, price: 77, buyingPrice: 19, profit: 58 })),
  }));
  const body = await (await setup({ records }).publicRoute.GET()).json();
  assert.equal(body.items.length, colors.length);
  for (const item of body.items) {
    assert.equal(item.sizePrices.length, sizes.length);
    for (const size of sizes) {
      const expected = ["XS", "S", "M", "L", "XL"].includes(size) ? 200 :
        ["XXL", "3XL", "4XL"].includes(size) ? 300 : 150;
      assert.equal(shops.getExactShopPrice(item, size), expected, `${item.id} ${size}`);
    }
    assert.equal(shops.getExactShopPrice(item, "5XL"), null);
  }
  assert.equal(pricing.getPlainTeePrice("15 Years"), null);
  assert.equal(pricing.getPlainTeePrice("0 Years"), null);
  assert.doesNotMatch(JSON.stringify(body), /buyingPrice|profit/);
});

test("material-specific polos are correct; generic, conflicting and unspecified cotton polos are quote-only", async () => {
  const records = [
    { ...product, id: "double", title: "Cotton Polo Shirt, Double Piqué" },
    { ...product, id: "poly", title: "Polyester Polo Shirt" },
    { ...product, id: "single", title: "Plain Poloshirt", poloMaterial: "cotton-single-pique" },
    { ...product, id: "generic", title: "Plain Poloshirt" },
    { ...product, id: "cotton", title: "Cotton Polo Shirt" },
    { ...product, id: "conflict", title: "Polyester Polo Shirt", poloMaterial: "cotton-single-pique" },
  ];
  const result = await (await setup({ records }).publicRoute.GET()).json();
  for (const [id, expected] of Object.entries({ double: 450, poly: 350, single: 375, generic: null, cotton: null, conflict: null })) {
    const item = result.items.find((i) => i.id === id);
    assert.equal(shops.getExactShopPrice(item, "M"), expected, id);
    if (expected === null) {
      assert.ok(item.priceReviewSizes.includes("M"));
      assert.equal(item.sizePrices.length, 0);
      assert.ok(!Object.hasOwn(item, "basePrice"));
    }
  }
  const saved = adminPayloads.parseShopPayload({ ...product, title: "Plain Poloshirt", poloMaterial: "polyester" });
  assert.equal(saved.ok, true);
  assert.equal(saved.data.poloMaterial, "polyester");
  assert.equal(saved.data.sizePrices.find((x) => x.size === "M").price, 50);
  assert.equal(adminPayloads.parseShopPayload({ ...product, title: "Polyester Polo Shirt", poloMaterial: "cotton-double-pique" }).ok, false);
});

test("long-sleeve, caps, mugs, printed garments and design-studio custom base remain unchanged", async () => {
  const records = [
    ...["Plain Long-Sleeve T-Shirt", "Plain T-Shirt Longsleeve", "Cap", "Mug", "Printed Plain T-Shirt"].map((title) => ({ ...product, id: title, title })),
    product,
  ];
  const app = setup({ records });
  const body = await (await app.publicRoute.GET(new Request("http://localhost/api/shops?purpose=design-studio"))).json();
  for (const item of body.items.filter((i) => i.id !== product.id)) {
    assert.equal(shops.getExactShopPrice(item, "M"), 50);
    assert.equal(item.deliveryFee, 10);
    assert.deepEqual(item.colors, product.colors);
    assert.equal(item.photoUrl, product.photoUrl);
  }
  const updated = body.items.find((i) => i.id === product.id);
  assert.equal(shops.getStudioGarmentPrice(updated, "M", false), 200);
  assert.equal(shops.getStudioGarmentPrice(updated, "M", true), 50);
  assert.doesNotMatch(JSON.stringify(body), /buyingPrice|profit|SYNTHETIC_PRIVATE/);
});

test("WhatsApp line amounts, subtotal and existing delivery fee use selling rates only", async () => {
  const specs = [["Red", "XS", 2], ["Aqua Blue", "2XL", 1], ["White", "1 Yr", 1]];
  const records = specs.map(([color, size]) => ({ ...product, id: color, colors: [color], sizePrices: [{ size, price: 79, buyingPrice: 95, profit: 67 }] }));
  const body = await (await setup({ records }).publicRoute.GET()).json();
  const lines = specs.map(([color, size, quantity]) => {
    const item = body.items.find((i) => i.id === color);
    const unitPrice = shops.getExactShopPrice(item, size);
    return { itemId: item.id, title: item.title, color, size, quantity, unitPrice, lineTotal: unitPrice * quantity };
  });
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  assert.equal(subtotal, 850);
  const message = shops.buildShopWhatsAppMessageForLines(lines, "Post Office Postage Delivery", {
    subtotal, deliveryFee: 100, total: subtotal + 100,
  });
  assert.match(message, /Red.*XS.*200.*400/);
  assert.match(message, /Aqua Blue.*2XL.*300/);
  assert.match(message, /White.*1 Yr.*150/);
  assert.match(message, /Subtotal:.*850/);
  assert.match(message, /Delivery fee.*100/);
  assert.match(message, /Total:.*950/);
  assert.doesNotMatch(message, /buyingPrice|profit|Rs (95|67)\b/);
});
