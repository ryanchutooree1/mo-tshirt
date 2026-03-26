import { NextResponse } from "next/server";
import {
  applyAdminSessionCookie,
  createAdminSessionToken,
  getAdminPasswordFromEnv,
} from "@/lib/admin-auth";
import { getOwnerAllowedPages, verifyManagedAdminCredentials } from "@/lib/admin-users";
import { isContentLengthWithinLimit, isRequestOriginAllowed } from "@/lib/request-safety";

const MAX_LOGIN_REQUEST_BYTES = 2_048;
const MAX_PASSWORD_LENGTH = 256;
const MAX_EMAIL_LENGTH = 254;

export async function POST(req: Request) {
  if (!isRequestOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  if (!isContentLengthWithinLimit(req.headers, MAX_LOGIN_REQUEST_BYTES)) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const expected = getAdminPasswordFromEnv();

    if (password.length > MAX_PASSWORD_LENGTH || email.length > MAX_EMAIL_LENGTH) {
      return NextResponse.json({ error: "Invalid password." }, { status: 400 });
    }

    if (!expected) {
      return NextResponse.json(
        { error: "Server is missing ADMIN_PASSWORD env." },
        { status: 500 }
      );
    }

    let sessionToken: string | null = null;

    if (password === expected) {
      sessionToken = await createAdminSessionToken({
        userId: "owner",
        displayName: "Owner",
        email: email || process.env.SMTP_USER || "owner@mo.local",
        allowedPages: getOwnerAllowedPages(),
        isOwner: true,
      });
    } else {
      const managedUser = email
        ? await verifyManagedAdminCredentials(email, password)
        : null;

      if (!managedUser) {
        return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
      }

      sessionToken = await createAdminSessionToken({
        userId: managedUser.email,
        displayName: managedUser.displayName,
        email: managedUser.email,
        allowedPages: managedUser.allowedPages,
        isOwner: false,
      });
    }

    if (!sessionToken) {
      return NextResponse.json(
        { error: "Server is missing ADMIN session secret." },
        { status: 500 }
      );
    }

    const res = NextResponse.json({ ok: true });
    applyAdminSessionCookie(res, sessionToken);
    return res;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
}
