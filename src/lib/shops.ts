export const DEFAULT_PICKUP_POINT = "Nouvelle France";
export const DEFAULT_COLLECTION_POINT = "Surinam";

export type ShopItem = {
  id: string;
  title: string;
  colors: string[];
  sizes: string[];
  basePrice: number;
  pickupPrice?: number | null;
  deliveryFee?: number | null;
  deliveredPrice?: number | null;
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

export function getPickupPrice(item: ShopItem): number {
  const fallback = Number.isFinite(item.basePrice) ? item.basePrice : 0;
  return Number.isFinite(item.pickupPrice) ? (item.pickupPrice as number) : fallback;
}

export function getDeliveredPrice(item: ShopItem): number | null {
  if (Number.isFinite(item.deliveredPrice)) return item.deliveredPrice as number;
  if (Number.isFinite(item.deliveryFee)) return getPickupPrice(item) + (item.deliveryFee as number);
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
