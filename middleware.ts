import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasAdminSession } from "@/lib/admin-auth";
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

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

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
    return applySecurityHeaders(response);
  }

  if (pathname === "/design-studio") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.hash = "contact";
    const response = NextResponse.redirect(url, 308);
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return applySecurityHeaders(response);
  }

  // Protect all /admin routes and the standalone IoT command deck.
  const isProtectedRoute = pathname.startsWith("/admin") || pathname === "/iot";
  if (!isProtectedRoute) return applySecurityHeaders(NextResponse.next());

  if (await hasAdminSession(req.cookies)) return applySecurityHeaders(NextResponse.next());

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  const response = NextResponse.redirect(url);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return applySecurityHeaders(response);
}

export const config = {
  matcher: ["/admin/:path*", "/design-studio", "/iot", "/api/:path*"],
};
