import type {
  AssistantEntityCandidate,
  AssistantEntityConflict,
  AssistantEntityExtractionResult,
  AssistantEntityKey,
  AssistantLead,
  AssistantOrderLine,
  AssistantProductType,
} from "./types";
import { clamp, cleanString, fuzzySimilarity, normalizeText, normalizeWhitespace, titleCase, tokenize, unique } from "./utils";

const PHONE_RE = /(?:\+?230)?[\s-]?([2455789]\d{7})\b/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const NAME_RE =
  /(?:my name is|i am|i'm|name\s*:)\s+([A-Za-z][A-Za-z\s'&.-]{1,50}?)(?=\s+(?:and\b|phone\b|email\b|deadline\b)|$)/i;
const COMPANY_RE =
  /(?:company(?: name)? is|from|for|business(?: name)? is|company\s*:)\s+([A-Za-z0-9][A-Za-z0-9\s&.,'-]{2,60}?)(?=\s+(?:deadline\b|phone\b|email\b|logo\b)|$)/i;
const ABSOLUTE_DATE_RE = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/i;
const RELATIVE_DATE_RE =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|next week|this week|next monday|next tuesday|next wednesday|next thursday|next friday)\b/i;
const ORDER_LINE_RE =
  /Product:\s*([A-Za-z -]+)\s+Colour:\s*([A-Za-z]+)\s+Size:\s*([A-Za-z0-9]+)\s+Quantity:\s*(\d+)/gi;
const FREEFORM_SIZE_RE = /\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(xs|s|m|l|xl|xxl|2xl|xxxl|3xl|xxxxl|4xl)\b/gi;

const PRODUCT_SEED_ALIASES: Record<AssistantProductType, string[]> = {
  "t-shirt": ["tshirt", "tshirts", "t shirt", "t shirts", "tee", "tees", "t-shirt", "t-shirts"],
  polo: ["polo", "polos", "polo shirt", "polo shirts", "poloshirt", "poloshirts"],
  hoodie: ["hoodie", "hoodies"],
  cap: ["cap", "caps", "hat", "hats"],
};

const COLOR_ALIASES = {
  black: ["black", "blk"],
  white: ["white", "wht"],
  navy: ["navy", "navy blue"],
  blue: ["blue", "blu"],
  red: ["red"],
  green: ["green"],
  yellow: ["yellow"],
  orange: ["orange"],
  grey: ["grey", "gray"],
  pink: ["pink"],
  purple: ["purple"],
  maroon: ["maroon"],
  beige: ["beige"],
} as const;

const PRINT_POSITION_ALIASES = {
  "front left chest": ["front left chest", "left chest", "left logo", "logo on chest"],
  "front center": ["front center", "center front", "big front", "front"],
  back: ["back", "back print", "rear", "big back"],
  sleeve: ["sleeve", "arm", "sleeves"],
} as const;

const PRINT_TYPE_ALIASES = {
  "screen printing": ["screen printing", "screen print", "silk screen"],
  dtf: ["dtf", "direct to film"],
  vinyl: ["vinyl", "heat transfer vinyl", "htv"],
  embroidery: ["embroidery", "embroidered"],
  sublimation: ["sublimation", "sublimated"],
} as const;

const SIZE_ALIASES = new Map([
  ["xs", "XS"],
  ["s", "S"],
  ["m", "M"],
  ["l", "L"],
  ["xl", "XL"],
  ["xxl", "2XL"],
  ["2xl", "2XL"],
  ["xxxl", "3XL"],
  ["3xl", "3XL"],
  ["xxxxl", "4XL"],
  ["4xl", "4XL"],
]);

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const NAME_STOP_WORDS = new Set([
  "back",
  "black",
  "blue",
  "cap",
  "center",
  "delivery",
  "front",
  "hoodie",
  "logo",
  "polo",
  "shirt",
  "tshirt",
  "summary",
  "upload",
]);

function numberFromToken(value: string) {
  const trimmed = normalizeText(value);
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (trimmed in NUMBER_WORDS) return NUMBER_WORDS[trimmed];
  return null;
}

function normalizeSize(value: string) {
  return SIZE_ALIASES.get(normalizeText(value)) || value.toUpperCase();
}

function scoreAliasMatch(source: string, alias: string) {
  const normalizedSource = normalizeText(source);
  const normalizedAlias = normalizeText(alias);
  if (!normalizedSource || !normalizedAlias) return 0;
  if (normalizedSource.includes(normalizedAlias)) return 0.98;
  return fuzzySimilarity(normalizedSource, normalizedAlias);
}

function pushCandidate(
  map: Partial<Record<AssistantEntityKey, AssistantEntityCandidate[]>>,
  candidate: AssistantEntityCandidate
) {
  if (!map[candidate.field]) map[candidate.field] = [];
  map[candidate.field]!.push(candidate);
}

function rankCandidates(candidates: AssistantEntityCandidate[]) {
  return [...candidates].sort((left, right) => {
    const confidenceDiff = right.confidence - left.confidence;
    if (confidenceDiff !== 0) return confidenceDiff;
    return String(left.canonicalValue).localeCompare(String(right.canonicalValue));
  });
}

function detectConflicts(
  field: AssistantEntityKey,
  candidates: AssistantEntityCandidate[] | undefined
): AssistantEntityConflict[] {
  if (!candidates || candidates.length < 2) return [];
  const ranked = rankCandidates(candidates);
  const top = ranked[0];
  const competing = ranked.filter(
    (candidate) =>
      JSON.stringify(candidate.canonicalValue) !== JSON.stringify(top.canonicalValue) &&
      top.confidence - candidate.confidence <= 0.12
  );
  if (!competing.length) return [];
  return [
    {
      field,
      values: [top.canonicalValue, ...competing.map((candidate) => candidate.canonicalValue)],
      explanation: `Multiple plausible ${field.replace(/_/g, " ")} values were detected with close confidence scores.`,
    },
  ];
}

function bestAliasCandidates<T extends string>(
  field: AssistantEntityKey,
  message: string,
  entries: Record<T, readonly string[]>
) {
  const normalized = normalizeText(message);
  const candidates: AssistantEntityCandidate[] = [];

  (Object.keys(entries) as T[]).forEach((canonical) => {
    const aliases = entries[canonical];
    aliases.forEach((alias) => {
      const score = scoreAliasMatch(normalized, alias);
      if (score >= 0.82) {
        candidates.push({
          field,
          value: canonical,
          canonicalValue: canonical,
          confidence: clamp(score),
          matchedText: alias,
          alias,
          strategy: score >= 0.97 ? "heuristic" : "fuzzy",
        });
      }
    });
  });

  return rankCandidates(candidates);
}

function extractSizeBreakdown(message: string, lead: AssistantLead | null) {
  const lines: AssistantOrderLine[] = [];

  for (const match of message.matchAll(ORDER_LINE_RE)) {
    const productRaw = cleanString(match[1]).toLowerCase();
    const colorRaw = cleanString(match[2]).toLowerCase();
    const sizeRaw = cleanString(match[3]);
    const quantityRaw = Number(match[4]);

    let productType: AssistantProductType | null = null;
    if (productRaw.includes("polo")) productType = "polo";
    else if (productRaw.includes("hoodie")) productType = "hoodie";
    else if (productRaw.includes("cap")) productType = "cap";
    else if (productRaw) productType = "t-shirt";

    lines.push({
      color: colorRaw || lead?.color || null,
      productType: productType || lead?.productType || null,
      size: normalizeSize(sizeRaw),
      quantity: quantityRaw,
    });
  }

  if (lines.length) {
    return lines.sort((left, right) => left.size.localeCompare(right.size));
  }

  const freeformMatches: AssistantOrderLine[] = [];
  for (const match of message.matchAll(FREEFORM_SIZE_RE)) {
    const quantity = numberFromToken(match[1]);
    const size = normalizeSize(match[2]);
    if (quantity === null || !size) continue;
    freeformMatches.push({
      color: lead?.color || "black",
      productType: lead?.productType || "t-shirt",
      size,
      quantity,
    });
  }

  return freeformMatches.sort((left, right) => left.size.localeCompare(right.size));
}

function detectQuantity(message: string, sizeBreakdown: AssistantOrderLine[]) {
  if (sizeBreakdown.length) {
    return {
      quantity: sizeBreakdown.reduce((total, line) => total + line.quantity, 0),
      confidence: 0.99,
      matchedText: "size breakdown total",
      strategy: "derived" as const,
    };
  }

  const normalized = normalizeText(message);
  const explicit = normalized.match(/\b(?:need|want|order|quote|for)\s+(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/);
  if (explicit) {
    const quantity = numberFromToken(explicit[1]);
    if (quantity !== null) {
      return { quantity, confidence: 0.92, matchedText: explicit[1], strategy: "heuristic" as const };
    }
  }

  const loose = normalized.match(/\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:pcs|pieces|shirts|tshirts|tshirt|polos|hoodies|caps)\b/);
  if (loose) {
    const quantity = numberFromToken(loose[1]);
    if (quantity !== null) {
      return { quantity, confidence: 0.88, matchedText: loose[1], strategy: "heuristic" as const };
    }
  }

  return null;
}

function detectPlainName(message: string, lead: AssistantLead | null) {
  if (lead?.clientName) return null;
  const trimmed = normalizeWhitespace(message);
  if (!trimmed || trimmed.length > 48 || /\d/.test(trimmed) || trimmed.includes("@")) return null;
  const tokens = tokenize(trimmed);
  if (!tokens.length || tokens.some((token) => NAME_STOP_WORDS.has(token))) return null;
  if (tokens.length > 4) return null;
  return titleCase(trimmed);
}

export function extractEntities(
  message: string,
  options?: {
    lead?: AssistantLead | null;
    aliasMap?: Record<AssistantProductType, string[]>;
  }
): AssistantEntityExtractionResult {
  const lead = options?.lead || null;
  const aliasMap = options?.aliasMap || PRODUCT_SEED_ALIASES;
  const normalized = normalizeText(message);
  const candidates: Partial<Record<AssistantEntityKey, AssistantEntityCandidate[]>> = {};
  const fields: AssistantEntityExtractionResult["fields"] = {};

  const sizeBreakdown = extractSizeBreakdown(message, lead);
  if (sizeBreakdown.length) {
    const sizeCandidate: AssistantEntityCandidate = {
      field: "sizes",
      value: unique(sizeBreakdown.map((line) => line.size)),
      canonicalValue: unique(sizeBreakdown.map((line) => line.size)),
      confidence: 0.98,
      matchedText: sizeBreakdown.map((line) => `${line.quantity} ${line.size}`).join(", "),
      strategy: "template",
    };
    fields.sizes = sizeCandidate;
    pushCandidate(candidates, sizeCandidate);
  }

  const productCandidates = bestAliasCandidates("product", message, {
    "t-shirt": unique([...(aliasMap["t-shirt"] || []), ...PRODUCT_SEED_ALIASES["t-shirt"]]),
    polo: unique([...(aliasMap.polo || []), ...PRODUCT_SEED_ALIASES.polo]),
    hoodie: unique([...(aliasMap.hoodie || []), ...PRODUCT_SEED_ALIASES.hoodie]),
    cap: unique([...(aliasMap.cap || []), ...PRODUCT_SEED_ALIASES.cap]),
  });
  if (productCandidates[0]) fields.product = productCandidates[0];
  productCandidates.forEach((candidate) => pushCandidate(candidates, candidate));

  const quantityCandidate = detectQuantity(message, sizeBreakdown);
  if (quantityCandidate) {
    const candidate: AssistantEntityCandidate = {
      field: "quantity",
      value: quantityCandidate.quantity,
      canonicalValue: quantityCandidate.quantity,
      confidence: quantityCandidate.confidence,
      matchedText: quantityCandidate.matchedText,
      strategy: quantityCandidate.strategy,
    };
    fields.quantity = candidate;
    pushCandidate(candidates, candidate);
  }

  const colorCandidates = bestAliasCandidates("color", message, COLOR_ALIASES);
  if (colorCandidates[0]) fields.color = colorCandidates[0];
  colorCandidates.forEach((candidate) => pushCandidate(candidates, candidate));

  const positionCandidates = bestAliasCandidates("print_position", message, PRINT_POSITION_ALIASES);
  if (positionCandidates.length) {
    const grouped = unique(positionCandidates.map((candidate) => String(candidate.canonicalValue)));
    fields.print_position = {
      field: "print_position",
      value: grouped,
      canonicalValue: grouped,
      confidence: clamp(positionCandidates[0].confidence),
      matchedText: positionCandidates.map((candidate) => candidate.matchedText).join(", "),
      strategy: positionCandidates.some((candidate) => candidate.strategy === "fuzzy") ? "fuzzy" : "heuristic",
    };
    positionCandidates.forEach((candidate) => pushCandidate(candidates, candidate));
  }

  const printTypeCandidates = bestAliasCandidates("print_type", message, PRINT_TYPE_ALIASES);
  if (printTypeCandidates[0]) fields.print_type = printTypeCandidates[0];
  printTypeCandidates.forEach((candidate) => pushCandidate(candidates, candidate));

  const phoneMatch = PHONE_RE.exec(message);
  if (phoneMatch) {
    const candidate: AssistantEntityCandidate = {
      field: "phone",
      value: phoneMatch[1],
      canonicalValue: phoneMatch[1],
      confidence: 0.99,
      matchedText: phoneMatch[0],
      strategy: "regex",
    };
    fields.phone = candidate;
    pushCandidate(candidates, candidate);
  }

  const emailMatch = EMAIL_RE.exec(message);
  if (emailMatch) {
    const email = emailMatch[0].toLowerCase();
    const candidate: AssistantEntityCandidate = {
      field: "email",
      value: email,
      canonicalValue: email,
      confidence: 0.99,
      matchedText: emailMatch[0],
      strategy: "regex",
    };
    fields.email = candidate;
    pushCandidate(candidates, candidate);
  }

  const nameMatch = NAME_RE.exec(message);
  const plainName = !nameMatch ? detectPlainName(message, lead) : null;
  if (nameMatch || plainName) {
    const candidate: AssistantEntityCandidate = {
      field: "customer_name",
      value: titleCase(nameMatch ? nameMatch[1] : plainName || ""),
      canonicalValue: titleCase(nameMatch ? nameMatch[1] : plainName || ""),
      confidence: nameMatch ? 0.93 : 0.74,
      matchedText: nameMatch ? nameMatch[0] : plainName || "",
      strategy: nameMatch ? "regex" : "heuristic",
    };
    fields.customer_name = candidate;
    pushCandidate(candidates, candidate);
  }

  const companyMatch = COMPANY_RE.exec(message);
  if (companyMatch) {
    const company = titleCase(companyMatch[1]);
    const candidate: AssistantEntityCandidate = {
      field: "company_name",
      value: company,
      canonicalValue: company,
      confidence: 0.82,
      matchedText: companyMatch[0],
      strategy: "regex",
    };
    fields.company_name = candidate;
    pushCandidate(candidates, candidate);
  }

  const relativeDeadlineMatch = RELATIVE_DATE_RE.exec(normalized);
  const absoluteDeadlineMatch = ABSOLUTE_DATE_RE.exec(message);
  if (absoluteDeadlineMatch || relativeDeadlineMatch) {
    const deadline = normalizeWhitespace((absoluteDeadlineMatch || relativeDeadlineMatch)?.[0] || "");
    const candidate: AssistantEntityCandidate = {
      field: "deadline",
      value: deadline,
      canonicalValue: deadline.toLowerCase(),
      confidence: absoluteDeadlineMatch ? 0.97 : 0.9,
      matchedText: deadline,
      strategy: absoluteDeadlineMatch ? "regex" : "heuristic",
    };
    fields.deadline = candidate;
    pushCandidate(candidates, candidate);
  }

  const conflicts = Object.entries(candidates).flatMap(([field, fieldCandidates]) =>
    detectConflicts(field as AssistantEntityKey, fieldCandidates)
  );

  return {
    fields,
    sizeBreakdown,
    candidates,
    conflicts,
  };
}
