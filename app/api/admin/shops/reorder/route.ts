import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasAdminSession } from "@/lib/admin-auth";
import { shopDocument, shopBatch, serverTimestamp, logShopServerError } from "@/lib/shops-server";

export const runtime = "nodejs";

async function isAdmin() {
  return hasAdminSession(await cookies());
}

type ReorderItem = { id: string; position: number };

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const items: ReorderItem[] = Array.isArray(body?.items)
      ? body.items
      : body?.id && Number.isFinite(body?.position)
        ? [{ id: String(body.id), position: Number(body.position) }]
        : [];

    if (!items.length) {
      return NextResponse.json({ error: "No items provided." }, { status: 400 });
    }

    const batch = shopBatch();
    for (const item of items) {
      if (!item.id || !Number.isFinite(item.position)) {
        return NextResponse.json({ error: "Invalid item payload." }, { status: 400 });
      }
      batch.update(shopDocument(item.id), {
        position: Number(item.position),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    logShopServerError("firestore", error);
    return NextResponse.json({ error: "Failed to reorder items." }, { status: 500 });
  }
}
