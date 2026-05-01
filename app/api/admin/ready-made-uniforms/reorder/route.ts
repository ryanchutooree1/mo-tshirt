import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { hasAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/firebase";
import { READY_MADE_UNIFORMS_COLLECTION } from "@/lib/ready-made-uniforms-store";

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
    const items: ReorderItem[] = Array.isArray(body?.items) ? body.items : [];

    if (!items.length) {
      return NextResponse.json({ error: "No items provided." }, { status: 400 });
    }

    const batch = writeBatch(db);
    for (const item of items) {
      if (!item.id || !Number.isFinite(item.position)) {
        return NextResponse.json({ error: "Invalid item payload." }, { status: 400 });
      }
      batch.set(
        doc(db, READY_MADE_UNIFORMS_COLLECTION, item.id),
        {
          code: item.id,
          position: Number(item.position),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("ready-made-uniforms:admin:reorder", error);
    return NextResponse.json(
      { error: "Failed to reorder ready-made uniforms." },
      { status: 500 }
    );
  }
}
