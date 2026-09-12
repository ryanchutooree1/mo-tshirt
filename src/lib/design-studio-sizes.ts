export const MAX_SIZE_QUANTITY = 9999;

export function reconcileSizeQuantities(available: readonly string[], previous: Record<string, number> = {}) {
  return Object.fromEntries(available.map(size => [size,
    Number.isSafeInteger(previous[size]) && previous[size] > 0
      ? Math.min(previous[size], MAX_SIZE_QUANTITY) : 0,
  ]));
}

export function getStudioSizeSelection(available: readonly string[], quantities: Record<string, number>) {
  const valid = reconcileSizeQuantities(available, quantities);
  const rows = available.filter(size => valid[size] > 0).map(size => ({ size, quantity: valid[size] }));
  return {
    rows,
    total: rows.reduce((sum, row) => sum + row.quantity, 0),
    size: rows.length === 1 ? rows[0].size : "Mixed",
    label: rows.map(row => `${row.size} × ${row.quantity}`).join(", ") || "No sizes selected",
  };
}
