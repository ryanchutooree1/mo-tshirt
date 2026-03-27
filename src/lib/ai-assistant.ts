import faqMemoryData from "../data/ai/faq-memory.json" with { type: "json" };
import intentTrainingData from "../data/ai/intent-training.json" with { type: "json" };
import productAliasesData from "../data/ai/product-aliases.json" with { type: "json" };
import { predictIntent } from "./ai/core/classifier.ts";
import { decideNextAction } from "./ai/core/decision-engine.ts";
import { extractEntities } from "./ai/core/entities.ts";
import { buildAssistantTurnDebug } from "./ai/core/explain.ts";
import {
  buildAssistantTrainingState as buildLocalTrainingState,
  createEmptyLearnedProductAliases,
  createEmptyLearnedProductPlaybooks,
} from "./ai/core/learning.ts";
import { retrieveTopMatches } from "./ai/core/retrieval.ts";
import {
  formatAssistantFieldLabel,
  formatLeadSummary,
  generateAssistantReply,
} from "./ai/core/response-generator.ts";
import type {
  AssistantApprovedLeadSource,
  AssistantAttachment,
  AssistantChatResult,
  AssistantContextItem,
  AssistantFeedbackEntry,
  AssistantIntentSample,
  AssistantKnowledgeSource,
  AssistantLead,
  AssistantOrderLine,
  AssistantProductType,
  AssistantRequiredField,
  AssistantTrainingState,
} from "./ai/core/types.ts";
import { ASSISTANT_PRODUCT_TYPES, ASSISTANT_REQUIRED_FIELDS } from "./ai/core/types.ts";
import { cosineSimilarity, normalizeText, termFrequency, titleCase, unique } from "./ai/core/utils.ts";

type LeadLike = Partial<Record<keyof AssistantLead, unknown>>;

const BASE_SAMPLES = intentTrainingData as AssistantIntentSample[];
const BASE_FAQ = faqMemoryData as Array<{ id: string; question: string; answer: string; tags?: string[] }>;
const BASE_ALIASES = productAliasesData as Record<AssistantProductType, string[]>;

const PHONE_RE = /(?:\+?230)?[\s-]?([2455789]\d{7})\b/;
const PRINT_SIZE_PATTERNS: Array<{ canonical: string; patterns: string[] }> = [
  { canonical: "small 9x9", patterns: ["9x9", "small logo", "small print", "small front", "small back"] },
  { canonical: "large 22x22", patterns: ["22x22", "large print", "big print", "big logo", "large front", "large back"] },
];

let cachedBaseTrainingState: AssistantTrainingState | null = null;

function getBaseTrainingState() {
  if (!cachedBaseTrainingState) {
    cachedBaseTrainingState = buildLocalTrainingState({
      baseSamples: BASE_SAMPLES,
      baseFaq: BASE_FAQ,
      baseAliases: BASE_ALIASES,
      updatedAt: null,
    });
  }
  return cachedBaseTrainingState;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(value: unknown) {
  const match = PHONE_RE.exec(cleanString(value));
  return match ? match[1] : null;
}

function normalizeQuantity(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }
  return null;
}

function normalizeArray(values: unknown, map: (value: string) => string | null) {
  if (!Array.isArray(values)) return [];
  return unique(
    values
      .map((value) => map(cleanString(value)))
      .filter(Boolean) as string[]
  ).sort((left, right) => left.localeCompare(right));
}

function normalizeSize(value: string) {
  const normalized = normalizeText(value);
  if (normalized === "xs") return "XS";
  if (normalized === "s") return "S";
  if (normalized === "m") return "M";
  if (normalized === "l") return "L";
  if (normalized === "xl") return "XL";
  if (normalized === "xxl" || normalized === "2xl") return "2XL";
  if (normalized === "xxxl" || normalized === "3xl") return "3XL";
  if (normalized === "xxxxl" || normalized === "4xl") return "4XL";
  return value ? value.toUpperCase() : null;
}

function normalizeOrderLines(value: unknown): AssistantOrderLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const source = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const productType = cleanString(source.productType).toLowerCase();
      return {
        color: cleanString(source.color).toLowerCase() || null,
        productType:
          productType === "t-shirt" || productType === "polo" || productType === "hoodie" || productType === "cap"
            ? (productType as AssistantProductType)
            : null,
        size: normalizeSize(cleanString(source.size)) || cleanString(source.size),
        quantity: normalizeQuantity(source.quantity) || 0,
      };
    })
    .filter((line) => line.size && line.quantity > 0)
    .sort((left, right) => left.size.localeCompare(right.size));
}

export function normalizeAssistantAttachment(value: unknown): AssistantAttachment | null {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const name = cleanString(source.name);
  const url = cleanString(source.url);
  if (!name || !url) return null;
  return {
    name,
    url,
    contentType: cleanString(source.contentType) || null,
    size: normalizeQuantity(source.size),
    uploadedAt: cleanString(source.uploadedAt) || null,
  };
}

export function createEmptyAssistantLead(): AssistantLead {
  return {
    clientName: null,
    companyName: null,
    phone: null,
    email: null,
    productType: null,
    quantity: null,
    color: null,
    sizes: [],
    sizeBreakdown: [],
    printPositions: [],
    printSizes: [],
    printType: null,
    logoReady: null,
    logoPending: false,
    logoAttachment: null,
    deliveryMethod: null,
    deadline: null,
    notes: null,
  };
}

export function normalizeAssistantLead(input: unknown): AssistantLead {
  const source = (input && typeof input === "object" ? input : {}) as LeadLike;
  const lead = createEmptyAssistantLead();

  lead.clientName = cleanString(source.clientName) ? titleCase(cleanString(source.clientName)) : null;
  lead.companyName = cleanString(source.companyName) ? titleCase(cleanString(source.companyName)) : null;
  lead.phone = normalizePhone(source.phone);
  lead.email = cleanString(source.email).toLowerCase() || null;

  const productType = cleanString(source.productType).toLowerCase();
  if (ASSISTANT_PRODUCT_TYPES.includes(productType as AssistantProductType)) {
    lead.productType = productType as AssistantProductType;
  }

  lead.quantity = normalizeQuantity(source.quantity);
  lead.color = cleanString(source.color).toLowerCase() || null;
  lead.sizes = normalizeArray(source.sizes, normalizeSize);
  lead.sizeBreakdown = normalizeOrderLines(source.sizeBreakdown);
  lead.printPositions = normalizeArray(source.printPositions, (value) => value.toLowerCase() || null);
  lead.printSizes = normalizeArray(source.printSizes, (value) => value.toLowerCase() || null);
  lead.printType = cleanString(source.printType).toLowerCase() || null;
  lead.logoReady = typeof source.logoReady === "boolean" ? source.logoReady : null;
  lead.logoPending = Boolean(source.logoPending);
  lead.logoAttachment = normalizeAssistantAttachment(source.logoAttachment);

  const deliveryMethod = cleanString(source.deliveryMethod).toLowerCase();
  if (deliveryMethod === "pickup" || deliveryMethod === "delivery") {
    lead.deliveryMethod = deliveryMethod;
  }

  lead.deadline = cleanString(source.deadline) || null;
  lead.notes = cleanString(source.notes) || null;
  return lead;
}

export function tokenize(text: string) {
  return normalizeText(text).split(/\s+/).filter(Boolean);
}

export function textToVector(text: string) {
  return termFrequency(tokenize(text));
}

export { cosineSimilarity, ASSISTANT_PRODUCT_TYPES };
export type {
  AssistantApprovedLeadSource,
  AssistantAttachment,
  AssistantChatResult,
  AssistantContextItem,
  AssistantFeedbackEntry,
  AssistantIntentSample,
  AssistantKnowledgeSource,
  AssistantLearnedPrintPattern,
  AssistantLead,
  AssistantMessageRole,
  AssistantOrderLine,
  AssistantProductPlaybook,
  AssistantProductType,
  AssistantRequiredField,
  AssistantTrainingSnapshot,
  AssistantTrainingState,
  AssistantTurnDebug,
} from "./ai/core/types.ts";

function extractPrintSizeUpdates(message: string) {
  const normalized = normalizeText(message);
  const printSizes = unique(
    PRINT_SIZE_PATTERNS.flatMap((pattern) =>
      pattern.patterns.some((candidate) => normalized.includes(normalizeText(candidate))) ? [pattern.canonical] : []
    )
  ).sort((left, right) => left.localeCompare(right));
  return printSizes;
}

function getComboPrintUpdates(message: string) {
  const normalized = normalizeText(message);
  if (normalized.includes("small front and small back")) {
    return {
      printPositions: ["back", "front center"],
      printSizes: ["small 9x9"],
    };
  }
  if (normalized.includes("small front and large back")) {
    return {
      printPositions: ["back", "front center"],
      printSizes: ["large 22x22", "small 9x9"],
    };
  }
  if (normalized.includes("large front and large back")) {
    return {
      printPositions: ["back", "front center"],
      printSizes: ["large 22x22"],
    };
  }
  return null;
}

function extractLogoState(message: string) {
  const normalized = normalizeText(message);
  if (
    normalized.includes("logo pending upload later") ||
    normalized.includes("logo pending") ||
    normalized.includes("upload logo later")
  ) {
    return { logoReady: true, logoPending: true };
  }
  if (normalized.includes("logo ready") || normalized.includes("logo attached") || normalized.includes("uploaded logo")) {
    return { logoReady: true, logoPending: false };
  }
  if (
    normalized.includes("no logo") ||
    normalized.includes("logo not ready") ||
    normalized.includes("logo later")
  ) {
    return { logoReady: false, logoPending: false };
  }
  return null;
}

function buildLeadUpdatesFromExtraction(
  currentLead: AssistantLead,
  message: string,
  attachment: AssistantAttachment | null,
  trainingState: AssistantTrainingState,
  explicitExtraction = false
) {
  const entities = extractEntities(message, {
    lead: currentLead,
    aliasMap: trainingState.aliasMap,
  });

  const updates: Partial<AssistantLead> = {};

  if (entities.fields.product) updates.productType = entities.fields.product.canonicalValue as AssistantProductType;
  if (entities.fields.quantity) updates.quantity = Number(entities.fields.quantity.canonicalValue);
  if (entities.fields.color) updates.color = String(entities.fields.color.canonicalValue);
  if (entities.fields.sizes) updates.sizes = entities.fields.sizes.canonicalValue as string[];
  if (entities.fields.print_position) {
    updates.printPositions = unique(
      (entities.fields.print_position.canonicalValue as string[]).map((value) => value.toLowerCase())
    ).sort((left, right) => left.localeCompare(right));
  }
  if (entities.fields.print_type) updates.printType = String(entities.fields.print_type.canonicalValue).toLowerCase();
  if (entities.fields.delivery_method) {
    const deliveryMethod = String(entities.fields.delivery_method.canonicalValue).toLowerCase();
    if (deliveryMethod === "pickup" || deliveryMethod === "delivery") {
      updates.deliveryMethod = deliveryMethod;
    }
  }
  if (entities.fields.deadline) updates.deadline = String(entities.fields.deadline.value);
  if (entities.fields.phone) updates.phone = String(entities.fields.phone.canonicalValue);
  if (entities.fields.email) updates.email = String(entities.fields.email.canonicalValue);
  if (entities.fields.company_name) updates.companyName = String(entities.fields.company_name.canonicalValue);
  if (entities.fields.customer_name) updates.clientName = String(entities.fields.customer_name.canonicalValue);

  if (entities.sizeBreakdown.length) {
    updates.sizeBreakdown = entities.sizeBreakdown;
    updates.sizes = unique(entities.sizeBreakdown.map((line) => line.size)).sort((left, right) => left.localeCompare(right));
    updates.quantity = entities.sizeBreakdown.reduce((total, line) => total + line.quantity, 0);
    if (!updates.productType && unique(entities.sizeBreakdown.map((line) => line.productType).filter(Boolean)).length === 1) {
      updates.productType = entities.sizeBreakdown[0].productType;
    }
    if (!updates.color && unique(entities.sizeBreakdown.map((line) => line.color).filter(Boolean)).length === 1) {
      updates.color = entities.sizeBreakdown[0].color;
    }
  }

  const comboUpdates = getComboPrintUpdates(message);
  if (comboUpdates) {
    updates.printPositions = comboUpdates.printPositions;
    updates.printSizes = comboUpdates.printSizes;
  } else {
    const printSizes = extractPrintSizeUpdates(message);
    if (printSizes.length) {
      updates.printSizes = printSizes;
    }
  }

  const logoState = extractLogoState(message);
  if (logoState) {
    updates.logoReady = logoState.logoReady;
    updates.logoPending = logoState.logoPending;
  }

  if (attachment) {
    updates.logoAttachment = attachment;
    updates.logoReady = true;
    updates.logoPending = false;
  }

  if (explicitExtraction) {
    return updates;
  }

  return { updates, entities };
}

export function extractLeadUpdates(
  message: string,
  trainingState?: Pick<AssistantTrainingState, "aliasMap"> | null
): Partial<AssistantLead> {
  const base = getBaseTrainingState();
  return buildLeadUpdatesFromExtraction(
    createEmptyAssistantLead(),
    message,
    null,
    {
      ...base,
      aliasMap: trainingState?.aliasMap || base.aliasMap,
    },
    true
  ) as Partial<AssistantLead>;
}

export function mergeAssistantLeadUpdates(lead: AssistantLead, updates: Partial<AssistantLead>) {
  const merged = normalizeAssistantLead(lead);

  if (updates.clientName !== undefined) merged.clientName = updates.clientName ? titleCase(updates.clientName) : null;
  if (updates.companyName !== undefined) merged.companyName = updates.companyName ? titleCase(updates.companyName) : null;
  if (updates.phone !== undefined) merged.phone = updates.phone ? normalizePhone(updates.phone) : null;
  if (updates.email !== undefined) merged.email = updates.email ? cleanString(updates.email).toLowerCase() : null;
  if (updates.productType !== undefined) merged.productType = updates.productType || null;
  if (updates.quantity !== undefined) merged.quantity = normalizeQuantity(updates.quantity);
  if (updates.color !== undefined) merged.color = updates.color ? cleanString(updates.color).toLowerCase() : null;
  if (updates.printType !== undefined) merged.printType = updates.printType ? cleanString(updates.printType).toLowerCase() : null;
  if (updates.deadline !== undefined) merged.deadline = updates.deadline ? cleanString(updates.deadline) : null;
  if (updates.deliveryMethod !== undefined) merged.deliveryMethod = updates.deliveryMethod || null;
  if (updates.notes !== undefined) merged.notes = updates.notes ? cleanString(updates.notes) : null;

  if (updates.sizes) {
    merged.sizes = unique(updates.sizes.map((size) => normalizeSize(size) || size)).sort((left, right) => left.localeCompare(right));
  }

  if (updates.sizeBreakdown) {
    merged.sizeBreakdown = normalizeOrderLines(updates.sizeBreakdown);
    merged.sizes = unique(merged.sizeBreakdown.map((line) => line.size)).sort((left, right) => left.localeCompare(right));
    const total = merged.sizeBreakdown.reduce((sum, line) => sum + line.quantity, 0);
    if (total > 0) merged.quantity = total;
  }

  if (updates.printPositions) {
    merged.printPositions = unique(updates.printPositions.map((value) => value.toLowerCase())).sort((left, right) =>
      left.localeCompare(right)
    );
  }

  if (updates.printSizes) {
    merged.printSizes = unique(updates.printSizes.map((value) => value.toLowerCase())).sort((left, right) =>
      left.localeCompare(right)
    );
  }

  if (updates.logoReady !== undefined) merged.logoReady = updates.logoReady;
  if (updates.logoPending !== undefined) merged.logoPending = updates.logoPending;
  if (updates.logoAttachment !== undefined) merged.logoAttachment = normalizeAssistantAttachment(updates.logoAttachment);

  if (merged.logoAttachment) {
    merged.logoReady = true;
    merged.logoPending = false;
  }

  if (!merged.color && merged.sizeBreakdown.length) {
    const colors = unique(merged.sizeBreakdown.map((line) => line.color).filter(Boolean) as string[]);
    if (colors.length === 1) merged.color = colors[0];
  }

  if (!merged.productType && merged.sizeBreakdown.length) {
    const products = unique(merged.sizeBreakdown.map((line) => line.productType).filter(Boolean) as AssistantProductType[]);
    if (products.length === 1) merged.productType = products[0];
  }

  return merged;
}

export function missingAssistantFields(lead: AssistantLead) {
  const normalized = normalizeAssistantLead(lead);
  const missing: AssistantRequiredField[] = [];
  if (!normalized.sizeBreakdown.length) missing.push("sizeBreakdown");
  if (!normalized.printType) missing.push("printType");
  if (!normalized.deliveryMethod) missing.push("deliveryMethod");
  if (!normalized.clientName) missing.push("clientName");
  if (!normalized.email) missing.push("email");
  if (!normalized.phone) missing.push("phone");
  return missing;
}

export function assistantReadyToSubmit(lead: AssistantLead) {
  return missingAssistantFields(lead).length === 0;
}

export function leadToTrainingText(lead: AssistantLead) {
  return formatLeadSummary(lead);
}

function mapRetrievalMatchesToContext(matches: ReturnType<typeof retrieveTopMatches>): AssistantContextItem[] {
  return matches.map((match) => ({
    source:
      match.kind === "past_lead"
        ? "lead"
        : match.kind === "approved_summary"
          ? "lead"
          : match.kind === "assistant_reply"
            ? "reply"
            : match.kind === "alias"
              ? "alias"
              : "faq",
    text: match.answer || match.text,
    score: match.score,
    explanation: match.explanation,
  }));
}

function buildSuggestions(lead: AssistantLead, trainingState: AssistantTrainingState) {
  const suggestions: string[] = [];
  if (!lead.productType) return suggestions;

  const playbook = trainingState.learnedProductPlaybooks[lead.productType];
  if (playbook?.topPrintPattern && !lead.printPositions.length) {
    suggestions.push(
      `Most approved ${titleCase(lead.productType)} jobs use ${playbook.topPrintPattern.positions
        .map(titleCase)
        .join(" and ")} with ${playbook.topPrintPattern.printSizes.map(titleCase).join(" and ")}.`
    );
  }

  if (
    playbook?.topPrintPattern &&
    lead.printPositions.length &&
    unique(lead.printPositions).sort().join("|") === playbook.topPrintPattern.positions.slice().sort().join("|") &&
    !lead.printSizes.length &&
    playbook.topPrintPattern.printSizes.length
  ) {
    suggestions.push(
      `Approved ${titleCase(lead.productType)} jobs usually use ${playbook.topPrintPattern.printSizes
        .map(titleCase)
        .join(" and ")} for this layout.`
    );
  }

  if (playbook?.topColor && !lead.color) {
    suggestions.push(`Most approved ${titleCase(lead.productType)} jobs use ${titleCase(playbook.topColor)}.`);
  }

  return suggestions;
}

export function retrieveAssistantContext(
  message: string,
  approvedLeads: AssistantApprovedLeadSource[] = [],
  knowledgeItems: AssistantKnowledgeSource[] = [],
  trainingState?: AssistantTrainingState | null
) {
  const state =
    trainingState ||
    buildLocalTrainingState({
      baseSamples: BASE_SAMPLES,
      baseFaq: BASE_FAQ,
      baseAliases: BASE_ALIASES,
      approvedLeads,
      knowledgeItems,
      updatedAt: null,
    });

  return mapRetrievalMatchesToContext(
    retrieveTopMatches({
      query: message,
      documents: state.retrievalDocuments,
      index: state.retrievalIndex,
      topK: 5,
      threshold: state.retrievalIndexMetadata.threshold,
    })
  );
}

export function buildAssistantTrainingState(
  approvedLeads: AssistantApprovedLeadSource[] = [],
  knowledgeItems: AssistantKnowledgeSource[] = [],
  feedbackEntries: AssistantFeedbackEntry[] = [],
  updatedAt: string | null = null
): AssistantTrainingState {
  return buildLocalTrainingState({
    baseSamples: BASE_SAMPLES,
    baseFaq: BASE_FAQ,
    baseAliases: BASE_ALIASES,
    approvedLeads,
    knowledgeItems,
    feedbackEntries,
    updatedAt,
  });
}

function mergeTrainingState(
  trainingState: AssistantTrainingState | null | undefined,
  approvedLeads: AssistantApprovedLeadSource[] = [],
  knowledgeItems: AssistantKnowledgeSource[] = [],
  feedbackEntries: AssistantFeedbackEntry[] = []
) {
  if (trainingState && !approvedLeads.length && !knowledgeItems.length && !feedbackEntries.length) {
    return trainingState;
  }
  if (!approvedLeads.length && !knowledgeItems.length && !feedbackEntries.length) {
    return getBaseTrainingState();
  }
  return buildAssistantTrainingState(
    approvedLeads,
    knowledgeItems,
    feedbackEntries,
    trainingState?.updatedAt || null
  );
}

function explicitSummaryRequest(message: string) {
  const normalized = normalizeText(message);
  return normalized === "summary" || normalized.startsWith("summary ");
}

export function runAssistantTurn(input: {
  lead: AssistantLead;
  message: string;
  attachment?: AssistantAttachment | null;
  approvedLeads?: AssistantApprovedLeadSource[];
  knowledgeItems?: AssistantKnowledgeSource[];
  feedbackEntries?: AssistantFeedbackEntry[];
  trainingState?: AssistantTrainingState | null;
}): AssistantChatResult {
  const currentLead = normalizeAssistantLead(input.lead);
  const attachment = normalizeAssistantAttachment(input.attachment);
  const message = cleanString(input.message);
  const trainingState = mergeTrainingState(
    input.trainingState,
    input.approvedLeads,
    input.knowledgeItems,
    input.feedbackEntries
  );
  const summaryRequested = explicitSummaryRequest(message);
  const intent = predictIntent(trainingState.intentModel, message || attachment?.name || "");
  const extractionResult = buildLeadUpdatesFromExtraction(currentLead, message, attachment, trainingState) as {
    updates: Partial<AssistantLead>;
    entities: ReturnType<typeof extractEntities>;
  };
  const nextLead = mergeAssistantLeadUpdates(currentLead, extractionResult.updates);
  const missingFields = missingAssistantFields(nextLead);
  const retrievalMatches = retrieveTopMatches({
    query: `${message} ${formatLeadSummary(nextLead)}`.trim(),
    documents: trainingState.retrievalDocuments,
    index: trainingState.retrievalIndex,
    topK: 5,
    threshold: trainingState.retrievalIndexMetadata.threshold,
  });
  const decision = decideNextAction({
    intent,
    lead: nextLead,
    missingFields,
    retrievalMatches,
    hasEntityConflict: extractionResult.entities.conflicts.length > 0,
    explicitSummaryRequest: summaryRequested,
  });
  const suggestions = buildSuggestions(nextLead, trainingState);
  const reply = generateAssistantReply({
    lead: nextLead,
    decision,
    missingFields,
    retrievalMatches,
    conflicts: extractionResult.entities.conflicts.map((conflict) => ({
      field: conflict.field,
      values: conflict.values,
      explanation: conflict.explanation,
    })),
    explicitSummaryRequest: summaryRequested,
    attachmentReceived: Boolean(attachment),
    logoPendingAcknowledged: Boolean(extractionResult.updates.logoPending),
  });

  const debug = buildAssistantTurnDebug({
    intent,
    entities: extractionResult.entities,
    missingFields,
    retrievalMatches,
    decision,
  });

  return {
    reply,
    lead: nextLead,
    updates: extractionResult.updates,
    missingFields,
    readyToSubmit: assistantReadyToSubmit(nextLead),
    suggestions,
    relatedContext: mapRetrievalMatchesToContext(retrievalMatches),
    debug,
  };
}

export {
  ASSISTANT_REQUIRED_FIELDS,
  createEmptyLearnedProductAliases,
  createEmptyLearnedProductPlaybooks,
  formatAssistantFieldLabel,
  formatLeadSummary,
};
