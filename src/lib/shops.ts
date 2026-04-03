import { formatMoney as formatDisplayMoney } from "@/lib/money";

export const DEFAULT_PICKUP_POINT = "Nouvelle France";
export const DEFAULT_COLLECTION_POINT = "Surinam";
export const ONE_SIZE_LABEL = "One size";
export const ADULT_SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;
export const SIZE_ORDER = [
  "1 Yr",
  "2 Yrs",
  "4 Yrs",
  "6 Yrs",
  "8 Yrs",
  "10 Yrs",
  "12 Yrs",
  "14 Yrs",
  ...ADULT_SIZE_ORDER,
] as const;

const ONE_SIZE_ALIASES = new Set([
  "one size",
  "one-size",
  "onesize",
  "free size",
  "free-size",
  "freesize",
  "default",
  "standard",
  "no size",
  "no-size",
  "nosize",
]);

export type ShopSizePrice = {
  size: string;
  price: number;
  buyingPrice?: number | null;
  profit?: number | null;
};

export type ShopItem = {
  id: string;
  title: string;
  colors: string[];
  sizePrices: ShopSizePrice[];
  sizes?: string[];
  basePrice?: number;
  pickupPrice?: number | null;
  deliveryFee?: number | null;
  pickupPoint?: string | null;
  collectionPoint?: string | null;
  photoUrl?: string | null;
  position?: number;
  isActive: boolean;
  inStock: boolean;
};

export type ShopItemInput = Omit<ShopItem, "id">;

export type ShopSelection = {
  color: string;
  size: string;
  quantity: number;
  deliveryMethod:
    | "Surinam pickup"
    | "Post Office Postage Delivery"
    | "Post Office Express Delivery"
    | "Delivery (Need to arrange first)";
};

export type ShopOrderLine = {
  itemId: string;
  title: string;
  color: string;
  size: string;
  quantity: number;
};

export const QUOTE_GARMENT_OPTIONS = [
  "T-Shirt",
  "Poloshirt",
  "Hoodie",
  "Cap",
  "Other",
] as const;

export type QuoteGarmentOption = (typeof QUOTE_GARMENT_OPTIONS)[number];

export type QuoteGarmentLine = {
  garment?: string;
  color?: string;
  size?: string;
  quantity?: string | number;
};

const QUOTE_COLOR_PRIORITY = new Map<string, number>([
  ["white", 0],
  ["black", 1],
  ["navy blue", 2],
  ["navy", 3],
]);

function normalizeColorKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function getQuoteGarmentFromShopTitle(title: string): QuoteGarmentOption {
  const normalized = String(title || "").trim().toLowerCase();
  if (normalized.includes("polo")) return "Poloshirt";
  if (normalized.includes("hoodie")) return "Hoodie";
  if (normalized.includes("cap")) return "Cap";
  if (
    normalized.includes("t-shirt") ||
    normalized.includes("t shirt") ||
    normalized.includes("tee")
  ) {
    return "T-Shirt";
  }
  return "Other";
}

export function createQuoteColorOptionsByGarment(): Record<QuoteGarmentOption, string[]> {
  return QUOTE_GARMENT_OPTIONS.reduce(
    (acc, garment) => {
      acc[garment] = [];
      return acc;
    },
    {} as Record<QuoteGarmentOption, string[]>
  );
}

export function sortQuoteColors(list: string[]): string[] {
  const unique = new Map<string, string>();

  list.forEach((entry) => {
    const label = String(entry || "").trim();
    const key = normalizeColorKey(label);
    if (!label || !key || unique.has(key)) return;
    unique.set(key, label);
  });

  return Array.from(unique.values()).sort((left, right) => {
    const leftPriority =
      QUOTE_COLOR_PRIORITY.get(normalizeColorKey(left)) ?? Number.MAX_SAFE_INTEGER;
    const rightPriority =
      QUOTE_COLOR_PRIORITY.get(normalizeColorKey(right)) ?? Number.MAX_SAFE_INTEGER;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.localeCompare(right, undefined, { sensitivity: "base" });
  });
}

export function getQuoteColorOptionsByGarment(
  items: Pick<ShopItem, "title" | "colors">[]
): Record<QuoteGarmentOption, string[]> {
  const grouped = createQuoteColorOptionsByGarment();
  const allColors = sortQuoteColors(
    items.flatMap((item) => normalizeList(item.colors))
  );

  items.forEach((item) => {
    const garment = getQuoteGarmentFromShopTitle(item.title);
    if (garment === "Other") return;
    normalizeList(item.colors).forEach((color) => {
      grouped[garment].push(color);
    });
  });

  return QUOTE_GARMENT_OPTIONS.reduce((acc, garment) => {
    acc[garment] =
      garment === "Other" ? allColors : sortQuoteColors(grouped[garment]);
    return acc;
  }, createQuoteColorOptionsByGarment());
}

export function formatQuoteGarmentDescription(entry: QuoteGarmentLine) {
  const garment = String(entry.garment || "").trim() || "Custom item";
  const color = String(entry.color || "").trim();
  const size = normalizeSizeLabel(String(entry.size || "").trim());
  const details = [color, size && !isOneSizeLabel(size) ? size : ""].filter(Boolean);

  return details.length ? `${garment} (${details.join(" / ")})` : garment;
}

export function normalizeSizeLabel(size: string): string {
  const trimmed = String(size || "").replace(/\s+Old$/i, "").trim();
  if (!trimmed) return "";

  const normalized = trimmed.replace(/\s+/g, " ").toLowerCase();
  if (ONE_SIZE_ALIASES.has(normalized)) return ONE_SIZE_LABEL;

  const compact = trimmed.replace(/\s+/g, "").toUpperCase();
  if (compact === "XXL" || compact === "2XL") return "2XL";
  if (compact === "XXXL" || compact === "3XL") return "3XL";
  if (compact === "XXXXL" || compact === "4XL") return "4XL";

  return trimmed;
}

export function formatSizeLabel(size: string): string {
  return normalizeSizeLabel(size);
}

export function isOneSizeLabel(size: string): boolean {
  return normalizeSizeLabel(size) === ONE_SIZE_LABEL;
}

export type ShopOrderLineWithPrice = ShopOrderLine & {
  unitPrice?: number | null;
  lineTotal?: number | null;
};

export type DeliveryInfo = {
  name: string;
  address: string;
  postCode?: string;
  phone: string;
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
  const map = new Map<string, ShopSizePrice>();
  list.forEach((entry) => {
    const size = normalizeSizeLabel(String(entry.size || "").trim());
    const price = Number(entry.price);
    if (!size || !Number.isFinite(price) || price < 0) return;
    map.set(size, {
      size,
      price,
      buyingPrice:
        Number.isFinite(entry.buyingPrice) ? (entry.buyingPrice as number) : null,
      profit: Number.isFinite(entry.profit) ? (entry.profit as number) : null,
    });
  });
  return Array.from(map.values());
}

const sizeOrderMap = new Map<string, number>(
  [ONE_SIZE_LABEL, ...SIZE_ORDER].map((label, index) => [normalizeSizeLabel(label), index])
);

export function sortSizePrices(list: ShopSizePrice[]): ShopSizePrice[] {
  return list
    .map((entry, index) => ({
      entry: { ...entry, size: normalizeSizeLabel(entry.size) },
      order: sizeOrderMap.has(normalizeSizeLabel(entry.size))
        ? sizeOrderMap.get(normalizeSizeLabel(entry.size))!
        : SIZE_ORDER.length + index,
    }))
    .sort((a, b) => a.order - b.order)
    .map(({ entry }) => entry);
}

export function sortSizes(list: string[]): string[] {
  const seen = new Set<string>();
  return list
    .map((size, index) => ({
      size: normalizeSizeLabel(size),
      order: sizeOrderMap.has(normalizeSizeLabel(size))
        ? sizeOrderMap.get(normalizeSizeLabel(size))!
        : SIZE_ORDER.length + index,
    }))
    .filter((entry) => {
      if (!entry.size) return false;
      if (seen.has(entry.size)) return false;
      seen.add(entry.size);
      return true;
    })
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
    return [{ size: ONE_SIZE_LABEL, price: fallbackPrice }];
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
    !isOneSizeLabel(selection.size) ? `Size: ${selection.size}` : "",
    `Quantity: ${selection.quantity}`,
    `Delivery: ${selection.deliveryMethod}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildShopWhatsAppMessageForLines(
  lines: ShopOrderLineWithPrice[],
  deliveryMethod: ShopSelection["deliveryMethod"],
  totals?: { subtotal?: number; deliveryFee?: number; total?: number },
  deliveryInfo?: DeliveryInfo | null
) {
  const cleaned = lines.filter(
    (line) =>
      line.title &&
      line.color &&
      line.size &&
      Number.isFinite(line.quantity) &&
      line.quantity > 0
  );
  const message: string[] = [`Hi! I'd like to order:`];
  if (cleaned.length) {
    message.push("Items:");
    cleaned.forEach((line) => {
      const parts = [
        `- ${line.title}`,
        `Color: ${line.color}`,
        !isOneSizeLabel(line.size) ? `Size: ${formatSizeLabel(line.size)}` : "",
        `Qty: ${line.quantity}`,
      ];
      if (Number.isFinite(line.unitPrice)) {
        parts.push(`Price: ${formatDisplayMoney(line.unitPrice)}`);
      }
      if (Number.isFinite(line.lineTotal)) {
        parts.push(`Line total: ${formatDisplayMoney(line.lineTotal)}`);
      }
      message.push(parts.filter(Boolean).join(" | "));
    });
  }
  message.push(`Delivery: ${deliveryMethod}`);
  if (deliveryMethod !== "Surinam pickup" && deliveryInfo) {
    message.push("Delivery Info:");
    message.push(`Name: ${deliveryInfo.name}`);
    message.push(`Address: ${deliveryInfo.address}`);
    if (deliveryInfo.postCode?.trim()) {
      message.push(`Post Code: ${deliveryInfo.postCode}`);
    }
    message.push(`Phone: ${deliveryInfo.phone}`);
  }
  if (totals) {
    if (Number.isFinite(totals.subtotal)) {
      message.push(`Subtotal: ${formatDisplayMoney(totals.subtotal)}`);
    }
    if (Number.isFinite(totals.deliveryFee) && (totals.deliveryFee || 0) > 0) {
      message.push(`Delivery fee (${deliveryMethod}): ${formatDisplayMoney(totals.deliveryFee)}`);
    }
    if (Number.isFinite(totals.total)) {
      message.push(`Total: ${formatDisplayMoney(totals.total)}`);
    }
  }
  return message.join("\n");
}
