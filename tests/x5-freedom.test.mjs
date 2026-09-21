import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateX5FreedomGoal,
  calculateX5FreedomGoalSummary,
  calculateX5FreedomPlan,
  EMPTY_X5_FREEDOM_PLAN,
  normalizeX5FreedomPlan,
} from "../src/lib/x5-freedom.ts";

test("Freedom Plan starts blank for Ryan to complete", () => {
  assert.equal(
    Object.entries(EMPTY_X5_FREEDOM_PLAN).every(([key, value]) =>
      key === "goals" ? Array.isArray(value) && value.length === 0 : value === ""
    ),
    true
  );
});

test("Freedom Plan calculates money, runway, and time targets", () => {
  const result = calculateX5FreedomPlan({
    ...EMPTY_X5_FREEDOM_PLAN,
    personalMonthlyCost: "30000",
    businessMonthlyCost: "20000",
    lifestyleMonthlyCost: "10000",
    safetyBufferPercent: "20",
    independentMonthlyIncome: "50000",
    cashReserve: "144000",
    targetRunwayMonths: "6",
    currentWeeklyHours: "55",
    targetWeeklyHours: "25",
  });

  assert.equal(result.freedomMonthlyTarget, 72000);
  assert.equal(result.monthlyGap, 22000);
  assert.equal(result.incomeCoveragePercent, 69);
  assert.equal(result.currentRunwayMonths, 2);
  assert.equal(result.targetCashReserve, 432000);
  assert.equal(result.weeklyHoursReclaimed, 30);
});

test("Freedom Plan normalization only accepts stored strings", () => {
  const plan = normalizeX5FreedomPlan({
    vision: "More family time",
    personalMonthlyCost: 30000,
  });

  assert.equal(plan.vision, "More family time");
  assert.equal(plan.personalMonthlyCost, "");
  assert.equal(plan.notes, "");
  assert.deepEqual(plan.goals, []);
});

test("Freedom goals compare actual and target amounts", () => {
  assert.deepEqual(
    calculateX5FreedomGoal({
      id: "emergency",
      name: "Emergency fund",
      target: "100000",
      actual: "35000",
      rule: "MOTHER",
    }),
    {
      target: 100000,
      actual: 35000,
      progressPercent: 35,
      remaining: 65000,
    }
  );
});

test("Mother money stays protected while Child money is usable", () => {
  const summary = calculateX5FreedomGoalSummary([
    { id: "reserve", name: "Business reserve", target: "200000", actual: "120000", rule: "MOTHER" },
    { id: "profit", name: "Usable profit", target: "50000", actual: "30000", rule: "CHILD" },
  ]);

  assert.equal(summary.motherProtected, 120000);
  assert.equal(summary.childUsable, 30000);
  assert.equal(summary.overallProgressPercent, 60);
});

test("Freedom goals normalize their money rule and stored values", () => {
  const plan = normalizeX5FreedomPlan({
    goals: [
      { id: "one", name: "Emergency fund", target: "100", actual: "20", rule: "CHILD" },
      { id: "two", name: 123, target: 100, actual: null, rule: "UNKNOWN" },
      { name: "Missing id" },
    ],
  });

  assert.deepEqual(plan.goals, [
    { id: "one", name: "Emergency fund", target: "100", actual: "20", rule: "CHILD" },
    { id: "two", name: "", target: "", actual: "", rule: "MOTHER" },
  ]);
});
