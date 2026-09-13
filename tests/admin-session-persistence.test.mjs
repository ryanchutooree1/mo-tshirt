import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_AUTH_COOKIE,
  createAdminSessionToken,
  readAdminSessionToken,
  refreshRememberedAdminSession,
} from "../src/lib/admin-auth.ts";

const REMEMBERED_SESSION_TTL_SECONDS = 60 * 60 * 24 * 400;

const sessionSeed = {
  userId: "owner",
  displayName: "Owner",
  email: "owner@example.com",
  allowedPages: ["/admin"],
  isOwner: true,
};

test("remembered admin sessions renew as persistent sessions", async () => {
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = "admin-session-persistence-test-secret";

  try {
    const token = await createAdminSessionToken(sessionSeed, { rememberMe: true });
    const session = await readAdminSessionToken(token);

    assert.ok(session);
    assert.equal(session.rememberMe, true);

    const cookieWrites = [];
    const response = {
      cookies: {
        set(...args) {
          cookieWrites.push(args);
        },
      },
    };

    await refreshRememberedAdminSession(response, session);

    assert.equal(cookieWrites.length, 1);
    const [name, refreshedToken, options] = cookieWrites[0];
    assert.equal(name, ADMIN_AUTH_COOKIE);
    assert.equal(options.httpOnly, true);
    assert.equal(options.maxAge, REMEMBERED_SESSION_TTL_SECONDS);

    const refreshedSession = await readAdminSessionToken(refreshedToken);
    assert.ok(refreshedSession);
    assert.equal(refreshedSession.rememberMe, true);
    assert.ok(
      refreshedSession.expiresAt >=
        Math.floor(Date.now() / 1000) + REMEMBERED_SESSION_TTL_SECONDS - 2
    );
  } finally {
    if (previousSecret === undefined) {
      delete process.env.ADMIN_SESSION_SECRET;
    } else {
      process.env.ADMIN_SESSION_SECRET = previousSecret;
    }
  }
});
