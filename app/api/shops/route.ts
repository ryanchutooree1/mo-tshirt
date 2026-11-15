import { NextResponse } from "next/server";
import { shopCollection, logShopServerError } from "@/lib/shops-server";
import { sortShopItems } from "@/lib/shops";
import { mapPublicShopItem } from "@/lib/shops-public-api";

export const runtime = "nodejs";

export async function GET(request?: Request) {
  try {
    const snap = await shopCollection().where("isActive", "==", true).get();
    // Custom printing uses the existing customer garment base; it is never a supplier cost.
    const studio = request ? new URL(request.url).searchParams.get("purpose") === "design-studio" : false;
    const items = sortShopItems(snap.docs.map((doc) => mapPublicShopItem(doc.id, doc.data(), studio)));
    return NextResponse.json({ items });
  } catch (error) {
    logShopServerError("firestore", error);
    return NextResponse.json({ error: "Failed to load shops." }, { status: 500 });
  }
}
