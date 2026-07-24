import { NextResponse } from "next/server";
import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAdminRequestSession } from "@/lib/admin-request";
import {
  INVENTORY_PHOTO_LOG_COLLECTION,
  mapInventoryPhotoLogItem,
} from "@/lib/inventory-photo-log";
import {
  MOB_INVENTORY_COLLECTION,
  MOB_INVENTORY_TRANSACTIONS_COLLECTION,
  mapMobInventoryItem,
  mapMobInventoryTransaction,
} from "@/lib/mob-inventory";

export const dynamic = "force-dynamic";

function dayKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Indian/Mauritius",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function GET() {
  const session = await getAdminRequestSession();
  if (!session?.isOwner) {
    return NextResponse.json(
      { error: "Owner access required." },
      { status: 403 }
    );
  }

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    const photoCollection = collection(db, INVENTORY_PHOTO_LOG_COLLECTION);
    const [
      itemSnapshot,
      movementSnapshot,
      pendingCountSnapshot,
      recentPhotoSnapshot,
    ] = await Promise.all([
      getDocs(
        query(
          collection(db, MOB_INVENTORY_COLLECTION),
          orderBy("updatedAtIso", "desc"),
          limit(500)
        )
      ),
      getDocs(
        query(
          collection(db, MOB_INVENTORY_TRANSACTIONS_COLLECTION),
          where("createdAtIso", ">=", thirtyDaysAgo),
          orderBy("createdAtIso", "desc"),
          limit(500)
        )
      ),
      getCountFromServer(query(photoCollection, where("isPending", "==", true))),
      getDocs(
        query(
          photoCollection,
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
    const transactions = movementSnapshot.docs.map((entry) =>
      mapMobInventoryTransaction(
        entry.id,
        entry.data() as Record<string, unknown>
      )
    );
    const readyImports = recentPhotoSnapshot.docs
      .map((entry) =>
        mapInventoryPhotoLogItem(
          entry.id,
          entry.data() as Record<string, unknown>
        )
      )
      .filter((entry) => !entry.isPending && !entry.inventoryImportedAt)
      .length;

    const stockValue = items.reduce(
      (sum, item) => sum + item.quantity * item.sellingPrice,
      0
    );
    const units = items.reduce((sum, item) => sum + item.quantity, 0);
    const lowStockItems = items
      .filter((item) => item.quantity <= item.lowStockThreshold)
      .sort((left, right) => {
        if (left.quantity === 0 && right.quantity !== 0) return -1;
        if (right.quantity === 0 && left.quantity !== 0) return 1;
        return left.quantity - right.quantity;
      })
      .slice(0, 6);

    const categoryMap = new Map<
      string,
      { category: string; products: number; units: number; value: number }
    >();
    items.forEach((item) => {
      const category = item.category || "Other";
      const current = categoryMap.get(category) || {
        category,
        products: 0,
        units: 0,
        value: 0,
      };
      current.products += 1;
      current.units += item.quantity;
      current.value += item.quantity * item.sellingPrice;
      categoryMap.set(category, current);
    });
    const categories = Array.from(categoryMap.values())
      .sort((left, right) => right.value - left.value)
      .slice(0, 6);

    const today = dayKey(now);
    const todayTransactions = transactions.filter(
      (transaction) => dayKey(transaction.createdAt) === today
    );
    const todayStockIn = todayTransactions
      .filter((transaction) => transaction.type === "stock-in")
      .reduce((sum, transaction) => sum + transaction.quantity, 0);
    const todayStockOut = todayTransactions
      .filter((transaction) => transaction.type === "stock-out")
      .reduce((sum, transaction) => sum + transaction.quantity, 0);
    const stockOutValue30d = transactions
      .filter((transaction) => transaction.type === "stock-out")
      .reduce(
        (sum, transaction) =>
          sum + transaction.quantity * transaction.sellingPrice,
        0
      );

    const movement7Days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(
        now.getTime() - (6 - index) * 24 * 60 * 60 * 1000
      );
      const key = dayKey(date);
      const dayTransactions = transactions.filter(
        (transaction) => dayKey(transaction.createdAt) === key
      );
      return {
        key,
        label: new Intl.DateTimeFormat("en-MU", {
          timeZone: "Indian/Mauritius",
          weekday: "short",
        }).format(date),
        stockIn: dayTransactions
          .filter((transaction) => transaction.type === "stock-in")
          .reduce((sum, transaction) => sum + transaction.quantity, 0),
        stockOut: dayTransactions
          .filter((transaction) => transaction.type === "stock-out")
          .reduce((sum, transaction) => sum + transaction.quantity, 0),
      };
    });

    const sellerMap = new Map<
      string,
      { productName: string; quantity: number; value: number }
    >();
    transactions
      .filter((transaction) => transaction.type === "stock-out")
      .forEach((transaction) => {
        const current = sellerMap.get(transaction.inventoryItemId) || {
          productName: transaction.productName,
          quantity: 0,
          value: 0,
        };
        current.quantity += transaction.quantity;
        current.value += transaction.quantity * transaction.sellingPrice;
        sellerMap.set(transaction.inventoryItemId, current);
      });
    const topSellers = Array.from(sellerMap.values())
      .sort((left, right) => right.quantity - left.quantity)
      .slice(0, 5);

    return NextResponse.json(
      {
        summary: {
          products: items.length,
          units,
          stockValue,
          lowStock: items.filter(
            (item) =>
              item.quantity > 0 &&
              item.quantity <= item.lowStockThreshold
          ).length,
          outOfStock: items.filter((item) => item.quantity === 0).length,
          pendingPhotos: pendingCountSnapshot.data().count,
          readyImports,
          todayStockIn,
          todayStockOut,
          stockOutValue30d,
        },
        movement7Days,
        categories,
        lowStockItems,
        topSellers,
        recentTransactions: transactions.slice(0, 8),
        refreshedAt: now.toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("mob-dashboard:get", error);
    return NextResponse.json(
      { error: "Failed to load the owner dashboard." },
      { status: 500 }
    );
  }
}
