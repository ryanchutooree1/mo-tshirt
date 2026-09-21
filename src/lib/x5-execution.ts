export const X5_EXECUTION_STEPS = [
  { id: "capture-idea", label: "Capture Idea" },
  { id: "define-outcome", label: "Define Outcome" },
  { id: "research-challenge", label: "Research + Challenge" },
  { id: "create-execution-plan", label: "Create Execution Plan" },
  { id: "ai-executes", label: "AI Executes What It Can" },
  { id: "show-ryan-actions", label: "Show Only Actions Requiring Ryan" },
  { id: "ryan-checks-actions", label: "Ryan Checks Actions" },
  { id: "ai-verifies-result", label: "AI Verifies Result" },
  { id: "set-final-status", label: "Status: DONE / BLOCKED / FAILED" },
  { id: "save-learnings", label: "Save Learnings for Next Idea" },
] as const;

export type X5ExecutionStatus = "ACTIVE" | "DONE" | "BLOCKED" | "FAILED";

export type X5ExecutionStep = {
  id: string;
  label: string;
  completed: boolean;
};

export const X5_EXECUTION_STATUSES: X5ExecutionStatus[] = [
  "ACTIVE",
  "DONE",
  "BLOCKED",
  "FAILED",
];

export function createX5ExecutionSteps(): X5ExecutionStep[] {
  return X5_EXECUTION_STEPS.map((step) => ({ ...step, completed: false }));
}

export function normalizeX5ExecutionSteps(value: unknown): X5ExecutionStep[] {
  const storedSteps = Array.isArray(value) ? value : [];
  const completedById = new Map<string, boolean>();

  for (const step of storedSteps) {
    if (!step || typeof step !== "object") continue;
    const candidate = step as { id?: unknown; completed?: unknown };
    if (typeof candidate.id !== "string") continue;
    completedById.set(candidate.id, candidate.completed === true);
  }

  return X5_EXECUTION_STEPS.map((step) => ({
    ...step,
    completed: completedById.get(step.id) === true,
  }));
}

export function calculateX5ExecutionProgress(steps: X5ExecutionStep[]) {
  if (!steps.length) return 0;
  const completed = steps.filter((step) => step.completed).length;
  return Math.round((completed / steps.length) * 100);
}

export function normalizeX5ExecutionStatus(value: unknown): X5ExecutionStatus {
  return X5_EXECUTION_STATUSES.includes(value as X5ExecutionStatus)
    ? (value as X5ExecutionStatus)
    : "ACTIVE";
}
