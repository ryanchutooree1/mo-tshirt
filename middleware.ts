import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasAdminSession } from "@/lib/admin-auth";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname === "/design-studio") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.hash = "contact";
    const response = NextResponse.redirect(url);
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  // Protect all /admin routes and the standalone IoT command deck.
  const isProtectedRoute = pathname.startsWith("/admin") || pathname === "/iot";
  if (!isProtectedRoute) return NextResponse.next();

  if (await hasAdminSession(req.cookies)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  const response = NextResponse.redirect(url);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/design-studio", "/iot"],
};
