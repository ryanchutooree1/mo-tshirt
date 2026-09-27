import assert from "node:assert/strict";
import test from "node:test";
import {
  dateDistanceInDays,
  normalizeHomeManagementData,
} from "../src/lib/home-management.ts";

test("home management data safely normalizes saved records", () => {
  const normalized = normalizeHomeManagementData({
    bills: [{ id: "b1", name: "CEB", amount: 1200, autoPay: true, status: "invalid" }],
    maintenance: [{ id: "m1", title: "Service aircon", priority: "urgent" }],
    events: [{ id: "e1", title: "Delivery", status: "done", reminder: "3 days before" }],
    documents: [{ id: "d1", title: "Warranty", expiryDate: "2026-10-01" }],
  });

  assert.equal(normalized.bills[0].name, "CEB");
  assert.equal(normalized.bills[0].amount, "");
  assert.equal(normalized.bills[0].autoPay, true);
  assert.equal(normalized.bills[0].status, "upcoming");
  assert.equal(normalized.maintenance[0].priority, "urgent");
  assert.equal(normalized.events[0].status, "done");
  assert.deepEqual(normalized.events[0].reminders, ["3 days before"]);
  assert.equal(normalized.documents[0].expiryDate, "2026-10-01");
});

test("home calendar keeps multiple unique reminders and supports no reminder", () => {
  const normalized = normalizeHomeManagementData({
    events: [
      { id: "multiple", reminders: ["1 hour before", "1 day before", "1 week before", "1 day before"] },
      { id: "none", reminder: "No reminder" },
    ],
  });

  assert.deepEqual(normalized.events[0].reminders, ["1 hour before", "1 day before", "1 week before"]);
  assert.deepEqual(normalized.events[1].reminders, []);
});

test("date distance supports future, current, and overdue household items", () => {
  assert.equal(dateDistanceInDays("2026-09-20", "2026-09-13"), 7);
  assert.equal(dateDistanceInDays("2026-09-13", "2026-09-13"), 0);
  assert.equal(dateDistanceInDays("2026-09-10", "2026-09-13"), -3);
  assert.equal(dateDistanceInDays("", "2026-09-13"), null);
});
