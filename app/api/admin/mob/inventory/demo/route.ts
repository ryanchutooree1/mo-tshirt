import { NextResponse } from "next/server";
import {
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAdminRequestSession } from "@/lib/admin-request";
import {
  MOB_INVENTORY_ALIASES_COLLECTION,
  MOB_INVENTORY_COLLECTION,
  MOB_INVENTORY_TRANSACTIONS_COLLECTION,
} from "@/lib/mob-inventory";
import { buildDemoMobileShopInventory } from "@/lib/mob-inventory-demo";

export async function POST() {
  const session = await getAdminRequestSession();
  if (!session?.isOwner) {
    return NextResponse.json(
      { error: "Owner access required." },
      { status: 403 }
    );
  }

  try {
    const demo = buildDemoMobileShopInventory();
    const batch = writeBatch(db);

    demo.items.forEach((item) => {
      batch.set(
        doc(db, MOB_INVENTORY_COLLECTION, item.id),
        {
          ...item,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastTransactionAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    demo.aliases.forEach((alias) => {
      batch.set(
        doc(db, MOB_INVENTORY_ALIASES_COLLECTION, alias.id),
        {
          ...alias,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    demo.transactions.forEach((transaction) => {
      batch.set(
        doc(
          db,
          MOB_INVENTORY_TRANSACTIONS_COLLECTION,
          transaction.id
        ),
        {
          ...transaction,
          createdAtIso: transaction.createdAt,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();

    return NextResponse.json({
      ok: true,
      items: demo.items.length,
      transactions: demo.transactions.length,
    });
  } catch (error) {
    console.error("mob-inventory:demo", error);
    return NextResponse.json(
      { error: "Failed to create the test inventory." },
      { status: 500 }
    );
  }
}
