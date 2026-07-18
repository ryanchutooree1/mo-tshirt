export type PaymentEvidenceVerdict = "likely_payment" | "needs_review" | "not_payment";

export type PaymentEvidenceAssessment = {
  verdict: PaymentEvidenceVerdict;
  confidence: number;
  amount: number | null;
  reference: string;
  date: string;
  signals: string[];
};

export type PaymentAmountComparison = {
  status: "match" | "overpaid" | "underpaid" | "unavailable";
  expectedAmount: number | null;
  detectedAmount: number | null;
  difference: number | null;
};

export function roundCurrencyAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round((Math.abs(parsed) + Number.EPSILON) * 100) / 100 : null;
}

export function comparePaymentAmount(
  detectedValue: unknown,
  expectedValue: unknown,
  tolerance = 0.01
): PaymentAmountComparison {
  const detectedAmount = roundCurrencyAmount(detectedValue);
  const expectedAmount = roundCurrencyAmount(expectedValue);
  if (detectedAmount === null || expectedAmount === null || expectedAmount <= 0) {
    return { status: "unavailable", expectedAmount, detectedAmount, difference: null };
  }

  const difference = roundCurrencyAmount(detectedAmount - expectedAmount) ?? 0;
  if (Math.abs(detectedAmount - expectedAmount) <= tolerance) {
    return { status: "match", expectedAmount, detectedAmount, difference: 0 };
  }
  return {
    status: detectedAmount > expectedAmount ? "overpaid" : "underpaid",
    expectedAmount,
    detectedAmount,
    difference,
  };
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function extractAmount(text: string) {
  const raw = firstMatch(text, [
    /(?:amount|montant|total)\s*[:\-]?\s*(?:mur|rs\.?)?\s*[-+]?([\d][\d,.]*)/i,
    /(?:mur|rs\.?)\s*[:\-]?\s*[-+]?([\d][\d,.]*)/i,
  ]);
  if (!raw) return null;

  const compact = raw.replace(/[^\d,.]/g, "");
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  let normalized = compact;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = compact.split(thousandsSeparator).join("");
    if (decimalSeparator === ",") normalized = normalized.replace(",", ".");
  } else {
    const separator = lastComma >= 0 ? "," : lastDot >= 0 ? "." : "";
    if (separator) {
      const parts = compact.split(separator);
      const fraction = parts.at(-1) || "";
      const integer = parts.slice(0, -1).join("");
      const looksLikeThousands = parts.length === 2 && integer.length <= 3 && fraction.length === 3;
      normalized = looksLikeThousands
        ? `${integer}${fraction}`
        : `${integer}.${fraction}`;
    }
  }

  const value = roundCurrencyAmount(Number.parseFloat(normalized));
  return value !== null && value > 0 ? value : null;
}

export function assessPaymentEvidence(rawText: string): PaymentEvidenceAssessment {
  const text = rawText.replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  const signals: string[] = [];
  let score = 0;

  if (/payment successful|transfer successful|transaction successful|paiement r[eé]ussi|virement effectu[eé]|completed|paid/.test(lower)) {
    score += 4;
    signals.push("success wording found");
  }
  if (/payment|transfer|transaction|paiement|virement|bank|banque/.test(lower)) {
    score += 2;
    signals.push("payment wording found");
  }
  if (/reference|transaction id|ref\.?|r[eé]f[eé]rence/.test(lower)) {
    score += 2;
    signals.push("transaction reference label found");
  }
  if (/failed|declined|cancelled|canceled|rejected|[eé]chou[eé]|refus[eé]/.test(lower)) {
    score -= 6;
    signals.push("failure wording found");
  }

  const amount = extractAmount(text);
  if (amount !== null) {
    score += 2;
    signals.push("amount found");
  }

  const reference = firstMatch(text, [
    /(?:transaction id|reference|ref\.?|r[eé]f[eé]rence)\s*[:#\-]?\s*([a-z0-9-]{5,})/i,
  ]);
  if (reference) score += 1;

  const date = firstMatch(text, [
    /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}(?:\s+\d{1,2}:\d{2})?)\b/,
    /\b(\d{4}[/-]\d{1,2}[/-]\d{1,2}(?:\s+\d{1,2}:\d{2})?)\b/,
  ]);
  if (date) {
    score += 1;
    signals.push("date found");
  }

  const verdict: PaymentEvidenceVerdict = score >= 7
    ? "likely_payment"
    : score >= 3
      ? "needs_review"
      : "not_payment";

  return {
    verdict,
    confidence: Math.max(0, Math.min(100, Math.round((score / 11) * 100))),
    amount,
    reference,
    date,
    signals,
  };
}
