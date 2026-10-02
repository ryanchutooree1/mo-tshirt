import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getPrintPartnerPath } from "../src/lib/partners.ts";
import { PRODUCTION_MANAGER_ALLOWED_PAGES, PRODUCTION_MANAGER_PATH } from "../src/lib/production-manager-auth.ts";
import { getAdminLandingPath, hasAdminPageAccess } from "../src/lib/admin-access.ts";

test("Tanvi lands in the quotation workspace while partners keep their production routes", () => {
  assert.equal(PRODUCTION_MANAGER_PATH, "/admin/quotation-approval");
  assert.equal(getPrintPartnerPath("yan"), "/admin/workspace?partner=yan");
  assert.equal(getPrintPartnerPath("shabanaz"), "/admin/workspace?partner=shabanaz");
  assert.equal(getPrintPartnerPath("new-partner"), "/admin/workspace?partner=new-partner");
});

test("the manager role can open its landing route without broad inbox or order grants", () => {
  assert.equal(getAdminLandingPath(PRODUCTION_MANAGER_ALLOWED_PAGES), PRODUCTION_MANAGER_PATH);
  assert.equal(hasAdminPageAccess(PRODUCTION_MANAGER_ALLOWED_PAGES, PRODUCTION_MANAGER_PATH), true);
  assert.equal(hasAdminPageAccess(PRODUCTION_MANAGER_ALLOWED_PAGES, "/admin/inbox"), false);
  assert.equal(hasAdminPageAccess(PRODUCTION_MANAGER_ALLOWED_PAGES, "/admin/orders"), false);
  assert.equal(getAdminLandingPath(PRODUCTION_MANAGER_ALLOWED_PAGES, { isOwner: true }), "/admin");
});

test("the Tanvi alias redirects to quotations and the explicit legacy workspace remains available", () => {
  const alias = readFileSync(new URL("../app/admin/tanvi/page.tsx", import.meta.url), "utf8");
  assert.match(alias, /redirect\("\/admin\/quotation-approval"\)/);
  assert.doesNotMatch(alias, /redirect\("\/admin\/workspace"\)/);
  const legacy = readFileSync(new URL("../app/admin/workspace/page.tsx", import.meta.url), "utf8");
  assert.match(legacy, /adminSession\.allowedPages\.includes\("\/admin\/tanvi"\)/);
  assert.match(legacy, /return <TanviDeskPage\s*\/>/);
});
