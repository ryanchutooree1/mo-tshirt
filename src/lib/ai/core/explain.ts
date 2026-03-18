import type {
  AssistantDecision,
  AssistantEntityExtractionResult,
  AssistantIntentPrediction,
  AssistantRequiredField,
  AssistantRetrievalMatch,
  AssistantTurnDebug,
} from "./types";

export function buildAssistantTurnDebug(input: {
  intent: AssistantIntentPrediction;
  entities: AssistantEntityExtractionResult;
  missingFields: AssistantRequiredField[];
  retrievalMatches: AssistantRetrievalMatch[];
  decision: AssistantDecision;
}) : AssistantTurnDebug {
  return {
    predicted_intent: input.intent.label,
    intent_confidence: Number(input.intent.confidence.toFixed(3)),
    extracted_entities: {
      fields: Object.fromEntries(
        Object.entries(input.entities.fields).map(([field, candidate]) => [
          field,
          candidate
            ? {
                value: candidate.canonicalValue,
                confidence: Number(candidate.confidence.toFixed(3)),
                matchedText: candidate.matchedText,
                strategy: candidate.strategy,
                alias: candidate.alias || null,
              }
            : null,
        ])
      ),
      sizeBreakdown: input.entities.sizeBreakdown,
      conflicts: input.entities.conflicts,
    },
    missing_fields: input.missingFields,
    retrieved_examples: input.retrievalMatches.map((match) => ({
      id: match.id,
      kind: match.kind,
      score: Number(match.score.toFixed(3)),
      explanation: match.explanation,
    })),
    chosen_action: input.decision.action,
    explanation: `${input.intent.explanation} ${input.decision.explanation}`.trim(),
  };
}
