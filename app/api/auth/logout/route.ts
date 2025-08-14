import { NextResponse } from 'next/server';

export async function POST() {
  const res = new NextResponse('ok', { status: 200 });
  res.cookies.set('admin_auth', '', { path: '/', maxAge: 0 });
  return res;
}
