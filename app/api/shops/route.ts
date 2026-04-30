import { NextResponse } from "next/server";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normalizeSizeLabel, sortShopItems, sortSizes, sortSizePrices, toNumber, type ShopItem } from "@/lib/shops";

function getPositionValue(data: Record<string, any>) {
  if (Number.isFinite(data.position)) return Number(data.position);
  const createdAt = data.createdAt;
  if (createdAt?.toMillis) return createdAt.toMillis();
  if (Number.isFinite(createdAt)) return Number(createdAt);
  return 0;
}

function normalizeSizePrices(list: unknown) {
  if (!Array.isArray(list)) return [];

  return sortSizePrices(
    list
      .map((entry) => {
        const raw = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
        const size = normalizeSizeLabel(String(raw.size || "").trim());
        const price = toNumber(raw.price);
        if (!size || price === null || price < 0) return null;
        return {
          size,
          price,
          buyingPrice: toNumber(raw.buyingPrice),
          profit: toNumber(raw.profit),
        };
      })
      .filter(Boolean) as ShopItem["sizePrices"]
  );
}

function mapDoc(id: string, data: Record<string, any>): ShopItem {
  const sizePrices = normalizeSizePrices(data.sizePrices);
  const sizes = sizePrices.length
    ? sizePrices.map((entry) => entry.size)
    : sortSizes(
        (Array.isArray(data.sizes) ? data.sizes : [])
          .map((size) => normalizeSizeLabel(String(size || "").trim()))
          .filter(Boolean)
      );

  return {
    id,
    title: String(data.title ?? ""),
    colors: Array.isArray(data.colors) ? data.colors : [],
    sizePrices,
    sizes,
    basePrice: Number(data.basePrice ?? 0),
    pickupPrice: data.pickupPrice ?? null,
    deliveryFee: data.deliveryFee ?? null,
    pickupPoint: null,
    collectionPoint: data.collectionPoint ?? null,
    photoUrl: data.photoUrl ?? null,
    backPhotoUrl: data.backPhotoUrl ?? null,
    sidePhotoUrl: data.sidePhotoUrl ?? null,
    position: getPositionValue(data),
    isActive: Boolean(data.isActive),
    inStock: data.inStock !== false,
  };
}

export async function GET() {
  try {
    const snap = await getDocs(
      query(collection(db, "shops"), where("isActive", "==", true))
    );
    const items = sortShopItems(snap.docs.map((doc) => mapDoc(doc.id, doc.data())));
    return NextResponse.json({ items });
  } catch (error) {
    console.error("shops:get", error);
    return NextResponse.json({ error: "Failed to load shops." }, { status: 500 });
  }
}
