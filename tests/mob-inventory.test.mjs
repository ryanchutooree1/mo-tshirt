import assert from "node:assert/strict";
import test from "node:test";
import {
  applyInventoryTransaction,
  getInventoryMergeKey,
  parseMobInventoryItemInput,
  parseMobInventorySettings,
} from "../src/lib/mob-inventory.ts";

test("inventory merge keys ignore product-name casing and punctuation", () => {
  assert.equal(
    getInventoryMergeKey("  Blue Polo-Shirt "),
    getInventoryMergeKey("blue polo shirt")
  );
});

test("manual stock input accepts an optional category", () => {
  const parsed = parseMobInventoryItemInput({
    productName: "Blue Polo",
    category: "",
    quantity: 10,
    sellingPrice: 450,
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.data.category, "");
});

test("stock adjustments never produce a negative balance", () => {
  assert.equal(applyInventoryTransaction(3, "stock-out", 5), 0);
  assert.equal(applyInventoryTransaction(3, "stock-in", 5), 8);
});

test("retention settings enforce a bounded day count", () => {
  assert.equal(
    parseMobInventorySettings({
      deleteCompletedPhotos: true,
      photoRetentionDays: 2,
    }).ok,
    true
  );
  assert.equal(
    parseMobInventorySettings({
      deleteCompletedPhotos: true,
      photoRetentionDays: 0,
    }).ok,
    false
  );
});
