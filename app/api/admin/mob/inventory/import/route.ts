import { NextResponse } from "next/server";
import {
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAdminRequestSession } from "@/lib/admin-request";
import {
  INVENTORY_PHOTO_LOG_COLLECTION,
  getInventoryPhotoPendingState,
} from "@/lib/inventory-photo-log";
import {
  MOB_INVENTORY_ALIASES_COLLECTION,
  MOB_INVENTORY_COLLECTION,
  MOB_INVENTORY_TRANSACTIONS_COLLECTION,
  applyInventoryTransaction,
  getInventoryItemIdForMergeKey,
  getInventoryMergeKey,
  mapMobInventoryItem,
  normalizeInventoryProductName,
} from "@/lib/mob-inventory";

function cleanIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().slice(0, 180))
        .filter(Boolean)
    )
  ).slice(0, 50);
}

export async function POST(req: Request) {
  const session = await getAdminRequestSession();
  if (!session?.isOwner) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const ids = cleanIds((await req.json().catch(() => ({})))?.photoLogIds);
  if (!ids.length) {
    return NextResponse.json(
      { error: "Choose at least one completed photo-log record." },
      { status: 400 }
    );
  }

  try {
    const results: { photoLogId: string; status: string; inventoryItemId?: string }[] = [];

    for (const photoLogId of ids) {
      const result = await runTransaction(db, async (transaction) => {
        const photoRef = doc(db, INVENTORY_PHOTO_LOG_COLLECTION, photoLogId);
        const photoSnapshot = await transaction.get(photoRef);
        if (!photoSnapshot.exists()) {
          return { photoLogId, status: "not-found" };
        }

        const source = photoSnapshot.data() as Record<string, unknown>;
        if (source.inventoryImportedAtIso) {
          return {
            photoLogId,
            status: "already-imported",
            inventoryItemId: String(source.inventoryItemId || ""),
          };
        }
        if (getInventoryPhotoPendingState(source)) {
          return { photoLogId, status: "pending" };
        }

        const productName = String(source.productName || "").trim();
        const mergeKey = getInventoryMergeKey(productName);
        const aliasRef = doc(db, MOB_INVENTORY_ALIASES_COLLECTION, mergeKey);
        const aliasSnapshot = await transaction.get(aliasRef);
        const inventoryItemId =
          typeof aliasSnapshot.data()?.inventoryItemId === "string"
            ? String(aliasSnapshot.data()?.inventoryItemId)
            : getInventoryItemIdForMergeKey(mergeKey);
        const itemRef = doc(db, MOB_INVENTORY_COLLECTION, inventoryItemId);
        const historyRef = doc(
          db,
          MOB_INVENTORY_TRANSACTIONS_COLLECTION,
          `photo-${photoLogId}`
        );
        const [itemSnapshot, historySnapshot] = await Promise.all([
          transaction.get(itemRef),
          transaction.get(historyRef),
        ]);
        if (historySnapshot.exists()) {
          return { photoLogId, status: "already-imported", inventoryItemId };
        }

        const existing = itemSnapshot.exists()
          ? mapMobInventoryItem(
              itemSnapshot.id,
              itemSnapshot.data() as Record<string, unknown>
            )
          : null;
        const type = source.transactionType === "stock-out" ? "stock-out" : "stock-in";
        const quantity = Number(source.quantity);
        const sourceQuantity = Number.isFinite(quantity)
          ? Math.max(0, Math.floor(quantity))
          : 0;
        const balance = applyInventoryTransaction(
          existing?.quantity || 0,
          type,
          sourceQuantity
        );
        const sourcePrice = Number(source.sellingPrice);
        const sellingPrice = Number.isFinite(sourcePrice)
          ? Math.max(0, sourcePrice)
          : existing?.sellingPrice || 0;
        const nowIso = new Date().toISOString();
        const category =
          String(source.category || "").trim() || existing?.category || "";

        transaction.set(
          itemRef,
          {
            productName: existing?.productName || productName,
            normalizedName: normalizeInventoryProductName(
              existing?.productName || productName
            ),
            category,
            quantity: balance,
            sellingPrice,
            notes: existing?.notes || "",
            lowStockThreshold: existing?.lowStockThreshold ?? 5,
            isArchived: false,
            ...(existing ? {} : { createdAt: serverTimestamp() }),
            createdAtIso: existing?.createdAt || nowIso,
            updatedAt: serverTimestamp(),
            updatedAtIso: nowIso,
            lastTransactionAt: serverTimestamp(),
            lastTransactionAtIso: nowIso,
          },
          { merge: true }
        );
        transaction.set(
          aliasRef,
          {
            inventoryItemId,
            normalizedName: normalizeInventoryProductName(productName),
            updatedAt: serverTimestamp(),
            updatedAtIso: nowIso,
          },
          { merge: true }
        );
        transaction.set(historyRef, {
          inventoryItemId,
          productName,
          type,
          quantity: sourceQuantity,
          balanceAfter: balance,
          sellingPrice,
          source: "photo-log",
          sourcePhotoLogId: photoLogId,
          notes: String(source.notes || "").trim().slice(0, 1000),
          createdAt: serverTimestamp(),
          createdAtIso: nowIso,
          createdByUserId: session.userId,
          createdByName: session.displayName,
        });
        transaction.update(photoRef, {
          inventoryItemId,
          inventoryImportedAt: serverTimestamp(),
          inventoryImportedAtIso: nowIso,
          inventoryImportedByUserId: session.userId,
        });

        return { photoLogId, status: "imported", inventoryItemId };
      });
      results.push(result);
    }

    const imported = results.filter((result) => result.status === "imported").length;
    return NextResponse.json({ imported, results });
  } catch (error) {
    console.error("mob-inventory:import", error);
    return NextResponse.json(
      { error: "Failed to import completed photo-log records." },
      { status: 500 }
    );
  }
}
