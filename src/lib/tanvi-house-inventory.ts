export const TANVI_HOUSE_INVENTORY_COLLECTION = "tanviHouseInventory";

export const HOUSE_STOCK_LEVELS = ["high", "medium", "low", "out"] as const;

export type HouseStockLevel = (typeof HOUSE_STOCK_LEVELS)[number];

export type TanviHouseInventoryItem = {
  id: string;
  name: string;
  category: string;
  quantity: number | null;
  stockLevel: HouseStockLevel;
  needNow: boolean;
  purchased: boolean;
  createdAt: string;
  updatedAt: string;
};

type HouseInventoryCreateInput = {
  name: string;
  category: string;
  quantity: number | null;
  stockLevel: HouseStockLevel;
};

type HouseInventoryPatchInput = Partial<
  Pick<
    TanviHouseInventoryItem,
    "name" | "category" | "quantity" | "stockLevel" | "needNow" | "purchased"
  >
>;

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isHouseStockLevel(value: unknown): value is HouseStockLevel {
  return HOUSE_STOCK_LEVELS.includes(value as HouseStockLevel);
}

function parseOptionalQuantity(
  value: unknown
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === "" || value === null || value === undefined) {
    return { ok: true, value: null };
  }

  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0) {
    return {
      ok: false,
      error: "Quantity must be a whole number of zero or more, or left blank.",
    };
  }

  return { ok: true, value: quantity };
}

export function parseHouseInventoryCreate(
  body: unknown
):
  | { ok: true; data: HouseInventoryCreateInput }
  | { ok: false; error: string } {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const name = cleanString(payload.name, 140);
  if (!name) return { ok: false, error: "Item name is required." };
  const quantity = parseOptionalQuantity(payload.quantity);
  if (!quantity.ok) return quantity;

  return {
    ok: true,
    data: {
      name,
      category: cleanString(payload.category, 80) || "Other",
      quantity: quantity.value,
      stockLevel: isHouseStockLevel(payload.stockLevel)
        ? payload.stockLevel
        : "high",
    },
  };
}

export function parseHouseInventoryPatch(
  body: unknown
):
  | { ok: true; data: HouseInventoryPatchInput }
  | { ok: false; error: string } {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const data: HouseInventoryPatchInput = {};

  if ("name" in payload) {
    const name = cleanString(payload.name, 140);
    if (!name) return { ok: false, error: "Item name is required." };
    data.name = name;
  }
  if ("category" in payload) {
    data.category = cleanString(payload.category, 80) || "Other";
  }
  if ("quantity" in payload) {
    const quantity = parseOptionalQuantity(payload.quantity);
    if (!quantity.ok) return quantity;
    data.quantity = quantity.value;
  }
  if ("stockLevel" in payload) {
    if (!isHouseStockLevel(payload.stockLevel)) {
      return { ok: false, error: "Choose a valid stock level." };
    }
    data.stockLevel = payload.stockLevel;
  }
  if ("needNow" in payload) {
    if (typeof payload.needNow !== "boolean") {
      return { ok: false, error: "Need now must be a checkbox value." };
    }
    data.needNow = payload.needNow;
  }
  if ("purchased" in payload) {
    if (typeof payload.purchased !== "boolean") {
      return { ok: false, error: "Purchased must be a checkbox value." };
    }
    data.purchased = payload.purchased;
  }

  if (!Object.keys(data).length) {
    return { ok: false, error: "No inventory changes were provided." };
  }

  return { ok: true, data };
}

export function mapTanviHouseInventoryItem(
  id: string,
  data: Record<string, unknown>
): TanviHouseInventoryItem {
  const createdAt =
    cleanString(data.createdAtIso, 80) || new Date(0).toISOString();
  return {
    id,
    name: cleanString(data.name, 140) || "Unnamed item",
    category: cleanString(data.category, 80) || "Other",
    quantity:
      typeof data.quantity === "number" &&
      Number.isInteger(data.quantity) &&
      data.quantity >= 0
        ? data.quantity
        : null,
    stockLevel: isHouseStockLevel(data.stockLevel)
      ? data.stockLevel
      : "high",
    needNow: Boolean(data.needNow),
    purchased: Boolean(data.purchased),
    createdAt,
    updatedAt: cleanString(data.updatedAtIso, 80) || createdAt,
  };
}
