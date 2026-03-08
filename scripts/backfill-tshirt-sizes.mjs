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
import { loadEnvConfig } from "@next/env";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
loadEnvConfig(path.resolve(scriptDir, ".."));

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (value) return value;
  throw new Error(`Missing required environment variable: ${name}`);
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

function normalizeSizeLabel(size) {
  return String(size || "").replace(/\s+Old$/i, "").trim();
}

function normalizeSizePrices(input) {
  if (!Array.isArray(input)) return [];
  const map = new Map();
  for (const row of input) {
    const size = normalizeSizeLabel(row?.size);
    const price = Number(row?.price);
    if (!size || !Number.isFinite(price) || price < 0) continue;
    const buyingPrice = Number.isFinite(Number(row?.buyingPrice))
      ? Number(row.buyingPrice)
      : null;
    const profit = Number.isFinite(Number(row?.profit))
      ? Number(row.profit)
      : null;
    map.set(size, { size, price, buyingPrice, profit });
  }
  return Array.from(map.values());
}

function isTshirtTitle(title) {
  const text = String(title || "").toLowerCase();
  return text.includes("t-shirt") || text.includes("tshirt");
}

function modePrice(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let winner = null;
  let winnerCount = -1;
  for (const [price, count] of counts.entries()) {
    if (count > winnerCount) {
      winner = price;
      winnerCount = count;
      continue;
    }
    if (count === winnerCount && winner !== null && price < winner) {
      winner = price;
    }
  }
  return winner;
}

function inferTemplateMap(tshirtDocs) {
  const bySize = new Map(SIZE_ORDER.map((size) => [size, []]));
  for (const item of tshirtDocs) {
    const sizePrices = normalizeSizePrices(item.sizePrices);
    for (const row of sizePrices) {
      if (!bySize.has(row.size)) continue;
      bySize.get(row.size).push(row.price);
    }
  }

  const template = {};
  for (const size of SIZE_ORDER) {
    const values = bySize.get(size) || [];
    const mode = modePrice(values);
    if (mode !== null) template[size] = mode;
  }

  // Conservative fallback within known groups if a size has no direct historical value.
  const kidsFallback = modePrice(
    [
      "1 Yr",
      "2 Yrs",
      "4 Yrs",
      "6 Yrs",
      "8 Yrs",
      "10 Yrs",
      "12 Yrs",
      "14 Yrs",
    ]
      .map((size) => template[size])
      .filter((value) => Number.isFinite(value))
  );
  const regularFallback = modePrice(
    ["XS", "S", "M", "L", "XL"]
      .map((size) => template[size])
      .filter((value) => Number.isFinite(value))
  );
  const plusFallback = modePrice(
    ["2XL", "3XL", "4XL"]
      .map((size) => template[size])
      .filter((value) => Number.isFinite(value))
  );

  for (const size of SIZE_ORDER) {
    if (Number.isFinite(template[size])) continue;
    if (
      [
        "1 Yr",
        "2 Yrs",
        "4 Yrs",
        "6 Yrs",
        "8 Yrs",
        "10 Yrs",
        "12 Yrs",
        "14 Yrs",
      ].includes(size) &&
      Number.isFinite(kidsFallback)
    ) {
      template[size] = kidsFallback;
      continue;
    }
    if (["XS", "S", "M", "L", "XL"].includes(size) && Number.isFinite(regularFallback)) {
      template[size] = regularFallback;
      continue;
    }
    if (["2XL", "3XL", "4XL"].includes(size) && Number.isFinite(plusFallback)) {
      template[size] = plusFallback;
      continue;
    }
    template[size] = 0;
  }

  return template;
}

function buildBackfilledSizePrices(existing, templateMap) {
  const existingMap = new Map();
  for (const row of normalizeSizePrices(existing)) {
    existingMap.set(row.size, row);
  }

  return SIZE_ORDER.map((size) => {
    const current = existingMap.get(size);
    if (current) {
      return {
        size,
        price: current.price,
        buyingPrice:
          Number.isFinite(current.buyingPrice) && current.buyingPrice >= 0
            ? current.buyingPrice
            : null,
        profit: Number.isFinite(current.profit) ? current.profit : null,
      };
    }
    return {
      size,
      price: Number(templateMap[size] || 0),
      buyingPrice: null,
      profit: null,
    };
  });
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

  const snap = await getDocs(collection(db, "shops"));
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const tshirts = items.filter((item) => isTshirtTitle(item.title));

  if (!tshirts.length) {
    console.log("No T-shirt records found. Nothing to do.");
    process.exit(0);
  }

  const templateMap = inferTemplateMap(tshirts);
  console.log("Inferred size template (from existing DB data):");
  for (const size of SIZE_ORDER) {
    console.log(`- ${size}: ${templateMap[size]}`);
  }

  const updates = [];
  for (const item of tshirts) {
    const nextSizePrices = buildBackfilledSizePrices(item.sizePrices, templateMap);
    const currentNormalized = normalizeSizePrices(item.sizePrices);
    const currentKey = JSON.stringify(
      SIZE_ORDER.map((size) => {
        const row = currentNormalized.find((entry) => entry.size === size);
        return row ? { size: row.size, price: row.price } : null;
      })
    );
    const nextKey = JSON.stringify(nextSizePrices.map((row) => ({ size: row.size, price: row.price })));
    if (currentKey === nextKey) continue;

    updates.push({
      id: item.id,
      title: item.title,
      sizePrices: nextSizePrices,
      sizes: SIZE_ORDER,
      basePrice: Math.min(...nextSizePrices.map((row) => row.price)),
    });
  }

  console.log(`T-shirt records scanned: ${tshirts.length}`);
  console.log(`T-shirt records needing backfill: ${updates.length}`);

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to update Firestore.");
    process.exit(0);
  }

  if (!updates.length) {
    console.log("No updates needed.");
    process.exit(0);
  }

  const batch = writeBatch(db);
  for (const update of updates) {
    batch.update(doc(db, "shops", update.id), {
      sizePrices: update.sizePrices,
      sizes: update.sizes,
      basePrice: update.basePrice,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  console.log(`Applied updates to ${updates.length} documents.`);
  process.exit(0);
}

run().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
