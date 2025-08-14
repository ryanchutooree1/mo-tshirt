import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const isLoggedIn = req.cookies.get('admin_auth')?.value === 'true';

  if (!isLoggedIn && req.nextUrl.pathname.startsWith('/admin/owner-dashboard')) {
    return NextResponse.redirect(new URL('/admin/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/owner-dashboard'],
};
