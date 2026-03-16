import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAssistantTrainingState,
  createEmptyAssistantLead,
  extractLeadUpdates,
  runAssistantTurn,
} from "../src/lib/ai-assistant.ts";

test("extracts core sales lead details from a realistic request", () => {
  const result = runAssistantTurn({
    lead: createEmptyAssistantLead(),
    message:
      "I need 20 black polo shirts with logo on front left chest and a big print at the back",
  });

  assert.equal(result.lead.productType, "polo");
  assert.equal(result.lead.quantity, 20);
  assert.equal(result.lead.color, "black");
  assert.deepEqual(result.lead.printPositions, ["back", "front left chest"]);
  assert.deepEqual(result.lead.printSizes, ["large 22x22"]);
  assert.equal(result.readyToSubmit, false);
  assert.match(result.reply, /Please send the size breakdown/);
});

test("phone capture does not get mistaken for quantity", () => {
  const updates = extractLeadUpdates("My name is Ryan and my phone is +230 59883880");

  assert.equal(updates.clientName, "Ryan");
  assert.equal(updates.phone, "59883880");
  assert.equal(updates.quantity, undefined);
});

test("plural tshirts are recognized as t-shirt products", () => {
  const result = runAssistantTurn({
    lead: createEmptyAssistantLead(),
    message: "hi i need 3 tshirts",
  });

  assert.equal(result.lead.productType, "t-shirt");
  assert.equal(result.lead.quantity, 3);
  assert.match(result.reply, /Where do you want the print/);
});

test("plain name replies are accepted when client name is the next required field", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: null,
      phone: null,
      email: null,
      productType: "t-shirt",
      quantity: 2,
      color: null,
      sizes: ["S"],
      sizeBreakdown: [{ color: "black", productType: "t-shirt", size: "S", quantity: 2 }],
      printPositions: ["back"],
      printSizes: [],
      logoReady: null,
      deliveryMethod: null,
      deadline: null,
      notes: null,
    },
    message: "Sam Legoy",
  });

  assert.equal(result.lead.clientName, "Sam Legoy");
  assert.match(result.reply, /What is your phone number\?/);
});

test("size breakdown template lines are parsed into structured order lines", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: null,
      phone: null,
      email: null,
      productType: "t-shirt",
      quantity: 3,
      color: "black",
      sizes: [],
      sizeBreakdown: [],
      printPositions: ["back"],
      printSizes: [],
      logoReady: null,
      deliveryMethod: null,
      deadline: null,
      notes: null,
    },
    message:
      "Product: T-Shirt Colour: Black Size: S Quantity: 2\nProduct: T-Shirt Colour: Black Size: M Quantity: 1",
  });

  assert.deepEqual(result.lead.sizes, ["M", "S"]);
  assert.equal(result.lead.sizeBreakdown.length, 2);
  assert.equal(result.lead.sizeBreakdown[0].quantity + result.lead.sizeBreakdown[1].quantity, 3);
  assert.match(result.reply, /What is your name\?/);
  assert.match(result.reply, /upload button/i);
});

test("logo upload marks the file as ready and keeps the lead submittable", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: "Ryan",
      phone: "59883880",
      email: null,
      productType: "t-shirt",
      quantity: 3,
      color: "black",
      sizes: ["S", "M"],
      sizeBreakdown: [
        { color: "black", productType: "t-shirt", size: "S", quantity: 2 },
        { color: "black", productType: "t-shirt", size: "M", quantity: 1 },
      ],
      printPositions: ["front left chest"],
      printSizes: ["small 9x9"],
      logoReady: null,
      deliveryMethod: null,
      deadline: null,
      notes: null,
    },
    message: "Uploaded logo file: brand.ai",
    attachment: {
      name: "brand.ai",
      url: "https://example.com/brand.ai",
      contentType: "application/postscript",
      size: 1024,
      uploadedAt: "2026-03-16T10:00:00.000Z",
    },
  });

  assert.equal(result.lead.logoReady, true);
  assert.equal(result.lead.logoAttachment?.name, "brand.ai");
  assert.match(result.reply, /Great\. I have the main details and the logo file\./);
});

test("summary command returns the stored lead snapshot when all key fields are present", () => {
  const result = runAssistantTurn({
    lead: {
      clientName: "Ryan",
      phone: "59883880",
      email: "ryan@example.com",
      productType: "t-shirt",
      quantity: 24,
      color: "navy",
      sizes: ["M", "L", "XL"],
      sizeBreakdown: [
        { color: "navy", productType: "t-shirt", size: "M", quantity: 8 },
        { color: "navy", productType: "t-shirt", size: "L", quantity: 8 },
        { color: "navy", productType: "t-shirt", size: "XL", quantity: 8 },
      ],
      printPositions: ["front left chest"],
      printSizes: ["small 9x9"],
      logoReady: true,
      deliveryMethod: "pickup",
      deadline: "next week",
      notes: "Restaurant staff refresh",
    },
    message: "summary",
  });

  assert.equal(result.readyToSubmit, true);
  assert.match(result.reply, /Lead summary:/);
  assert.match(result.reply, /Name: Ryan/);
  assert.match(result.reply, /Product: t-shirt/);
  assert.match(result.reply, /Print positions: front left chest/);
  assert.match(result.reply, /Size breakdown:/);
});

test("training state learns from approved leads and saved knowledge", () => {
  const training = buildAssistantTrainingState(
    [
      {
        status: "approved",
        lead: {
          clientName: "Ryan",
          phone: "59883880",
          email: null,
          productType: "t-shirt",
          quantity: 12,
          color: "black",
          sizes: ["M", "L"],
          sizeBreakdown: [
            { color: "black", productType: "t-shirt", size: "M", quantity: 6 },
            { color: "black", productType: "t-shirt", size: "L", quantity: 6 },
          ],
          printPositions: ["front left chest", "back"],
          printSizes: ["small 9x9", "large 22x22"],
          logoReady: true,
          deliveryMethod: "delivery",
          deadline: "next week",
          notes: "Uniform order",
        },
        sessionMessages: ["Need 12 crewtees with front left chest logo and back print"],
      },
    ],
    [
      {
        title: "Printing options",
        content:
          "Front left chest logo is usually 9x9 cm. Large back print is usually 22x22 cm.",
      },
    ]
  );

  assert.equal(training.approvedLeadCount, 1);
  assert.equal(training.knowledgeCount, 1);
  assert.ok(training.positiveKeywordCount > 0);
  assert.ok(training.topKeywords.length > 0);
  assert.ok(training.learnedProductAliases["t-shirt"].includes("crewtees"));
  assert.ok(training.learnedProductAliasCount > 0);
});

test("runAssistantTurn uses learned aliases from approved sessions", () => {
  const training = buildAssistantTrainingState(
    [
      {
        status: "approved",
        lead: {
          clientName: "Ryan",
          phone: "59883880",
          email: null,
          productType: "t-shirt",
          quantity: 8,
          color: "black",
          sizes: ["M"],
          sizeBreakdown: [{ color: "black", productType: "t-shirt", size: "M", quantity: 8 }],
          printPositions: ["front left chest"],
          printSizes: ["small 9x9"],
          logoReady: true,
          deliveryMethod: "pickup",
          deadline: null,
          notes: null,
        },
        sessionMessages: ["Hi I need 8 crewtees for staff"],
      },
    ],
    []
  );

  const result = runAssistantTurn({
    lead: createEmptyAssistantLead(),
    message: "I need 3 crewtees",
    trainingState: training,
  });

  assert.equal(result.lead.productType, "t-shirt");
  assert.equal(result.lead.quantity, 3);
});
