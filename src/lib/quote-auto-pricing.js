const { computeQuote, getBlankInfo, getPriceBookPrice } = require("./pricing");

const PRINT_PLACEMENT_TO_OPTION = {
  small_front_only: "FRONT_SMALL",
  small_back_only: "FRONT_SMALL",
  large_front_only: "FRONT_LARGE",
  back_only: "FRONT_LARGE",
  small_front_back: "FRONT_SMALL_BACK_SMALL",
  small_front_large_back: "FRONT_SMALL_BACK_LARGE",
  large_front_small_back: "FRONT_LARGE_BACK_SMALL",
  front_back: "FRONT_LARGE_BACK_LARGE",
  large_front_large_back: "FRONT_LARGE_BACK_LARGE",
  logo_only: "FRONT_SMALL",
  logo_front_back: "FRONT_LARGE_BACK_LARGE",
};

const PRINT_PLACEMENT_LABELS = {
  small_front_only: "Small Front Printing only",
  small_back_only: "Small Back Printing only",
  large_front_only: "Large Front Printing only",
  back_only: "Large Back Printing only",
  small_front_back: "Small Front and Small Back Printing",
  small_front_large_back: "Small Front and Large Back Printing",
  large_front_small_back: "Large Front and Small Back Printing",
  front_back: "Large Front and Large Back Printing",
  large_front_large_back: "Large Front and Large Back Printing",
  logo_only: "Logo Printing only",
  logo_front_back: "Logo Front + Back Printing",
  sleeve_only: "Sleeve Printing only",
  custom: "Other / see notes",
};

function clean(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Accept both the studio's display labels and the quote form's placement codes.
function normalizePrintPlacement(value) {
  const raw = clean(value);
  if (PRINT_PLACEMENT_LABELS[raw]) return raw;
  const key = normalizeKey(raw);
  if (key === "front") return "large_front_only";
  if (key === "back") return "back_only";
  if (key === "front back" || key === "front and back") return "front_back";
  return null;
}

function normalizeMethod(value) {
  const method = normalizeKey(value);
  if (method.includes("dtf") || method.includes("direct to film")) return "DTF";
  if (method.includes("vinyl")) return "Vinyl";
  if (method.includes("screen") || method.includes("serie")) return "Screen";
  return null;
}

function normalizeItemType(value) {
  const item = normalizeKey(value);
  if (item.includes("polo")) return "Polo";
  if (item.includes("t shirt") || item.includes("tshirt") || item === "tee") return "T-Shirt";
  return null;
}

function normalizeSizeBand(value) {
  const size = clean(value).replace(/\s+/g, "").toUpperCase();
  if (/^(1|2|4|6|8|10|12|14)(YR|YRS|YEAR|YEARS)?$/.test(size)) return "Kids 1-14";
  if (["XS", "S", "M", "L", "XL"].includes(size)) return "XS-XL";
  if (["XXL", "2XL"].includes(size)) return "2XL";
  if (["XXXL", "XXXXL", "3XL", "4XL"].includes(size)) return "3XL-4XL";
  return null;
}

function formatGarmentDescription(entry) {
  const garment = clean(entry?.garment) || "Custom item";
  const details = [clean(entry?.color), clean(entry?.size)].filter(Boolean);
  return details.length ? `${garment} (${details.join(" / ")})` : garment;
}

function getArtworkItems(designBrief) {
  if (!designBrief || typeof designBrief !== "object" || Array.isArray(designBrief)) return [];
  const artwork = Array.isArray(designBrief.artwork)
    ? designBrief.artwork.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    : [];
  if (artwork.length) return artwork;
  return clean(designBrief.printPlacement)
    ? [{ printPlacement: clean(designBrief.printPlacement) }]
    : [];
}

function getAssistantPrintPlacement({ positions, sizes } = {}) {
  const positionList = Array.isArray(positions) ? positions.map(normalizeKey) : [];
  const sizeList = Array.isArray(sizes) ? sizes.map(normalizeKey) : [];
  const hasSmall = sizeList.some((value) => value.includes("small") || value.includes("9x9"));
  const hasLarge = sizeList.some((value) => value.includes("large") || value.includes("22x22"));
  const hasSmallFront = positionList.some((value) =>
    value.includes("left chest") || value.includes("small front") || value.includes("front left")
  );
  const hasFront = hasSmallFront || positionList.some((value) => value.includes("front"));
  const hasBack = positionList.some((value) => value.includes("back") || value.includes("rear"));
  const hasSleeve = positionList.some((value) => value.includes("sleeve") || value.includes("arm"));

  if (hasFront && hasBack) {
    if (hasSmallFront || (hasSmall && hasLarge)) return "small_front_large_back";
    if (hasSmall && !hasLarge) return "small_front_back";
    return "front_back";
  }
  if (hasSmallFront || (hasFront && hasSmall && !hasLarge)) return "small_front_only";
  if (hasFront) return "large_front_only";
  if (hasBack && hasSmall && !hasLarge) return "small_back_only";
  if (hasBack) return "back_only";
  if (hasSleeve) return "sleeve_only";
  return null;
}

function artworkMatchScore(garment, artwork) {
  const garmentProduct = normalizeKey(garment?.garment);
  const artworkProduct = normalizeKey(artwork?.product);
  if (garmentProduct && artworkProduct && garmentProduct !== artworkProduct) return -1;

  let score = garmentProduct && artworkProduct ? 2 : 0;
  const pairs = [
    [garment?.color, artwork?.color],
    [garment?.size, artwork?.size],
  ];
  pairs.forEach(([left, right]) => {
    const leftKey = normalizeKey(left);
    const rightKey = normalizeKey(right);
    if (leftKey && rightKey && leftKey === rightKey) score += 1;
  });
  return score;
}

function findArtworkForGarment(garment, artworkItems) {
  if (artworkItems.length === 1) return artworkItems[0];
  let best = null;
  let bestScore = -1;
  artworkItems.forEach((artwork) => {
    const score = artworkMatchScore(garment, artwork);
    if (score > bestScore) {
      best = artwork;
      bestScore = score;
    }
  });
  return bestScore >= 2 ? best : null;
}

function getAutomaticUnitPrice({ garment, printMethod, printPlacement }) {
  const itemType = normalizeItemType(garment?.garment);
  // Older website requests did not always store a size. The existing price book
  // uses XS-XL as its normal/default band, so use that band for those records.
  const sizeBand = normalizeSizeBand(garment?.size) || "XS-XL";
  if (normalizeKey(printMethod) === "no customization") {
    const blank = getBlankInfo(itemType, normalizeKey(garment?.color) === "red" ? "Red" : "Standard", sizeBand);
    return blank?.plainSell || null;
  }
  const method = normalizeMethod(printMethod);
  const printOption = PRINT_PLACEMENT_TO_OPTION[normalizePrintPlacement(printPlacement)];
  if (!itemType || !sizeBand || !method || !printOption) return null;

  const unitPrice = getPriceBookPrice({
    itemType,
    sizeBand,
    method,
    printOption,
    quantity: garment?.quantity,
  });
  return Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : null;
}

function getAutomaticUnitCost({ garment, printMethod, printPlacement }) {
  const itemType = normalizeItemType(garment?.garment);
  const sizeBand = normalizeSizeBand(garment?.size) || "XS-XL";
  if (normalizeKey(printMethod) === "no customization") {
    return getBlankInfo(itemType, normalizeKey(garment?.color) === "red" ? "Red" : "Standard", sizeBand)?.cost || null;
  }
  const method = normalizeMethod(printMethod);
  const printOption = PRINT_PLACEMENT_TO_OPTION[normalizePrintPlacement(printPlacement)];
  if (!itemType || !sizeBand || !method || !printOption) return null;

  const colorFamily = normalizeKey(garment?.color) === "red" ? "Red" : "Standard";
  const blankInfo = getBlankInfo(itemType, colorFamily, sizeBand);
  if (!blankInfo && method !== "DTF") return null;

  const pricing = computeQuote({
    qty: garment?.quantity,
    itemType,
    sizeBand,
    method,
    printOption,
    blankCost: blankInfo?.cost || 0,
  });
  return Number.isFinite(pricing.unitCost) && pricing.unitCost > 0
    ? pricing.unitCost
    : null;
}

function getAutomaticDeliveryFee(delivery) {
  const value = normalizeKey(delivery);
  if (value.includes("express")) return 150;
  if (value.includes("post office") || value.includes("postage")) return 100;
  return 0;
}

function buildAutomaticQuotePricing({
  garments,
  printMethod,
  designBrief,
  delivery,
  fallbackPrintPlacement,
  fallbackPrintMethod,
} = {}) {
  const garmentLines = Array.isArray(garments) ? garments : [];
  const artworkItems = getArtworkItems(designBrief);
  const lines = garmentLines.map((garment) => {
    const artwork = findArtworkForGarment(garment, artworkItems);
    const rawPlacement = clean(artwork?.printPlacement) || clean(designBrief?.printPlacement);
    const fallback = normalizePrintPlacement(fallbackPrintPlacement);
    // An unspecified layout gets a visible large-front estimate. Explicit custom
    // or unsupported layouts still need review; do not pretend they are standard.
    const assumedPlacement = !rawPlacement && !fallback;
    const printPlacement = normalizePrintPlacement(rawPlacement) ||
      (rawPlacement ? rawPlacement : fallback || "large_front_only");
    const placementLabel = PRINT_PLACEMENT_LABELS[printPlacement];
    const effectivePrintMethod = normalizeMethod(printMethod) || normalizeKey(printMethod) === "no customization"
      ? printMethod
      : fallbackPrintMethod || "DTF";
    const unitPrice = getAutomaticUnitPrice({
      garment,
      printMethod: effectivePrintMethod,
      printPlacement,
    });
    const unitCost = getAutomaticUnitCost({
      garment,
      printMethod: effectivePrintMethod,
      printPlacement,
    });
    const pricingDescription = [
      normalizeMethod(effectivePrintMethod) || clean(effectivePrintMethod),
      ...(normalizeKey(effectivePrintMethod) === "no customization" ? [] : [placementLabel]),
      ...(assumedPlacement && normalizeKey(effectivePrintMethod) !== "no customization" ? ["Estimated placement — confirm artwork"] : []),
    ]
      .filter(Boolean)
      .join(" — ");
    const description = [formatGarmentDescription(garment), pricingDescription]
      .filter(Boolean)
      .join(" — ");

    return {
      description,
      quantity: Math.max(0, Number(garment?.quantity) || 0),
      unitPrice: unitPrice || 0,
      includeInTotals: true,
      automaticPrice: unitPrice,
      unitCost,
      unitProfit:
        unitPrice && unitCost ? unitPrice - unitCost : null,
      printPlacement: printPlacement || null,
    };
  });
  const deliveryFee = getAutomaticDeliveryFee(delivery);
  const subtotal = lines.reduce(
    (sum, line) => sum + line.quantity * (line.automaticPrice || 0),
    0
  );
  const pricedLineCount = lines.filter((line) => line.automaticPrice).length;

  return {
    lines,
    deliveryFee,
    subtotal,
    total: subtotal + deliveryFee,
    pricedLineCount,
    requiresReview: pricedLineCount !== lines.length,
  };
}

module.exports = {
  PRINT_PLACEMENT_TO_OPTION,
  buildAutomaticQuotePricing,
  getAssistantPrintPlacement,
  getAutomaticDeliveryFee,
  getAutomaticUnitCost,
  getAutomaticUnitPrice,
  normalizePrintPlacement,
  normalizeItemType,
  normalizeMethod,
  normalizeSizeBand,
};
