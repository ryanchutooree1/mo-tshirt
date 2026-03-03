import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { collection, doc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import { hasAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/firebase";
import { normalizeSizeLabel, sortSizePrices, sortSizes, toNumber, type ShopSizePrice } from "@/lib/shops";

async function isAdmin() {
  return hasAdminSession(await cookies());
}

function normalizeSizePrices(list: unknown): ShopSizePrice[] {
  if (!Array.isArray(list)) return [];
  const map = new Map<string, ShopSizePrice>();
  list.forEach((entry) => {
    const size = normalizeSizeLabel(String((entry as any)?.size || "").trim());
    const price = toNumber((entry as any)?.price);
    if (!size || price === null || price < 0) return;
    const buyingPrice = toNumber((entry as any)?.buyingPrice);
    const profit = toNumber((entry as any)?.profit);
    map.set(size, {
      size,
      price,
      buyingPrice: buyingPrice !== null && buyingPrice >= 0 ? buyingPrice : null,
      profit: Number.isFinite(profit) ? (profit as number) : null,
    });
  });
  return sortSizePrices(Array.from(map.values()));
}

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const snap = await getDocs(collection(db, "shops"));
    const batch = writeBatch(db);
    let updated = 0;

    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const rawSizePrices = Array.isArray(data.sizePrices) ? data.sizePrices : [];
      const rawSizes = Array.isArray(data.sizes) ? data.sizes : [];
      const hasOld =
        rawSizePrices.some((entry: any) => /\s+Old$/i.test(String(entry?.size || ""))) ||
        rawSizes.some((size: string) => /\s+Old$/i.test(String(size || "")));

      if (!hasOld) return;

      const normalizedSizePrices = normalizeSizePrices(rawSizePrices);
      const normalizedSizes = normalizedSizePrices.length
        ? normalizedSizePrices.map((entry) => entry.size)
        : sortSizes(
            rawSizes
              .map((size: string) => normalizeSizeLabel(String(size || "")))
              .filter(Boolean)
          );

      batch.update(doc(db, "shops", docSnap.id), {
        sizePrices: normalizedSizePrices,
        sizes: normalizedSizes,
        updatedAt: serverTimestamp(),
      });
      updated += 1;
    });

    if (updated > 0) {
      await batch.commit();
    }

    return NextResponse.json({ updated });
  } catch (error) {
    console.error("shops:admin:normalize", error);
    return NextResponse.json({ error: "Failed to normalize sizes." }, { status: 500 });
  }
}
