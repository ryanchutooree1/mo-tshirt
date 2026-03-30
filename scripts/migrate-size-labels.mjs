import { initializeApp, getApps, getApp } from "firebase/app";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
loadEnvConfig(path.resolve(scriptDir, ".."));

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (value) return value;
  throw new Error(`Missing required environment variable: ${name}`);
}

function normalizeSizeLabel(size) {
  const trimmed = String(size || "").replace(/\s+Old$/i, "").trim();
  if (!trimmed) return "";

  const compact = trimmed.replace(/\s+/g, "").toUpperCase();
  if (compact === "XXL" || compact === "2XL") return "2XL";
  if (compact === "XXXL" || compact === "3XL") return "3XL";
  if (compact === "XXXXL" || compact === "4XL") return "4XL";

  return trimmed;
}

const SIZE_ORDER = [
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
];

const sizeOrderMap = new Map(SIZE_ORDER.map((label, index) => [label, index]));

function sortSizes(list) {
  const seen = new Set();
  return list
    .map((size, index) => ({
      size: normalizeSizeLabel(size),
      order: sizeOrderMap.has(normalizeSizeLabel(size))
        ? sizeOrderMap.get(normalizeSizeLabel(size))
        : SIZE_ORDER.length + index,
    }))
    .filter((entry) => {
      if (!entry.size || seen.has(entry.size)) return false;
      seen.add(entry.size);
      return true;
    })
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.size);
}

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toNonNegativeInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function normalizeSizePriceList(list) {
  if (!Array.isArray(list)) return [];

  const map = new Map();
  list.forEach((entry) => {
    const raw = entry && typeof entry === "object" ? entry : {};
    const size = normalizeSizeLabel(raw.size);
    const price = toNumber(raw.price);
    if (!size || price === null || price < 0) return;

    map.set(size, {
      size,
      price,
      buyingPrice: toNumber(raw.buyingPrice),
      profit: toNumber(raw.profit),
    });
  });

  return sortSizes(Array.from(map.keys())).map((size) => map.get(size));
}

function normalizeInventorySizeMap(input) {
  const map = new Map();
  Object.entries(input || {}).forEach(([rawSize, rawValue]) => {
    const size = normalizeSizeLabel(rawSize);
    if (!size) return;
    map.set(size, (map.get(size) || 0) + toNonNegativeInt(rawValue));
  });
  return Object.fromEntries(sortSizes(Array.from(map.keys())).map((size) => [size, map.get(size) || 0]));
}

function normalizeInventoryMinMap(input) {
  const map = new Map();
  Object.entries(input || {}).forEach(([rawSize, rawValue]) => {
    const size = normalizeSizeLabel(rawSize);
    if (!size) return;
    const value = toNonNegativeInt(rawValue);
    map.set(size, map.has(size) ? Math.max(map.get(size), value) : value);
  });
  return Object.fromEntries(sortSizes(Array.from(map.keys())).map((size) => [size, map.get(size) || 0]));
}

function normalizeProductsDoc(data) {
  const colors = Array.isArray(data.colors)
    ? data.colors
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => {
          const minStock = normalizeInventoryMinMap(entry.minStock);
          return {
            ...entry,
            color: String(entry.color || "Color"),
            sizes: normalizeInventorySizeMap(entry.sizes),
            ...(Object.keys(minStock).length ? { minStock } : {}),
          };
        })
    : [];

  return {
    ...data,
    colors,
  };
}

function ensure4xlOnShopData(sizePrices, sizes) {
  const plusSizes = sizePrices.filter((entry) => ["2XL", "3XL", "4XL"].includes(entry.size));
  if (!plusSizes.length) return { sizePrices, sizes };
  if (plusSizes.some((entry) => entry.size === "4XL")) {
    return {
      sizePrices,
      sizes: sortSizes([...sizes, "4XL"]),
    };
  }

  const source = plusSizes.find((entry) => entry.size === "3XL") || plusSizes.find((entry) => entry.size === "2XL");
  if (!source) return { sizePrices, sizes };

  return {
    sizePrices: sortSizes([...sizePrices.map((entry) => entry.size), "4XL"]).map((size) => {
      if (size === "4XL") {
        return {
          ...source,
          size: "4XL",
        };
      }
      return sizePrices.find((entry) => entry.size === size);
    }).filter(Boolean),
    sizes: sortSizes([...sizes, "4XL"]),
  };
}

function normalizeShopsDoc(data) {
  const sizePrices = normalizeSizePriceList(data.sizePrices);
  const normalizedSizes = sizePrices.length
    ? sizePrices.map((entry) => entry.size)
    : sortSizes((Array.isArray(data.sizes) ? data.sizes : []).map((size) => String(size || "").trim()));

  const with4xl = ensure4xlOnShopData(sizePrices, normalizedSizes);
  const next = {
    ...data,
    sizePrices: with4xl.sizePrices,
    sizes: with4xl.sizes,
  };

  if (with4xl.sizePrices.length) {
    next.basePrice = Math.min(...with4xl.sizePrices.map((entry) => Number(entry.price || 0)));
  }

  return next;
}

function deepNormalizeLegacySizes(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => deepNormalizeLegacySizes(entry));
  }

  if (value && typeof value === "object") {
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function" || typeof value.toMillis === "function") {
      return value;
    }

    const next = {};
    Object.entries(value).forEach(([key, child]) => {
      if (key === "size" && typeof child === "string") {
        next[key] = normalizeSizeLabel(child);
        return;
      }
      if (key === "sizes" && Array.isArray(child)) {
        next[key] = child.map((entry) =>
          typeof entry === "string" ? normalizeSizeLabel(entry) : deepNormalizeLegacySizes(entry)
        );
        return;
      }
      next[key] = deepNormalizeLegacySizes(child);
    });
    return next;
  }

  return value;
}

function toComparable(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => toComparable(entry));
  }

  if (value && typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    if (typeof value.toMillis === "function") return value.toMillis();

    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, toComparable(value[key])])
    );
  }

  return value;
}

function collectChanges(before, after) {
  return JSON.stringify(toComparable(before)) !== JSON.stringify(toComparable(after));
}

function stripUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedDeep(entry));
  }

  if (value && typeof value === "object") {
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function" || typeof value.toMillis === "function") {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, stripUndefinedDeep(child)])
    );
  }

  return value;
}

async function gatherCollectionUpdates(db, collectionName, normalizeDoc) {
  const snap = await getDocs(collection(db, collectionName));
  const updates = [];

  snap.docs.forEach((docSnap) => {
    const before = docSnap.data();
    const after = normalizeDoc(before);
    if (!collectChanges(before, after)) return;
    updates.push({
      collectionName,
      id: docSnap.id,
      data: after,
    });
  });

  return {
    scanned: snap.size,
    updates,
  };
}

async function applyUpdates(db, updates) {
  let batch = writeBatch(db);
  let batchSize = 0;
  let committed = 0;

  for (const update of updates) {
    batch.update(doc(db, update.collectionName, update.id), {
      ...stripUndefinedDeep(update.data),
      updatedAt: serverTimestamp(),
    });
    batchSize += 1;
    if (batchSize >= 400) {
      await batch.commit();
      committed += batchSize;
      batch = writeBatch(db);
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    await batch.commit();
    committed += batchSize;
  }

  return committed;
}

async function run() {
  const apply = process.argv.includes("--apply");

  const firebaseConfig = {
    apiKey: requireEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
      "pocket-entreprise-app.firebaseapp.com",
    projectId:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "pocket-entreprise-app",
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      "pocket-entreprise-app.appspot.com",
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1063169876011",
    appId:
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
      "1:1063169876011:web:8c79c9f828a2478d1f0a6e",
  };

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const plans = [
    ["products", normalizeProductsDoc],
    ["shops", normalizeShopsDoc],
    ["transactions", deepNormalizeLegacySizes],
    ["posHolds", deepNormalizeLegacySizes],
    ["quotes", deepNormalizeLegacySizes],
    ["aiAssistantSessions", deepNormalizeLegacySizes],
    ["aiAssistantLeads", deepNormalizeLegacySizes],
    ["aiAssistantFeedback", deepNormalizeLegacySizes],
  ];

  const allUpdates = [];

  for (const [collectionName, normalizeDoc] of plans) {
    const result = await gatherCollectionUpdates(db, collectionName, normalizeDoc);
    console.log(`${collectionName}: scanned ${result.scanned}, pending ${result.updates.length}`);
    allUpdates.push(...result.updates);
  }

  console.log(`Total documents needing updates: ${allUpdates.length}`);

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to update Firestore.");
    process.exit(0);
  }

  if (!allUpdates.length) {
    console.log("No updates needed.");
    process.exit(0);
  }

  const committed = await applyUpdates(db, allUpdates);
  console.log(`Applied updates to ${committed} documents.`);
}

run().catch((error) => {
  console.error("Size migration failed:", error);
  process.exit(1);
});
