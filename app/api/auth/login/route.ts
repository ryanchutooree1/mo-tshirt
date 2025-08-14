import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { password } = await req.json();

  if (password === process.env.ADMIN_PASSWORD) {
    const res = NextResponse.json({ success: true });
    res.cookies.set('admin_auth', 'true', {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 6, // 6 hours
    });
    return res;
  }

  return NextResponse.json({ success: false }, { status: 401 });
}
