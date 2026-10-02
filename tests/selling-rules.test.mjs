import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as rules from "../src/lib/selling-rules.ts";
import * as access from "../src/lib/admin-access.ts";

const clone = (value) => JSON.parse(JSON.stringify(value));
const blank = () => clone(rules.EMPTY_SELLING_RULES_CONFIG);
// Deliberately synthetic values: fixtures are not approved commercial prices.
function pricedConfig() {
  const config = blank();
  for (const offer of rules.SELLING_RULE_OFFERS) config.offers[offer.id].priceMUR = 7.13;
  config.rules.depositPercent = 50;
  return config;
}

test("generic template contains five fixed offers and no commercial defaults", () => {
  const config = blank();
  assert.deepEqual(Object.keys(config.offers), ["tee_small_front", "tee_large_front", "tee_small_front_large_back", "polo_front", "polo_front_back"]);
  assert.ok(Object.values(config.offers).every((offer) => offer.priceMUR === null));
  assert.equal(config.rules.inclusions, null);
  assert.equal(config.rules.tshirtMethod, "unknown");
  assert.equal(config.rules.poloMethod, null);
  assert.equal(config.rules.depositPercent, null);
  assert.equal(config.rules.bulkReviewMinimum, null);
  assert.deepEqual(config.rules.deliveryOptions, []);
  assert.equal(config.rules.vatPolicy, null);
  const validated = rules.validateSellingRulesConfig(config);
  assert.deepEqual(validated, config);
  validated.offers.tee_small_front.priceMUR = 1.23;
  validated.rules.smallPrint.widthCm = 2;
  assert.equal(config.offers.tee_small_front.priceMUR, null);
  assert.equal(config.rules.smallPrint.widthCm, null);
});

test("strict nested validation refuses omitted, unexpected, unknown and prototype keys", () => {
  const mutations = [
    (c) => { c.accountId = "other-company"; },
    (c) => { delete c.schemaVersion; },
    (c) => { c.schemaVersion = 2; },
    (c) => { delete c.offers.polo_front; },
    (c) => { c.offers.extra = { priceMUR: 1 }; },
    (c) => { c.offers.polo_front.discount = 50; },
    (c) => { c.rules.ownerId = "someone"; },
    (c) => { delete c.rules.vatPolicy; },
    (c) => { c.rules.smallPrint.unit = "inches"; },
    (c) => { c.rules.turnaroundWorkingDays = { min: 1, max: 2, weekends: true }; },
    (c) => { c.offers = []; },
    (c) => { c.rules = null; },
  ];
  for (const mutate of mutations) {
    const config = blank(); mutate(config);
    assert.throws(() => rules.validateSellingRulesConfig(config));
  }
  for (const value of [null, [], "rules", 1, JSON.parse('{"__proto__":{}}')]) assert.throws(() => rules.validateSellingRulesConfig(value));
});

test("prices are bounded positive two-decimal numbers, never coercions", () => {
  for (const value of [0, -1, 1_000_001, 0.001, 7.131, NaN, Infinity, "7.13", true, undefined]) {
    const config = blank(); config.offers.polo_front.priceMUR = value;
    assert.throws(() => rules.validateSellingRulesConfig(config), /price/);
  }
  for (const value of [null, 0.01, 1.01, 7.13, 999999.99, 1_000_000]) {
    const config = blank(); config.offers.polo_front.priceMUR = value;
    assert.equal(rules.validateSellingRulesConfig(config).offers.polo_front.priceMUR, value);
  }
});

test("dimensions, methods, deposits, turnaround and policy strings are validated without defaults", () => {
  for (const value of [0, -1, 201, NaN, Infinity, "20"]) {
    const config = blank(); config.rules.smallPrint.widthCm = value;
    assert.throws(() => rules.validateSellingRulesConfig(config), /dimensions/);
  }
  for (const [key, value] of [
    ["inclusions", "all-inclusive"], ["tshirtMethod", "sublimation"], ["poloMethod", "dtf"],
    ["depositPercent", 0], ["depositPercent", 25], ["depositPercent", "50"], ["delivery", "free"],
    ["bulkReviewMinimum", 0], ["bulkReviewMinimum", 1.1], ["bulkReviewMinimum", Infinity],
    ["bulkPolicy", ""], ["vatPolicy", " "], ["rushPolicy", "x".repeat(2001)], ["exceptionsPolicy", "bad\u0000text"],
    ["turnaroundWorkingDays", { min: 0, max: 2 }], ["turnaroundWorkingDays", { min: 3, max: 2 }],
    ["turnaroundWorkingDays", { min: 1, max: 366 }], ["turnaroundWorkingDays", { min: 1.5, max: 2 }],
  ]) {
    const config = blank(); config.rules[key] = value;
    assert.throws(() => rules.validateSellingRulesConfig(config));
  }
  const config = blank();
  config.rules.smallPrint = { widthCm: 0.1, heightCm: 200 };
  config.rules.turnaroundWorkingDays = { min: 1, max: 365 };
  config.rules.depositPercent = 100;
  config.rules.exceptionsPolicy = "  Owner confirms exceptions\ncase by case.  ";
  assert.equal(rules.validateSellingRulesConfig(config).rules.exceptionsPolicy, "Owner confirms exceptions\ncase by case.");
});

test("delivery options require approved IDs, valid fields, unique entries and positive fees", () => {
  const valid = { id: "post_standard", label: "Synthetic service", priceMUR: 1.07, description: "Synthetic test delivery, no commercial commitment." };
  for (const options of [null, {}, [valid, valid], [valid, { ...valid, id: "post_express" }, valid], [{ ...valid, id: "unknown" }], [{ ...valid, priceMUR: 0 }], [{ ...valid, label: "" }], [{ ...valid, description: "" }], [{ ...valid, public: true }]]) {
    const config = blank(); config.rules.deliveryOptions = options;
    assert.throws(() => rules.validateSellingRulesConfig(config), /Delivery|delivery/);
  }
  const config = blank(); config.rules.deliveryOptions = [valid];
  assert.deepEqual(rules.validateSellingRulesConfig(config).rules.deliveryOptions, [valid]);
});

test("revisions and calculator quantities reject unsafe, negative, fractional and coerced input", () => {
  for (const revision of [-1, 0.1, Number.MAX_SAFE_INTEGER, Infinity, NaN, "0", null, undefined]) assert.throws(() => rules.validateSellingRulesRevision(revision), /revision/);
  assert.equal(rules.validateSellingRulesRevision(0), 0);
  assert.equal(rules.validateSellingRulesRevision(Number.MAX_SAFE_INTEGER - 1), Number.MAX_SAFE_INTEGER - 1);
  for (const qty of [-1, 0, 1.5, 1_000_001, Number.MAX_SAFE_INTEGER, NaN, Infinity, "2", null]) assert.throws(() => rules.calculateSellingRulesQuote(pricedConfig(), "polo_front", qty), /Quantity/);
  assert.throws(() => rules.calculateSellingRulesQuote(pricedConfig(), "unknown", 1), /five approved offers/);
});

test("calculator stays provisional with missing price and independently blocks missing decisions", () => {
  const quote = rules.calculateSellingRulesQuote(blank(), "tee_small_front_large_back", 3);
  for (const key of ["unitPriceMUR", "subtotalMUR", "depositMUR", "balanceMUR", "deliveryMUR", "subtotalWithDeliveryMUR"]) assert.equal(quote[key], null);
  assert.equal(quote.isFinal, false);
  for (const text of ["price", "includes", "T-shirt", "small", "large", "turnaround", "deposit", "VAT", "stock"]) assert.ok(quote.missingDecisions.some((item) => item.toLowerCase().includes(text.toLowerCase())));
  const config = pricedConfig(); config.rules.depositPercent = null;
  const noDeposit = rules.calculateSellingRulesQuote(config, "polo_front", 3);
  assert.equal(noDeposit.subtotalMUR, 21.39);
  assert.equal(noDeposit.depositMUR, null);
  assert.equal(noDeposit.balanceMUR, null);
  assert.equal(noDeposit.isFinal, false);
});

test("all five offer prices calculate exact cents and rounded deposits without discounts", () => {
  const config = pricedConfig();
  for (const offer of rules.SELLING_RULE_OFFERS) {
    const quote = rules.calculateSellingRulesQuote(config, offer.id, 3);
    assert.equal(quote.subtotalMUR, 21.39);
    assert.equal(quote.depositMUR, 10.7);
    assert.equal(quote.balanceMUR, 10.69);
    assert.equal(quote.isFinal, false);
  }
  config.rules.depositPercent = 100;
  const full = rules.calculateSellingRulesQuote(config, "tee_large_front", 3);
  assert.equal(full.depositMUR, 21.39);
  assert.equal(full.balanceMUR, 0);
  config.offers.polo_front.priceMUR = 1_000_000;
  assert.equal(rules.calculateSellingRulesQuote(config, "polo_front", 1_000_000).subtotalMUR, 1_000_000_000_000);
});

test("bulk boundary adds owner review but never changes the standard unit price or adds a discount", () => {
  const config = pricedConfig(); config.rules.bulkReviewMinimum = 13;
  const lower = rules.calculateSellingRulesQuote(config, "polo_front", 12);
  const boundary = rules.calculateSellingRulesQuote(config, "polo_front", 13);
  assert.equal(lower.missingDecisions.some((text) => text.startsWith("Bulk price")), false);
  assert.equal(boundary.missingDecisions.filter((text) => text.startsWith("Bulk price")).length, 1);
  assert.equal(boundary.unitPriceMUR, 7.13);
  assert.equal(boundary.subtotalMUR, 92.69);
  assert.equal(Object.hasOwn(boundary, "discount"), false);
});

test("selected delivery is itemized but no delivery, tax, or design deposit policy is inferred", () => {
  const config = pricedConfig();
  config.rules.deliveryOptions = [{ id: "post_standard", label: "Synthetic service", priceMUR: 1.07, description: "Test only" }];
  const quote = rules.calculateSellingRulesQuote(config, "polo_front", 3, "post_standard");
  assert.equal(quote.deliveryMUR, 1.07);
  assert.equal(quote.subtotalWithDeliveryMUR, 22.46);
  assert.equal(quote.depositMUR, 10.7);
  assert.equal(quote.isFinal, false);
  assert.ok(quote.missingDecisions.some((item) => item.includes("final total and deposit")));
  assert.throws(() => rules.calculateSellingRulesQuote(config, "polo_front", 3, "post_express"), /approved delivery/);
  assert.equal(rules.calculateSellingRulesQuote(config, "polo_front", 3).deliveryMUR, null);
});

test("explicit approved pickup can be zero, while unknown and unselected delivery never become free", () => {
  const config = pricedConfig();
  config.rules.deliveryOptions = [{ id: "pickup", label: "Test pickup", priceMUR: 0, description: "Test pickup location" }];
  const quote = rules.calculateSellingRulesQuote(config, "polo_front", 3, "pickup");
  assert.equal(quote.deliveryMUR, 0);
  assert.equal(quote.subtotalWithDeliveryMUR, 21.39);
  assert.equal(quote.isFinal, false);
  assert.equal(rules.calculateSellingRulesQuote(config, "polo_front", 3).deliveryMUR, null);
  assert.throws(() => rules.calculateSellingRulesQuote(blank(), "polo_front", 3, "pickup"), /approved delivery/);
  config.rules.deliveryOptions[0].id = "post_standard";
  assert.throws(() => rules.validateSellingRulesConfig(config), /Delivery price/);
});

const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const OWNER = { userId: "owner-test", displayName: "Test owner", isOwner: true, allowedPages: [] };
const NOW = "2026-10-02T00:00:00.000Z";

// Integration doubles never connect to PostgreSQL or read runtime credentials.
function setup({ session = OWNER, databaseConfigured = true, failConnection = false, failRead = false, failAudit = false, simulateInsertConflict = false } = {}) {
  const configs = new Map(); const versions = new Map(); const queries = []; const connections = [];
  let ended = 0;
  class Client {
    constructor(options) { connections.push(options); }
    async connect() { if (failConnection) throw new Error("PRIVATE_DATABASE_DETAIL"); }
    async end() { ended += 1; }
    async query(sql, parameters = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, parameters: clone(parameters) });
      if (normalized.startsWith("create table")) return { rows: [] };
      if (normalized.startsWith("begin")) { this.snapshot = { configs: clone([...configs]), versions: clone([...versions]) }; return { rows: [] }; }
      if (normalized === "commit") { this.snapshot = null; return { rows: [] }; }
      if (normalized === "rollback") {
        if (this.snapshot) { configs.clear(); versions.clear(); for (const entry of this.snapshot.configs) configs.set(...entry); for (const entry of this.snapshot.versions) versions.set(...entry); }
        this.snapshot = null; return { rows: [] };
      }
      const [scope, serialized, revision] = parameters;
      const existing = configs.get(scope);
      if (normalized.startsWith("select config")) {
        if (failRead) throw new Error("PRIVATE_READ_DETAIL");
        return { rows: existing ? [clone(existing)] : [] };
      }
      if (normalized.startsWith("select revision")) return { rows: [...versions.values()].filter((row) => row.scope === scope).sort((a, b) => Number(b.revision) - Number(a.revision)).slice(0, parameters[1]).map(clone) };
      if (normalized.startsWith("insert into selling_rules_configs")) {
        assert.match(normalized, /on conflict \(scope\) do nothing/);
        if (existing || simulateInsertConflict) return { rows: [] };
        const row = { config: JSON.parse(serialized), revision: "1", updated_at: NOW, actor_id: parameters[2], updated_by: parameters[3] };
        configs.set(scope, row); return { rows: [clone(row)] };
      }
      if (normalized.startsWith("update selling_rules_configs")) {
        assert.match(normalized, /where scope = \$1 and revision = \$3/);
        if (!existing || Number(existing.revision) !== revision) return { rows: [] };
        const row = { config: JSON.parse(serialized), revision: String(revision + 1), updated_at: NOW, actor_id: parameters[3], updated_by: parameters[4] };
        configs.set(scope, row); return { rows: [clone(row)] };
      }
      if (normalized.startsWith("insert into selling_rules_versions")) {
        if (failAudit) throw new Error("PRIVATE_AUDIT_DETAIL");
        const key = `${scope}/${parameters[1]}`;
        if (versions.has(key)) throw new Error("Duplicate immutable revision");
        versions.set(key, { scope, revision: String(parameters[1]), config: JSON.parse(parameters[2]), updated_at: parameters[3], actor_id: parameters[4], updated_by: parameters[5] });
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    }
  }
  const store = {};
  const storeModules = { "server-only": {}, pg: { Client }, "@/lib/selling-rules": rules };
  vm.runInNewContext(compile("../src/lib/selling-rules-store.ts"), { exports: store, require: (name) => { assert.ok(storeModules[name], name); return storeModules[name]; }, process: { env: databaseConfigured ? { DATABASE_URL: "postgres://test.invalid/selling-rules?sslmode=require" } : {} }, URL, Date, Error });
  const modules = {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/admin-request": { getAdminRequestSession: async () => session },
    "@/lib/admin-access": access, "@/lib/selling-rules": rules, "@/lib/selling-rules-store": store,
  };
  const route = {};
  vm.runInNewContext(compile("../app/api/admin/quotes/selling-rules/route.ts"), { exports: route, require: (name) => { assert.ok(modules[name], name); return modules[name]; }, Buffer, TextDecoder, URL, Error });
  const request = (method = "GET", body, options = {}) => {
    const headers = { origin: "https://rules.test", ...(method === "PUT" ? { "content-type": "application/json" } : {}), ...options.headers };
    for (const [key, value] of Object.entries(headers)) if (value === null) delete headers[key];
    return new Request(`https://rules.test/api/admin/quotes/selling-rules${options.query || ""}`, { method, headers, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
  };
  return { store, route, configs, versions, queries, connections, request,
    setSession: (value) => { session = value; },
    setFailRead: (value) => { failRead = value; },
    setFailAudit: (value) => { failAudit = value; },
    get: (options) => route.GET(request("GET", undefined, options)),
    put: (body = { config: pricedConfig(), revision: 0 }, options) => route.PUT(request("PUT", body, options)),
    get ended() { return ended; },
  };
}

test("unauthenticated and unrelated employee requests are rejected before any storage access", async () => {
  for (const [session, status] of [[null, 401], [{ userId: "staff", allowedPages: [], isOwner: false }, 403], [{ userId: "staff", allowedPages: ["/admin"], isOwner: false }, 403], [{ userId: "staff", allowedPages: ["/admin/orders"], isOwner: false }, 403]]) {
    const s = setup({ session });
    for (const response of [await s.get(), await s.put()]) {
      assert.equal(response.status, status);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
    assert.equal(s.connections.length, 0);
  }
});

test("existing quotation and Tanvi scope can read company rules but cannot save them", async () => {
  for (const allowedPages of [["/admin/quotation-approval"], ["/admin/tanvi"]]) {
    const s = setup(); await s.put();
    s.setSession({ userId: "staff", displayName: "Test staff", isOwner: false, allowedPages });
    const get = await s.get(); assert.equal(get.status, 200);
    const body = await get.json(); assert.equal(body.canEdit, false); assert.equal(body.revision, 1); assert.deepEqual(body.config, pricedConfig());
    const before = s.connections.length;
    assert.equal((await s.put({ config: blank(), revision: 1 })).status, 403);
    assert.equal(s.connections.length, before);
    assert.deepEqual([...s.configs.values()][0].config, pricedConfig());
  }
  assert.equal(access.resolveAdminPagePath("/admin/quotation-approval/selling-rules"), "/admin/quotation-approval");
  assert.equal(access.resolveAdminApiPermission("/api/admin/quotes/selling-rules"), "/admin/quotation-approval");
  assert.equal(access.ALL_ADMIN_PAGE_PATHS.includes("/admin/quotation-approval/selling-rules"), false);
  assert.equal(access.hasAdminPageAccess(["/admin/quotation-approval/selling-rules"], "/admin/quotation-approval", { isOwner: false }), false);
  assert.equal(access.hasAdminPageAccess(["/admin/quotation-approval/selling-rules"], "/admin/orders", { isOwner: false }), false);
  assert.equal(access.hasAdminPageAccess(["/admin/quotation-approval/selling-rules"], "/admin/settings", { isOwner: false }), false);
});

test("initial load stays empty without persisting a default document, and owner save reloads durably", async () => {
  const s = setup(); const first = await s.get();
  assert.equal(first.status, 200); assert.equal(first.headers.get("vary"), "Cookie");
  assert.deepEqual(await first.json(), { config: blank(), revision: 0, updatedAt: null, updatedBy: null, history: [], canEdit: true, viewerId: OWNER.userId });
  assert.equal(s.configs.size, 0); assert.equal(s.versions.size, 0);
  const saved = await s.put(); assert.equal(saved.status, 200);
  const result = await saved.json(); assert.equal(result.revision, 1); assert.equal(result.updatedAt, NOW); assert.equal(result.updatedBy, OWNER.displayName); assert.equal(result.canEdit, true);
  assert.deepEqual(await (await s.get()).json(), result);
  assert.equal([...s.versions.values()][0].actor_id, OWNER.userId);
  assert.match(s.connections[0].connectionString, /sslmode=verify-full/);
  assert.equal(s.ended, s.connections.length);
});

test("company singleton is shared across authorized owner sessions, never request-selected", async () => {
  const s = setup(); await s.put();
  s.setSession({ ...OWNER, userId: "another-authorized-owner", displayName: "Other owner" });
  assert.equal((await (await s.get()).json()).revision, 1);
  assert.equal((await s.put({ config: blank(), revision: 1 })).status, 200);
  assert.equal(s.configs.size, 1); assert.equal(s.versions.size, 2);
  assert.equal([...s.configs.values()][0].actor_id, "another-authorized-owner");
  for (const query of ["?userId=other", "?scope=other", "?tenantId=other", "?history=all"]) {
    const before = s.connections.length;
    assert.equal((await s.get({ query })).status, 400);
    assert.equal((await s.put({ config: blank(), revision: 2 }, { query })).status, 400);
    assert.equal(s.connections.length, before);
  }
  for (const field of ["accountScope", "userId", "tenantId", "scope", "actor", "updatedBy", "viewerId"]) assert.equal((await s.put({ config: blank(), revision: 2, [field]: "injected" })).status, 400);
});

test("viewer identity is derived only from the current session and cannot be supplied in writes", async () => {
  const s = setup();
  assert.equal((await (await s.get()).json()).viewerId, OWNER.userId);
  assert.equal((await (await s.put()).json()).viewerId, OWNER.userId);
  s.setSession({ userId: "rules-reader", displayName: "Rules reader", isOwner: false, allowedPages: ["/admin/quotation-approval"] });
  const read = await (await s.get()).json();
  assert.equal(read.viewerId, "rules-reader");
  assert.equal(read.updatedBy, OWNER.displayName);
  s.setSession(OWNER);
  const before = s.connections.length;
  assert.equal((await s.put({ config: blank(), revision: 1, viewerId: "other-user" })).status, 400);
  assert.equal(s.connections.length, before);
  assert.equal([...s.configs.values()][0].revision, "1");
});

test("same-origin is checked on reads and writes, with an explicit origin required for mutation", async () => {
  for (const headers of [{ origin: "https://other.test" }, { origin: "http://rules.test" }, { origin: "null" }, { origin: "invalid" }, { "sec-fetch-site": "cross-site" }]) {
    const s = setup(); assert.equal((await s.get({ headers })).status, 403); assert.equal((await s.put(undefined, { headers })).status, 403); assert.equal(s.connections.length, 0);
  }
  const s = setup();
  assert.equal((await s.get({ headers: { origin: null } })).status, 200);
  assert.equal((await s.put(undefined, { headers: { origin: null } })).status, 403);
  assert.equal((await s.put(undefined, { headers: { origin: null, referer: "https://rules.test/admin/quotation-approval/selling-rules" } })).status, 200);
});

test("malformed bodies, non-JSON media and oversized declared or streamed bodies cannot access storage", async () => {
  const cases = [
    ["{", {}, 400], ["null", {}, 400], ["[]", {}, 400],
    [{ config: blank() }, {}, 400], [{ config: blank(), revision: "0" }, {}, 400],
    [{ config: blank(), revision: 0, extra: true }, {}, 400],
    [undefined, { headers: { "content-type": "text/plain" } }, 415],
    [undefined, { headers: { "content-length": "96001" } }, 413],
    [undefined, { headers: { "content-length": "-1" } }, 400],
    [undefined, { headers: { "content-length": "1e3" } }, 400],
    [" ".repeat(96001), { headers: { "content-length": "2" } }, 413],
    [" ".repeat(96001), {}, 413],
  ];
  for (const [body, options, status] of cases) {
    const s = setup(); assert.equal((await s.put(body, options)).status, status); assert.equal(s.connections.length, 0);
  }
  const s = setup(); const invalidConfig = blank(); invalidConfig.rules.inclusions = "everything";
  assert.equal((await s.put({ config: invalidConfig, revision: 0 })).status, 400); assert.equal(s.connections.length, 0);
});

test("owner updates use revision compare-and-swap; stale saves and first-save races cannot overwrite", async () => {
  const s = setup(); await s.put();
  const second = pricedConfig(); second.offers.polo_front.priceMUR = 8.29;
  const updated = await s.put({ config: second, revision: 1 }); assert.equal(updated.status, 200);
  assert.equal((await updated.json()).revision, 2);
  for (const revision of [0, 1, 3]) {
    const response = await s.put({ config: blank(), revision }); assert.equal(response.status, 409); assert.equal((await response.json()).code, "REVISION_CONFLICT");
  }
  assert.deepEqual([...s.configs.values()][0].config, second); assert.equal(s.versions.size, 2);
  assert.ok(s.queries.some(({ sql }) => sql.includes("for update")));
  assert.ok(s.queries.some(({ sql }) => sql === "rollback"));
  const raced = setup({ simulateInsertConflict: true });
  assert.equal((await raced.put()).status, 409); assert.equal(raced.configs.size, 0); assert.equal(raced.versions.size, 0);
});

test("every successful save appends an immutable full audit version and history stays bounded", async () => {
  const s = setup();
  for (let revision = 0; revision < 12; revision += 1) {
    const config = pricedConfig(); config.offers.polo_front.priceMUR = 1 + revision;
    const response = await s.put({ config, revision }); assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.history.length, Math.min(revision + 1, 10)); assert.equal(result.history[0].revision, revision + 1);
  }
  assert.equal(s.versions.size, 12);
  const snapshots = [...s.versions.values()];
  assert.equal(snapshots[0].config.offers.polo_front.priceMUR, 1);
  assert.equal(snapshots[11].config.offers.polo_front.priceMUR, 12);
  assert.ok(snapshots.every((entry) => entry.actor_id === OWNER.userId));
  assert.equal(s.queries.some(({ sql }) => /(?:update|delete from) selling_rules_versions/.test(sql)), false);
  assert.equal(s.queries.some(({ sql }) => /aura|quotes|transactions|users|pricing_settings/.test(sql)), false);
});

test("audit insertion failure rolls the entire config write back, including first save", async () => {
  const first = setup({ failAudit: true }); const response = await first.put();
  assert.equal(response.status, 503); assert.doesNotMatch(JSON.stringify(await response.json()), /PRIVATE/); assert.equal(first.configs.size, 0); assert.equal(first.versions.size, 0);
  const s = setup(); await s.put(); const before = clone([...s.configs]);
  s.setFailAudit(true);
  assert.equal((await s.put({ config: blank(), revision: 1 })).status, 503);
  assert.deepEqual([...s.configs], before); assert.equal(s.versions.size, 1);
});

test("load, configuration and connection failures never fabricate empty success or leak private errors", async () => {
  for (const options of [{ databaseConfigured: false }, { failConnection: true }, { failRead: true }]) {
    const s = setup(options);
    for (const response of [await s.get(), await s.put()]) {
      assert.equal(response.status, 503);
      const body = await response.json(); assert.deepEqual(Object.keys(body), ["error"]); assert.doesNotMatch(JSON.stringify(body), /PRIVATE|postgres|test\.invalid|connection string/);
    }
    assert.equal(s.configs.size, 0); assert.equal(s.versions.size, 0);
    assert.equal(s.queries.some(({ sql }) => sql.startsWith("insert into") || sql.startsWith("update")), false);
    assert.equal(s.ended, s.connections.length);
  }
  const s = setup(); await s.put(); s.setFailRead(true);
  assert.equal((await s.put({ config: blank(), revision: 1 })).status, 503);
  assert.deepEqual([...s.configs.values()][0].config, pricedConfig());
});

test("corrupt current rules or missing/inconsistent audit history block replacement writes", async () => {
  for (const corrupt of [
    (s) => { [...s.configs.values()][0].config.schemaVersion = 99; },
    (s) => { [...s.configs.values()][0].revision = "not-an-integer"; },
    (s) => { [...s.configs.values()][0].updated_at = "bad-date"; },
    (s) => { s.versions.clear(); },
    (s) => { [...s.versions.values()][0].revision = "2"; },
    (s) => { s.configs.clear(); },
  ]) {
    const s = setup(); await s.put(); corrupt(s); const before = clone([...s.configs]); const writesBefore = s.queries.filter(({ sql }) => /^(insert into|update)/.test(sql)).length;
    assert.equal((await s.get()).status, 503);
    assert.equal((await s.put({ config: blank(), revision: 1 })).status, 503);
    assert.deepEqual([...s.configs], before);
    assert.equal(s.queries.filter(({ sql }) => /^(insert into|update)/.test(sql)).length, writesBefore);
  }
});

test("store also validates actor, config and revision before opening a connection", async () => {
  const s = setup();
  for (const actor of [null, { userId: "", displayName: "Owner" }, { userId: "x".repeat(255), displayName: "Owner" }, { userId: "owner", displayName: 1 }]) await assert.rejects(s.store.saveStoredSellingRules(blank(), 0, actor), /actor/);
  await assert.rejects(s.store.saveStoredSellingRules(blank(), -1, OWNER), /revision/);
  await assert.rejects(s.store.saveStoredSellingRules({}, 0, OWNER), /fields/);
  assert.equal(s.connections.length, 0);
});
