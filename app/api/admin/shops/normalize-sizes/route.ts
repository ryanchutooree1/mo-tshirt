import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasAdminSession } from "@/lib/admin-auth";
import { shopCollection, shopDocument, shopBatch, serverTimestamp } from "@/lib/shops-server";
import { normalizeSizeLabel, sortSizePrices, sortSizes, toNumber, type ShopSizePrice } from "@/lib/shops";

export const runtime = "nodejs";

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
    const snap = await shopCollection().get();
    const batch = shopBatch();
    let updated = 0;

    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const rawSizePrices = Array.isArray(data.sizePrices) ? data.sizePrices : [];
      const rawSizes = Array.isArray(data.sizes) ? data.sizes : [];
      const hasLegacyLabels =
        rawSizePrices.some((entry: any) => {
          const raw = String(entry?.size || "").trim();
          return raw !== normalizeSizeLabel(raw);
        }) ||
        rawSizes.some((size: string) => {
          const raw = String(size || "").trim();
          return raw !== normalizeSizeLabel(raw);
        });

      if (!hasLegacyLabels) return;

      const normalizedSizePrices = normalizeSizePrices(rawSizePrices);
      const normalizedSizes = normalizedSizePrices.length
        ? normalizedSizePrices.map((entry) => entry.size)
        : sortSizes(
            rawSizes
              .map((size: string) => normalizeSizeLabel(String(size || "")))
              .filter(Boolean)
          );

      batch.update(shopDocument(docSnap.id), {
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
  } catch {
    console.error("shops:admin:normalize");
    return NextResponse.json({ error: "Failed to normalize sizes." }, { status: 500 });
  }
}
