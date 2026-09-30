import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as aura from "../src/lib/aura.ts";
import * as access from "../src/lib/admin-access.ts";
import * as safety from "../src/lib/request-safety.ts";

const NOW = "2026-09-30T10:00:00.000Z";
const clone = (value) => JSON.parse(JSON.stringify(value));
const action = (id = "action-1", extra = {}) => ({
  id,
  title: "Take the next small step",
  minutes: 15,
  dueDate: "",
  completedAt: null,
  evidence: "",
  ...extra,
});
const goal = (id = "goal-1", extra = {}) => ({
  id,
  title: "A meaningful goal",
  area: "life",
  why: "Make space for what matters",
  success: "A visible result",
  targetDate: "",
  priority: 2,
  status: "active",
  actions: [action(`${id}-action`)],
  outcomeEvidence: "",
  achievedAt: null,
  createdAt: NOW,
  ...extra,
});
const workspace = (goals = [goal()]) => ({
  schemaVersion: 1,
  vision: "An intentional life",
  goals,
  reviews: [],
  lessons: [],
});

test("Aura starts empty, covers seven life areas, and returns independent validated data", () => {
  assert.deepEqual(aura.EMPTY_AURA_WORKSPACE, {
    schemaVersion: 1,
    vision: "",
    goals: [],
    reviews: [],
    lessons: [],
  });
  assert.deepEqual(
    aura.AURA_AREAS.map(({ id }) => id),
    ["life", "business", "family", "career", "health", "moments", "presence"],
  );
  const input = workspace();
  input.userId = "someone-else";
  const valid = aura.validateAuraWorkspace(input);
  assert.equal("userId" in valid, false);
  valid.goals[0].title = "Updated";
  assert.equal(input.goals[0].title, "A meaningful goal");
});

test("action progress is effort, and does not implicitly mark an outcome achieved", () => {
  const item = goal("g", {
    actions: [action("a", { completedAt: NOW }), action("b"), action("c")],
  });
  assert.deepEqual(aura.getActionProgress(item), {
    completed: 1,
    total: 3,
    percent: 33,
  });
  assert.equal(aura.calculateAuraActionProgress([]), 0);
  item.actions.forEach((item) => {
    item.completedAt = NOW;
  });
  const valid = aura.validateAuraWorkspace(workspace([item]));
  assert.equal(aura.getActionProgress(valid.goals[0]).percent, 100);
  assert.equal(valid.goals[0].status, "active");
  assert.equal(valid.goals[0].achievedAt, null);
});

test("achievement needs an explicit status, outcome evidence, and achievement timestamp", () => {
  const item = goal("g", { status: "achieved" });
  assert.throws(
    () => aura.validateAuraWorkspace(workspace([item])),
    /outcome evidence/,
  );
  item.outcomeEvidence = "Verified the result in person";
  assert.throws(
    () => aura.validateAuraWorkspace(workspace([item])),
    /achievement time/,
  );
  item.achievedAt = NOW;
  assert.equal(
    aura.validateAuraWorkspace(workspace([item])).goals[0].status,
    "achieved",
  );
});

test("today is capped at three, with overdue actions first, then priority and duration", () => {
  const value = workspace([
    goal("not-due", {
      priority: 1,
      actions: [action("later", { dueDate: "2026-10-01" })],
    }),
    goal("regular-high", {
      priority: 1,
      actions: [action("today", { dueDate: "2026-09-30", minutes: 5 })],
    }),
    goal("overdue-low", {
      priority: 3,
      actions: [action("overdue1", { dueDate: "2026-09-29", minutes: 5 })],
    }),
    goal("overdue-high-long", {
      priority: 1,
      actions: [action("overdue2", { dueDate: "2026-09-29", minutes: 30 })],
    }),
    goal("overdue-high-short", {
      priority: 1,
      actions: [action("overdue3", { dueDate: "2026-09-28", minutes: 10 })],
    }),
  ]);
  const today = aura.getTodayActions(value, "2026-09-30");
  assert.deepEqual(
    today.map(({ goal }) => goal.id),
    ["overdue-high-short", "overdue-high-long", "overdue-low"],
  );
  assert.ok(today.every(({ isOverdue }) => isOverdue));
});

test("today takes only the next incomplete action of each active goal", () => {
  const value = workspace([
    goal("done", { actions: [action("completed", { completedAt: NOW })] }),
    goal("archived", { status: "archived" }),
    goal("achieved", {
      status: "achieved",
      achievedAt: NOW,
      outcomeEvidence: "Done",
    }),
    goal("blocked-by-future", {
      actions: [
        action("first", { dueDate: "2026-10-01" }),
        action("second", { dueDate: "2026-09-20" }),
      ],
    }),
    goal("available", {
      actions: [
        action("old", { completedAt: NOW }),
        action("next"),
        action("last"),
      ],
    }),
  ]);
  const today = aura.getTodayActions(value, "2026-09-30");
  assert.equal(today.length, 1);
  assert.equal(today[0].action.id, "next");
  assert.equal(today[0].isOverdue, false);
  assert.equal(
    aura.getTodayActions(aura.EMPTY_AURA_WORKSPACE, "2026-09-30").length,
    0,
  );
});

test("local date keys honor the user's calendar day, including Mauritius at UTC day boundaries", () => {
  for (const [timezone, instant, expected] of [
    ["Pacific/Honolulu", "2026-09-30T01:30:00Z", "2026-09-29"],
    ["Pacific/Kiritimati", "2026-09-30T01:30:00Z", "2026-09-30"],
    ["Indian/Mauritius", "2026-09-30T21:30:00Z", "2026-10-01"],
  ]) {
    const result = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {localDateKey} from './src/lib/aura.ts';process.stdout.write(localDateKey(new Date('${instant}')));`,
      ],
      {
        cwd: new URL("..", import.meta.url),
        env: { ...process.env, TZ: timezone },
        encoding: "utf8",
      },
    );
    assert.equal(result, expected);
  }
  assert.throws(
    () => aura.localDateKey(new Date("invalid")),
    /valid calendar date/,
  );
});

test("validation rejects invalid versions, enum values, numbers, dates, and oversized fields", () => {
  const cases = [
    [
      (value) => {
        value.schemaVersion = 2;
      },
      /version/,
    ],
    [
      (value) => {
        value.vision = "x".repeat(4_001);
      },
      /Vision/,
    ],
    [
      (value) => {
        value.goals[0].title = " ";
      },
      /title is required/,
    ],
    [
      (value) => {
        value.goals[0].area = "mystery";
      },
      /life area/,
    ],
    [
      (value) => {
        value.goals[0].priority = "1";
      },
      /priority/,
    ],
    [
      (value) => {
        value.goals[0].priority = 0;
      },
      /priority/,
    ],
    [
      (value) => {
        value.goals[0].status = "completed";
      },
      /status/,
    ],
    [
      (value) => {
        value.goals[0].targetDate = "2026-02-30";
      },
      /calendar date/,
    ],
    [
      (value) => {
        value.goals[0].createdAt = "yesterday";
      },
      /ISO timestamp/,
    ],
    [
      (value) => {
        value.goals[0].createdAt = "2026-02-30T10:00:00Z";
      },
      /calendar date/,
    ],
    [
      (value) => {
        value.goals[0].actions[0].minutes = 1.2;
      },
      /whole number/,
    ],
    [
      (value) => {
        value.goals[0].actions[0].minutes = NaN;
      },
      /whole number/,
    ],
    [
      (value) => {
        value.goals[0].actions[0].minutes = 0;
      },
      /whole number/,
    ],
    [
      (value) => {
        value.goals[0].actions[0].minutes = 1_441;
      },
      /whole number/,
    ],
    [
      (value) => {
        value.goals[0].actions[0].dueDate = "30/09/2026";
      },
      /YYYY-MM-DD/,
    ],
    [
      (value) => {
        value.goals[0].actions[0].completedAt = undefined;
      },
      /must be text/,
    ],
    [
      (value) => {
        value.goals[0].actions[0].evidence = "x".repeat(2_001);
      },
      /evidence/,
    ],
    [
      (value) => {
        value.goals[0].id = "../../other-user";
      },
      /ID is invalid/,
    ],
    [
      (value) => {
        value.reviews = null;
      },
      /Reviews must be a list/,
    ],
  ];
  for (const [mutate, expected] of cases) {
    const value = workspace();
    mutate(value);
    assert.throws(() => aura.validateAuraWorkspace(value), expected);
  }
  for (const value of [null, [], "workspace"])
    assert.throws(
      () => aura.validateAuraWorkspace(value),
      /Workspace must be an object/,
    );
  assert.throws(
    () => aura.getTodayActions(workspace(), "2026-02-29"),
    /calendar date/,
  );
  assert.equal(
    aura.validateAuraWorkspace(
      workspace([goal("leap", { targetDate: "2028-02-29" })]),
    ).goals[0].targetDate,
    "2028-02-29",
  );
});

test("duplicate IDs and collection caps prevent ambiguous or unbounded documents", () => {
  assert.throws(
    () =>
      aura.validateAuraWorkspace(
        workspace([
          goal("duplicate", { actions: [] }),
          goal("duplicate", { actions: [] }),
        ]),
      ),
    /ID must be unique/,
  );
  assert.throws(
    () =>
      aura.validateAuraWorkspace(
        workspace([
          goal("g", { actions: [action("duplicate"), action("duplicate")] }),
        ]),
      ),
    /ID must be unique/,
  );
  assert.throws(
    () =>
      aura.validateAuraWorkspace(
        workspace(Array.from({ length: 101 }, (_, i) => goal(`g${i}`))),
      ),
    /at most 100 items/,
  );
  assert.throws(
    () =>
      aura.validateAuraWorkspace(
        workspace([
          goal("g", {
            actions: Array.from({ length: 51 }, (_, i) => action(`a${i}`)),
          }),
        ]),
      ),
    /at most 50 items/,
  );
  assert.throws(
    () =>
      aura.validateAuraWorkspace(
        workspace(
          Array.from({ length: 21 }, (_, i) =>
            goal(`g${i}`, {
              actions: Array.from({ length: 50 }, (_, j) =>
                action(`a${i}-${j}`),
              ),
            }),
          ),
        ),
      ),
    /at most 1000 actions/,
  );
  const review = {
    id: "r",
    createdAt: NOW,
    win: "Finished",
    lesson: "Keep it small",
    adjustment: "Start earlier",
  };
  const value = workspace();
  value.reviews = [review];
  assert.deepEqual(aura.validateAuraWorkspace(value).reviews, [review]);
  value.reviews.push(review);
  assert.throws(() => aura.validateAuraWorkspace(value), /ID must be unique/);
  value.reviews = Array.from({ length: 105 }, (_, i) => ({
    ...review,
    id: `r${i}`,
  }));
  assert.throws(() => aura.validateAuraWorkspace(value), /at most 104 items/);
});

const lesson = (extra = {}) => ({
  id: "lesson-1",
  createdAt: NOW,
  situation: "An order was delayed",
  lesson: "Confirm the details earlier",
  nextAction: "Ask the customer for the missing size",
  area: "business",
  practice: null,
  ...extra,
});
const practice = (extra = {}) => ({
  title: "Check order details",
  trigger: "When a new order arrives",
  cadence: "when-needed",
  steps: [
    { id: "confirm-size", title: "Confirm the size" },
    { id: "confirm-date", title: "Confirm the date" },
  ],
  adopted: false,
  checks: {},
  ...extra,
});

test("older workspaces gain an empty lessons list without changing existing goals", () => {
  const legacy = workspace();
  delete legacy.lessons;
  const valid = aura.validateAuraWorkspace(legacy);
  assert.deepEqual(valid.lessons, []);
  assert.deepEqual(valid.goals, legacy.goals);
});

test("lessons and optional checklist practices round-trip without implicitly adopting them", () => {
  const value = workspace();
  value.lessons = [lesson()];
  assert.deepEqual(aura.validateAuraWorkspace(value).lessons, value.lessons);
  value.lessons[0].practice = practice({
    checks: { "2026-09-30": ["confirm-size"] },
  });
  const valid = aura.validateAuraWorkspace(value);
  assert.deepEqual(valid.lessons, value.lessons);
  assert.equal(valid.lessons[0].practice.adopted, false);
  valid.lessons[0].practice.checks["2026-09-30"].push("confirm-date");
  assert.equal(value.lessons[0].practice.checks["2026-09-30"].length, 1);
  value.lessons[0].practice = practice({
    adopted: true,
    cadence: "weekly",
    checks: { "2026-09-28": ["confirm-date"] },
  });
  assert.equal(
    aura.validateAuraWorkspace(value).lessons[0].practice.adopted,
    true,
  );
  value.lessons[0].practice.cadence = "daily";
  value.lessons[0].practice.checks["2026-09-30"] = ["confirm-size"];
  value.lessons[0].practice.cadence = "weekly";
  assert.deepEqual(
    aura.validateAuraWorkspace(value).lessons[0].practice.checks,
    { "2026-09-28": ["confirm-date"], "2026-09-30": ["confirm-size"] },
  );
});

test("daily and weekly occurrences use local day and Monday keys across month and year boundaries", () => {
  const daily = practice({
    cadence: "daily",
    checks: { "2026-09-29": ["confirm-size"] },
  });
  assert.equal(
    aura.getAuraPracticeOccurrenceKey(daily, "2026-09-30"),
    "2026-09-30",
  );
  const weekly = practice({ cadence: "weekly" });
  for (const [day, expected] of [
    ["2026-09-28", "2026-09-28"],
    ["2026-09-30", "2026-09-28"],
    ["2026-10-04", "2026-09-28"],
    ["2026-10-05", "2026-10-05"],
    ["2027-01-01", "2026-12-28"],
  ]) {
    assert.equal(aura.getAuraPracticeOccurrenceKey(weekly, day), expected);
  }
  assert.throws(
    () => aura.getAuraPracticeOccurrenceKey(weekly, "2026-02-30"),
    /calendar date/,
  );
});

test("as-needed checklists keep their current run through midnight and preserve empty reset occurrences", () => {
  const asNeeded = practice({
    checks: { "2026-09-29": ["confirm-size"], "2026-09-30": ["confirm-date"] },
  });
  assert.equal(
    aura.getAuraPracticeOccurrenceKey(asNeeded, "2026-09-30"),
    "2026-09-30",
  );
  assert.equal(
    aura.getAuraPracticeOccurrenceKey(asNeeded, "2026-10-01"),
    "2026-09-30",
  );
  assert.equal(
    aura.getAuraPracticeOccurrenceKey(asNeeded, "2026-10-30"),
    "2026-09-30",
  );
  asNeeded.checks["2026-10-01"] = [];
  assert.equal(
    aura.getAuraPracticeOccurrenceKey(asNeeded, "2026-10-02"),
    "2026-10-01",
  );
  assert.equal(
    aura.getAuraPracticeOccurrenceKey(asNeeded, "2026-09-29"),
    "2026-09-29",
  );
  assert.equal(
    aura.getAuraPracticeOccurrenceKey(asNeeded, "2026-09-28"),
    "2026-10-01",
  );
  assert.equal(
    aura.getAuraPracticeOccurrenceKey(practice(), "2026-09-30"),
    "2026-09-30",
  );
});

test("lesson validation bounds content and accepts only known unique checklist step IDs", () => {
  const cases = [
    [
      (item) => {
        item.situation = " ";
      },
      /situation is required/,
    ],
    [
      (item) => {
        item.lesson = "x".repeat(2_001);
      },
      /takeaway/,
    ],
    [
      (item) => {
        item.nextAction = "x".repeat(2_001);
      },
      /next action/,
    ],
    [
      (item) => {
        item.area = "other";
      },
      /life area/,
    ],
    [
      (item) => {
        item.practice.cadence = "monthly";
      },
      /cadence/,
    ],
    [
      (item) => {
        item.practice.adopted = "yes";
      },
      /adoption/,
    ],
    [
      (item) => {
        item.practice.title = "";
      },
      /title is required/,
    ],
    [
      (item) => {
        item.practice.trigger = "";
      },
      /trigger is required/,
    ],
    [
      (item) => {
        item.practice.steps = [];
      },
      /at least one step/,
    ],
    [
      (item) => {
        item.practice.steps.push(item.practice.steps[0]);
      },
      /ID must be unique/,
    ],
    [
      (item) => {
        item.practice.checks = { "not-a-date": [] };
      },
      /YYYY-MM-DD/,
    ],
    [
      (item) => {
        item.practice.checks = { "2026-02-30": [] };
      },
      /calendar date/,
    ],
    [
      (item) => {
        item.practice.checks = { "2026-09-30": ["other-step"] };
      },
      /this practice's step IDs/,
    ],
    [
      (item) => {
        item.practice.checks = {
          "2026-09-30": ["confirm-size", "confirm-size"],
        };
      },
      /ID must be unique/,
    ],
    [
      (item) => {
        item.practice.checks = { "2026-09-30": "confirm-size" };
      },
      /must be a list/,
    ],
    [
      (item) => {
        item.practice.checks = [];
      },
      /must be an object/,
    ],
    [
      (item) => {
        item.practice.steps = Array.from({ length: 21 }, (_, i) => ({
          id: `step${i}`,
          title: "Step",
        }));
      },
      /at most 20/,
    ],
    [
      (item) => {
        item.practice.checks = Object.fromEntries(
          Array.from({ length: 401 }, (_, i) => [
            new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10),
            [],
          ]),
        );
      },
      /at most 400/,
    ],
  ];
  for (const [mutate, expected] of cases) {
    const value = workspace();
    value.lessons = [lesson({ practice: practice() })];
    mutate(value.lessons[0]);
    assert.throws(() => aura.validateAuraWorkspace(value), expected);
  }
  const value = workspace();
  value.lessons = [lesson(), lesson()];
  assert.throws(() => aura.validateAuraWorkspace(value), /ID must be unique/);
  value.lessons = Array.from({ length: 101 }, (_, i) =>
    lesson({ id: `lesson${i}` }),
  );
  assert.throws(() => aura.validateAuraWorkspace(value), /at most 100/);
  value.lessons = null;
  assert.throws(
    () => aura.validateAuraWorkspace(value),
    /Lessons must be a list/,
  );
});

test("three-way goal merge preserves concurrent action checks and evidence while applying edited fields", () => {
  const base = goal();
  const draft = clone(base);
  draft.title = "A clearer outcome";
  draft.actions[0].minutes = 20;
  const latest = clone(base);
  latest.actions[0].completedAt = NOW;
  latest.actions[0].evidence = "A verified action result";
  const originals = clone({ base, draft, latest });
  const merged = aura.mergeAuraDraft(base, draft, latest);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.value.title, draft.title);
  assert.equal(merged.value.actions[0].minutes, 20);
  assert.equal(merged.value.actions[0].completedAt, NOW);
  assert.equal(merged.value.actions[0].evidence, "A verified action result");
  assert.deepEqual({ base, draft, latest }, originals);
  merged.value.actions[0].evidence = "Changed after merge";
  assert.deepEqual({ base, draft, latest }, originals);
});

test("three-way lesson merge preserves concurrent check marks and independent editable practice fields", () => {
  const base = lesson({
    practice: practice({ adopted: true, checks: { "2026-09-30": [] } }),
  });
  const draft = clone(base);
  draft.lesson = "A more useful takeaway";
  draft.practice.steps[0].title = "Ask for the exact size";
  const latest = clone(base);
  latest.practice.checks["2026-09-30"] = ["confirm-size"];
  latest.practice.checks["2026-10-01"] = ["confirm-date"];
  latest.practice.trigger = "Before promising delivery";
  const merged = aura.mergeAuraDraft(base, draft, latest);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.value.lesson, draft.lesson);
  assert.equal(
    merged.value.practice.steps[0].title,
    draft.practice.steps[0].title,
  );
  assert.equal(merged.value.practice.trigger, latest.practice.trigger);
  assert.deepEqual(merged.value.practice.checks, latest.practice.checks);
});

test("removing a checklist step conflicts with remote recorded checks before filtering invalid references", () => {
  const base = lesson({ practice: practice({ adopted: true }) });
  const draft = clone(base);
  draft.practice.steps = draft.practice.steps.filter(
    ({ id }) => id !== "confirm-date",
  );
  const latest = clone(base);
  latest.practice.checks["2026-09-30"] = ["confirm-date", "confirm-size"];
  latest.practice.checks["2026-10-01"] = ["confirm-date"];
  const merged = aura.mergeAuraDraft(base, draft, latest);
  assert.deepEqual(merged.conflicts, [
    "practice.steps[confirm-date].recordedChecks",
  ]);
  assert.deepEqual(merged.value.practice.checks, {
    "2026-09-30": ["confirm-size"],
    "2026-10-01": [],
  });
  assert.deepEqual(latest.practice.checks, {
    "2026-09-30": ["confirm-date", "confirm-size"],
    "2026-10-01": ["confirm-date"],
  });
  const value = workspace();
  value.lessons = [merged.value];
  assert.deepEqual(aura.validateAuraWorkspace(value).lessons, [merged.value]);

  const nested = aura.mergeAuraDraft(
    { lessons: [base] },
    { lessons: [draft] },
    { lessons: [latest] },
  );
  assert.deepEqual(nested.conflicts, [
    "lessons[lesson-1].practice.steps[confirm-date].recordedChecks",
  ]);
  assert.deepEqual(
    nested.value.lessons[0].practice.checks,
    merged.value.practice.checks,
  );
});

test("ID-keyed merge keeps remote additions and applies local order before latest-only additions", () => {
  const base = goal("g", { actions: [action("a"), action("b")] });
  const draft = clone(base);
  draft.actions = [draft.actions[1], action("local-new"), draft.actions[0]];
  const latest = clone(base);
  latest.actions.push(action("remote-new"));
  latest.actions[0].evidence = "Added elsewhere";
  const merged = aura.mergeAuraDraft(base, draft, latest);
  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(
    merged.value.actions.map(({ id }) => id),
    ["b", "local-new", "a", "remote-new"],
  );
  assert.equal(merged.value.actions[2].evidence, "Added elsewhere");
});

test("draft fields unchanged from base inherit latest ordering and remotely removed items", () => {
  const base = goal("g", { actions: [action("a"), action("b"), action("c")] });
  const draft = clone(base);
  draft.actions[0].title = "Local name";
  const latest = clone(base);
  latest.actions = [latest.actions[2], latest.actions[0]];
  const merged = aura.mergeAuraDraft(base, draft, latest);
  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(
    merged.value.actions.map(({ id }) => id),
    ["c", "a"],
  );
  assert.equal(merged.value.actions[1].title, "Local name");
});

test("overlapping field and order edits are reported and prefer draft only for explicit confirmation", () => {
  const base = goal("g", { actions: [action("a"), action("b"), action("c")] });
  const draft = clone(base);
  draft.title = "Local title";
  draft.actions = [draft.actions[1], draft.actions[0], draft.actions[2]];
  const latest = clone(base);
  latest.title = "Remote title";
  latest.actions = [latest.actions[0], latest.actions[2], latest.actions[1]];
  const merged = aura.mergeAuraDraft(base, draft, latest);
  assert.deepEqual(merged.conflicts, ["title", "actions.$order"]);
  assert.equal(merged.value.title, "Local title");
  assert.deepEqual(
    merged.value.actions.map(({ id }) => id),
    ["b", "a", "c"],
  );
  assert.deepEqual(
    aura.mergeAuraDraft(base, draft, clone(draft)).conflicts,
    [],
  );
});

test("local removals are respected but conflict when the removed item changed remotely", () => {
  const base = goal("g", { actions: [action("a"), action("b")] });
  const draft = clone(base);
  draft.actions = [draft.actions[1]];
  const latest = clone(base);
  latest.actions[0].evidence = "A newly completed action";
  latest.actions.push(action("remote-new"));
  const merged = aura.mergeAuraDraft(base, draft, latest);
  assert.deepEqual(merged.conflicts, ["actions[a]"]);
  assert.deepEqual(
    merged.value.actions.map(({ id }) => id),
    ["b", "remote-new"],
  );
  latest.actions[0].evidence = "";
  assert.deepEqual(aura.mergeAuraDraft(base, draft, latest).conflicts, []);

  const edited = clone(base);
  edited.actions[0].title = "Changed locally";
  const remoteRemoved = clone(base);
  remoteRemoved.actions = [remoteRemoved.actions[1]];
  const resurrected = aura.mergeAuraDraft(base, edited, remoteRemoved);
  assert.deepEqual(resurrected.conflicts, ["actions[a]"]);
  assert.equal(
    resurrected.value.actions.find(({ id }) => id === "a").title,
    "Changed locally",
  );
});

test("primitive arrays inherit unchanged drafts or produce an explicit overlapping-field conflict", () => {
  const base = { checks: { "2026-09-30": [] }, note: "" };
  const latest = { checks: { "2026-09-30": ["remote-step"] }, note: "" };
  const inherited = aura.mergeAuraDraft(
    base,
    { ...clone(base), note: "Local note" },
    latest,
  );
  assert.deepEqual(inherited.conflicts, []);
  assert.deepEqual(inherited.value.checks, latest.checks);
  const overlapping = aura.mergeAuraDraft(
    base,
    { ...clone(base), checks: { "2026-09-30": ["local-step"] } },
    latest,
  );
  assert.deepEqual(overlapping.conflicts, ["checks.2026-09-30"]);
  assert.deepEqual(overlapping.value.checks["2026-09-30"], ["local-step"]);
});

const compile = (path) =>
  ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

// Isolated integration doubles: no real database, credentials, or production data.
function setup({
  session = {
    userId: "user-a",
    allowedPages: ["/admin/x5-execution"],
    isOwner: false,
  },
  databaseConfigured = true,
  fail = false,
} = {}) {
  const records = new Map();
  const queries = [];
  const connections = [];
  let ended = 0;
  class Client {
    constructor(config) {
      connections.push(config);
    }
    async connect() {
      if (fail)
        throw new Error("Database unavailable; private connection detail");
    }
    async end() {
      ended += 1;
    }
    async query(sql, parameters = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, parameters });
      if (normalized.startsWith("create table")) return { rows: [] };
      const [userId, serialized, revision] = parameters;
      const existing = records.get(userId);
      if (normalized.startsWith("select workspace"))
        return { rows: existing ? [clone(existing)] : [] };
      if (normalized.startsWith("insert into aura_workspaces")) {
        assert.match(normalized, /on conflict \(user_id\) do nothing/);
        if (existing) return { rows: [] };
        const row = { workspace: JSON.parse(serialized), revision: "1" };
        records.set(userId, row);
        return { rows: [clone(row)] };
      }
      if (normalized.startsWith("update aura_workspaces")) {
        assert.match(normalized, /where user_id = \$1 and revision = \$3/);
        assert.match(normalized, /revision = revision \+ 1/);
        if (!existing || Number(existing.revision) !== revision)
          return { rows: [] };
        const row = {
          workspace: JSON.parse(serialized),
          revision: String(revision + 1),
        };
        records.set(userId, row);
        return { rows: [clone(row)] };
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    }
  }
  const store = {};
  const env = databaseConfigured
    ? { DATABASE_URL: "postgres://test.invalid/aura?sslmode=require" }
    : {};
  const storeModules = {
    "server-only": {},
    pg: { Client },
    "@/lib/aura": aura,
  };
  vm.runInNewContext(compile("../src/lib/aura-store.ts"), {
    exports: store,
    require: (name) => storeModules[name],
    process: { env },
    URL,
    Error,
  });
  const modules = {
    "next/server": {
      NextResponse: { json: (body, options) => Response.json(body, options) },
    },
    "@/lib/admin-request": { getAdminRequestSession: async () => session },
    "@/lib/admin-access": access,
    "@/lib/aura": aura,
    "@/lib/aura-store": store,
    "@/lib/request-safety": safety,
  };
  const route = {};
  vm.runInNewContext(compile("../app/api/admin/aura/route.ts"), {
    exports: route,
    require: (name) => {
      if (!modules[name]) throw new Error(name);
      return modules[name];
    },
    Buffer,
    URL,
    Error,
    console: { error() {} },
  });
  const request = (method = "GET", body, options = {}) =>
    new Request(`https://aura.test/api/admin/aura${options.query || ""}`, {
      method,
      headers: {
        origin: "https://aura.test",
        ...(method === "PUT" ? { "content-type": "application/json" } : {}),
        ...options.headers,
      },
      ...(body === undefined
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
  return {
    store,
    route,
    records,
    queries,
    connections,
    request,
    setSession: (value) => {
      session = value;
    },
    get: (options) => route.GET(request("GET", undefined, options)),
    put: (body, options) =>
      route.PUT(
        request(
          "PUT",
          body && typeof body === "object" && !Array.isArray(body)
            ? { accountScope: session?.userId, ...body }
            : body,
          options,
        ),
      ),
    get ended() {
      return ended;
    },
  };
}

test("Aura API maps to its page permission and denies unauthenticated or unrelated access", async () => {
  assert.equal(
    access.resolveAdminApiPermission("/api/admin/aura"),
    "/admin/x5-execution",
  );
  assert.equal(
    access.resolveAdminApiPermission("/api/admin/aura/child"),
    "/admin/x5-execution",
  );
  assert.equal(access.resolveAdminApiPermission("/api/admin/aural"), null);
  for (const [session, status] of [
    [null, 401],
    [{ userId: "user-a", allowedPages: ["/admin"], isOwner: false }, 403],
  ]) {
    const s = setup({ session });
    assert.equal((await s.get()).status, status);
    assert.equal(
      (await s.put({ workspace: workspace(), revision: 0 })).status,
      status,
    );
    assert.equal(s.connections.length, 0);
  }
});

test("first load is empty, saves are durable on reload, and responses prohibit shared caching", async () => {
  const s = setup();
  const initial = await s.get();
  assert.equal(initial.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await initial.json(), {
    workspace: aura.EMPTY_AURA_WORKSPACE,
    revision: 0,
    accountScope: "user-a",
  });
  const saved = await s.put({ workspace: workspace(), revision: 0 });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), {
    workspace: workspace(),
    revision: 1,
    accountScope: "user-a",
  });
  assert.deepEqual(await (await s.get()).json(), {
    workspace: workspace(),
    revision: 1,
    accountScope: "user-a",
  });
  assert.ok(s.queries.every(({ sql }) => sql.includes("aura_workspaces")));
  assert.match(s.connections[0].connectionString, /sslmode=verify-full/);
  assert.equal(s.ended, s.connections.length);
});

test("stored workspaces are isolated by session ID, even for an owner", async () => {
  const owner = { userId: "owner-a", allowedPages: [], isOwner: true };
  const s = setup({ session: owner });
  s.records.set("other-user", {
    workspace: { ...workspace(), vision: "Private other workspace" },
    revision: "9",
  });
  assert.equal(
    (await s.put({ workspace: workspace(), revision: 0 })).status,
    200,
  );
  assert.equal((await s.get({ query: "?userId=other-user" })).status, 400);
  assert.equal(
    (await s.put({ workspace: workspace(), revision: 1, userId: "other-user" }))
      .status,
    400,
  );
  assert.equal(
    (
      await s.put(
        { workspace: workspace(), revision: 1 },
        { query: "?userId=other-user" },
      )
    ).status,
    400,
  );
  assert.equal(s.records.get("other-user").revision, "9");
  assert.equal(s.records.get("owner-a").revision, "1");
  assert.ok(
    s.queries
      .filter(({ parameters }) => parameters.length)
      .every(({ parameters }) => parameters[0] === "owner-a"),
  );
});

test("switching accounts rejects an old loaded draft at coinciding revisions without reading or writing the new account", async () => {
  for (const revision of [0, 1]) {
    const sessionA = {
      userId: "user-a",
      allowedPages: ["/admin/x5-execution"],
      isOwner: false,
    };
    const sessionB = { userId: "user-b", allowedPages: [], isOwner: true };
    const s = setup({ session: sessionA });
    if (revision === 1) {
      s.records.set("user-a", {
        workspace: { ...workspace(), vision: "Account A's private notes" },
        revision: "1",
      });
      s.records.set("user-b", {
        workspace: { ...workspace(), vision: "Account B's private notes" },
        revision: "1",
      });
    }
    const loadedA = await (await s.get()).json();
    assert.equal(loadedA.accountScope, "user-a");
    assert.equal(loadedA.revision, revision);
    const draftA = {
      ...loadedA.workspace,
      vision: "Account A's unsaved private draft",
    };
    const before = clone([...s.records]);
    const connectionsBeforeSwitch = s.connections.length;
    s.setSession(sessionB);
    const response = await s.route.PUT(
      s.request("PUT", {
        workspace: draftA,
        revision: loadedA.revision,
        accountScope: loadedA.accountScope,
      }),
    );
    assert.equal(response.status, 409);
    const result = await response.json();
    assert.equal(result.code, "ACCOUNT_CHANGED");
    assert.match(result.error, /signed-in account changed/);
    assert.deepEqual(Object.keys(result).sort(), ["code", "error"]);
    assert.doesNotMatch(
      JSON.stringify(result),
      /user-b|Account B's private notes/,
    );
    assert.equal(s.connections.length, connectionsBeforeSwitch);
    assert.deepEqual(clone([...s.records]), before);

    // Explicitly opening B's workspace establishes a new scope; no A draft is reused.
    const loadedB = await (await s.get()).json();
    assert.equal(loadedB.accountScope, "user-b");
    const savedB = await s.route.PUT(
      s.request("PUT", {
        workspace: { ...loadedB.workspace, vision: "Account B's own new note" },
        revision: loadedB.revision,
        accountScope: loadedB.accountScope,
      }),
    );
    assert.equal(savedB.status, 200);
    assert.equal((await savedB.json()).accountScope, "user-b");
    s.setSession(sessionA);
    assert.deepEqual(await (await s.get()).json(), loadedA);
  }
});

test("PUT requires a valid loaded account scope and never treats it as the store target", async () => {
  const s = setup();
  const missing = await s.route.PUT(
    s.request("PUT", { workspace: workspace(), revision: 0 }),
  );
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /account scope/);
  for (const accountScope of [null, 123, "", "x".repeat(255)]) {
    assert.equal(
      (await s.put({ workspace: workspace(), revision: 0, accountScope }))
        .status,
      400,
    );
  }
  const foreign = await s.put({
    workspace: workspace(),
    revision: 0,
    accountScope: "user-b",
  });
  assert.equal(foreign.status, 409);
  assert.equal((await foreign.json()).code, "ACCOUNT_CHANGED");
  assert.equal(s.connections.length, 0);
  assert.equal(s.records.size, 0);
});

test("simultaneous first saves and stale updates return 409 without overwriting newer data", async () => {
  const s = setup();
  const first = { ...workspace(), vision: "First save" };
  const second = { ...workspace(), vision: "Other tab" };
  const responses = await Promise.all([
    s.put({ workspace: first, revision: 0 }),
    s.put({ workspace: second, revision: 0 }),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
  const current = await (await s.get()).json();
  const updated = { ...current.workspace, vision: "Newer version" };
  assert.equal((await s.put({ workspace: updated, revision: 1 })).status, 200);
  const conflict = await s.put({ workspace: first, revision: 1 });
  assert.equal(conflict.status, 409);
  assert.match((await conflict.json()).error, /another tab or device/);
  assert.deepEqual(await (await s.get()).json(), {
    workspace: updated,
    revision: 2,
    accountScope: "user-a",
  });
  const missing = setup();
  assert.equal(
    (await missing.put({ workspace: first, revision: 4 })).status,
    409,
  );
  assert.equal(missing.records.size, 0);
});

test("cross-origin and cross-site requests are denied before database access", async () => {
  for (const headers of [
    { origin: "https://evil.test" },
    { origin: "http://aura.test" },
    { origin: "null" },
    { "sec-fetch-site": "cross-site" },
  ]) {
    const s = setup();
    assert.equal((await s.get({ headers })).status, 403);
    assert.equal(
      (await s.put({ workspace: workspace(), revision: 0 }, { headers }))
        .status,
      403,
    );
    assert.equal(s.connections.length, 0);
  }
});

test("malformed JSON, bad revisions, unknown envelope fields, and oversized requests return 400", async () => {
  const s = setup();
  for (const body of [
    "{",
    "null",
    "[]",
    { workspace: workspace() },
    { workspace: workspace(), revision: -1 },
    { workspace: workspace(), revision: 1.5 },
    { workspace: workspace(), revision: "0" },
    { workspace: workspace(), revision: Number.MAX_SAFE_INTEGER },
    { workspace: {}, revision: 0 },
    { workspace: workspace(), revision: 0, anything: true },
  ]) {
    assert.equal((await s.put(body)).status, 400);
  }
  assert.equal(
    (
      await s.put(
        { workspace: workspace(), revision: 0 },
        { headers: { "content-type": "text/plain" } },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await s.put(
        { workspace: workspace(), revision: 0 },
        { headers: { "content-length": "1000001" } },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await s.put(
        { workspace: workspace(), revision: 0 },
        { headers: { "content-length": "NaN" } },
      )
    ).status,
    400,
  );
  // No Content-Length: the stream itself is bounded, including multi-byte UTF-8.
  assert.equal(
    (
      await s.put(
        JSON.stringify({
          workspace: { ...workspace(), vision: "🌿".repeat(300_000) },
          revision: 0,
        }),
      )
    ).status,
    400,
  );
  assert.equal(s.connections.length, 0);
});

test("missing configuration, connection errors, and corrupt saved documents fail visibly with 503", async () => {
  for (const options of [{ databaseConfigured: false }, { fail: true }]) {
    const s = setup(options);
    const load = await s.get();
    const save = await s.put({ workspace: workspace(), revision: 0 });
    assert.equal(load.status, 503);
    assert.equal(save.status, 503);
    assert.match((await load.json()).error, /could not be loaded/);
    const error = (await save.json()).error;
    assert.match(error, /could not be saved/);
    assert.doesNotMatch(error, /private connection detail|postgres:\/\//);
    assert.equal(s.records.size, 0);
    assert.equal(s.ended, s.connections.length);
  }
  const s = setup();
  s.records.set("user-a", { workspace: { schemaVersion: 999 }, revision: "1" });
  assert.equal((await s.get()).status, 503);
  assert.equal(s.records.get("user-a").workspace.schemaVersion, 999);
});

test("store independently validates input and never trusts caller-supplied revisions", async () => {
  const s = setup();
  await assert.rejects(
    () => s.store.getStoredAuraWorkspace(""),
    /session user/,
  );
  await assert.rejects(
    () => s.store.saveStoredAuraWorkspace("user-a", workspace(), -1),
    /revision/,
  );
  await assert.rejects(
    () =>
      s.store.saveStoredAuraWorkspace(
        "user-a",
        workspace(),
        Number.MAX_SAFE_INTEGER,
      ),
    /revision/,
  );
  await assert.rejects(
    () => s.store.saveStoredAuraWorkspace("user-a", {}, 0),
    /version/,
  );
  assert.equal(s.connections.length, 0);
  await s.store.saveStoredAuraWorkspace("user-a", workspace(), 0);
  await s.store.saveStoredAuraWorkspace(
    "user-b",
    { ...workspace(), vision: "Another account" },
    0,
  );
  assert.equal(
    (await s.store.getStoredAuraWorkspace("user-a")).workspace.vision,
    "An intentional life",
  );
  assert.equal(
    (await s.store.getStoredAuraWorkspace("user-b")).workspace.vision,
    "Another account",
  );
  await assert.rejects(
    () => s.store.saveStoredAuraWorkspace("user-a", workspace(), 900),
    s.store.AuraRevisionConflictError,
  );
  assert.equal((await s.store.getStoredAuraWorkspace("user-a")).revision, 1);
});
