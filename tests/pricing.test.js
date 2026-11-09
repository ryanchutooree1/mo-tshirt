const test = require("node:test");
const assert = require("node:assert/strict");
const { computeQuote, getPriceBookPrice, getVinylCosts } = require("../src/lib/pricing");

test("DTF T-shirts use the fixed one-side and two-side prices", () => {
  for (const printOption of ["FRONT_SMALL", "FRONT_LARGE"]) {
    assert.equal(
      getPriceBookPrice({ itemType: "T-Shirt", sizeBand: "XS-XL", method: "DTF", printOption, quantity: 60 }),
      450
    );
  }
  for (const printOption of ["FRONT_SMALL_BACK_LARGE", "FRONT_LARGE_BACK_LARGE"]) {
    assert.equal(
      getPriceBookPrice({ itemType: "T-Shirt", sizeBand: "XS-XL", method: "DTF", printOption, quantity: 60 }),
      500
    );
  }
});

test("vinyl price book mode uses current retail pricing and excludes overhead from cost", () => {
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

  assert.equal(result.productionCostPerUnit, 10);
  assert.equal(result.laborPerUnit, 50);
  assert.equal(result.overheadUnit, 0);
  assert.equal(result.unitCost, 195);
  // July 2026 price book: Rs 390 garment base + Rs 30 vinyl printing.
  assert.equal(result.priceBookPrice, 420);
  assert.equal(result.suggestedUnitPrice, 420);
  assert.equal(result.quoteTotal, 420);
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

test("front-and-back DTF prices use exact 2XL and 3XL sizes without quantity discounts", () => {
  for (const size of ["2XL", "XXL", "3XL", "XXXL", " 3xl "]) {
    for (const printOption of ["FRONT_SMALL_BACK_SMALL", "FRONT_SMALL_BACK_LARGE", "FRONT_LARGE_BACK_SMALL", "FRONT_LARGE_BACK_LARGE"]) {
      for (const quantity of [1, 5, 10, 30, 50]) {
        assert.equal(getPriceBookPrice({ itemType: "T-Shirt", sizeBand: "3XL-4XL", size, method: "DTF", printOption, quantity }), 600);
      }
    }
  }
  assert.equal(getPriceBookPrice({ itemType: "T-Shirt", sizeBand: "2XL", method: "DTF", printOption: "FRONT_SMALL_BACK_LARGE" }), 600);
});

test("other DTF sizes and one-sided placement prices remain unchanged", () => {
  for (const size of ["XS", "S", "M", "L", "XL", "4XL", "XXXXL", "8 years"]) {
    assert.equal(getPriceBookPrice({ itemType: "T-Shirt", size, method: "DTF", printOption: "FRONT_LARGE_BACK_LARGE" }), 500);
  }
  for (const size of ["XS", "2XL", "XXL", "3XL", "XXXL", "4XL"]) {
    for (const printOption of ["FRONT_SMALL", "FRONT_LARGE"]) {
      assert.equal(getPriceBookPrice({ itemType: "T-Shirt", size, method: "DTF", printOption, quantity: 60 }), 450);
    }
  }
});

test("computeQuote returns the size-specific selling price and total without changing costs", () => {
  const input = { itemType: "T-Shirt", sizeBand: "3XL-4XL", size: "3XL", method: "DTF", printOption: "FRONT_SMALL_BACK_LARGE", qty: 3 };
  const result = computeQuote(input);
  assert.equal(result.priceBookPrice, 600);
  assert.equal(result.suggestedUnitPrice, 600);
  assert.equal(result.quoteTotal, 1800);
  assert.equal(result.unitCost, 350);
  assert.equal(result.unitProfit, 250);
  assert.equal(computeQuote({ ...input, size: "4XL" }).quoteTotal, 1500);
  assert.equal(computeQuote({ ...input, priceBookPrice: 575 }).suggestedUnitPrice, 575);
});
