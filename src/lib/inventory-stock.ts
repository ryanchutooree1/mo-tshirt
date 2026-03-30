import { normalizeSizeLabel, SIZE_ORDER, sortSizes } from "@/lib/shops";

export const INVENTORY_SIZE_ORDER = SIZE_ORDER;

function toNonNegativeInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

export function normalizeInventorySizeMap(
  input: Record<string, unknown> | null | undefined,
  options?: { includeDefaultSizes?: boolean }
) {
  const sizes = new Map<string, number>();

  Object.entries(input || {}).forEach(([rawSize, rawQty]) => {
    const size = normalizeSizeLabel(rawSize);
    if (!size) return;
    sizes.set(size, (sizes.get(size) || 0) + toNonNegativeInt(rawQty));
  });

  if (options?.includeDefaultSizes) {
    INVENTORY_SIZE_ORDER.forEach((size) => {
      if (!sizes.has(size)) sizes.set(size, 0);
    });
  }

  return Object.fromEntries(
    sortSizes(Array.from(sizes.keys())).map((size) => [size, sizes.get(size) || 0])
  ) as Record<string, number>;
}

export function normalizeInventoryMinMap(
  input: Record<string, unknown> | null | undefined,
  options?: { includeDefaultSizes?: boolean; defaultMin?: number }
) {
  const defaultMin = options?.defaultMin ?? 0;
  const mins = new Map<string, number>();

  Object.entries(input || {}).forEach(([rawSize, rawValue]) => {
    const size = normalizeSizeLabel(rawSize);
    if (!size) return;
    const value = toNonNegativeInt(rawValue, defaultMin);
    mins.set(size, mins.has(size) ? Math.max(mins.get(size) || 0, value) : value);
  });

  if (options?.includeDefaultSizes) {
    INVENTORY_SIZE_ORDER.forEach((size) => {
      if (!mins.has(size)) mins.set(size, defaultMin);
    });
  }

  return Object.fromEntries(
    sortSizes(Array.from(mins.keys())).map((size) => [size, mins.get(size) || 0])
  ) as Record<string, number>;
}

export function normalizeInventoryColors(
  input: unknown,
  options?: { includeDefaultSizes?: boolean; defaultMin?: number }
) {
  if (!Array.isArray(input)) return [];

  return input
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null
    )
    .map((entry) => {
      const sizes = normalizeInventorySizeMap(
        entry.sizes as Record<string, unknown> | undefined,
        options
      );
      const minStock = normalizeInventoryMinMap(
        entry.minStock as Record<string, unknown> | undefined,
        options
      );

      return {
        ...entry,
        color: String(entry.color || "Color"),
        sizes,
        minStock: Object.keys(minStock).length ? minStock : undefined,
      };
    });
}
