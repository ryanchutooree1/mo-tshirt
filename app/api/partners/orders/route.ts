import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readAdminSession } from "@/lib/admin-auth";
import { readPartnerSession } from "@/lib/partner-auth";
import { listPartnerOrders } from "@/lib/partner-orders";
import { isPrintPartnerId } from "@/lib/partners";

async function canReadPartnerOrders(partnerId: string | null) {
  if (!isPrintPartnerId(partnerId)) return false;

  const cookieStore = await cookies();
  const adminSession = await readAdminSession(cookieStore);
  if (adminSession?.isOwner) return true;

  const partnerSession = await readPartnerSession(cookieStore);
  return partnerSession?.partnerId === partnerId;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const partnerId = url.searchParams.get("partner");

  if (!isPrintPartnerId(partnerId)) {
    return NextResponse.json({ error: "Unknown partner." }, { status: 400 });
  }

  if (!(await canReadPartnerOrders(partnerId))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const orders = await listPartnerOrders(partnerId);
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("partners:orders:list", error);
    return NextResponse.json(
      { error: "Failed to load partner orders." },
      { status: 500 }
    );
  }
}
