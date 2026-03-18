import entityEval from "../src/data/ai/entity-eval.json" with { type: "json" };
import intentEval from "../src/data/ai/intent-eval.json" with { type: "json" };
import retrievalEval from "../src/data/ai/retrieval-eval.json" with { type: "json" };
import { buildAssistantTrainingState, extractLeadUpdates } from "../src/lib/ai-assistant.ts";
import { retrieveTopMatches } from "../src/lib/ai/core/retrieval.ts";
import { predictIntent } from "../src/lib/ai/core/classifier.ts";

const training = buildAssistantTrainingState([], [], [], new Date().toISOString());

const intentResults = intentEval.map((sample) => {
  const prediction = predictIntent(training.intentModel, sample.text);
  return {
    expected: sample.intent,
    predicted: prediction.label,
    correct: prediction.label === sample.intent,
  };
});

const intentAccuracy =
  intentResults.filter((result) => result.correct).length / Math.max(intentResults.length, 1);

const entityChecks = [];
for (const sample of entityEval) {
  const updates = extractLeadUpdates(sample.message, training);
  for (const [field, expected] of Object.entries(sample.expected)) {
    const actual = updates[field];
    const correct = JSON.stringify(actual) === JSON.stringify(expected);
    entityChecks.push({ field, correct, expected, actual });
  }
}
const entityAccuracy =
  entityChecks.filter((result) => result.correct).length / Math.max(entityChecks.length, 1);

const retrievalResults = retrievalEval.map((sample) => {
  const matches = retrieveTopMatches({
    query: sample.query,
    documents: training.retrievalDocuments,
    index: training.retrievalIndex,
    topK: 1,
    threshold: 0.05,
  });
  return {
    expectedKind: sample.expectedKind,
    actualKind: matches[0]?.kind || null,
    correct: matches[0]?.kind === sample.expectedKind,
  };
});
const retrievalAccuracy =
  retrievalResults.filter((result) => result.correct).length / Math.max(retrievalResults.length, 1);

const summary = {
  ok: intentAccuracy >= 0.75 && entityAccuracy >= 0.75 && retrievalAccuracy >= 0.66,
  intentAccuracy: Number(intentAccuracy.toFixed(3)),
  entityAccuracy: Number(entityAccuracy.toFixed(3)),
  retrievalAccuracy: Number(retrievalAccuracy.toFixed(3)),
  intentResults,
  retrievalResults,
};

console.log(JSON.stringify(summary, null, 2));

if (!summary.ok) {
  process.exitCode = 1;
}
