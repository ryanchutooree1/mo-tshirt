export const AI_INTENTS = [
  "new_order",
  "provide_details",
  "ask_price",
  "ask_delivery",
  "ask_design_help",
  "confirm_order",
  "greet",
  "unclear",
] as const;

export type AssistantIntent = (typeof AI_INTENTS)[number];

export const ASSISTANT_PRODUCT_TYPES = ["t-shirt", "polo", "hoodie", "cap"] as const;
export type AssistantProductType = (typeof ASSISTANT_PRODUCT_TYPES)[number];

export const ASSISTANT_REQUIRED_FIELDS = [
  "productType",
  "quantity",
  "printPositions",
  "sizeBreakdown",
  "clientName",
  "email",
  "phone",
  "deadline",
] as const;

export type AssistantRequiredField = (typeof ASSISTANT_REQUIRED_FIELDS)[number];
export type AssistantMessageRole = "user" | "assistant";

export type AssistantAttachment = {
  name: string;
  url: string;
  contentType: string | null;
  size: number | null;
  uploadedAt: string | null;
};

export type AssistantOrderLine = {
  color: string | null;
  productType: AssistantProductType | null;
  size: string;
  quantity: number;
};

export type AssistantLead = {
  clientName: string | null;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  productType: AssistantProductType | null;
  quantity: number | null;
  color: string | null;
  sizes: string[];
  sizeBreakdown: AssistantOrderLine[];
  printPositions: string[];
  printSizes: string[];
  printType: string | null;
  logoReady: boolean | null;
  logoPending: boolean;
  logoAttachment: AssistantAttachment | null;
  deliveryMethod: "pickup" | "delivery" | null;
  deadline: string | null;
  notes: string | null;
};

export type AssistantApprovedLeadSource = {
  id?: string;
  lead: AssistantLead;
  status?: string | null;
  summary?: string | null;
  sessionId?: string | null;
  sessionMessages?: string[];
  acceptedReplies?: string[];
};

export type AssistantKnowledgeSource = {
  id?: string;
  title: string;
  content: string;
};

export type AssistantFeedbackEntry = {
  id?: string;
  leadId?: string | null;
  sessionId?: string | null;
  verdict: "approved" | "rejected";
  comment: string | null;
  createdAt?: string | null;
  userMessages?: string[];
  assistantReplies?: string[];
  lead?: AssistantLead | null;
};

export type AssistantContextItem = {
  source: "lead" | "knowledge" | "faq" | "reply" | "alias";
  text: string;
  score: number;
  explanation?: string;
};

export type AssistantEntityKey =
  | "product"
  | "quantity"
  | "sizes"
  | "color"
  | "print_position"
  | "print_type"
  | "deadline"
  | "phone"
  | "email"
  | "company_name"
  | "customer_name";

export type AssistantEntityCandidate = {
  field: AssistantEntityKey;
  value: string | number | string[];
  canonicalValue: string | number | string[];
  confidence: number;
  matchedText: string;
  alias?: string | null;
  strategy: "regex" | "heuristic" | "fuzzy" | "template" | "derived";
};

export type AssistantEntityConflict = {
  field: AssistantEntityKey;
  values: Array<string | number | string[]>;
  explanation: string;
};

export type AssistantEntityExtractionResult = {
  fields: Partial<{
    product: AssistantEntityCandidate;
    quantity: AssistantEntityCandidate;
    sizes: AssistantEntityCandidate;
    color: AssistantEntityCandidate;
    print_position: AssistantEntityCandidate;
    print_type: AssistantEntityCandidate;
    deadline: AssistantEntityCandidate;
    phone: AssistantEntityCandidate;
    email: AssistantEntityCandidate;
    company_name: AssistantEntityCandidate;
    customer_name: AssistantEntityCandidate;
  }>;
  sizeBreakdown: AssistantOrderLine[];
  candidates: Partial<Record<AssistantEntityKey, AssistantEntityCandidate[]>>;
  conflicts: AssistantEntityConflict[];
};

export type AssistantIntentSample = {
  text: string;
  intent: AssistantIntent;
};

export type AssistantIntentPrediction = {
  label: AssistantIntent;
  confidence: number;
  scores: Record<AssistantIntent, number>;
  method: "naive_bayes" | "tfidf_fallback" | "ensemble";
  explanation: string;
};

export type AssistantIntentClassifierModel = {
  labels: AssistantIntent[];
  vocabulary: string[];
  priors: Record<AssistantIntent, number>;
  tokenTotals: Record<AssistantIntent, number>;
  tokenCounts: Record<AssistantIntent, Record<string, number>>;
  idf: Record<string, number>;
  centroids: Record<AssistantIntent, Record<string, number>>;
  sampleCount: number;
};

export type AssistantRetrievalMemoryKind =
  | "past_lead"
  | "approved_summary"
  | "assistant_reply"
  | "alias"
  | "faq";

export type AssistantRetrievalMemoryItem = {
  id: string;
  kind: AssistantRetrievalMemoryKind;
  text: string;
  answer?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  tags?: string[];
};

export type AssistantRetrievalIndex = {
  idf: Record<string, number>;
  documentVectors: Record<string, Record<string, number>>;
  documentCount: number;
};

export type AssistantRetrievalMatch = {
  id: string;
  kind: AssistantRetrievalMemoryKind;
  text: string;
  answer?: string | null;
  score: number;
  overlapTerms: string[];
  explanation: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type AssistantDecisionAction =
  | "ask_missing_field"
  | "clarify_ambiguous_field"
  | "suggest_best_option"
  | "generate_summary"
  | "answer_faq"
  | "escalate_to_human";

export type AssistantDecision = {
  action: AssistantDecisionAction;
  targetField?: AssistantRequiredField | null;
  explanation: string;
  faqMatch?: AssistantRetrievalMatch | null;
  suggestion?: string | null;
};

export type AssistantTurnDebug = {
  predicted_intent: AssistantIntent;
  intent_confidence: number;
  extracted_entities: Record<string, unknown>;
  missing_fields: AssistantRequiredField[];
  retrieved_examples: Array<{
    id: string;
    kind: AssistantRetrievalMemoryKind;
    score: number;
    explanation: string;
  }>;
  chosen_action: AssistantDecisionAction;
  explanation: string;
};

export type AssistantFaqEntry = {
  id: string;
  question: string;
  answer: string;
  tags?: string[];
};

export type AssistantKeywordStat = {
  keyword: string;
  count: number;
};

export type AssistantLearnedPrintPattern = {
  positions: string[];
  printSizes: string[];
  count: number;
};

export type AssistantProductPlaybook = {
  topColor: string | null;
  topDeliveryMethod: AssistantLead["deliveryMethod"];
  topPrintPattern: AssistantLearnedPrintPattern | null;
};

export type AssistantTrainingSnapshot = {
  positiveKeywordCount: number;
  fieldGroups: Array<{ field: string; examples: string[] }>;
  approvedLeadCount: number;
  knowledgeCount: number;
  feedbackCount: number;
  faqCount: number;
  classifierSampleCount: number;
  classifierLabelCount: number;
  retrievalDocumentCount: number;
  topKeywords: AssistantKeywordStat[];
  learnedProductAliases: Record<AssistantProductType, string[]>;
  learnedProductAliasCount: number;
  learnedProductPlaybooks: Record<AssistantProductType, AssistantProductPlaybook>;
  retrievalIndexMetadata: {
    documentCount: number;
    avgTermsPerDocument: number;
    threshold: number;
  };
  updatedAt: string | null;
};

export type AssistantTrainingState = AssistantTrainingSnapshot & {
  intentModel: AssistantIntentClassifierModel;
  retrievalIndex: AssistantRetrievalIndex;
  retrievalDocuments: AssistantRetrievalMemoryItem[];
  trainingSamples: AssistantIntentSample[];
  faqMemory: AssistantFaqEntry[];
  aliasMap: Record<AssistantProductType, string[]>;
  feedbackEntries: AssistantFeedbackEntry[];
};

export type AssistantChatResult = {
  reply: string;
  lead: AssistantLead;
  updates: Partial<AssistantLead>;
  missingFields: AssistantRequiredField[];
  readyToSubmit: boolean;
  suggestions: string[];
  relatedContext: AssistantContextItem[];
  debug: AssistantTurnDebug;
};
