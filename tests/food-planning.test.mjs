import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDinnerConfirmationEmail,
  buildFoodReminderMessage,
  getFoodForDay,
  getMauritiusClock,
  getMauritiusPlanningWeekKey,
  normalizeFoodName,
  normalizeRecipients,
  normalizeWhatsAppNumber,
  omitUndefinedValues,
} from "../src/lib/food-planning.ts";

test("Mauritius clock returns the local day at the 08:00 reminder time", () => {
  const clock = getMauritiusClock(new Date("2026-09-13T04:00:00.000Z"));
  assert.deepEqual(clock, {
    dayKey: "2026-09-13",
    weekday: "Sunday",
    hhmm: "08:00",
  });
});

test("Sunday planning and the following weekdays share one planning week key", () => {
  assert.equal(getMauritiusPlanningWeekKey(new Date("2026-09-13T04:00:00.000Z")), "2026-09-14");
  assert.equal(getMauritiusPlanningWeekKey(new Date("2026-09-16T08:00:00.000Z")), "2026-09-14");
  assert.equal(getMauritiusPlanningWeekKey(new Date("2026-09-20T04:00:00.000Z")), "2026-09-21");
});

test("food planning values are normalized safely", () => {
  assert.equal(normalizeWhatsAppNumber("59041294"), "+23059041294");
  assert.equal(normalizeWhatsAppNumber("230 5 123 4567"), "+23051234567");
  assert.equal(normalizeWhatsAppNumber("not-a-phone"), "");
  assert.deepEqual(normalizeRecipients([" Owner@Example.com ", "owner@example.com", "bad"]), [
    "owner@example.com",
  ]);
  assert.equal(normalizeFoodName("  Chicken   curry  "), "Chicken curry");
  assert.equal(getFoodForDay({ Sunday: " Agneau Salmi " }, "Sunday"), "Agneau Salmi");
  assert.deepEqual(omitUndefinedValues({ enabled: true, lastReminder: undefined }), { enabled: true });
});

test("messages include the preset meal and escape email HTML", () => {
  const reminder = buildFoodReminderMessage("Sunday", "Agneau Salmi", "https://example.com/confirm");
  assert.match(reminder, /Agneau Salmi/);
  assert.match(reminder, /https:\/\/example\.com\/confirm/);

  const email = buildDinnerConfirmationEmail("Sunday", "Fish <script>");
  assert.equal(email.subject, "Tonight's dinner: Fish <script>");
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /Fish &lt;script&gt;/);
});
