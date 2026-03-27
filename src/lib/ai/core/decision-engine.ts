import type {
  AssistantDecision,
  AssistantIntentPrediction,
  AssistantLead,
  AssistantRequiredField,
  AssistantRetrievalMatch,
} from "./types.ts";

const FAQ_THRESHOLD = 0.34;

export function decideNextAction(input: {
  intent: AssistantIntentPrediction;
  lead: AssistantLead;
  missingFields: AssistantRequiredField[];
  retrievalMatches: AssistantRetrievalMatch[];
  hasEntityConflict: boolean;
  explicitSummaryRequest: boolean;
}): AssistantDecision {
  const topFaq = input.retrievalMatches.find((match) => match.kind === "faq") || null;
  const hasActiveOrderCapture = Boolean(
    input.lead.productType ||
      input.lead.quantity ||
      input.lead.sizeBreakdown.length ||
      input.lead.printPositions.length ||
      input.lead.printType ||
      input.lead.clientName ||
      input.lead.email ||
      input.lead.phone ||
      input.lead.logoAttachment ||
      input.lead.logoPending ||
      input.lead.deadline
  );

  if (input.hasEntityConflict) {
    return {
      action: "clarify_ambiguous_field",
      explanation: "Entity extraction found competing values for the same field, so clarification is safer than continuing.",
    };
  }

  if (input.explicitSummaryRequest || input.intent.label === "confirm_order") {
    return {
      action: "generate_summary",
      explanation: "The message looks like a confirmation or summary request, so the assistant should recap the captured order state.",
    };
  }

  if (
    (input.intent.label === "ask_price" ||
      input.intent.label === "ask_delivery" ||
      input.intent.label === "ask_design_help") &&
    !hasActiveOrderCapture &&
    topFaq &&
    topFaq.score >= FAQ_THRESHOLD
  ) {
    return {
      action: "answer_faq",
      faqMatch: topFaq,
      explanation: `A relevant FAQ memory matched the user's ${input.intent.label.replace(/_/g, " ")} intent strongly enough to answer directly.`,
    };
  }

  if (input.missingFields.length) {
    return {
      action: input.retrievalMatches.length && input.intent.label === "new_order" ? "suggest_best_option" : "ask_missing_field",
      targetField: input.missingFields[0],
      suggestion:
        input.retrievalMatches[0]?.kind === "approved_summary" || input.retrievalMatches[0]?.kind === "past_lead"
          ? input.retrievalMatches[0].text
          : null,
      explanation: `The lead is still missing ${input.missingFields[0]}, so the assistant should continue structured capture.`,
    };
  }

  if (!input.missingFields.length) {
    return {
      action: "generate_summary",
      explanation: "All required fields are present, so the assistant should summarize the captured order instead of escalating.",
    };
  }

  if (input.intent.confidence < 0.34 || input.intent.label === "unclear") {
    return {
      action: "escalate_to_human",
      explanation: "Intent confidence is too low and the lead is not obviously progressing, so the assistant should ask the user to restate or defer to a human.",
    };
  }

  return {
    action: "generate_summary",
    explanation: "Enough structured information is available, so the assistant can summarize or confirm the order state.",
  };
}
