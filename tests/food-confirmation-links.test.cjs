const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadLinks() {
  const source = fs.readFileSync("src/lib/food-confirmation-links.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "node:crypto") return require(name);
      if (name === "@/lib/seo") return { SITE_URL: "https://www.mo-tshirt.mu" };
      throw new Error(`Unexpected module: ${name}`);
    },
    process: { env: { FOOD_CONFIRMATION_SECRET: "a-long-test-signing-secret" } },
    Buffer,
    Date,
    URL,
  });
  return exports;
}

test("food confirmation links validate and reject tampering", () => {
  const links = loadLinks();
  const expires = Date.now() + 60_000;
  const signed = links.signFoodConfirmationLink("2026-09-13", expires);
  assert.equal(
    links.verifyFoodConfirmationLink({ dayKey: "2026-09-13", expires, token: signed.token }),
    true
  );
  assert.equal(
    links.verifyFoodConfirmationLink({ dayKey: "2026-09-14", expires, token: signed.token }),
    false
  );
  assert.equal(
    links.verifyFoodConfirmationLink({ dayKey: "2026-09-13", expires: Date.now() - 1, token: signed.token }),
    false
  );
});

test("food confirmation URL carries only the signed day fields", () => {
  const links = loadLinks();
  const url = new URL(links.buildFoodConfirmationUrl("2026-09-13"));
  assert.equal(url.origin, "https://www.mo-tshirt.mu");
  assert.equal(url.pathname, "/food-confirmation");
  assert.equal(url.searchParams.get("day"), "2026-09-13");
  assert.ok(url.searchParams.get("expires"));
  assert.ok(url.searchParams.get("token"));
  assert.equal(url.searchParams.size, 3);
});
