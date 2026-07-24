import type { InventoryTransactionType } from "@/lib/inventory-photo-log";

export const MOB_INVENTORY_COLLECTION = "mobInventoryItems";
export const MOB_INVENTORY_ALIASES_COLLECTION = "mobInventoryAliases";
export const MOB_INVENTORY_TRANSACTIONS_COLLECTION =
  "mobInventoryTransactions";
export const MOB_SETTINGS_COLLECTION = "mobSettings";
export const MOB_INVENTORY_SETTINGS_ID = "inventory";

export type MobInventoryItem = {
  id: string;
  productName: string;
  normalizedName: string;
  category: string;
  quantity: number;
  sellingPrice: number;
  notes: string;
  lowStockThreshold: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  lastTransactionAt: string;
};

export type MobInventoryTransaction = {
  id: string;
  inventoryItemId: string;
  productName: string;
  type: InventoryTransactionType;
  quantity: number;
  balanceAfter: number;
  sellingPrice: number;
  source: "manual" | "photo-log";
  sourcePhotoLogId: string | null;
  notes: string;
  createdAt: string;
  createdByName: string;
};

export type MobInventorySettings = {
  deleteCompletedPhotos: boolean;
  photoRetentionDays: number;
  updatedAt: string | null;
};

export const DEFAULT_MOB_INVENTORY_SETTINGS: MobInventorySettings = {
  deleteCompletedPhotos: true,
  photoRetentionDays: 2,
  updatedAt: null,
};

type InventoryItemInput = {
  productName: string;
  normalizedName: string;
  category: string;
  quantity: number;
  sellingPrice: number;
  notes: string;
  lowStockThreshold: number;
};

function cleanString(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseNonNegativeNumber(
  value: unknown,
  label: string,
  options?: { integer?: boolean; fallback?: number }
) {
  if ((value === "" || value === null || value === undefined) && options?.fallback !== undefined) {
    return { ok: true as const, value: options.fallback };
  }

  const numeric = Number(value);
  if (
    !Number.isFinite(numeric) ||
    numeric < 0 ||
    (options?.integer && !Number.isInteger(numeric))
  ) {
    return {
      ok: false as const,
      error: `${label} must be a non-negative${options?.integer ? " whole" : ""} number.`,
    };
  }
  return { ok: true as const, value: numeric };
}

export function normalizeInventoryProductName(value: unknown) {
  return cleanString(value, 160)
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function getInventoryMergeKey(productName: unknown) {
  const normalizedName = normalizeInventoryProductName(productName);
  return normalizedName ? `name-${stableHash(normalizedName)}` : "";
}

export function getInventoryItemIdForMergeKey(mergeKey: string) {
  return `stock-${mergeKey.replace(/[^a-z0-9-]/gi, "").slice(0, 80)}`;
}

export function parseMobInventoryItemInput(
  body: unknown
):
  | { ok: true; data: InventoryItemInput }
  | { ok: false; error: string } {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const productName = cleanString(payload.productName, 160);
  if (!productName) return { ok: false, error: "Product name is required." };

  const quantity = parseNonNegativeNumber(payload.quantity, "Opening quantity", {
    integer: true,
    fallback: 0,
  });
  if (!quantity.ok) return quantity;
  const sellingPrice = parseNonNegativeNumber(
    payload.sellingPrice,
    "Selling price",
    { fallback: 0 }
  );
  if (!sellingPrice.ok) return sellingPrice;
  const lowStockThreshold = parseNonNegativeNumber(
    payload.lowStockThreshold,
    "Low-stock level",
    { integer: true, fallback: 5 }
  );
  if (!lowStockThreshold.ok) return lowStockThreshold;

  return {
    ok: true,
    data: {
      productName,
      normalizedName: normalizeInventoryProductName(productName),
      category: cleanString(payload.category, 100),
      quantity: quantity.value,
      sellingPrice: sellingPrice.value,
      notes: cleanString(payload.notes, 2000),
      lowStockThreshold: lowStockThreshold.value,
    },
  };
}

export function parseMobInventoryAdjustment(
  body: unknown
):
  | {
      ok: true;
      data: {
        type: InventoryTransactionType;
        quantity: number;
        sellingPrice: number | null;
        notes: string;
      };
    }
  | { ok: false; error: string } {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const type =
    payload.type === "stock-in" || payload.type === "stock-out"
      ? payload.type
      : null;
  if (!type) return { ok: false, error: "Choose Stock In or Stock Out." };

  const quantity = parseNonNegativeNumber(payload.quantity, "Quantity", {
    integer: true,
  });
  if (!quantity.ok) return quantity;
  if (quantity.value <= 0) {
    return { ok: false, error: "Quantity must be at least 1." };
  }

  const rawPrice = payload.sellingPrice;
  const sellingPrice =
    rawPrice === "" || rawPrice === null || rawPrice === undefined
      ? { ok: true as const, value: null }
      : parseNonNegativeNumber(rawPrice, "Selling price");
  if (!sellingPrice.ok) return sellingPrice;

  return {
    ok: true,
    data: {
      type,
      quantity: quantity.value,
      sellingPrice: sellingPrice.value,
      notes: cleanString(payload.notes, 1000),
    },
  };
}

export function applyInventoryTransaction(
  currentQuantity: number,
  type: InventoryTransactionType,
  quantity: number
) {
  const current = Number.isFinite(currentQuantity)
    ? Math.max(0, Math.floor(currentQuantity))
    : 0;
  const amount = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  return type === "stock-in" ? current + amount : Math.max(0, current - amount);
}

export function mapMobInventoryItem(
  id: string,
  data: Record<string, unknown>
): MobInventoryItem {
  const createdAt =
    cleanString(data.createdAtIso, 80) || new Date(0).toISOString();
  return {
    id,
    productName: cleanString(data.productName, 160) || "Unnamed item",
    normalizedName: normalizeInventoryProductName(data.productName),
    category: cleanString(data.category, 100),
    quantity: Number.isFinite(data.quantity)
      ? Math.max(0, Math.floor(Number(data.quantity)))
      : 0,
    sellingPrice: Number.isFinite(data.sellingPrice)
      ? Math.max(0, Number(data.sellingPrice))
      : 0,
    notes: cleanString(data.notes, 2000),
    lowStockThreshold: Number.isFinite(data.lowStockThreshold)
      ? Math.max(0, Math.floor(Number(data.lowStockThreshold)))
      : 5,
    isArchived: Boolean(data.isArchived),
    createdAt,
    updatedAt: cleanString(data.updatedAtIso, 80) || createdAt,
    lastTransactionAt:
      cleanString(data.lastTransactionAtIso, 80) || createdAt,
  };
}

export function mapMobInventoryTransaction(
  id: string,
  data: Record<string, unknown>
): MobInventoryTransaction {
  return {
    id,
    inventoryItemId: cleanString(data.inventoryItemId, 180),
    productName: cleanString(data.productName, 160) || "Unnamed item",
    type: data.type === "stock-out" ? "stock-out" : "stock-in",
    quantity: Number.isFinite(data.quantity)
      ? Math.max(0, Math.floor(Number(data.quantity)))
      : 0,
    balanceAfter: Number.isFinite(data.balanceAfter)
      ? Math.max(0, Math.floor(Number(data.balanceAfter)))
      : 0,
    sellingPrice: Number.isFinite(data.sellingPrice)
      ? Math.max(0, Number(data.sellingPrice))
      : 0,
    source: data.source === "photo-log" ? "photo-log" : "manual",
    sourcePhotoLogId: cleanString(data.sourcePhotoLogId, 180) || null,
    notes: cleanString(data.notes, 1000),
    createdAt:
      cleanString(data.createdAtIso, 80) || new Date(0).toISOString(),
    createdByName: cleanString(data.createdByName, 160) || "Administrator",
  };
}

export function parseMobInventorySettings(
  body: unknown
):
  | { ok: true; data: Omit<MobInventorySettings, "updatedAt"> }
  | { ok: false; error: string } {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const photoRetentionDays = Number(payload.photoRetentionDays);
  if (
    !Number.isInteger(photoRetentionDays) ||
    photoRetentionDays < 1 ||
    photoRetentionDays > 365
  ) {
    return {
      ok: false,
      error: "Photo retention must be between 1 and 365 days.",
    };
  }

  return {
    ok: true,
    data: {
      deleteCompletedPhotos: payload.deleteCompletedPhotos !== false,
      photoRetentionDays,
    },
  };
}

export function mapMobInventorySettings(
  data: Record<string, unknown> | null | undefined
): MobInventorySettings {
  if (!data) return DEFAULT_MOB_INVENTORY_SETTINGS;
  const retention = Number(data.photoRetentionDays);
  return {
    deleteCompletedPhotos: data.deleteCompletedPhotos !== false,
    photoRetentionDays:
      Number.isInteger(retention) && retention >= 1 && retention <= 365
        ? retention
        : DEFAULT_MOB_INVENTORY_SETTINGS.photoRetentionDays,
    updatedAt: cleanString(data.updatedAtIso, 80) || null,
  };
}
