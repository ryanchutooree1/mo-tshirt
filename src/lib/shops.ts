export const DEFAULT_PICKUP_POINT = "Nouvelle France";
export const DEFAULT_COLLECTION_POINT = "Surinam";
export const SIZE_ORDER = [
  "1 Yr",
  "2 Yrs",
  "4 Yrs",
  "6 Yrs",
  "8 Yrs",
  "10 Yrs",
  "12 Yrs",
  "14 Yrs",
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

export function normalizeSizeLabel(size: string): string {
  return String(size || "").replace(/\s+Old$/i, "").trim();
}

export function formatSizeLabel(size: string): string {
  return normalizeSizeLabel(size);
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
  SIZE_ORDER.map((label, index) => [normalizeSizeLabel(label), index])
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
        `Size: ${formatSizeLabel(line.size)}`,
        `Qty: ${line.quantity}`,
      ];
      if (Number.isFinite(line.unitPrice)) {
        parts.push(`Price: Rs ${Number(line.unitPrice || 0).toLocaleString()}`);
      }
      if (Number.isFinite(line.lineTotal)) {
        parts.push(`Line total: Rs ${Number(line.lineTotal || 0).toLocaleString()}`);
      }
      message.push(parts.join(" | "));
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
      message.push(`Subtotal: Rs ${Number(totals.subtotal || 0).toLocaleString()}`);
    }
    if (Number.isFinite(totals.deliveryFee) && (totals.deliveryFee || 0) > 0) {
      message.push(`Delivery fee (${deliveryMethod}): Rs ${Number(totals.deliveryFee || 0).toLocaleString()}`);
    }
    if (Number.isFinite(totals.total)) {
      message.push(`Total: Rs ${Number(totals.total || 0).toLocaleString()}`);
    }
  }
  return message.join("\n");
}
