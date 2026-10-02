import { productionReleaseReadiness, productionJobEligibility, type ProductionPacket } from "./production-packet";
import type { PartnerDecision, PartnerProductionStatus } from "./partners";

type LinkedOrder = { id: string; data: Record<string, unknown> };
export type PartnerProductionActor = { userId: string; displayName: string; kind: "partner" | "owner" };
export type PartnerProductionStart = {
  version: 1;
  releaseId: string;
  packetFingerprint: string;
  partnerId: string;
  actor: PartnerProductionActor;
  startedAtIso: string;
  blanksReceived: true;
  products: ProductionPacket["products"];
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const startedStatuses = new Set<PartnerProductionStatus>(["in_progress", "completed", "will_post_tomorrow", "ryan_to_collect"]);

export class PartnerProductionError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export function partnerProductionState(quoteId: string, quote: Record<string, unknown>, partnerId: string, order?: LinkedOrder) {
  const readiness = productionReleaseReadiness(quoteId, quote, order);
  const eligibility = productionJobEligibility(quoteId, quote, order);
  const release = readiness.release;
  const start = record(quote.productionStart);
  const matchingStart = Boolean(release && start.version === 1 && start.releaseId === release.id &&
    start.packetFingerprint === release.packetFingerprint && start.partnerId === partnerId &&
    start.blanksReceived === true && text(start.startedAtIso) && text(record(start.actor).userId) &&
    JSON.stringify(start.products) === JSON.stringify(release.packet.products));
  const blockers = [...readiness.blockers];
  if (release && release.partnerId !== partnerId) blockers.push("This release belongs to another production partner.");
  return {
    release,
    ready: readiness.ready && release?.partnerId === partnerId,
    blockers,
    active: eligibility.activeJob && !eligibility.reopenRequired,
    matchingStart,
    start: matchingStart ? start as unknown as PartnerProductionStart : null,
  };
}

/** Every partner status write passes this gate, including the generic response form. */
export function validatePartnerProductionChange(input: {
  quoteId: string; quote: Record<string, unknown>; partnerId: string; order?: LinkedOrder;
  decision: PartnerDecision; currentStatus: PartnerProductionStatus; nextStatus: PartnerProductionStatus;
  completionDays: number | null; price: number | null; action: unknown;
  releaseId?: unknown; packetFingerprint?: unknown; blanksReceived?: unknown; receivedProducts?: unknown;
  actor: PartnerProductionActor; now?: string;
}) {
  const state = partnerProductionState(input.quoteId, input.quote, input.partnerId, input.order);
  if (!state.active) throw new PartnerProductionError("This job is closed, cancelled or awaiting renewed client approval. Ask the manager to review it first.");
  if (state.release && !state.ready) throw new PartnerProductionError(state.blockers.join(" ") || "The released packet has changed. Ask the manager to release the current approved job.");
  if (input.decision === "accepted" && !state.release &&
    (!(input.completionDays && Number.isFinite(input.completionDays) && input.completionDays > 0) ||
      !(input.price && Number.isFinite(input.price) && input.price > 0))) {
    throw new PartnerProductionError("Add positive completion days and a price before accepting this quotation offer.", 400);
  }
  if (input.action === "start-production") {
    if (input.decision !== "accepted") throw new PartnerProductionError("Accept this released job before starting production.");
    if (!state.ready || !state.release) throw new PartnerProductionError(state.blockers.join(" ") || "A current successful live production release is required.");
    if (input.releaseId !== state.release.id || input.packetFingerprint !== state.release.packetFingerprint) {
      throw new PartnerProductionError("The released packet changed. Reload and check the current garments before starting.");
    }
    if (input.blanksReceived !== true || JSON.stringify(input.receivedProducts) !== JSON.stringify(state.release.packet.products)) {
      throw new PartnerProductionError("Confirm all listed garment, colour, size and quantity combinations were received and checked.", 400);
    }
    // Repeated clicks are idempotent and never replace the original receipt actor/time.
    if (state.matchingStart) return { status: input.currentStatus, start: state.start, writeStart: false };
    if (startedStatuses.has(input.currentStatus)) throw new PartnerProductionError("Existing production status has no valid start record. Ask the manager to review it.");
    const start: PartnerProductionStart = {
      version: 1, releaseId: state.release.id, packetFingerprint: state.release.packetFingerprint,
      partnerId: input.partnerId, actor: input.actor, startedAtIso: input.now || new Date().toISOString(),
      blanksReceived: true, products: state.release.packet.products,
    };
    return { status: "in_progress" as const, start, writeStart: true };
  }
  if (startedStatuses.has(input.nextStatus)) {
    if (!state.ready || !state.matchingStart || input.decision !== "accepted") {
      throw new PartnerProductionError("Use Start production after a current live release and the garment receipt check before updating production or completion.");
    }
  }
  if (state.matchingStart && !startedStatuses.has(input.nextStatus)) {
    throw new PartnerProductionError("Production has already started. Keep its progress status and report any blocker in the notes.");
  }
  return { status: input.nextStatus, start: state.start, writeStart: false };
}
