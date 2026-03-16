import { NextResponse } from "next/server";
import {
  applyAdminSessionCookie,
  createAdminSessionToken,
  getAdminPasswordFromEnv,
} from "@/lib/admin-auth";
import { isContentLengthWithinLimit, isRequestOriginAllowed } from "@/lib/request-safety";

const MAX_LOGIN_REQUEST_BYTES = 2_048;
const MAX_PASSWORD_LENGTH = 256;

export async function POST(req: Request) {
  if (!isRequestOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  if (!isContentLengthWithinLimit(req.headers, MAX_LOGIN_REQUEST_BYTES)) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const password = String(body?.password ?? "");
    const expected = getAdminPasswordFromEnv();

    if (password.length > MAX_PASSWORD_LENGTH) {
      return NextResponse.json({ error: "Invalid password." }, { status: 400 });
    }

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
