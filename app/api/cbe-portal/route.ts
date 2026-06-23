import { NextResponse } from "next/server";
import { getCbePortalData } from "@/lib/cbe-portal-postgres";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getCbePortalData());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load CBE portal data.",
      },
      { status: 500 }
    );
  }
}
