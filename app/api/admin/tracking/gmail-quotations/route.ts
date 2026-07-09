import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-request";
import { getGmailQuotationStats } from "@/lib/gmail-quotations";

export const dynamic = "force-dynamic";

function parseDateParam(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest("/api/admin/tracking/gmail-quotations"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setDate(defaultStart.getDate() - 29);
  defaultStart.setHours(0, 0, 0, 0);

  const start = parseDateParam(request.nextUrl.searchParams.get("start"), defaultStart);
  const end = parseDateParam(request.nextUrl.searchParams.get("end"), now);

  if (start > end) {
    return NextResponse.json({ error: "Start date must be before end date." }, { status: 400 });
  }

  try {
    const stats = await getGmailQuotationStats(start, end);
    return NextResponse.json(stats, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Gmail quotation stats." },
      { status: 500 }
    );
  }
}
