const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAutomaticQuotePricing,
  getAssistantPrintPlacement,
  getAutomaticDeliveryFee,
  getAutomaticUnitPrice,
} = require("../src/lib/quote-auto-pricing");

test("prices a website DTF placement and includes it in the quotation line", () => {
  const result = buildAutomaticQuotePricing({
    garments: [
      { garment: "T-Shirt", color: "Black", size: "M", quantity: "12" },
    ],
    printMethod: "1. DTF Printing (Price $$$)",
    designBrief: {
      artwork: [
        {
          product: "T-Shirt",
          color: "Black",
          size: "M",
          printPlacement: "small_front_large_back",
        },
      ],
    },
    delivery: "Post Office Express Delivery (Rs 150)",
  });

  assert.equal(result.lines[0].unitPrice, 565);
  assert.match(result.lines[0].description, /Small Front and Large Back Printing/);
  assert.equal(result.subtotal, 6780);
  assert.equal(result.deliveryFee, 150);
  assert.equal(result.total, 6930);
  assert.equal(result.requiresReview, false);
});

test("supports all standard front and back placement combinations", () => {
  const base = { garment: "Poloshirt", size: "2XL" };
  const cases = [
    ["small_front_only", 700],
    ["small_back_only", 700],
    ["large_front_only", 775],
    ["back_only", 775],
    ["small_front_back", 825],
    ["small_front_large_back", 875],
    ["large_front_small_back", 875],
    ["front_back", 925],
  ];

  cases.forEach(([printPlacement, expected]) => {
    assert.equal(
      getAutomaticUnitPrice({ garment: base, printMethod: "DTF", printPlacement }),
      expected
    );
  });
});

test("applies competitive quantity discounts without using bulk pricing for short runs", () => {
  const garment = { garment: "T-Shirt", size: "M" };
  const priceFor = (quantity) =>
    getAutomaticUnitPrice({
      garment: { ...garment, quantity },
      printMethod: "DTF",
      printPlacement: "small_front_only",
    });

  assert.equal(priceFor(2), 450);
  assert.equal(priceFor(8), 430);
  assert.equal(priceFor(20), 405);
  assert.equal(priceFor(40), 385);
  assert.equal(priceFor(60), 360);
});

test("leaves unsupported products and placements for manual review", () => {
  const result = buildAutomaticQuotePricing({
    garments: [{ garment: "Hoodie", size: "L", quantity: 2 }],
    printMethod: "DTF",
    designBrief: { artwork: [{ printPlacement: "sleeve_only" }] },
    delivery: "Delivery (Need to arrange first)",
  });

  assert.equal(result.lines[0].unitPrice, 0);
  assert.equal(result.requiresReview, true);
  assert.equal(result.deliveryFee, 0);
});

test("backfills an older request with no saved size from its known placement", () => {
  const result = buildAutomaticQuotePricing({
    garments: [{ garment: "T-Shirt", quantity: 21 }],
    printMethod: "DTF Printing",
    fallbackPrintPlacement: "small_front_only",
  });

  assert.equal(result.lines[0].unitPrice, 405);
  assert.equal(result.subtotal, 8505);
  assert.equal(result.requiresReview, false);
});

test("uses the configured delivery fees", () => {
  assert.equal(getAutomaticDeliveryFee("Surinam Pickup (Free)"), 0);
  assert.equal(getAutomaticDeliveryFee("Post Office Postage Delivery (Rs 100)"), 100);
  assert.equal(getAutomaticDeliveryFee("Post Office Express Delivery (Rs 150)"), 150);
});

test("maps MO AI print selections to quotation placement codes", () => {
  assert.equal(
    getAssistantPrintPlacement({ positions: ["front left chest"], sizes: ["small 9x9"] }),
    "small_front_only"
  );
  assert.equal(
    getAssistantPrintPlacement({
      positions: ["front center", "back"],
      sizes: ["small 9x9", "large 22x22"],
    }),
    "small_front_large_back"
  );
});

test("prices an older MO AI order using reviewed defaults", () => {
  const result = buildAutomaticQuotePricing({
    garments: [{ garment: "T-Shirt", color: "Black", size: "L", quantity: 2 }],
    printMethod: "Not sure",
    fallbackPrintMethod: "DTF",
    fallbackPrintPlacement: "large_front_only",
  });

  assert.equal(result.lines[0].unitPrice, 525);
  assert.equal(result.total, 1050);
  assert.equal(result.requiresReview, false);
});

test("prices a website quotation when the saved print method is missing", () => {
  const result = buildAutomaticQuotePricing({
    garments: [{ garment: "T-Shirt", color: "Black", size: "M", quantity: 2 }],
    printMethod: "",
    designBrief: { artwork: [{ printPlacement: "small_front_only" }] },
  });

  assert.equal(result.lines[0].unitPrice, 450);
  assert.equal(result.total, 900);
  assert.equal(
    result.lines[0].description,
    "T-Shirt (Black / M) — DTF — Small Front Printing only"
  );
});
