import assert from "node:assert/strict";
import test from "node:test";
import {
  getInventoryPhotoPendingState,
  isInventoryPhotoEligibleForDeletion,
  parseExifDateTime,
  parseInventoryPhotoUpdate,
} from "../src/lib/inventory-photo-log.ts";

function buildExifBuffer() {
  const buffer = Buffer.alloc(100);
  buffer.write("Exif\u0000\u0000", 0, "binary");
  const tiff = 6;
  buffer.write("II", tiff, "ascii");
  buffer.writeUInt16LE(42, tiff + 2);
  buffer.writeUInt32LE(8, tiff + 4);

  buffer.writeUInt16LE(1, tiff + 8);
  buffer.writeUInt16LE(0x8769, tiff + 10);
  buffer.writeUInt16LE(4, tiff + 12);
  buffer.writeUInt32LE(1, tiff + 14);
  buffer.writeUInt32LE(26, tiff + 18);

  buffer.writeUInt16LE(2, tiff + 26);
  buffer.writeUInt16LE(0x9003, tiff + 28);
  buffer.writeUInt16LE(2, tiff + 30);
  buffer.writeUInt32LE(20, tiff + 32);
  buffer.writeUInt32LE(56, tiff + 36);
  buffer.writeUInt16LE(0x9011, tiff + 40);
  buffer.writeUInt16LE(2, tiff + 42);
  buffer.writeUInt32LE(7, tiff + 44);
  buffer.writeUInt32LE(76, tiff + 48);

  buffer.write("2026:07:24 09:15:30\u0000", tiff + 56, "ascii");
  buffer.write("+04:00\u0000", tiff + 76, "ascii");
  return buffer;
}

test("parses EXIF original date and timezone", () => {
  assert.deepEqual(parseExifDateTime(buildExifBuffer()), {
    normalized: "2026-07-24T09:15:30+04:00",
    raw: "2026:07:24 09:15:30",
  });
});

test("marks incomplete and temporary records as pending", () => {
  assert.equal(
    getInventoryPhotoPendingState({
      productName: "Unsorted Item 001",
      isTemporaryName: true,
    }),
    true
  );
  assert.equal(
    getInventoryPhotoPendingState({
      productName: "Blue Polo",
      quantity: 12,
      sellingPrice: 450,
      transactionType: "stock-in",
    }),
    false
  );
});

test("category is optional when all stock details are complete", () => {
  const parsed = parseInventoryPhotoUpdate({
    productName: "Blue Polo",
    category: "",
    quantity: 12,
    sellingPrice: 450,
    transactionType: "stock-in",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.data.isPending, false);
});

test("retention deletes only completed photos after the configured age", () => {
  const now = new Date("2026-07-24T12:00:00.000Z");
  const complete = {
    productName: "Blue Polo",
    isTemporaryName: false,
    quantity: 2,
    sellingPrice: 450,
    transactionType: "stock-in",
    completedAtIso: "2026-07-22T11:59:59.000Z",
  };
  assert.equal(isInventoryPhotoEligibleForDeletion(complete, 2, now), true);
  assert.equal(
    isInventoryPhotoEligibleForDeletion(
      { ...complete, completedAtIso: "2026-07-23T12:00:00.000Z" },
      2,
      now
    ),
    false
  );
  assert.equal(
    isInventoryPhotoEligibleForDeletion(
      { ...complete, isTemporaryName: true },
      2,
      now
    ),
    false
  );
});

test("normalizes a complete edit payload", () => {
  assert.deepEqual(
    parseInventoryPhotoUpdate({
      productName: "Blue Polo",
      category: "Polo",
      quantity: "12",
      sellingPrice: "450",
      transactionType: "stock-in",
      notes: "Rack A",
    }),
    {
      ok: true,
      data: {
        productName: "Blue Polo",
        isTemporaryName: false,
        category: "Polo",
        quantity: 12,
        sellingPrice: 450,
        transactionType: "stock-in",
        notes: "Rack A",
        isPending: false,
      },
    }
  );
});
