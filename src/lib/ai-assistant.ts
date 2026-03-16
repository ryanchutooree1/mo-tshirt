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
const ORDER_CONTEXT_RE = /\b(need|want|order|quote|looking|get|require)\b/i;

export const ASSISTANT_PRODUCT_TYPES = ["t-shirt", "polo", "hoodie", "cap"] as const;
export type AssistantProductType = (typeof ASSISTANT_PRODUCT_TYPES)[number];

const PRODUCT_PATTERNS: Array<{ canonical: AssistantProductType; patterns: string[] }> = [
  {
    canonical: "t-shirt",
    patterns: ["tshirt", "tshirts", "t shirt", "t shirts", "t-shirt", "t-shirts", "tee", "tees"],
  },
  { canonical: "polo", patterns: ["poloshirt", "poloshirts", "polo shirt", "polo shirts", "polo", "polos"] },
  { canonical: "hoodie", patterns: ["hoodie", "hoodies"] },
  { canonical: "cap", patterns: ["cap", "caps"] },
];

const PRODUCT_ROOT_HINTS: Record<AssistantProductType, string[]> = {
  "t-shirt": ["tshirt", "tee"],
  polo: ["polo"],
  hoodie: ["hoodie"],
  cap: ["cap"],
};

const PRODUCT_ALIAS_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "hi",
  "i",
  "in",
  "is",
  "me",
  "my",
  "need",
  "of",
  "on",
  "please",
  "quote",
  "the",
  "to",
  "want",
  "with",
  "you",
]);
const NAME_RESPONSE_STOP_WORDS = new Set([
  "back",
  "black",
  "blue",
  "cap",
  "caps",
  "center",
  "chest",
  "delivery",
  "front",
  "hoodie",
  "hoodies",
  "large",
  "left",
  "logo",
  "pickup",
  "polo",
  "polos",
  "print",
  "red",
  "shirt",
  "shirts",
  "size",
  "small",
  "sleeve",
  "summary",
  "submit",
  "tee",
  "tees",
  "tshirt",
  "tshirts",
  "white",
]);

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
const SIZE_TEMPLATE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;
const SIZE_TEMPLATE_ORDER_INDEX = new Map<string, number>(SIZE_TEMPLATE_ORDER.map((size, index) => [size, index]));

export const ASSISTANT_FIELDS_IN_ORDER = [
  "productType",
  "quantity",
  "color",
  "printPositions",
  "printSizes",
  "logoReady",
  "sizeBreakdown",
  "sizes",
  "deliveryMethod",
  "clientName",
  "phone",
] as const;

export const ASSISTANT_REQUIRED_FIELDS = [
  "productType",
  "quantity",
  "printPositions",
  "sizeBreakdown",
  "clientName",
  "phone",
] as const;

export type AssistantMessageRole = "user" | "assistant";

export type AssistantRequiredField = (typeof ASSISTANT_REQUIRED_FIELDS)[number];

export type AssistantAttachment = {
  name: string;
  url: string;
  contentType: string | null;
  size: number | null;
  uploadedAt: string | null;
};

export type AssistantLead = {
  clientName: string | null;
  phone: string | null;
  email: string | null;
  productType: AssistantProductType | null;
  quantity: number | null;
  color: string | null;
  sizes: string[];
  sizeBreakdown: AssistantOrderLine[];
  printPositions: string[];
  printSizes: string[];
  logoReady: boolean | null;
  logoAttachment: AssistantAttachment | null;
  deliveryMethod: "pickup" | "delivery" | null;
  deadline: string | null;
  notes: string | null;
};

export type AssistantOrderLine = {
  color: string | null;
  productType: AssistantProductType | null;
  size: string;
  quantity: number;
};

export type AssistantApprovedLeadSource = {
  lead: AssistantLead;
  status?: string | null;
  sessionMessages?: string[];
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
  learnedProductAliases: Record<AssistantProductType, string[]>;
  learnedProductAliasCount: number;
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
  sizeBreakdown: "size breakdown",
  clientName: "client name",
  phone: "phone number",
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWords(text: string) {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

function singularizeComparable(value: string) {
  if (value.endsWith("ies") && value.length > 4) {
    return `${value.slice(0, -3)}y`;
  }
  if (value.endsWith("es") && /(sh|ch|ss|x|z|o)$/.test(value.slice(0, -2))) {
    return value.slice(0, -2);
  }
  if (value.endsWith("s") && value.length > 3 && !value.endsWith("ss")) {
    return value.slice(0, -1);
  }
  return value;
}

function toComparableAliasKey(value: string) {
  return singularizeComparable(value.toLowerCase().replace(/[^a-z0-9]+/g, ""));
}

function normalizeLearnedAliasPhrase(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s-]+/g, " ").replace(/\s+/g, " ").trim();
}

function buildSlidingPhrases(tokens: string[], maxSize = 3) {
  const phrases = new Set<string>();
  const cleaned = tokens.filter((token) => token && !/^\d+$/.test(token));

  for (let size = 1; size <= maxSize; size += 1) {
    for (let index = 0; index <= cleaned.length - size; index += 1) {
      const slice = cleaned.slice(index, index + size);
      if (!slice.length || slice.every((token) => PRODUCT_ALIAS_STOP_WORDS.has(token))) continue;
      phrases.add(slice.join(" "));
    }
  }

  return Array.from(phrases);
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1).fill(0);

  for (let row = 0; row < left.length; row += 1) {
    current[0] = row + 1;
    for (let column = 0; column < right.length; column += 1) {
      const cost = left[row] === right[column] ? 0 : 1;
      current[column + 1] = Math.min(
        current[column] + 1,
        previous[column + 1] + 1,
        previous[column] + cost
      );
    }
    for (let column = 0; column <= right.length; column += 1) {
      previous[column] = current[column];
    }
  }

  return previous[right.length];
}

function aliasKeysAreClose(left: string, right: string) {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length < 5 || right.length < 5) return false;
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left[0] !== right[0]) return false;
  return levenshteinDistance(left, right) <= 1;
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

function normalizeNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeSize(value: string) {
  return value.trim().toUpperCase();
}

function sortTemplateSizes(values: string[]) {
  return Array.from(new Set(values.map(normalizeSize).filter(Boolean))).sort((left, right) => {
    const leftIndex = SIZE_TEMPLATE_ORDER_INDEX.get(left);
    const rightIndex = SIZE_TEMPLATE_ORDER_INDEX.get(right);
    if (leftIndex !== undefined || rightIndex !== undefined) {
      if (leftIndex === undefined) return 1;
      if (rightIndex === undefined) return -1;
      return leftIndex - rightIndex;
    }
    return left.localeCompare(right);
  });
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

function normalizeOrderLines(value: unknown): AssistantOrderLine[] {
  if (!Array.isArray(value)) return [];

  return mergeOrderLines(
    value
      .map((entry) => {
        const source = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
        const productType = cleanString(source.productType).toLowerCase();
        const color = cleanString(source.color).toLowerCase();
        const size = normalizeSize(cleanString(source.size));
        const quantity = normalizeQuantity(source.quantity);
        return {
          color: color || null,
          productType:
            productType === "t-shirt" || productType === "polo" || productType === "hoodie" || productType === "cap"
              ? (productType as AssistantProductType)
              : null,
          size,
          quantity: quantity || 0,
        };
      })
      .filter((entry) => entry.size && entry.quantity > 0)
  );
}

function getOrderLineKey(line: AssistantOrderLine) {
  return `${line.color || ""}::${line.productType || ""}::${line.size}`;
}

function mergeOrderLines(lines: AssistantOrderLine[]) {
  const map = new Map<string, AssistantOrderLine>();

  lines.forEach((line) => {
    const key = getOrderLineKey(line);
    const existing = map.get(key);
    if (existing) {
      existing.quantity += line.quantity;
    } else {
      map.set(key, { ...line });
    }
  });

  return Array.from(map.values()).sort((left, right) => {
    const byColor = (left.color || "").localeCompare(right.color || "");
    if (byColor !== 0) return byColor;
    const byProduct = (left.productType || "").localeCompare(right.productType || "");
    if (byProduct !== 0) return byProduct;
    return left.size.localeCompare(right.size);
  });
}

function getOrderLineTotal(lines: AssistantOrderLine[]) {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

function formatProductTypeLabel(productType: AssistantProductType | null) {
  if (productType === "t-shirt") return "T-Shirt";
  if (productType === "polo") return "Polo";
  if (productType === "hoodie") return "Hoodie";
  if (productType === "cap") return "Cap";
  return "T-Shirt";
}

function formatOrderLine(line: AssistantOrderLine) {
  const color = line.color ? `${titleCase(line.color)} ` : "";
  const product = formatProductTypeLabel(line.productType);
  return `${color}${product} Size ${line.size} quantity ${line.quantity}`;
}

export function normalizeAssistantAttachment(value: unknown): AssistantAttachment | null {
  if (!value || typeof value !== "object") return null;

  const source = value as Record<string, unknown>;
  const name = cleanString(source.name ?? source.filename);
  const url = cleanString(source.url);
  if (!name || !url) return null;

  return {
    name,
    url,
    contentType: cleanString(source.contentType ?? source.type) || null,
    size: normalizeNullableNumber(source.size),
    uploadedAt: cleanString(source.uploadedAt) || null,
  };
}

function buildSizeTemplateLines(lead: AssistantLead) {
  const lineTotals = new Map<string, number>();
  lead.sizeBreakdown.forEach((line) => {
    lineTotals.set(line.size, (lineTotals.get(line.size) || 0) + line.quantity);
  });

  const sizes = sortTemplateSizes([...lead.sizeBreakdown.map((line) => line.size), ...lead.sizes]);
  const templateSizes = [...sizes];
  for (const fallback of ["S", "M", "L", "XL"]) {
    if (templateSizes.length >= 4) break;
    if (!templateSizes.includes(fallback)) {
      templateSizes.push(fallback);
    }
  }

  const color = lead.color ? titleCase(lead.color) : "Black";
  const product = formatProductTypeLabel(lead.productType);

  return sortTemplateSizes(templateSizes)
    .slice(0, Math.max(4, sizes.length || 0))
    .map((size) => `${color} ${product} Size ${size} quantity ${lineTotals.get(size) || 0}`);
}

function buildSizeBreakdownPrompt(lead: AssistantLead) {
  const capturedTotal = getOrderLineTotal(lead.sizeBreakdown);

  let intro = "Please send the size breakdown one line per variation, like this:";
  if (lead.quantity && capturedTotal > 0 && capturedTotal !== lead.quantity) {
    if (capturedTotal < lead.quantity) {
      intro = `I have size lines for ${capturedTotal} of ${lead.quantity} pieces. Please send the remaining size lines like this:`;
    } else {
      intro = `The size lines add up to ${capturedTotal} pieces while the total quantity is ${lead.quantity}. Please resend them in this format:`;
    }
  }

  return [
    intro,
    "",
    "Copy, edit, and send this size template:",
    "```",
    ...buildSizeTemplateLines(lead),
    "```",
    "Replace each quantity with the real count and delete any size lines you do not need.",
    "",
    "If the design or logo is ready, use the upload button to attach PNG, JPG, PDF, or AI.",
  ].join("\n");
}

function extractOrderLines(
  message: string,
  trainingState?: Pick<AssistantTrainingState, "learnedProductAliases"> | null
) {
  const segments = message
    .split(/\n|;/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const lines = (segments.length ? segments : [message])
    .map((segment) => {
      const sizeMatch = segment.match(/\bsize\s*(xs|s|m|l|xl|2xl|3xl|4xl)\b/i);
      const quantityMatch =
        segment.match(/\b(?:quantity|qty|qte|quality)\s*(\d{1,4})\b/i) ||
        segment.match(/\bx\s*(\d{1,4})\b/i);
      if (!sizeMatch || !quantityMatch) return null;

      const color = Array.from(COLORS).find((candidate) => hasPattern(normalizeWords(segment), candidate)) || null;
      const productType = detectProductType(segment, trainingState);
      const quantity = Number(quantityMatch[1]);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;

      return {
        color,
        productType,
        size: normalizeSize(sizeMatch[1]),
        quantity,
      } satisfies AssistantOrderLine;
    })
    .filter((line): line is AssistantOrderLine => Boolean(line));

  return mergeOrderLines(lines);
}

export function createEmptyLearnedProductAliases(): Record<AssistantProductType, string[]> {
  return {
    "t-shirt": [],
    polo: [],
    hoodie: [],
    cap: [],
  };
}

function getProductPatternCatalog(trainingState?: Pick<AssistantTrainingState, "learnedProductAliases"> | null) {
  return PRODUCT_PATTERNS.map((product) => {
    const patterns = dedupeSorted([
      ...product.patterns,
      ...(trainingState?.learnedProductAliases?.[product.canonical] || []),
    ]);

    return {
      canonical: product.canonical,
      patterns,
      patternKeys: patterns.map(toComparableAliasKey).filter(Boolean),
    };
  });
}

function detectProductType(
  message: string,
  trainingState?: Pick<AssistantTrainingState, "learnedProductAliases"> | null
): AssistantProductType | null {
  const normalized = normalizeWords(message);
  const candidateKeys = buildSlidingPhrases(tokenize(message), 3)
    .map(toComparableAliasKey)
    .filter(Boolean);

  for (const product of getProductPatternCatalog(trainingState)) {
    if (product.patterns.some((pattern) => hasPattern(normalized, pattern))) {
      return product.canonical;
    }

    for (const candidateKey of candidateKeys) {
      if (product.patternKeys.some((patternKey) => patternKey === candidateKey || aliasKeysAreClose(candidateKey, patternKey))) {
        return product.canonical;
      }
    }
  }

  return null;
}

function candidateLooksLikeProductAlias(productType: AssistantProductType, phrase: string) {
  const normalizedPhrase = normalizeLearnedAliasPhrase(phrase);
  const aliasKey = toComparableAliasKey(normalizedPhrase);
  if (!aliasKey || aliasKey.length < 4) return false;
  const words = normalizedPhrase.split(" ").filter(Boolean);
  if (words.length > 3) return false;
  if (words.some((word) => PRODUCT_ALIAS_STOP_WORDS.has(word))) return false;

  const hasOwnHint = PRODUCT_ROOT_HINTS[productType].some(
    (hint) => aliasKey.includes(hint) || aliasKeysAreClose(aliasKey, hint)
  );
  if (!hasOwnHint) return false;

  return !ASSISTANT_PRODUCT_TYPES.some(
    (otherType) =>
      otherType !== productType &&
      PRODUCT_ROOT_HINTS[otherType].some(
        (hint) => aliasKey.includes(hint) || aliasKeysAreClose(aliasKey, hint)
      )
  );
}

function looksLikeStandaloneName(message: string) {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length < 3 || trimmed.length > 40) return false;
  if (/\d|@|https?:\/\//i.test(trimmed)) return false;
  if (!/^[A-Za-z][A-Za-z\s'-]*$/.test(trimmed)) return false;

  const words = trimmed
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z'-]/g, "").toLowerCase())
    .filter(Boolean);

  if (!words.length || words.length > 3) return false;
  if (words.some((word) => word.length < 2)) return false;
  if (words.some((word) => NAME_RESPONSE_STOP_WORDS.has(word))) return false;

  return true;
}

function inferContextualLeadUpdates(lead: AssistantLead, message: string, updates: Partial<AssistantLead>) {
  const nextMissingField = missingAssistantFields(lead)[0];
  if (
    nextMissingField === "clientName" &&
    !lead.clientName &&
    !updates.clientName &&
    !updates.phone &&
    !updates.email &&
    !updates.productType &&
    !updates.quantity &&
    !updates.color &&
    !updates.printPositions?.length &&
    !updates.printSizes?.length &&
    looksLikeStandaloneName(message)
  ) {
    updates.clientName = titleCase(message);
  }

  return updates;
}

function learnProductAliasesFromApprovedLeads(approvedLeads: AssistantApprovedLeadSource[]) {
  const learnedCounts: Record<AssistantProductType, Record<string, number>> = {
    "t-shirt": {},
    polo: {},
    hoodie: {},
    cap: {},
  };
  const builtInKeys = Object.fromEntries(
    PRODUCT_PATTERNS.map((product) => [
      product.canonical,
      new Set(product.patterns.map(toComparableAliasKey)),
    ])
  ) as Record<AssistantProductType, Set<string>>;

  approvedLeads.forEach((source) => {
    if (source.status && source.status !== "approved") return;
    const lead = normalizeAssistantLead(source.lead);
    if (!lead.productType || !source.sessionMessages?.length) return;

    source.sessionMessages.forEach((message) => {
      const lower = message.toLowerCase();
      if (!QUANTITY_CONTEXT_RE.test(lower) && !ORDER_CONTEXT_RE.test(lower)) return;

      buildSlidingPhrases(tokenize(message), 3).forEach((phrase) => {
        const normalizedPhrase = normalizeLearnedAliasPhrase(phrase);
        const aliasKey = toComparableAliasKey(normalizedPhrase);
        if (!aliasKey || builtInKeys[lead.productType!].has(aliasKey)) return;
        if (!candidateLooksLikeProductAlias(lead.productType!, normalizedPhrase)) return;
        incrementCounter(learnedCounts[lead.productType!], normalizedPhrase);
      });
    });
  });

  const learnedAliases = createEmptyLearnedProductAliases();
  ASSISTANT_PRODUCT_TYPES.forEach((productType) => {
    learnedAliases[productType] = Object.entries(learnedCounts[productType])
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 12)
      .map(([alias]) => alias);
  });

  return learnedAliases;
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
    sizeBreakdown: [],
    printPositions: [],
    printSizes: [],
    logoReady: null,
    logoAttachment: null,
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
  lead.sizeBreakdown = normalizeOrderLines(source.sizeBreakdown);
  lead.printPositions = normalizeStringArray(source.printPositions, (value) => value.toLowerCase());
  lead.printSizes = normalizeStringArray(source.printSizes, (value) => value.toLowerCase());
  lead.logoReady = typeof source.logoReady === "boolean" ? source.logoReady : null;
  lead.logoAttachment = normalizeAssistantAttachment(source.logoAttachment);

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
    lead.sizeBreakdown.map(formatOrderLine).join(" "),
    lead.printPositions.join(" "),
    lead.printSizes.join(" "),
    lead.deliveryMethod,
    lead.deadline,
    lead.notes,
  ]
    .filter(Boolean)
    .join(" ");
}

export function extractLeadUpdates(
  message: string,
  trainingState?: Pick<AssistantTrainingState, "learnedProductAliases"> | null
): Partial<AssistantLead> {
  const updates: Partial<AssistantLead> = {};
  const lower = message.toLowerCase();
  const normalized = normalizeWords(message);
  const orderLines = extractOrderLines(message, trainingState);

  const productType = detectProductType(message, trainingState);
  if (productType) {
    updates.productType = productType;
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
  if (orderLines.length) {
    updates.sizeBreakdown = orderLines;
    updates.sizes = dedupeSorted([
      ...(updates.sizes || []),
      ...orderLines.map((line) => line.size),
    ]);
    const total = getOrderLineTotal(orderLines);
    if (total > 0) {
      updates.quantity = total;
    }
    const lineProducts = Array.from(new Set(orderLines.map((line) => line.productType).filter(Boolean)));
    if (lineProducts.length === 1) {
      updates.productType = lineProducts[0] as AssistantProductType;
    }
    const lineColors = Array.from(new Set(orderLines.map((line) => line.color).filter(Boolean)));
    if (lineColors.length === 1) {
      updates.color = lineColors[0] as string;
    }
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
  if (updates.sizeBreakdown) {
    merged.sizeBreakdown = mergeOrderLines([...merged.sizeBreakdown, ...updates.sizeBreakdown]);
    merged.sizes = dedupeSorted(
      [...merged.sizes, ...merged.sizeBreakdown.map((line) => line.size)],
      normalizeSize
    );

    const lineProducts = Array.from(
      new Set(merged.sizeBreakdown.map((line) => line.productType).filter(Boolean))
    ) as AssistantProductType[];
    if (!merged.productType && lineProducts.length === 1) {
      merged.productType = lineProducts[0];
    }

    const lineColors = Array.from(
      new Set(merged.sizeBreakdown.map((line) => line.color).filter(Boolean))
    ) as string[];
    if (!merged.color && lineColors.length === 1) {
      merged.color = lineColors[0];
    }

    const lineTotal = getOrderLineTotal(merged.sizeBreakdown);
    if (lineTotal > 0 && (!lead.quantity || lineTotal >= lead.quantity)) {
      merged.quantity = lineTotal;
    }
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
  if (updates.quantity !== undefined && !updates.sizeBreakdown) merged.quantity = updates.quantity;
  if (updates.color !== undefined) merged.color = updates.color;
  if (updates.logoReady !== undefined) merged.logoReady = updates.logoReady;
  if (updates.logoAttachment !== undefined) merged.logoAttachment = updates.logoAttachment;
  if (updates.deliveryMethod !== undefined) merged.deliveryMethod = updates.deliveryMethod;
  if (updates.deadline !== undefined) merged.deadline = updates.deadline;
  if (updates.notes !== undefined) merged.notes = updates.notes;

  return normalizeAssistantLead(merged);
}

export function missingAssistantFields(lead: AssistantLead) {
  return ASSISTANT_REQUIRED_FIELDS.filter((field) => {
    if (field === "sizeBreakdown") {
      if (!lead.sizeBreakdown.length) return true;
      if (lead.quantity && getOrderLineTotal(lead.sizeBreakdown) !== lead.quantity) return true;
      return false;
    }
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
    if (lead.logoAttachment) {
      return 'Great. I have the main details and the logo file. Type "summary" to review the lead or use "Submit lead" in admin.';
    }
    return 'Great. I have the main details. If the design or logo is ready, use the upload button to attach PNG, JPG, PDF, or AI. Type "summary" to review the lead or use "Submit lead" in admin.';
  }

  const prompts: Record<AssistantRequiredField, string> = {
    productType: "What do you want: T-shirt, polo, hoodie, or cap?",
    quantity: "How many pieces do you need?",
    printPositions: "Where do you want the print: front left chest, front center, back, or sleeve?",
    sizeBreakdown: buildSizeBreakdownPrompt(lead),
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
  if (lead.productType && lead.logoReady !== false) {
    suggestions.push("If the design or logo is ready, upload it as PNG, JPG, PDF, or AI.");
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
    ["Size breakdown", lead.sizeBreakdown.map(formatOrderLine).join(" | ") || null],
    ["Print positions", lead.printPositions.join(", ") || null],
    ["Print sizes", lead.printSizes.join(", ") || null],
    ["Logo ready", lead.logoReady === null ? null : lead.logoReady ? "Yes" : "No"],
    ["Logo file", lead.logoAttachment?.name || null],
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
  attachment?: AssistantAttachment | null;
  approvedLeads?: AssistantApprovedLeadSource[];
  knowledgeItems?: AssistantKnowledgeSource[];
  trainingState?: AssistantTrainingState | null;
}): AssistantChatResult {
  const updates = inferContextualLeadUpdates(
    input.lead,
    input.message,
    extractLeadUpdates(input.message, input.trainingState)
  );
  const attachment = normalizeAssistantAttachment(input.attachment);
  const lead = mergeAssistantLeadUpdates(input.lead, {
    ...updates,
    ...(attachment
      ? {
          logoReady: true,
          logoAttachment: attachment,
        }
      : {}),
  });
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
  const learnedProductAliases = learnProductAliasesFromApprovedLeads(approvedLeads);

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
    learnedProductAliases,
    learnedProductAliasCount: Object.values(learnedProductAliases).reduce(
      (total, aliases) => total + aliases.length,
      0
    ),
  };
}
