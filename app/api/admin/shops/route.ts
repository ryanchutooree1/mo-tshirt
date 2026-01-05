import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { parseShopPayload } from "@/lib/shops-api";
import type { ShopItem } from "@/lib/shops";

function isAdmin() {
  return cookies().get("admin-auth")?.value === "1";
}

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
  if (!isAdmin()) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const snap = await getDocs(query(collection(db, "shops"), orderBy("createdAt", "desc")));
    const items = snap.docs.map((doc) => mapDoc(doc.id, doc.data()));
    return NextResponse.json({ items });
  } catch (error) {
    console.error("shops:admin:get", error);
    return NextResponse.json({ error: "Failed to load shops." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = parseShopPayload(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const payload = {
      ...parsed.data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, "shops"), payload);
    return NextResponse.json({ id: ref.id });
  } catch (error) {
    console.error("shops:admin:post", error);
    return NextResponse.json({ error: "Failed to save shop item." }, { status: 500 });
  }
}
