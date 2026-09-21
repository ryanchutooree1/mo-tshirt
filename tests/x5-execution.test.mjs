import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateX5ExecutionProgress,
  createX5ExecutionSteps,
  normalizeX5ExecutionStatus,
  normalizeX5ExecutionSteps,
  X5_EXECUTION_STEPS,
} from "../src/lib/x5-execution.ts";

test("X5 Execution always exposes the complete ten-step workflow", () => {
  const steps = createX5ExecutionSteps();

  assert.equal(steps.length, 10);
  assert.deepEqual(
    steps.map((step) => step.label),
    X5_EXECUTION_STEPS.map((step) => step.label)
  );
  assert.equal(steps.every((step) => step.completed === false), true);
});

test("saved completion state is normalized without allowing workflow drift", () => {
  const steps = normalizeX5ExecutionSteps([
    { id: "capture-idea", label: "Changed label", completed: true },
    { id: "unknown-step", label: "Unknown", completed: true },
  ]);

  assert.equal(steps[0].label, "Capture Idea");
  assert.equal(steps[0].completed, true);
  assert.equal(steps.some((step) => step.id === "unknown-step"), false);
});

test("progress is calculated as a whole percentage", () => {
  const steps = createX5ExecutionSteps().map((step, index) => ({
    ...step,
    completed: index < 7,
  }));

  assert.equal(calculateX5ExecutionProgress(steps), 70);
  assert.equal(calculateX5ExecutionProgress([]), 0);
});

test("unknown database statuses safely return to active", () => {
  assert.equal(normalizeX5ExecutionStatus("DONE"), "DONE");
  assert.equal(normalizeX5ExecutionStatus("UNKNOWN"), "ACTIVE");
});
