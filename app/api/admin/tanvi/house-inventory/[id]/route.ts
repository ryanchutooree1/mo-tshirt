import { NextResponse } from "next/server";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isAdminRequest } from "@/lib/admin-request";
import {
  TANVI_HOUSE_INVENTORY_COLLECTION,
  mapTanviHouseInventoryItem,
  parseHouseInventoryPatch,
} from "@/lib/tanvi-house-inventory";

export const dynamic = "force-dynamic";

const API_PATH = "/api/admin/tanvi/house-inventory";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function validDocumentId(value: string) {
  return Boolean(value && value.length <= 180 && !value.includes("/"));
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await isAdminRequest(API_PATH))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await context.params;
  if (!validDocumentId(id)) {
    return NextResponse.json({ error: "Invalid inventory item." }, { status: 400 });
  }

  try {
    const parsed = parseHouseInventoryPatch(
      await request.json().catch(() => ({}))
    );
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const itemRef = doc(db, TANVI_HOUSE_INVENTORY_COLLECTION, id);
    const existingSnapshot = await getDoc(itemRef);
    if (!existingSnapshot.exists()) {
      return NextResponse.json({ error: "Inventory item not found." }, { status: 404 });
    }

    const nextData = { ...parsed.data };
    if (nextData.needNow === false) {
      nextData.purchased = false;
    } else if (nextData.purchased === true) {
      nextData.needNow = true;
    } else if (nextData.needNow === true) {
      nextData.purchased = false;
    }

    const nowIso = new Date().toISOString();
    await updateDoc(itemRef, {
      ...nextData,
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    });

    return NextResponse.json({
      item: mapTanviHouseInventoryItem(id, {
        ...existingSnapshot.data(),
        ...nextData,
        updatedAtIso: nowIso,
      }),
    });
  } catch (error) {
    console.error("tanvi-house-inventory:update", error);
    return NextResponse.json(
      { error: "Could not update the inventory item." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!(await isAdminRequest(API_PATH))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await context.params;
  if (!validDocumentId(id)) {
    return NextResponse.json({ error: "Invalid inventory item." }, { status: 400 });
  }

  try {
    await deleteDoc(doc(db, TANVI_HOUSE_INVENTORY_COLLECTION, id));
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("tanvi-house-inventory:delete", error);
    return NextResponse.json(
      { error: "Could not delete the inventory item." },
      { status: 500 }
    );
  }
}
