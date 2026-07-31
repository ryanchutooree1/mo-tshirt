const CUSTOM_ORDER_MINIMUM = 500;

function getMinimumOrderAdjustment({
  hasCustomization,
  totalQty,
  minimumQuantity,
  productionSubtotal,
  minimumTotal = CUSTOM_ORDER_MINIMUM,
}) {
  if (!hasCustomization || totalQty <= 0 || totalQty >= minimumQuantity) return 0;
  return Math.max(0, minimumTotal - productionSubtotal);
}

module.exports = {
  CUSTOM_ORDER_MINIMUM,
  getMinimumOrderAdjustment,
};
