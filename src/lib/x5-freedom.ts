export type X5FreedomMoneyRule = "MOTHER" | "CHILD";

export type X5FreedomGoal = {
  id: string;
  name: string;
  target: string;
  actual: string;
  rule: X5FreedomMoneyRule;
};

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
  goals: X5FreedomGoal[];
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
  goals: [],
};

export function normalizeX5FreedomPlan(value: unknown): X5FreedomPlan {
  const record = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};

  const stringValues = Object.fromEntries(
    Object.keys(EMPTY_X5_FREEDOM_PLAN)
      .filter((key) => key !== "goals")
      .map((key) => [
        key,
        typeof record[key] === "string" ? record[key] : "",
      ])
  ) as Omit<X5FreedomPlan, "goals">;

  const goals = Array.isArray(record.goals)
    ? record.goals.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const goal = entry as Record<string, unknown>;
        if (typeof goal.id !== "string" || !goal.id) return [];
        return [{
          id: goal.id,
          name: typeof goal.name === "string" ? goal.name : "",
          target: typeof goal.target === "string" ? goal.target : "",
          actual: typeof goal.actual === "string" ? goal.actual : "",
          rule: goal.rule === "CHILD" ? "CHILD" as const : "MOTHER" as const,
        }];
      })
    : [];

  return { ...stringValues, goals };
}

export function calculateX5FreedomGoal(goal: X5FreedomGoal) {
  const target = toNumber(goal.target);
  const actual = toNumber(goal.actual);
  return {
    target,
    actual,
    progressPercent: target ? Math.min(Math.round((actual / target) * 100), 100) : 0,
    remaining: Math.max(target - actual, 0),
  };
}

export function calculateX5FreedomGoalSummary(goals: X5FreedomGoal[]) {
  let motherProtected = 0;
  let childUsable = 0;
  let totalTarget = 0;
  let totalActual = 0;

  for (const goal of goals) {
    const amounts = calculateX5FreedomGoal(goal);
    totalTarget += amounts.target;
    totalActual += amounts.actual;
    if (goal.rule === "CHILD") childUsable += amounts.actual;
    else motherProtected += amounts.actual;
  }

  return {
    motherProtected,
    childUsable,
    totalTarget,
    totalActual,
    overallProgressPercent: totalTarget
      ? Math.min(Math.round((totalActual / totalTarget) * 100), 100)
      : 0,
  };
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
