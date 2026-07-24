import assert from "node:assert/strict";
import test from "node:test";
import { buildDemoMobileShopInventory } from "../src/lib/mob-inventory-demo.ts";

test("demo mobile shop inventory is realistic and internally reconciled", () => {
  const demo = buildDemoMobileShopInventory(
    new Date("2026-07-25T08:00:00.000Z")
  );
  assert.equal(demo.items.length, 18);
  assert.ok(demo.transactions.length >= 80);
  assert.ok(demo.items.some((item) => item.quantity === 0));
  assert.ok(
    demo.items.filter(
      (item) => item.quantity <= item.lowStockThreshold
    ).length >= 3
  );

  for (const item of demo.items) {
    const movements = demo.transactions.filter(
      (transaction) => transaction.inventoryItemId === item.id
    );
    assert.ok(movements.length > 0);
    assert.equal(movements.at(-1)?.balanceAfter, item.quantity);
  }
});
