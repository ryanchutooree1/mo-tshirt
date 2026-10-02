import type {
  PartnerOrderAttachment as LegacyPartnerOrderAttachment,
  PartnerOrderDetails as LegacyPartnerOrderDetails,
  PartnerOrderView as LegacyPartnerOrderView,
} from "./partners";
import type { ProductionPacket } from "./production-packet";

/** Production-only extensions; the legacy registry and its defaults stay unchanged. */
export type PartnerOrderAttachment = LegacyPartnerOrderAttachment & {
  originalUrl?: string;
  originalFilename?: string;
  originalContentType?: string;
  originalSize?: number | null;
  originalProvenance?: string;
};

export type PartnerOrderDetails = Omit<LegacyPartnerOrderDetails, "artwork"> & {
  artwork?: PartnerOrderAttachment[];
  mockups?: PartnerOrderAttachment[];
};

export type PartnerOrderView = Omit<LegacyPartnerOrderView, "details"> & {
  details: PartnerOrderDetails;
  production: {
    released: boolean;
    releaseId: string | null;
    packetFingerprint: string | null;
    packet: ProductionPacket | null;
    readyToStart: boolean;
    active: boolean;
    blockers: string[];
    startedAtIso: string | null;
    blanksReceived: boolean;
  };
};
