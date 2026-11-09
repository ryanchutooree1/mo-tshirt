import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasAdminSession } from "@/lib/admin-auth";
import { shopDocument, serverTimestamp } from "@/lib/shops-server";
import { parseShopPayload } from "@/lib/shops-api";

export const runtime = "nodejs";

async function isAdmin() {
  return hasAdminSession(await cookies());
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = parseShopPayload(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    await shopDocument(id).update({
      ...parsed.data,
      updatedAt: serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  } catch {
    console.error("shops:admin:put");
    return NextResponse.json({ error: "Failed to update shop item." }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  try {
    await shopDocument(id).delete();
    return NextResponse.json({ ok: true });
  } catch {
    console.error("shops:admin:delete");
    return NextResponse.json({ error: "Failed to delete shop item." }, { status: 500 });
  }
}
