import { NextResponse } from "next/server";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAdminRequestSession } from "@/lib/admin-request";
import {
  MOB_INVENTORY_ALIASES_COLLECTION,
  MOB_INVENTORY_COLLECTION,
  MOB_INVENTORY_TRANSACTIONS_COLLECTION,
  applyInventoryTransaction,
  getInventoryMergeKey,
  mapMobInventoryItem,
  parseMobInventoryAdjustment,
  parseMobInventoryItemInput,
} from "@/lib/mob-inventory";

function cleanId(value: string) {
  return value.trim().slice(0, 180);
}

async function getOwnerSession() {
  const session = await getAdminRequestSession();
  return session?.isOwner ? session : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await getOwnerSession())) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = cleanId(rawId);
  if (!id) return NextResponse.json({ error: "Missing item id." }, { status: 400 });

  try {
    const itemRef = doc(db, MOB_INVENTORY_COLLECTION, id);
    const itemSnapshot = await getDoc(itemRef);
    if (!itemSnapshot.exists()) {
      return NextResponse.json({ error: "Stock item not found." }, { status: 404 });
    }
    const existing = mapMobInventoryItem(
      itemSnapshot.id,
      itemSnapshot.data() as Record<string, unknown>
    );
    const body = await req.json().catch(() => ({}));
    const parsed = parseMobInventoryItemInput({
      ...body,
      quantity: existing.quantity,
    });
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const mergeKey = getInventoryMergeKey(parsed.data.productName);
    await updateDoc(itemRef, {
      productName: parsed.data.productName,
      normalizedName: parsed.data.normalizedName,
      category: parsed.data.category,
      sellingPrice: parsed.data.sellingPrice,
      notes: parsed.data.notes,
      lowStockThreshold: parsed.data.lowStockThreshold,
      isArchived: body?.isArchived === true,
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    });
    await setDoc(
      doc(db, MOB_INVENTORY_ALIASES_COLLECTION, mergeKey),
      {
        inventoryItemId: id,
        normalizedName: parsed.data.normalizedName,
        updatedAt: serverTimestamp(),
        updatedAtIso: nowIso,
      },
      { merge: true }
    );

    return NextResponse.json({
      item: {
        ...existing,
        ...parsed.data,
        id,
        isArchived: body?.isArchived === true,
        updatedAt: nowIso,
      },
    });
  } catch (error) {
    console.error("mob-inventory:update", error);
    return NextResponse.json(
      { error: "Failed to update the stock item." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getOwnerSession();
  if (!session) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = cleanId(rawId);
  if (!id) return NextResponse.json({ error: "Missing item id." }, { status: 400 });

  try {
    const parsed = parseMobInventoryAdjustment(
      await req.json().catch(() => ({}))
    );
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const itemRef = doc(db, MOB_INVENTORY_COLLECTION, id);
    const transactionRef = doc(
      db,
      MOB_INVENTORY_TRANSACTIONS_COLLECTION,
      `manual-${crypto.randomUUID()}`
    );
    const nowIso = new Date().toISOString();

    const savedItem = await runTransaction(db, async (transaction) => {
      const itemSnapshot = await transaction.get(itemRef);
      if (!itemSnapshot.exists()) throw new Error("Stock item not found.");
      const existing = mapMobInventoryItem(
        itemSnapshot.id,
        itemSnapshot.data() as Record<string, unknown>
      );
      const balance = applyInventoryTransaction(
        existing.quantity,
        parsed.data.type,
        parsed.data.quantity
      );
      const sellingPrice = parsed.data.sellingPrice ?? existing.sellingPrice;

      transaction.update(itemRef, {
        quantity: balance,
        sellingPrice,
        updatedAt: serverTimestamp(),
        updatedAtIso: nowIso,
        lastTransactionAt: serverTimestamp(),
        lastTransactionAtIso: nowIso,
      });
      transaction.set(transactionRef, {
        inventoryItemId: id,
        productName: existing.productName,
        type: parsed.data.type,
        quantity: parsed.data.quantity,
        balanceAfter: balance,
        sellingPrice,
        source: "manual",
        sourcePhotoLogId: null,
        notes: parsed.data.notes,
        createdAt: serverTimestamp(),
        createdAtIso: nowIso,
        createdByUserId: session.userId,
        createdByName: session.displayName,
      });

      return {
        ...existing,
        quantity: balance,
        sellingPrice,
        updatedAt: nowIso,
        lastTransactionAt: nowIso,
      };
    });

    return NextResponse.json({ item: savedItem });
  } catch (error) {
    console.error("mob-inventory:adjust", error);
    const message =
      error instanceof Error && error.message === "Stock item not found."
        ? error.message
        : "Failed to update stock quantity.";
    return NextResponse.json(
      { error: message },
      { status: message === "Stock item not found." ? 404 : 500 }
    );
  }
}
