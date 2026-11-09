const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const config = {
  GCP_PROJECT_ID: "synthetic-project",
  GCP_PROJECT_NUMBER: "123456789",
  GCP_SERVICE_ACCOUNT_EMAIL: "shop@synthetic-project.iam.gserviceaccount.com",
  GCP_WORKLOAD_IDENTITY_POOL_ID: "shop-prod",
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "vercel-prod",
};
function setup(env = config, { nullClient = false, failToken = false } = {}) {
  const calls = { logs: [], firestore: [], tokens: [], auth: [], federation: [] };
  const client = {};
  const modules = {
    "server-only": {},
    "@google-cloud/firestore": {
      Firestore: class {
        constructor(settings) { calls.firestore.push(settings); }
        collection(name) { return { name, doc: (id) => ({ name, id }) }; }
        batch() { return "batch"; }
      },
      FieldValue: { serverTimestamp: () => "server-timestamp" },
    },
    "google-auth-library": {
      ExternalAccountClient: { fromJSON: (options) => { calls.federation.push(options); return nullClient ? null : client; } },
      GoogleAuth: class { constructor(options) { calls.auth.push(options); } },
    },
    "@vercel/oidc": { getVercelOidcToken: async (options) => {
      calls.tokens.push(options);
      if (failToken) throw new Error("Synthetic token failure");
      return `synthetic-token-${calls.tokens.length}`;
    } },
  };
  const exports = {};
  const source = fs.readFileSync("src/lib/shops-server.ts", "utf8");
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console: { error: (...args) => calls.logs.push(args) }, process: { env }, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected import ${name}`);
    return modules[name];
  } });
  return { api: exports, calls, client };
}

test("server initialization is lazy, uses federation, pins default database and caches only SDK clients", async () => {
  const { api, calls, client } = setup();
  assert.equal(calls.firestore.length, 0);
  assert.equal(api.shopCollection().name, "shops");
  api.shopCollection(); api.shopBatch();
  assert.equal(calls.firestore.length, 1);
  assert.equal(calls.firestore[0].projectId, config.GCP_PROJECT_ID);
  assert.equal(calls.firestore[0].databaseId, "(default)");
  assert.ok(calls.firestore[0].auth);
  assert.equal(calls.auth[0].authClient, client);
  assert.equal(calls.tokens.length, 0);
  const federation = calls.federation[0];
  const audience = "https://iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/shop-prod/providers/vercel-prod";
  assert.equal(federation.audience, audience);
  assert.equal(federation.token_url, "https://sts.googleapis.com/v1/token");
  assert.equal(federation.subject_token_type, "urn:ietf:params:oauth:token-type:jwt");
  assert.equal(federation.service_account_impersonation_url,
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/shop@synthetic-project.iam.gserviceaccount.com:generateAccessToken");
  assert.deepEqual(Array.from(federation.scopes), ["https://www.googleapis.com/auth/datastore"]);
  assert.notEqual(await federation.subject_token_supplier.getSubjectToken(), await federation.subject_token_supplier.getSubjectToken());
  assert.equal(calls.tokens.length, 2);
  assert.ok(calls.tokens.every((options) => options.audience === audience));
  for (const key of ["credentials", "keyFilename", "apiKey"]) assert.equal(calls.firestore[0][key], undefined);
});

test("missing or malformed config and failed federation never use default credentials or anonymous access", async () => {
  for (const name of Object.keys(config)) {
    const env = { ...config }; delete env[name];
    const app = setup(env);
    assert.throws(() => app.api.shopCollection(), /Missing shop server configuration/);
    assert.equal(app.calls.firestore.length, 0);
  }
  const invalid = setup({ ...config, GCP_SERVICE_ACCOUNT_EMAIL: "evil@example.com/path" });
  assert.throws(() => invalid.api.shopCollection(), /Invalid shop server/);
  const missingClient = setup(config, { nullClient: true });
  assert.throws(() => missingClient.api.shopCollection(), /Unable to initialize/);
  assert.equal(missingClient.calls.firestore.length, 0);
  const tokenFailure = setup(config, { failToken: true });
  tokenFailure.api.shopCollection();
  await assert.rejects(tokenFailure.calls.federation[0].subject_token_supplier.getSubjectToken, /Synthetic token failure/);
  assert.equal(tokenFailure.calls.firestore.length, 1);
});

test("emulator mode is only permitted on loopback in a local test process", () => {
  for (const env of [
    { NODE_ENV: "production", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" },
    { NODE_ENV: "test", VERCEL: "1", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" },
    { NODE_ENV: "test", FIRESTORE_EMULATOR_HOST: "remote.invalid:8080" },
  ]) assert.throws(() => setup(env).api.shopCollection(), /restricted to local tests/);
  const local = setup({ NODE_ENV: "test", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" });
  local.api.shopCollection();
  assert.equal(local.calls.firestore[0].projectId, "demo-mo-tshirt");
  assert.equal(local.calls.firestore[0].databaseId, "(default)");
  assert.equal(local.calls.federation.length, 0);
});

test("document helpers cannot escape the shops collection", () => {
  const { api } = setup();
  assert.equal(api.shopDocument("synthetic").id, "synthetic");
  for (const id of ["", "a/b/c", "../other", "/private"]) assert.throws(() => api.shopDocument(id), /Invalid shop document ID/);
  assert.equal(api.serverTimestamp(), "server-timestamp");
});

test("all migrated routes use the server-only adapter and no client database imports", () => {
  const routes = ["shops", "quote-options", "admin/shops", "admin/shops/[id]", "admin/shops/[id]/studio-images", "admin/shops/reorder", "admin/shops/normalize-sizes"];
  for (const route of routes) {
    const source = fs.readFileSync(`app/api/${route}/route.ts`, "utf8");
    assert.match(source, /@\/lib\/shops-server/);
    assert.match(source, /export const runtime = "nodejs"/);
    assert.doesNotMatch(source, /firebase\/firestore|@\/lib\/firebase/);
    assert.doesNotMatch(source, /console\.error\([^\n]+,\s*error/);
  }
  assert.match(fs.readFileSync("src/lib/shops-server.ts", "utf8"), /import "server-only"/);
});


test("diagnostics emit only fixed categories and bounded numeric codes", () => {
  const { api, calls } = setup();
  api.logShopServerError("attacker-controlled", {
    message: "SYNTHETIC_SECRET", code: "SYNTHETIC_SECRET",
    config: { url: "https://sts.googleapis.com/v1/token", headers: { Authorization: "SYNTHETIC_SECRET" } },
    response: { status: 400, data: { error: "invalid_grant", error_description: "SYNTHETIC_SECRET" } },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.logs[0])), ["shops:server-failure", { stage: "google-sts", status: 400, code: null, oauth: "invalid_grant" }]);
  api.logShopServerError("vercel-oidc", { code: 7, response: { status: 999, data: { error: "SYNTHETIC_SECRET" } } });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.logs[1])), ["shops:server-failure", { stage: "vercel-oidc", status: null, code: 7, oauth: null }]);
  assert.doesNotMatch(JSON.stringify(calls.logs), /SYNTHETIC_SECRET|attacker-controlled/);
});


test("diagnostics unwrap GAX causes and preserve bounded HTTP status", () => {
  const { api, calls } = setup();
  const original = {
    message: "SYNTHETIC_SECRET", code: "SYNTHETIC_SECRET",
    config: { url: { origin: "https://iamcredentials.googleapis.com" }, data: "SYNTHETIC_SECRET" },
    response: { status: 403, data: { error: "access_denied", details: "SYNTHETIC_SECRET" } },
  };
  api.logShopServerError("firestore", { code: 2, httpStatusCode: 403, cause: original });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.logs[0])), ["shops:server-failure", { stage: "google-impersonation", status: 403, code: 2, oauth: "access_denied" }]);
  api.logShopServerError("firestore", { httpStatusCode: 429 });
  assert.equal(calls.logs[1][1].status, 429);
  for (const invalid of [99, 600, 403.5, "403", Infinity, NaN, "SYNTHETIC_SECRET"]) {
    api.logShopServerError("firestore", { httpStatusCode: invalid });
    assert.equal(calls.logs.at(-1)[1].status, null);
  }
  assert.doesNotMatch(JSON.stringify(calls.logs), /SYNTHETIC_SECRET/);
});

test("diagnostics terminate cycles and limit cause traversal to five objects", () => {
  const { api, calls } = setup();
  const cyclic = { code: 7 }; cyclic.cause = cyclic;
  api.logShopServerError("firestore", cyclic);
  assert.equal(calls.logs.length, 1);
  assert.equal(calls.logs[0][1].code, 7);
  let chain = { httpStatusCode: 418, message: "SYNTHETIC_SECRET" };
  for (let i = 0; i < 5; i += 1) chain = { cause: chain };
  api.logShopServerError("firestore", chain);
  assert.equal(calls.logs[1][1].status, null);
  api.logShopServerError("firestore", chain.cause);
  assert.equal(calls.logs[2][1].status, 418);
  assert.doesNotMatch(JSON.stringify(calls.logs), /SYNTHETIC_SECRET/);
});
