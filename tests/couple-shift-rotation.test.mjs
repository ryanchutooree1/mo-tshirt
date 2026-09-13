import assert from "node:assert/strict";
import test from "node:test";
import {
  COUPLE_SHIFT_PATTERN,
  getCoupleRotationShift,
} from "../src/lib/couple-shift-rotation.ts";

test("the corrected rotation starts on 19 September with M pending on the 21st", () => {
  const start = "2026-09-19";

  assert.deepEqual(COUPLE_SHIFT_PATTERN, [
    "first",
    "third",
    "m",
    "second",
    "first",
    "third",
    "second",
    "rest",
  ]);
  assert.equal(getCoupleRotationShift("2026-09-19", start), "first");
  assert.equal(getCoupleRotationShift("2026-09-20", start), "third");
  assert.equal(getCoupleRotationShift("2026-09-21", start), "m");
});

test("M pending repeats dynamically every eight days", () => {
  const start = "2026-09-19";

  assert.equal(getCoupleRotationShift("2026-09-29", start), "m");
  assert.equal(getCoupleRotationShift("2026-10-07", start), "m");
  assert.equal(getCoupleRotationShift("2027-01-03", start), "m");
});

test("dates before the rotation anchor wrap through the same pattern", () => {
  assert.equal(
    getCoupleRotationShift("2026-09-18", "2026-09-19"),
    "rest"
  );
});
