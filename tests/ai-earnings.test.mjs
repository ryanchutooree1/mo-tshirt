import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as earnings from "../src/lib/ai-earnings.ts";
import * as access from "../src/lib/admin-access.ts";
import * as safety from "../src/lib/request-safety.ts";

// Synthetic fixtures only. These tests never use a real database or account.
const clone = (value) => JSON.parse(JSON.stringify(value));
const event = (id = "payment-1", extra = {}) => ({
  id,
  date: "2026-10-01",
  amountMinor: 10_000,
  note: "Synthetic test receipt",
  ...extra,
});
const entry = (id = "entry-1", extra = {}) => ({
  id,
  project: "Synthetic design project",
  client: "Example client",
  description: "A small design delivery",
  aiContribution: "AI assisted with the initial draft",
  currency: "MUR",
  agreedAmountMinor: 25_000,
  costsComplete: false,
  archived: false,
  payments: [event(`${id}-payment`)],
  costs: [],
  ...extra,
});
const ledger = (entries = [entry()]) => ({ schemaVersion: 1, entries });
const namedLedger = (project) => ledger([entry("entry-1", { project })]);

test("AI earnings starts empty and fixes its start date, timezone, and supported currencies", () => {
  assert.deepEqual(earnings.EMPTY_AI_EARNINGS_LEDGER, { schemaVersion: 1, entries: [] });
  assert.equal(earnings.TRACKING_START, "2026-10-01");
  assert.equal(earnings.TRACKING_TIME_ZONE, "Indian/Mauritius");
  assert.deepEqual(earnings.CURRENCIES, ["MUR", "USD", "EUR", "GBP", "ZAR", "AUD", "CAD", "INR"]);
  assert.deepEqual(earnings.summarizeAiEarnings(earnings.EMPTY_AI_EARNINGS_LEDGER, "2026-10-01"), []);
});

test("decimal amount parsing preserves cents exactly without binary float rounding", () => {
  for (const [input, expected] of [
    ["0", 0], ["0.00", 0], ["0.01", 1], ["0.10", 10],
    ["0.29", 29], ["1", 100], ["1.2", 120], ["1.23", 123],
    ["10.07", 1007], ["1.01", 101], ["12345678.90", 1_234_567_890],
  ]) {
    assert.equal(earnings.moneyToMinor(input), expected, input);
  }
});

test("amount parsing rejects ambiguous, signed, nondecimal, overprecise, and unsafe inputs", () => {
  for (const input of [
    "", " ", "-1", "-0.01", "+1", "1,000", "1,20", "1 000", "1_000",
    "1e3", "1E3", "0x10", "NaN", "Infinity", "1.001", "0.009", "1.2.3",
    "MUR 12.00", "$12", "90071992547409.92", "999999999999999999999999999999",
  ]) {
    assert.equal(earnings.moneyToMinor(input), null, input);
  }
});

test("Mauritius reporting dates do not depend on the server or browser timezone", () => {
  for (const [instant, expected] of [
    ["2026-09-30T19:59:59.999Z", "2026-09-30"],
    ["2026-09-30T20:00:00.000Z", "2026-10-01"],
    ["2026-10-01T19:59:59.999Z", "2026-10-01"],
    ["2026-12-31T20:00:00.000Z", "2027-01-01"],
  ]) assert.equal(earnings.todayInMauritius(new Date(instant)), expected);
  for (const timezone of ["Pacific/Honolulu", "UTC", "Pacific/Kiritimati"]) {
    const result = execFileSync(process.execPath, [
      "--no-warnings", "--input-type=module", "-e",
      "import {todayInMauritius} from './src/lib/ai-earnings.ts';process.stdout.write(todayInMauritius(new Date('2026-09-30T20:30:00Z')));",
    ], { cwd: new URL("..", import.meta.url), env: { ...process.env, TZ: timezone }, encoding: "utf8" });
    assert.equal(result, "2026-10-01");
  }
  assert.throws(() => earnings.todayInMauritius(new Date("invalid")));
});

test("validated ledgers round-trip explicit unknown costs and are deeply independent", () => {
  const input = ledger([entry("entry-1", { costs: [event("cost-1", { amountMinor: 2500 })] })]);
  const before = clone(input);
  const valid = earnings.validateAiEarningsLedger(input);
  assert.deepEqual(valid, before);
  assert.notEqual(valid, input);
  assert.notEqual(valid.entries[0], input.entries[0]);
  valid.entries[0].payments[0].note = "Changed validated copy";
  valid.entries[0].costs[0].amountMinor = 99;
  assert.deepEqual(input, before);
});

test("partial payments, recorded costs, and known unpaid balances use exact integer arithmetic", () => {
  const value = ledger([entry("partial", {
    agreedAmountMinor: 10_000,
    payments: [event("p1", { amountMinor: 3333 }), event("p2", { amountMinor: 1667 })],
    costs: [event("c1", { amountMinor: 1200 }), event("c2", { amountMinor: 301 })],
    costsComplete: true,
  })]);
  assert.deepEqual(earnings.summarizeAiEarnings(value, "2026-10-01"), [{
    currency: "MUR", receivedMinor: 5000, costMinor: 1501, netMinor: 3499,
    pendingMinor: 5000, costsComplete: true, entryCount: 1,
  }]);
  const tiny = ledger([entry("tiny", {
    payments: Array.from({ length: 100 }, (_, i) => event(`p${i}`, { amountMinor: 1 })),
    costs: [event("c1", { amountMinor: 29 }), event("c2", { amountMinor: 71 })],
    agreedAmountMinor: 100,
  })]);
  const [total] = earnings.summarizeAiEarnings(tiny, "2026-10-01");
  assert.equal(total.receivedMinor, 100);
  assert.equal(total.costMinor, 100);
  assert.equal(total.netMinor, 0);
  assert.equal(total.pendingMinor, 0);
});

test("summaries keep currencies separate and never convert or combine unlike money", () => {
  const value = ledger(earnings.CURRENCIES.map((currency, i) => entry(`entry-${i}`, {
    currency,
    payments: [event(`payment-${i}`, { amountMinor: (i + 1) * 100 })],
    agreedAmountMinor: null,
    costsComplete: true,
  })));
  const result = earnings.summarizeAiEarnings(value, "2026-10-01");
  assert.equal(result.length, earnings.CURRENCIES.length);
  for (const [i, currency] of earnings.CURRENCIES.entries()) {
    assert.deepEqual(result.find((row) => row.currency === currency), {
      currency, receivedMinor: (i + 1) * 100, costMinor: 0, netMinor: (i + 1) * 100,
      pendingMinor: 0, costsComplete: true, entryCount: 1,
    });
  }
});

test("unknown costs remain explicit, complete zero costs are allowed, and negative net is retained", () => {
  const value = ledger([
    entry("known", { payments: [], costsComplete: true, agreedAmountMinor: 0 }),
    entry("unknown", { payments: [event("p", { amountMinor: 100 })], costs: [event("c", { amountMinor: 250 })], agreedAmountMinor: null }),
  ]);
  const [result] = earnings.summarizeAiEarnings(value, "2026-10-01");
  assert.equal(result.receivedMinor, 100);
  assert.equal(result.costMinor, 250);
  assert.equal(result.netMinor, -150);
  assert.equal(result.costsComplete, false);
  assert.equal(result.entryCount, 2);
  assert.equal(result.pendingMinor, 0);
  value.entries[1].costsComplete = true;
  assert.equal(earnings.summarizeAiEarnings(value, "2026-10-01")[0].costsComplete, true);
});

test("archived work is excluded without mutating it or contaminating cost completeness", () => {
  const value = ledger([
    entry("active", { payments: [event("active-p", { amountMinor: 100 })], costsComplete: true, agreedAmountMinor: 200 }),
    entry("archived", { archived: true, payments: [event("archived-p", { amountMinor: 9_000_000 })], costs: [event("archived-c", { amountMinor: 2_000_000 })], agreedAmountMinor: 99_000_000 }),
    entry("archived-usd", { archived: true, currency: "USD" }),
  ]);
  const before = clone(value);
  assert.deepEqual(earnings.summarizeAiEarnings(value, "2026-10-01"), [{
    currency: "MUR", receivedMinor: 100, costMinor: 0, netMinor: 100,
    pendingMinor: 100, costsComplete: true, entryCount: 1,
  }]);
  assert.deepEqual(value, before);
  assert.deepEqual(earnings.summarizeAiEarnings(ledger(value.entries.slice(1)), "2026-10-01"), []);
});

test("reporting window includes boundary days and excludes pre-start and later receipts and costs", () => {
  const value = ledger([entry("window", {
    agreedAmountMinor: null,
    payments: [
      event("p-old", { date: "2026-09-30", amountMinor: 1000 }),
      event("p-start", { date: "2026-10-01", amountMinor: 200 }),
      event("p-end", { date: "2026-10-02", amountMinor: 300 }),
      event("p-later", { date: "2026-10-03", amountMinor: 2000 }),
    ],
    costs: [
      event("c-old", { date: "2026-09-30", amountMinor: 500 }),
      event("c-start", { date: "2026-10-01", amountMinor: 50 }),
      event("c-end", { date: "2026-10-02", amountMinor: 70 }),
      event("c-later", { date: "2026-10-03", amountMinor: 900 }),
    ],
  })]);
  const [total] = earnings.summarizeAiEarnings(value, "2026-10-02");
  assert.equal(total.receivedMinor, 500);
  assert.equal(total.costMinor, 120);
  assert.equal(total.netMinor, 380);
  assert.equal(total.pendingMinor, 0);
});

test("overpayment cannot make pending negative and unknown agreed amounts do not invent a balance", () => {
  const value = ledger([
    entry("overpaid", { agreedAmountMinor: 100, payments: [event("p1", { amountMinor: 200 })] }),
    entry("unknown", { agreedAmountMinor: null, payments: [event("p2", { amountMinor: 300 })] }),
    entry("unpaid", { agreedAmountMinor: 400, payments: [] }),
  ]);
  const [total] = earnings.summarizeAiEarnings(value, "2026-10-01");
  assert.equal(total.receivedMinor, 500);
  assert.equal(total.pendingMinor, 400);
});

test("validation rejects malformed top-level documents, fields, enums, and money types", () => {
  for (const value of [null, [], {}, { schemaVersion: 2, entries: [] }, { schemaVersion: "1", entries: [] }, { schemaVersion: 1, entries: null }]) {
    assert.throws(() => earnings.validateAiEarningsLedger(value));
  }
  const cases = [
    ["project", " "], ["project", 123], ["client", null], ["description", []],
    ["aiContribution", {}], ["currency", "JPY"], ["currency", "mur"],
    ["costsComplete", "false"], ["costsComplete", 0], ["archived", "true"],
    ["archived", null], ["payments", null], ["costs", {}],
    ["agreedAmountMinor", -1], ["agreedAmountMinor", 1.5], ["agreedAmountMinor", "100"],
    ["agreedAmountMinor", NaN], ["agreedAmountMinor", Infinity], ["agreedAmountMinor", Number.MAX_SAFE_INTEGER + 1],
  ];
  for (const [key, value] of cases) {
    assert.throws(() => earnings.validateAiEarningsLedger(ledger([entry("entry-1", { [key]: value })])), undefined, key);
  }
  for (const key of Object.keys(entry())) {
    const value = entry();
    delete value[key];
    assert.throws(() => earnings.validateAiEarningsLedger(ledger([value])), undefined, `missing ${key}`);
  }
});

test("payment and cost amounts must be positive safe integer minor units", () => {
  for (const collection of ["payments", "costs"]) {
    for (const amountMinor of [0, -1, 0.01, "100", null, undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const value = ledger([entry("entry-1", { [collection]: [event("event-1", { amountMinor })] })]);
      assert.throws(() => earnings.validateAiEarningsLedger(value), undefined, `${collection}: ${amountMinor}`);
    }
    for (const malformed of [null, [], "payment", { id: "p" }]) {
      assert.throws(() => earnings.validateAiEarningsLedger(ledger([entry("entry-1", { [collection]: [malformed] })])));
    }
  }
});

test("calendar validation rejects impossible dates and noncanonical date formats", () => {
  for (const date of ["", "1999-12-31", "2100-01-01", "2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-01", "2026-10-00", "2026-10-32", "2026-1-01", "2026-10-1", "01/10/2026", "2026-10-01T00:00:00Z", "today", null]) {
    for (const collection of ["payments", "costs"]) {
      assert.throws(() => earnings.validateAiEarningsLedger(ledger([entry("entry-1", { [collection]: [event("event-1", { date })] })])), undefined, String(date));
    }
  }
  assert.doesNotThrow(() => earnings.validateAiEarningsLedger(ledger([entry("leap", { payments: [event("p", { date: "2028-02-29" })] })])));
});

test("IDs must be valid and unique so receipts and entries cannot silently overwrite each other", () => {
  for (const id of ["", " ", null, 123, "x".repeat(1000)]) {
    assert.throws(() => earnings.validateAiEarningsLedger(ledger([entry(id)])));
    assert.throws(() => earnings.validateAiEarningsLedger(ledger([entry("entry-1", { payments: [event(id)] })])));
  }
  assert.throws(() => earnings.validateAiEarningsLedger(ledger([entry("same"), entry("same")])));
  for (const collection of ["payments", "costs"]) {
    assert.throws(() => earnings.validateAiEarningsLedger(ledger([entry("entry-1", { [collection]: [event("same"), event("same")] })])));
  }
  assert.throws(() => earnings.validateAiEarningsLedger(ledger([entry("shared", { payments: [event("shared")] })])));
  assert.throws(() => earnings.validateAiEarningsLedger(ledger([entry("entry-1", { payments: [event("shared")], costs: [event("shared")] })])));
  assert.throws(() => earnings.validateAiEarningsLedger(ledger([entry("entry-1", { payments: [event("shared")] }), entry("entry-2", { costs: [event("shared")] })])));
});

test("strict fields reject ownership, derived totals, and other unrecognized nested data", () => {
  const cases = [
    (value) => { value.userId = "other-user"; },
    (value) => { value.entries[0].owner = "other-user"; },
    (value) => { value.entries[0].netMinor = 99999; },
    (value) => { value.entries[0].payments[0].currency = "USD"; },
    (value) => { value.entries[0].costs = [event("cost", { hidden: true })]; },
  ];
  for (const mutate of cases) {
    const value = ledger();
    mutate(value);
    assert.throws(() => earnings.validateAiEarningsLedger(value), /unsupported fields/);
  }
});

test("collection, text, ID, and amount limits are enforced at their exact boundaries", () => {
  const maximum = earnings.MAX_AMOUNT_MINOR;
  assert.equal(maximum, 10_000_000_000);
  assert.equal(earnings.moneyToMinor("100000000.00"), maximum);
  assert.equal(earnings.moneyToMinor("100000000.01"), null);
  assert.equal(earnings.moneyToMinor(" 0001.20 "), 120);
  for (const [key, limit] of [["project", 160], ["client", 160], ["description", 2000], ["aiContribution", 2000]]) {
    assert.doesNotThrow(() => earnings.validateAiEarningsLedger(ledger([entry("e", { [key]: "x".repeat(limit) })])));
    assert.throws(() => earnings.validateAiEarningsLedger(ledger([entry("e", { [key]: "x".repeat(limit + 1) })])));
  }
  assert.doesNotThrow(() => earnings.validateAiEarningsLedger(ledger([entry("x".repeat(100), { payments: [event("p", { note: "x".repeat(500), amountMinor: maximum })], agreedAmountMinor: maximum })])));
  assert.throws(() => earnings.validateAiEarningsLedger(ledger([entry("x".repeat(101))])));
  assert.throws(() => earnings.validateAiEarningsLedger(ledger([entry("e", { payments: [event("p", { note: "x".repeat(501) })] })])));
  assert.throws(() => earnings.validateAiEarningsLedger(ledger([entry("e", { agreedAmountMinor: maximum + 1 })])));
  assert.throws(() => earnings.validateAiEarningsLedger(ledger([entry("e", { payments: [event("p", { amountMinor: maximum + 1 })] })])));
  for (const collection of ["payments", "costs"]) {
    const rows = Array.from({ length: 100 }, (_, i) => event(`bounded-${i}`));
    assert.doesNotThrow(() => earnings.validateAiEarningsLedger(ledger([entry("e", { [collection]: rows })])));
    assert.throws(() => earnings.validateAiEarningsLedger(ledger([entry("e", { [collection]: [...rows, event("one-too-many")] })])));
  }
  const rows = Array.from({ length: 500 }, (_, i) => entry(`bounded-entry-${i}`, { archived: true }));
  assert.doesNotThrow(() => earnings.validateAiEarningsLedger(ledger(rows)));
  assert.throws(() => earnings.validateAiEarningsLedger(ledger([...rows, entry("one-too-many")])));
});

test("the maximum permitted ledger remains within safe-integer arithmetic", () => {
  const value = ledger(Array.from({ length: 500 }, (_, i) => entry(`maximum-${i}`, {
    agreedAmountMinor: earnings.MAX_AMOUNT_MINOR,
    payments: Array.from({ length: 100 }, (_, j) => event(`maximum-${i}-p-${j}`, { amountMinor: earnings.MAX_AMOUNT_MINOR })),
    costs: Array.from({ length: 100 }, (_, j) => event(`maximum-${i}-c-${j}`, { amountMinor: earnings.MAX_AMOUNT_MINOR - 1 })),
  })));
  const [total] = earnings.summarizeAiEarnings(earnings.validateAiEarningsLedger(value), "2026-10-01");
  assert.equal(total.receivedMinor, 500_000_000_000_000);
  assert.equal(total.costMinor, 499_999_999_950_000);
  assert.equal(total.netMinor, 50_000);
  assert.equal(Number.isSafeInteger(total.receivedMinor), true);
  assert.equal(total.pendingMinor, 0);
});

test("pending subtracts pre-start payments while reported cash excludes them", () => {
  const item = entry("prior-deposit", {
    agreedAmountMinor: 1000,
    payments: [
      event("old", { date: "2026-09-30", amountMinor: 400 }),
      event("current", { date: "2026-10-01", amountMinor: 200 }),
      event("future", { date: "2026-10-02", amountMinor: 300 }),
    ],
    costs: [event("cost", { amountMinor: 50 })],
  });
  assert.deepEqual(earnings.entryTotals(item, "2026-10-01"), {
    receivedMinor: 200, costMinor: 50, netMinor: 150, pendingMinor: 400,
  });
  assert.deepEqual(earnings.entryTotals(item, "2026-09-30"), {
    receivedMinor: 0, costMinor: 0, netMinor: 0, pendingMinor: 600,
  });
  assert.equal(earnings.summarizeAiEarnings(ledger([item]), "2026-10-01")[0].pendingMinor, 400);
  for (const date of ["", "2026-02-29", "2026-10-1", "1999-12-31", "2100-01-01"]) {
    assert.throws(() => earnings.summarizeAiEarnings(ledger([item]), date));
  }
});

const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// The actual route and store run against an in-memory PostgreSQL protocol double.
// Its CAS operations enforce the same user_id/revision conditions as PostgreSQL.
function setup({
  session = { userId: "user-a", allowedPages: ["/admin/x5-execution"], isOwner: false },
  databaseConfigured = true,
  fail = false,
} = {}) {
  const records = new Map();
  const queries = [];
  const connections = [];
  let ended = 0;
  class Client {
    constructor(config) { connections.push(config); }
    async connect() { if (fail) throw new Error("Database unavailable; private connection detail"); }
    async end() { ended += 1; }
    async query(sql, parameters = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, parameters });
      if (normalized.startsWith("create table")) return { rows: [] };
      const [userId, serialized, revision] = parameters;
      const existing = records.get(userId);
      if (normalized.startsWith("select ledger")) {
        assert.match(normalized, /where user_id = \$1/);
        return { rows: existing ? [clone(existing)] : [] };
      }
      if (normalized.startsWith("insert into ai_earnings_ledgers")) {
        assert.match(normalized, /on conflict \(user_id\) do nothing/);
        if (existing) return { rows: [] };
        const row = { ledger: JSON.parse(serialized), revision: "1" };
        records.set(userId, row);
        return { rows: [clone(row)] };
      }
      if (normalized.startsWith("update ai_earnings_ledgers")) {
        assert.match(normalized, /where user_id = \$1 and revision = \$3/);
        assert.match(normalized, /revision = revision \+ 1/);
        if (!existing || Number(existing.revision) !== revision) return { rows: [] };
        const row = { ledger: JSON.parse(serialized), revision: String(revision + 1) };
        records.set(userId, row);
        return { rows: [clone(row)] };
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    }
  }
  const store = {};
  const storeModules = { "server-only": {}, pg: { Client }, "@/lib/ai-earnings": earnings };
  vm.runInNewContext(compile("../src/lib/ai-earnings-store.ts"), {
    exports: store,
    require: (name) => { if (!(name in storeModules)) throw new Error(name); return storeModules[name]; },
    process: { env: databaseConfigured ? { DATABASE_URL: "postgres://test.invalid/ai-earnings?sslmode=require" } : {} },
    URL, Error,
  });
  const modules = {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/admin-request": { getAdminRequestSession: async () => session },
    "@/lib/admin-access": access,
    // A fixed reporting day keeps API future-date tests valid in later years.
    "@/lib/ai-earnings": { ...earnings, todayInMauritius: () => "2026-10-01" },
    "@/lib/ai-earnings-store": store,
    "@/lib/request-safety": safety,
  };
  const route = {};
  vm.runInNewContext(compile("../app/api/admin/ai-earnings/route.ts"), {
    exports: route,
    require: (name) => { if (!(name in modules)) throw new Error(name); return modules[name]; },
    Buffer, URL, Error, console: { error() {} },
  });
  const request = (method = "GET", body, options = {}) => {
    const headers = new Headers({ origin: "https://earnings.test", ...(method === "PUT" ? { "content-type": "application/json" } : {}) });
    for (const [name, value] of Object.entries(options.headers || {})) {
      if (value === null) headers.delete(name);
      else headers.set(name, value);
    }
    return new Request(`https://earnings.test/api/admin/ai-earnings${options.query || ""}`, {
      method, headers,
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
  };
  return {
    store, route, records, queries, connections, request,
    setSession: (value) => { session = value; },
    get: (options) => route.GET(request("GET", undefined, options)),
    put: (body, options) => route.PUT(request("PUT", body && typeof body === "object" && !Array.isArray(body) ? { accountScope: session?.userId, ...body } : body, options)),
    get ended() { return ended; },
  };
}

test("AI earnings API maps to the Aura page permission and rejects anonymous or unrelated access", async () => {
  assert.equal(access.resolveAdminApiPermission("/api/admin/ai-earnings"), "/admin/x5-execution");
  assert.equal(access.resolveAdminApiPermission("/api/admin/ai-earnings/child"), "/admin/x5-execution");
  assert.equal(access.resolveAdminApiPermission("/api/admin/ai-earnings-other"), null);
  for (const [session, status] of [
    [null, 401],
    [{ userId: "user-a", allowedPages: ["/admin"], isOwner: false }, 403],
    [{ userId: "user-a", allowedPages: ["/admin/accounting"], isOwner: false }, 403],
  ]) {
    const s = setup({ session });
    assert.equal((await s.get()).status, status);
    assert.equal((await s.put({ ledger: ledger(), revision: 0 })).status, status);
    assert.equal(s.connections.length, 0);
  }
});

test("first load is empty, saves survive reload, and all responses prohibit shared caching", async () => {
  const s = setup();
  const initial = await s.get();
  assert.equal(initial.status, 200);
  assert.equal(initial.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await initial.json(), { ledger: earnings.EMPTY_AI_EARNINGS_LEDGER, revision: 0, accountScope: "user-a" });
  const saved = await s.put({ ledger: ledger(), revision: 0 });
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get("cache-control"), "private, no-store");
  const expected = { ledger: ledger(), revision: 1, accountScope: "user-a" };
  assert.deepEqual(await saved.json(), expected);
  assert.deepEqual(await (await s.get()).json(), expected);
  assert.ok(s.queries.every(({ sql }) => sql.includes("ai_earnings_ledgers")));
  assert.match(s.connections[0].connectionString, /sslmode=verify-full/);
  assert.equal(s.ended, s.connections.length);
  const bad = await s.put({ ledger: {}, revision: 1 });
  assert.equal(bad.status, 400);
  assert.equal(bad.headers.get("cache-control"), "private, no-store");
});

test("ledgers belong exclusively to the session user, including for owners", async () => {
  const owner = { userId: "owner-a", allowedPages: [], isOwner: true };
  const s = setup({ session: owner });
  const other = { ledger: namedLedger("Other account private project"), revision: "9" };
  s.records.set("other-user", clone(other));
  assert.equal((await s.put({ ledger: ledger(), revision: 0 })).status, 200);
  for (const query of ["?userId=other-user", "?accountScope=other-user", "?anything=1"]) {
    assert.equal((await s.get({ query })).status, 400);
    assert.equal((await s.put({ ledger: ledger(), revision: 1 }, { query })).status, 400);
  }
  assert.equal((await s.put({ ledger: ledger(), revision: 1, userId: "other-user" })).status, 400);
  assert.deepEqual(s.records.get("other-user"), other);
  assert.equal(s.records.get("owner-a").revision, "1");
  assert.ok(s.queries.filter(({ parameters }) => parameters.length).every(({ parameters }) => parameters[0] === "owner-a"));
  s.setSession({ userId: "other-user", allowedPages: ["/admin/x5-execution"], isOwner: false });
  assert.deepEqual(await (await s.get()).json(), { ...other, revision: 9, accountScope: "other-user" });
});

test("account switching rejects old drafts at matching revisions before accessing the new account", async () => {
  for (const revision of [0, 1]) {
    const sessionA = { userId: "user-a", allowedPages: ["/admin/x5-execution"], isOwner: false };
    const sessionB = { userId: "user-b", allowedPages: [], isOwner: true };
    const s = setup({ session: sessionA });
    if (revision === 1) {
      s.records.set("user-a", { ledger: namedLedger("Account A private project"), revision: "1" });
      s.records.set("user-b", { ledger: namedLedger("Account B private project"), revision: "1" });
    }
    const loadedA = await (await s.get()).json();
    assert.equal(loadedA.accountScope, "user-a");
    assert.equal(loadedA.revision, revision);
    const before = clone([...s.records]);
    const connectionsBefore = s.connections.length;
    s.setSession(sessionB);
    const response = await s.route.PUT(s.request("PUT", { ledger: namedLedger("Account A unsaved draft"), revision: loadedA.revision, accountScope: loadedA.accountScope }));
    assert.equal(response.status, 409);
    const result = await response.json();
    assert.equal(result.code, "ACCOUNT_CHANGED");
    assert.match(result.error, /signed-in account changed/);
    assert.deepEqual(Object.keys(result).sort(), ["code", "error"]);
    assert.doesNotMatch(JSON.stringify(result), /user-b|Account B private project/);
    assert.equal(s.connections.length, connectionsBefore);
    assert.deepEqual(clone([...s.records]), before);
    const loadedB = await (await s.get()).json();
    assert.equal(loadedB.accountScope, "user-b");
    const savedB = await s.route.PUT(s.request("PUT", { ledger: namedLedger("Account B new project"), revision: loadedB.revision, accountScope: loadedB.accountScope }));
    assert.equal(savedB.status, 200);
    assert.equal((await savedB.json()).accountScope, "user-b");
    s.setSession(sessionA);
    assert.deepEqual(await (await s.get()).json(), loadedA);
  }
});

test("a valid loaded account scope is mandatory and is never treated as a target account", async () => {
  const s = setup();
  const missing = await s.route.PUT(s.request("PUT", { ledger: ledger(), revision: 0 }));
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /account scope/);
  for (const accountScope of [null, 123, "", "x".repeat(255)]) {
    assert.equal((await s.put({ ledger: ledger(), revision: 0, accountScope })).status, 400);
  }
  const foreign = await s.put({ ledger: ledger(), revision: 0, accountScope: "user-b" });
  assert.equal(foreign.status, 409);
  assert.equal((await foreign.json()).code, "ACCOUNT_CHANGED");
  assert.equal(s.connections.length, 0);
  assert.equal(s.records.size, 0);
});

test("simultaneous distinct first saves and stale updates cannot overwrite a newer ledger", async () => {
  const s = setup();
  const first = namedLedger("First save");
  const second = namedLedger("Other tab");
  const responses = await Promise.all([s.put({ ledger: first, revision: 0 }), s.put({ ledger: second, revision: 0 })]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const updated = namedLedger("Newer revision");
  assert.equal((await s.put({ ledger: updated, revision: 1 })).status, 200);
  const conflict = await s.put({ ledger: first, revision: 1 });
  assert.equal(conflict.status, 409);
  assert.match((await conflict.json()).error, /another tab or device/);
  assert.deepEqual(await (await s.get()).json(), { ledger: updated, revision: 2, accountScope: "user-a" });
  const missing = setup();
  assert.equal((await missing.put({ ledger: first, revision: 4 })).status, 409);
  assert.equal(missing.records.size, 0);
});

test("lost-response retries of identical stable-ID ledgers do not duplicate money or advance revision", async () => {
  const s = setup();
  const value = ledger();
  const first = await s.put({ ledger: value, revision: 0 });
  assert.equal(first.status, 200);
  const retry = await s.put({ ledger: value, revision: 0 });
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), { ledger: value, revision: 1, accountScope: "user-a" });
  const updated = ledger([entry("entry-1", { payments: [event("entry-1-payment"), event("second-payment", { amountMinor: 100 })] })]);
  assert.equal((await s.put({ ledger: updated, revision: 1 })).status, 200);
  const secondRetry = await s.put({ ledger: updated, revision: 1 });
  assert.equal(secondRetry.status, 200);
  assert.deepEqual(await secondRetry.json(), { ledger: updated, revision: 2, accountScope: "user-a" });
  assert.equal(s.records.get("user-a").ledger.entries[0].payments.length, 2);
  assert.equal((await s.put({ ledger: value, revision: 0 })).status, 409);
  assert.equal(s.records.get("user-a").revision, "2");
});

test("cross-origin, downgraded, malformed, and cross-site requests fail before database access", async () => {
  for (const headers of [
    { origin: "https://evil.test" }, { origin: "http://earnings.test" },
    { origin: "null" }, { origin: "not a URL" }, { "sec-fetch-site": "cross-site" },
    { origin: null, referer: "https://evil.test/page" },
  ]) {
    const s = setup();
    assert.equal((await s.get({ headers })).status, 403);
    assert.equal((await s.put({ ledger: ledger(), revision: 0 }, { headers })).status, 403);
    assert.equal(s.connections.length, 0);
  }
  const sameSite = setup();
  assert.equal((await sameSite.get({ headers: { origin: null, referer: "https://earnings.test/admin/x5-execution/ai-earnings" } })).status, 200);
});

test("API rejects future receipts and costs while accepting today's and backdated cash evidence", async () => {
  for (const collection of ["payments", "costs"]) {
    const s = setup();
    const value = ledger([entry("entry-1", { [collection]: [event("future-event", { date: "2026-10-02" })] })]);
    assert.doesNotThrow(() => earnings.validateAiEarningsLedger(value));
    const response = await s.put({ ledger: value, revision: 0 });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /future|today/i);
    assert.equal(s.connections.length, 0);
    assert.equal(s.records.size, 0);
  }
  const s = setup();
  const value = ledger([entry("entry-1", {
    payments: [event("past", { date: "2026-09-30" }), event("today", { date: "2026-10-01" })],
    costs: [event("past-cost", { date: "2026-09-30" }), event("today-cost", { date: "2026-10-01" })],
  })]);
  assert.equal((await s.put({ ledger: value, revision: 0 })).status, 200);
  assert.deepEqual((await (await s.get()).json()).ledger, value);
});

test("invalid JSON, revisions, fields, media types, and oversized UTF-8 bodies are rejected before storage", async () => {
  const s = setup();
  for (const body of [
    "{", "null", "[]", { ledger: ledger() },
    ...[-1, 1.5, "0", null, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1].map((revision) => ({ ledger: ledger(), revision })),
    { ledger: {}, revision: 0 }, { ledger: ledger(), revision: 0, anything: true },
    { ledger: { ...ledger(), userId: "other-user" }, revision: 0 },
  ]) assert.equal((await s.put(body)).status, 400);
  for (const headers of [
    { "content-type": "text/plain" }, { "content-type": null },
    { "content-length": "1000001" }, { "content-length": "NaN" }, { "content-length": "-1" },
  ]) assert.equal((await s.put({ ledger: ledger(), revision: 0 }, { headers })).status, 400);
  assert.equal((await s.put(JSON.stringify({ ledger: namedLedger("🌿".repeat(300_000)), revision: 0, accountScope: "user-a" }))).status, 400);
  assert.equal((await s.route.PUT(s.request("PUT"))).status, 400);
  assert.equal(s.connections.length, 0);
});

test("missing database configuration, unavailable storage, and corrupt saved data fail visibly without leaking details", async () => {
  for (const options of [{ databaseConfigured: false }, { fail: true }]) {
    const s = setup(options);
    const load = await s.get();
    const save = await s.put({ ledger: ledger(), revision: 0 });
    assert.equal(load.status, 503);
    assert.equal(save.status, 503);
    assert.equal(save.headers.get("cache-control"), "private, no-store");
    assert.match((await load.json()).error, /could not be loaded/);
    const error = (await save.json()).error;
    assert.match(error, /could not be saved/);
    assert.doesNotMatch(error, /private connection detail|postgres:\/\//);
    assert.equal(s.records.size, 0);
    assert.equal(s.ended, s.connections.length);
  }
  for (const row of [
    { ledger: { schemaVersion: 999 }, revision: "1" },
    ...["0", "-1", "1.5", "not-a-revision", "9007199254740992"].map((revision) => ({ ledger: ledger(), revision })),
  ]) {
    const s = setup();
    s.records.set("user-a", clone(row));
    assert.equal((await s.get()).status, 503);
    assert.deepEqual(s.records.get("user-a"), row);
    assert.equal(s.ended, s.connections.length);
  }
});

test("the store independently validates callers, protects user isolation, and reports revision conflicts", async () => {
  const s = setup();
  for (const userId of ["", " ", null, 123, "x".repeat(255)]) {
    await assert.rejects(() => s.store.getStoredAiEarningsLedger(userId), /session user/);
    await assert.rejects(() => s.store.saveStoredAiEarningsLedger(userId, ledger(), 0), /session user/);
  }
  for (const revision of [-1, 0.5, "0", NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(() => s.store.saveStoredAiEarningsLedger("user-a", ledger(), revision), /revision/);
  }
  await assert.rejects(() => s.store.saveStoredAiEarningsLedger("user-a", {}, 0), /version/);
  assert.equal(s.connections.length, 0);
  await s.store.saveStoredAiEarningsLedger("user-a", namedLedger("Account A"), 0);
  await s.store.saveStoredAiEarningsLedger("user-b", namedLedger("Account B"), 0);
  assert.equal((await s.store.getStoredAiEarningsLedger("user-a")).ledger.entries[0].project, "Account A");
  assert.equal((await s.store.getStoredAiEarningsLedger("user-b")).ledger.entries[0].project, "Account B");
  await assert.rejects(() => s.store.saveStoredAiEarningsLedger("user-a", namedLedger("Conflicting update"), 900), s.store.AiEarningsRevisionConflictError);
  assert.equal((await s.store.getStoredAiEarningsLedger("user-a")).revision, 1);
  assert.equal(s.ended, s.connections.length);
});
