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
  STARTER_GROCERY_ITEMS,
  mapTanviHouseInventoryItem,
  parseHouseInventoryCreate,
  shoppingCompatibilityFields,
} from "@/lib/tanvi-house-inventory";

export const dynamic = "force-dynamic";

const API_PATH = "/api/admin/tanvi/house-inventory";
const STARTER_MARKER_ID = "__seed-tanvi-grocery-budget-v1";

export async function GET() {
  if (!(await isAdminRequest(API_PATH))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const snapshot = await getDocs(
      query(
        collection(db, TANVI_HOUSE_INVENTORY_COLLECTION),
        orderBy("updatedAtIso", "desc"),
        limit(1000)
      )
    );
    const starterAlreadyLoaded = snapshot.docs.some(
      (entry) => entry.id === STARTER_MARKER_ID
    );
    const items = snapshot.docs
      .filter((entry) => entry.id !== STARTER_MARKER_ID)
      .map((entry) =>
      mapTanviHouseInventoryItem(
        entry.id,
        entry.data() as Record<string, unknown>
      )
      );

    const existingNames = new Set(
      items.map((item) => item.name.trim().toLocaleLowerCase("en"))
    );
    const missingStarterItems = starterAlreadyLoaded
      ? []
      : STARTER_GROCERY_ITEMS.filter(
          (item) => !existingNames.has(item.name.toLocaleLowerCase("en"))
        );

    if (!starterAlreadyLoaded) {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();
      missingStarterItems.forEach((starter) => {
        const itemData = {
          name: starter.name,
          category: starter.category,
          stockQuantity: "",
          stockLevel: "unknown" as const,
          ...shoppingCompatibilityFields("later"),
          buyQuantity: starter.buyQuantity,
          budgetMin: starter.budgetMin,
          budgetMax: starter.budgetMax,
          seedSource: "tanvi-grocery-budget-v1",
          createdAt: serverTimestamp(),
          createdAtIso: nowIso,
          updatedAt: serverTimestamp(),
          updatedAtIso: nowIso,
        };
        batch.set(
          doc(db, TANVI_HOUSE_INVENTORY_COLLECTION, `starter-${starter.key}`),
          itemData,
          { merge: true }
        );
        items.push(
          mapTanviHouseInventoryItem(`starter-${starter.key}`, itemData)
        );
      });
      batch.set(doc(db, TANVI_HOUSE_INVENTORY_COLLECTION, STARTER_MARKER_ID), {
        recordType: "seed-marker",
        seedSource: "tanvi-grocery-budget-v1",
        createdAt: serverTimestamp(),
        createdAtIso: nowIso,
        updatedAt: serverTimestamp(),
        updatedAtIso: nowIso,
      });
      await batch.commit();
    }

    return NextResponse.json(
      { items: items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) },
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
      ...shoppingCompatibilityFields(parsed.data.shoppingStatus),
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
      query(collection(db, TANVI_HOUSE_INVENTORY_COLLECTION), limit(1000))
    );
    const purchasedEntries = snapshot.docs.filter(
      (entry) => mapTanviHouseInventoryItem(entry.id, entry.data()).shoppingStatus === "bought"
    );

    if (purchasedEntries.length) {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();
      purchasedEntries.forEach((entry) => {
        const item = mapTanviHouseInventoryItem(entry.id, entry.data());
        batch.update(entry.ref, {
          stockLevel: "high",
          stockQuantity: item.buyQuantity || item.stockQuantity,
          ...shoppingCompatibilityFields("none"),
          lastBoughtAtIso: nowIso,
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
