export type PaymentEvidenceVerdict = "likely_payment" | "needs_review" | "not_payment";

export type PaymentEvidenceAssessment = {
  verdict: PaymentEvidenceVerdict;
  confidence: number;
  amount: number | null;
  reference: string;
  date: string;
  signals: string[];
};

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function extractAmount(text: string) {
  const raw = firstMatch(text, [
    /(?:amount|montant|total|mur|rs\.?)\s*[:\-]?\s*(?:mur|rs\.?)?\s*([\d][\d\s,.]*)/i,
    /(?:mur|rs\.?)\s*([\d][\d\s,.]*)/i,
  ]);
  if (!raw) return null;

  const normalized = raw.replace(/\s/g, "").replace(/,(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
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
