import { NextResponse } from "next/server";
import { deleteCbeProject } from "@/lib/cbe-portal-postgres";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    await deleteCbeProject(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not delete project.",
      },
      { status: 500 }
    );
  }
}
