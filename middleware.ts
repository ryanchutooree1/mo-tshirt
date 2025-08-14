import { NextResponse, NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const protectedPaths = ['/admin', '/progress'];
  const isProtected = protectedPaths.some((p) => req.nextUrl.pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const authed = req.cookies.get('mo_auth')?.value === '1';
  if (authed) return NextResponse.next();

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*', '/progress/:path*'],
};