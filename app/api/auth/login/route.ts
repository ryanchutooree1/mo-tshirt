import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { password } = await req.json();
  const ok = typeof password === 'string' && password === process.env.ADMIN_PASSWORD;
  if (!ok) return new NextResponse('Invalid password', { status: 401 });

  const res = new NextResponse('ok', { status: 200 });
  // HttpOnly cookie; 12h expiry
  res.cookies.set('mo_auth', '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  return res;
}