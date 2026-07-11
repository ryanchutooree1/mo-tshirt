import { NextResponse } from "next/server";
import {
  applyAdminSessionCookie,
  clearAdminSessionCookie,
  createAdminSessionToken,
  getAdminPasswordFromEnv,
} from "@/lib/admin-auth";
import { getOwnerAllowedPages, verifyManagedAdminCredentials } from "@/lib/admin-users";
import {
  applyPartnerSessionCookie,
  clearPartnerSessionCookie,
  createPartnerSessionToken,
} from "@/lib/partner-auth";
import {
  getPartnerByPassword,
  getProductionManager,
} from "@/lib/partner-registry";
import {
  PRODUCTION_MANAGER_ALLOWED_PAGES,
  PRODUCTION_MANAGER_PATH,
  verifyProductionManagerPassword,
} from "@/lib/production-manager-auth";
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
    const identifier = String(body?.email ?? "").trim().toLowerCase();
    const email = identifier;
    const password = String(body?.password ?? "");
    const expected = getAdminPasswordFromEnv();

    if (password.length > MAX_PASSWORD_LENGTH || email.length > MAX_EMAIL_LENGTH) {
      return NextResponse.json({ error: "Invalid password." }, { status: 400 });
    }

    if (verifyProductionManagerPassword(password)) {
      const manager = await getProductionManager();
      const sessionToken = await createAdminSessionToken({
        userId: "production-manager",
        displayName: manager.name || "Tanvi",
        email: email || manager.email || "tanvi@mo.local",
        allowedPages: PRODUCTION_MANAGER_ALLOWED_PAGES,
        isOwner: false,
      });

      if (!sessionToken) {
        return NextResponse.json(
          { error: "Server is missing ADMIN session secret." },
          { status: 500 }
        );
      }

      const res = NextResponse.json({
        ok: true,
        manager: {
          displayName: manager.name || "Tanvi",
          path: PRODUCTION_MANAGER_PATH,
        },
      });
      applyAdminSessionCookie(res, sessionToken);
      clearPartnerSessionCookie(res);
      return res;
    }

    const partner = await getPartnerByPassword(password);
    if (partner) {
      const token = await createPartnerSessionToken(partner.id);
      const res = NextResponse.json({
        ok: true,
        partner: {
          partnerId: partner.id,
          displayName: partner.name,
          path: partner.path,
        },
      });
      applyPartnerSessionCookie(res, token);
      clearAdminSessionCookie(res);
      return res;
    }

    if (!expected) {
      return NextResponse.json(
        { error: "Server is missing ADMIN_PASSWORD env." },
        { status: 500 }
      );
    }

    let sessionToken: string | null = null;
    let firebaseEmail = identifier.includes("@") ? identifier : "";

    if (password === expected) {
      firebaseEmail =
        process.env.NEXT_PUBLIC_FIREBASE_ADMIN_EMAIL?.trim().toLowerCase() ||
        "motshirtmauritius@gmail.com";
      sessionToken = await createAdminSessionToken({
        userId: "owner",
        displayName: "Ryan Chutooree",
        email: email || process.env.SMTP_USER || "owner@mo.local",
        allowedPages: getOwnerAllowedPages(),
        isOwner: true,
      });
    } else {
      const managedUser = identifier
        ? await verifyManagedAdminCredentials(identifier, password)
        : null;

      if (!managedUser) {
        return NextResponse.json({ error: "Invalid username, email, or password." }, { status: 401 });
      }
      firebaseEmail = managedUser.email;

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

    const res = NextResponse.json({ ok: true, email: firebaseEmail || undefined });
    applyAdminSessionCookie(res, sessionToken);
    clearPartnerSessionCookie(res);
    return res;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
}
