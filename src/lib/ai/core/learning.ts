import type {
  AssistantApprovedLeadSource,
  AssistantFaqEntry,
  AssistantFeedbackEntry,
  AssistantIntentSample,
  AssistantKnowledgeSource,
  AssistantKeywordStat,
  AssistantProductPlaybook,
  AssistantProductType,
  AssistantTrainingSnapshot,
  AssistantTrainingState,
} from "./types.ts";
import { AI_INTENTS, ASSISTANT_PRODUCT_TYPES } from "./types.ts";
import { trainIntentClassifier } from "./classifier.ts";
import { buildRetrievalIndex, buildRetrievalMemoryDocuments, summarizeRetrievalIndex } from "./retrieval.ts";
import { cleanString, hybridTokens, incrementCounter, normalizeText, unique } from "./utils.ts";

const PRODUCT_ROOT_HINTS: Record<AssistantProductType, string[]> = {
  "t-shirt": ["tshirt", "t shirt", "tee", "tees"],
  polo: ["polo", "poloshirt"],
  hoodie: ["hoodie"],
  cap: ["cap", "hat"],
};

export function createEmptyLearnedProductAliases(): Record<AssistantProductType, string[]> {
  return {
    "t-shirt": [],
    polo: [],
    hoodie: [],
    cap: [],
  };
}

export function createEmptyLearnedProductPlaybooks(): Record<AssistantProductType, AssistantProductPlaybook> {
  return {
    "t-shirt": { topColor: null, topDeliveryMethod: null, topPrintPattern: null },
    polo: { topColor: null, topDeliveryMethod: null, topPrintPattern: null },
    hoodie: { topColor: null, topDeliveryMethod: null, topPrintPattern: null },
    cap: { topColor: null, topDeliveryMethod: null, topPrintPattern: null },
  };
}

function inferIntentSample(message: string): AssistantIntentSample | null {
  const normalized = normalizeText(message);
  if (!normalized) return null;
  if (/\b(hello|hi|good morning|good afternoon)\b/.test(normalized)) {
    return { text: message, intent: "greet" };
  }
  if (/\b(how much|price|cost|quotation|quote)\b/.test(normalized)) {
    return { text: message, intent: "ask_price" };
  }
  if (/\b(delivery|deliver|pickup|pick up|collection)\b/.test(normalized)) {
    return { text: message, intent: "ask_delivery" };
  }
  if (/\b(help with design|design help|logo help|mockup|mock up|artwork)\b/.test(normalized)) {
    return { text: message, intent: "ask_design_help" };
  }
  if (/\b(summary|confirm|approved|go ahead|looks good)\b/.test(normalized)) {
    return { text: message, intent: "confirm_order" };
  }
  if (/\b(product:|garment|size:|quantity:|print method|delivery|pickup|email|phone|whatsapp|deadline|my name is|i am|i'm)\b/.test(normalized)) {
    return { text: message, intent: "provide_details" };
  }
  if (/\b(need|want|order|looking for|get me|make)\b/.test(normalized)) {
    return { text: message, intent: "new_order" };
  }
  return null;
}

function buildIntentSamples(
  baseSamples: AssistantIntentSample[],
  approvedLeads: AssistantApprovedLeadSource[],
  feedbackEntries: AssistantFeedbackEntry[]
) {
  const inferred = [
    ...approvedLeads.flatMap((source) => (source.sessionMessages || []).map((message) => inferIntentSample(message)).filter(Boolean) as AssistantIntentSample[]),
    ...feedbackEntries.flatMap((entry) => (entry.userMessages || []).map((message) => inferIntentSample(message)).filter(Boolean) as AssistantIntentSample[]),
  ];

  const uniqueKey = new Set<string>();
  return [...baseSamples, ...inferred].filter((sample) => {
    const key = `${sample.intent}:${normalizeText(sample.text)}`;
    if (uniqueKey.has(key)) return false;
    uniqueKey.add(key);
    return true;
  });
}

function parseFaqFeedback(comment: string | null, index: number): AssistantFaqEntry[] {
  if (!comment) return [];
  const trimmed = cleanString(comment);
  const qaMatch = trimmed.match(/q\s*:\s*(.+?)\s+a\s*:\s*(.+)$/i);
  if (!qaMatch) return [];
  return [
    {
      id: `feedback-faq-${index}`,
      question: qaMatch[1].trim(),
      answer: qaMatch[2].trim(),
    },
  ];
}

function deriveAliasMap(
  baseAliases: Record<AssistantProductType, string[]>,
  approvedLeads: AssistantApprovedLeadSource[],
  feedbackEntries: AssistantFeedbackEntry[]
) {
  const aliases = createEmptyLearnedProductAliases();

  ASSISTANT_PRODUCT_TYPES.forEach((productType) => {
    aliases[productType] = unique([...(baseAliases[productType] || [])]);
  });

  approvedLeads.forEach((source) => {
    const productType = source.lead.productType;
    if (!productType) return;
    const messages = source.sessionMessages || [];
    messages.forEach((message) => {
      const normalized = normalizeText(message);
      PRODUCT_ROOT_HINTS[productType].forEach((hint) => {
        if (normalized.includes(hint)) aliases[productType].push(hint);
      });
      normalized.split(/\s+/).forEach((token) => {
        if (!token) return;
        if (productType === "t-shirt" && /(tee|tees|shirt|shirts)$/.test(token)) aliases[productType].push(token);
        if (productType === "polo" && /polo/.test(token)) aliases[productType].push(token);
        if (productType === "hoodie" && /hoodie/.test(token)) aliases[productType].push(token);
        if (productType === "cap" && /(cap|hat)s?$/.test(token)) aliases[productType].push(token);
      });
    });
  });

  feedbackEntries.forEach((entry) => {
    const match = cleanString(entry.comment).match(/alias\s*:\s*(.+?)\s*=>\s*(t-shirt|polo|hoodie|cap)/i);
    if (!match) return;
    aliases[match[2].toLowerCase() as AssistantProductType].push(normalizeText(match[1]));
  });

  ASSISTANT_PRODUCT_TYPES.forEach((productType) => {
    aliases[productType] = unique(aliases[productType].filter(Boolean)).sort((left, right) => left.localeCompare(right));
  });

  return aliases;
}

function deriveFaqMemory(
  baseFaq: AssistantFaqEntry[],
  knowledgeItems: AssistantKnowledgeSource[],
  feedbackEntries: AssistantFeedbackEntry[]
) {
  const learned = [
    ...baseFaq,
    ...knowledgeItems.map((item, index) => ({
      id: item.id || `knowledge-faq-${index}`,
      question: item.title,
      answer: item.content,
    })),
    ...feedbackEntries.flatMap((entry, index) => parseFaqFeedback(entry.comment, index)),
  ];

  const seen = new Set<string>();
  return learned.filter((item) => {
    const key = `${normalizeText(item.question)}:${normalizeText(item.answer)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildProductPlaybooks(approvedLeads: AssistantApprovedLeadSource[]) {
  const playbooks = createEmptyLearnedProductPlaybooks();
  const colorCounts = Object.fromEntries(ASSISTANT_PRODUCT_TYPES.map((product) => [product, {} as Record<string, number>])) as Record<AssistantProductType, Record<string, number>>;
  const deliveryCounts = Object.fromEntries(ASSISTANT_PRODUCT_TYPES.map((product) => [product, {} as Record<string, number>])) as Record<AssistantProductType, Record<string, number>>;
  const printPatternCounts = Object.fromEntries(ASSISTANT_PRODUCT_TYPES.map((product) => [product, {} as Record<string, { positions: string[]; printSizes: string[]; count: number }>])) as Record<AssistantProductType, Record<string, { positions: string[]; printSizes: string[]; count: number }>>;

  approvedLeads.forEach((source) => {
    const lead = source.lead;
    if (!lead.productType || source.status !== "approved") return;
    if (lead.color) incrementCounter(colorCounts[lead.productType], lead.color);
    if (lead.deliveryMethod) incrementCounter(deliveryCounts[lead.productType], lead.deliveryMethod);
    if (lead.printPositions.length) {
      const key = `${lead.printPositions.join("|")}::${lead.printSizes.join("|")}`;
      const bucket = printPatternCounts[lead.productType];
      if (!bucket[key]) {
        bucket[key] = {
          positions: unique(lead.printPositions).sort((left, right) => left.localeCompare(right)),
          printSizes: unique(lead.printSizes).sort((left, right) => left.localeCompare(right)),
          count: 0,
        };
      }
      bucket[key].count += 1;
    }
  });

  ASSISTANT_PRODUCT_TYPES.forEach((productType) => {
    const topColor = Object.entries(colorCounts[productType]).sort((left, right) => right[1] - left[1])[0]?.[0] || null;
    const topDeliveryMethod = Object.entries(deliveryCounts[productType]).sort((left, right) => right[1] - left[1])[0]?.[0] || null;
    const topPrintPattern =
      Object.values(printPatternCounts[productType]).sort((left, right) => right.count - left.count)[0] || null;

    playbooks[productType] = {
      topColor,
      topDeliveryMethod: topDeliveryMethod === "pickup" || topDeliveryMethod === "delivery" ? topDeliveryMethod : null,
      topPrintPattern,
    };
  });

  return playbooks;
}

function collectTopKeywords(samples: AssistantIntentSample[]): AssistantKeywordStat[] {
  const counter: Record<string, number> = {};
  samples.forEach((sample) => {
    hybridTokens(sample.text)
      .filter((token) => token.length > 2)
      .forEach((token) => incrementCounter(counter, token));
  });
  return Object.entries(counter)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 20)
    .map(([keyword, count]) => ({ keyword, count }));
}

function buildFieldGroups(samples: AssistantIntentSample[]) {
  return AI_INTENTS.map((intent) => ({
    field: intent,
    examples: samples
      .filter((sample) => sample.intent === intent)
      .slice(0, 3)
      .map((sample) => sample.text),
  })).filter((group) => group.examples.length);
}

export function buildAssistantTrainingState(input: {
  baseSamples: AssistantIntentSample[];
  baseFaq: AssistantFaqEntry[];
  baseAliases: Record<AssistantProductType, string[]>;
  approvedLeads?: AssistantApprovedLeadSource[];
  knowledgeItems?: AssistantKnowledgeSource[];
  feedbackEntries?: AssistantFeedbackEntry[];
  updatedAt?: string | null;
}): AssistantTrainingState {
  const approvedLeads = input.approvedLeads || [];
  const knowledgeItems = input.knowledgeItems || [];
  const feedbackEntries = input.feedbackEntries || [];
  const aliasMap = deriveAliasMap(input.baseAliases, approvedLeads, feedbackEntries);
  const faqMemory = deriveFaqMemory(input.baseFaq, knowledgeItems, feedbackEntries);
  const trainingSamples = buildIntentSamples(input.baseSamples, approvedLeads, feedbackEntries);
  const intentModel = trainIntentClassifier(trainingSamples);
  const retrievalDocuments = buildRetrievalMemoryDocuments({
    leads: approvedLeads,
    knowledge: knowledgeItems,
    feedback: feedbackEntries,
    faq: faqMemory,
    aliases: aliasMap,
  });
  const retrievalIndex = buildRetrievalIndex(retrievalDocuments);
  const retrievalIndexMetadata = summarizeRetrievalIndex(retrievalDocuments);
  const topKeywords = collectTopKeywords(trainingSamples);
  const learnedProductPlaybooks = buildProductPlaybooks(approvedLeads);
  const learnedProductAliasCount = ASSISTANT_PRODUCT_TYPES.reduce(
    (total, productType) => total + aliasMap[productType].length,
    0
  );

  const snapshot: AssistantTrainingSnapshot = {
    positiveKeywordCount: intentModel.vocabulary.length,
    fieldGroups: buildFieldGroups(trainingSamples),
    approvedLeadCount: approvedLeads.length,
    knowledgeCount: knowledgeItems.length,
    feedbackCount: feedbackEntries.length,
    faqCount: faqMemory.length,
    classifierSampleCount: trainingSamples.length,
    classifierLabelCount: unique(trainingSamples.map((sample) => sample.intent)).length,
    retrievalDocumentCount: retrievalDocuments.length,
    topKeywords,
    learnedProductAliases: aliasMap,
    learnedProductAliasCount,
    learnedProductPlaybooks,
    retrievalIndexMetadata,
    updatedAt: input.updatedAt || null,
  };

  return {
    ...snapshot,
    intentModel,
    retrievalIndex,
    retrievalDocuments,
    trainingSamples,
    faqMemory,
    aliasMap,
    feedbackEntries,
  };
}
