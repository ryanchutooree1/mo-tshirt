import test from "node:test";
import assert from "node:assert/strict";
import {
  clearRateLimitStore,
  evaluateRateLimit,
  getClientIpFromHeaders,
  isContentLengthWithinLimit,
  isRequestOriginAllowed,
} from "../src/lib/request-safety.ts";

test("client IP is derived from the first forwarded address", () => {
  clearRateLimitStore();
  const headers = new Headers({
    "x-forwarded-for": "198.51.100.10, 10.0.0.7",
  });

  assert.equal(getClientIpFromHeaders(headers), "198.51.100.10");
});

test("rate limiter allows requests up to the configured ceiling and resets after the window", () => {
  clearRateLimitStore();

  const first = evaluateRateLimit({
    key: "contact:198.51.100.10",
    maxRequests: 2,
    windowMs: 1_000,
    now: 1_000,
  });
  const second = evaluateRateLimit({
    key: "contact:198.51.100.10",
    maxRequests: 2,
    windowMs: 1_000,
    now: 1_100,
  });
  const blocked = evaluateRateLimit({
    key: "contact:198.51.100.10",
    maxRequests: 2,
    windowMs: 1_000,
    now: 1_200,
  });
  const reset = evaluateRateLimit({
    key: "contact:198.51.100.10",
    maxRequests: 2,
    windowMs: 1_000,
    now: 2_100,
  });

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
  assert.equal(reset.allowed, true);
  assert.equal(reset.remaining, 1);
});

test("rate limiter keeps an IP blocked for the configured lockout period", () => {
  clearRateLimitStore();

  const first = evaluateRateLimit({
    key: "login:203.0.113.8",
    maxRequests: 1,
    windowMs: 1_000,
    blockDurationMs: 5_000,
    now: 10_000,
  });
  const blocked = evaluateRateLimit({
    key: "login:203.0.113.8",
    maxRequests: 1,
    windowMs: 1_000,
    blockDurationMs: 5_000,
    now: 10_100,
  });
  const stillBlocked = evaluateRateLimit({
    key: "login:203.0.113.8",
    maxRequests: 1,
    windowMs: 1_000,
    blockDurationMs: 5_000,
    now: 12_000,
  });
  const released = evaluateRateLimit({
    key: "login:203.0.113.8",
    maxRequests: 1,
    windowMs: 1_000,
    blockDurationMs: 5_000,
    now: 15_101,
  });

  assert.equal(first.allowed, true);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.blocked, true);
  assert.equal(stillBlocked.allowed, false);
  assert.equal(released.allowed, true);
});

test("origin checks only allow same-host browser submissions", () => {
  clearRateLimitStore();

  const sameHost = new Request("https://www.mo-tshirt.mu/api/contact", {
    headers: { origin: "https://www.mo-tshirt.mu" },
  });
  const otherHost = new Request("https://www.mo-tshirt.mu/api/contact", {
    headers: { origin: "https://evil.example" },
  });

  assert.equal(isRequestOriginAllowed(sameHost), true);
  assert.equal(isRequestOriginAllowed(otherHost), false);
});

test("content-length guard rejects oversized payloads", () => {
  clearRateLimitStore();

  assert.equal(isContentLengthWithinLimit(new Headers({ "content-length": "1024" }), 2048), true);
  assert.equal(isContentLengthWithinLimit(new Headers({ "content-length": "4096" }), 2048), false);
});
