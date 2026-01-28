const test = require("node:test");
const assert = require("node:assert/strict");
const { computeQuote, getVinylCosts } = require("../src/lib/pricing");

test("screen printing quote math", () => {
  const result = computeQuote({
    method: "Screen",
    qty: 10,
    locations: 2,
    rush: false,
    artworkFee: 0,
    overheadPerOrder: 200,
    targetMarginPct: 50,
    rushFeePct: 20,
    personalizationFeePerUnit: 0,
    personalization: false,
    blankCost: 135,
    plainOrder: false,
    vinylSize: "Small",
    screenCostPerSideA4: 60,
    vinylRollPrice: 469,
    vinylWasteFactor: 1.2,
    dtfPackageFront: 300,
    dtfPackageFrontBack: 350,
  });

  assert.equal(result.unitCost, 275);
  assert.equal(result.suggestedUnitPrice, 550);
});

test("vinyl printing quote math", () => {
  const vinyl = getVinylCosts({ rollPrice: 469, wasteFactor: 1.2 });
  assert.equal(vinyl.small, 10);
  assert.equal(vinyl.large, 55);

  const result = computeQuote({
    method: "Vinyl",
    qty: 10,
    locations: 1,
    rush: false,
    artworkFee: 0,
    overheadPerOrder: 200,
    targetMarginPct: 50,
    rushFeePct: 20,
    personalizationFeePerUnit: 0,
    personalization: false,
    blankCost: 135,
    plainOrder: false,
    vinylSize: "Small",
    screenCostPerSideA4: 60,
    vinylRollPrice: 469,
    vinylWasteFactor: 1.2,
    dtfPackageFront: 300,
    dtfPackageFrontBack: 350,
  });

  assert.equal(result.unitCost, 165);
  assert.equal(result.suggestedUnitPrice, 330);
});

test("dtf package quote math", () => {
  const result = computeQuote({
    method: "DTF",
    qty: 10,
    locations: 1,
    rush: false,
    artworkFee: 0,
    overheadPerOrder: 200,
    targetMarginPct: 50,
    rushFeePct: 20,
    personalizationFeePerUnit: 0,
    personalization: false,
    blankCost: 135,
    plainOrder: false,
    vinylSize: "Small",
    screenCostPerSideA4: 60,
    vinylRollPrice: 469,
    vinylWasteFactor: 1.2,
    dtfPackageFront: 300,
    dtfPackageFrontBack: 350,
  });

  assert.equal(result.unitCost, 320);
  assert.equal(result.suggestedUnitPrice, 640);
});
