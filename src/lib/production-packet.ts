import { createHash } from "node:crypto";
import { buildPrintJobs, safePrintJobUrl } from "./print-job-workflow";

/** Production-only data. Do not add customer, price, payment or delivery-address fields. */
export type ProductionProduct = { product: string; color: string; size: string; quantity: number | null };
export type ProductionFile = { url: string; name: string; contentType: string; sizeBytes: number | null; provenance: string };
export type ProductionArtwork = { key: string; label: string; side: "front" | "back" | "other"; source: ProductionFile | null; processed: ProductionFile | null; useForPrint: boolean; selectedVariant: "source" | "processed"; targetProductIndexes: number[]; selectedFile: ProductionFile | null; placement: string; widthCm: number | null; heightCm: number | null };
export type ProductionSpecs = { version: 1; printMethod: string; deadline: string; artworks: { fileKey: string; useForPrint: boolean; selectedVariant: "source" | "processed"; targetProductIndexes: number[]; placement: string; widthCm: number | null; heightCm: number | null }[] };
export type ProductionPacket = { version: 1; quoteId: string; reference: string; products: ProductionProduct[]; quantity: number | null; printMethod: string; deadline: { date: string | null; label: string }; artworks: ProductionArtwork[]; mockups: { key: string; label: string; side: "front" | "back" | "other"; file: ProductionFile }[] };
export type ProductionRelease = { version: 1; id: string; partnerId: "yan"; state: "released"; mode: "live"; requestId: string; previewId: string; previewFingerprint: string; packetFingerprint: string; packet: ProductionPacket; priceConfirmationId: string; paymentRecordId: string; pricingFingerprint: string; lifecycleFingerprint: string; releasedAtIso: string; messageId: string };
export type ProductionOrder = { id: string; data: Record<string, unknown> };
const rec = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const txt = (value: unknown) => typeof value === "string" ? value.trim() : "";
const line = (value: unknown, max = 500) => txt(value).replace(/[\r\n\u0000-\u001f]+/g, " ").slice(0, max);
const rows = (value: unknown) => Array.isArray(value) ? value.map(rec) : [];
const finite = (value: unknown): number | null => (typeof value === "number" || typeof value === "string" && value.trim() !== "") && Number.isFinite(Number(value)) ? Number(value) : null;
const money = (value: number) => Math.round((value + Number.EPSILON) * 100);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}
export const productionHash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
/** Only the selected production files cross the admin review boundary. */
export function approvedProductionPacket(packet: ProductionPacket): ProductionPacket { return { ...packet, artworks: isPlainProductionMethod(packet.printMethod) ? [] : packet.artworks.filter(file => file.useForPrint) }; }
export const productionPacketFingerprint = (packet: ProductionPacket) => productionHash(approvedProductionPacket(packet));
function calendarDate(value: string) { const time = Date.parse(`${value}T12:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value; }
export function isPlainProductionMethod(value: string) { return /^(?:plain|blank|none|no print(?:ing)?|no customi[sz]ation|sans impression|sans personnalisation|plain \(no print(?:ing)?\))$/i.test(value.trim().replace(/\s+/g, " ")); }
function dimensions(raw: Record<string, unknown>) {
  let widthCm = finite(raw.widthCm), heightCm = finite(raw.heightCm);
  const saved = txt(raw.printDimensions) || txt(raw.printSize);
  const match = saved.match(/^\s*(\d+(?:\.\d+)?)\s*(?:cm)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(cm|mm)\s*$/i);
  if (widthCm === null && heightCm === null && match) { const divisor = match[3].toLowerCase() === "mm" ? 10 : 1; widthCm = Number(match[1]) / divisor; heightCm = Number(match[2]) / divisor; }
  return { widthCm, heightCm };
}
function fileMetadata(raw: Record<string, unknown>, original = false): ProductionFile | null {
  const url = safePrintJobUrl(original ? raw.originalUrl : raw.url);
  if (!url) return null;
  return { url, name: line(original ? raw.originalFilename : raw.filename || raw.name) || "Artwork", contentType: line(original ? raw.originalContentType : raw.contentType, 150), sizeBytes: finite(original ? raw.originalSize : raw.size), provenance: original && raw.originalProvenance === "client-upload" ? "client-upload" : original ? "saved-original" : "saved-file" };
}
export function isUsableProductionFile(file: ProductionFile | null): boolean {
  if (!file || !safePrintJobUrl(file.url) || file.sizeBytes !== null && file.sizeBytes <= 0) return false;
  let pathname = "";
  try { pathname = decodeURIComponent(new URL(file.url, "https://local.invalid").pathname); } catch { return false; }
  const supported = /\.(?:png|jpe?g|webp|svg|pdf|ai|eps|psd|tiff?)$/i;
  const unsupported = /\.(?:docx?|xlsx?|pptx?|txt|csv|html?|xml|zip|rar|7z|mp4|mov|webm)$/i;
  const mime = file.contentType.toLowerCase().split(";", 1)[0].trim();
  if (unsupported.test(file.name) || unsupported.test(pathname)) return false;
  if (mime && !/^(?:image\/(?:png|jpe?g|webp|svg\+xml|tiff|vnd\.adobe\.photoshop)|application\/(?:pdf|postscript|illustrator|octet-stream))$/.test(mime)) return false;
  return supported.test(file.name) || supported.test(pathname) || /^(?:image\/(?:png|jpe?g|webp|svg\+xml|tiff)|application\/(?:pdf|postscript|illustrator))$/.test(mime);
}
function artworkTargets(target: Record<string, unknown>, products: ProductionProduct[]): number[] {
  const product = txt(target.product || target.garment), color = txt(target.color || target.colour), size = txt(target.size), quantity = finite(target.quantity);
  if (!product && !color && !size) return products.length === 1 && (quantity === null || quantity === products[0].quantity) ? [0] : [];
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const indexes = products.flatMap((row, index) => (!product || same(row.product, product)) && (!color || same(row.color, color)) && (!size || same(row.size, size)) ? [index] : []);
  if (!indexes.length || quantity !== null && quantity !== indexes.reduce((sum, index) => sum + (products[index].quantity || 0), 0)) return [];
  return indexes;
}
/** Payment evidence must never become artwork, including duplicate URLs or renamed uploads. */
export function productionFileFilter(quote: Record<string, unknown>) {
  const privateValues = new Set<string>();
  const collect = (value: unknown, depth = 0) => {
    if (depth > 8) return;
    if (Array.isArray(value)) { value.forEach(item => collect(item, depth + 1)); return; }
    for (const [key, child] of Object.entries(rec(value))) {
      if (typeof child === "string" && /(?:url|id|filename|name)$/i.test(key) && child.trim()) privateValues.add(child.trim());
      else if (child && typeof child === "object") collect(child, depth + 1);
    }
  };
  [quote.paymentEvidence, quote.paymentReceipt, quote.paymentReceipts, rec(quote.quote).paymentEvidence, rec(quote.quote).paymentReceipt].forEach(value => collect(value));
  const financial = /(?:payment|receipt|bank|invoice|proof|reçu|recu)/i;
  const isPrivateUrl = (value: unknown) => { const url = txt(value); if (!url) return false; if (privateValues.has(url)) return true; return [...privateValues].some(privateValue => { if (!safePrintJobUrl(privateValue)) return false; try { return new URL(url, "https://local.invalid").pathname === new URL(privateValue, "https://local.invalid").pathname; } catch { return false; } }); };
  const allowed = (file: Record<string, unknown>) => !financial.test([file.role, file.label, file.filename, file.originalFilename, file.name].map(txt).join(" ")) && ![file.url, file.originalUrl].some(isPrivateUrl) && ![file.id, file.uploadId, file.originalUploadId, file.filename, file.originalFilename].some(value => txt(value) && privateValues.has(txt(value)));
  const attachments = Array.isArray(quote.attachments) && quote.attachments.length ? rows(quote.attachments) : quote.attachment ? [rec(quote.attachment)] : [];
  // Block both variants and aliases before visual fallbacks run. Otherwise a
  // finalMockups URL could resurrect a filtered receipt without its role/name.
  let previousSize = -1;
  while (previousSize !== privateValues.size) {
    previousSize = privateValues.size;
    for (const file of attachments.filter(file => !allowed(file))) for (const url of [file.url, file.originalUrl].map(txt).filter(Boolean)) privateValues.add(url);
  }
  return { isPrivateUrl, allowed };
}
/** Existing source files are authoritative. Overrides only supply production specifications. */
export function buildProductionPacket(quoteId: string, quote: Record<string, unknown>): ProductionPacket {
  const privateFiles = productionFileFilter(quote);
  const rawFiles = (Array.isArray(quote.attachments) && quote.attachments.length ? rows(quote.attachments) : quote.attachment ? [rec(quote.attachment)] : []).filter(privateFiles.allowed);
  const brief = rec(quote.designBrief), specs = rec(quote.productionSpecs), hasSpecs = specs.version === 1;
  const finalMockups = Object.fromEntries(Object.entries(rec(brief.finalMockups)).filter(([, url]) => !privateFiles.isPrivateUrl(url)));
  const [job] = buildPrintJobs([{ id: quoteId, data: { ...quote, attachments: rawFiles, attachment: null, designBrief: { ...brief, finalMockups } } }], []);
  const products = (job.details?.products || []).map(row => ({ product: line(row.description), color: line(row.color), size: line(row.size), quantity: row.quantity }));
  const mockupUrls = new Set(job.mockups.map(file => file.url));
  const artworks: ProductionArtwork[] = [];
  for (const raw of rawFiles) {
    const source = fileMetadata(raw, true) || fileMetadata(raw), current = fileMetadata(raw);
    if (!source && !current) continue;
    const fileNames = [raw.label, raw.filename, raw.originalFilename].map(txt).join(" ");
    const isMockup = raw.role === "final-mockup" || raw.role !== "print-artwork" && (mockupUrls.has(current?.url || "") || /(?:^|[^a-z0-9])(?:final[\s_-]*)?mockup(?:[^a-z0-9]|$)/i.test(fileNames));
    if (isMockup) continue;
    const key = `file-${productionHash({ source: source?.url || "", current: current?.url || "" }).slice(0, 24)}`;
    if (artworks.some(file => file.key === key)) continue;
    const visual = job.artworks.find(file => file.url === source?.url || file.url === current?.url);
    const rawSide = txt(raw.side), side = rawSide === "front" || rawSide === "back" ? rawSide : visual?.side || "other";
    const linked = rows(brief.artwork).filter(row => rows(row.files).some(file => [txt(raw.filename), txt(raw.originalFilename)].filter(Boolean).includes(txt(file.filename))));
    const override = rows(specs.artworks).find(row => row.fileKey === key);
    const fallback = linked.length === 1 ? linked[0] : raw;
    // A single global specification can describe one print file, never every file by assumption.
    const global = rawFiles.filter(file => file.role !== "final-mockup" && !mockupUrls.has(safePrintJobUrl(file.url))).length === 1 ? { ...brief, ...quote } : {};
    const measured = override ? dimensions(override) : dimensions(Object.keys(dimensions(fallback)).some(k => dimensions(fallback)[k as "widthCm" | "heightCm"] !== null) ? fallback : global);
    const processed = source && current && source.url !== current.url ? { ...current, provenance: line(raw.backgroundRemovalMethod, 100) || "processed-file" } : null;
    const selectedVariant = override?.selectedVariant === "processed" ? "processed" as const : "source" as const;
    const useForPrint = override ? override.useForPrint === true : raw.role === "print-artwork" || Boolean(visual) && isUsableProductionFile(source);
    const targetProductIndexes = override ? Array.isArray(override.targetProductIndexes) ? override.targetProductIndexes.filter((value): value is number => typeof value === "number") : [] : artworkTargets(fallback, products);
    artworks.push({ key, useForPrint, selectedVariant, targetProductIndexes, selectedFile: useForPrint ? selectedVariant === "processed" ? processed : source : null, label: line(raw.label || raw.filename || raw.originalFilename) || "Print artwork", side, source, processed, placement: line(override ? override.placement : raw.printPlacement || raw.placement || fallback.printPlacement || global.printPlacement || rec(quote.partner).printPlacement), ...measured });
  }
  const mockups = job.mockups.map(file => { const raw = rawFiles.find(row => safePrintJobUrl(row.url) === file.url || safePrintJobUrl(row.originalUrl) === file.url); return { key: `mockup-${productionHash(file.url).slice(0, 24)}`, label: line(file.name), side: file.side, file: { url: file.url, name: line(raw?.filename || file.name), contentType: line(raw?.contentType) || "image/png", sizeBytes: finite(raw?.size), provenance: "final-mockup" } }; });
  const deadline = line(hasSpecs ? specs.deadline : quote.deadline || brief.deadline, 100);
  return { version: 1, quoteId, reference: line(job.reference, 120), products, quantity: products.length && products.every(row => row.quantity !== null && Number.isSafeInteger(row.quantity) && row.quantity > 0) ? products.reduce((sum, row) => sum + (row.quantity || 0), 0) : null, printMethod: line(hasSpecs ? specs.printMethod : quote.printMethod || brief.printMethod || job.details?.printMethod), deadline: { date: calendarDate(deadline) ? deadline : null, label: calendarDate(deadline) ? deadline : deadline ? `Unconfirmed: ${deadline}` : "Not provided" }, artworks, mockups };
}
export function productionPacketReadiness(packet: ProductionPacket): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!packet.products.length || packet.products.some(row => !row.product || !row.color || !row.size || /^mixed$|^n\/?a$|^unknown$/i.test(row.size) || row.quantity === null || !Number.isSafeInteger(row.quantity) || row.quantity <= 0)) blockers.push("Confirm each product, colour, size and positive whole-piece quantity before handoff.");
  if (!packet.printMethod || /^(?:not sure|unknown|to confirm|not_set|undecided|tbd)$/i.test(packet.printMethod)) blockers.push("Confirm the production print method, or explicitly select no printing.");
  if (!isPlainProductionMethod(packet.printMethod)) {
    if (!packet.artworks.some(file => file.useForPrint && isUsableProductionFile(file.selectedFile))) blockers.push("This printed job needs a recorded usable print-artwork file; a mockup alone cannot be printed.");
    for (const file of packet.artworks.filter(file => file.useForPrint)) {
      if (!isUsableProductionFile(file.selectedFile)) { blockers.push(`Replace or remove the unusable print file: ${file.label}.`); continue; }
      if (!file.targetProductIndexes.length || new Set(file.targetProductIndexes).size !== file.targetProductIndexes.length || file.targetProductIndexes.some(index => !Number.isSafeInteger(index) || index < 0 || index >= packet.products.length)) blockers.push(`Confirm the complete garment rows that receive ${file.label}.`);
      if (!file.placement || /^(?:not_set|unknown|to confirm)$/i.test(file.placement)) blockers.push(`Confirm the print placement for ${file.label}.`);
      if (file.widthCm === null || file.heightCm === null || file.widthCm <= 0 || file.heightCm <= 0 || file.widthCm > 500 || file.heightCm > 500) blockers.push(`Confirm the physical print width and height in cm for ${file.label}.`);
    }
    if (packet.products.some((_, index) => !packet.artworks.some(file => file.useForPrint && file.targetProductIndexes.includes(index)))) blockers.push("Select a print artwork for every printed garment row, or separate plain items into a plain job.");
  }
  return { ready: blockers.length === 0, blockers };
}
export function productionSpecsFromPacket(packet: ProductionPacket): ProductionSpecs { return { version: 1, printMethod: packet.printMethod, deadline: packet.deadline.date || "", artworks: packet.artworks.map(file => ({ fileKey: file.key, useForPrint: file.useForPrint, selectedVariant: file.selectedVariant, targetProductIndexes: file.targetProductIndexes, placement: file.placement, widthCm: file.widthCm, heightCm: file.heightCm })) }; }
export function validateProductionSpecs(value: unknown): ProductionSpecs {
  const raw = rec(value);
  const reject = () => { throw new Error("Enter valid production rows, print method, date and per-file specifications."); };
  if (raw.version !== 1 || Object.keys(raw).some(key => !["version", "printMethod", "deadline", "artworks"].includes(key)) || !Array.isArray(raw.artworks) || raw.artworks.length > 64) return reject();
  const str = (value: unknown, max = 200) => { if (typeof value !== "string" || value.length > max || /[\u0000-\u001f]/.test(value)) return reject(); return value.trim(); };
  const printMethod = str(raw.printMethod), deadline = str(raw.deadline, 10);
  if (deadline && !calendarDate(deadline)) return reject();
  const artworks = rows(raw.artworks).map(row => { if (Object.keys(row).some(key => !["fileKey", "useForPrint", "selectedVariant", "targetProductIndexes", "placement", "widthCm", "heightCm"].includes(key))) return reject(); const fileKey = str(row.fileKey, 60), placement = str(row.placement), widthCm = finite(row.widthCm), heightCm = finite(row.heightCm); if (!Array.isArray(row.targetProductIndexes) || row.targetProductIndexes.length > 100 || row.targetProductIndexes.some(index => !Number.isSafeInteger(index) || Number(index) < 0 || Number(index) > 99) || new Set(row.targetProductIndexes).size !== row.targetProductIndexes.length || typeof row.useForPrint !== "boolean" || !["source", "processed"].includes(txt(row.selectedVariant)) || !/^file-[a-f0-9]{24}$/.test(fileKey) || [widthCm, heightCm].some(n => n !== null && (n <= 0 || n > 500))) return reject(); return { fileKey, useForPrint: row.useForPrint as boolean, selectedVariant: row.selectedVariant as "source" | "processed", targetProductIndexes: row.targetProductIndexes as number[], placement, widthCm, heightCm }; });
  if (new Set(artworks.map(file => file.fileKey)).size !== artworks.length) return reject();
  return { version: 1, printMethod, deadline, artworks };
}
export function productionQuotePricing(quote: Record<string, unknown>) {
  const draft = rec(quote.quote), quotedTotal = finite(draft.total), currency = txt(draft.currency) || "Rs";
  const lines = rows(draft.lines).map(row => ({ description: txt(row.description), quantity: finite(row.quantity), unitPrice: finite(row.unitPrice), includeInTotals: row.includeInTotals !== false }));
  return { fingerprint: productionHash({ currency, total: quotedTotal, lines, subtotal: finite(draft.subtotal), deliveryFee: finite(draft.deliveryFee), discount: finite(draft.discount), tax: finite(draft.tax), taxRate: finite(draft.taxRate), vatRate: finite(draft.vatRate) }), quotedTotal: quotedTotal !== null ? money(quotedTotal) / 100 : null, currency };
}
function lifecycleTime(value: unknown): string { const raw = rec(value); try { const time = typeof raw.toMillis === "function" ? (raw.toMillis as () => number).call(value) : typeof raw.seconds === "number" ? raw.seconds * 1000 : value instanceof Date ? value.getTime() : Date.parse(txt(value)); return Number.isFinite(time) ? new Date(time).toISOString() : ""; } catch { return ""; } }
function clientEventTime(quote: Record<string, unknown>) { return [lifecycleTime(quote.clientDecisionAtIso), lifecycleTime(quote.clientDecisionAt), ...rows(quote.clientResponseHistory).map(row => lifecycleTime(row.submittedAtIso))].filter(Boolean).sort().at(-1) || ""; }
export function productionLifecycleFingerprint(quote: Record<string, unknown>, order?: ProductionOrder) { const workflow = rec(quote.printJobWorkflow); return productionHash({ clientDecision: txt(quote.clientDecision), clientDecisionAtIso: clientEventTime(quote), clientDecisionComment: txt(quote.clientDecisionComment), adverseResponses: rows(quote.clientResponseHistory).filter(row => ["rejected", "changes_requested"].includes(txt(row.decision)) || ["reject", "changes"].includes(txt(row.action))).map(row => ({ id: txt(row.id), decision: txt(row.decision), action: txt(row.action), atIso: lifecycleTime(row.submittedAtIso), comment: txt(row.comment) })), workflowVersion: workflow.version ?? 0, workflowStage: txt(workflow.stage), workflowAtIso: lifecycleTime(workflow.updatedAtIso), orderId: order?.id || "", orderStatus: txt(order?.data.status).toLowerCase(), orderStatusAtIso: lifecycleTime(order?.data.statusChangedAt) || lifecycleTime(order?.data.statusUpdatedAt) || lifecycleTime(order?.data.workflowDoneAt) }); }
export function productionJobEligibility(quoteId: string, quote: Record<string, unknown>, order?: ProductionOrder) {
  const [job] = buildPrintJobs([{ id: quoteId, data: quote }], order ? [order] : []), workflow = rec(quote.printJobWorkflow), previous = rec(rec(quote.printJobHandoff).priceConfirmation);
  const closed = ["delivered", "cancelled", "canceled"].includes(txt(order?.data.status).toLowerCase()) || job.stage === "completed" || job.stage === "declined";
  const adverse = ["rejected", "changes_requested"].includes(txt(quote.clientDecision)), baseline = job.workflow?.basisSnapshot;
  const reviewed = Boolean(job.workflow && !job.workflowOverridden && baseline?.clientDecision === txt(quote.clientDecision) && baseline.clientEventAtIso === clientEventTime(quote));
  const unreviewed = Boolean(adverse && previous.lifecycleFingerprint && previous.lifecycleFingerprint !== productionLifecycleFingerprint(quote, order) && Number(workflow.version || 0) <= Number(previous.workflowVersionAtAgreement || 0));
  return { activeJob: !closed, reopenRequired: closed || adverse && !reviewed || unreviewed };
}
export function parseProductionRelease(value: unknown): ProductionRelease | null {
  const raw = rec(value), packet = rec(raw.packet);
  if (raw.version !== 1 || raw.partnerId !== "yan" || raw.state !== "released" || raw.mode !== "live" || packet.version !== 1 || !txt(raw.id) || !txt(raw.requestId) || !txt(raw.previewId) || !txt(raw.messageId) || !txt(raw.priceConfirmationId) || !txt(raw.paymentRecordId) || !Number.isFinite(Date.parse(txt(raw.releasedAtIso))) || ![raw.packetFingerprint, raw.previewFingerprint, raw.pricingFingerprint, raw.lifecycleFingerprint].every(v => /^[a-f0-9]{64}$/.test(txt(v)))) return null;
  if (!Array.isArray(packet.products) || !Array.isArray(packet.artworks) || !Array.isArray(packet.mockups) || typeof packet.printMethod !== "string" || typeof rec(packet.deadline).label !== "string" || !txt(packet.quoteId)) return null;
  // Rebuild an allowlisted object instead of passing arbitrary persisted fields to partners.
  const parsed: ProductionPacket = { version: 1, quoteId: txt(packet.quoteId), reference: line(packet.reference, 120), products: rows(packet.products).map(row => ({ product: line(row.product), color: line(row.color), size: line(row.size), quantity: finite(row.quantity) })), quantity: finite(packet.quantity), printMethod: line(packet.printMethod), deadline: { date: calendarDate(txt(rec(packet.deadline).date)) ? txt(rec(packet.deadline).date) : null, label: line(rec(packet.deadline).label, 100) }, artworks: [], mockups: [] };
  const parseFile = (value: unknown): ProductionFile | null => { const file = rec(value), url = safePrintJobUrl(file.url); return url ? { url, name: line(file.name), contentType: line(file.contentType, 150), sizeBytes: finite(file.sizeBytes), provenance: line(file.provenance, 100) } : null; };
  const side = (value: unknown): "front" | "back" | "other" => value === "front" || value === "back" ? value : "other";
  parsed.artworks = rows(packet.artworks).map(file => ({ key: line(file.key), label: line(file.label), side: side(file.side), source: parseFile(file.source), processed: parseFile(file.processed), useForPrint: file.useForPrint === true, selectedVariant: file.selectedVariant === "processed" ? "processed" : "source", targetProductIndexes: Array.isArray(file.targetProductIndexes) ? file.targetProductIndexes.filter((value): value is number => typeof value === "number") : [], selectedFile: parseFile(file.selectedFile), placement: line(file.placement), widthCm: finite(file.widthCm), heightCm: finite(file.heightCm) }));
  parsed.mockups = rows(packet.mockups).flatMap(row => { const file = parseFile(row.file); return file ? [{ key: line(row.key), label: line(row.label), side: side(row.side), file }] : []; });
  parsed.artworks = approvedProductionPacket(parsed).artworks;
  if (productionPacketFingerprint(parsed) !== raw.packetFingerprint) return null;
  return { version: 1, id: txt(raw.id), partnerId: "yan", state: "released", mode: "live", requestId: txt(raw.requestId), previewId: txt(raw.previewId), previewFingerprint: txt(raw.previewFingerprint), packetFingerprint: txt(raw.packetFingerprint), packet: parsed, priceConfirmationId: txt(raw.priceConfirmationId), paymentRecordId: txt(raw.paymentRecordId), pricingFingerprint: txt(raw.pricingFingerprint), lifecycleFingerprint: txt(raw.lifecycleFingerprint), releasedAtIso: txt(raw.releasedAtIso), messageId: txt(raw.messageId) };
}
export function productionReleaseReadiness(quoteId: string, quote: Record<string, unknown>, order?: ProductionOrder) {
  const packet = buildProductionPacket(quoteId, quote), release = parseProductionRelease(quote.productionRelease), blockers: string[] = [];
  const stored = rec(quote.printJobHandoff), price = rec(stored.priceConfirmation), payment = rows(stored.payments).at(-1) || {}, delivery = rec(stored.delivery), pricing = productionQuotePricing(quote), eligibility = productionJobEligibility(quoteId, quote, order);
  if (!release || release.packet.quoteId !== quoteId) blockers.push("A confirmed live production release is required.");
  if (release) {
    if (release.packetFingerprint !== productionPacketFingerprint(packet)) blockers.push("Production specifications or files changed after release. Ask the team to review the released packet.");
    if (delivery.state !== "sent" || delivery.mode !== "live" || delivery.requestId !== release.requestId || delivery.previewFingerprint !== release.previewFingerprint || delivery.messageId !== release.messageId) blockers.push("Live delivery of this release is not confirmed.");
    if (release.priceConfirmationId !== price.id || !rows(stored.payments).some(entry => entry.id === release.paymentRecordId && entry.currency === pricing.currency && finite(entry.amountReceived) !== null && money(Number(entry.amountReceived)) >= Math.ceil(money(pricing.quotedTotal || 0) * 0.5)) || release.pricingFingerprint !== pricing.fingerprint || price.pricingFingerprint !== pricing.fingerprint || price.packetFingerprint !== release.packetFingerprint || price.currency !== pricing.currency || pricing.quotedTotal === null || money(Number(price.agreedTotal)) !== money(pricing.quotedTotal) || price.lifecycleFingerprint !== productionLifecycleFingerprint(quote, order) || release.lifecycleFingerprint !== productionLifecycleFingerprint(quote, order)) blockers.push("The price agreement or approval changed after release.");
  }
  const received = finite(payment.amountReceived);
  if (pricing.quotedTotal === null || pricing.quotedTotal <= 0 || payment.currency !== pricing.currency || received === null || money(received) < Math.ceil(money(pricing.quotedTotal) * 0.5)) blockers.push("At least 50% verified received payment against the current agreed price is required.");
  if (!eligibility.activeJob || eligibility.reopenRequired) blockers.push("This job is closed or needs a renewed approval after client changes.");
  blockers.push(...productionPacketReadiness(packet).blockers);
  return { ready: blockers.length === 0, blockers, release, packet: release?.packet || approvedProductionPacket(packet) };
}
