import assert from "node:assert/strict";
import test from "node:test";
import { emptyTestState, simulateTestMessage, restoreTestState, testStorageKey, TEST_SCENARIOS } from "../src/lib/bot-testing.ts";
import { ALL_ADMIN_PAGE_PATHS, hasAdminPageAccess, hasAdminApiAccess, isBotTestingPath, getAdminLandingPath } from "../src/lib/admin-access.ts";

test("only owners can access test routes even with explicitly assigned permission", () => {
  for (const path of ["/admin/bot-testing", "/admin/bot-testing/nested"]) {
    assert.equal(hasAdminPageAccess(ALL_ADMIN_PAGE_PATHS, path, { isOwner: false }), false);
    assert.equal(hasAdminPageAccess([], path, { isOwner: true }), true);
    assert.equal(isBotTestingPath(path), true);
  }
  assert.equal(isBotTestingPath("/admin/quotation-approval"), false);
  assert.equal(isBotTestingPath("/admin/bot-testing-other"), false);
  assert.equal(hasAdminApiAccess(ALL_ADMIN_PAGE_PATHS, "/api/admin/bot-testing/chat", { isOwner: false }), false);
  assert.equal(getAdminLandingPath(["/admin/bot-testing"], { isOwner: false }), "/login");
});

test("every synthetic scenario completes and restores without duplicating records", () => {
  for (const scenario of TEST_SCENARIOS) {
    let state = emptyTestState(scenario.id);
    state = simulateTestMessage(state, "Create quote");
    state = simulateTestMessage(state, "Create quote");
    assert.equal(state.quote, "draft");
    assert.match(state.messages.at(-1).text, /already exists/);
    state = simulateTestMessage(state, "Accept quote");
    state = simulateTestMessage(state, "Accept quote");
    state = simulateTestMessage(state, "Create invoice");
    state = simulateTestMessage(state, "Create invoice");
    assert.equal(state.invoice, "unpaid");
    state = simulateTestMessage(state, "Mark invoice paid");
    state = simulateTestMessage(state, "Mark invoice paid");
    assert.equal(state.invoice, "paid");
    assert.deepEqual(restoreTestState(JSON.stringify(state)), state);
  }
});

test("out-of-order and rejected workflows cannot produce invoices or payments", () => {
  let state = emptyTestState();
  for (const command of ["Create invoice", "Accept quote", "Mark invoice paid", "Reject quote"]) state = simulateTestMessage(state, command);
  assert.equal(state.quote, "none"); assert.equal(state.invoice, "none");
  state = simulateTestMessage(state, "Create quote");
  state = simulateTestMessage(state, "Reject quote");
  state = simulateTestMessage(state, "Accept quote");
  state = simulateTestMessage(state, "Create invoice");
  assert.equal(state.quote, "rejected"); assert.equal(state.invoice, "none");
});

test("external actions and unknown model prompts leave records untouched", () => {
  for (const command of ["Email the customer", "Send quote", "Create a real invoice", "Generate payment link", "Explain quantum physics"]) {
    const next = simulateTestMessage(emptyTestState(), command);
    assert.equal(next.quote, "none"); assert.equal(next.invoice, "none");
    assert.match(next.messages.at(-1).text, /cannot|deterministic simulation/);
  }
  assert.deepEqual(simulateTestMessage(emptyTestState(), "  "), emptyTestState());
});

test("storage is bounded, validates workflow invariants and isolates owner keys", () => {
  assert.notEqual(testStorageKey("owner-A"), testStorageKey("owner-B"));
  for (const value of [null, "{broken", "null", "x".repeat(100001), JSON.stringify({ ...emptyTestState(), scenarioId: "real" }), JSON.stringify({ ...emptyTestState(), invoice: "paid" }), JSON.stringify({ ...emptyTestState(), messages: [{ role: "user", text: 5 }] })]) assert.deepEqual(restoreTestState(value), emptyTestState());
  let state = emptyTestState();
  for (let index = 0; index < 100; index++) state = simulateTestMessage(state, "Status");
  assert.equal(state.messages.length, 80);
  assert.deepEqual(restoreTestState(JSON.stringify(state)), state);
  assert.deepEqual(emptyTestState("polos"), { version: 1, scenarioId: "polos", quote: "none", invoice: "none", messages: [emptyTestState().messages[0]] });
});
