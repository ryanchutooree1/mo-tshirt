import { NextResponse } from "next/server";
import {
  collection,
  documentId,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAdminRequestSession } from "@/lib/admin-request";
import {
  MOB_INVENTORY_TRANSACTIONS_COLLECTION,
  mapMobInventoryTransaction,
} from "@/lib/mob-inventory";
import {
  decodeTimelineCursor,
  encodeTimelineCursor,
  parsePageSize,
} from "@/lib/server-pagination";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getAdminRequestSession();
  if (!session?.isOwner) {
    return NextResponse.json(
      { error: "Owner access required." },
      { status: 403 }
    );
  }

  try {
    const url = new URL(req.url);
    const pageSize = parsePageSize(url.searchParams.get("limit"), 20, 50);
    const cursor = decodeTimelineCursor(url.searchParams.get("cursor"));
    const collectionRef = collection(
      db,
      MOB_INVENTORY_TRANSACTIONS_COLLECTION
    );
    const constraints: QueryConstraint[] = [
      orderBy("createdAtIso", "desc"),
      orderBy(documentId(), "desc"),
    ];
    if (cursor) {
      constraints.push(startAfter(cursor.timestamp, cursor.id));
    }
    constraints.push(limit(pageSize + 1));

    const [snapshot, countSnapshot] = await Promise.all([
      getDocs(query(collectionRef, ...constraints)),
      getCountFromServer(collectionRef),
    ]);
    const hasMore = snapshot.docs.length > pageSize;
    const pageDocs = snapshot.docs.slice(0, pageSize);
    const transactions = pageDocs.map((entry) =>
      mapMobInventoryTransaction(
        entry.id,
        entry.data() as Record<string, unknown>
      )
    );
    const lastEntry = pageDocs.at(-1);
    const lastTimestamp =
      typeof lastEntry?.data()?.createdAtIso === "string"
        ? String(lastEntry.data()?.createdAtIso)
        : "";
    const nextCursor =
      hasMore && lastEntry && lastTimestamp
        ? encodeTimelineCursor({
            timestamp: lastTimestamp,
            id: lastEntry.id,
          })
        : null;

    return NextResponse.json(
      {
        transactions,
        total: countSnapshot.data().count,
        pageSize,
        hasMore,
        nextCursor,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("mob-inventory:history", error);
    return NextResponse.json(
      { error: "Failed to load inventory history." },
      { status: 500 }
    );
  }
}
