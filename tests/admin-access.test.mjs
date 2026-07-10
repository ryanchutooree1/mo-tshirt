import assert from "node:assert/strict";
import test from "node:test";
import {
  hasAdminPageAccess,
  resolveAdminPagePath,
} from "../src/lib/admin-access.ts";

test("the dashboard permission does not grant unregistered admin routes", () => {
  assert.equal(resolveAdminPagePath("/admin"), "/admin");
  assert.equal(resolveAdminPagePath("/admin/unknown-module"), null);
  assert.equal(
    hasAdminPageAccess(["/admin"], "/admin/unknown-module", { isOwner: false }),
    false
  );
});

test("registered nested routes resolve to their owning module", () => {
  assert.equal(resolveAdminPagePath("/admin/partners/example"), "/admin/partners");
});

test("Tanvi access continues to include quotations", () => {
  assert.equal(
    hasAdminPageAccess(["/admin/tanvi"], "/admin/quotation-approval", {
      isOwner: false,
    }),
    true
  );
});
