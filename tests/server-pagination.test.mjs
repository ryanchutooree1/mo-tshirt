import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeTimelineCursor,
  encodeTimelineCursor,
  parsePageSize,
} from "../src/lib/server-pagination.ts";

test("timeline cursors round-trip without exposing query structure", () => {
  const cursor = {
    timestamp: "2026-07-25T08:45:00.000Z",
    id: "history-demo-001",
  };
  assert.deepEqual(decodeTimelineCursor(encodeTimelineCursor(cursor)), cursor);
});

test("invalid timeline cursors fail closed", () => {
  assert.equal(decodeTimelineCursor("not-a-cursor"), null);
  assert.equal(
    decodeTimelineCursor(
      Buffer.from(JSON.stringify({ timestamp: "bad", id: "x" })).toString(
        "base64url"
      )
    ),
    null
  );
});

test("page sizes are bounded for everyday use", () => {
  assert.equal(parsePageSize(null), 20);
  assert.equal(parsePageSize("25"), 25);
  assert.equal(parsePageSize("500"), 50);
  assert.equal(parsePageSize("-1"), 20);
});
