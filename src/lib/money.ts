const MONEY_LOCALE = "en-US";
const MONEY_FORMAT_OPTIONS = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
} as const;

function toFiniteNumber(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function formatMoneyValue(value: number | null | undefined) {
  return toFiniteNumber(value).toLocaleString(MONEY_LOCALE, MONEY_FORMAT_OPTIONS);
}

export function formatMoney(value: number | null | undefined, currency = "Rs") {
  const amount = toFiniteNumber(value);
  const sign = amount < 0 ? "-" : "";
  return `${sign}${currency} ${formatMoneyValue(Math.abs(amount))}`;
}
