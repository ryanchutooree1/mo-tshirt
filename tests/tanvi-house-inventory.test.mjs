import assert from "node:assert/strict";
import test from "node:test";
import {
  mapTanviHouseInventoryItem,
  parseHouseInventoryCreate,
  parseHouseInventoryPatch,
} from "../src/lib/tanvi-house-inventory.ts";

test("house inventory creation trims input and supplies safe defaults", () => {
  const parsed = parseHouseInventoryCreate({
    name: "  Hand soap  ",
    category: "",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.name, "Hand soap");
    assert.equal(parsed.data.category, "Other");
    assert.equal(parsed.data.stockLevel, "high");
  }
});

test("house inventory rejects missing names and invalid stock levels", () => {
  assert.equal(parseHouseInventoryCreate({ name: " " }).ok, false);
  assert.equal(parseHouseInventoryPatch({ stockLevel: "empty" }).ok, false);
});

test("house inventory patches only supported editable fields", () => {
  const parsed = parseHouseInventoryPatch({
    name: " Laundry soap ",
    needNow: true,
    ignored: "value",
  });

  assert.deepEqual(parsed, {
    ok: true,
    data: {
      name: "Laundry soap",
      needNow: true,
    },
  });
});

test("house inventory checkbox patches require real booleans", () => {
  assert.equal(parseHouseInventoryPatch({ needNow: "false" }).ok, false);
  assert.equal(parseHouseInventoryPatch({ purchased: 1 }).ok, false);
});

test("stored house inventory values map to stable UI defaults", () => {
  const item = mapTanviHouseInventoryItem("item-1", {
    name: "Dishwasher tablets",
    category: "Kitchen",
    stockLevel: "unknown",
    needNow: true,
  });

  assert.equal(item.id, "item-1");
  assert.equal(item.stockLevel, "high");
  assert.equal(item.needNow, true);
  assert.equal(item.purchased, false);
});
