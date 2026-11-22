import sharp from "sharp";
import { createHash } from "node:crypto";
import { collection, doc, getDocs, limit, query, runTransaction, where, type Transaction } from "firebase/firestore";
import { db } from "./firebase";
import { storePublicUploadBuffer } from "./public-upload-store";
import { HandoffError, getHandoffRecord, handoffHash, record, text, type HandoffActor } from "./print-job-handoff";
import { buildProductionPacket, productionFileFilter, productionJobEligibility, productionPacketFingerprint, type ProductionOrder } from "./production-packet";

export const MAX_FINAL_MOCKUP_BYTES = 4 * 1024 * 1024;
export const MAX_FINAL_MOCKUP_REQUEST_BYTES = MAX_FINAL_MOCKUP_BYTES + 16 * 1024;
export type FinalMockupSide = "front" | "back";
export type FinalMockupUploadInput = {
  requestId: string;
  side: FinalMockupSide;
  filename: string;
  contentType: string;
  buffer: Buffer;
};

type Upload = Awaited<ReturnType<typeof storePublicUploadBuffer>>;

function validId(id: string) {
  return Boolean(id && id.length <= 180 && !/[\/\\\u0000-\u001f]/.test(id) && id !== "." && id !== "..");
}

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

function assertMutable(id: string, quote: Record<string, unknown>, order?: ProductionOrder) {
  const handoff = getHandoffRecord(quote);
  const delivery = record(handoff.delivery);
  const eligibility = productionJobEligibility(id, quote, order);
  if (!eligibility.activeJob || eligibility.reopenRequired) {
    throw new HandoffError("Reopen and review this job before adding a final mockup.", 409);
  }
  if (
    quote.productionRelease ||
    delivery.state === "sending" ||
    delivery.state === "unknown" ||
    delivery.state === "sent" && delivery.mode === "live"
  ) {
    throw new HandoffError("This job is released, sending or unconfirmed. Review the production handoff before changing its final mockup.", 409);
  }
}

function isCurrentMockup(quote: Record<string, unknown>, input: FinalMockupUploadInput, upload: Upload) {
  const briefUrl = text(record(record(quote.designBrief).finalMockups)[input.side]);
  const attachments = Array.isArray(quote.attachments) && quote.attachments.length ? quote.attachments : quote.attachment ? [quote.attachment] : [];
  return briefUrl === upload.url && attachments.some(value => {
    const file = record(value);
    return file.role === "final-mockup" && file.side === input.side && text(file.url) === upload.url && (!upload.uploadId || !file.uploadId || text(file.uploadId) === upload.uploadId);
  });
}

export async function validateFinalMockupFile(filename: string, contentType: string, buffer: Buffer) {
  if (!filename || filename.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(filename)) {
    throw new HandoffError("Use a simple mockup filename of at most 180 characters.");
  }
  if (/(?:payment|receipt|bank|invoice|proof|reçu|recu)/i.test(filename)) {
    throw new HandoffError("Choose a final mockup image, not a payment or invoice document.");
  }
  if (!buffer.length || buffer.length > MAX_FINAL_MOCKUP_BYTES) {
    throw new HandoffError("Choose a non-empty mockup image no larger than 4MB.", 413);
  }
  const mime = contentType.toLowerCase();
  const png = /\.png$/i.test(filename) && mime === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = /\.jpe?g$/i.test(filename) && mime === "image/jpeg" && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const webp = /\.webp$/i.test(filename) && mime === "image/webp" && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp) {
    throw new HandoffError("Use a PNG, JPG or WEBP image whose contents match its file type.", 415);
  }
  try {
    const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages || 1) !== 1) throw new Error("Invalid mockup image");
    await image.stats();
  } catch {
    throw new HandoffError("This mockup is damaged, animated or too large to decode safely. Export a valid still PNG, JPG or WEBP.", 415);
  }
}

function responseAttachment(upload: Upload, side: FinalMockupSide) {
  return {
    uploadId: upload.uploadId,
    url: upload.url,
    filename: upload.filename,
    contentType: upload.contentType,
    size: upload.size,
    uploadedAt: upload.uploadedAt,
    role: "final-mockup" as const,
    side,
    label: `${side === "front" ? "Front" : "Back"} final mockup`,
  };
}

function result(id: string, input: FinalMockupUploadInput, upload: Upload, replayed: boolean) {
  return { ok: true, quoteId: id, requestId: input.requestId, side: input.side, attachment: responseAttachment(upload, input.side), replayed };
}

export async function addFinalMockup(id: string, input: FinalMockupUploadInput, actor: HandoffActor) {
  if (!validId(id)) throw new HandoffError("Invalid quote ID.");
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(input.requestId) || !["front", "back"].includes(input.side)) {
    throw new HandoffError("Choose the front or back mockup and retry the upload.");
  }
  await validateFinalMockupFile(input.filename, input.contentType, input.buffer);
  const sourceHash = createHash("sha256").update(input.buffer).digest("hex");
  const inputHash = handoffHash({ requestId: input.requestId, side: input.side, filename: input.filename, contentType: input.contentType, sourceHash });
  const quoteRef = doc(db, "quotes", id);
  const operationRef = doc(db, "quotes", id, "handoffEvents", `mockup-${input.requestId}`);
  const atIso = new Date().toISOString();

  const reservation = await runTransaction(db, async transaction => {
    const [snapshot, previous] = await Promise.all([transaction.get(quoteRef), transaction.get(operationRef)]);
    if (!snapshot.exists()) throw new HandoffError("Quotation not found.", 404);
    const quote = snapshot.data(), existing = previous.data();
    if (existing) {
      if (existing.inputHash !== inputHash || record(existing.actor).userId !== actor.userId) {
        throw new HandoffError("This upload request ID was already used for a different mockup or user.", 409);
      }
      if (existing.state === "attached") {
        const existingUpload = existing.upload as Upload;
        if (!isCurrentMockup(quote, input, existingUpload)) throw new HandoffError("This upload was replaced by a newer mockup. Reload the job before trying again.", 409);
        return { response: result(id, input, existingUpload, true), upload: null, reserved: false };
      }
      if (existing.state !== "stored") throw new HandoffError("This mockup upload is still in progress or unconfirmed. Retry the same request after checking the job.", 409);
    }
    assertMutable(id, quote, await linkedOrder(id, quote, transaction));
    if (!productionFileFilter(quote).allowed({ filename: input.filename, role: "final-mockup" })) {
      throw new HandoffError("This file matches payment evidence saved on the job. Choose a clearly named final mockup.");
    }
    if (!existing) transaction.set(operationRef, { action: "add-final-mockup", state: "uploading", inputHash, sourceHash, side: input.side, actor, atIso });
    return { response: null, upload: existing?.upload as Upload | undefined, reserved: !existing };
  });
  if (reservation.response) return reservation.response;

  let upload = reservation.upload;
  if (reservation.reserved) {
    upload = await storePublicUploadBuffer({
      buffer: input.buffer,
      filename: input.filename,
      contentType: input.contentType,
      size: input.buffer.length,
      sessionId: handoffHash({ id, requestId: input.requestId }).slice(0, 32),
      sessionPrefix: "final-mockup",
      source: "admin-final-mockup",
      maxUploadBytes: MAX_FINAL_MOCKUP_BYTES,
    });
    const saved = upload;
    await runTransaction(db, async transaction => {
      const previous = await transaction.get(operationRef), current = previous.data();
      if (current?.inputHash !== inputHash || current.state !== "uploading") {
        throw new HandoffError("The upload record changed. Reload and check the job before trying again.", 409);
      }
      transaction.update(operationRef, { state: "stored", upload: saved });
    });
  }
  if (!upload) throw new HandoffError("The mockup upload could not be confirmed. Reload and review this job.", 409);

  const savedUpload = upload;
  return runTransaction(db, async transaction => {
    const [snapshot, previous] = await Promise.all([transaction.get(quoteRef), transaction.get(operationRef)]);
    if (!snapshot.exists()) throw new HandoffError("Quotation not found.", 404);
    const quote = snapshot.data(), current = previous.data();
    if (current?.inputHash !== inputHash || record(current.actor).userId !== actor.userId) {
      throw new HandoffError("The upload record changed. Reload this job.", 409);
    }
    if (current.state === "attached") {
      if (!isCurrentMockup(quote, input, savedUpload)) throw new HandoffError("This upload was replaced by a newer mockup. Reload the job before trying again.", 409);
      return result(id, input, savedUpload, true);
    }
    if (current.state !== "stored") throw new HandoffError("The mockup upload is not confirmed.", 409);
    assertMutable(id, quote, await linkedOrder(id, quote, transaction));
    if (!productionFileFilter(quote).allowed({ filename: input.filename, role: "final-mockup", url: savedUpload.url, uploadId: savedUpload.uploadId })) {
      throw new HandoffError("This file matches payment evidence saved on the job. Choose a clearly named final mockup.");
    }

    const existingAttachments = Array.isArray(quote.attachments) && quote.attachments.length ? quote.attachments : quote.attachment ? [quote.attachment] : [];
    const brief = record(quote.designBrief), finalMockups = record(brief.finalMockups);
    const previousSideUrl = text(finalMockups[input.side]);
    const retainedAttachments = existingAttachments.filter(value => {
      const file = record(value);
      if (file.role !== "final-mockup") return true;
      return file.side !== input.side && (!previousSideUrl || text(file.url) !== previousSideUrl);
    });
    if (retainedAttachments.length >= 12) throw new HandoffError("This job already has 12 files. Review its existing files before adding a final mockup.", 409);
    const attachment = {
      ...responseAttachment(savedUpload, input.side),
      description: `${input.side === "front" ? "Front" : "Back"} final mockup attached by the team`,
      source: "admin-final-mockup",
      uploadedBy: actor,
      uploadRequestId: input.requestId,
      sourceSha256: sourceHash,
    };
    const attachments = [...retainedAttachments, attachment];
    const designBrief = { ...brief, finalMockups: { ...finalMockups, [input.side]: savedUpload.url } };
    const stored = getHandoffRecord(quote);
    const packetFingerprint = productionPacketFingerprint(buildProductionPacket(id, { ...quote, attachments, designBrief }));
    const priceConfirmation = record(stored.priceConfirmation).packetFingerprint === packetFingerprint ? stored.priceConfirmation : null;
    const printJobHandoff = { ...stored, version: stored.version + 1, preview: null, priceConfirmation };
    transaction.update(quoteRef, { attachments, designBrief, printJobHandoff });
    transaction.update(operationRef, { state: "attached", completedAtIso: new Date().toISOString(), upload: savedUpload });
    return result(id, input, savedUpload, false);
  });
}
