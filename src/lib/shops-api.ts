import {
  DEFAULT_COLLECTION_POINT,
  DEFAULT_PICKUP_POINT,
  normalizeSizeLabel,
  normalizeList,
  sortSizes,
  sortSizePrices,
  toNumber,
  type ShopItemInput,
  type ShopSizePrice,
} from "@/lib/shops";

type ParseResult =
  | { ok: true; data: ShopItemInput }
  | { ok: false; error: string };

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  if (typeof value === "number") return value === 1;
  return fallback;
}

function cleanString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeSizePrices(input: unknown): ShopSizePrice[] {
  if (Array.isArray(input)) {
    const list = input
      .map((entry) => {
        const raw = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};
        return {
          size: normalizeSizeLabel(cleanString(raw.size)),
          price: toNumber(raw.price),
          buyingPrice: toNumber(raw.buyingPrice),
          profit: toNumber(raw.profit),
        };
      })
      .filter((entry) => entry.size && entry.price !== null && entry.price >= 0) as ShopSizePrice[];
    return list.map((entry) => ({
      size: entry.size,
      price: entry.price as number,
      buyingPrice:
        entry.buyingPrice != null && entry.buyingPrice >= 0 ? entry.buyingPrice : null,
      profit: Number.isFinite(entry.profit) ? (entry.profit as number) : null,
    }));
  }

  if (input && typeof input === "object") {
    const map = new Map<string, number>();
    Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
      const size = normalizeSizeLabel(cleanString(key));
      const price = toNumber(value);
      if (!size || price === null || price < 0) return;
      map.set(size, price);
    });
    return Array.from(map.entries()).map(([size, price]) => ({ size, price }));
  }

  return [];
}

export function parseShopPayload(body: unknown): ParseResult {
  const payload = (body ?? {}) as Record<string, unknown>;

  const title = cleanString(payload.title);
  if (!title) return { ok: false, error: "Title is required." };

  const colors = normalizeList(payload.colors);
  if (!colors.length) return { ok: false, error: "Add at least one color." };

  let sizePrices = normalizeSizePrices(payload.sizePrices);
  if (!sizePrices.length) {
    const sizes = sortSizes(
      normalizeList(payload.sizes).map((size) => normalizeSizeLabel(size))
    );
    const fallbackPrice = toNumber(payload.basePrice) ?? toNumber(payload.pickupPrice);
    if (sizes.length && fallbackPrice !== null && fallbackPrice >= 0) {
      sizePrices = sizes.map((size) => ({ size, price: fallbackPrice }));
    }
  }

  if (!sizePrices.length) {
    return { ok: false, error: "Add at least one size with a price." };
  }

  sizePrices = sortSizePrices(sizePrices);
  const sizes = sizePrices.map((entry) => entry.size);
  const basePrice = Math.min(...sizePrices.map((entry) => entry.price));

  const deliveryFee = toNumber(payload.deliveryFee);
  if (deliveryFee !== null && deliveryFee < 0) {
    return { ok: false, error: "Postal delivery fee must be 0 or higher." };
  }

  const pickupPoint = cleanString(payload.pickupPoint) || DEFAULT_PICKUP_POINT;
  const collectionPoint =
    cleanString(payload.collectionPoint) || DEFAULT_COLLECTION_POINT;
  const photoUrl = cleanString(payload.photoUrl) || null;

  const isActive = parseBoolean(payload.isActive, true);
  const inStock = parseBoolean(payload.inStock, true);

  const data: ShopItemInput = {
    title,
    colors,
    sizes,
    sizePrices,
    basePrice,
    deliveryFee: deliveryFee ?? null,
    pickupPoint,
    collectionPoint,
    photoUrl,
    isActive,
    inStock,
  };

  return { ok: true, data };
}
