/** Existing, image-safe job visuals only. No garment rendering or image synthesis. */
export type PrintJobVisual = {
  url: string;
  name: string;
  side: "front" | "back" | "other";
  kind: "mockup" | "artwork";
};
export const MAX_PRINT_JOB_VISUALS = 64;

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const rows = (value: unknown) => Array.isArray(value) ? value.map(record) : [];
const positive = (value: unknown) => (typeof value === "number" || typeof value === "string" && value.trim()) && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
const imageExtension = /\.(?:png|jpe?g|webp|gif|avif|svg|bmp|ico)$/i;
const nonImageExtension = /\.(?:pdf|ai|eps|ps|psd|tiff?|heic|heif|docx?|xlsx?|pptx?|txt|csv|html?|xml|zip|rar|7z|mp4|mov|webm)$/i;
const imageMime = /^image\/(?:png|jpe?g|pjpeg|webp|gif|avif|svg\+xml|bmp|x-ms-bmp|vnd\.microsoft\.icon|x-icon)$/;

function safeUrl(value: unknown): string {
  const url = text(value);
  if (!url || /[\\\u0000-\u001f\u007f]/.test(url)) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? url : "";
  } catch { return ""; }
}

function imageUrl(urlValue: unknown, filename: unknown, contentType: unknown): string {
  const url = safeUrl(urlValue);
  if (!url) return "";
  let pathname = "";
  try { pathname = decodeURIComponent(new URL(url, "https://local.invalid").pathname); }
  catch { return ""; }
  const mime = text(contentType).toLowerCase().split(";", 1)[0].trim();
  if (nonImageExtension.test(text(filename)) || nonImageExtension.test(pathname)) return "";
  if (mime && !imageMime.test(mime) && !["application/octet-stream", "binary/octet-stream"].includes(mime)) return "";
  return imageMime.test(mime) || imageExtension.test(text(filename)) || imageExtension.test(pathname) ? url : "";
}

function namedSide(...values: unknown[]): PrintJobVisual["side"] {
  const names = values.map(text).join(" ");
  const front = /(?:^|[^a-z0-9])front(?:[^a-z0-9]|$)/i.test(names);
  const back = /(?:^|[^a-z0-9])back(?:[^a-z0-9]|$)/i.test(names);
  return front !== back ? front ? "front" : "back" : "other";
}

function briefArtworkSide(file: RecordValue, brief: RecordValue): PrintJobVisual["side"] {
  const filenames = [text(file.originalFilename), text(file.filename), text(file.name)].filter(Boolean);
  const matches = rows(brief.artwork).flatMap((artwork) => rows(artwork.files))
    .filter((entry) => filenames.includes(text(entry.filename)))
    .map((entry) => text(entry.side));
  for (const side of ["front", "back"] as const) {
    if (filenames.includes(text(record(brief.artworkFiles)[side]))) matches.push(side);
  }
  return namedSide(...matches);
}

function addVisual(list: PrintJobVisual[], visual: PrintJobVisual) {
  const duplicate = list.find((entry) => entry.url === visual.url);
  if (duplicate) {
    // Conflicting claims about the same image cannot prove one garment side.
    if (duplicate.side !== visual.side) duplicate.side = "other";
    return;
  }
  if (list.length < MAX_PRINT_JOB_VISUALS) list.push(visual);
}

/**
 * PremiumDesignStudioClient saves finalMockups.front/back and final-mockup /
 * print-artwork attachments. QuoteForm also records artwork.files side metadata.
 * productImages are undecorated garment bases; frontLogo/backLogo are booleans.
 * None of those fields may substitute for an actual saved final mockup.
 */
export function buildPrintJobVisuals(rawQuote: unknown): { mockups: PrintJobVisual[]; artworks: PrintJobVisual[] } {
  const quote = record(rawQuote), brief = record(quote.designBrief), finalMockups = record(brief.finalMockups);
  const attachments = Array.isArray(quote.attachments) && quote.attachments.length ? rows(quote.attachments) : quote.attachment ? [record(quote.attachment)] : [];
  const mockups: PrintJobVisual[] = [], artworks: PrintJobVisual[] = [];
  for (const file of attachments) {
    const filename = text(file.filename) || text(file.name), originalFilename = text(file.originalFilename);
    const linkedSides = (["front", "back"] as const).filter((side) => safeUrl(finalMockups[side]) && safeUrl(finalMockups[side]) === safeUrl(file.url));
    const isMockup = file.role === "final-mockup" || file.role !== "print-artwork" && (linkedSides.length > 0 || /(?:^|[^a-z0-9])final[\s_-]*mockup(?:[^a-z0-9]|$)/i.test([file.label, filename, originalFilename].map(text).join(" ")));
    const current = imageUrl(file.url, filename, file.contentType);
    const original = imageUrl(file.originalUrl, originalFilename, file.originalContentType);
    const url = isMockup ? current || original : original || current;
    if (!url) continue;
    const explicitSide = text(file.side);
    const sideMetadata = [file.label, filename, originalFilename, file.description];
    const side = explicitSide === "front" || explicitSide === "back" ? explicitSide
      : linkedSides.length ? namedSide(...linkedSides)
      : namedSide(...sideMetadata);
    const hasNamedSide = /(?:^|[^a-z0-9])(?:front|back)(?:[^a-z0-9]|$)/i.test(sideMetadata.map(text).join(" "));
    const resolvedSide = side === "other" && !isMockup && !hasNamedSide ? briefArtworkSide(file, brief) : side;
    const kind = isMockup ? "mockup" : "artwork";
    const name = text(file.label) || (url === original ? originalFilename : filename) || (isMockup ? "Final mockup" : "Artwork");
    addVisual(isMockup ? mockups : artworks, { url, name, side: resolvedSide, kind });
  }
  for (const side of ["front", "back"] as const) {
    // Current attachment is authoritative if a saved brief still references an
    // older render. Preserve every attachment, adding only absent-side fallbacks.
    if (mockups.some((entry) => entry.side === side)) continue;
    const matchingAttachments = attachments.filter((file) => safeUrl(file.url) && safeUrl(file.url) === safeUrl(finalMockups[side]));
    // A known non-image or explicitly designated logo cannot become a garment
    // render just because the brief repeats its URL without the file metadata.
    if (matchingAttachments.some((file) => file.role === "print-artwork" || !imageUrl(file.url, file.filename || file.name, file.contentType))) continue;
    // This persisted schema is generated by renderDesignStudioMockup as PNG.
    // Explicit non-image URL extensions still fail validation.
    const url = imageUrl(finalMockups[side], "", "image/png");
    if (url) addVisual(mockups, { url, name: `${side === "front" ? "Front" : "Back"} final mockup`, side, kind: "mockup" });
  }
  const sideOrder = { front: 0, back: 1, other: 2 };
  mockups.sort((a, b) => sideOrder[a.side] - sideOrder[b.side]);
  artworks.sort((a, b) => sideOrder[a.side] - sideOrder[b.side]);
  return { mockups, artworks };
}

/** A short product / colour / size line from structured garment evidence. */
export function buildPrintJobGarmentSummary(rawQuote: unknown): string {
  const quote = record(rawQuote), brief = record(quote.designBrief), garments = rows(quote.garments);
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
  const concise = (values: string[], limit: number) => [...values.slice(0, limit), ...(values.length > limit ? [`+${values.length - limit} more`] : [])].join(", ");
  const products = unique(garments.map((row) => text(row.garment) || text(row.product)));
  const colors = unique(garments.map((row) => text(row.color) || text(row.colour)));
  if (!products.length && text(brief.product)) products.push(text(brief.product));
  if (!colors.length && (text(brief.color) || text(brief.colour))) colors.push(text(brief.color) || text(brief.colour));
  const sizeRows = garments.some((row) => text(row.size) && positive(row.quantity)) ? garments : rows(brief.selectedSizes);
  const sizeTotals = new Map<string, number>();
  for (const row of sizeRows) {
    const size = text(row.size), quantity = positive(row.quantity);
    if (size && quantity) sizeTotals.set(size, (sizeTotals.get(size) || 0) + quantity);
  }
  return [concise(products, 3), concise(colors, 3), concise([...sizeTotals].map(([size, quantity]) => `${size} × ${quantity}`), 6)].filter(Boolean).join(" · ");
}
