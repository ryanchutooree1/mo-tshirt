import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateX5FreedomPlan,
  EMPTY_X5_FREEDOM_PLAN,
  normalizeX5FreedomPlan,
} from "../src/lib/x5-freedom.ts";

test("Freedom Plan starts blank for Ryan to complete", () => {
  assert.equal(Object.values(EMPTY_X5_FREEDOM_PLAN).every((value) => value === ""), true);
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
});
