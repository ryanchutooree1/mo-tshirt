import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { hasAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/firebase";
import { parseShopPayload } from "@/lib/shops-api";

async function isAdmin() {
  return hasAdminSession(await cookies());
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = parseShopPayload(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    await updateDoc(doc(db, "shops", id), {
      ...parsed.data,
      updatedAt: serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("shops:admin:put", error);
    return NextResponse.json({ error: "Failed to update shop item." }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  try {
    await deleteDoc(doc(db, "shops", id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("shops:admin:delete", error);
    return NextResponse.json({ error: "Failed to delete shop item." }, { status: 500 });
  }
}
