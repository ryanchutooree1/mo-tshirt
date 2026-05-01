import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { hasAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/firebase";
import {
  READY_MADE_UNIFORMS_COLLECTION,
  parseReadyMadeUniformPayload,
} from "@/lib/ready-made-uniforms-store";

async function isAdmin() {
  return hasAdminSession(await cookies());
}

function cleanId(value: string) {
  return value.trim();
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = cleanId(rawId);
  if (!id) return NextResponse.json({ error: "Missing item id." }, { status: 400 });

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = parseReadyMadeUniformPayload(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const targetId = parsed.id || id;
    await setDoc(
      doc(db, READY_MADE_UNIFORMS_COLLECTION, targetId),
      {
        ...parsed.data,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    if (targetId !== id) {
      await setDoc(
        doc(db, READY_MADE_UNIFORMS_COLLECTION, id),
        {
          code: id,
          isActive: false,
          position: 0,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    return NextResponse.json({ ok: true, id: targetId });
  } catch (error) {
    console.error("ready-made-uniforms:admin:put", error);
    return NextResponse.json(
      { error: "Failed to update ready-made uniform." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = cleanId(rawId);
  if (!id) return NextResponse.json({ error: "Missing item id." }, { status: 400 });

  try {
    await setDoc(
      doc(db, READY_MADE_UNIFORMS_COLLECTION, id),
      {
        code: id,
        isActive: false,
        position: 0,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("ready-made-uniforms:admin:delete", error);
    return NextResponse.json(
      { error: "Failed to hide ready-made uniform." },
      { status: 500 }
    );
  }
}
