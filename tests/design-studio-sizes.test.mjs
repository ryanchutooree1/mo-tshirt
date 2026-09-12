import assert from "node:assert/strict";
import test from "node:test";
import { reconcileSizeQuantities, getStudioSizeSelection } from "../src/lib/design-studio-sizes.ts";

const sizes = ["XS", "S", "M", "L", "XL"];
test("a new design has no silently selected Medium garment", () => {
  const selection = getStudioSizeSelection(sizes, reconcileSizeQuantities(sizes));
  assert.equal(selection.total, 0);
  assert.deepEqual(selection.rows, []);
});
test("two small polos survive colour changes and reselection without becoming Medium", () => {
  const changed = reconcileSizeQuantities(sizes, { S: 2, M: 0 });
  assert.deepEqual(getStudioSizeSelection(sizes, changed), {
    rows: [{ size: "S", quantity: 2 }], total: 2, size: "S", label: "S × 2",
  });
  assert.deepEqual(reconcileSizeQuantities(sizes, changed), changed);
});
test("mixed sizes retain separate quantities and are represented as Mixed in the request", () => {
  const selection = getStudioSizeSelection(sizes, { S: 1, L: 1 });
  assert.equal(selection.total, 2);
  assert.equal(selection.size, "Mixed");
  assert.equal(selection.label, "S × 1, L × 1");
  assert.deepEqual(selection.rows, [{ size: "S", quantity: 1 }, { size: "L", quantity: 1 }]);
});
test("unavailable sizes are removed without substitution; invalid quantities cannot enter totals", () => {
  const quantities = reconcileSizeQuantities(["M", "L"], { S: 2, L: 1 });
  assert.deepEqual(quantities, { M: 0, L: 1 });
  assert.equal(getStudioSizeSelection(sizes, { S: -1, M: NaN, L: 1.5 }).total, 0);
  assert.equal(getStudioSizeSelection(sizes, { S: 0 }).total, 0);
});
