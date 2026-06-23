import { NextResponse } from "next/server";
import { getAdminRequestSession } from "@/lib/admin-request";
import { deleteCbeInformation } from "@/lib/cbe-portal-postgres";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getAdminRequestSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    await deleteCbeInformation(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not delete information.",
      },
      { status: 500 }
    );
  }
}
