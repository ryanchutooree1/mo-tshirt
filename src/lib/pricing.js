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
const DTF_PACKAGE_FRONT = 300;
const DTF_PACKAGE_FRONT_BACK = 350;

function roundUpToNearest5(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.ceil(n / 5) * 5;
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

function computeQuote(input) {
  const qty = Math.max(1, Number(input.qty) || 1);
  const locations = Math.max(1, Math.min(2, Number(input.locations) || 1));
  const rush = Boolean(input.rush);
  const plainOrder = Boolean(input.plainOrder);
  const method = input.method || "Screen";

  const blankCost = Number(input.blankCost) || 0;
  const overheadPerOrder = Number(input.overheadPerOrder) || 0;
  const artworkFee = Number(input.artworkFee) || 0;
  const personalizationFeePerUnit = Number(input.personalizationFeePerUnit) || 0;
  const personalization = Boolean(input.personalization);

  const screenCostPerSideA4 = Number(input.screenCostPerSideA4) || SCREEN_COST_PER_SIDE_A4;
  const vinylRollPrice = Number(input.vinylRollPrice) || VINYL_ROLL_PRICE;
  const vinylWasteFactor = Number(input.vinylWasteFactor) || VINYL_WASTE_FACTOR;
  const dtfPackageFront = Number(input.dtfPackageFront) || DTF_PACKAGE_FRONT;
  const dtfPackageFrontBack = Number(input.dtfPackageFrontBack) || DTF_PACKAGE_FRONT_BACK;

  const overheadUnit = overheadPerOrder / qty;
  const artworkUnit = plainOrder ? 0 : artworkFee / qty;
  const personalizationUnit = plainOrder ? 0 : personalization ? personalizationFeePerUnit : 0;

  let unitCostBase = blankCost;
  let decorationCostPerUnit = 0;
  let vinylCostBySize = 0;

  if (!plainOrder) {
    if (method === "DTF") {
      unitCostBase = locations === 1 ? dtfPackageFront : dtfPackageFrontBack;
    } else if (method === "Screen") {
      decorationCostPerUnit = screenCostPerSideA4 * locations;
    } else if (method === "Vinyl") {
      const vinylCosts = getVinylCosts({ rollPrice: vinylRollPrice, wasteFactor: vinylWasteFactor });
      vinylCostBySize = input.vinylSize === "Large" ? vinylCosts.large : vinylCosts.small;
      decorationCostPerUnit = vinylCostBySize * locations;
    }
  }

  const unitCost = unitCostBase + decorationCostPerUnit + overheadUnit + artworkUnit + personalizationUnit;

  let targetMarginPct = Number(input.targetMarginPct) || 0;
  targetMarginPct = Math.max(0, Math.min(95, targetMarginPct));
  let suggestedUnitPrice = unitCost / (1 - targetMarginPct / 100 || 1);
  suggestedUnitPrice = roundUpToNearest5(suggestedUnitPrice);

  const rushFeePct = Math.max(0, Number(input.rushFeePct) || 0);
  if (rush) {
    suggestedUnitPrice = roundUpToNearest5(suggestedUnitPrice * (1 + rushFeePct / 100));
  }

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
    overheadUnit,
    artworkUnit,
    personalizationUnit,
    suggestedUnitPrice,
    unitProfit,
    marginPct,
    quoteTotal,
  };
}

module.exports = {
  BLANK_CATALOG,
  SCREEN_COST_PER_SIDE_A4,
  VINYL_ROLL_PRICE,
  VINYL_WASTE_FACTOR,
  VINYL_ROLL_WIDTH_CM,
  VINYL_ROLL_LENGTH_CM,
  DTF_PACKAGE_FRONT,
  DTF_PACKAGE_FRONT_BACK,
  roundUpToNearest5,
  getBlankOptions,
  getBlankInfo,
  getVinylCosts,
  computeQuote,
};
