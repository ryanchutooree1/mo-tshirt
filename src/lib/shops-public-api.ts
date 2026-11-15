import { getPlainPricingClass, getVerifiedPoloMaterial, parsePoloMaterial, resolvePlainCustomerPrice } from "@/lib/shop-customer-pricing";
import {
  getShopDesignProductId, normalizeList, normalizeSizeLabel, ONE_SIZE_LABEL, sortSizes, toNumber, type PublicShopItem, type StudioShopItem,
} from "@/lib/shops";

const safeString = (value: unknown) => typeof value === "string" ? value : null;
const safePrice = (value: unknown) => {
  const amount = toNumber(value);
  return amount !== null && amount >= 0 ? amount : null;
};

function positionFrom(data: Record<string, unknown>) {
  const { createdAt } = data;
  return typeof data.position === "number" && Number.isFinite(data.position) ? data.position
    : createdAt && typeof createdAt === "object" && "toMillis" in createdAt && typeof createdAt.toMillis === "function"
      ? Number(createdAt.toMillis()) || 0
      : typeof createdAt === "number" && Number.isFinite(createdAt) ? createdAt : 0;
}

/** Explicitly allow-list public fields. Never spread a document or a size-price row into the response. */
export function mapPublicShopItem(id: string, data: Record<string, unknown>, studio = false): StudioShopItem {
  const product = { title: safeString(data.title) ?? "", poloMaterial: parsePoloMaterial(data.poloMaterial) };
  const stored = new Map<string, number | null>();
  for (const row of Array.isArray(data.sizePrices) ? data.sizePrices : []) {
    if (!row || typeof row !== "object" || typeof row.size !== "string") continue;
    const size = normalizeSizeLabel(row.size);
    if (size) stored.set(size, safePrice(row.price));
  }
  const kind = getPlainPricingClass(product.title);
  const validStoredSizes = [...stored].filter(([, price]) => price !== null).map(([size]) => size);
  const sizes = sortSizes(validStoredSizes.length ? validStoredSizes : normalizeList(data.sizes));
  const variants = sizes.length ? sizes : [ONE_SIZE_LABEL];
  const legacyFallback = safePrice(data.basePrice) ?? 0;
  const legacySizes = sortSizes(validStoredSizes.length ? validStoredSizes : sizes);
  const studioSizePrices = studio && getShopDesignProductId(product.title)
    ? (legacySizes.length ? legacySizes : [ONE_SIZE_LABEL]).map((size) => ({ size, price: stored.get(size) ?? legacyFallback }))
    : null;
  const sizePrices: PublicShopItem["sizePrices"] = [];
  const priceReviewSizes: string[] = [];
  for (const size of variants) {
    const policy = resolvePlainCustomerPrice(product, size);
    const price = policy === undefined ? (stored.get(size) ?? legacyFallback) : policy;
    if (price === null) priceReviewSizes.push(size);
    else if (kind !== "other" || validStoredSizes.length) sizePrices.push({ size, price });
  }
  return {
    id,
    title: product.title,
    poloMaterial: getVerifiedPoloMaterial(product),
    colors: normalizeList(data.colors),
    sizePrices,
    sizes: kind === "other" ? sizes : variants,
    priceReviewSizes,
    ...(studioSizePrices ? { studioSizePrices } : {}),
    ...(kind === "other" ? { basePrice: legacyFallback, pickupPrice: safePrice(data.pickupPrice) }
      : sizePrices.length ? { basePrice: Math.min(...sizePrices.map(({ price }) => price)) } : {}),
    deliveryFee: safePrice(data.deliveryFee),
    collectionPoint: safeString(data.collectionPoint),
    photoUrl: safeString(data.photoUrl),
    backPhotoUrl: safeString(data.backPhotoUrl),
    sidePhotoUrl: safeString(data.sidePhotoUrl),
    studioPhotoUrl: safeString(data.studioPhotoUrl),
    studioBackPhotoUrl: safeString(data.studioBackPhotoUrl),
    position: positionFrom(data),
    isActive: data.isActive === true,
    inStock: data.inStock !== false,
  };
}
