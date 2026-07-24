import { NextResponse } from "next/server";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isAdminRequest } from "@/lib/admin-request";
import {
  INVENTORY_PHOTO_LOG_COLLECTION,
  mapInventoryPhotoLogItem,
} from "@/lib/inventory-photo-log";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminRequest("/api/admin/inventory-photo-log"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const snapshot = await getDocs(
      query(
        collection(db, INVENTORY_PHOTO_LOG_COLLECTION),
        orderBy("uploadedAtIso", "desc"),
        limit(200)
      )
    );
    const items = snapshot.docs.map((entry) =>
      mapInventoryPhotoLogItem(
        entry.id,
        entry.data() as Record<string, unknown>
      )
    );

    return NextResponse.json(
      { items },
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
