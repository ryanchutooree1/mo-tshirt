/** Prices for plain garments only. Do not use this policy for printing charges. */
export const POLO_MATERIALS = [
  { id: "cotton-double-pique", label: "Cotton double piqué", price: 450 },
  { id: "polyester", label: "Polyester", price: 350 },
  { id: "cotton-single-pique", label: "Cotton single piqué", price: 375 },
] as const;

export type PoloMaterial = (typeof POLO_MATERIALS)[number]["id"];
type PricingProduct = { title: string; poloMaterial?: PoloMaterial | null };

function key(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function parsePoloMaterial(value: unknown): PoloMaterial | null {
  return POLO_MATERIALS.find(({ id }) => id === value)?.id ?? null;
}

export function getPlainPricingClass(title: string): "tee" | "polo" | "other" {
  const name = key(title);
  if (/\b(long\s*sleeves?|custom(?:ized|ised)?|print(?:ed|ing)|embroidere[dy]|uniforms?)\b/.test(name)) return "other";
  if (/\b(?:polo ?shirt|polo)\b/.test(name)) return "polo";
  if (/\b(?:plain)\b/.test(name) && /\b(?:t ?shirts?|tees?)\b/.test(name)) return "tee";
  return "other";
}

export function getVerifiedPoloMaterial(item: PricingProduct): PoloMaterial | null {
  if (getPlainPricingClass(item.title) !== "polo") return null;
  const name = key(item.title);
  // A title is evidence only if it explicitly states the material and piqué type.
  const titleMatches = POLO_MATERIALS.filter(({ id }) => {
    if (id === "polyester") return /\bpolyester\b/.test(name);
    return /\bcotton\b/.test(name) && (id === "cotton-double-pique"
      ? /\bdouble pique\b/.test(name) : /\bsingle pique\b/.test(name));
  });
  const explicit = parsePoloMaterial(item.poloMaterial);
  if (titleMatches.length > 1 || (explicit && titleMatches[0] && titleMatches[0].id !== explicit)) return null;
  return explicit ?? titleMatches[0]?.id ?? null;
}

const STANDARD_ADULT = new Set(["XS", "S", "M", "L", "XL"]);
const EXTENDED_ADULT = new Set(["2XL", "3XL", "4XL", "XXL", "XXXL", "XXXXL"]);

export function getPlainTeePrice(size: string): number | null {
  const adult = size.trim().toUpperCase().replace(/\s+/g, "");
  if (STANDARD_ADULT.has(adult)) return 200;
  if (EXTENDED_ADULT.has(adult)) return 300;
  const ages = key(size).match(/^(?:age )?(\d{1,2})\s*(?:yr|yrs|year|years)(?: old)?$/);
  const age = ages ? Number(ages[1]) : 0;
  return age >= 1 && age <= 14 ? 150 : null;
}

// undefined means outside the change; null means this garment/size needs review.
export function resolvePlainCustomerPrice(item: PricingProduct, size: string): number | null | undefined {
  const kind = getPlainPricingClass(item.title);
  if (kind === "tee") return getPlainTeePrice(size);
  if (kind === "polo") return POLO_MATERIALS.find(({ id }) => id === getVerifiedPoloMaterial(item))?.price ?? null;
  return undefined;
}
