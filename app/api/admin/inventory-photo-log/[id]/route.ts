import { NextResponse } from "next/server";
import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isAdminRequest } from "@/lib/admin-request";
import {
  INVENTORY_PHOTO_LOG_COLLECTION,
  mapInventoryPhotoLogItem,
  parseInventoryPhotoUpdate,
} from "@/lib/inventory-photo-log";

function cleanId(value: string) {
  return value.trim().slice(0, 180);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminRequest("/api/admin/inventory-photo-log/item"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = cleanId(rawId);
  if (!id) {
    return NextResponse.json({ error: "Missing photo record id." }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = parseInventoryPhotoUpdate(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const recordRef = doc(db, INVENTORY_PHOTO_LOG_COLLECTION, id);
    const existing = await getDoc(recordRef);
    if (!existing.exists()) {
      return NextResponse.json(
        { error: "Inventory photo record not found." },
        { status: 404 }
      );
    }

    const updatedAtIso = new Date().toISOString();
    const existingData = existing.data() as Record<string, unknown>;
    const completedAtIso =
      parsed.data.isPending
        ? null
        : typeof existingData.completedAtIso === "string" &&
            existingData.completedAtIso
          ? existingData.completedAtIso
          : updatedAtIso;
    const completionFields = parsed.data.isPending
      ? { completedAt: null, completedAtIso: null }
      : typeof existingData.completedAtIso === "string" &&
          existingData.completedAtIso
        ? {}
        : {
            completedAt: serverTimestamp(),
            completedAtIso: updatedAtIso,
          };
    await updateDoc(recordRef, {
      ...parsed.data,
      updatedAt: serverTimestamp(),
      updatedAtIso,
      ...completionFields,
    });

    return NextResponse.json({
      item: mapInventoryPhotoLogItem(id, {
        ...existingData,
        ...parsed.data,
        updatedAtIso,
        completedAtIso,
      }),
    });
  } catch (error) {
    console.error("inventory-photo-log:update", error);
    return NextResponse.json(
      { error: "Failed to update the inventory photo record." },
      { status: 500 }
    );
  }
}
