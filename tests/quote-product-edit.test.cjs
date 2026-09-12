const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const file = path.resolve(__dirname, "../src/lib/quote-product-edit.ts");
const mod = new Module(file, module);
mod.filename = file;
mod.paths = module.paths;
mod._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText,
  file,
);
const {
  buildProductCorrection,
  getProductEditor,
  assertEditLock,
  canonical,
  synchronizeDocumentQuantities,
  changedFields,
  documentContentVersion,
} = mod.exports;
const actor = {
  userId: "test-owner",
  displayName: "Test owner",
  email: "owner@example.test",
};
function fixture() {
  return {
    garments: [
      { garment: "Plain Poloshirt", color: "Black", size: "M", quantity: 1 },
    ],
    quantity: 1,
    printMethod: "DTF full colour",
    designBrief: {
      selectedSizes: [{ size: "M", quantity: 1 }],
      totalQty: 1,
      design: "keep this",
    },
    quote: {
      lines: [
        {
          description: "Plain Poloshirt (Black / M) — DTF full colour",
          quantity: 1,
          unitPrice: 500,
          priceSource: "manual",
        },
        { description: "Setup", quantity: 1, unitPrice: 50 },
      ],
      deliveryFee: 100,
      discount: 25,
      amountReceived: 200,
      subtotal: 550,
      total: 625,
    },
  };
}
function correct(data, rows) {
  return buildProductCorrection(
    data,
    { rows, printMethod: data.printMethod },
    actor,
    "2026-09-12T00:00:00Z",
  );
}
test("M × 1 correction to S × 2 synchronizes product, design and quote while preserving fees and extra lines", () => {
  const data = fixture();
  const rows = getProductEditor(data).rows.map((r) => ({
    ...r,
    size: "S",
    quantity: 2,
  }));
  const result = correct(data, rows);
  assert.equal(result.quantity, 2);
  assert.equal(result.garments[0].size, "S");
  assert.deepEqual(result.designBrief.selectedSizes, [
    { size: "S", quantity: 2 },
  ]);
  assert.equal(result.designBrief.totalQty, 2);
  assert.equal(result.designBrief.design, "keep this");
  assert.equal(result.quote.total, 1125);
  assert.equal(result.quote.amountReceived, 200);
  assert.equal(result.quote.lines[1].description, "Setup");
  assert.equal(result.quote.lines[0].unitPrice, 500);
  assert.ok(
    changedFields(data, result).some(
      (c) =>
        c.field === "garments" &&
        c.before[0].size === "M" &&
        c.after[0].size === "S",
    ),
  );
});
test("additional sizes and product removal preserve non-product charges", () => {
  const data = fixture();
  const first = getProductEditor(data).rows[0];
  const two = correct(data, [
    first,
    { ...first, id: "second", size: "XL", quantity: 3, lineIndex: null },
  ]);
  assert.equal(two.quantity, 4);
  assert.equal(two.quote.total, 2125);
  const onlySecond = correct(
    two,
    getProductEditor(two).rows.filter((r) => r.id === "second"),
  );
  assert.equal(onlySecond.quantity, 3);
  assert.equal(onlySecond.quote.lines.length, 2);
  assert.equal(onlySecond.quote.total, 1625);
});
test("duplicate billing mappings and invalid quantities are rejected", () => {
  const data = fixture(),
    row = getProductEditor(data).rows[0];
  assert.throws(
    () => correct(data, [row, { ...row, id: "duplicate" }]),
    /only one product/,
  );
  for (const quantity of [0, -1, 1.5, 100001])
    assert.throws(
      () => correct(data, [{ ...row, quantity }]),
      /whole quantity/,
    );
});
test("lease only permits its owner with correct token before expiry", () => {
  const data = { productEditLock: { actor, token: "nonce", expiresAt: 2000 } };
  assert.doesNotThrow(() => assertEditLock(data, actor, "nonce", 1000));
  assert.throws(() =>
    assertEditLock(data, { ...actor, userId: "other" }, "nonce", 1000),
  );
  assert.throws(() => assertEditLock(data, actor, "wrong", 1000));
  assert.throws(() => assertEditLock(data, actor, "nonce", 2000));
});
test("document quantity changes synchronize back to the source garments", () => {
  const data = correct(fixture(), getProductEditor(fixture()).rows);
  const quote = {
    ...data.quote,
    lines: data.quote.lines.map((line, i) =>
      i === 0 ? { ...line, quantity: 4 } : line,
    ),
  };
  const result = synchronizeDocumentQuantities(data, quote);
  assert.equal(result.quantity, 4);
  assert.equal(result.designBrief.totalQty, 4);
});
test("manual zero prices survive corrections and sharing compares actual content", () => {
  const data = fixture();
  const result = correct(
    data,
    getProductEditor(data).rows.map((row) => ({ ...row, unitPrice: 0 })),
  );
  assert.equal(result.quote.lines[0].unitPrice, 0);
  assert.equal(result.quote.total, 125);
  assert.notEqual(canonical(result.quote), canonical(data.quote));
  const copy = structuredClone(result.quote);
  copy.lines[0].priceSetByName = "Another display";
  assert.equal(
    documentContentVersion(copy),
    documentContentVersion(result.quote),
  );
  copy.lines[0].quantity = 5;
  assert.notEqual(
    documentContentVersion(copy),
    documentContentVersion(result.quote),
  );
});
