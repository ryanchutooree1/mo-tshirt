import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { hasAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/firebase";
import {
  READY_MADE_UNIFORMS_COLLECTION,
  getReadyMadeUniformItems,
  parseReadyMadeUniformPayload,
} from "@/lib/ready-made-uniforms-store";

async function isAdmin() {
  return hasAdminSession(await cookies());
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const items = await getReadyMadeUniformItems({ includeInactive: true });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("ready-made-uniforms:admin:get", error);
    return NextResponse.json(
      { error: "Failed to load ready-made uniforms." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = parseReadyMadeUniformPayload(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    await setDoc(doc(db, READY_MADE_UNIFORMS_COLLECTION, parsed.id), {
      ...parsed.data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ id: parsed.id });
  } catch (error) {
    console.error("ready-made-uniforms:admin:post", error);
    return NextResponse.json(
      { error: "Failed to save ready-made uniform." },
      { status: 500 }
    );
  }
}
