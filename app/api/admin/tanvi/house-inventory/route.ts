import { NextResponse } from "next/server";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isAdminRequest } from "@/lib/admin-request";
import {
  TANVI_HOUSE_INVENTORY_COLLECTION,
  mapTanviHouseInventoryItem,
  parseHouseInventoryCreate,
} from "@/lib/tanvi-house-inventory";

export const dynamic = "force-dynamic";

const API_PATH = "/api/admin/tanvi/house-inventory";

export async function GET() {
  if (!(await isAdminRequest(API_PATH))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const snapshot = await getDocs(
      query(
        collection(db, TANVI_HOUSE_INVENTORY_COLLECTION),
        orderBy("updatedAtIso", "desc"),
        limit(300)
      )
    );
    const items = snapshot.docs.map((entry) =>
      mapTanviHouseInventoryItem(
        entry.id,
        entry.data() as Record<string, unknown>
      )
    );
    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("tanvi-house-inventory:get", error);
    return NextResponse.json(
      { error: "Could not load the house inventory." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAdminRequest(API_PATH))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const parsed = parseHouseInventoryCreate(
      await request.json().catch(() => ({}))
    );
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const itemRef = doc(collection(db, TANVI_HOUSE_INVENTORY_COLLECTION));
    const itemData = {
      ...parsed.data,
      needNow: false,
      purchased: false,
      createdAt: serverTimestamp(),
      createdAtIso: nowIso,
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    };
    await setDoc(itemRef, itemData);

    return NextResponse.json(
      {
        item: mapTanviHouseInventoryItem(itemRef.id, itemData),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("tanvi-house-inventory:create", error);
    return NextResponse.json(
      { error: "Could not add the inventory item." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminRequest(API_PATH))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
    };
    if (body.action !== "put-away-purchased") {
      return NextResponse.json({ error: "Unknown inventory action." }, { status: 400 });
    }

    const snapshot = await getDocs(
      query(collection(db, TANVI_HOUSE_INVENTORY_COLLECTION), limit(300))
    );
    const purchasedEntries = snapshot.docs.filter((entry) =>
      Boolean(entry.data().purchased)
    );

    if (purchasedEntries.length) {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();
      purchasedEntries.forEach((entry) => {
        batch.update(entry.ref, {
          stockLevel: "high",
          needNow: false,
          purchased: false,
          updatedAt: serverTimestamp(),
          updatedAtIso: nowIso,
        });
      });
      await batch.commit();
    }

    return NextResponse.json({ updated: purchasedEntries.length });
  } catch (error) {
    console.error("tanvi-house-inventory:put-away", error);
    return NextResponse.json(
      { error: "Could not put away the bought items." },
      { status: 500 }
    );
  }
}
