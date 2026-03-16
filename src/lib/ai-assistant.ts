const WORD_RE = /[a-zA-Z0-9+]+/g;
const PHONE_RE = /(?:\+?230)?[\s-]?([2455789]\d{7})\b/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const NAME_RE =
  /(?:my name is|i am|i'm)\s+([A-Za-z][A-Za-z\s'-]{1,40}?)(?=\s+(?:and\b|phone\b|email\b)|$)/i;
const DEADLINE_RE =
  /(?:by|before|for)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|next week|this week)/i;
const QUANTITY_RE = /\b(\d{1,4})\b/g;
const NOTE_RE = /\bnotes?\s*:/i;
const QUANTITY_CONTEXT_RE =
  /\b(piece|pieces|pcs|qty|quantity|need|want|order|shirts?|t[\s-]?shirts?|polos?|hoodies?|caps?)\b/i;

const PRODUCT_PATTERNS: Array<{ canonical: AssistantLead["productType"]; patterns: string[] }> = [
  { canonical: "t-shirt", patterns: ["tshirt", "t shirt", "tee", "shirt"] },
  { canonical: "polo", patterns: ["poloshirt", "polo shirt", "polo"] },
  { canonical: "hoodie", patterns: ["hoodie"] },
  { canonical: "cap", patterns: ["cap"] },
];

const LEFT_CHEST_PATTERNS = ["left chest", "front left chest", "left logo", "logo on chest"];
const FRONT_CENTER_PATTERNS = ["front center", "center front", "big front"];
const BACK_PATTERNS = ["back print", "big back", "rear", "back"];
const SLEEVE_PATTERNS = ["sleeve", "arm"];

const PRINT_SIZE_PATTERNS: Array<{ canonical: string; patterns: string[] }> = [
  { canonical: "small 9x9", patterns: ["9x9", "small logo", "small print"] },
  { canonical: "large 22x22", patterns: ["22x22", "large print", "big print", "big logo"] },
];

const DELIVERY_PATTERNS: Array<{ canonical: AssistantLead["deliveryMethod"]; patterns: string[] }> = [
  { canonical: "pickup", patterns: ["pickup", "collect", "collection"] },
  { canonical: "delivery", patterns: ["delivery", "deliver", "post office", "courier"] },
];

const COLORS = new Set([
  "white",
  "black",
  "navy",
  "red",
  "blue",
  "green",
  "orange",
  "yellow",
  "grey",
  "gray",
  "pink",
  "purple",
  "maroon",
  "beige",
]);

const SIZE_TOKENS = new Set(["xs", "s", "m", "l", "xl", "2xl", "3xl", "4xl"]);

export const ASSISTANT_FIELDS_IN_ORDER = [
  "productType",
  "quantity",
  "color",
  "printPositions",
  "printSizes",
  "logoReady",
  "sizes",
  "deliveryMethod",
  "clientName",
  "phone",
] as const;

export const ASSISTANT_REQUIRED_FIELDS = [
  "productType",
  "quantity",
  "printPositions",
  "clientName",
  "phone",
] as const;

export type AssistantMessageRole = "user" | "assistant";

export type AssistantRequiredField = (typeof ASSISTANT_REQUIRED_FIELDS)[number];

export type AssistantLead = {
  clientName: string | null;
  phone: string | null;
  email: string | null;
  productType: "t-shirt" | "polo" | "hoodie" | "cap" | null;
  quantity: number | null;
  color: string | null;
  sizes: string[];
  printPositions: string[];
  printSizes: string[];
  logoReady: boolean | null;
  deliveryMethod: "pickup" | "delivery" | null;
  deadline: string | null;
  notes: string | null;
};

export type AssistantApprovedLeadSource = {
  lead: AssistantLead;
  status?: string | null;
};

export type AssistantKnowledgeSource = {
  title: string;
  content: string;
};

export type AssistantContextItem = {
  source: "lead" | "knowledge";
  text: string;
  score: number;
};

export type AssistantChatResult = {
  reply: string;
  lead: AssistantLead;
  updates: Partial<AssistantLead>;
  missingFields: AssistantRequiredField[];
  readyToSubmit: boolean;
  suggestions: string[];
  relatedContext: AssistantContextItem[];
};

export type AssistantKeywordStat = {
  keyword: string;
  count: number;
};

export type AssistantTrainingSnapshot = {
  positiveKeywordCount: number;
  fieldGroups: string[];
  approvedLeadCount: number;
  knowledgeCount: number;
  topKeywords: AssistantKeywordStat[];
  updatedAt?: string | null;
};

export type AssistantTrainingState = AssistantTrainingSnapshot & {
  positiveKeywords: Record<string, number>;
  fieldKeywordCounts: Record<string, Record<string, number>>;
};

type LeadLike = Partial<Record<keyof AssistantLead, unknown>>;

const FIELD_LABELS: Record<AssistantRequiredField, string> = {
  productType: "product type",
  quantity: "quantity",
  printPositions: "print positions",
  clientName: "client name",
  phone: "phone number",
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWords(text: string) {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

function hasPattern(normalizedWords: string, pattern: string) {
  const normalizedPattern = pattern.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalizedPattern) return false;
  return normalizedWords.includes(` ${normalizedPattern} `);
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, char: string) => char.toUpperCase())
    .trim();
}

function normalizePhone(value: unknown) {
  const digits = cleanString(value).replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.length > 8 && digits.endsWith(digits.slice(-8))) {
    return digits.slice(-8);
  }
  if (digits.length === 8) {
    return digits;
  }
  return digits;
}

function normalizeQuantity(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 1 && value <= 5000 ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 5000 ? parsed : null;
  }
  return null;
}

function normalizeSize(value: string) {
  return value.trim().toUpperCase();
}

function dedupeSorted(values: string[], transform?: (value: string) => string) {
  return Array.from(
    new Set(
      values
        .map((value) => (transform ? transform(value) : value).trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function normalizeStringArray(value: unknown, transform?: (value: string) => string) {
  if (!Array.isArray(value)) return [];
  return dedupeSorted(
    value
      .map((entry) => cleanString(entry))
      .filter(Boolean),
    transform
  );
}

function incrementCounter(target: Record<string, number>, key: string) {
  target[key] = (target[key] || 0) + 1;
}

export function createEmptyAssistantLead(): AssistantLead {
  return {
    clientName: null,
    phone: null,
    email: null,
    productType: null,
    quantity: null,
    color: null,
    sizes: [],
    printPositions: [],
    printSizes: [],
    logoReady: null,
    deliveryMethod: null,
    deadline: null,
    notes: null,
  };
}

export function normalizeAssistantLead(input: unknown): AssistantLead {
  const source = (input && typeof input === "object" ? input : {}) as LeadLike;
  const lead = createEmptyAssistantLead();

  const clientName = cleanString(source.clientName);
  lead.clientName = clientName ? titleCase(clientName) : null;
  lead.phone = normalizePhone(source.phone);
  lead.email = cleanString(source.email).toLowerCase() || null;

  const productType = cleanString(source.productType).toLowerCase();
  if (productType === "t-shirt" || productType === "polo" || productType === "hoodie" || productType === "cap") {
    lead.productType = productType;
  }

  lead.quantity = normalizeQuantity(source.quantity);
  lead.color = cleanString(source.color).toLowerCase() || null;
  lead.sizes = normalizeStringArray(source.sizes, normalizeSize);
  lead.printPositions = normalizeStringArray(source.printPositions, (value) => value.toLowerCase());
  lead.printSizes = normalizeStringArray(source.printSizes, (value) => value.toLowerCase());
  lead.logoReady = typeof source.logoReady === "boolean" ? source.logoReady : null;

  const deliveryMethod = cleanString(source.deliveryMethod).toLowerCase();
  if (deliveryMethod === "pickup" || deliveryMethod === "delivery") {
    lead.deliveryMethod = deliveryMethod;
  }

  lead.deadline = cleanString(source.deadline).toLowerCase() || null;
  lead.notes = cleanString(source.notes) || null;
  return lead;
}

export function tokenize(text: string) {
  return Array.from(text.matchAll(WORD_RE)).map((match) => match[0].toLowerCase());
}

export function textToVector(text: string) {
  const counts: Record<string, number> = {};
  tokenize(text).forEach((token) => incrementCounter(counts, token));
  return counts;
}

export function cosineSimilarity(left: Record<string, number>, right: Record<string, number>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (!leftKeys.length || !rightKeys.length) return 0;

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  leftKeys.forEach((key) => {
    const value = left[key] || 0;
    leftMagnitude += value * value;
    dot += value * (right[key] || 0);
  });

  rightKeys.forEach((key) => {
    const value = right[key] || 0;
    rightMagnitude += value * value;
  });

  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function leadToTrainingText(lead: AssistantLead) {
  return [
    lead.productType,
    lead.quantity ? String(lead.quantity) : "",
    lead.color,
    lead.sizes.join(" "),
    lead.printPositions.join(" "),
    lead.printSizes.join(" "),
    lead.deliveryMethod,
    lead.deadline,
    lead.notes,
  ]
    .filter(Boolean)
    .join(" ");
}

export function extractLeadUpdates(message: string): Partial<AssistantLead> {
  const updates: Partial<AssistantLead> = {};
  const lower = message.toLowerCase();
  const normalized = normalizeWords(message);

  for (const product of PRODUCT_PATTERNS) {
    if (product.patterns.some((pattern) => hasPattern(normalized, pattern))) {
      updates.productType = product.canonical;
      break;
    }
  }

  const phoneMatch = PHONE_RE.exec(message);
  if (phoneMatch) {
    updates.phone = phoneMatch[1];
  }

  if (QUANTITY_CONTEXT_RE.test(lower) || !phoneMatch) {
    const quantityMatch = Array.from(lower.matchAll(QUANTITY_RE))
      .map((match) => Number(match[1]))
      .find((value) => Number.isFinite(value) && value >= 1 && value <= 5000);
    if (quantityMatch) {
      updates.quantity = quantityMatch;
    }
  }

  const foundColor = Array.from(COLORS).find((color) => hasPattern(normalized, color));
  if (foundColor) {
    updates.color = foundColor;
  }

  const foundSizes = tokenize(lower)
    .filter((token) => SIZE_TOKENS.has(token))
    .map(normalizeSize);
  if (foundSizes.length) {
    updates.sizes = dedupeSorted(foundSizes);
  }

  const printPositions = new Set<string>();
  if (LEFT_CHEST_PATTERNS.some((pattern) => hasPattern(normalized, pattern))) {
    printPositions.add("front left chest");
  }
  if (BACK_PATTERNS.some((pattern) => hasPattern(normalized, pattern))) {
    printPositions.add("back");
  }
  if (SLEEVE_PATTERNS.some((pattern) => hasPattern(normalized, pattern))) {
    printPositions.add("sleeve");
  }
  const hasFrontCenter = FRONT_CENTER_PATTERNS.some((pattern) => hasPattern(normalized, pattern));
  if (hasFrontCenter || (hasPattern(normalized, "front") && !printPositions.has("front left chest"))) {
    printPositions.add("front center");
  }
  if (printPositions.size) {
    updates.printPositions = Array.from(printPositions).sort((left, right) => left.localeCompare(right));
  }

  const printSizes = PRINT_SIZE_PATTERNS
    .filter((pattern) => pattern.patterns.some((candidate) => hasPattern(normalized, candidate)))
    .map((pattern) => pattern.canonical);
  if (printSizes.length) {
    updates.printSizes = dedupeSorted(printSizes);
  }

  for (const delivery of DELIVERY_PATTERNS) {
    if (delivery.patterns.some((pattern) => hasPattern(normalized, pattern))) {
      updates.deliveryMethod = delivery.canonical;
      break;
    }
  }

  if (
    lower.includes("logo ready") ||
    lower.includes("i have logo") ||
    lower.includes("logo is ready")
  ) {
    updates.logoReady = true;
  } else if (
    lower.includes("no logo") ||
    lower.includes("logo not ready") ||
    lower.includes("i don't have logo") ||
    lower.includes("i do not have logo") ||
    lower.includes("logo later")
  ) {
    updates.logoReady = false;
  }

  const emailMatch = EMAIL_RE.exec(message);
  if (emailMatch) {
    updates.email = emailMatch[0].toLowerCase();
  }

  const nameMatch = NAME_RE.exec(message);
  if (nameMatch) {
    updates.clientName = titleCase(nameMatch[1]);
  }

  const deadlineMatch = DEADLINE_RE.exec(lower);
  if (deadlineMatch) {
    updates.deadline = deadlineMatch[1].toLowerCase();
  }

  if (NOTE_RE.test(message)) {
    updates.notes = message.trim();
  }

  return updates;
}

export function mergeAssistantLeadUpdates(lead: AssistantLead, updates: Partial<AssistantLead>) {
  const merged = normalizeAssistantLead(lead);

  if (updates.sizes) {
    merged.sizes = dedupeSorted([...merged.sizes, ...updates.sizes], normalizeSize);
  }
  if (updates.printPositions) {
    merged.printPositions = dedupeSorted([...merged.printPositions, ...updates.printPositions], (value) =>
      value.toLowerCase()
    );
  }
  if (updates.printSizes) {
    merged.printSizes = dedupeSorted([...merged.printSizes, ...updates.printSizes], (value) => value.toLowerCase());
  }

  if (updates.clientName !== undefined) merged.clientName = updates.clientName;
  if (updates.phone !== undefined) merged.phone = updates.phone;
  if (updates.email !== undefined) merged.email = updates.email;
  if (updates.productType !== undefined) merged.productType = updates.productType;
  if (updates.quantity !== undefined) merged.quantity = updates.quantity;
  if (updates.color !== undefined) merged.color = updates.color;
  if (updates.logoReady !== undefined) merged.logoReady = updates.logoReady;
  if (updates.deliveryMethod !== undefined) merged.deliveryMethod = updates.deliveryMethod;
  if (updates.deadline !== undefined) merged.deadline = updates.deadline;
  if (updates.notes !== undefined) merged.notes = updates.notes;

  return normalizeAssistantLead(merged);
}

export function missingAssistantFields(lead: AssistantLead) {
  return ASSISTANT_REQUIRED_FIELDS.filter((field) => {
    const value = lead[field];
    if (Array.isArray(value)) return value.length === 0;
    return value === null || value === "";
  });
}

export function assistantReadyToSubmit(lead: AssistantLead) {
  return missingAssistantFields(lead).length === 0;
}

export function formatAssistantFieldLabel(field: AssistantRequiredField) {
  return FIELD_LABELS[field];
}

export function nextAssistantQuestion(lead: AssistantLead) {
  const missing = missingAssistantFields(lead);
  if (!missing.length) {
    return 'Great. I have the main details. Type "summary" to review the lead or use "Submit lead" in admin.';
  }

  const prompts: Record<AssistantRequiredField, string> = {
    productType: "What do you want: T-shirt, polo, hoodie, or cap?",
    quantity: "How many pieces do you need?",
    printPositions: "Where do you want the print: front left chest, front center, back, or sleeve?",
    clientName: "What is your name?",
    phone: "What is your phone number?",
  };

  return prompts[missing[0]];
}

export function buildAssistantSuggestions(lead: AssistantLead, message: string) {
  const suggestions: string[] = [];
  if ((lead.productType === "polo" || lead.productType === "t-shirt") && !lead.printSizes.length) {
    suggestions.push("You can choose small 9x9 for a chest logo or large 22x22 for a big print.");
  }
  if (lead.logoReady === false) {
    suggestions.push("If the logo is not ready yet, you can still send the text, colors, and style you want.");
  }
  if (/\brestaurant\b|\bcompany\b/i.test(message)) {
    suggestions.push("For company uniforms, front left chest plus a large back print is a common setup.");
  }
  return suggestions.slice(0, 3);
}

export function formatLeadSummary(lead: AssistantLead) {
  const rows: Array<[string, string | null]> = [
    ["Name", lead.clientName],
    ["Phone", lead.phone],
    ["Email", lead.email],
    ["Product", lead.productType],
    ["Quantity", lead.quantity ? String(lead.quantity) : null],
    ["Color", lead.color],
    ["Sizes", lead.sizes.join(", ") || null],
    ["Print positions", lead.printPositions.join(", ") || null],
    ["Print sizes", lead.printSizes.join(", ") || null],
    ["Logo ready", lead.logoReady === null ? null : lead.logoReady ? "Yes" : "No"],
    ["Delivery", lead.deliveryMethod],
    ["Deadline", lead.deadline],
    ["Notes", lead.notes],
  ];

  return ["Lead summary:", ...rows.filter(([, value]) => value).map(([label, value]) => `- ${label}: ${value}`)].join("\n");
}

export function retrieveAssistantContext(
  message: string,
  approvedLeads: AssistantApprovedLeadSource[],
  knowledgeItems: AssistantKnowledgeSource[]
) {
  const queryVector = textToVector(message);
  const related: AssistantContextItem[] = [];

  approvedLeads.forEach((item) => {
    if (item.status && item.status !== "approved") return;
    const text = leadToTrainingText(normalizeAssistantLead(item.lead));
    const score = cosineSimilarity(queryVector, textToVector(text));
    if (score > 0.15) {
      related.push({
        source: "lead",
        score,
        text: `Past approved pattern: ${text}`,
      });
    }
  });

  knowledgeItems.forEach((item) => {
    const text = [item.title, item.content].filter(Boolean).join(" ").trim();
    const score = cosineSimilarity(queryVector, textToVector(text));
    if (score > 0.15) {
      related.push({
        source: "knowledge",
        score,
        text: `Business knowledge: ${text}`,
      });
    }
  });

  return related.sort((left, right) => right.score - left.score).slice(0, 3);
}

export function runAssistantTurn(input: {
  lead: AssistantLead;
  message: string;
  approvedLeads?: AssistantApprovedLeadSource[];
  knowledgeItems?: AssistantKnowledgeSource[];
}): AssistantChatResult {
  const updates = extractLeadUpdates(input.message);
  const lead = mergeAssistantLeadUpdates(input.lead, updates);
  const relatedContext = retrieveAssistantContext(
    input.message,
    input.approvedLeads || [],
    input.knowledgeItems || []
  );
  const missingFields = missingAssistantFields(lead);
  const readyToSubmit = missingFields.length === 0;
  const normalizedMessage = input.message.trim().toLowerCase();

  let reply = "";
  if (normalizedMessage === "summary" || normalizedMessage === "show summary" || normalizedMessage === "show lead") {
    reply = formatLeadSummary(lead);
  } else if (normalizedMessage === "submit") {
    if (readyToSubmit) {
      reply = `${formatLeadSummary(lead)}\n\nThis lead is ready. Use "Submit lead" in admin to save it.`;
    } else {
      const labels = missingFields.map(formatAssistantFieldLabel).join(", ");
      reply = `I still need these details before submission: ${labels}. ${nextAssistantQuestion(lead)}`;
    }
  } else {
    const intro = relatedContext.length ? "I found similar past information that may help. " : "";
    reply = `${intro}${nextAssistantQuestion(lead)}`;
  }

  return {
    reply,
    lead,
    updates,
    missingFields,
    readyToSubmit,
    suggestions: buildAssistantSuggestions(lead, input.message),
    relatedContext,
  };
}

export function buildAssistantTrainingState(
  approvedLeads: AssistantApprovedLeadSource[],
  knowledgeItems: AssistantKnowledgeSource[]
): AssistantTrainingState {
  const positiveKeywords: Record<string, number> = {};
  const fieldKeywordCounts: Record<string, Record<string, number>> = {};

  approvedLeads.forEach((source) => {
    if (source.status && source.status !== "approved") return;
    const lead = normalizeAssistantLead(source.lead);
    const tokens = tokenize(leadToTrainingText(lead));
    tokens.forEach((token) => incrementCounter(positiveKeywords, token));

    (["productType", "deliveryMethod", "color"] as const).forEach((field) => {
      if (!lead[field]) return;
      fieldKeywordCounts[field] = fieldKeywordCounts[field] || {};
      tokens.forEach((token) => incrementCounter(fieldKeywordCounts[field], token));
    });
  });

  knowledgeItems.forEach((item) => {
    tokenize([item.title, item.content].filter(Boolean).join(" ")).forEach((token) =>
      incrementCounter(positiveKeywords, token)
    );
  });

  const topKeywords = Object.entries(positiveKeywords)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([keyword, count]) => ({ keyword, count }));

  return {
    positiveKeywords,
    fieldKeywordCounts,
    positiveKeywordCount: Object.keys(positiveKeywords).length,
    fieldGroups: Object.keys(fieldKeywordCounts),
    approvedLeadCount: approvedLeads.filter((item) => !item.status || item.status === "approved").length,
    knowledgeCount: knowledgeItems.length,
    topKeywords,
  };
}
