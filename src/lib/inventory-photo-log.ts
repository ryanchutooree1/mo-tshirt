export const INVENTORY_PHOTO_LOG_COLLECTION = "inventoryPhotoLog";
export const INVENTORY_PHOTO_UPLOADS_COLLECTION = "inventoryPhotoLogUploads";
export const INVENTORY_PHOTO_SYSTEM_COLLECTION = "inventoryPhotoLogSystem";

export type InventoryTransactionType = "stock-in" | "stock-out";

export type InventoryPhotoLogItem = {
  id: string;
  uploadId: string;
  imageUrl: string;
  thumbnailUrl: string;
  productName: string;
  isTemporaryName: boolean;
  category: string;
  quantity: number | null;
  sellingPrice: number | null;
  transactionType: InventoryTransactionType | null;
  notes: string;
  photoTakenAt: string | null;
  photoTakenAtRaw: string | null;
  uploadedAt: string;
  updatedAt: string;
  isPending: boolean;
};

type ExifDateTime = {
  normalized: string;
  raw: string;
};

type ParsedInventoryPhotoUpdate = {
  productName: string;
  isTemporaryName: boolean;
  category: string;
  quantity: number | null;
  sellingPrice: number | null;
  transactionType: InventoryTransactionType | null;
  notes: string;
  isPending: boolean;
};

const EXIF_DATE_TIME_ORIGINAL = 0x9003;
const EXIF_DATE_TIME_DIGITIZED = 0x9004;
const EXIF_OFFSET_TIME = 0x9010;
const EXIF_OFFSET_TIME_ORIGINAL = 0x9011;
const EXIF_OFFSET_TIME_DIGITIZED = 0x9012;
const TIFF_DATE_TIME = 0x0132;
const TIFF_EXIF_IFD_POINTER = 0x8769;

function cleanString(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function readAscii(
  buffer: Buffer,
  tiffStart: number,
  entryOffset: number,
  littleEndian: boolean
) {
  const readUInt16 = littleEndian
    ? buffer.readUInt16LE.bind(buffer)
    : buffer.readUInt16BE.bind(buffer);
  const readUInt32 = littleEndian
    ? buffer.readUInt32LE.bind(buffer)
    : buffer.readUInt32BE.bind(buffer);
  const type = readUInt16(entryOffset + 2);
  const count = readUInt32(entryOffset + 4);
  if (type !== 2 || count < 2 || count > 128) return "";

  const valueOffset =
    count <= 4 ? entryOffset + 8 : tiffStart + readUInt32(entryOffset + 8);
  if (valueOffset < 0 || valueOffset + count > buffer.length) return "";

  return buffer
    .subarray(valueOffset, valueOffset + count)
    .toString("ascii")
    .replace(/\0+$/, "")
    .trim();
}

function readIfd(
  buffer: Buffer,
  tiffStart: number,
  relativeOffset: number,
  littleEndian: boolean
) {
  const readUInt16 = littleEndian
    ? buffer.readUInt16LE.bind(buffer)
    : buffer.readUInt16BE.bind(buffer);
  const readUInt32 = littleEndian
    ? buffer.readUInt32LE.bind(buffer)
    : buffer.readUInt32BE.bind(buffer);
  const directoryOffset = tiffStart + relativeOffset;
  if (directoryOffset < 0 || directoryOffset + 2 > buffer.length) return null;

  const entryCount = readUInt16(directoryOffset);
  if (entryCount > 256 || directoryOffset + 2 + entryCount * 12 > buffer.length) {
    return null;
  }

  const values = new Map<number, string>();
  let exifIfdOffset: number | null = null;

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = directoryOffset + 2 + index * 12;
    const tag = readUInt16(entryOffset);
    if (tag === TIFF_EXIF_IFD_POINTER) {
      exifIfdOffset = readUInt32(entryOffset + 8);
      continue;
    }

    if (
      tag === TIFF_DATE_TIME ||
      tag === EXIF_DATE_TIME_ORIGINAL ||
      tag === EXIF_DATE_TIME_DIGITIZED ||
      tag === EXIF_OFFSET_TIME ||
      tag === EXIF_OFFSET_TIME_ORIGINAL ||
      tag === EXIF_OFFSET_TIME_DIGITIZED
    ) {
      const value = readAscii(buffer, tiffStart, entryOffset, littleEndian);
      if (value) values.set(tag, value);
    }
  }

  return { values, exifIfdOffset };
}

function normalizeExifDateTime(raw: string, offset: string) {
  const match = raw.match(
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const normalizedOffset = /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : "";
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${normalizedOffset}`;
}

export function parseExifDateTime(exifBuffer: Buffer | Uint8Array | null | undefined) {
  if (!exifBuffer?.byteLength) return null;

  const buffer = Buffer.isBuffer(exifBuffer)
    ? exifBuffer
    : Buffer.from(exifBuffer);
  const hasExifHeader =
    buffer.length >= 6 && buffer.subarray(0, 6).toString("binary") === "Exif\u0000\u0000";
  const tiffStart = hasExifHeader ? 6 : 0;
  if (buffer.length < tiffStart + 8) return null;

  const byteOrder = buffer.subarray(tiffStart, tiffStart + 2).toString("ascii");
  const littleEndian = byteOrder === "II";
  if (!littleEndian && byteOrder !== "MM") return null;

  const readUInt16 = littleEndian
    ? buffer.readUInt16LE.bind(buffer)
    : buffer.readUInt16BE.bind(buffer);
  const readUInt32 = littleEndian
    ? buffer.readUInt32LE.bind(buffer)
    : buffer.readUInt32BE.bind(buffer);
  if (readUInt16(tiffStart + 2) !== 42) return null;

  const firstIfd = readIfd(
    buffer,
    tiffStart,
    readUInt32(tiffStart + 4),
    littleEndian
  );
  if (!firstIfd) return null;

  const exifIfd =
    firstIfd.exifIfdOffset === null
      ? null
      : readIfd(buffer, tiffStart, firstIfd.exifIfdOffset, littleEndian);

  const original =
    exifIfd?.values.get(EXIF_DATE_TIME_ORIGINAL) ||
    exifIfd?.values.get(EXIF_DATE_TIME_DIGITIZED) ||
    firstIfd.values.get(TIFF_DATE_TIME) ||
    "";
  if (!original) return null;

  const offset =
    exifIfd?.values.get(EXIF_OFFSET_TIME_ORIGINAL) ||
    exifIfd?.values.get(EXIF_OFFSET_TIME_DIGITIZED) ||
    exifIfd?.values.get(EXIF_OFFSET_TIME) ||
    "";
  const normalized = normalizeExifDateTime(original, offset);
  if (!normalized) return null;

  return { normalized, raw: original } satisfies ExifDateTime;
}

export function getInventoryPhotoPendingState(input: {
  productName?: unknown;
  isTemporaryName?: unknown;
  category?: unknown;
  quantity?: unknown;
  sellingPrice?: unknown;
  transactionType?: unknown;
}) {
  return (
    Boolean(input.isTemporaryName) ||
    !cleanString(input.productName) ||
    !cleanString(input.category) ||
    !Number.isFinite(input.quantity) ||
    !Number.isFinite(input.sellingPrice) ||
    (input.transactionType !== "stock-in" &&
      input.transactionType !== "stock-out")
  );
}

function parseOptionalNonNegativeNumber(
  value: unknown,
  label: string,
  options?: { integer?: boolean }
) {
  if (value === null || value === undefined || value === "") {
    return { ok: true as const, value: null };
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

export function parseInventoryPhotoUpdate(
  body: unknown
):
  | { ok: true; data: ParsedInventoryPhotoUpdate }
  | { ok: false; error: string } {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const productName = cleanString(payload.productName, 160);
  if (!productName) {
    return { ok: false, error: "Product name is required." };
  }

  const quantity = parseOptionalNonNegativeNumber(payload.quantity, "Quantity", {
    integer: true,
  });
  if (!quantity.ok) return quantity;

  const sellingPrice = parseOptionalNonNegativeNumber(
    payload.sellingPrice,
    "Selling price"
  );
  if (!sellingPrice.ok) return sellingPrice;

  const rawTransactionType = cleanString(payload.transactionType, 20);
  const transactionType: InventoryTransactionType | null =
    rawTransactionType === "stock-in" || rawTransactionType === "stock-out"
      ? rawTransactionType
      : null;
  if (rawTransactionType && !transactionType) {
    return { ok: false, error: "Choose Stock In or Stock Out." };
  }

  const isTemporaryName = /^Unsorted Item \d+$/i.test(productName);
  const baseData = {
    productName,
    isTemporaryName,
    category: cleanString(payload.category, 100),
    quantity: quantity.value,
    sellingPrice: sellingPrice.value,
    transactionType,
    notes: cleanString(payload.notes, 2000),
  };
  const data: ParsedInventoryPhotoUpdate = {
    ...baseData,
    isPending: getInventoryPhotoPendingState(baseData),
  };

  return { ok: true, data };
}

export function mapInventoryPhotoLogItem(
  id: string,
  data: Record<string, unknown>
): InventoryPhotoLogItem {
  const uploadId = cleanString(data.uploadId, 160);
  const imageBase = `/api/admin/inventory-photo-log/uploads/${encodeURIComponent(uploadId)}`;
  const uploadedAt =
    cleanString(data.uploadedAtIso, 80) || new Date(0).toISOString();

  return {
    id,
    uploadId,
    imageUrl: imageBase,
    thumbnailUrl: `${imageBase}?variant=thumbnail`,
    productName: cleanString(data.productName, 160) || "Unsorted Item",
    isTemporaryName: Boolean(data.isTemporaryName),
    category: cleanString(data.category, 100),
    quantity: Number.isFinite(data.quantity) ? Number(data.quantity) : null,
    sellingPrice: Number.isFinite(data.sellingPrice)
      ? Number(data.sellingPrice)
      : null,
    transactionType:
      data.transactionType === "stock-in" ||
      data.transactionType === "stock-out"
        ? data.transactionType
        : null,
    notes: cleanString(data.notes, 2000),
    photoTakenAt: cleanString(data.photoTakenAt, 80) || null,
    photoTakenAtRaw: cleanString(data.photoTakenAtRaw, 80) || null,
    uploadedAt,
    updatedAt: cleanString(data.updatedAtIso, 80) || uploadedAt,
    isPending: getInventoryPhotoPendingState(data),
  };
}
