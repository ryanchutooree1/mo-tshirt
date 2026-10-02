import type { IntakeItem } from "./email-intake-model";

/** A product row must identify one actual garment size. Never infer how a mixed
 * free-text size list should be split. A single explicit size/count is accepted
 * only when that count agrees with the row quantity. */
export function enquiryProductionSize(item: IntakeItem): string {
  const raw = item.sizes.trim().replace(/[–—]/g, "-");
  const counted = raw.match(/^(.+?)\s*[×x]\s*(\d+)$/i);
  if (counted && Number(counted[2]) !== item.quantity) return "";
  const size = (counted ? counted[1] : raw).trim();
  return /^(?:[2-9]?X{0,3}[SL]|M|[1-9]\d?(?:-[1-9]\d?)?|one[ -]size(?: fits all)?|OS|OSFA|[1-9]\d?\s*(?:y|yrs|years|ans|months|mois))$/i.test(size) ? size : "";
}

export function enquiryProductionBlockers(items: IntakeItem[]) {
  return items.flatMap((item, index) => enquiryProductionSize(item) ? [] : [`Product ${index + 1}: record one size per row, with its exact quantity (use “One size” where appropriate)`]);
}

export function enquiryProductionGarments(items: IntakeItem[]) {
  return items.map(item => ({ garment: item.product, color: item.colour, size: enquiryProductionSize(item), quantity: item.quantity, printMethod: item.printMethod, printPlacement: item.placement, artworkInstructions: item.artwork }));
}
