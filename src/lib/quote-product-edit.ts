import { buildAutomaticQuotePricing, getAutomaticDeliveryFee } from "./quote-auto-pricing.js";

export type EditActor = { userId: string; displayName: string; email: string };
export type ProductEditRow = {
  id: string;
  garment: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  lineIndex: number | null;
};
export type EditLock = { token: string; actor: EditActor; expiresAt: number };
export type QuoteEditData = Record<string, unknown>;
export const EDIT_LEASE_MS = 15 * 60 * 1000;
export class QuoteEditError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const rowsOf = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(object) : [];
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const number = (value: unknown) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;
const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}
export function productVersion(data: QuoteEditData) {
  return canonical({
    garments: data.garments,
    quantity: data.quantity,
    printMethod: data.printMethod,
    quote: data.quote,
    designSizes: object(data.designBrief).selectedSizes,
  });
}
export function getProductEditor(data: QuoteEditData) {
  const quote = object(data.quote);
  const lines = rowsOf(quote.lines);
  const garments = rowsOf(data.garments);
  const automatic = buildAutomaticQuotePricing({
    garments,
    printMethod: data.printMethod,
    designBrief: data.designBrief,
    delivery: data.delivery,
  });
  const used = new Set<number>();
  const rows: ProductEditRow[] = garments.map((garment, index) => {
    const id = text(garment.id) || `garment-${index}`;
    let lineIndex = lines.findIndex(
      (line, i) =>
        !used.has(i) &&
        (line.productLineId === id ||
          text(line.description).startsWith(
            `${text(garment.garment)} (${[text(garment.color), text(garment.size)].filter(Boolean).join(" / ")})`,
          )),
    );
    // Old quotations generated one billing row per garment, in the same order.
    if (lineIndex < 0 && lines.length === garments.length && !used.has(index))
      lineIndex = index;
    if (lineIndex >= 0) used.add(lineIndex);
    return {
      id,
      garment: text(garment.garment),
      color: text(garment.color),
      size: text(garment.size),
      quantity: number(garment.quantity),
      unitPrice:
        lineIndex >= 0
          ? number(lines[lineIndex].unitPrice)
          : number(automatic.lines[index]?.unitPrice),
      lineIndex: lineIndex >= 0 ? lineIndex : null,
    };
  });
  return {
    rows,
    printMethod:
      text(data.printMethod) || text(object(data.designBrief).printMethod),
    quoteLines: lines,
    version: productVersion(data),
    total: number(quote.total),
    lock: (data.productEditLock || null) as EditLock | null,
  };
}
export function activeEditLock(
  data: QuoteEditData,
  now: number,
): EditLock | null {
  const lock = data.productEditLock as EditLock | undefined;
  return lock && lock.expiresAt > now ? lock : null;
}
export function assertEditLock(
  data: QuoteEditData,
  actor: EditActor,
  token: string,
  now: number,
) {
  const lock = activeEditLock(data, now);
  if (!lock || lock.actor.userId !== actor.userId || lock.token !== token)
    throw new QuoteEditError(
      "Your editing lock expired or belongs to another editor. Unlock again to continue.",
      409,
    );
}
export function validateProductRows(
  value: unknown,
  lineCount: number,
): ProductEditRow[] {
  if (!Array.isArray(value) || !value.length || value.length > 50)
    throw new QuoteEditError("Add between 1 and 50 product rows.");
  const ids = new Set<string>();
  const linked = new Set<number>();
  return value.map((input) => {
    const row = object(input);
    const id = text(row.id),
      garment = text(row.garment),
      color = text(row.color),
      size = text(row.size);
    const quantity = Number(row.quantity),
      unitPrice = Number(row.unitPrice);
    const lineIndex = row.lineIndex === null ? null : Number(row.lineIndex);
    if (
      !id ||
      id.length > 100 ||
      ids.has(id) ||
      !garment ||
      garment.length > 200 ||
      !size ||
      size.length > 80 ||
      color.length > 100
    )
      throw new QuoteEditError(
        "Each product needs a unique row, a product name and a size.",
      );
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 100000 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0 ||
      unitPrice > 10000000
    )
      throw new QuoteEditError(
        "Enter a positive whole quantity and a valid unit price.",
      );
    if (
      lineIndex !== null &&
      (!Number.isInteger(lineIndex) ||
        lineIndex < 0 ||
        lineIndex >= lineCount ||
        linked.has(lineIndex))
    )
      throw new QuoteEditError(
        "Each quotation line can be linked to only one product.",
      );
    ids.add(id);
    if (lineIndex !== null) linked.add(lineIndex);
    return {
      id,
      garment,
      color,
      size,
      quantity,
      unitPrice: money(unitPrice),
      lineIndex,
    };
  });
}
export function recalculateDocument(quote: Record<string, unknown>) {
  const lines = rowsOf(quote.lines);
  const subtotal = money(
    lines.reduce(
      (sum, line) => sum + number(line.quantity) * number(line.unitPrice),
      0,
    ),
  );
  const total = money(
    Math.max(0, subtotal + number(quote.deliveryFee) - number(quote.discount)),
  );
  return { ...quote, lines, subtotal, total };
}
function productFields(
  data: QuoteEditData,
  garments: Record<string, unknown>[],
  printMethod: string,
  quote: Record<string, unknown>,
) {
  const totalQty = garments.reduce((n, row) => n + number(row.quantity), 0);
  const sizes: Record<string, number> = {};
  for (const row of garments)
    sizes[text(row.size)] = (sizes[text(row.size)] || 0) + number(row.quantity);
  const products = [...new Set(garments.map((row) => text(row.garment)))].join(
    ", ",
  );
  const color = [
    ...new Set(garments.map((row) => text(row.color)).filter(Boolean)),
  ].join(", ");
  return {
    garments,
    quantity: totalQty,
    garment: products,
    color,
    size: Object.keys(sizes).length === 1 ? Object.keys(sizes)[0] : "Mixed",
    printMethod,
    designBrief: {
      ...object(data.designBrief),
      product: products,
      color,
      colour: color,
      printMethod,
      sizes,
      selectedSizes: Object.entries(sizes).map(([size, quantity]) => ({
        size,
        quantity,
      })),
      totalQty,
      estimatedTotal: quote.total,
    },
    quote,
  };
}
export function buildProductCorrection(
  data: QuoteEditData,
  input: unknown,
  actor: EditActor,
  atIso: string,
) {
  const body = object(input);
  const previous = getProductEditor(data);
  const stored = object(data.quote);
  const rows = validateProductRows(body.rows, previous.quoteLines.length);
  const printMethod = text(body.printMethod);
  if (!printMethod || printMethod.length > 200)
    throw new QuoteEditError("Enter the printing method.");
  const mapped = new Map(
    rows
      .filter((row) => row.lineIndex !== null)
      .map((row) => [row.lineIndex!, row]),
  );
  const removed = new Set(
    previous.rows
      .filter(
        (row) =>
          !rows.some(
            (next) => next.id === row.id && next.lineIndex === row.lineIndex,
          ),
      )
      .map((row) => row.lineIndex),
  );
  const billingRow = (
    row: ProductEditRow,
    old: Record<string, unknown> = {},
  ) => ({
    ...old,
    productLineId: row.id,
    description: `${row.garment} (${[row.color, row.size].filter(Boolean).join(" / ")}) — ${printMethod}`,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    includeInTotals: true,
    ...(number(old.unitPrice) !== row.unitPrice
      ? {
          priceSource: "manual",
          priceSetById: actor.userId,
          priceSetByName: actor.displayName,
          priceSetAtIso: atIso,
        }
      : {}),
  });
  const lines = previous.quoteLines.flatMap((line, index) =>
    mapped.has(index)
      ? [billingRow(mapped.get(index)!, line)]
      : removed.has(index)
        ? []
        : [line],
  );
  lines.push(
    ...rows
      .filter((row) => row.lineIndex === null)
      .map((row) => billingRow(row)),
  );
  const defaults = {
    documentType: "quotation",
    currency: "Rs",
    showLineItems: true,
    showTotals: true,
    deliveryFee: data.quote ? 0 : getAutomaticDeliveryFee(data.delivery),
    discount: 0,
    amountReceived: 0,
  };
  const quote = recalculateDocument({ ...defaults, ...stored, lines });
  const garments = rows.map(({ lineIndex, unitPrice, ...row }) => {
    void lineIndex;
    void unitPrice;
    return {
      ...rowsOf(data.garments).find(
        (old, index) => (text(old.id) || `garment-${index}`) === row.id,
      ),
      ...row,
    };
  });
  return productFields(data, garments, printMethod, quote);
}
export function editSnapshot(data: QuoteEditData) {
  return {
    garments: rowsOf(data.garments),
    printMethod: text(data.printMethod),
    quantity: number(data.quantity),
    quote: object(data.quote),
  };
}
export function changedFields(
  before: unknown,
  after: unknown,
  path = "",
): { field: string; before: unknown; after: unknown }[] {
  if (canonical(before) === canonical(after)) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const left = object(before),
      right = object(after);
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap(
      (key) =>
        changedFields(left[key], right[key], path ? `${path}.${key}` : key),
    );
  }
  return [{ field: path, before: before ?? null, after: after ?? null }];
}
export function synchronizeDocumentQuantities(
  data: QuoteEditData,
  quote: Record<string, unknown>,
) {
  const lines = rowsOf(quote.lines);
  const editor = getProductEditor(data);
  const oldLines = rowsOf(object(data.quote).lines);
  const garments = rowsOf(data.garments).map((garment, index) => {
    const row = editor.rows[index];
    const line =
      lines.find((line) => line.productLineId === row.id) ||
      (row.lineIndex !== null &&
      lines.length === oldLines.length &&
      lines[row.lineIndex]?.description === oldLines[row.lineIndex]?.description
        ? lines[row.lineIndex]
        : null);
    return line &&
      Number.isSafeInteger(Number(line.quantity)) &&
      Number(line.quantity) > 0
      ? { ...garment, id: row.id, quantity: Number(line.quantity) }
      : garment;
  });
  return garments.length
    ? productFields(data, garments, editor.printMethod, quote)
    : { quote };
}

// Sharing compares document content; server-owned price attribution is not rendered.
export function documentContentVersion(value: unknown) {
  const quote = recalculateDocument(object(value));
  return canonical({
    ...quote,
    lines: quote.lines.map((line) =>
      Object.fromEntries(
        Object.entries(line).filter(
          ([key]) =>
            ![
              "priceSource",
              "priceSetById",
              "priceSetByName",
              "priceSetAtIso",
            ].includes(key),
        ),
      ),
    ),
  });
}
