import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasAdminSession } from "@/lib/admin-auth";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Protect all /admin routes
  const isAdmin = pathname.startsWith("/admin");
  if (!isAdmin) return NextResponse.next();

  if (await hasAdminSession(req.cookies)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*"],
};
