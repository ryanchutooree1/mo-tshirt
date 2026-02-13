import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

function isAdmin() {
  return cookies().get("admin-auth")?.value === "1";
}

function getExpectedPassword() {
  return process.env.ADMIN_PASSWORD || process.env.NEXT_ADMIN_PASSWORD || "";
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  const expected = getExpectedPassword();
  if (!expected) {
    return NextResponse.json({ error: "Server is missing ADMIN_PASSWORD env." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const password = String(body?.password ?? "");
  if (!password) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  if (password !== expected) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  try {
    await deleteDoc(doc(db, "quotes", id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("quotes:admin:delete", error);
    return NextResponse.json({ error: "Failed to delete quote." }, { status: 500 });
  }
}
