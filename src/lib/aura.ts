export type AuraArea =
  "life" | "business" | "family" | "career" | "health" | "moments" | "presence";

export type AuraAction = {
  id: string;
  title: string;
  minutes: number;
  dueDate: string;
  completedAt: string | null;
  evidence: string;
};

export type AuraGoal = {
  id: string;
  title: string;
  area: AuraArea;
  why: string;
  success: string;
  targetDate: string;
  priority: number;
  status: "active" | "achieved" | "archived";
  actions: AuraAction[];
  outcomeEvidence: string;
  achievedAt: string | null;
  createdAt: string;
};

export type AuraReview = {
  id: string;
  createdAt: string;
  win: string;
  lesson: string;
  adjustment: string;
};

export type AuraLesson = {
  id: string;
  createdAt: string;
  situation: string;
  lesson: string;
  nextAction: string;
  area: AuraArea;
  practice: {
    title: string;
    trigger: string;
    cadence: "when-needed" | "daily" | "weekly";
    steps: { id: string; title: string }[];
    adopted: boolean;
    checks: Record<string, string[]>;
  } | null;
};

export type AuraWorkspace = {
  schemaVersion: 1;
  vision: string;
  goals: AuraGoal[];
  reviews: AuraReview[];
  lessons: AuraLesson[];
};

export const EMPTY_AURA_WORKSPACE: AuraWorkspace = {
  schemaVersion: 1,
  vision: "",
  goals: [],
  reviews: [],
  lessons: [],
};

export const AURA_AREAS: {
  id: AuraArea;
  label: string;
  description: string;
}[] = [
  {
    id: "life",
    label: "Life",
    description: "Build a life that feels like your own.",
  },
  {
    id: "business",
    label: "Business",
    description: "Create something useful and make it grow.",
  },
  {
    id: "family",
    label: "Family",
    description: "Make time for the people closest to you.",
  },
  {
    id: "career",
    label: "Career",
    description: "Develop your skills and meaningful work.",
  },
  {
    id: "health",
    label: "Health",
    description: "Care for your body, mind, and energy.",
  },
  {
    id: "moments",
    label: "Moments",
    description: "Make room for experiences worth remembering.",
  },
  {
    id: "presence",
    label: "Presence",
    description: "Show up with intention in everyday life.",
  },
];

export const AURA_LIMITS = {
  vision: 4_000,
  title: 180,
  text: 2_000,
  goals: 100,
  actionsPerGoal: 50,
  totalActions: 1_000,
  reviews: 104,
  lessons: 100,
  practiceSteps: 20,
  practiceOccurrences: 400,
  workspaceCharacters: 500_000,
} as const;

/** Action completion measures effort; it never changes a goal's outcome status. */
export function getActionProgress(goal: Pick<AuraGoal, "actions">) {
  const total = goal.actions.length;
  const completed = goal.actions.filter(
    (action) => action.completedAt !== null,
  ).length;
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
}

export function calculateAuraActionProgress(actions: AuraAction[]) {
  return getActionProgress({ actions }).percent;
}

/** Use the browser's calendar day, rather than UTC, for today's action queue. */
export function localDateKey(date = new Date()) {
  if (!Number.isFinite(date.getTime()))
    throw new Error("Use a valid calendar date.");
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Calendar cadences advance with the day; an as-needed run stays open until reset. */
export function getAuraPracticeOccurrenceKey(
  practice: NonNullable<AuraLesson["practice"]>,
  dateKey: string,
): string {
  validateDateKey(dateKey, "Practice date", false);
  if (practice.cadence === "daily") return dateKey;
  if (practice.cadence === "weekly") {
    const date = new Date(`${dateKey}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  }
  const existing = Object.keys(practice.checks).sort();
  const available = existing.filter((key) => key <= dateKey);
  return (
    available[available.length - 1] || existing[existing.length - 1] || dateKey
  );
}

/**
 * Rebase an editable JSON draft without replacing unrelated work from another tab.
 * Conflicting fields prefer the draft in `value`; callers MUST ask for explicit
 * confirmation before saving a result with conflicts.
 */
export function mergeAuraDraft<T>(
  base: T,
  draft: T,
  latest: T,
): { value: T; conflicts: string[] } {
  const missing = Symbol("missing JSON field");
  const conflicts: string[] = [];
  const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  function equal(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
      return (
        a.length === b.length && a.every((item, index) => equal(item, b[index]))
      );
    }
    if (isObject(a) && isObject(b)) {
      const keys = Object.keys(a);
      return (
        keys.length === Object.keys(b).length &&
        keys.every(
          (key) =>
            Object.prototype.hasOwnProperty.call(b, key) &&
            equal(a[key], b[key]),
        )
      );
    }
    return false;
  }
  function copy(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(copy);
    if (isObject(value))
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, copy(item)]),
      );
    return value;
  }
  function keyedItems(
    value: unknown,
  ): value is (Record<string, unknown> & { id: string })[] {
    return (
      Array.isArray(value) &&
      value.every(
        (item) =>
          isObject(item) && typeof item.id === "string" && item.id.length > 0,
      ) &&
      new Set(value.map((item) => item.id)).size === value.length
    );
  }
  function conflict(path: string) {
    conflicts.push(path || "$");
  }
  function merge(
    previous: unknown,
    edited: unknown,
    current: unknown,
    path: string,
  ): unknown {
    if (equal(edited, previous)) return copy(current);
    if (equal(current, previous) || equal(edited, current)) return copy(edited);
    if (edited === missing || current === missing) {
      conflict(path);
      return copy(edited);
    }
    if (
      isObject(edited) &&
      isObject(current) &&
      (isObject(previous) || previous === missing)
    ) {
      const before = isObject(previous) ? previous : {};
      const keys = new Set([
        ...Object.keys(before),
        ...Object.keys(edited),
        ...Object.keys(current),
      ]);
      const field = (object: Record<string, unknown>, key: string) =>
        Object.prototype.hasOwnProperty.call(object, key)
          ? object[key]
          : missing;
      const entries: [string, unknown][] = [];
      for (const key of keys) {
        const value = merge(
          field(before, key),
          field(edited, key),
          field(current, key),
          path ? `${path}.${key}` : key,
        );
        if (value !== missing) entries.push([key, value]);
      }
      return Object.fromEntries(entries);
    }
    if (
      keyedItems(edited) &&
      keyedItems(current) &&
      (keyedItems(previous) || previous === missing)
    ) {
      const before = keyedItems(previous) ? previous : [];
      const beforeById = new Map(before.map((item) => [item.id, item]));
      const editedById = new Map(edited.map((item) => [item.id, item]));
      const currentById = new Map(current.map((item) => [item.id, item]));
      const result = new Map<string, unknown>();
      for (const id of new Set([
        ...beforeById.keys(),
        ...editedById.keys(),
        ...currentById.keys(),
      ])) {
        const value = merge(
          beforeById.get(id) ?? missing,
          editedById.get(id) ?? missing,
          currentById.get(id) ?? missing,
          `${path || "$"}[${id}]`,
        );
        if (value !== missing) result.set(id, value);
      }
      const beforeIds = [...beforeById.keys()];
      const editedIds = [...editedById.keys()];
      const currentIds = [...currentById.keys()];
      const shared = (ids: string[]) =>
        ids.filter(
          (id) =>
            beforeById.has(id) && editedById.has(id) && currentById.has(id),
        );
      const originalOrder = shared(beforeIds);
      const editedOrder = shared(editedIds);
      const currentOrder = shared(currentIds);
      if (
        !equal(editedOrder, originalOrder) &&
        !equal(currentOrder, originalOrder) &&
        !equal(editedOrder, currentOrder)
      ) {
        conflict(`${path || "$"}.$order`);
      }
      const retainedBeforeOrder = beforeIds.filter((id) => editedById.has(id));
      const editedExistingOrder = editedIds.filter((id) => beforeById.has(id));
      const draftControlsOrder =
        !equal(retainedBeforeOrder, editedExistingOrder) ||
        editedIds.some((id) => !beforeById.has(id));
      const order = draftControlsOrder
        ? [...editedIds, ...currentIds]
        : [...currentIds, ...editedIds];
      return [...new Set(order)]
        .filter((id) => result.has(id))
        .map((id) => result.get(id));
    }
    // Primitive arrays (including checked step IDs) are one editable field.
    conflict(path);
    return copy(edited);
  }
  function repairPracticeReferences(value: unknown, path: string) {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        repairPracticeReferences(
          item,
          `${path}[${isObject(item) && typeof item.id === "string" ? item.id : index}]`,
        ),
      );
      return;
    }
    if (!isObject(value)) return;
    for (const [key, field] of Object.entries(value)) {
      const fieldPath = path ? `${path}.${key}` : key;
      if (
        key === "practice" &&
        isObject(field) &&
        keyedItems(field.steps) &&
        isObject(field.checks)
      ) {
        const stepIds = new Set(field.steps.map((step) => step.id));
        field.checks = Object.fromEntries(
          Object.entries(field.checks).map(([date, checked]) => {
            if (
              !Array.isArray(checked) ||
              !checked.every((id) => typeof id === "string")
            )
              return [date, checked];
            // Removing a step can intersect with a new remote check even though
            // those fields merged independently. Flag the lost record BEFORE
            // returning a valid draft-preferred value for user confirmation.
            for (const id of checked) {
              if (!stepIds.has(id))
                conflict(`${fieldPath}.steps[${id}].recordedChecks`);
            }
            return [date, checked.filter((id) => stepIds.has(id))];
          }),
        );
      }
      repairPracticeReferences(field, fieldPath);
    }
  }
  const value = merge(base, draft, latest, "") as T;
  repairPracticeReferences(value, "");
  return { value, conflicts: [...new Set(conflicts)] };
}

export type AuraTodayAction = {
  goal: AuraGoal;
  action: AuraAction;
  isOverdue: boolean;
};

export function getTodayActions(
  workspace: AuraWorkspace,
  dateKey = localDateKey(),
): AuraTodayAction[] {
  validateDateKey(dateKey, "Today", false);
  return workspace.goals
    .flatMap((goal) => {
      if (goal.status !== "active") return [];
      // Later actions cannot jump ahead of the goal's next unfinished step.
      const action = goal.actions.find((item) => item.completedAt === null);
      if (!action || (action.dueDate && action.dueDate > dateKey)) return [];
      return [
        {
          goal,
          action,
          isOverdue: Boolean(action.dueDate && action.dueDate < dateKey),
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.isOverdue) - Number(a.isOverdue) ||
        a.goal.priority - b.goal.priority ||
        a.action.minutes - b.action.minutes ||
        a.goal.createdAt.localeCompare(b.goal.createdAt) ||
        a.goal.id.localeCompare(b.goal.id),
    )
    .slice(0, 3);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(
  value: unknown,
  label: string,
  maxLength: number,
  required = false,
) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  if (value.length > maxLength)
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  if (required && !value.trim()) throw new Error(`${label} is required.`);
  return value;
}

function id(value: unknown, label: string, seen: Set<string>) {
  const result = text(value, label, 100, true);
  if (!/^[a-zA-Z0-9_:.\-]+$/.test(result))
    throw new Error(`${label} is invalid.`);
  if (seen.has(result)) throw new Error(`${label} must be unique.`);
  seen.add(result);
  return result;
}

function validateDateKey(value: unknown, label: string, optional = true) {
  const result = text(value, label, 10);
  if (optional && !result) return result;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result))
    throw new Error(`${label} must be a valid YYYY-MM-DD date.`);
  const date = new Date(`${result}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== result
  ) {
    throw new Error(`${label} must be a valid calendar date.`);
  }
  return result;
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label, 40, true);
  if (
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      result,
    ) ||
    !Number.isFinite(Date.parse(result))
  ) {
    throw new Error(`${label} must be a valid ISO timestamp.`);
  }
  validateDateKey(result.slice(0, 10), label, false);
  return result;
}

function nullableTimestamp(value: unknown, label: string) {
  return value === null ? null : timestamp(value, label);
}

function list(value: unknown, label: string, maxLength: number): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a list.`);
  if (value.length > maxLength)
    throw new Error(`${label} can contain at most ${maxLength} items.`);
  return value;
}

/** Strictly validate and return an independent, known-field-only document. */
export function validateAuraWorkspace(value: unknown): AuraWorkspace {
  const workspace = record(value, "Workspace");
  if (workspace.schemaVersion !== 1)
    throw new Error("This workspace version is not supported.");
  const goalIds = new Set<string>();
  const actionIds = new Set<string>();
  const reviewIds = new Set<string>();
  const lessonIds = new Set<string>();
  let totalActions = 0;
  const goals = list(workspace.goals, "Goals", AURA_LIMITS.goals).map(
    (value, index): AuraGoal => {
      const label = `Goal ${index + 1}`;
      const goal = record(value, label);
      if (!AURA_AREAS.some((area) => area.id === goal.area))
        throw new Error(`${label} has an invalid life area.`);
      if (![1, 2, 3].includes(goal.priority as number))
        throw new Error(`${label} priority must be 1, 2, or 3.`);
      if (!["active", "achieved", "archived"].includes(goal.status as string))
        throw new Error(`${label} has an invalid status.`);
      const actions = list(
        goal.actions,
        `${label} actions`,
        AURA_LIMITS.actionsPerGoal,
      ).map((value, index): AuraAction => {
        const actionLabel = `${label}, action ${index + 1}`;
        const action = record(value, actionLabel);
        if (
          typeof action.minutes !== "number" ||
          !Number.isInteger(action.minutes) ||
          action.minutes < 1 ||
          action.minutes > 1_440
        ) {
          throw new Error(
            `${actionLabel} time must be a whole number from 1 to 1440 minutes.`,
          );
        }
        return {
          id: id(action.id, `${actionLabel} ID`, actionIds),
          title: text(
            action.title,
            `${actionLabel} title`,
            AURA_LIMITS.title,
            true,
          ),
          minutes: action.minutes,
          dueDate: validateDateKey(action.dueDate, `${actionLabel} due date`),
          completedAt: nullableTimestamp(
            action.completedAt,
            `${actionLabel} completion time`,
          ),
          evidence: text(
            action.evidence,
            `${actionLabel} evidence`,
            AURA_LIMITS.text,
          ),
        };
      });
      totalActions += actions.length;
      if (totalActions > AURA_LIMITS.totalActions)
        throw new Error(
          `A workspace can contain at most ${AURA_LIMITS.totalActions} actions.`,
        );
      const outcomeEvidence = text(
        goal.outcomeEvidence,
        `${label} outcome evidence`,
        AURA_LIMITS.text,
      );
      const achievedAt = nullableTimestamp(
        goal.achievedAt,
        `${label} achievement time`,
      );
      if (
        goal.status === "achieved" &&
        (!outcomeEvidence.trim() || !achievedAt)
      ) {
        throw new Error(
          `${label} needs outcome evidence and an achievement time before it can be marked achieved.`,
        );
      }
      return {
        id: id(goal.id, `${label} ID`, goalIds),
        title: text(goal.title, `${label} title`, AURA_LIMITS.title, true),
        area: goal.area as AuraArea,
        why: text(goal.why, `${label} reason`, AURA_LIMITS.text),
        success: text(
          goal.success,
          `${label} success measure`,
          AURA_LIMITS.text,
        ),
        targetDate: validateDateKey(goal.targetDate, `${label} target date`),
        priority: goal.priority as number,
        status: goal.status as AuraGoal["status"],
        actions,
        outcomeEvidence,
        achievedAt,
        createdAt: timestamp(goal.createdAt, `${label} creation time`),
      };
    },
  );
  const reviews = list(workspace.reviews, "Reviews", AURA_LIMITS.reviews).map(
    (value, index): AuraReview => {
      const label = `Review ${index + 1}`;
      const review = record(value, label);
      return {
        id: id(review.id, `${label} ID`, reviewIds),
        createdAt: timestamp(review.createdAt, `${label} creation time`),
        win: text(review.win, `${label} win`, AURA_LIMITS.text),
        lesson: text(review.lesson, `${label} lesson`, AURA_LIMITS.text),
        adjustment: text(
          review.adjustment,
          `${label} adjustment`,
          AURA_LIMITS.text,
        ),
      };
    },
  );
  // Older drafts predate lessons. They remain readable without a schema migration.
  const lessons = list(
    workspace.lessons === undefined ? [] : workspace.lessons,
    "Lessons",
    AURA_LIMITS.lessons,
  ).map((value, index): AuraLesson => {
    const label = `Lesson ${index + 1}`;
    const lesson = record(value, label);
    if (!AURA_AREAS.some((area) => area.id === lesson.area))
      throw new Error(`${label} has an invalid life area.`);
    let practice: AuraLesson["practice"] = null;
    if (lesson.practice !== null) {
      const input = record(lesson.practice, `${label} practice`);
      if (!["when-needed", "daily", "weekly"].includes(input.cadence as string))
        throw new Error(`${label} has an invalid practice cadence.`);
      if (typeof input.adopted !== "boolean")
        throw new Error(`${label} practice adoption must be true or false.`);
      const stepIds = new Set<string>();
      const steps = list(
        input.steps,
        `${label} practice steps`,
        AURA_LIMITS.practiceSteps,
      ).map((value, index) => {
        const step = record(value, `${label} step ${index + 1}`);
        return {
          id: id(step.id, `${label} step ${index + 1} ID`, stepIds),
          title: text(
            step.title,
            `${label} step ${index + 1} title`,
            AURA_LIMITS.title,
            true,
          ),
        };
      });
      if (!steps.length)
        throw new Error(`${label} practice needs at least one step.`);
      const inputChecks = record(input.checks, `${label} practice checks`);
      if (Object.keys(inputChecks).length > AURA_LIMITS.practiceOccurrences) {
        throw new Error(
          `${label} practice can contain at most ${AURA_LIMITS.practiceOccurrences} check-in dates.`,
        );
      }
      const checks: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(inputChecks)) {
        const day = validateDateKey(key, `${label} check-in date`, false);
        // Keep historic dates if the user changes cadence; new weekly occurrences
        // use Monday through getAuraPracticeOccurrenceKey.
        const seen = new Set<string>();
        checks[day] = list(
          value,
          `${label} checked steps`,
          AURA_LIMITS.practiceSteps,
        ).map((stepId) => {
          const result = id(stepId, `${label} checked step ID`, seen);
          if (!stepIds.has(result))
            throw new Error(
              `${label} check-ins can only contain this practice's step IDs.`,
            );
          return result;
        });
      }
      practice = {
        title: text(
          input.title,
          `${label} practice title`,
          AURA_LIMITS.title,
          true,
        ),
        trigger: text(
          input.trigger,
          `${label} practice trigger`,
          AURA_LIMITS.text,
          true,
        ),
        cadence: input.cadence as NonNullable<
          AuraLesson["practice"]
        >["cadence"],
        steps,
        adopted: input.adopted,
        checks,
      };
    }
    return {
      id: id(lesson.id, `${label} ID`, lessonIds),
      createdAt: timestamp(lesson.createdAt, `${label} creation time`),
      situation: text(
        lesson.situation,
        `${label} situation`,
        AURA_LIMITS.text,
        true,
      ),
      lesson: text(lesson.lesson, `${label} takeaway`, AURA_LIMITS.text),
      nextAction: text(
        lesson.nextAction,
        `${label} next action`,
        AURA_LIMITS.text,
      ),
      area: lesson.area as AuraArea,
      practice,
    };
  });
  const result: AuraWorkspace = {
    schemaVersion: 1,
    vision: text(workspace.vision, "Vision", AURA_LIMITS.vision),
    goals,
    reviews,
    lessons,
  };
  if (JSON.stringify(result).length > AURA_LIMITS.workspaceCharacters) {
    throw new Error(
      "This workspace is too large. Shorten older notes before saving.",
    );
  }
  return result;
}
