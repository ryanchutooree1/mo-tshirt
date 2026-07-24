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
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isAdminRequest } from "@/lib/admin-request";
import {
  INVENTORY_PHOTO_LOG_COLLECTION,
  mapInventoryPhotoLogItem,
} from "@/lib/inventory-photo-log";
import {
  decodeTimelineCursor,
  encodeTimelineCursor,
  parsePageSize,
} from "@/lib/server-pagination";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdminRequest("/api/admin/inventory-photo-log"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") === "history"
      ? "history"
      : "pending";
    const pageSize = parsePageSize(url.searchParams.get("limit"), 20, 40);
    const cursor = decodeTimelineCursor(url.searchParams.get("cursor"));
    const collectionRef = collection(db, INVENTORY_PHOTO_LOG_COLLECTION);
    const baseConstraints: QueryConstraint[] =
      scope === "pending" ? [where("isPending", "==", true)] : [];
    const timelineConstraints: QueryConstraint[] =
      scope === "pending"
        ? [...baseConstraints, orderBy(documentId(), "desc")]
        : [
            orderBy("uploadedAtIso", "desc"),
            orderBy(documentId(), "desc"),
          ];
    if (cursor) {
      timelineConstraints.push(
        scope === "pending"
          ? startAfter(cursor.id)
          : startAfter(cursor.timestamp, cursor.id)
      );
    }
    timelineConstraints.push(limit(pageSize + 1));

    const countQuery =
      baseConstraints.length > 0
        ? query(collectionRef, ...baseConstraints)
        : collectionRef;
    const snapshot = await getDocs(
      query(collectionRef, ...timelineConstraints)
    );
    const countSnapshot = await getCountFromServer(countQuery);
    const hasMore = snapshot.docs.length > pageSize;
    const pageDocs = snapshot.docs.slice(0, pageSize);
    const items = pageDocs.map((entry) =>
      mapInventoryPhotoLogItem(
        entry.id,
        entry.data() as Record<string, unknown>
      )
    );
    const lastEntry = pageDocs.at(-1);
    const lastTimestamp =
      typeof lastEntry?.data()?.uploadedAtIso === "string"
        ? String(lastEntry.data()?.uploadedAtIso)
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
        items,
        total: countSnapshot.data().count,
        pageSize,
        hasMore,
        nextCursor,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("inventory-photo-log:get", error);
    return NextResponse.json(
      { error: "Failed to load the inventory photo log." },
      { status: 500 }
    );
  }
}
