import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-request";
import {
  getPrintPartners,
  savePrintPartners,
} from "@/lib/partner-registry";

export async function GET() {
  if (!(await isAdminRequest("/api/admin/partners"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const partners = await getPrintPartners({ includeInactive: true });
    return NextResponse.json({ partners });
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
    const partners = await savePrintPartners(body?.partners);
    return NextResponse.json({ partners });
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
