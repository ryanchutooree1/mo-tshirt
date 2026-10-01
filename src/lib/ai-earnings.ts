/** Private, manually recorded cash evidence. No estimates or automatic attribution. */
export const TRACKING_START = "2026-10-01";
export const TRACKING_TIME_ZONE = "Indian/Mauritius";
export const CURRENCIES = ["MUR", "USD", "EUR", "GBP", "ZAR", "AUD", "CAD", "INR"] as const;
export type EarningsCurrency = (typeof CURRENCIES)[number];
export type MoneyEvent = { id: string; date: string; amountMinor: number; note: string };
export type AiEarningEntry = {
  id: string;
  project: string;
  client: string;
  description: string;
  aiContribution: string;
  currency: EarningsCurrency;
  agreedAmountMinor: number | null;
  costsComplete: boolean;
  archived: boolean;
  payments: MoneyEvent[];
  costs: MoneyEvent[];
};
export type AiEarningsLedger = { schemaVersion: 1; entries: AiEarningEntry[] };
export const EMPTY_AI_EARNINGS_LEDGER: AiEarningsLedger = { schemaVersion: 1, entries: [] };
export const MAX_AMOUNT_MINOR = 10_000_000_000;

export function todayInMauritius(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TRACKING_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isEarningsDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** All supported currencies have two decimal places; integer arithmetic avoids rounding drift. */
export function moneyToMinor(value: string): number | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, decimals = ""] = value.trim().split(".");
  const minor = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor >= 0 && minor <= MAX_AMOUNT_MINOR ? minor : null;
}

export function formatEarningsMoney(minor: number, currency: EarningsCurrency) {
  return new Intl.NumberFormat("en-MU", { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
}

function record(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key))) throw new Error(`${label} contains unsupported fields.`);
  return result;
}
function text(value: unknown, label: string, max: number, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error(`${label} must be ${required ? "non-empty and " : ""}at most ${max} characters.`);
  return value.trim();
}
function id(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new Error("Use a valid stable record ID.");
  return value;
}
function amount(value: unknown, label: string, allowZero = false) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > MAX_AMOUNT_MINOR) throw new Error(`${label} must be a ${allowZero ? "non-negative" : "positive"} amount in minor units, at most ${MAX_AMOUNT_MINOR}.`);
  return value;
}
function flag(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new Error(`${label} must be true or false.`);
  return value;
}
function events(value: unknown, label: string, seen: Set<string>): MoneyEvent[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error(`${label} must contain at most 100 records.`);
  return value.map((input) => {
    const row = record(input, ["id", "date", "amountMinor", "note"], label);
    const eventId = id(row.id);
    if (seen.has(eventId)) throw new Error("Duplicate record IDs are not allowed.");
    seen.add(eventId);
    if (!isEarningsDate(row.date)) throw new Error(`${label} needs a real date (YYYY-MM-DD).`);
    return { id: eventId, date: row.date, amountMinor: amount(row.amountMinor, label), note: text(row.note, "Payment or cost note", 500) };
  });
}
export function validateAiEarningsLedger(value: unknown): AiEarningsLedger {
  const source = record(value, ["schemaVersion", "entries"], "Ledger");
  if (source.schemaVersion !== 1) throw new Error("Unsupported ledger version.");
  if (!Array.isArray(source.entries) || source.entries.length > 500) throw new Error("The ledger supports up to 500 projects, including archived projects.");
  const seen = new Set<string>();
  return { schemaVersion: 1, entries: source.entries.map((input) => {
    const row = record(input, ["id", "project", "client", "description", "aiContribution", "currency", "agreedAmountMinor", "costsComplete", "archived", "payments", "costs"], "Project");
    const entryId = id(row.id);
    if (seen.has(entryId)) throw new Error("Duplicate record IDs are not allowed.");
    seen.add(entryId);
    if (!CURRENCIES.includes(row.currency as EarningsCurrency)) throw new Error("Choose a supported currency.");
    return {
      id: entryId, project: text(row.project, "Project", 160, true), client: text(row.client, "Client", 160),
      description: text(row.description, "What was sold", 2000, true), aiContribution: text(row.aiContribution, "How AI helped", 2000, true),
      currency: row.currency as EarningsCurrency, agreedAmountMinor: row.agreedAmountMinor === null ? null : amount(row.agreedAmountMinor, "Agreed total", true),
      costsComplete: flag(row.costsComplete, "Costs complete"), archived: flag(row.archived, "Archived"),
      payments: events(row.payments, "Payments", seen), costs: events(row.costs, "Costs", seen),
    };
  }) };
}
export function entryTotals(entry: AiEarningEntry, throughDate: string) {
  const inPeriod = (event: MoneyEvent) => event.date >= TRACKING_START && event.date <= throughDate;
  const sum = (rows: MoneyEvent[]) => rows.reduce((total, event) => total + event.amountMinor, 0);
  const receivedMinor = sum(entry.payments.filter(inPeriod));
  const costMinor = sum(entry.costs.filter(inPeriod));
  const allReceived = sum(entry.payments.filter((event) => event.date <= throughDate));
  return { receivedMinor, costMinor, netMinor: receivedMinor - costMinor, pendingMinor: entry.agreedAmountMinor === null ? 0 : Math.max(0, entry.agreedAmountMinor - allReceived) };
}
export function summarizeAiEarnings(ledger: AiEarningsLedger, throughDate: string) {
  if (!isEarningsDate(throughDate)) throw new Error("Use a real summary date.");
  const groups = new Map<EarningsCurrency, { currency: EarningsCurrency; receivedMinor: number; costMinor: number; netMinor: number; pendingMinor: number; costsComplete: boolean; entryCount: number }>();
  for (const entry of ledger.entries) {
    if (entry.archived) continue;
    const summary = groups.get(entry.currency) ?? { currency: entry.currency, receivedMinor: 0, costMinor: 0, netMinor: 0, pendingMinor: 0, costsComplete: true, entryCount: 0 };
    const totals = entryTotals(entry, throughDate);
    summary.receivedMinor += totals.receivedMinor;
    summary.costMinor += totals.costMinor;
    summary.netMinor += totals.netMinor;
    summary.pendingMinor += totals.pendingMinor;
    summary.costsComplete = summary.costsComplete && entry.costsComplete;
    summary.entryCount += 1;
    groups.set(entry.currency, summary);
  }
  return Array.from(groups.values()).sort((a, b) => CURRENCIES.indexOf(a.currency) - CURRENCIES.indexOf(b.currency));
}
