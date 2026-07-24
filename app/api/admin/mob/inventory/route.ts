import { NextResponse } from "next/server";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAdminRequestSession } from "@/lib/admin-request";
import {
  INVENTORY_PHOTO_LOG_COLLECTION,
  mapInventoryPhotoLogItem,
} from "@/lib/inventory-photo-log";
import {
  MOB_INVENTORY_ALIASES_COLLECTION,
  MOB_INVENTORY_COLLECTION,
  MOB_INVENTORY_TRANSACTIONS_COLLECTION,
  applyInventoryTransaction,
  getInventoryItemIdForMergeKey,
  getInventoryMergeKey,
  mapMobInventoryItem,
  mapMobInventoryTransaction,
  parseMobInventoryItemInput,
} from "@/lib/mob-inventory";

export const dynamic = "force-dynamic";

async function getOwnerSession() {
  const session = await getAdminRequestSession();
  return session?.isOwner ? session : null;
}

export async function GET() {
  if (!(await getOwnerSession())) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  try {
    const [itemSnapshot, transactionSnapshot, photoSnapshot] =
      await Promise.all([
        getDocs(
          query(
            collection(db, MOB_INVENTORY_COLLECTION),
            orderBy("updatedAtIso", "desc"),
            limit(250)
          )
        ),
        getDocs(
          query(
            collection(db, MOB_INVENTORY_TRANSACTIONS_COLLECTION),
            orderBy("createdAtIso", "desc"),
            limit(100)
          )
        ),
        getDocs(
          query(
            collection(db, INVENTORY_PHOTO_LOG_COLLECTION),
            orderBy("uploadedAtIso", "desc"),
            limit(250)
          )
        ),
      ]);

    const items = itemSnapshot.docs
      .map((entry) =>
        mapMobInventoryItem(
          entry.id,
          entry.data() as Record<string, unknown>
        )
      )
      .filter((item) => !item.isArchived);
    const transactions = transactionSnapshot.docs.map((entry) =>
      mapMobInventoryTransaction(
        entry.id,
        entry.data() as Record<string, unknown>
      )
    );
    const readyPhotoLogs = photoSnapshot.docs
      .map((entry) =>
        mapInventoryPhotoLogItem(
          entry.id,
          entry.data() as Record<string, unknown>
        )
      )
      .filter((entry) => !entry.isPending && !entry.inventoryImportedAt);

    return NextResponse.json(
      { items, transactions, readyPhotoLogs },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("mob-inventory:get", error);
    return NextResponse.json(
      { error: "Failed to load mobile inventory." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await getOwnerSession();
  if (!session) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  try {
    const parsed = parseMobInventoryItemInput(
      await req.json().catch(() => ({}))
    );
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const mergeKey = getInventoryMergeKey(parsed.data.productName);
    const aliasRef = doc(db, MOB_INVENTORY_ALIASES_COLLECTION, mergeKey);
    const defaultItemId = getInventoryItemIdForMergeKey(mergeKey);
    const transactionRef = doc(
      db,
      MOB_INVENTORY_TRANSACTIONS_COLLECTION,
      `manual-${crypto.randomUUID()}`
    );

    const savedItem = await runTransaction(db, async (transaction) => {
      const aliasSnapshot = await transaction.get(aliasRef);
      const aliasedItemId =
        typeof aliasSnapshot.data()?.inventoryItemId === "string"
          ? String(aliasSnapshot.data()?.inventoryItemId)
          : defaultItemId;
      const itemRef = doc(db, MOB_INVENTORY_COLLECTION, aliasedItemId);
      const itemSnapshot = await transaction.get(itemRef);
      const existing = itemSnapshot.exists()
        ? mapMobInventoryItem(
            itemSnapshot.id,
            itemSnapshot.data() as Record<string, unknown>
          )
        : null;
      const balance = applyInventoryTransaction(
        existing?.quantity || 0,
        "stock-in",
        parsed.data.quantity
      );
      const itemData = {
        productName: parsed.data.productName,
        normalizedName: parsed.data.normalizedName,
        category: parsed.data.category || existing?.category || "",
        quantity: balance,
        sellingPrice: parsed.data.sellingPrice,
        notes: parsed.data.notes || existing?.notes || "",
        lowStockThreshold: parsed.data.lowStockThreshold,
        isArchived: false,
        ...(existing ? {} : { createdAt: serverTimestamp() }),
        createdAtIso: existing?.createdAt || nowIso,
        updatedAt: serverTimestamp(),
        updatedAtIso: nowIso,
        lastTransactionAt: serverTimestamp(),
        lastTransactionAtIso: nowIso,
      };

      transaction.set(itemRef, itemData, { merge: true });
      transaction.set(
        aliasRef,
        {
          inventoryItemId: aliasedItemId,
          normalizedName: parsed.data.normalizedName,
          updatedAt: serverTimestamp(),
          updatedAtIso: nowIso,
        },
        { merge: true }
      );
      if (parsed.data.quantity > 0) {
        transaction.set(transactionRef, {
          inventoryItemId: aliasedItemId,
          productName: parsed.data.productName,
          type: "stock-in",
          quantity: parsed.data.quantity,
          balanceAfter: balance,
          sellingPrice: parsed.data.sellingPrice,
          source: "manual",
          sourcePhotoLogId: null,
          notes: "Opening stock",
          createdAt: serverTimestamp(),
          createdAtIso: nowIso,
          createdByUserId: session.userId,
          createdByName: session.displayName,
        });
      }

      return mapMobInventoryItem(aliasedItemId, {
        ...itemData,
        createdAtIso: existing?.createdAt || nowIso,
        updatedAtIso: nowIso,
        lastTransactionAtIso: nowIso,
      });
    });

    return NextResponse.json({ item: savedItem }, { status: 201 });
  } catch (error) {
    console.error("mob-inventory:create", error);
    return NextResponse.json(
      { error: "Failed to create inventory stock." },
      { status: 500 }
    );
  }
}
