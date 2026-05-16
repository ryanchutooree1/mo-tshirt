import { NextResponse } from "next/server";
import {
  applyPartnerSessionCookie,
  clearPartnerSessionCookie,
  createPartnerSessionToken,
  verifyPartnerPassword,
} from "@/lib/partner-auth";
import { getPrintPartner, isPrintPartnerId } from "@/lib/partners";
import {
  isContentLengthWithinLimit,
  isRequestOriginAllowed,
} from "@/lib/request-safety";

const MAX_LOGIN_REQUEST_BYTES = 1_024;
const MAX_PASSWORD_LENGTH = 128;

export async function POST(req: Request) {
  if (!isRequestOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  if (!isContentLengthWithinLimit(req.headers, MAX_LOGIN_REQUEST_BYTES)) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const body = await req.json().catch(() => ({}));
  const partnerId = body?.partnerId;
  const password = String(body?.password ?? "");

  if (!isPrintPartnerId(partnerId)) {
    return NextResponse.json({ error: "Unknown partner." }, { status: 400 });
  }

  if (!password || password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ error: "Invalid password." }, { status: 400 });
  }

  if (!(await verifyPartnerPassword(partnerId, password))) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const token = await createPartnerSessionToken(partnerId);
  const partner = getPrintPartner(partnerId);
  const response = NextResponse.json({
    ok: true,
    session: {
      partnerId,
      displayName: partner.name,
    },
  });
  applyPartnerSessionCookie(response, token);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearPartnerSessionCookie(response);
  return response;
}
