import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readAdminSession } from "@/lib/admin-auth";
import { readPartnerSession } from "@/lib/partner-auth";
import { getPrintPartner, isPrintPartnerId } from "@/lib/partners";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const partnerParam = url.searchParams.get("partner");
  const cookieStore = await cookies();
  const adminSession = await readAdminSession(cookieStore);

  if (adminSession?.isOwner && isPrintPartnerId(partnerParam)) {
    const partner = getPrintPartner(partnerParam);
    return NextResponse.json({
      session: {
        partnerId: partner.id,
        displayName: partner.name,
        adminPreview: true,
      },
    });
  }

  const session = await readPartnerSession(cookieStore);
  if (!session) {
    return NextResponse.json({ session: null }, { status: 401 });
  }

  if (partnerParam && session.partnerId !== partnerParam) {
    return NextResponse.json({ session: null }, { status: 403 });
  }

  return NextResponse.json({
    session: {
      partnerId: session.partnerId,
      displayName: session.displayName,
      adminPreview: false,
    },
  });
}
