import {
  DEFAULT_COLLECTION_POINT,
  DEFAULT_PICKUP_POINT,
  normalizeList,
  toNumber,
  type ShopItemInput,
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

export function parseShopPayload(body: unknown): ParseResult {
  const payload = (body ?? {}) as Record<string, unknown>;

  const title = cleanString(payload.title);
  if (!title) return { ok: false, error: "Title is required." };

  const colors = normalizeList(payload.colors);
  if (!colors.length) return { ok: false, error: "Add at least one color." };

  const sizes = normalizeList(payload.sizes);
  if (!sizes.length) return { ok: false, error: "Add at least one size." };

  const basePrice = toNumber(payload.basePrice);
  if (basePrice === null || basePrice < 0) {
    return { ok: false, error: "Base price must be 0 or higher." };
  }

  const pickupPrice = toNumber(payload.pickupPrice);
  if (pickupPrice !== null && pickupPrice < 0) {
    return { ok: false, error: "Pickup price must be 0 or higher." };
  }

  const deliveryFee = toNumber(payload.deliveryFee);
  if (deliveryFee !== null && deliveryFee < 0) {
    return { ok: false, error: "Delivery fee must be 0 or higher." };
  }

  const deliveredPrice = toNumber(payload.deliveredPrice);
  if (deliveredPrice !== null && deliveredPrice < 0) {
    return { ok: false, error: "Delivered price must be 0 or higher." };
  }

  if (deliveredPrice === null && deliveryFee === null) {
    return { ok: false, error: "Provide a delivered price or a delivery fee." };
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
    basePrice,
    pickupPrice: pickupPrice ?? null,
    deliveryFee: deliveryFee ?? null,
    deliveredPrice: deliveredPrice ?? null,
    pickupPoint,
    collectionPoint,
    photoUrl,
    isActive,
    inStock,
  };

  return { ok: true, data };
}
