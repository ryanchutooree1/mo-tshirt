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
  assert.match(result.reply, /What is your name\?/);
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
