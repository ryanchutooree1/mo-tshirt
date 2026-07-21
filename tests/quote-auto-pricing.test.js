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

  assert.equal(result.lines[0].unitPrice, 360);
  assert.match(result.lines[0].description, /Small Front and Large Back Printing/);
  assert.equal(result.subtotal, 4320);
  assert.equal(result.deliveryFee, 150);
  assert.equal(result.total, 4470);
  assert.equal(result.requiresReview, false);
});

test("supports all standard front and back placement combinations", () => {
  const base = { garment: "Poloshirt", size: "2XL" };
  const cases = [
    ["small_front_only", 410],
    ["small_back_only", 410],
    ["large_front_only", 440],
    ["back_only", 440],
    ["small_front_back", 450],
    ["small_front_large_back", 480],
    ["large_front_small_back", 480],
    ["front_back", 500],
  ];

  cases.forEach(([printPlacement, expected]) => {
    assert.equal(
      getAutomaticUnitPrice({ garment: base, printMethod: "DTF", printPlacement }),
      expected
    );
  });
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

  assert.equal(result.lines[0].unitPrice, 290);
  assert.equal(result.subtotal, 6090);
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

  assert.equal(result.lines[0].unitPrice, 320);
  assert.equal(result.total, 640);
  assert.equal(result.requiresReview, false);
});

test("prices a website quotation when the saved print method is missing", () => {
  const result = buildAutomaticQuotePricing({
    garments: [{ garment: "T-Shirt", color: "Black", size: "M", quantity: 2 }],
    printMethod: "",
    designBrief: { artwork: [{ printPlacement: "small_front_only" }] },
  });

  assert.equal(result.lines[0].unitPrice, 290);
  assert.equal(result.total, 580);
  assert.equal(
    result.lines[0].description,
    "T-Shirt (Black / M) — DTF — Small Front Printing only"
  );
});
