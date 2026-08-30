export const TANVI_HOUSE_INVENTORY_COLLECTION = "tanviHouseInventory";

export const HOUSE_STOCK_LEVELS = ["unknown", "high", "medium", "low", "out"] as const;
export const HOUSE_SHOPPING_STATUSES = ["none", "later", "now", "bought"] as const;

export type HouseStockLevel = (typeof HOUSE_STOCK_LEVELS)[number];
export type HouseShoppingStatus = (typeof HOUSE_SHOPPING_STATUSES)[number];

export type TanviHouseInventoryItem = {
  id: string;
  name: string;
  category: string;
  stockQuantity: string;
  stockLevel: HouseStockLevel;
  shoppingStatus: HouseShoppingStatus;
  buyQuantity: string;
  budgetMin: number | null;
  budgetMax: number | null;
  lastBoughtAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HouseInventoryWriteInput = {
  name: string;
  category: string;
  stockQuantity: string;
  stockLevel: HouseStockLevel;
  shoppingStatus: HouseShoppingStatus;
  buyQuantity: string;
  budgetMin: number | null;
  budgetMax: number | null;
};

type HouseInventoryPatchInput = Partial<HouseInventoryWriteInput>;

export type StarterGroceryItem = {
  key: string;
  name: string;
  category: string;
  buyQuantity: string;
  budgetMin: number;
  budgetMax: number;
};

export const STARTER_GROCERY_ITEMS: StarterGroceryItem[] = [
  { key: "potatoes", name: "Potatoes", category: "Vegetables", buyQuantity: "2 kg", budgetMin: 100, budgetMax: 100 },
  { key: "sweet-potatoes", name: "Sweet potatoes", category: "Vegetables", buyQuantity: "1 kg", budgetMin: 80, budgetMax: 80 },
  { key: "tomatoes", name: "Tomatoes", category: "Vegetables", buyQuantity: "1 kg", budgetMin: 100, budgetMax: 100 },
  { key: "onions", name: "Onions", category: "Vegetables", buyQuantity: "1 kg", budgetMin: 60, budgetMax: 60 },
  { key: "carrots", name: "Carrots", category: "Vegetables", buyQuantity: "1 kg", budgetMin: 100, budgetMax: 100 },
  { key: "cabbage", name: "Cabbage", category: "Vegetables", buyQuantity: "1", budgetMin: 50, budgetMax: 50 },
  { key: "pumpkin", name: "Pumpkin", category: "Vegetables", buyQuantity: "1 piece", budgetMin: 60, budgetMax: 60 },
  { key: "chouchou", name: "Chouchou", category: "Vegetables", buyQuantity: "4–5", budgetMin: 50, budgetMax: 50 },
  { key: "brinjal", name: "Brinjal", category: "Vegetables", buyQuantity: "500 g", budgetMin: 50, budgetMax: 50 },
  { key: "green-beans", name: "Green beans", category: "Vegetables", buyQuantity: "500 g", budgetMin: 70, budgetMax: 70 },
  { key: "spinach-brede", name: "Spinach/brède", category: "Vegetables", buyQuantity: "2 bunches", budgetMin: 50, budgetMax: 50 },
  { key: "bananas", name: "Bananas", category: "Fruit", buyQuantity: "1 kg", budgetMin: 90, budgetMax: 90 },
  { key: "avocados", name: "Avocados", category: "Fruit", buyQuantity: "3–4", budgetMin: 120, budgetMax: 120 },
  { key: "eggs", name: "Eggs", category: "Dairy & eggs", buyQuantity: "12", budgetMin: 115, budgetMax: 115 },
  { key: "chicken", name: "Chicken", category: "Meat & protein", buyQuantity: "2 kg", budgetMin: 550, budgetMax: 550 },
  { key: "lentils-dhal", name: "Lentils/dhal", category: "Pantry", buyQuantity: "1 kg", budgetMin: 80, budgetMax: 80 },
  { key: "rice", name: "Rice", category: "Pantry", buyQuantity: "5 kg", budgetMin: 320, budgetMax: 400 },
  { key: "oats", name: "Oats", category: "Breakfast", buyQuantity: "1 pack", budgetMin: 100, budgetMax: 100 },
  { key: "full-cream-milk", name: "Full-cream milk", category: "Dairy & eggs", buyQuantity: "2 L", budgetMin: 120, budgetMax: 120 },
  { key: "peanut-butter", name: "Peanut butter", category: "Breakfast", buyQuantity: "1 jar", budgetMin: 150, budgetMax: 150 },
];

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isHouseStockLevel(value: unknown): value is HouseStockLevel {
  return HOUSE_STOCK_LEVELS.includes(value as HouseStockLevel);
}

function isHouseShoppingStatus(value: unknown): value is HouseShoppingStatus {
  return HOUSE_SHOPPING_STATUSES.includes(value as HouseShoppingStatus);
}

function parseMoney(value: unknown, label: string):
  | { ok: true; value: number | null }
  | { ok: false; error: string } {
  if (value === "" || value === null || value === undefined) {
    return { ok: true, value: null };
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
    return { ok: false, error: `${label} must be a valid positive amount.` };
  }
  return { ok: true, value: Math.round(amount * 100) / 100 };
}

function parseWriteFields(payload: Record<string, unknown>, partial: boolean):
  | { ok: true; data: HouseInventoryPatchInput }
  | { ok: false; error: string } {
  const data: HouseInventoryPatchInput = {};

  if (!partial || "name" in payload) {
    const name = cleanString(payload.name, 140);
    if (!name) return { ok: false, error: "Item name is required." };
    data.name = name;
  }
  if (!partial || "category" in payload) {
    data.category = cleanString(payload.category, 80) || "Other";
  }
  if (!partial || "stockQuantity" in payload || "quantity" in payload) {
    const legacyQuantity = payload.quantity;
    data.stockQuantity = cleanString(
      "stockQuantity" in payload
        ? payload.stockQuantity
        : typeof legacyQuantity === "number"
          ? String(legacyQuantity)
          : legacyQuantity,
      40
    );
  }
  if (!partial || "stockLevel" in payload) {
    if (payload.stockLevel !== undefined && !isHouseStockLevel(payload.stockLevel)) {
      return { ok: false, error: "Choose a valid stock level." };
    }
    data.stockLevel = isHouseStockLevel(payload.stockLevel) ? payload.stockLevel : "unknown";
  }
  if (!partial || "shoppingStatus" in payload) {
    if (payload.shoppingStatus !== undefined && !isHouseShoppingStatus(payload.shoppingStatus)) {
      return { ok: false, error: "Choose a valid shopping status." };
    }
    data.shoppingStatus = isHouseShoppingStatus(payload.shoppingStatus)
      ? payload.shoppingStatus
      : "none";
  }
  if (!partial || "buyQuantity" in payload) {
    data.buyQuantity = cleanString(payload.buyQuantity, 40);
  }
  if (!partial || "budgetMin" in payload) {
    const budgetMin = parseMoney(payload.budgetMin, "Price");
    if (!budgetMin.ok) return budgetMin;
    data.budgetMin = budgetMin.value;
  }
  if (!partial || "budgetMax" in payload) {
    const budgetMax = parseMoney(payload.budgetMax, "Maximum price");
    if (!budgetMax.ok) return budgetMax;
    data.budgetMax = budgetMax.value;
  }

  if (data.budgetMin !== undefined && data.budgetMax !== undefined &&
      data.budgetMin !== null && data.budgetMax !== null && data.budgetMax < data.budgetMin) {
    return { ok: false, error: "Maximum price cannot be lower than the price." };
  }
  return { ok: true, data };
}

export function parseHouseInventoryCreate(body: unknown):
  | { ok: true; data: HouseInventoryWriteInput }
  | { ok: false; error: string } {
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const parsed = parseWriteFields(payload, false);
  if (!parsed.ok) return parsed;
  return { ok: true, data: parsed.data as HouseInventoryWriteInput };
}

export function parseHouseInventoryPatch(body: unknown):
  | { ok: true; data: HouseInventoryPatchInput }
  | { ok: false; error: string } {
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const parsed = parseWriteFields(payload, true);
  if (!parsed.ok) return parsed;
  if (!Object.keys(parsed.data).length) {
    return { ok: false, error: "No inventory changes were provided." };
  }
  return parsed;
}

export function shoppingStatusFromData(data: Record<string, unknown>): HouseShoppingStatus {
  if (isHouseShoppingStatus(data.shoppingStatus)) return data.shoppingStatus;
  if (Boolean(data.purchased)) return "bought";
  if (Boolean(data.needNow)) return "now";
  return "none";
}

export function shoppingCompatibilityFields(status: HouseShoppingStatus) {
  return {
    shoppingStatus: status,
    needNow: status === "now" || status === "bought",
    purchased: status === "bought",
  };
}

export function mapTanviHouseInventoryItem(
  id: string,
  data: Record<string, unknown>
): TanviHouseInventoryItem {
  const createdAt = cleanString(data.createdAtIso, 80) || new Date(0).toISOString();
  const legacyQuantity = typeof data.quantity === "number" && Number.isFinite(data.quantity)
    ? String(data.quantity)
    : "";
  const budgetMin = typeof data.budgetMin === "number" && data.budgetMin >= 0
    ? data.budgetMin
    : null;
  const budgetMax = typeof data.budgetMax === "number" && data.budgetMax >= 0
    ? data.budgetMax
    : budgetMin;
  return {
    id,
    name: cleanString(data.name, 140) || "Unnamed item",
    category: cleanString(data.category, 80) || "Other",
    stockQuantity: cleanString(data.stockQuantity, 40) || legacyQuantity,
    stockLevel: isHouseStockLevel(data.stockLevel) ? data.stockLevel : "unknown",
    shoppingStatus: shoppingStatusFromData(data),
    buyQuantity: cleanString(data.buyQuantity, 40),
    budgetMin,
    budgetMax,
    lastBoughtAt: cleanString(data.lastBoughtAtIso, 80) || null,
    createdAt,
    updatedAt: cleanString(data.updatedAtIso, 80) || createdAt,
  };
}
