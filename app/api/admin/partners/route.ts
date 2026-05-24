import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-request";
import {
  getPrintPartnerRegistry,
  getProductionManager,
  savePrintPartners,
} from "@/lib/partner-registry";

export async function GET() {
  if (!(await isAdminRequest("/api/admin/partners"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const registry = await getPrintPartnerRegistry({ includeInactive: true });
    return NextResponse.json(registry);
  } catch (error) {
    console.error("partners:get", error);
    return NextResponse.json(
      { error: "Failed to load partners." },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  if (!(await isAdminRequest("/api/admin/partners"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const partners = await savePrintPartners(body?.partners, body?.manager);
    const manager = await getProductionManager();
    return NextResponse.json({
      partners,
      manager,
    });
  } catch (error) {
    console.error("partners:put", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save partners.",
      },
      { status: 400 }
    );
  }
}
