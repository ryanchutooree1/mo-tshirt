import sharp from "sharp";
import { createHash } from "node:crypto";
import { collection, doc, getDocs, limit, query, runTransaction, where, type Transaction } from "firebase/firestore";
import { db } from "./firebase";
import { storePublicUploadBuffer } from "./public-upload-store";
import { HandoffError, getHandoffRecord, handoffHash, record, text, type HandoffActor } from "./print-job-handoff";
import { buildProductionPacket, productionFileFilter, productionJobEligibility, productionPacketFingerprint, productionSpecsFromPacket, type ProductionOrder } from "./production-packet";

// Fits the hosted multipart request limit, including its small metadata envelope.
export const MAX_PRODUCTION_ARTWORK_BYTES = 4 * 1024 * 1024;
export const MAX_PRODUCTION_ARTWORK_REQUEST_BYTES = MAX_PRODUCTION_ARTWORK_BYTES + 16 * 1024;
export type ProductionArtworkUploadInput = {
  requestId: string; expectedVersion: number; packetFingerprint: string;
  role: "print-artwork"; filename: string; contentType: string; buffer: Buffer;
};
type Upload = Awaited<ReturnType<typeof storePublicUploadBuffer>>;

export async function validateProductionArtworkFile(filename: string, contentType: string, buffer: Buffer) {
  if (!filename || filename.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(filename)) throw new HandoffError("Use a simple artwork filename of at most 180 characters.");
  if (/(?:payment|receipt|bank|invoice|proof|reçu|recu)/i.test(filename)) throw new HandoffError("Use a clearly named print-artwork file; payment evidence cannot be added here.");
  if (!buffer.length || buffer.length > MAX_PRODUCTION_ARTWORK_BYTES) throw new HandoffError("Choose a non-empty print file no larger than 4MB.", 413);
  const mime = contentType.toLowerCase();
  const png = /\.png$/i.test(filename) && mime === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = /\.jpe?g$/i.test(filename) && mime === "image/jpeg" && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const webp = /\.webp$/i.test(filename) && mime === "image/webp" && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  const pdf = /\.pdf$/i.test(filename) && mime === "application/pdf" && /^%PDF-1\.[0-7]|^%PDF-2\.0/.test(buffer.toString("ascii", 0, 8)) && /%%EOF\s*$/.test(buffer.toString("latin1", Math.max(0, buffer.length - 1024)));
  if (!png && !jpeg && !webp && !pdf) throw new HandoffError("Use a PNG, JPG, WEBP or PDF whose contents match its file type.", 415);
  if (!pdf) {
    try {
      const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: "warning" });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height || (metadata.pages || 1) !== 1) throw new Error("Invalid artwork image");
      await image.stats(); // Decode for validation only; never write a transformed file.
    } catch { throw new HandoffError("This image is damaged, animated or too large to decode safely. Export a valid still PNG, JPG or WEBP.", 415); }
  }
  if (pdf) {
    // Originals are not rewritten. Reject executable/encrypted content and hidden
    // object streams rather than trying to sanitize an inline-served source file.
    const names = buffer.toString("latin1").replace(/#([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    if (/\/(?:JavaScript|JS|Launch|OpenAction|AA|EmbeddedFiles?|RichMedia|XFA|Encrypt|ObjStm)\b/i.test(names)) throw new HandoffError("Export a flattened PDF without scripts, embedded files or encrypted/object-stream content, or use PNG/JPG/WEBP.", 415);
  }
}

function validId(id: string) { return Boolean(id && id.length <= 180 && !/[\/\\\u0000-\u001f]/.test(id) && id !== "." && id !== ".."); }
async function linkedOrder(id: string, quote: Record<string, unknown>, transaction: Transaction): Promise<ProductionOrder | undefined> {
  const explicit = text(quote.orderTransactionId);
  if (validId(explicit)) {
    const snapshot = await transaction.get(doc(db, "transactions", explicit));
    if (snapshot.exists() && (!snapshot.data().quoteId || snapshot.data().quoteId === id)) return { id: explicit, data: snapshot.data() };
  }
  const matches = await getDocs(query(collection(db, "transactions"), where("quoteId", "==", id), limit(1)));
  const reverseId = matches.docs[0]?.id;
  if (reverseId) {
    const snapshot = await transaction.get(doc(db, "transactions", reverseId));
    if (snapshot.exists() && snapshot.data().quoteId === id) return { id: reverseId, data: snapshot.data() };
  }
}
function assertEditable(id: string, quote: Record<string, unknown>, input: ProductionArtworkUploadInput, order?: ProductionOrder) {
  const stored = getHandoffRecord(quote), eligibility = productionJobEligibility(id, quote, order);
  if (!eligibility.activeJob || eligibility.reopenRequired) throw new HandoffError("Reopen and review this job before adding print files.", 409);
  if (quote.productionRelease || stored.delivery?.state === "sending" || stored.delivery?.state === "unknown" || stored.delivery?.state === "sent" && stored.delivery.mode === "live") throw new HandoffError("This job is released, sending or unconfirmed. Review its existing handoff before changing files.", 409);
  if (stored.version !== input.expectedVersion || productionPacketFingerprint(buildProductionPacket(id, quote)) !== input.packetFingerprint) throw new HandoffError("The job or production packet changed. Reload before adding a print file.", 409);
  if (!productionFileFilter(quote).allowed({ filename: input.filename, originalFilename: input.filename, role: "print-artwork" })) throw new HandoffError("This file matches payment evidence saved on the job. Choose an original print-artwork file.");
  if (Array.isArray(quote.attachments) && quote.attachments.length >= 12) throw new HandoffError("This job already has 12 files. Review its existing originals before adding more.", 409);
}
function result(id: string, quote: Record<string, unknown>, input: ProductionArtworkUploadInput, upload: Upload, replayed: boolean) {
  const packet = buildProductionPacket(id, quote), file = packet.artworks.find(file => file.source?.url === upload.url);
  if (!file) throw new HandoffError("The uploaded source is no longer in this job. Reload and review its files.", 409);
  return { ok: true, quoteId: id, requestId: input.requestId, uploadId: upload.uploadId, fileKey: file.key, version: getHandoffRecord(quote).version, packetFingerprint: productionPacketFingerprint(packet), replayed };
}

export async function addProductionArtwork(id: string, input: ProductionArtworkUploadInput, actor: HandoffActor) {
  if (!validId(id)) throw new HandoffError("Invalid quote ID.");
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(input.requestId) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || !/^[a-f0-9]{64}$/.test(input.packetFingerprint) || input.role !== "print-artwork") throw new HandoffError("Reload the job and explicitly choose a print-artwork file.");
  await validateProductionArtworkFile(input.filename, input.contentType, input.buffer);
  const sourceHash = createHash("sha256").update(input.buffer).digest("hex");
  const inputHash = handoffHash({ requestId: input.requestId, expectedVersion: input.expectedVersion, packetFingerprint: input.packetFingerprint, role: input.role, filename: input.filename, contentType: input.contentType, sourceHash });
  const ref = doc(db, "quotes", id), operation = doc(db, "quotes", id, "handoffEvents", `artwork-${input.requestId}`);
  const atIso = new Date().toISOString();
  const reservation = await runTransaction(db, async transaction => {
    const [snapshot, previous] = await Promise.all([transaction.get(ref), transaction.get(operation)]);
    if (!snapshot.exists()) throw new HandoffError("Quotation not found.", 404);
    const quote = snapshot.data(), existing = previous.data();
    if (existing) {
      if (existing.inputHash !== inputHash || record(existing.actor).userId !== actor.userId) throw new HandoffError("This upload request ID was already used for a different file or user.", 409);
      if (existing.state === "attached") return { response: result(id, quote, input, existing.upload as Upload, true), upload: null, reserved: false };
      if (existing.state !== "stored") throw new HandoffError("This upload is still in progress or unconfirmed. Keep this request; reload and check the job before adding another file.", 409);
    }
    assertEditable(id, quote, input, await linkedOrder(id, quote, transaction));
    if (!existing) transaction.set(operation, { action: "add-print-artwork", state: "uploading", inputHash, sourceHash, actor, atIso });
    return { response: null, upload: existing?.upload as Upload | undefined, reserved: !existing };
  });
  if (reservation.response) return reservation.response;
  let upload = reservation.upload;
  if (reservation.reserved) {
    // Storage has its own random ID. Reserve before calling it, then persist the
    // returned ID before attachment; a replay never starts a second source upload.
    upload = await storePublicUploadBuffer({ buffer: input.buffer, filename: input.filename, contentType: input.contentType, size: input.buffer.length, sessionId: handoffHash({ id, requestId: input.requestId }).slice(0, 32), sessionPrefix: "production-artwork", source: "production-workspace-original", maxUploadBytes: MAX_PRODUCTION_ARTWORK_BYTES });
    const saved = upload;
    await runTransaction(db, async transaction => {
      const previous = await transaction.get(operation), current = previous.data();
      if (current?.inputHash !== inputHash || current.state !== "uploading") throw new HandoffError("The upload record changed. Reload and check the job before trying again.", 409);
      transaction.update(operation, { state: "stored", upload: saved });
    });
  }
  if (!upload) throw new HandoffError("The source upload could not be confirmed. Reload and review this job.", 409);
  const savedUpload = upload;
  return runTransaction(db, async transaction => {
    const [snapshot, previous] = await Promise.all([transaction.get(ref), transaction.get(operation)]);
    if (!snapshot.exists()) throw new HandoffError("Quotation not found.", 404);
    const quote = snapshot.data(), current = previous.data();
    if (current?.inputHash !== inputHash || record(current.actor).userId !== actor.userId) throw new HandoffError("The upload record changed. Reload this job.", 409);
    if (current.state === "attached") return result(id, quote, input, savedUpload, true);
    if (current.state !== "stored") throw new HandoffError("The source upload is not confirmed.", 409);
    assertEditable(id, quote, input, await linkedOrder(id, quote, transaction));
    const attachments = Array.isArray(quote.attachments) && quote.attachments.length ? quote.attachments : quote.attachment ? [quote.attachment] : [];
    const source = { ...savedUpload, role: "print-artwork", label: savedUpload.filename, originalUrl: savedUpload.url, originalUploadId: savedUpload.uploadId, originalFilename: savedUpload.filename, originalContentType: savedUpload.contentType, originalSize: savedUpload.size, originalProvenance: "staff-upload", source: "production-workspace-original", uploadedBy: actor, uploadRequestId: input.requestId, sourceSha256: sourceHash };
    const stored = getHandoffRecord(quote);
    const next = { ...quote, attachments: [...attachments, source], printJobHandoff: { ...stored, version: stored.version + 1, preview: null, priceConfirmation: null } };
    const packet = buildProductionPacket(id, next), artwork = packet.artworks.find(file => file.source?.url === savedUpload.url);
    if (!artwork) throw new HandoffError("This filename is reserved for payment evidence. Choose a clearly named print-artwork file.", 400);
    // Explicitly blank new file specifications so legacy/global dimensions cannot
    // silently approve a new original. Existing per-file settings stay intact.
    const previousSpecs = new Map(productionSpecsFromPacket(buildProductionPacket(id, quote)).artworks.map(file => [file.fileKey, file]));
    const specs = productionSpecsFromPacket(packet);
    specs.artworks = specs.artworks.map(file => file.fileKey === artwork.key ? { ...file, useForPrint: true, selectedVariant: "source", targetProductIndexes: packet.products.length === 1 ? [0] : [], placement: "", widthCm: null, heightCm: null } : previousSpecs.get(file.fileKey) || file);
    const finalQuote = { ...next, productionSpecs: specs };
    transaction.update(ref, { attachments: finalQuote.attachments, productionSpecs: specs, printJobHandoff: finalQuote.printJobHandoff });
    transaction.update(operation, { state: "attached", completedAtIso: new Date().toISOString(), previousPriceConfirmation: stored.priceConfirmation, version: finalQuote.printJobHandoff.version, fileKey: artwork.key });
    return result(id, finalQuote, input, savedUpload, false);
  });
}
