import { AI_INTENTS, type AssistantIntent, type AssistantIntentClassifierModel, type AssistantIntentPrediction, type AssistantIntentSample } from "./types.ts";
import { clamp, cosineSimilarity, hybridTokens, incrementCounter, softmax, tfidfVector, unique } from "./utils.ts";

function createEmptyIntentCountMap() {
  return Object.fromEntries(AI_INTENTS.map((intent) => [intent, 0])) as Record<AssistantIntent, number>;
}

function createEmptyTokenMap() {
  return Object.fromEntries(AI_INTENTS.map((intent) => [intent, {}])) as Record<AssistantIntent, Record<string, number>>;
}

function createEmptyVectorMap() {
  return Object.fromEntries(AI_INTENTS.map((intent) => [intent, {}])) as Record<AssistantIntent, Record<string, number>>;
}

export function trainIntentClassifier(samples: AssistantIntentSample[]): AssistantIntentClassifierModel {
  const priorsCount = createEmptyIntentCountMap();
  const tokenCounts = createEmptyTokenMap();
  const tokenTotals = createEmptyIntentCountMap();
  const docFrequency: Record<string, number> = {};
  const centroidAccumulators = createEmptyVectorMap();
  const centroidCounts = createEmptyIntentCountMap();

  samples.forEach((sample) => {
    const tokens = hybridTokens(sample.text);
    const uniqueTokens = unique(tokens);
    priorsCount[sample.intent] += 1;

    tokens.forEach((token) => {
      incrementCounter(tokenCounts[sample.intent], token);
      tokenTotals[sample.intent] += 1;
    });

    uniqueTokens.forEach((token) => incrementCounter(docFrequency, token));
  });

  const vocabulary = stableVocabulary(Object.keys(docFrequency));
  const sampleCount = samples.length || 1;
  const idf = Object.fromEntries(
    vocabulary.map((token) => [token, Math.log((sampleCount + 1) / ((docFrequency[token] || 0) + 1)) + 1])
  );

  samples.forEach((sample) => {
    const vector = tfidfVector(hybridTokens(sample.text), idf);
    const accumulator = centroidAccumulators[sample.intent];
    Object.entries(vector).forEach(([token, value]) => {
      accumulator[token] = (accumulator[token] || 0) + value;
    });
    centroidCounts[sample.intent] += 1;
  });

  const centroids = Object.fromEntries(
    AI_INTENTS.map((intent) => {
      const count = centroidCounts[intent] || 1;
      const accumulator = centroidAccumulators[intent];
      const centroid = Object.fromEntries(
        Object.entries(accumulator).map(([token, value]) => [token, value / count])
      );
      return [intent, centroid];
    })
  ) as Record<AssistantIntent, Record<string, number>>;

  const priors = Object.fromEntries(
    AI_INTENTS.map((intent) => [intent, (priorsCount[intent] || 0) / sampleCount])
  ) as Record<AssistantIntent, number>;

  return {
    labels: [...AI_INTENTS],
    vocabulary,
    priors,
    tokenTotals,
    tokenCounts,
    idf,
    centroids,
    sampleCount: samples.length,
  };
}

function stableVocabulary(tokens: string[]) {
  return [...tokens].sort((left, right) => left.localeCompare(right));
}

function normalizeIntentScoreMap(map: Record<AssistantIntent, number>) {
  return Object.fromEntries(
    AI_INTENTS.map((intent) => [intent, clamp(map[intent] || 0)])
  ) as Record<AssistantIntent, number>;
}

function predictWithNaiveBayes(model: AssistantIntentClassifierModel, message: string) {
  const tokens = hybridTokens(message);
  const vocabularySize = model.vocabulary.length || 1;
  const logits = Object.fromEntries(
    AI_INTENTS.map((intent) => {
      let logProb = Math.log(model.priors[intent] || 1e-9);
      const tokenCountMap = model.tokenCounts[intent] || {};
      const total = model.tokenTotals[intent] || 0;
      tokens.forEach((token) => {
        const count = tokenCountMap[token] || 0;
        logProb += Math.log((count + 1) / (total + vocabularySize));
      });
      return [intent, logProb];
    })
  ) as Record<AssistantIntent, number>;

  return softmax(logits) as Record<AssistantIntent, number>;
}

function predictWithTfidfFallback(model: AssistantIntentClassifierModel, message: string) {
  const vector = tfidfVector(hybridTokens(message), model.idf);
  const raw = Object.fromEntries(
    AI_INTENTS.map((intent) => [intent, cosineSimilarity(vector, model.centroids[intent] || {})])
  ) as Record<AssistantIntent, number>;

  const shifted = Object.fromEntries(
    AI_INTENTS.map((intent) => [intent, Math.max(0, raw[intent])])
  ) as Record<AssistantIntent, number>;

  const total = Object.values(shifted).reduce((sumValue, value) => sumValue + value, 0);
  if (!total) return shifted;
  return Object.fromEntries(AI_INTENTS.map((intent) => [intent, shifted[intent] / total])) as Record<AssistantIntent, number>;
}

function pickTopIntent(scores: Record<AssistantIntent, number>) {
  const ranked = AI_INTENTS.map((intent) => ({ intent, score: scores[intent] || 0 })).sort(
    (left, right) => right.score - left.score || left.intent.localeCompare(right.intent)
  );
  return {
    top: ranked[0],
    second: ranked[1],
    ranked,
  };
}

export function predictIntent(model: AssistantIntentClassifierModel, message: string): AssistantIntentPrediction {
  const nbScores = predictWithNaiveBayes(model, message);
  const tfidfScores = predictWithTfidfFallback(model, message);

  const ensembleScores = normalizeIntentScoreMap(
    Object.fromEntries(
      AI_INTENTS.map((intent) => [intent, (nbScores[intent] || 0) * 0.72 + (tfidfScores[intent] || 0) * 0.28])
    ) as Record<AssistantIntent, number>
  );

  const nbTop = pickTopIntent(nbScores);
  const ensembleTop = pickTopIntent(ensembleScores);
  const useFallback =
    (nbTop.top.score < 0.46 && (tfidfScores[ensembleTop.top.intent] || 0) > nbTop.top.score) ||
    ensembleTop.top.score < 0.3;

  const chosenScores = useFallback ? normalizeIntentScoreMap(tfidfScores) : ensembleScores;
  const chosen = pickTopIntent(chosenScores);
  const margin = Math.max(0, chosen.top.score - (chosen.second?.score || 0));
  const confidence = clamp(chosen.top.score * 0.7 + margin * 0.6);
  const method = useFallback ? "tfidf_fallback" : "ensemble";

  return {
    label: chosen.top.intent,
    confidence,
    scores: chosenScores,
    method,
    explanation: useFallback
      ? `Low naive Bayes confidence, so TF-IDF similarity was used to choose ${chosen.top.intent}.`
      : `Combined naive Bayes and TF-IDF scores favored ${chosen.top.intent} with margin ${margin.toFixed(2)}.`,
  };
}
