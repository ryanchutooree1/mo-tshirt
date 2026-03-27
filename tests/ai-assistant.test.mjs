import test from "node:test";
import assert from "node:assert/strict";
import entityEval from "../src/data/ai/entity-eval.json" with { type: "json" };
import intentEval from "../src/data/ai/intent-eval.json" with { type: "json" };
import retrievalEval from "../src/data/ai/retrieval-eval.json" with { type: "json" };
import {
  buildAssistantTrainingState,
  createEmptyAssistantLead,
  extractLeadUpdates,
  runAssistantTurn,
} from "../src/lib/ai-assistant.ts";
import { predictIntent } from "../src/lib/ai/core/classifier.ts";
import { retrieveTopMatches } from "../src/lib/ai/core/retrieval.ts";

test("intent classification reaches acceptable local accuracy on the eval set", () => {
  const training = buildAssistantTrainingState([], [], [], "2026-03-18T00:00:00.000Z");
  const results = intentEval.map((sample) => predictIntent(training.intentModel, sample.text));
  const correct = results.filter((prediction, index) => prediction.label === intentEval[index].intent).length;
  const accuracy = correct / intentEval.length;

  assert.ok(accuracy >= 0.75, `expected >= 0.75 accuracy, got ${accuracy.toFixed(3)}`);
});

test("entity extraction captures structured sales fields with confidence-friendly heuristics", () => {
  const accuracyChecks = [];

  for (const sample of entityEval) {
    const updates = extractLeadUpdates(sample.message);
    for (const [field, expected] of Object.entries(sample.expected)) {
      accuracyChecks.push(JSON.stringify(updates[field]) === JSON.stringify(expected));
    }
  }

  const accuracy = accuracyChecks.filter(Boolean).length / accuracyChecks.length;
  assert.ok(accuracy >= 0.75, `expected >= 0.75 entity accuracy, got ${accuracy.toFixed(3)}`);
});

test("deadline extraction accepts text and slash date formats", () => {
  const samples = ["02 May 2026", "02 May", "02/05/2026", "02/05/26", "02 May 26"];

  samples.forEach((sample) => {
    const updates = extractLeadUpdates(sample);
    assert.equal(updates.deadline, sample);
  });
});

test("retrieval returns relevant local memory items with explanations", () => {
  const training = buildAssistantTrainingState([], [], [], "2026-03-18T00:00:00.000Z");

  retrievalEval.forEach((sample) => {
    const matches = retrieveTopMatches({
      query: sample.query,
      documents: training.retrievalDocuments,
      index: training.retrievalIndex,
      topK: 1,
      threshold: 0.05,
    });

    assert.equal(matches[0]?.kind, sample.expectedKind);
    assert.ok(matches[0]?.explanation);
  });
});

test("local learning adds aliases and retrieval memory from approved leads", () => {
  const training = buildAssistantTrainingState(
    [
      {
        status: "approved",
        lead: {
          ...createEmptyAssistantLead(),
          clientName: "Ryan",
          productType: "t-shirt",
          quantity: 8,
          color: "black",
          sizes: ["M"],
          sizeBreakdown: [{ color: "black", productType: "t-shirt", size: "M", quantity: 8 }],
          printPositions: ["front left chest"],
          printSizes: ["small 9x9"],
          logoReady: true,
          deliveryMethod: "pickup",
        },
        sessionMessages: ["Hi I need 8 crewtees for staff"],
        acceptedReplies: ["Please send the full size breakdown in one message."],
      },
    ],
    [],
    [],
    "2026-03-18T00:00:00.000Z"
  );

  assert.ok(training.learnedProductAliases["t-shirt"].includes("crewtees"));
  assert.ok(training.retrievalDocuments.some((document) => document.kind === "assistant_reply"));
});

test("approved-order retrieval stays out of customer-facing replies", () => {
  const training = buildAssistantTrainingState(
    [
      {
        status: "approved",
        lead: {
          ...createEmptyAssistantLead(),
          clientName: "Paul Sam",
          productType: "t-shirt",
          quantity: 3,
          color: "black",
          sizes: ["L"],
          sizeBreakdown: [{ color: "black", productType: "t-shirt", size: "L", quantity: 3 }],
          printPositions: ["back"],
          printSizes: ["large 22x22"],
          deadline: "08/05/2026",
        },
      },
    ],
    [],
    [],
    "2026-03-18T00:00:00.000Z"
  );

  const result = runAssistantTurn({
    lead: createEmptyAssistantLead(),
    message: "Hi i need 3 tshirts",
    trainingState: training,
  });

  assert.match(result.reply, /Please send the full garment breakdown/i);
  assert.doesNotMatch(result.reply, /A similar approved order used this setup/i);
  assert.doesNotMatch(result.reply, /Most approved/i);
  assert.ok(result.suggestions.some((item) => /Most approved/i.test(item)));
});

test("end-to-end assistant behavior stays structured and explainable without an LLM", () => {
  const training = buildAssistantTrainingState([], [], [], "2026-03-18T00:00:00.000Z");

  const firstTurn = runAssistantTurn({
    lead: createEmptyAssistantLead(),
    message: "Hi I need 3 tshirts",
    trainingState: training,
  });

  assert.equal(firstTurn.lead.productType, "t-shirt");
  assert.equal(firstTurn.lead.quantity, 3);
  assert.match(firstTurn.reply, /Please send the full garment breakdown/i);
  assert.equal(firstTurn.debug.predicted_intent, "new_order");
  assert.ok(firstTurn.debug.intent_confidence > 0);

  const secondTurn = runAssistantTurn({
    lead: firstTurn.lead,
    message: "Product: T-Shirt Colour: Black Size: M Quantity: 3",
    trainingState: training,
  });

  assert.equal(secondTurn.lead.quantity, 3);
  assert.match(secondTurn.reply, /use the upload button here to attach it now/i);

  const uploadTurn = runAssistantTurn({
    lead: secondTurn.lead,
    message: "Uploaded logo file: logo.png",
    attachment: {
      name: "logo.png",
      url: "/local/logo.png",
      contentType: "image/png",
      size: 1234,
      uploadedAt: "2026-03-18T00:00:00.000Z",
    },
    trainingState: training,
  });

  assert.match(uploadTurn.reply, /Logo received and attached to your request\. What print method do you want/i);
  assert.equal(uploadTurn.lead.logoAttachment?.name, "logo.png");

  const thirdTurn = runAssistantTurn({
    lead: uploadTurn.lead,
    message: "Not sure",
    trainingState: training,
  });

  assert.equal(thirdTurn.lead.printType, "not sure");
  assert.match(thirdTurn.reply, /How would you like to receive the order/i);

  const deliveryTurn = runAssistantTurn({
    lead: thirdTurn.lead,
    message: "Surinam pickup",
    trainingState: training,
  });

  assert.equal(deliveryTurn.lead.deliveryMethod, "pickup");
  assert.match(deliveryTurn.reply, /What is your name/i);

  const nameTurn = runAssistantTurn({
    lead: deliveryTurn.lead,
    message: "Paul Sam",
    trainingState: training,
  });
  const emailTurn = runAssistantTurn({
    lead: nameTurn.lead,
    message: "hello@gmail.com",
    trainingState: training,
  });
  const phoneTurn = runAssistantTurn({
    lead: emailTurn.lead,
    message: "59393939",
    trainingState: training,
  });

  assert.equal(phoneTurn.readyToSubmit, true);
  assert.equal(phoneTurn.lead.clientName, "Paul Sam");
  assert.equal(phoneTurn.lead.email, "hello@gmail.com");
  assert.equal(phoneTurn.lead.phone, "59393939");
  assert.equal(phoneTurn.lead.deliveryMethod, "pickup");
  assert.equal(phoneTurn.debug.chosen_action, "generate_summary");
  assert.ok(Array.isArray(phoneTurn.debug.retrieved_examples));
});

test("combo print layouts continue to size breakdown instead of conflict clarification", () => {
  const training = buildAssistantTrainingState([], [], [], "2026-03-18T00:00:00.000Z");

  const firstTurn = runAssistantTurn({
    lead: createEmptyAssistantLead(),
    message: "Hi I need 3 tshirts",
    trainingState: training,
  });

  const secondTurn = runAssistantTurn({
    lead: firstTurn.lead,
    message: "Small Front and Large Back",
    trainingState: training,
  });

  assert.deepEqual(secondTurn.lead.printPositions, ["back", "front center"]);
  assert.deepEqual(secondTurn.lead.printSizes, ["large 22x22", "small 9x9"]);
  assert.match(secondTurn.reply, /Please send the full garment breakdown/i);
  assert.doesNotMatch(secondTurn.reply, /conflicting print position details/i);
});

test("assistant answers delivery questions from local FAQ memory", () => {
  const training = buildAssistantTrainingState([], [], [], "2026-03-18T00:00:00.000Z");

  const result = runAssistantTurn({
    lead: createEmptyAssistantLead(),
    message: "Do you offer delivery or pickup?",
    trainingState: training,
  });

  assert.equal(result.debug.predicted_intent, "ask_delivery");
  assert.equal(result.debug.chosen_action, "answer_faq");
  assert.match(result.reply, /pickup or delivery/i);
});
