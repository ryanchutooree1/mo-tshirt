const test = require("node:test");
const assert = require("node:assert/strict");
const { computeQuote, getVinylCosts } = require("../src/lib/pricing");

test("vinyl price book mode ignores overhead and uses labor + material", () => {
  const vinyl = getVinylCosts({ rollPrice: 469, wasteFactor: 1.2 });
  assert.equal(vinyl.small, 10);

  const result = computeQuote({
    pricingMode: "priceBook",
    itemType: "T-Shirt",
    sizeBand: "XS-XL",
    method: "Vinyl",
    printOption: "FRONT_SMALL",
    qty: 1,
    rush: false,
    artworkFee: 0,
    overheadPerOrder: 200,
    targetMarginPct: 50,
    rushFeePct: 20,
    personalizationFeePerUnit: 0,
    personalization: false,
    blankCost: 135,
    plainOrder: false,
    screenCostPerSideA4: 60,
    vinylRollPrice: 469,
    vinylWasteFactor: 1.2,
    vinylLaborSmallPerUnit: 50,
    vinylLaborLargePerUnit: 45,
    dtfPackageFront: 300,
    dtfPackageFrontBack: 350,
  });

  assert.equal(result.unitCost, 195);
  assert.equal(result.suggestedUnitPrice, 270);
});

test("vinyl margin engine mode applies overhead and margin", () => {
  const result = computeQuote({
    pricingMode: "marginEngine",
    itemType: "T-Shirt",
    sizeBand: "XS-XL",
    method: "Vinyl",
    printOption: "FRONT_SMALL",
    qty: 1,
    rush: false,
    artworkFee: 0,
    overheadPerOrder: 200,
    targetMarginPct: 50,
    rushFeePct: 20,
    personalizationFeePerUnit: 0,
    personalization: false,
    blankCost: 135,
    plainOrder: false,
    screenCostPerSideA4: 60,
    vinylRollPrice: 469,
    vinylWasteFactor: 1.2,
    vinylLaborSmallPerUnit: 50,
    vinylLaborLargePerUnit: 45,
    dtfPackageFront: 300,
    dtfPackageFrontBack: 350,
  });

  assert.equal(result.unitCost, 395);
  assert.equal(result.suggestedUnitPrice, 790);
});
