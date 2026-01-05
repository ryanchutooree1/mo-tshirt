import { NextResponse } from "next/server";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ShopItem } from "@/lib/shops";

function mapDoc(id: string, data: Record<string, any>): ShopItem {
  return {
    id,
    title: String(data.title ?? ""),
    colors: Array.isArray(data.colors) ? data.colors : [],
    sizes: Array.isArray(data.sizes) ? data.sizes : [],
    basePrice: Number(data.basePrice ?? 0),
    pickupPrice: data.pickupPrice ?? null,
    deliveryFee: data.deliveryFee ?? null,
    deliveredPrice: data.deliveredPrice ?? null,
    pickupPoint: data.pickupPoint ?? null,
    collectionPoint: data.collectionPoint ?? null,
    photoUrl: data.photoUrl ?? null,
    isActive: Boolean(data.isActive),
    inStock: data.inStock !== false,
  };
}

export async function GET() {
  try {
    const snap = await getDocs(
      query(collection(db, "shops"), where("isActive", "==", true))
    );
    const items = snap.docs.map((doc) => mapDoc(doc.id, doc.data()));
    return NextResponse.json({ items });
  } catch (error) {
    console.error("shops:get", error);
    return NextResponse.json({ error: "Failed to load shops." }, { status: 500 });
  }
}
