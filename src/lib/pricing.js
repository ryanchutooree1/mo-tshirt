const BLANK_CATALOG = {
  "T-Shirt": {
    Standard: {
      "Kids 1-14": { cost: 125, plainSell: 150 },
      "XS-XL": { cost: 135, plainSell: 175 },
      "2XL": { cost: 200, plainSell: 250 },
      "3XL-4XL": { cost: 225, plainSell: 300 },
    },
    Red: {
      "Kids 1-14": { cost: 150, plainSell: 175 },
      "XS-XL": { cost: 175, plainSell: 200 },
      "2XL": { cost: 200, plainSell: 225 },
      "3XL-4XL": { cost: 200, plainSell: 225 },
    },
  },
  Polo: {
    Standard: {
      "Kids 1-14": { cost: 300, plainSell: 350 },
      "XS-XL": { cost: 350, plainSell: 450 },
      "2XL": { cost: 350, plainSell: 475 },
      "3XL-4XL": { cost: 400, plainSell: 575 },
    },
    Red: {
      "XS-XL": { cost: 375, plainSell: 475 },
      "2XL": { cost: 375, plainSell: 475 },
      "3XL-4XL": { cost: 400, plainSell: 575 },
    },
  },
};

const SIZE_BANDS = {
  "T-Shirt": {
    Standard: ["Kids 1-14", "XS-XL", "2XL", "3XL-4XL"],
    Red: ["Kids 1-14", "XS-XL", "2XL", "3XL-4XL"],
  },
  Polo: {
    Standard: ["Kids 1-14", "XS-XL", "2XL", "3XL-4XL"],
    Red: ["XS-XL", "2XL", "3XL-4XL"],
  },
};

const SCREEN_COST_PER_SIDE_A4 = 60;
const VINYL_ROLL_PRICE = 469;
const VINYL_WASTE_FACTOR = 1.2;
const VINYL_ROLL_WIDTH_CM = 50;
const VINYL_ROLL_LENGTH_CM = 100;
const VINYL_LABOR_SMALL_PER_UNIT = 50;
const VINYL_LABOR_LARGE_PER_UNIT = 45;
const DTF_PACKAGE_FRONT = 300;
const DTF_PACKAGE_FRONT_BACK = 350;

const PRINT_OPTIONS = [
  { value: "FRONT_SMALL", label: "Front small (9x9)", sides: 1, frontSize: "Small", backSize: null },
  { value: "FRONT_LARGE", label: "Front large (22x22)", sides: 1, frontSize: "Large", backSize: null },
  { value: "FRONT_SMALL_BACK_LARGE", label: "Front small + Back large", sides: 2, frontSize: "Small", backSize: "Large" },
  { value: "FRONT_LARGE_BACK_LARGE", label: "Front large + Back large", sides: 2, frontSize: "Large", backSize: "Large" },
];

const ITEM_TYPE_KEYS = {
  "T-Shirt": "TSHIRT",
  TSHIRT: "TSHIRT",
  Polo: "POLO",
  POLO: "POLO",
};

const SIZE_BAND_KEYS = {
  "Kids 1-14": "Kids",
  Kids: "Kids",
  "XS-XL": "XS_XL",
  XS_XL: "XS_XL",
  "2XL": "2XL",
  "3XL-4XL": "3XL_4XL",
  "3XL_4XL": "3XL_4XL",
};

const METHOD_KEYS = {
  Screen: "SCREEN",
  SCREEN: "SCREEN",
  Vinyl: "VINYL",
  VINYL: "VINYL",
  DTF: "DTF",
};

// Mauritius market positioning reviewed in July 2026. These are retail prices
// for short-run custom work; quantity factors below keep larger jobs competitive.
const PRICE_BOOK_BASE = {
  TSHIRT: { Kids: 350, XS_XL: 390, "2XL": 460, "3XL_4XL": 520 },
  POLO: { Kids: 525, XS_XL: 590, "2XL": 640, "3XL_4XL": 740 },
};

const METHOD_ADD = { SCREEN: 0, VINYL: 30, DTF: 60 };
const PRINT_OPTION_ADD = {
  FRONT_SMALL: 0,
  FRONT_LARGE: 75,
  FRONT_SMALL_BACK_SMALL: 125,
  FRONT_SMALL_BACK_LARGE: 175,
  FRONT_LARGE_BACK_SMALL: 175,
  FRONT_LARGE_BACK_LARGE: 225,
};

const QUANTITY_PRICE_FACTORS = [
  { min: 50, factor: 0.8 },
  { min: 30, factor: 0.85 },
  { min: 10, factor: 0.9 },
  { min: 5, factor: 0.95 },
  { min: 1, factor: 1 },
];

const PRICE_BOOK = (() => {
  const book = {};
  Object.entries(PRICE_BOOK_BASE).forEach(([itemKey, sizeMap]) => {
    book[itemKey] = {};
    Object.entries(sizeMap).forEach(([sizeKey, base]) => {
      book[itemKey][sizeKey] = {};
      Object.keys(METHOD_ADD).forEach((methodKey) => {
        book[itemKey][sizeKey][methodKey] = {};
        Object.keys(PRINT_OPTION_ADD).forEach((printKey) => {
          book[itemKey][sizeKey][methodKey][printKey] =
            Number(base) + METHOD_ADD[methodKey] + PRINT_OPTION_ADD[printKey];
        });
      });
    });
  });
  return book;
})();

function roundUpToNearest5(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.ceil(n / 5) * 5;
}

function getPrintOptionConfig(value) {
  return PRINT_OPTIONS.find((opt) => opt.value === value) || null;
}

function getBlankOptions(itemType, colorFamily) {
  return SIZE_BANDS?.[itemType]?.[colorFamily] || [];
}

function getBlankInfo(itemType, colorFamily, sizeBand) {
  const entry = BLANK_CATALOG?.[itemType]?.[colorFamily]?.[sizeBand];
  if (!entry) return null;
  return { cost: entry.cost, plainSell: entry.plainSell };
}

function getVinylCosts({ rollPrice = VINYL_ROLL_PRICE, wasteFactor = VINYL_WASTE_FACTOR } = {}) {
  const rollArea = VINYL_ROLL_WIDTH_CM * VINYL_ROLL_LENGTH_CM;
  const costPerCm2 = (Number(rollPrice) * Number(wasteFactor)) / rollArea;
  const small = roundUpToNearest5(costPerCm2 * 81);
  const large = roundUpToNearest5(costPerCm2 * 484);
  return { rollArea, costPerCm2, small, large };
}

function getPriceBookPrice({ itemType, sizeBand, method, printOption, quantity = 1 } = {}) {
  const itemKey = ITEM_TYPE_KEYS[itemType] || ITEM_TYPE_KEYS[`${itemType}`] || "TSHIRT";
  const sizeKey = SIZE_BAND_KEYS[sizeBand] || SIZE_BAND_KEYS[`${sizeBand}`] || "XS_XL";
  const methodKey = METHOD_KEYS[method] || METHOD_KEYS[`${method}`] || "SCREEN";
  const printKey = printOption || "FRONT_SMALL";
  const retailPrice = (
    PRICE_BOOK?.[itemKey]?.[sizeKey]?.[methodKey]?.[printKey] ||
    0
  );
  if (!retailPrice) return 0;

  const qty = Math.max(1, Number(quantity) || 1);
  const quantityFactor =
    QUANTITY_PRICE_FACTORS.find((tier) => qty >= tier.min)?.factor || 1;
  return roundUpToNearest5(retailPrice * quantityFactor);
}

function computeQuote(input) {
  const qty = Math.max(1, Number(input.qty) || 1);
  const printConfig = getPrintOptionConfig(input.printOption);
  const locations = printConfig
    ? printConfig.sides
    : Math.max(1, Math.min(2, Number(input.locations) || 1));
  const rush = Boolean(input.rush);
  const plainOrder = Boolean(input.plainOrder);
  const method = input.method || "Screen";
  const pricingMode = input.pricingMode === "marginEngine" ? "marginEngine" : "priceBook";

  const blankCost = Number(input.blankCost) || 0;
  const plainSell = Number(input.plainSell) || 0;
  const priceBookPrice =
    Number(input.priceBookPrice) ||
    getPriceBookPrice({
      itemType: input.itemType,
      sizeBand: input.sizeBand || input.blankSizeBand,
      method,
      printOption: input.printOption || "FRONT_SMALL",
      quantity: qty,
    });
  const handlingFeePerUnit = Number(input.handlingFeePerUnit) || 0;
  const overheadPerOrder = Number(input.overheadPerOrder) || 0;
  const artworkFee = Number(input.artworkFee) || 0;
  const personalizationFeePerUnit = Number(input.personalizationFeePerUnit) || 0;
  const personalization = Boolean(input.personalization);

  const screenCostPerSideA4 = Number(input.screenCostPerSideA4) || SCREEN_COST_PER_SIDE_A4;
  const vinylRollPrice = Number(input.vinylRollPrice) || VINYL_ROLL_PRICE;
  const vinylWasteFactor = Number(input.vinylWasteFactor) || VINYL_WASTE_FACTOR;
  const vinylLaborSmallPerUnit = Number(input.vinylLaborSmallPerUnit) || VINYL_LABOR_SMALL_PER_UNIT;
  const vinylLaborLargePerUnit = Number(input.vinylLaborLargePerUnit) || VINYL_LABOR_LARGE_PER_UNIT;
  const dtfPackageFront = Number(input.dtfPackageFront) || DTF_PACKAGE_FRONT;
  const dtfPackageFrontBack = Number(input.dtfPackageFrontBack) || DTF_PACKAGE_FRONT_BACK;
  const dtfDeliveryFee = Number(input.dtfDeliveryFee) || 0;
  const dtfIncludesDelivery = Boolean(input.dtfIncludesDelivery);

  const overheadUnit = overheadPerOrder / qty;
  const artworkUnit = artworkFee / qty;
  const personalizationUnit = personalization ? personalizationFeePerUnit : 0;
  const dtfDeliveryUnit = dtfIncludesDelivery ? dtfDeliveryFee / qty : 0;

  let unitCostBase = blankCost;
  let productionCostPerUnit = 0;
  let laborPerUnit = 0;
  let vinylCostBySize = 0;

  if (plainOrder) {
    const decorationCostPerUnit = 0;
    const unitCost = blankCost + handlingFeePerUnit;
    const suggestedUnitPrice = plainSell;
    const unitProfit = suggestedUnitPrice - unitCost;
    const marginPct = suggestedUnitPrice ? unitProfit / suggestedUnitPrice : 0;
    const quoteTotal = suggestedUnitPrice * qty;

    return {
      qty,
      locations,
      unitCost,
      unitCostBase,
      decorationCostPerUnit,
      vinylCostBySize,
      overheadUnit: 0,
      artworkUnit: 0,
      personalizationUnit: 0,
      laborPerUnit: 0,
      productionCostPerUnit: 0,
      priceBookPrice: plainSell,
      pricingMode: "plain",
      printOption: input.printOption || null,
      suggestedUnitPrice,
      unitProfit,
      marginPct,
      quoteTotal,
    };
  }

  if (method === "DTF") {
    unitCostBase = locations === 1 ? dtfPackageFront : dtfPackageFrontBack;
    productionCostPerUnit = 0;
    laborPerUnit = 0;
  } else if (method === "Screen") {
    productionCostPerUnit = screenCostPerSideA4 * locations;
    laborPerUnit = 0;
  } else if (method === "Vinyl") {
    const vinylCosts = getVinylCosts({ rollPrice: vinylRollPrice, wasteFactor: vinylWasteFactor });
    const sizes = printConfig
      ? [printConfig.frontSize, printConfig.backSize].filter(Boolean)
      : Array.from({ length: locations }, () => (input.vinylSize === "Large" ? "Large" : "Small"));
    vinylCostBySize = sizes.length === 1
      ? sizes[0] === "Large"
        ? vinylCosts.large
        : vinylCosts.small
      : 0;
    productionCostPerUnit = sizes.reduce(
      (sum, size) => sum + (size === "Large" ? vinylCosts.large : vinylCosts.small),
      0
    );
    laborPerUnit = sizes.reduce(
      (sum, size) => sum + (size === "Large" ? vinylLaborLargePerUnit : vinylLaborSmallPerUnit),
      0
    );
  }

  const baseCost = method === "DTF" ? unitCostBase : blankCost;
  const unitCost =
    baseCost +
    productionCostPerUnit +
    laborPerUnit +
    artworkUnit +
    personalizationUnit +
    dtfDeliveryUnit +
    (pricingMode === "marginEngine" ? overheadUnit : 0);

  let suggestedUnitPrice = priceBookPrice;
  if (pricingMode === "marginEngine") {
    let targetMarginPct = Number(input.targetMarginPct) || 0;
    targetMarginPct = Math.max(0, Math.min(95, targetMarginPct));
    suggestedUnitPrice = unitCost / (1 - targetMarginPct / 100 || 1);
    suggestedUnitPrice = roundUpToNearest5(suggestedUnitPrice);

    const rushFeePct = Math.max(0, Number(input.rushFeePct) || 0);
    if (rush) {
      suggestedUnitPrice = roundUpToNearest5(suggestedUnitPrice * (1 + rushFeePct / 100));
    }
  }

  const unitProfit = suggestedUnitPrice - unitCost;
  const marginPct = suggestedUnitPrice ? unitProfit / suggestedUnitPrice : 0;
  const quoteTotal = suggestedUnitPrice * qty;

  return {
    qty,
    locations,
    unitCost,
    unitCostBase,
    productionCostPerUnit,
    laborPerUnit,
    vinylCostBySize,
    overheadUnit: pricingMode === "marginEngine" ? overheadUnit : 0,
    artworkUnit,
    personalizationUnit,
    dtfDeliveryUnit,
    priceBookPrice,
    pricingMode,
    printOption: input.printOption || null,
    suggestedUnitPrice,
    unitProfit,
    marginPct,
    quoteTotal,
  };
}

module.exports = {
  BLANK_CATALOG,
  PRICE_BOOK,
  PRINT_OPTIONS,
  SCREEN_COST_PER_SIDE_A4,
  VINYL_ROLL_PRICE,
  VINYL_WASTE_FACTOR,
  VINYL_ROLL_WIDTH_CM,
  VINYL_ROLL_LENGTH_CM,
  VINYL_LABOR_SMALL_PER_UNIT,
  VINYL_LABOR_LARGE_PER_UNIT,
  DTF_PACKAGE_FRONT,
  DTF_PACKAGE_FRONT_BACK,
  QUANTITY_PRICE_FACTORS,
  roundUpToNearest5,
  getPrintOptionConfig,
  getBlankOptions,
  getBlankInfo,
  getVinylCosts,
  getPriceBookPrice,
  computeQuote,
};
