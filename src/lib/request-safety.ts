type RateLimitEntry = {
  count: number;
  resetAt: number;
  blockedUntil: number;
};

export type RateLimitConfig = {
  scope: string;
  maxRequests: number;
  windowMs: number;
  blockDurationMs?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  current: number;
  resetAt: number;
  retryAfterSeconds: number;
  blocked: boolean;
};

declare global {
  var __moRateLimitStore: Map<string, RateLimitEntry> | undefined;
  var __moRateLimitSweepAt: number | undefined;
}

const STORE_SWEEP_INTERVAL_MS = 60_000;

export const API_RATE_LIMIT: RateLimitConfig = {
  scope: "api",
  maxRequests: 120,
  windowMs: 60_000,
};

export const CONTACT_RATE_LIMIT: RateLimitConfig = {
  scope: "contact",
  maxRequests: 6,
  windowMs: 10 * 60_000,
  blockDurationMs: 30 * 60_000,
};

export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  scope: "login",
  maxRequests: 5,
  windowMs: 10 * 60_000,
  blockDurationMs: 30 * 60_000,
};

export const DOWNLOAD_RATE_LIMIT: RateLimitConfig = {
  scope: "shops-download",
  maxRequests: 30,
  windowMs: 10 * 60_000,
};

function getRateLimitStore() {
  if (!globalThis.__moRateLimitStore) {
    globalThis.__moRateLimitStore = new Map<string, RateLimitEntry>();
  }
  return globalThis.__moRateLimitStore;
}

function sweepRateLimitStore(now: number) {
  const lastSweepAt = globalThis.__moRateLimitSweepAt || 0;
  if (now - lastSweepAt < STORE_SWEEP_INTERVAL_MS) return;

  const store = getRateLimitStore();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now && entry.blockedUntil <= now) {
      store.delete(key);
    }
  }

  globalThis.__moRateLimitSweepAt = now;
}

function normalizeForwardedValue(value: string) {
  return value
    .trim()
    .replace(/^for=/i, "")
    .replace(/^"+|"+$/g, "")
    .replace(/^\[|\]$/g, "");
}

export function getClientIpFromHeaders(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for");
  const forwarded = headers.get("forwarded");
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    forwardedFor ? forwardedFor.split(",")[0] : null,
    forwarded ? forwarded.split(";")[0] : null,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = normalizeForwardedValue(candidate);
    if (normalized) return normalized;
  }

  return "unknown";
}

function getRateLimitKey(headers: Headers, scope: string) {
  return `${scope}:${getClientIpFromHeaders(headers)}`;
}

export function evaluateRateLimit({
  key,
  maxRequests,
  windowMs,
  blockDurationMs = 0,
  now = Date.now(),
}: {
  key: string;
  maxRequests: number;
  windowMs: number;
  blockDurationMs?: number;
  now?: number;
}): RateLimitResult {
  const safeLimit = Math.max(1, Math.floor(maxRequests));
  const safeWindowMs = Math.max(1_000, Math.floor(windowMs));
  const safeBlockDurationMs = Math.max(0, Math.floor(blockDurationMs));
  const store = getRateLimitStore();

  sweepRateLimitStore(now);

  let entry = store.get(key);

  if (!entry || (entry.resetAt <= now && entry.blockedUntil <= now)) {
    entry = {
      count: 0,
      resetAt: now + safeWindowMs,
      blockedUntil: 0,
    };
  }

  if (entry.blockedUntil > now) {
    return {
      allowed: false,
      limit: safeLimit,
      remaining: 0,
      current: entry.count,
      resetAt: entry.blockedUntil,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.blockedUntil - now) / 1_000)),
      blocked: true,
    };
  }

  if (entry.resetAt <= now) {
    entry.count = 0;
    entry.resetAt = now + safeWindowMs;
    entry.blockedUntil = 0;
  }

  entry.count += 1;
  store.set(key, entry);

  if (entry.count > safeLimit) {
    if (safeBlockDurationMs > 0) {
      entry.blockedUntil = now + safeBlockDurationMs;
      store.set(key, entry);
    }

    const retryAt = entry.blockedUntil > now ? entry.blockedUntil : entry.resetAt;
    return {
      allowed: false,
      limit: safeLimit,
      remaining: 0,
      current: entry.count,
      resetAt: retryAt,
      retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now) / 1_000)),
      blocked: entry.blockedUntil > now,
    };
  }

  return {
    allowed: true,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - entry.count),
    current: entry.count,
    resetAt: entry.resetAt,
    retryAfterSeconds: 0,
    blocked: false,
  };
}

export function evaluateRequestRateLimit(headers: Headers, config: RateLimitConfig) {
  return evaluateRateLimit({
    key: getRateLimitKey(headers, config.scope),
    maxRequests: config.maxRequests,
    windowMs: config.windowMs,
    blockDurationMs: config.blockDurationMs,
  });
}

export function getRateLimitHeaders(result: RateLimitResult) {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1_000)),
  };

  if (!result.allowed) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }

  return headers;
}

export function isRequestOriginAllowed(req: Pick<Request, "headers" | "url">) {
  const origin = req.headers.get("origin") || req.headers.get("referer");
  if (!origin) return true;

  try {
    const source = new URL(origin);
    const target = new URL(req.url);
    return source.host === target.host;
  } catch {
    return false;
  }
}

export function isContentLengthWithinLimit(headers: Headers, maxBytes: number) {
  const raw = headers.get("content-length");
  if (!raw) return true;

  const size = Number(raw);
  if (!Number.isFinite(size) || size < 0) return false;
  return size <= maxBytes;
}

export function clearRateLimitStore() {
  getRateLimitStore().clear();
  globalThis.__moRateLimitSweepAt = 0;
}
