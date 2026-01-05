export const DEFAULT_PICKUP_POINT = "Nouvelle France";
export const DEFAULT_COLLECTION_POINT = "Surinam";
export const SIZE_ORDER = [
  "1 Yr Old",
  "2 Yrs Old",
  "4 Yrs Old",
  "6 Yrs Old",
  "8 Yrs Old",
  "10 Yrs Old",
  "12 Yrs Old",
  "14 Yrs Old",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
] as const;

export type ShopSizePrice = {
  size: string;
  price: number;
};

export type ShopItem = {
  id: string;
  title: string;
  colors: string[];
  sizePrices: ShopSizePrice[];
  sizes?: string[];
  basePrice?: number;
  pickupPrice?: number | null;
  buyingPrice?: number | null;
  deliveryFee?: number | null;
  pickupPoint?: string | null;
  collectionPoint?: string | null;
  photoUrl?: string | null;
  isActive: boolean;
  inStock: boolean;
};

export type ShopItemInput = Omit<ShopItem, "id">;

export type ShopSelection = {
  color: string;
  size: string;
  quantity: number;
  deliveryMethod: "Surinam pickup" | "Post Office delivery";
};

export function normalizeList(input: unknown): string[] {
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((item) => String(item || "").trim())
          .filter((value) => value.length > 0)
      )
    );
  }
  if (typeof input === "string") {
    return Array.from(
      new Set(
        input
          .split(",")
          .map((item) => item.trim())
          .filter((value) => value.length > 0)
      )
    );
  }
  return [];
}

export function toNumber(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function uniqueSizePrices(list: ShopSizePrice[]): ShopSizePrice[] {
  const map = new Map<string, number>();
  list.forEach((entry) => {
    const size = String(entry.size || "").trim();
    const price = Number(entry.price);
    if (!size || !Number.isFinite(price) || price < 0) return;
    map.set(size, price);
  });
  return Array.from(map.entries()).map(([size, price]) => ({ size, price }));
}

const sizeOrderMap = new Map<string, number>(
  SIZE_ORDER.map((label, index) => [label, index])
);

export function sortSizePrices(list: ShopSizePrice[]): ShopSizePrice[] {
  return list
    .map((entry, index) => ({
      entry,
      order: sizeOrderMap.has(entry.size) ? sizeOrderMap.get(entry.size)! : SIZE_ORDER.length + index,
    }))
    .sort((a, b) => a.order - b.order)
    .map(({ entry }) => entry);
}

export function sortSizes(list: string[]): string[] {
  return list
    .map((size, index) => ({
      size,
      order: sizeOrderMap.has(size) ? sizeOrderMap.get(size)! : SIZE_ORDER.length + index,
    }))
    .sort((a, b) => a.order - b.order)
    .map(({ size }) => size);
}

export function getSizePrices(item: ShopItem): ShopSizePrice[] {
  if (Array.isArray(item.sizePrices) && item.sizePrices.length) {
    const cleaned = sortSizePrices(uniqueSizePrices(item.sizePrices));
    if (cleaned.length) return cleaned;
  }

  const sizes = Array.isArray(item.sizes) ? item.sizes : [];
  const fallbackPrice =
    (Number.isFinite(item.basePrice) ? item.basePrice : null) ??
    (Number.isFinite(item.pickupPrice) ? item.pickupPrice : null) ??
    0;

  if (sizes.length) {
    return sortSizes(
      sizes
        .map((size) => String(size || "").trim())
        .filter(Boolean)
    ).map((size) => ({ size, price: fallbackPrice }));
  }

  if (Number.isFinite(fallbackPrice)) {
    return [{ size: "Default", price: fallbackPrice }];
  }

  return [];
}

export function getSizes(item: ShopItem): string[] {
  return getSizePrices(item).map((entry) => entry.size);
}

export function getSizePrice(item: ShopItem, size: string): number {
  const list = getSizePrices(item);
  const match = list.find((entry) => entry.size === size);
  if (match) return match.price;
  return list[0]?.price ?? 0;
}

export function getMinSizePrice(item: ShopItem): number {
  const list = getSizePrices(item);
  if (!list.length) return 0;
  return list.reduce((acc, entry) => (entry.price < acc ? entry.price : acc), list[0].price);
}

export function getDeliveredPrice(item: ShopItem, sizePrice?: number): number | null {
  const base = Number.isFinite(sizePrice) ? (sizePrice as number) : getMinSizePrice(item);
  if (Number.isFinite(item.deliveryFee)) return base + (item.deliveryFee as number);
  return null;
}

export function buildShopWhatsAppMessage(item: ShopItem, selection: ShopSelection) {
  return [
    `Hi! I'd like to order:`,
    `Product: ${item.title}`,
    `Color: ${selection.color}`,
    `Size: ${selection.size}`,
    `Quantity: ${selection.quantity}`,
    `Delivery: ${selection.deliveryMethod}`,
  ].join("\n");
}
