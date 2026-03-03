import { NextResponse } from "next/server";
import {
  applyAdminSessionCookie,
  createAdminSessionToken,
  getAdminPasswordFromEnv,
} from "@/lib/admin-auth";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const password = String(body?.password ?? "");
    const expected = getAdminPasswordFromEnv();

    if (!expected) {
      return NextResponse.json(
        { error: "Server is missing ADMIN_PASSWORD env." },
        { status: 500 }
      );
    }

    if (password !== expected) {
      return NextResponse.json({ error: "Invalid password." }, { status: 401 });
    }

    const token = await createAdminSessionToken();
    if (!token) {
      return NextResponse.json(
        { error: "Server is missing ADMIN session secret." },
        { status: 500 }
      );
    }

    const res = NextResponse.json({ ok: true });
    applyAdminSessionCookie(res, token);
    return res;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
}
