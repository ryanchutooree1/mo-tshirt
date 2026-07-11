import assert from "node:assert/strict";
import test from "node:test";
import { getPrintPartnerPath } from "../src/lib/partners.ts";
import { PRODUCTION_MANAGER_PATH } from "../src/lib/production-manager-auth.ts";

test("production roles share one workspace route", () => {
  assert.equal(PRODUCTION_MANAGER_PATH, "/admin/workspace");
  assert.equal(getPrintPartnerPath("yan"), "/admin/workspace?partner=yan");
  assert.equal(getPrintPartnerPath("shabanaz"), "/admin/workspace?partner=shabanaz");
  assert.equal(getPrintPartnerPath("new-partner"), "/admin/workspace?partner=new-partner");
});
