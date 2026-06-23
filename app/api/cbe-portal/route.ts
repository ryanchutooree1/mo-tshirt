import { NextResponse } from "next/server";
import { getAdminRequestSession } from "@/lib/admin-request";
import { getCbePortalData } from "@/lib/cbe-portal-postgres";

export const runtime = "nodejs";

export async function GET() {
  if (!(await getAdminRequestSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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
