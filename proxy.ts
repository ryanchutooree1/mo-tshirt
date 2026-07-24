import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readAdminSession } from "@/lib/admin-auth";
import {
  getAdminLandingPath,
  hasAdminApiAccess,
  hasAdminPageAccess,
} from "@/lib/admin-access";
import {
  API_RATE_LIMIT,
  CONTACT_RATE_LIMIT,
  DOWNLOAD_RATE_LIMIT,
  LOGIN_RATE_LIMIT,
  evaluateRequestRateLimit,
  getRateLimitHeaders,
} from "@/lib/request-safety";

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  return response;
}

function resolveApiRateLimit(pathname: string) {
  if (pathname === "/api/login") return LOGIN_RATE_LIMIT;
  if (pathname === "/api/contact") return CONTACT_RATE_LIMIT;
  if (pathname === "/api/shops/download") return DOWNLOAD_RATE_LIMIT;
  return API_RATE_LIMIT;
}

function isPartnerDeskRoute(pathname: string) {
  return (
    pathname === "/admin/workspace" ||
    pathname === "/admin/yan_list" ||
    pathname === "/admin/shab_list" ||
    (pathname.startsWith("/admin/partners/") && pathname !== "/admin/partners")
  );
}

function isCbeHost(host: string | null) {
  return Boolean(host?.split(":")[0].toLowerCase() === "cbe.mo-tshirt.mu");
}

function isMobHost(host: string | null) {
  return Boolean(host?.split(":")[0].toLowerCase() === "mob.mo-tshirt.mu");
}

function readCronSecret() {
  return String(process.env.CRON_SECRET || process.env.IOT_CRON_SECRET || "").trim();
}

function isCronAuthorized(req: NextRequest) {
  const secret = readCronSecret();

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return false;
}

function isAuthorizedCoupleFoodCron(req: NextRequest) {
  return (
    req.method === "GET" &&
    req.nextUrl.pathname === "/api/admin/couple-goals/food-email" &&
    isCronAuthorized(req)
  );
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const mobHost = isMobHost(req.headers.get("host"));

  if (isCbeHost(req.headers.get("host")) && pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/cbe";
    return applySecurityHeaders(NextResponse.rewrite(url));
  }

  if (pathname.startsWith("/api/")) {
    const rateLimit = evaluateRequestRateLimit(req.headers, resolveApiRateLimit(pathname));
    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: getRateLimitHeaders(rateLimit) }
      );
      response.headers.set("Cache-Control", "no-store");
      return applySecurityHeaders(response);
    }

    const response = NextResponse.next();
    for (const [header, value] of Object.entries(getRateLimitHeaders(rateLimit))) {
      response.headers.set(header, value);
    }

    if (isAuthorizedCoupleFoodCron(req)) {
      return applySecurityHeaders(response);
    }

    const requiresAnyAdminSession =
      pathname === "/api/admin/session" || pathname === "/api/admin/firebase-auth";
    const requiresScopedAdminAccess =
      pathname.startsWith("/api/admin/") || pathname.startsWith("/api/tuya/");

    if (requiresAnyAdminSession || requiresScopedAdminAccess) {
      const session = await readAdminSession(req.cookies);
      if (!session) {
        return applySecurityHeaders(
          NextResponse.json({ error: "Unauthorized." }, { status: 401 })
        );
      }

      if (
        requiresScopedAdminAccess &&
        !hasAdminApiAccess(session.allowedPages, pathname, {
          isOwner: session.isOwner,
        })
      ) {
        return applySecurityHeaders(
          NextResponse.json({ error: "Forbidden." }, { status: 403 })
        );
      }
    }

    return applySecurityHeaders(response);
  }

  if (isPartnerDeskRoute(pathname)) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return applySecurityHeaders(response);
  }

  const isMobPath = pathname === "/mob" || pathname.startsWith("/mob/");
  const isMobLogin = mobHost && pathname === "/login";
  const isMobAsset =
    mobHost &&
    (pathname.startsWith("/_next/") ||
      pathname.startsWith("/favicon") ||
      pathname.startsWith("/apple-touch-icon") ||
      pathname === "/icon.png" ||
      pathname === "/site.webmanifest" ||
      /\.(?:avif|gif|ico|jpe?g|png|svg|webp)$/i.test(pathname));
  const isMobSurface = isMobPath || (mobHost && !isMobLogin && !isMobAsset);

  if (isMobSurface) {
    const internalPath = mobHost
      ? pathname === "/"
        ? "/mob"
        : `/mob${pathname}`
      : pathname;
    const session = await readAdminSession(req.cookies);
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return applySecurityHeaders(NextResponse.redirect(url));
    }

    const canUsePhotoLog =
      session.isOwner ||
      hasAdminPageAccess(
        session.allowedPages,
        "/admin/inventory-photo-log",
        { isOwner: session.isOwner }
      );
    if (!session.isOwner && internalPath !== "/mob/photo-log") {
      if (!canUsePhotoLog) {
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        url.search = "";
        return applySecurityHeaders(NextResponse.redirect(url));
      }
      const url = req.nextUrl.clone();
      url.pathname = mobHost ? "/photo-log" : "/mob/photo-log";
      url.search = "";
      return applySecurityHeaders(NextResponse.redirect(url));
    }
    if (
      internalPath === "/mob/photo-log" &&
      !canUsePhotoLog
    ) {
      const fallbackPath = getAdminLandingPath(session.allowedPages, {
        isOwner: session.isOwner,
      });
      const url = req.nextUrl.clone();
      url.pathname = fallbackPath;
      url.search = "?denied=1";
      return applySecurityHeaders(NextResponse.redirect(url));
    }

    if (mobHost) {
      const url = req.nextUrl.clone();
      url.pathname = internalPath;
      return applySecurityHeaders(NextResponse.rewrite(url));
    }
    return applySecurityHeaders(NextResponse.next());
  }

  // Protect all /admin routes and the standalone IoT command deck.
  const isProtectedRoute = pathname.startsWith("/admin") || pathname === "/iot";
  if (!isProtectedRoute) return applySecurityHeaders(NextResponse.next());

  const session = await readAdminSession(req.cookies);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const response = NextResponse.redirect(url);
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return applySecurityHeaders(response);
  }

  if (
    hasAdminPageAccess(session.allowedPages, pathname, {
      isOwner: session.isOwner,
    })
  ) {
    return applySecurityHeaders(NextResponse.next());
  }

  const fallbackPath = getAdminLandingPath(session.allowedPages, {
    isOwner: session.isOwner,
  });
  const url = req.nextUrl.clone();
  url.pathname = fallbackPath;
  url.search = fallbackPath === "/login" ? "" : "?denied=1";
  const response = NextResponse.redirect(url);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/mob/:path*",
    "/photo-log/:path*",
    "/inventory/:path*",
    "/settings/:path*",
    "/login",
    "/design-studio",
    "/iot",
    "/api/:path*",
  ],
};
