export type X5FreedomPlan = {
  vision: string;
  personalMonthlyCost: string;
  businessMonthlyCost: string;
  lifestyleMonthlyCost: string;
  safetyBufferPercent: string;
  independentMonthlyIncome: string;
  currentMonthlyProfit: string;
  cashReserve: string;
  targetRunwayMonths: string;
  currentWeeklyHours: string;
  targetWeeklyHours: string;
  targetDate: string;
  notes: string;
};

export const EMPTY_X5_FREEDOM_PLAN: X5FreedomPlan = {
  vision: "",
  personalMonthlyCost: "",
  businessMonthlyCost: "",
  lifestyleMonthlyCost: "",
  safetyBufferPercent: "",
  independentMonthlyIncome: "",
  currentMonthlyProfit: "",
  cashReserve: "",
  targetRunwayMonths: "",
  currentWeeklyHours: "",
  targetWeeklyHours: "",
  targetDate: "",
  notes: "",
};

export function normalizeX5FreedomPlan(value: unknown): X5FreedomPlan {
  const record = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};

  return Object.fromEntries(
    Object.keys(EMPTY_X5_FREEDOM_PLAN).map((key) => [
      key,
      typeof record[key] === "string" ? record[key] : "",
    ])
  ) as X5FreedomPlan;
}

function toNumber(value: string) {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function calculateX5FreedomPlan(plan: X5FreedomPlan) {
  const baseMonthlyCost =
    toNumber(plan.personalMonthlyCost) +
    toNumber(plan.businessMonthlyCost) +
    toNumber(plan.lifestyleMonthlyCost);
  const safetyMultiplier = 1 + toNumber(plan.safetyBufferPercent) / 100;
  const freedomMonthlyTarget = baseMonthlyCost * safetyMultiplier;
  const independentMonthlyIncome = toNumber(plan.independentMonthlyIncome);
  const cashReserve = toNumber(plan.cashReserve);
  const targetRunwayMonths = toNumber(plan.targetRunwayMonths);
  const currentWeeklyHours = toNumber(plan.currentWeeklyHours);
  const targetWeeklyHours = toNumber(plan.targetWeeklyHours);

  return {
    baseMonthlyCost,
    freedomMonthlyTarget,
    monthlyGap: Math.max(freedomMonthlyTarget - independentMonthlyIncome, 0),
    incomeCoveragePercent: freedomMonthlyTarget
      ? Math.min(Math.round((independentMonthlyIncome / freedomMonthlyTarget) * 100), 100)
      : 0,
    currentRunwayMonths: freedomMonthlyTarget
      ? cashReserve / freedomMonthlyTarget
      : 0,
    targetCashReserve: freedomMonthlyTarget * targetRunwayMonths,
    weeklyHoursReclaimed: Math.max(currentWeeklyHours - targetWeeklyHours, 0),
  };
}
