import {
  applyInventoryTransaction,
  getInventoryMergeKey,
  normalizeInventoryProductName,
  type MobInventoryTransaction,
} from "./mob-inventory.ts";

type DemoProduct = {
  id: string;
  productName: string;
  category: string;
  openingQuantity: number;
  sellingPrice: number;
  lowStockThreshold: number;
  notes: string;
};

type DemoInventoryItemWrite = DemoProduct & {
  normalizedName: string;
  quantity: number;
  isArchived: false;
  isDemoData: true;
  createdAtIso: string;
  updatedAtIso: string;
  lastTransactionAtIso: string;
};

type DemoTransactionWrite = Omit<MobInventoryTransaction, "createdByName"> & {
  createdByName: "MO Mobile Shop demo";
  createdByUserId: "demo-seed";
  isDemoData: true;
};

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: "demo-usbc-charger-20w",
    productName: "20W USB-C Fast Charger",
    category: "Chargers",
    openingQuantity: 34,
    sellingPrice: 850,
    lowStockThreshold: 6,
    notes: "Counter display · white and black",
  },
  {
    id: "demo-usbc-cable-1m",
    productName: "USB-C to USB-C Cable 1m",
    category: "Cables",
    openingQuantity: 48,
    sellingPrice: 350,
    lowStockThreshold: 10,
    notes: "Fast-charge compatible",
  },
  {
    id: "demo-lightning-cable-2m",
    productName: "Lightning Cable 2m",
    category: "Cables",
    openingQuantity: 36,
    sellingPrice: 450,
    lowStockThreshold: 8,
    notes: "Braided cable · assorted colours",
  },
  {
    id: "demo-iphone15-clear-case",
    productName: "iPhone 15 Clear Case",
    category: "Cases",
    openingQuantity: 26,
    sellingPrice: 550,
    lowStockThreshold: 6,
    notes: "MagSafe-style clear case",
  },
  {
    id: "demo-samsung-a15-glass",
    productName: "Samsung A15 Tempered Glass",
    category: "Screen Protection",
    openingQuantity: 44,
    sellingPrice: 200,
    lowStockThreshold: 10,
    notes: "Includes fitting",
  },
  {
    id: "demo-iphone13-glass",
    productName: "iPhone 13 Tempered Glass",
    category: "Screen Protection",
    openingQuantity: 30,
    sellingPrice: 250,
    lowStockThreshold: 8,
    notes: "Full-cover glass",
  },
  {
    id: "demo-powerbank-10000",
    productName: "10,000mAh Power Bank",
    category: "Power",
    openingQuantity: 18,
    sellingPrice: 1290,
    lowStockThreshold: 5,
    notes: "Dual USB output · shelf B",
  },
  {
    id: "demo-tws-earbuds",
    productName: "TWS Wireless Earbuds",
    category: "Audio",
    openingQuantity: 20,
    sellingPrice: 1490,
    lowStockThreshold: 5,
    notes: "Charging case included",
  },
  {
    id: "demo-mini-speaker",
    productName: "Mini Bluetooth Speaker",
    category: "Audio",
    openingQuantity: 15,
    sellingPrice: 1100,
    lowStockThreshold: 4,
    notes: "Black, blue and red",
  },
  {
    id: "demo-car-holder",
    productName: "Dashboard Phone Holder",
    category: "Car Accessories",
    openingQuantity: 24,
    sellingPrice: 650,
    lowStockThreshold: 5,
    notes: "Suction mount",
  },
  {
    id: "demo-microsd-64",
    productName: "64GB microSD Card",
    category: "Storage",
    openingQuantity: 22,
    sellingPrice: 700,
    lowStockThreshold: 5,
    notes: "Class 10 with adapter",
  },
  {
    id: "demo-microsd-128",
    productName: "128GB microSD Card",
    category: "Storage",
    openingQuantity: 16,
    sellingPrice: 1150,
    lowStockThreshold: 4,
    notes: "Class 10 with adapter",
  },
  {
    id: "demo-cable-3in1",
    productName: "3-in-1 Charging Cable",
    category: "Cables",
    openingQuantity: 38,
    sellingPrice: 450,
    lowStockThreshold: 8,
    notes: "USB-C, Lightning and Micro-USB",
  },
  {
    id: "demo-usbc-otg",
    productName: "USB-C OTG Adapter",
    category: "Adapters",
    openingQuantity: 30,
    sellingPrice: 300,
    lowStockThreshold: 6,
    notes: "Counter drawer 2",
  },
  {
    id: "demo-smartwatch-s9",
    productName: "S9 Smartwatch",
    category: "Wearables",
    openingQuantity: 12,
    sellingPrice: 1790,
    lowStockThreshold: 4,
    notes: "Assorted straps",
  },
  {
    id: "demo-camera-protector-14",
    productName: "iPhone 14 Camera Protector",
    category: "Screen Protection",
    openingQuantity: 32,
    sellingPrice: 250,
    lowStockThreshold: 7,
    notes: "Twin lens protector",
  },
  {
    id: "demo-wireless-pad",
    productName: "15W Wireless Charging Pad",
    category: "Chargers",
    openingQuantity: 14,
    sellingPrice: 990,
    lowStockThreshold: 5,
    notes: "USB-C cable included",
  },
  {
    id: "demo-cleaning-kit",
    productName: "Phone Screen Cleaning Kit",
    category: "Care",
    openingQuantity: 40,
    sellingPrice: 180,
    lowStockThreshold: 10,
    notes: "Spray and microfibre cloth",
  },
];

function isoDaysAgo(now: Date, daysAgo: number, minuteOffset = 0) {
  return new Date(
    now.getTime() -
      daysAgo * 24 * 60 * 60 * 1000 -
      minuteOffset * 60 * 1000
  ).toISOString();
}

export function buildDemoMobileShopInventory(now = new Date()) {
  const balances = new Map(
    DEMO_PRODUCTS.map((product) => [product.id, product.openingQuantity])
  );
  const lastMovement = new Map<string, string>();
  const transactions: DemoTransactionWrite[] = [];

  for (const product of DEMO_PRODUCTS) {
    const createdAt = isoDaysAgo(now, 70, DEMO_PRODUCTS.indexOf(product));
    lastMovement.set(product.id, createdAt);
    transactions.push({
      id: `demo-opening-${product.id}`,
      inventoryItemId: product.id,
      productName: product.productName,
      type: "stock-in",
      quantity: product.openingQuantity,
      balanceAfter: product.openingQuantity,
      sellingPrice: product.sellingPrice,
      source: "manual",
      sourcePhotoLogId: null,
      notes: "Opening test stock",
      createdAt,
      createdByName: "MO Mobile Shop demo",
      createdByUserId: "demo-seed",
      isDemoData: true,
    });
  }

  let movementNumber = 0;
  for (let daysAgo = 45; daysAgo >= 0; daysAgo -= 1) {
    const salesToday = daysAgo <= 7 ? 3 : daysAgo % 2 === 0 ? 2 : 1;
    for (let slot = 0; slot < salesToday; slot += 1) {
      const productIndex =
        (daysAgo * 5 + slot * 7 + movementNumber) % DEMO_PRODUCTS.length;
      const product = DEMO_PRODUCTS[productIndex];
      const current = balances.get(product.id) || 0;
      const requested = 1 + ((daysAgo + slot + productIndex) % 3);
      const quantity = Math.min(requested, current);
      if (quantity <= 0) continue;

      const balance = applyInventoryTransaction(
        current,
        "stock-out",
        quantity
      );
      const createdAt = isoDaysAgo(now, daysAgo, 90 + slot * 17);
      balances.set(product.id, balance);
      lastMovement.set(product.id, createdAt);
      transactions.push({
        id: `demo-sale-${String(movementNumber).padStart(3, "0")}`,
        inventoryItemId: product.id,
        productName: product.productName,
        type: "stock-out",
        quantity,
        balanceAfter: balance,
        sellingPrice: product.sellingPrice,
        source: "manual",
        sourcePhotoLogId: null,
        notes: slot % 2 === 0 ? "Counter sale" : "Accessory sale",
        createdAt,
        createdByName: "MO Mobile Shop demo",
        createdByUserId: "demo-seed",
        isDemoData: true,
      });
      movementNumber += 1;
    }

    if (daysAgo % 8 === 0) {
      const productIndex = (daysAgo * 3 + 4) % DEMO_PRODUCTS.length;
      const product = DEMO_PRODUCTS[productIndex];
      const current = balances.get(product.id) || 0;
      const quantity = 10 + (daysAgo % 4) * 2;
      const balance = applyInventoryTransaction(
        current,
        "stock-in",
        quantity
      );
      const createdAt = isoDaysAgo(now, daysAgo, 35);
      balances.set(product.id, balance);
      lastMovement.set(product.id, createdAt);
      transactions.push({
        id: `demo-restock-${String(daysAgo).padStart(2, "0")}`,
        inventoryItemId: product.id,
        productName: product.productName,
        type: "stock-in",
        quantity,
        balanceAfter: balance,
        sellingPrice: product.sellingPrice,
        source: "manual",
        sourcePhotoLogId: null,
        notes: "Supplier delivery",
        createdAt,
        createdByName: "MO Mobile Shop demo",
        createdByUserId: "demo-seed",
        isDemoData: true,
      });
    }
  }

  const attentionTargets = [
    { index: 5, quantity: 3 },
    { index: 11, quantity: 0 },
    { index: 14, quantity: 2 },
    { index: 16, quantity: 4 },
  ];
  attentionTargets.forEach(({ index, quantity: target }, targetIndex) => {
    const product = DEMO_PRODUCTS[index];
    const current = balances.get(product.id) || 0;
    if (current === target) return;
    const type = current > target ? "stock-out" : "stock-in";
    const quantity = Math.abs(current - target);
    const createdAt = isoDaysAgo(now, 0, 25 - targetIndex * 3);
    balances.set(product.id, target);
    lastMovement.set(product.id, createdAt);
    transactions.push({
      id: `demo-attention-${product.id}`,
      inventoryItemId: product.id,
      productName: product.productName,
      type,
      quantity,
      balanceAfter: target,
      sellingPrice: product.sellingPrice,
      source: "manual",
      sourcePhotoLogId: null,
      notes: "Stock count adjustment",
      createdAt,
      createdByName: "MO Mobile Shop demo",
      createdByUserId: "demo-seed",
      isDemoData: true,
    });
  });

  const createdAtIso = isoDaysAgo(now, 70);
  const updatedAtIso = now.toISOString();
  const items: DemoInventoryItemWrite[] = DEMO_PRODUCTS.map((product) => ({
    ...product,
    normalizedName: normalizeInventoryProductName(product.productName),
    quantity: balances.get(product.id) || 0,
    isArchived: false,
    isDemoData: true,
    createdAtIso,
    updatedAtIso,
    lastTransactionAtIso:
      lastMovement.get(product.id) || createdAtIso,
  }));

  const aliases = items.map((item) => ({
    id: getInventoryMergeKey(item.productName),
    inventoryItemId: item.id,
    normalizedName: item.normalizedName,
    updatedAtIso,
    isDemoData: true,
  }));

  return {
    items,
    aliases,
    transactions: transactions.sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    ),
  };
}
