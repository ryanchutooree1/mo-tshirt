import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { hasAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/firebase";

const MAX_URL_LENGTH = 4_096;

function cleanImageUrl(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (cleaned.length > MAX_URL_LENGTH) return undefined;
  if (!cleaned.startsWith("/") && !/^https?:\/\//i.test(cleaned)) return undefined;
  return cleaned;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await hasAdminSession(await cookies()))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const studioPhotoUrl = cleanImageUrl(body.studioPhotoUrl);
  const studioBackPhotoUrl = cleanImageUrl(body.studioBackPhotoUrl);
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (Object.prototype.hasOwnProperty.call(body, "studioPhotoUrl")) {
    if (studioPhotoUrl === undefined) {
      return NextResponse.json({ error: "Invalid front studio image URL." }, { status: 400 });
    }
    patch.studioPhotoUrl = studioPhotoUrl;
  }
  if (Object.prototype.hasOwnProperty.call(body, "studioBackPhotoUrl")) {
    if (studioBackPhotoUrl === undefined) {
      return NextResponse.json({ error: "Invalid back studio image URL." }, { status: 400 });
    }
    patch.studioBackPhotoUrl = studioBackPhotoUrl;
  }

  if (!("studioPhotoUrl" in patch) && !("studioBackPhotoUrl" in patch)) {
    return NextResponse.json({ error: "Add at least one studio image URL." }, { status: 400 });
  }

  try {
    await updateDoc(doc(db, "shops", id), patch);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("shops:admin:studio-images", error);
    return NextResponse.json({ error: "Failed to save studio images." }, { status: 500 });
  }
}
