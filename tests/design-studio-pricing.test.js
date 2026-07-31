const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CUSTOM_ORDER_MINIMUM,
  getMinimumOrderAdjustment,
} = require("../src/lib/design-studio-pricing");

test("raises a small customized front-and-back order to the Rs 500 minimum", () => {
  const productionSubtotal = 270;
  const adjustment = getMinimumOrderAdjustment({
    hasCustomization: true,
    totalQty: 1,
    minimumQuantity: 10,
    productionSubtotal,
  });

  assert.equal(adjustment, 230);
  assert.equal(productionSubtotal + adjustment, CUSTOM_ORDER_MINIMUM);
});

test("does not add a minimum adjustment when the customized subtotal is already over Rs 500", () => {
  assert.equal(
    getMinimumOrderAdjustment({
      hasCustomization: true,
      totalQty: 1,
      minimumQuantity: 10,
      productionSubtotal: 545,
    }),
    0
  );
});

test("does not apply the customized-order minimum to plain garments", () => {
  assert.equal(
    getMinimumOrderAdjustment({
      hasCustomization: false,
      totalQty: 1,
      minimumQuantity: 10,
      productionSubtotal: 175,
    }),
    0
  );
});
