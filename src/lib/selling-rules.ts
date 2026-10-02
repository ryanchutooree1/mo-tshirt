/** Generic templates only. Approved commercial values live in private runtime storage. */
export const SELLING_RULE_OFFERS = [
  { id: "tee_small_front", label: "T-shirt · small front", garment: "tshirt", placement: "Small front print", printSizes: ["small"] },
  { id: "tee_large_front", label: "T-shirt · large front", garment: "tshirt", placement: "Large front print", printSizes: ["large"] },
  { id: "tee_small_front_large_back", label: "T-shirt · front + back", garment: "tshirt", placement: "Small front + large back print", printSizes: ["small", "large"] },
  { id: "polo_front", label: "Polo · front", garment: "polo", placement: "Front print", printSizes: [] },
  { id: "polo_front_back", label: "Polo · front + back", garment: "polo", placement: "Front + back print", printSizes: [] },
] as const;

export type SellingRuleOfferId = (typeof SELLING_RULE_OFFERS)[number]["id"];
export type SellingRuleDeliveryOptionId = "pickup" | "post_standard" | "post_express";
export type SellingRulePrintDimensions = { widthCm: number | null; heightCm: number | null };
export type SellingRuleDeliveryOption = {
  id: SellingRuleDeliveryOptionId;
  label: string;
  priceMUR: number;
  description: string;
};
export type SellingRulesConfig = {
  schemaVersion: 1;
  offers: Record<SellingRuleOfferId, { priceMUR: number | null }>;
  rules: {
    inclusions: "garment_and_print" | "print_only" | null;
    smallPrint: SellingRulePrintDimensions;
    largePrint: SellingRulePrintDimensions;
    tshirtMethod: "unknown" | "vinyl" | "dtf" | "either";
    poloMethod: "vinyl" | null;
    turnaroundWorkingDays: { min: number; max: number } | null;
    depositPercent: 50 | 100 | null;
    delivery: "customer_paid" | null;
    deliveryOptions: SellingRuleDeliveryOption[];
    bulkReviewMinimum: number | null;
    bulkPolicy: string | null;
    minimumQuantityPolicy: string | null;
    rushPolicy: string | null;
    vatPolicy: string | null;
    designChargesPolicy: string | null;
    cancellationRefundPolicy: string | null;
    stockOtherProductsPolicy: string | null;
    exceptionsPolicy: string | null;
  };
};

export const EMPTY_SELLING_RULES_CONFIG: SellingRulesConfig = {
  schemaVersion: 1,
  offers: {
    tee_small_front: { priceMUR: null },
    tee_large_front: { priceMUR: null },
    tee_small_front_large_back: { priceMUR: null },
    polo_front: { priceMUR: null },
    polo_front_back: { priceMUR: null },
  },
  rules: {
    inclusions: null,
    smallPrint: { widthCm: null, heightCm: null },
    largePrint: { widthCm: null, heightCm: null },
    tshirtMethod: "unknown",
    poloMethod: null,
    turnaroundWorkingDays: null,
    depositPercent: null,
    delivery: null,
    deliveryOptions: [],
    bulkReviewMinimum: null,
    bulkPolicy: null,
    minimumQuantityPolicy: null,
    rushPolicy: null,
    vatPolicy: null,
    designChargesPolicy: null,
    cancellationRefundPolicy: null,
    stockOtherProductsPolicy: null,
    exceptionsPolicy: null,
  },
};

// Input-safety bounds, not minimum quantities, prices, or promises to customers.
const MAX_MONEY_MUR = 1_000_000;
const MAX_QUANTITY = 1_000_000;
const MAX_POLICY_LENGTH = 2_000;
const POLICY_FIELDS = [
  "bulkPolicy", "minimumQuantityPolicy", "rushPolicy", "vatPolicy",
  "designChargesPolicy", "cancellationRefundPolicy", "stockOtherProductsPolicy", "exceptionsPolicy",
] as const;

function strictObject(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key)) || Object.keys(record).some((key) => !keys.includes(key))) {
    throw new Error(`${label} has missing or unsupported fields.`);
  }
  return record;
}

function enumValue<T extends string | number | null>(value: unknown, choices: readonly T[], label: string): T {
  if (!choices.includes(value as T)) throw new Error(`${label} is not a supported choice.`);
  return value as T;
}

function money(value: unknown, nullable: true, label: string): number | null;
function money(value: unknown, nullable: false, label: string): number;
function money(value: unknown, nullable: boolean, label: string): number | null {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAX_MONEY_MUR || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) {
    throw new Error(`${label} must be positive, no more than ${MAX_MONEY_MUR}, and use at most two decimal places.`);
  }
  return Math.round(value * 100) / 100;
}

function positiveInteger(value: unknown, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`${label} must be a whole number from 1 to ${max}.`);
  return value;
}

function dimensions(value: unknown, label: string): SellingRulePrintDimensions {
  const record = strictObject(value, ["widthCm", "heightCm"], label);
  const dimension = (value: unknown) => {
    if (value === null) return null;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 200) throw new Error(`${label} dimensions must be positive and no more than 200 cm.`);
    return value;
  };
  return { widthCm: dimension(record.widthCm), heightCm: dimension(record.heightCm) };
}

function text(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error(`${label} must be non-empty text, no more than ${max} characters.`);
  return value.trim();
}

export function validateSellingRulesRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) throw new Error("Use the revision returned when the selling rules were loaded.");
  return value;
}

export function validateSellingRulesConfig(value: unknown): SellingRulesConfig {
  const config = strictObject(value, ["schemaVersion", "offers", "rules"], "Selling rules");
  if (config.schemaVersion !== 1) throw new Error("Selling rules schema version is not supported.");
  const offers = strictObject(config.offers, SELLING_RULE_OFFERS.map((offer) => offer.id), "Offers");
  const validOffers = Object.fromEntries(SELLING_RULE_OFFERS.map((offer) => {
    const item = strictObject(offers[offer.id], ["priceMUR"], offer.label);
    return [offer.id, { priceMUR: money(item.priceMUR, true, `${offer.label} price`) }];
  })) as SellingRulesConfig["offers"];
  const rules = strictObject(config.rules, Object.keys(EMPTY_SELLING_RULES_CONFIG.rules), "Rules");
  let turnaroundWorkingDays: SellingRulesConfig["rules"]["turnaroundWorkingDays"] = null;
  if (rules.turnaroundWorkingDays !== null) {
    const turnaround = strictObject(rules.turnaroundWorkingDays, ["min", "max"], "Turnaround");
    const min = positiveInteger(turnaround.min, 365, "Minimum working days");
    const max = positiveInteger(turnaround.max, 365, "Maximum working days");
    if (min > max) throw new Error("Minimum working days cannot exceed maximum working days.");
    turnaroundWorkingDays = { min, max };
  }
  if (!Array.isArray(rules.deliveryOptions) || rules.deliveryOptions.length > 3) throw new Error("Delivery options must contain at most three approved options.");
  const seen = new Set<string>();
  const deliveryOptions = rules.deliveryOptions.map((value): SellingRuleDeliveryOption => {
    const option = strictObject(value, ["id", "label", "priceMUR", "description"], "Delivery option");
    const id = enumValue(option.id, ["pickup", "post_standard", "post_express"] as const, "Delivery option");
    if (seen.has(id)) throw new Error("Delivery option IDs must be unique.");
    seen.add(id);
    const priceMUR = id === "pickup" && option.priceMUR === 0 ? 0 : money(option.priceMUR, false, "Delivery price");
    return { id, label: text(option.label, 100, "Delivery label"), priceMUR, description: text(option.description, 500, "Delivery description") };
  });
  const policies = Object.fromEntries(POLICY_FIELDS.map((key) => [key, rules[key] === null ? null : text(rules[key], MAX_POLICY_LENGTH, key)])) as Pick<SellingRulesConfig["rules"], (typeof POLICY_FIELDS)[number]>;
  return {
    schemaVersion: 1,
    offers: validOffers,
    rules: {
      inclusions: enumValue(rules.inclusions, [null, "garment_and_print", "print_only"] as const, "Price inclusions"),
      smallPrint: dimensions(rules.smallPrint, "Small print"),
      largePrint: dimensions(rules.largePrint, "Large print"),
      tshirtMethod: enumValue(rules.tshirtMethod, ["unknown", "vinyl", "dtf", "either"] as const, "T-shirt method"),
      poloMethod: enumValue(rules.poloMethod, [null, "vinyl"] as const, "Polo method"),
      turnaroundWorkingDays,
      depositPercent: enumValue(rules.depositPercent, [null, 50, 100] as const, "Deposit"),
      delivery: enumValue(rules.delivery, [null, "customer_paid"] as const, "Delivery payment"),
      deliveryOptions,
      bulkReviewMinimum: rules.bulkReviewMinimum === null ? null : positiveInteger(rules.bulkReviewMinimum, MAX_QUANTITY, "Bulk review minimum"),
      ...policies,
    },
  };
}

export type SellingRulesQuote = {
  offerId: SellingRuleOfferId;
  quantity: number;
  unitPriceMUR: number | null;
  subtotalMUR: number | null;
  depositMUR: number | null;
  balanceMUR: number | null;
  deliveryMUR: number | null;
  subtotalWithDeliveryMUR: number | null;
  isFinal: false;
  missingDecisions: string[];
};

/** A working calculation only: no automatic discount, tax inference, or final quote. */
export function calculateSellingRulesQuote(
  value: SellingRulesConfig,
  offerId: SellingRuleOfferId,
  quantity: number,
  deliveryOptionId?: SellingRuleDeliveryOptionId | null,
): SellingRulesQuote {
  const config = validateSellingRulesConfig(value);
  const offer = SELLING_RULE_OFFERS.find((item) => item.id === offerId);
  if (!offer) throw new Error("Choose one of the five approved offers.");
  positiveInteger(quantity, MAX_QUANTITY, "Quantity");
  const { rules } = config;
  const unitPriceMUR = config.offers[offerId].priceMUR;
  const subtotalCents = unitPriceMUR === null ? null : Math.round(unitPriceMUR * 100) * quantity;
  const subtotalMUR = subtotalCents === null ? null : subtotalCents / 100;
  // Deposit applies to the offer subtotal only. Freight/tax/design treatment is
  // never inferred and remains part of the explicit final-quote review.
  const depositCents = subtotalCents === null || rules.depositPercent === null ? null : Math.round(subtotalCents * rules.depositPercent / 100);
  const missingDecisions: string[] = [];
  if (unitPriceMUR === null) missingDecisions.push("Owner-approved price is missing");
  if (rules.inclusions === null) missingDecisions.push("Confirm what the price includes");
  if (offer.garment === "tshirt" && rules.tshirtMethod === "unknown") missingDecisions.push("Confirm the T-shirt print method");
  if (offer.garment === "polo" && rules.poloMethod === null) missingDecisions.push("Confirm the polo print method");
  for (const size of offer.printSizes) {
    const print = size === "small" ? rules.smallPrint : rules.largePrint;
    if (print.widthCm === null || print.heightCm === null) missingDecisions.push(`Confirm ${size} print dimensions`);
  }
  if (offer.garment === "polo") missingDecisions.push("Confirm polo print dimensions for this order");
  if (rules.turnaroundWorkingDays === null) missingDecisions.push("Confirm turnaround working days");
  if (rules.depositPercent === null) missingDecisions.push("Confirm the deposit rule");
  if (rules.delivery === null) missingDecisions.push("Confirm who pays delivery");
  if (rules.bulkReviewMinimum !== null && quantity >= rules.bulkReviewMinimum) missingDecisions.push("Bulk price needs owner review; standard rate shown");
  for (const [key, label] of [
    ["bulkPolicy", "bulk pricing policy"], ["minimumQuantityPolicy", "minimum quantity policy"],
    ["rushPolicy", "rush policy"], ["vatPolicy", "VAT treatment"],
    ["designChargesPolicy", "design charges"], ["cancellationRefundPolicy", "cancellation and refund terms"],
    ["stockOtherProductsPolicy", "stock and other-product policy"], ["exceptionsPolicy", "exception approval rules"],
  ] as const) {
    if (rules[key] === null) missingDecisions.push(`Confirm ${label}`);
  }
  const selectedDelivery = deliveryOptionId == null ? null : rules.deliveryOptions.find((option) => option.id === deliveryOptionId);
  if (deliveryOptionId != null && !selectedDelivery) throw new Error("Choose an approved delivery option.");
  if (!selectedDelivery) missingDecisions.push("Confirm delivery method and charge");
  missingDecisions.push("Confirm stock, artwork and the requested deadline before a final quote");
  missingDecisions.push("Approve the final total and deposit after delivery, VAT and any design charges");
  const deliveryMUR = selectedDelivery?.priceMUR ?? null;
  return {
    offerId, quantity, unitPriceMUR, subtotalMUR,
    depositMUR: depositCents === null ? null : depositCents / 100,
    balanceMUR: depositCents === null || subtotalCents === null ? null : (subtotalCents - depositCents) / 100,
    deliveryMUR,
    subtotalWithDeliveryMUR: subtotalCents === null || deliveryMUR === null ? null : (subtotalCents + Math.round(deliveryMUR * 100)) / 100,
    isFinal: false,
    missingDecisions,
  };
}
