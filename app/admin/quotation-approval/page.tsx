"use client";

import {
  type CSSProperties,
  type InputHTMLAttributes,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { ensureAdminFirebaseSession } from "@/lib/firebase-admin-client-auth";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatMoney as formatDisplayMoney } from "@/lib/money";
import {
  assessPaymentEvidence,
  comparePaymentAmount,
  type PaymentEvidenceAssessment,
} from "@/lib/payment-evidence";
import { addDays, format, formatDistanceToNow } from "date-fns";
import { jsPDF } from "jspdf";
import {
  FiChevronLeft,
  FiChevronRight,
  FiCheckCircle,
  FiClock,
  FiDownload,
  FiEdit2,
  FiFileText,
  FiMail,
  FiPhone,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiStar,
  FiTrash2,
  FiXCircle,
  FiUpload,
  FiUsers,
} from "react-icons/fi";
import { CONTACT_PHONE_DISPLAY } from "@/data/work";
import {
  formatQuoteGarmentDescription,
  sortQuoteColors,
  type QuoteGarmentLine as QuoteGarmentRequestLine,
} from "@/lib/shops";
import {
  DEFAULT_PRODUCTION_MANAGER,
  DEFAULT_PARTNER_VISIBLE_FIELDS,
  getPrintPartner,
  getPrintPartnerRouteLabel,
  inferPartnerPrintPlacementFromText,
  normalizePartnerClientStatus,
  normalizePartnerPrintPlacement,
  normalizePrintPartnerIds,
  normalizePartnerVisibleFields,
  PARTNER_CLIENT_STATUS_LABELS,
  PARTNER_CLIENT_STATUS_OPTIONS,
  PARTNER_DECISION_LABELS,
  PARTNER_DECISION_TONES,
  PARTNER_PRINT_PLACEMENT_LABELS,
  PARTNER_PRINT_PLACEMENT_OPTIONS,
  PARTNER_PRODUCTION_STATUS_LABELS,
  PARTNER_VISIBLE_FIELD_OPTIONS,
  PRINT_PARTNERS,
  type PartnerClientStatus,
  type PartnerDecision,
  type PartnerPrintPlacement,
  type PartnerProductionStatus,
  type PartnerVisibleField,
  type ProductionManager,
  type PrintPartner,
  type PrintPartnerId,
} from "@/lib/partners";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import {
  canAutomaticallyRemoveBackground,
  removeBackgroundAutomatically,
} from "@/lib/automatic-background-removal";

type QuoteStatus = "new" | "review" | "approved" | "sent";
type EditableNumber = number | "";

type QuoteLine = {
  description: string;
  quantity: EditableNumber;
  unitPrice: EditableNumber;
  includeInTotals: boolean;
};

type DocumentType = "quotation" | "invoice" | "receipt" | "partial_receipt";
type MobilePanel = "inbox" | "quote";
type PartnerRoutePopup = {
  title: string;
  message: string;
  tone: "success" | "warning";
};

type PartnerEmailNotificationSummary = {
  sentNames: string[];
  skippedMessages: string[];
  message: string;
};

type QuoteDraft = {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  documentType: DocumentType;
  documentNumber: string;
  documentDate: string;
  clientCompany: string;
  clientAddress: string;
  clientBrn: string;
  clientVat: string;
  paymentStatus: string;
  preparedBy: string;
  showLineItems: boolean;
  showTotals: boolean;
  currency: string;
  lines: QuoteLine[];
  deliveryFee: EditableNumber;
  discount: EditableNumber;
  amountReceived: EditableNumber;
  notes: string;
  validUntil: string;
  terms: string;
};

type QuoteAttachment = {
  label?: string;
  description?: string;
  quantity?: string | number | null;
  filename?: string;
  contentType?: string;
  size?: number | null;
  url?: string;
  originalUrl?: string;
  originalFilename?: string;
  originalContentType?: string;
  originalSize?: number | null;
  backgroundRemovalMethod?: "already-transparent" | "solid-color" | "ai";
  backgroundRemovedAt?: string;
};

type ClientResponseHistoryEntry = {
  id?: string;
  action?: "accept" | "changes" | "reject";
  decision?: "accepted" | "changes_requested" | "rejected";
  comment?: string;
  submittedAtIso?: string;
  paymentEvidence?: {
    uploadId?: string;
    url?: string;
    filename?: string;
    contentType?: string;
    size?: number;
  };
};

type QuotationMissingField = {
  label: string;
  target: string;
};

type BackgroundRemovalJob = {
  status: "processing" | "done" | "error";
  progress: number;
  label: string;
  error?: string;
};

type QuotePartnerAssignment = {
  id?: PrintPartnerId;
  name?: string;
  visibleTo?: PrintPartnerId[];
  lockedBy?: PrintPartnerId | null;
  visibleFields?: PartnerVisibleField[];
  requestStatus?: PartnerDecision;
  productionStatus?: PartnerProductionStatus;
  clientStatus?: PartnerClientStatus;
  printPlacement?: PartnerPrintPlacement;
  completionDays?: number | null;
  price?: number | null;
  comments?: string;
  missingInformation?: string;
  assignedAt?: Date | null;
  respondedAt?: Date | null;
  updatedAt?: Date | null;
  responses?: QuotePartnerResponse[];
};

type QuotePartnerResponse = {
  partnerId: PrintPartnerId;
  partnerName: string;
  requestStatus: PartnerDecision;
  productionStatus: PartnerProductionStatus;
  printPlacement: PartnerPrintPlacement;
  completionDays: number | null;
  price: number | null;
  comments: string;
  missingInformation: string;
  respondedAt?: Date | null;
  updatedAt?: Date | null;
};

type AutoFitInputProps = InputHTMLAttributes<HTMLInputElement> & {
  minFontSize?: number;
  maxFontSize?: number;
};

function AutoFitInput({
  value,
  style,
  minFontSize = 11,
  maxFontSize = 14,
  ...props
}: AutoFitInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fontSize, setFontSize] = useState(maxFontSize);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const updateFontSize = () => {
      const text = Array.isArray(value) ? value.join(" ") : String(value ?? "");
      if (!text) {
        setFontSize(maxFontSize);
        return;
      }

      const styles = window.getComputedStyle(input);
      const availableWidth =
        input.clientWidth -
        Number.parseFloat(styles.paddingLeft || "0") -
        Number.parseFloat(styles.paddingRight || "0") -
        8;

      if (availableWidth <= 0) {
        setFontSize(maxFontSize);
        return;
      }

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;

      let nextFontSize = minFontSize;
      for (let size = maxFontSize; size >= minFontSize; size -= 0.5) {
        context.font = `${styles.fontStyle} ${styles.fontWeight} ${size}px ${styles.fontFamily}`;
        if (context.measureText(text).width <= availableWidth) {
          nextFontSize = size;
          break;
        }
      }

      setFontSize(Math.round(nextFontSize * 10) / 10);
    };

    updateFontSize();

    const resizeObserver = new ResizeObserver(updateFontSize);
    resizeObserver.observe(input);
    window.addEventListener("resize", updateFontSize);
    void document.fonts?.ready.then(updateFontSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateFontSize);
    };
  }, [maxFontSize, minFontSize, value]);

  const mergedStyle: CSSProperties = {
    ...style,
    fontSize: `${fontSize}px`,
  };

  return <input {...props} ref={inputRef} value={value} style={mergedStyle} />;
}

function QuotationPreviewValue({
  value,
  missingLabel = "MISSING — ASK CLIENT",
}: {
  value: string | number | null | undefined;
  missingLabel?: string;
}) {
  const displayValue = typeof value === "string" ? value.trim() : value;
  const missing = displayValue === "" || displayValue === null || displayValue === undefined;
  return (
    <span className={missing ? "font-extrabold text-red-600" : "text-[#222222]"}>
      {missing ? missingLabel : displayValue}
    </span>
  );
}

function joinDisplayNames(names: string[]) {
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function buildPartnerEmailMessage(
  sentNames: string[],
  skippedMessages: string[]
) {
  if (sentNames.length === 1) {
    const suffix = sentNames[0].includes(" recipients)") ? "" : " only";
    return `Email sent to ${sentNames[0]}${suffix}.${
      skippedMessages.length ? ` ${skippedMessages.join(" ")}` : ""
    }`;
  }

  if (sentNames.length > 1) {
    return `Email sent to ${joinDisplayNames(sentNames)}.${
      skippedMessages.length ? ` ${skippedMessages.join(" ")}` : ""
    }`;
  }

  if (skippedMessages.length) {
    return `No partner email was sent. ${skippedMessages.join(" ")}`;
  }

  return "";
}

function getSentPartnerLabel(entry: { partnerName?: unknown; emails?: unknown }) {
  const name = typeof entry.partnerName === "string" ? entry.partnerName : "";
  const recipientCount = Array.isArray(entry.emails)
    ? entry.emails.filter((email) => typeof email === "string" && email.trim()).length
    : 0;

  if (!name) return "";
  return recipientCount > 1 ? `${name} (${recipientCount} recipients)` : name;
}

type QuoteRecord = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  message?: string;
  garments?: QuoteGarmentRequestLine[];
  printMethod?: string;
  quantity?: string | number;
  deadline?: string;
  notes?: string;
  source?: string;
  delivery?: string;
  deliveryName?: string;
  deliveryAddress?: string;
  deliveryPostCode?: string;
  deliveryPhone?: string;
  designBrief?: Record<string, unknown> | null;
  attachment?: QuoteAttachment | null;
  attachments?: QuoteAttachment[];
  status?: QuoteStatus;
  clientDecision?: "accepted" | "changes_requested" | "rejected";
  clientDecisionComment?: string;
  clientDecisionAtIso?: string;
  clientResponseHistory?: ClientResponseHistoryEntry[];
  sentAt?: Date | null;
  paymentEvidence?: {
    uploadId?: string;
    url?: string;
    filename?: string;
    contentType?: string;
    ocrStatus?: "pending" | "processing" | "complete" | "error";
    ocrError?: string;
    ocrText?: string;
    verificationStatus?: "pending_manual_confirmation" | "confirmed";
    submittedAtIso?: string;
    assessment?: PaymentEvidenceAssessment;
  };
  paymentReceipt?: {
    receiptId?: string;
    documentType?: "receipt";
    documentNumber?: string;
    documentDate?: string;
    clientCompany?: string;
    clientAddress?: string;
    clientBrn?: string;
    clientVat?: string;
    paymentStatus?: "Paid";
    preparedBy?: string;
    showLineItems?: boolean;
    showTotals?: boolean;
    currency?: string;
    lines?: QuoteLine[];
    deliveryFee?: number;
    discount?: number;
    amountReceived?: number;
    notes?: string;
    validUntil?: string;
    subtotal?: number;
    total?: number;
    terms?: string;
    generatedAtIso?: string;
    sourcePaymentEvidenceUploadId?: string;
  };
  orderTransactionId?: string;
  movedToOrdersAt?: Date | null;
  partner?: QuotePartnerAssignment | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  quote?: {
    documentType?: DocumentType;
    documentNumber?: string;
    documentDate?: string;
    clientCompany?: string;
    clientAddress?: string;
    clientBrn?: string;
    clientVat?: string;
    paymentStatus?: string;
    preparedBy?: string;
    showLineItems?: boolean;
    showTotals?: boolean;
    currency?: string;
    lines?: QuoteLine[];
    deliveryFee?: number;
    discount?: number;
    amountReceived?: number;
    notes?: string;
    validUntil?: string;
    subtotal?: number;
    total?: number;
    terms?: string;
  };
};

const ATTACHMENT_PREVIEW_RETRY_LIMIT = 2;
const ATTACHMENT_PREVIEW_RETRY_DELAY_MS = 900;
const ATTACHMENT_PREVIEW_LOAD_TIMEOUT_MS = 8_000;

function QuoteAttachmentPreview({
  src,
  alt,
  transparent = false,
}: {
  src: string;
  alt: string;
  transparent?: boolean;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retryNonce, setRetryNonce] = useState(0);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const retryAttemptsRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const handleError = useCallback(() => {
    clearRetryTimer();
    const nextAttempt = retryAttemptsRef.current + 1;
    if (nextAttempt > ATTACHMENT_PREVIEW_RETRY_LIMIT) {
      setStatus("error");
      return;
    }

    retryAttemptsRef.current = nextAttempt;
    setStatus("loading");
    retryTimerRef.current = window.setTimeout(() => {
      setRetryNonce((current) => current + 1);
    }, ATTACHMENT_PREVIEW_RETRY_DELAY_MS * nextAttempt);
  }, [clearRetryTimer]);

  useEffect(() => {
    retryAttemptsRef.current = 0;
    setRetryNonce(0);
    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, [src]);

  useEffect(() => {
    clearRetryTimer();

    const image = imageRef.current;
    if (image?.complete) {
      if (image.naturalWidth > 0) {
        setStatus("ready");
      } else {
        handleError();
      }
      return clearRetryTimer;
    }

    setStatus("loading");
    retryTimerRef.current = window.setTimeout(
      handleError,
      ATTACHMENT_PREVIEW_LOAD_TIMEOUT_MS
    );

    return clearRetryTimer;
  }, [clearRetryTimer, handleError, retryNonce, src]);

  return (
    <div
      className={`relative mt-3 overflow-hidden rounded-[24px] border border-[#ebebeb] p-2.5 shadow-[0_4px_14px_rgba(0,0,0,0.04)] ${
        transparent
          ? "bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0]"
          : "bg-white"
      }`}
    >
      {status !== "ready" && (
        <div className="absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-[18px] bg-white/92 text-[#717171] backdrop-blur-sm">
          {status === "loading" ? (
            <>
              <FiRefreshCw className="h-4 w-4 animate-spin" />
              <p className="text-xs font-medium text-[#717171]">Loading preview...</p>
            </>
          ) : (
            <p className="text-xs font-medium text-[#717171]">Preview unavailable</p>
          )}
        </div>
      )}
      { }
      <img
        ref={imageRef}
        key={`${src}-${retryNonce}`}
        src={src}
        alt={alt}
        className={`h-40 w-full rounded-xl object-contain transition-opacity duration-200 ${
          status === "ready" ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => {
          clearRetryTimer();
          setStatus("ready");
        }}
        onError={handleError}
      />
    </div>
  );
}

type DesignBrief = {
  product?: string;
  color?: string;
  printMethod?: string;
  frontText?: string;
  backText?: string;
  frontLogo?: boolean;
  backLogo?: boolean;
  selectedSizes?: { size?: string; quantity?: number }[];
  totalQty?: number;
  estimatedTotal?: number;
  rush?: boolean;
  delivery?: string;
  deadline?: string;
  clientNotes?: string;
};

type LogoAsset = {
  dataUrl: string;
  ratio: number;
};

type FirestoreTimestampLike = {
  toDate?: () => Date;
  seconds?: number;
};

type QuoteLineWithTotal = QuoteLine & {
  lineTotal: number;
};

const BUSINESS_INFO = {
  name: "MO T-SHIRT",
  addressLines: ["School Lane", "Surinam, 60907"],
  phone: CONTACT_PHONE_DISPLAY,
  brn: "I20009899",
};

const QUOTATION_TERMS = [
  "This quotation is provided for information purposes only and is valid for a limited period.",
  "Prices are subject to change if quantities, specifications, or timelines are modified.",
  "Production will commence only after written acceptance of this quotation.",
  "Acceptance of this quotation confirms agreement with MO T-SHIRT terms and conditions.",
  "Note: MO T-SHIRT is not VAT-registered. This quotation is not subject to VAT.",
].join("\n");

const INVOICE_TERMS = [
  "A 50% advance payment is required to confirm the order and start production.",
  "The remaining 50% balance must be settled prior to delivery or collection.",
  "Orders are processed only after receipt of the required advance payment.",
  "Late payment may result in delays to production or delivery.",
  "Note: MO T-SHIRT is not VAT-registered. This invoice is not subject to VAT.",
].join("\n");

const RECEIPT_TERMS = [
  "This receipt confirms full payment received by MO T-SHIRT.",
  "No outstanding balance remains for the related invoice.",
  "This receipt serves as official proof of payment.",
  "Any discrepancies must be reported within 24 hours of receipt issuance.",
].join("\n");

const PARTIAL_RECEIPT_TERMS = [
  "This receipt confirms partial payment received by MO T-SHIRT.",
  "The amount received represents an advance and does not constitute full settlement.",
  "Production may commence upon receipt of the required advance payment.",
  "The remaining balance must be paid prior to delivery or collection.",
  "This receipt serves as proof of partial payment.",
].join("\n");

const TERMS_BY_TYPE: Record<DocumentType, string> = {
  quotation: QUOTATION_TERMS,
  invoice: INVOICE_TERMS,
  receipt: RECEIPT_TERMS,
  partial_receipt: PARTIAL_RECEIPT_TERMS,
};

const getDefaultTerms = (type: DocumentType) => TERMS_BY_TYPE[type] || QUOTATION_TERMS;

const PAYMENT_DETAILS = {
  payee: "Manavshree Chutooree",
  bankName: "SBM BANK",
  accountNumber: "50300001273751",
};

const DEFAULT_PREPARED_BY = "Mo T-Shirt Team";

const STATUS_LABELS: Record<QuoteStatus, string> = {
  new: "New",
  review: "In review",
  approved: "Approved",
  sent: "Sent",
};

const STATUS_TONES: Record<QuoteStatus, string> = {
  new: "border-[#ffd9c2] bg-[#fff4ed] text-[#c2410c]",
  review: "border-[#ebebeb] bg-[#f7f7f7] text-[#484848]",
  approved: "border-[#d7f0e0] bg-[#f4fbf7] text-[#1f7a4d]",
  sent: "border-[#dce8ff] bg-[#f5f9ff] text-[#3566d6]",
};

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  quotation: "Quotation",
  invoice: "Invoice",
  partial_receipt: "Partial receipt",
  receipt: "Receipt",
};
const DOC_TYPE_PREFIXES: Record<DocumentType, string> = {
  quotation: "Q",
  invoice: "INV",
  partial_receipt: "PR",
  receipt: "R",
};

const DOC_TYPE_TONES: Record<DocumentType, string> = {
  quotation: "border-[#ffd9c2] bg-[#fff4ed] text-[#c2410c]",
  invoice: "border-[#ebebeb] bg-[#f7f7f7] text-[#484848]",
  partial_receipt: "border-[#ffe2b8] bg-[#fff8eb] text-[#b76a12]",
  receipt: "border-[#d7f0e0] bg-[#f4fbf7] text-[#1f7a4d]",
};

const QUICK_PRODUCT_LINES = ["T-Shirt", "Poloshirt", "Hoodie", "Cap"];

const getQuoteDocumentType = (quote: QuoteRecord): DocumentType => quote.quote?.documentType || "quotation";

const normalizeDocumentNumberForType = (value: string, documentType: DocumentType) => {
  const cleanValue = value.trim();
  const baseNumber = cleanValue.replace(/^(Q|INV|PR|R)-/i, "") || cleanValue;
  return `${DOC_TYPE_PREFIXES[documentType]}-${baseNumber}`;
};

const getPrimaryStatusMeta = (status: QuoteStatus, docType: DocumentType) => {
  if (status === "sent") {
    return {
      label: DOC_TYPE_LABELS[docType],
      tone: DOC_TYPE_TONES[docType],
    };
  }
  return {
    label: STATUS_LABELS[status],
    tone: STATUS_TONES[status],
  };
};

const getPaymentStatusMeta = (quote: QuoteRecord) => {
  const evidence = quote.paymentEvidence;
  const amountComparison = comparePaymentAmount(
    evidence?.assessment?.amount,
    quote.quote?.total
  );
  if (amountComparison.status === "overpaid") {
    return {
      label: `Payment is greater by Rs ${(amountComparison.difference || 0).toLocaleString("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      shortLabel: "Overpaid",
      tone: "border-red-200 bg-red-50 text-red-700",
    };
  }
  if (amountComparison.status === "underpaid") {
    return {
      label: `Payment is less by Rs ${Math.abs(amountComparison.difference || 0).toLocaleString("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      shortLabel: "Underpaid",
      tone: "border-red-200 bg-red-50 text-red-700",
    };
  }
  if (evidence?.verificationStatus === "confirmed") {
    return {
      label: "Payment confirmed",
      shortLabel: "Paid",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (evidence) {
    if (evidence.ocrStatus === "processing" || evidence.ocrStatus === "pending") {
      return {
        label: "Payment proof · OCR checking",
        shortLabel: "OCR checking",
        tone: "border-blue-200 bg-blue-50 text-blue-700",
      };
    }
    if (evidence.ocrStatus === "error") {
      return {
        label: "Payment proof needs review",
        shortLabel: "Review proof",
        tone: "border-red-200 bg-red-50 text-red-700",
      };
    }
    if (evidence.ocrStatus === "complete") {
      return {
        label: evidence.assessment?.verdict === "likely_payment"
          ? "Payment proof received · verify bank"
          : "Payment proof needs manual review",
        shortLabel: evidence.assessment?.verdict === "likely_payment" ? "Verify bank" : "Review proof",
        tone: "border-amber-200 bg-amber-50 text-amber-700",
      };
    }
    return {
      label: "Payment proof submitted",
      shortLabel: "Proof submitted",
      tone: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }

  const storedPaymentStatus = quote.quote?.paymentStatus?.trim() || "";
  if (/paid/i.test(storedPaymentStatus) && !/unpaid/i.test(storedPaymentStatus)) {
    return {
      label: storedPaymentStatus,
      shortLabel: storedPaymentStatus,
      tone: /partial/i.test(storedPaymentStatus)
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (quote.status === "sent" || quote.clientDecision === "accepted") {
    return {
      label: "Awaiting payment proof",
      shortLabel: "Awaiting payment",
      tone: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  return {
    label: "Payment not requested",
    shortLabel: "Not requested",
    tone: "border-[#e3e3e3] bg-[#f7f7f7] text-[#666666]",
  };
};

const safeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseEditableNumber = (value: string, fallback = 0): EditableNumber =>
  value === "" ? "" : safeNumber(value, fallback);

const normalizeDesignText = (value: unknown) => {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  if (lower === "off" || lower === "none" || lower === "n/a") return "";
  return text;
};

const parseDesignBrief = (value: unknown): DesignBrief | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const selectedSizes = Array.isArray(raw.selectedSizes)
    ? raw.selectedSizes
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return { size: "", quantity: 0 };
          const entry = item as Record<string, unknown>;
          return {
            size: String(entry.size || "").trim(),
            quantity: safeNumber(entry.quantity, 0),
          };
        })
        .filter((item) => item.size && item.quantity > 0)
    : [];
  return {
    product: typeof raw.product === "string" ? raw.product : "",
    color: typeof raw.color === "string" ? raw.color : "",
    printMethod: typeof raw.printMethod === "string" ? raw.printMethod : "",
    frontText: normalizeDesignText(raw.frontText),
    backText: normalizeDesignText(raw.backText),
    frontLogo: Boolean(raw.frontLogo),
    backLogo: Boolean(raw.backLogo),
    selectedSizes,
    totalQty: safeNumber(raw.totalQty, 0),
    estimatedTotal: safeNumber(raw.estimatedTotal, 0),
    rush: Boolean(raw.rush),
    delivery: typeof raw.delivery === "string" ? raw.delivery : "",
    deadline: typeof raw.deadline === "string" ? raw.deadline : "",
    clientNotes: typeof raw.clientNotes === "string" ? raw.clientNotes : "",
  };
};

const getQuoteAttachments = (quote: QuoteRecord | null | undefined) => {
  if (!quote) return [] as QuoteAttachment[];
  const preferOpenableAttachments = (attachments: QuoteAttachment[]) => {
    const openableAttachments = attachments.filter((attachment) => attachment.url);
    return openableAttachments.length ? openableAttachments : attachments;
  };
  if (Array.isArray(quote.attachments) && quote.attachments.length) {
    const attachments = quote.attachments.filter(
      (entry) => Boolean(entry?.filename || entry?.url || entry?.label || entry?.description || entry?.quantity)
    );
    return preferOpenableAttachments(attachments);
  }
  if (quote.attachment) return [quote.attachment];
  return [] as QuoteAttachment[];
};

const getQuoteAttachmentDownloadHref = (attachment: QuoteAttachment, index: number) => {
  if (!attachment.url) return "";

  const params = new URLSearchParams({
    url: attachment.url,
    name: attachment.filename || attachment.label || `attachment-${index + 1}`,
  });

  return `/api/shops/download?${params.toString()}`;
};

const getBackgroundRemovalJobKey = (
  quoteId: string,
  attachment: QuoteAttachment,
  index: number
) => `${quoteId}:${index}:${attachment.originalUrl || attachment.url || attachment.filename || "artwork"}`;

const getTransparentArtworkName = (filename: string | undefined, index: number) => {
  const base = (filename || `artwork-${index + 1}`).replace(/\.[^.]+$/, "");
  return `${base}-transparent.png`;
};

const getStorageUploadErrorMessage = (error: unknown) => {
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";

  if (code === "storage/quota-exceeded") {
    return "Firebase Storage quota exceeded. Uploads are blocked until the bucket quota or billing plan is updated.";
  }

  return "Failed to upload file.";
};

const formatSizeRows = (sizes: { size?: string; quantity?: number }[]) =>
  sizes
    .filter((entry) => entry.size && safeNumber(entry.quantity, 0) > 0)
    .map((entry) => `${entry.size} x ${safeNumber(entry.quantity, 0)}`);

const extractClientNotes = (quote: QuoteRecord, designBrief: DesignBrief | null) => {
  if (designBrief?.clientNotes?.trim()) return designBrief.clientNotes.trim();
  if (designBrief) return "";
  const raw = (quote.notes || quote.message || "").trim();
  if (!raw) return "";
  const marker = raw.match(/Client notes:\s*([\s\S]*)$/i);
  if (marker?.[1]?.trim()) return marker[1].trim();
  return raw;
};

const getDraftPricingSummary = (draft: Pick<QuoteDraft, "lines" | "deliveryFee" | "discount" | "amountReceived" | "showTotals">) => {
  const lineTotals: QuoteLineWithTotal[] = draft.lines.map((line) => ({
    ...line,
    lineTotal: safeNumber(line.quantity, 0) * safeNumber(line.unitPrice, 0),
  }));
  const subtotal = lineTotals.reduce((acc, line) => acc + line.lineTotal, 0);
  const deliveryFee = safeNumber(draft.deliveryFee, 0);
  const discount = safeNumber(draft.discount, 0);
  const amountReceived = safeNumber(draft.amountReceived, 0);
  const total = subtotal + deliveryFee - discount;
  const balanceDue = Math.max(0, total - amountReceived);
  const showSubtotal = draft.showTotals && (lineTotals.length > 1 || deliveryFee > 0 || discount > 0);

  return {
    lineTotals,
    includedLineCount: lineTotals.length,
    subtotal,
    deliveryFee,
    discount,
    amountReceived,
    total,
    balanceDue,
    showSubtotal,
  };
};

const lineLabelList = (indexes: number[]) => indexes.map((value) => value + 1).join(", ");

const validateDraftBeforeSend = (value: QuoteDraft) => {
  if (!value.lines.length) return "Add at least one product line before sending.";

  const missingDescription: number[] = [];
  const invalidQuantity: number[] = [];
  const missingUnitPrice: number[] = [];

  value.lines.forEach((line, index) => {
    if (!line.description.trim()) missingDescription.push(index);
    if (safeNumber(line.quantity, 0) <= 0) invalidQuantity.push(index);
    if (safeNumber(line.unitPrice, 0) <= 0) missingUnitPrice.push(index);
  });

  if (missingDescription.length) {
    return `Add description for line(s): ${lineLabelList(missingDescription)}.`;
  }
  if (invalidQuantity.length) {
    return `Quantity must be above 0 for line(s): ${lineLabelList(invalidQuantity)}.`;
  }
  if (missingUnitPrice.length) {
    return `Unit price is mandatory for line(s): ${lineLabelList(missingUnitPrice)}.`;
  }
  return null;
};

const parseTimestamp = (value: unknown) => {
  if (!value) return null;
  if (typeof (value as FirestoreTimestampLike)?.toDate === "function") {
    return (value as FirestoreTimestampLike).toDate!();
  }
  if (typeof (value as FirestoreTimestampLike)?.seconds === "number") {
    return new Date((value as FirestoreTimestampLike).seconds! * 1000);
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parsePartnerDecision = (value: unknown): PartnerDecision => {
  return value === "accepted" ||
    value === "rejected" ||
    value === "needs_info" ||
    value === "pending"
    ? value
    : "pending";
};

const parsePartnerProductionStatus = (value: unknown): PartnerProductionStatus => {
  return typeof value === "string" && value in PARTNER_PRODUCTION_STATUS_LABELS
    ? (value as PartnerProductionStatus)
    : "not_started";
};

const parseQuotePartnerResponse = (
  partnerId: PrintPartnerId,
  value: unknown
): QuotePartnerResponse | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    partnerId,
    partnerName: getPrintPartner(partnerId).name,
    requestStatus: parsePartnerDecision(raw.requestStatus),
    productionStatus: parsePartnerProductionStatus(raw.productionStatus),
    printPlacement: normalizePartnerPrintPlacement(raw.printPlacement),
    completionDays: safeNumber(raw.completionDays, 0) > 0 ? safeNumber(raw.completionDays, 0) : null,
    price: safeNumber(raw.price, 0) > 0 ? safeNumber(raw.price, 0) : null,
    comments: typeof raw.comments === "string" ? raw.comments : "",
    missingInformation: typeof raw.missingInformation === "string" ? raw.missingInformation : "",
    respondedAt: parseTimestamp(raw.respondedAt),
    updatedAt: parseTimestamp(raw.updatedAt),
  };
};

const parseQuotePartnerAssignment = (value: unknown): QuotePartnerAssignment | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const partnerId = normalizePrintPartnerIds([raw.id])[0];
  const visibleTo = normalizePrintPartnerIds(raw.visibleTo);
  const assignedPartnerIds = visibleTo.length
    ? visibleTo
    : partnerId
      ? [partnerId]
      : [];
  const lockedBy = normalizePrintPartnerIds([raw.lockedBy])[0] || null;
  const rawResponses =
    raw.responses && typeof raw.responses === "object" && !Array.isArray(raw.responses)
      ? (raw.responses as Record<string, unknown>)
      : {};
  const responses = Object.entries(rawResponses)
    .map(([rawPartnerId, response]) => {
      const responsePartnerId = normalizePrintPartnerIds([rawPartnerId])[0];
      return responsePartnerId ? parseQuotePartnerResponse(responsePartnerId, response) : null;
    })
    .filter((response): response is QuotePartnerResponse => Boolean(response));
  const activePartnerId = lockedBy || partnerId;
  const activeResponse =
    (activePartnerId &&
      responses.find((response) => response.partnerId === activePartnerId)) ||
    null;
  const activeName = activePartnerId
    ? getPrintPartner(activePartnerId).name
    : getPrintPartnerRouteLabel(assignedPartnerIds);
  const rawPrintPlacement = normalizePartnerPrintPlacement(raw.printPlacement);
  const activePrintPlacement =
    activeResponse?.printPlacement && activeResponse.printPlacement !== "not_set"
      ? activeResponse.printPlacement
      : rawPrintPlacement;

  return {
    id: activePartnerId || partnerId,
    name: typeof raw.name === "string" ? raw.name : activeName,
    visibleTo: assignedPartnerIds,
    lockedBy,
    visibleFields: normalizePartnerVisibleFields(raw.visibleFields),
    requestStatus: activeResponse?.requestStatus || parsePartnerDecision(raw.requestStatus),
    productionStatus:
      activeResponse?.productionStatus || parsePartnerProductionStatus(raw.productionStatus),
    clientStatus: normalizePartnerClientStatus(raw.clientStatus),
    printPlacement: activePrintPlacement,
    completionDays:
      activeResponse?.completionDays ||
      (safeNumber(raw.completionDays, 0) > 0 ? safeNumber(raw.completionDays, 0) : null),
    price:
      activeResponse?.price ||
      (safeNumber(raw.price, 0) > 0 ? safeNumber(raw.price, 0) : null),
    comments: activeResponse?.comments || (typeof raw.comments === "string" ? raw.comments : ""),
    missingInformation:
      activeResponse?.missingInformation ||
      (typeof raw.missingInformation === "string" ? raw.missingInformation : ""),
    assignedAt: parseTimestamp(raw.assignedAt),
    respondedAt: activeResponse?.respondedAt || parseTimestamp(raw.respondedAt),
    updatedAt: activeResponse?.updatedAt || parseTimestamp(raw.updatedAt),
    responses,
  };
};

const partnerResponseHasContent = (response: QuotePartnerResponse) => {
  return (
    response.requestStatus !== "pending" ||
    response.productionStatus !== "not_started" ||
    Boolean(
      response.completionDays ||
        response.price ||
        response.comments ||
        response.missingInformation ||
        response.printPlacement !== "not_set"
    )
  );
};

const formatMoney = (value: number, currency = "Rs") => {
  return formatDisplayMoney(value, currency);
};

const buildDraftFromQuote = (quote: QuoteRecord): QuoteDraft => {
  const fallbackDate = quote.createdAt ? format(quote.createdAt, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
  const fallbackNumber = `Q-${quote.id.slice(-5).toUpperCase()}`;
  if (quote.quote) {
    const storedLines: QuoteLine[] = (quote.quote.lines || []).map((line) => ({
      description: line.description || "",
      quantity: safeNumber(line.quantity, 0),
      unitPrice: (() => {
        const amount = safeNumber(line.unitPrice, 0);
        return amount > 0 ? amount : "";
      })(),
      includeInTotals: true,
    }));
    const fallbackLines: QuoteLine[] =
      quote.garments?.map((entry) => {
        return {
          description: formatQuoteGarmentDescription(entry),
          quantity: safeNumber(entry.quantity, 0),
          unitPrice: "",
          includeInTotals: true,
        };
      }) || [];
    const documentType = quote.quote.documentType || "quotation";
    const documentDate = quote.quote.documentDate || fallbackDate;
    const validUntilFallback = format(addDays(new Date(documentDate), 7), "yyyy-MM-dd");
    const defaultPaymentStatus =
      documentType === "invoice"
        ? "Unpaid"
        : documentType === "receipt"
          ? "Paid"
          : documentType === "partial_receipt"
            ? "Partially paid"
            : "Quotation only";
    return {
      contactName: quote.name || quote.quote.clientCompany || "",
      contactEmail: quote.email || "",
      contactPhone: quote.phone || "",
      documentType,
      documentNumber: quote.quote.documentNumber || fallbackNumber,
      documentDate,
      clientCompany: quote.quote.clientCompany || quote.name || "",
      clientAddress: quote.quote.clientAddress || quote.deliveryAddress || "",
      clientBrn: quote.quote.clientBrn || "",
      clientVat: quote.quote.clientVat || "",
      paymentStatus: quote.quote.paymentStatus || defaultPaymentStatus,
      preparedBy: quote.quote.preparedBy || DEFAULT_PREPARED_BY,
      showLineItems: quote.quote.showLineItems ?? true,
      showTotals: quote.quote.showTotals ?? true,
      currency: quote.quote.currency || "Rs",
      lines: storedLines.length ? storedLines : fallbackLines,
      deliveryFee: safeNumber(quote.quote.deliveryFee, 0),
      discount: safeNumber(quote.quote.discount, 0),
      amountReceived: safeNumber(quote.quote.amountReceived, 0),
      notes: quote.quote.notes || "",
      validUntil: quote.quote.validUntil || validUntilFallback,
      terms: quote.quote.terms || getDefaultTerms(documentType),
    };
  }

  const validUntilFallback = format(addDays(new Date(fallbackDate), 7), "yyyy-MM-dd");
  const fromGarments: QuoteLine[] =
    quote.garments?.map((entry) => {
      return {
        description: formatQuoteGarmentDescription(entry),
        quantity: safeNumber(entry.quantity, 0),
        unitPrice: "",
        includeInTotals: true,
      };
    }) || [];

  const lines: QuoteLine[] = fromGarments.length
    ? fromGarments
    : [
      {
        description: "Custom item",
        quantity: safeNumber(quote.quantity, 1),
        unitPrice: "",
        includeInTotals: true,
      },
    ];

  return {
    contactName: quote.name || "",
    contactEmail: quote.email || "",
    contactPhone: quote.phone || "",
    documentType: "quotation",
    documentNumber: fallbackNumber,
    documentDate: fallbackDate,
    clientCompany: quote.name || "",
    clientAddress: quote.deliveryAddress || "",
    clientBrn: "",
    clientVat: "",
    paymentStatus: "Quotation only",
    preparedBy: DEFAULT_PREPARED_BY,
    showLineItems: true,
    showTotals: true,
    currency: "Rs",
    lines,
    deliveryFee: quote.delivery?.includes("Post Office") ? 100 : 0,
    discount: 0,
    amountReceived: 0,
    notes: "",
    validUntil: validUntilFallback,
    terms: getDefaultTerms("quotation"),
  };
};

function buildPdfDoc(quote: QuoteRecord, draft: QuoteDraft, logo: LogoAsset | null) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const now = new Date();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const accent = { r: 250, g: 115, b: 35 };
  const showLineItems = draft.showLineItems;
  const pricing = getDraftPricingSummary(draft);
  const { lineTotals, subtotal, deliveryFee, discount, amountReceived, total: grandTotal, balanceDue, showSubtotal } = pricing;

  const docTitle =
    draft.documentType === "invoice"
      ? "Invoice"
      : draft.documentType === "receipt"
        ? "Receipt"
        : draft.documentType === "partial_receipt"
          ? "Partial Receipt"
          : "Quotation";
  const documentDate = draft.documentDate || format(now, "yyyy-MM-dd");
  const parsedDate = Number.isNaN(new Date(documentDate).getTime()) ? now : new Date(documentDate);
  const validUntilDate = draft.validUntil ? new Date(draft.validUntil) : addDays(parsedDate, 7);
  const validUntilSafe = Number.isNaN(validUntilDate.getTime()) ? addDays(parsedDate, 7) : validUntilDate;
  const statusLabel = draft.documentType === "quotation" ? "Status" : "Payment status";
  const rawStatus =
    draft.paymentStatus ||
    (draft.documentType === "invoice"
      ? "Unpaid"
      : draft.documentType === "receipt"
        ? "Paid"
        : draft.documentType === "partial_receipt"
          ? "Partially paid"
          : "Quotation only");
  const normalizedStatusBase = rawStatus === "Half paid" ? "Partially paid" : rawStatus;
  const normalizedStatus =
    draft.documentType !== "quotation" && normalizedStatusBase.toLowerCase().includes("quotation")
      ? draft.documentType === "receipt"
        ? "Paid"
        : draft.documentType === "partial_receipt"
          ? "Partially paid"
          : "Unpaid"
      : normalizedStatusBase;
  const statusTone = (status: string) => {
    const lower = status.toLowerCase();
    if (lower.includes("unpaid")) return { r: 200, g: 38, b: 38 };
    if (lower.includes("partially")) return { r: 217, g: 119, b: 6 };
    if (lower.includes("paid")) return { r: 22, g: 163, b: 74 };
    return { r: 100, g: 100, b: 100 };
  };
  const setMissingPdfStyle = () => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(220, 38, 38);
  };
  const restorePdfBodyStyle = () => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
  };

  // Top bar
  doc.setFillColor(accent.r, accent.g, accent.b);
  doc.rect(margin, 24, contentWidth, 4, "F");

  // Header left (company)
  const headerTop = 56;
  const maxLogoWidth = 165;
  const maxLogoHeight = 36;
  let logoWidth = 128;
  let logoHeight = 29;
  if (logo?.ratio) {
    logoWidth = maxLogoWidth;
    logoHeight = Math.round(logoWidth / logo.ratio);
    if (logoHeight > maxLogoHeight) {
      logoHeight = maxLogoHeight;
      logoWidth = Math.round(logoHeight * logo.ratio);
    }
  }
  const logoY = headerTop;
  const addressStart = logo?.dataUrl ? logoY + logoHeight + 16 : headerTop + 22;

  if (logo?.dataUrl) {
    doc.addImage(logo.dataUrl, "PNG", margin, logoY, logoWidth, logoHeight);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(accent.r, accent.g, accent.b);
    doc.text(BUSINESS_INFO.name, margin, headerTop + 4);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  BUSINESS_INFO.addressLines.forEach((line, idx) => {
    doc.text(line, margin, addressStart + idx * 14);
  });
  doc.text(`Tel: ${BUSINESS_INFO.phone}`, margin, addressStart + BUSINESS_INFO.addressLines.length * 14);
  doc.text(`BRN: ${BUSINESS_INFO.brn}`, margin, addressStart + BUSINESS_INFO.addressLines.length * 14 + 14);

  // Header right (quotation info)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(accent.r, accent.g, accent.b);
  const rightHeaderY = headerTop + 16;
  doc.text(docTitle, pageWidth - margin, rightHeaderY, { align: "right" });
  doc.setFontSize(10);
  doc.setTextColor(100);
  const rightLine = 13;
  let rightInfoY = rightHeaderY + 18;
  if (!draft.documentNumber.trim()) setMissingPdfStyle();
  doc.text(`No ${draft.documentNumber.trim() || "MISSING NUMBER"}`, pageWidth - margin, rightInfoY, {
    align: "right",
  });
  restorePdfBodyStyle();
  rightInfoY += rightLine;
  if (!draft.documentDate.trim()) setMissingPdfStyle();
  doc.text(`Date ${draft.documentDate.trim() ? format(parsedDate, "dd/MM/yyyy") : "MISSING DATE"}`, pageWidth - margin, rightInfoY, {
    align: "right",
  });
  restorePdfBodyStyle();
  rightInfoY += rightLine;
  if (draft.documentType === "quotation") {
    if (!draft.validUntil.trim()) setMissingPdfStyle();
    doc.text(`Valid until ${draft.validUntil.trim() ? format(validUntilSafe, "dd/MM/yyyy") : "MISSING VALIDITY"}`, pageWidth - margin, rightInfoY, {
      align: "right",
    });
    restorePdfBodyStyle();
    rightInfoY += rightLine;
  }
  const statusColor = statusTone(normalizedStatus);
  const statusLabelText = `${statusLabel}: `;
  const statusValueText = normalizedStatus;
  const statusLabelWidth = doc.getTextWidth(statusLabelText);
  const statusValueWidth = doc.getTextWidth(statusValueText);
  const statusStartX = pageWidth - margin - (statusLabelWidth + statusValueWidth);
  doc.setTextColor(20);
  doc.text(statusLabelText, statusStartX, rightInfoY);
  doc.setTextColor(statusColor.r, statusColor.g, statusColor.b);
  doc.text(statusValueText, statusStartX + statusLabelWidth, rightInfoY);
  doc.setTextColor(100);
  rightInfoY += rightLine;
  if (!draft.preparedBy.trim()) setMissingPdfStyle();
  doc.text(`Prepared by: ${draft.preparedBy.trim() || "MISSING PREPARER"}`, pageWidth - margin, rightInfoY, {
    align: "right",
  });
  restorePdfBodyStyle();

  // Client section
  let y = 176;
  const clientName = draft.clientCompany.trim();
  const contactName = draft.contactName.trim();
  const clientPhone = draft.contactPhone.trim();
  const clientEmail = draft.contactEmail.trim();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(accent.r, accent.g, accent.b);
  doc.text(`${docTitle} for`, margin, y);
  y += 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  if (clientName) {
    doc.setTextColor(20);
    doc.text(clientName, margin, y);
  } else {
    setMissingPdfStyle();
    doc.setFontSize(15);
    doc.text("MISSING COMPANY / CLIENT", margin, y);
  }
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const drawClientLine = (label: string, value: string, missingLabel: string) => {
    if (value) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(20);
      doc.text(`${label}: ${value}`, margin, y);
    } else {
      setMissingPdfStyle();
      doc.setFontSize(11);
      doc.text(`${label}: ${missingLabel}`, margin, y);
    }
    y += 14;
  };
  const drawOptionalClientLine = (label: string, value: string) => {
    if (!value) return;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20);
    doc.text(`${label}: ${value}`, margin, y);
    y += 14;
  };
  drawClientLine("Contact", contactName, "MISSING CONTACT NAME");
  drawClientLine("Phone", clientPhone, "MISSING PHONE");
  drawClientLine("Email", clientEmail, "MISSING EMAIL");
  const clientAddress = (draft.clientAddress || "").trim();
  drawOptionalClientLine("Address", clientAddress);
  drawOptionalClientLine("BRN", draft.clientBrn.trim());
  drawOptionalClientLine("VAT", draft.clientVat.trim());

  y += 10;
  doc.setDrawColor(120);
  doc.line(margin, y, margin + contentWidth, y);
  y += 22;

  const descWidth = showLineItems ? pageWidth - margin * 2 - 220 : pageWidth - margin * 2 - 120;
  const colQtyX = pageWidth - margin - 180;
  const colUnitX = pageWidth - margin - 95;
  const colTotalX = pageWidth - margin;
  const totalsLabelRightX = pageWidth - margin - 120;

  if (showLineItems) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(accent.r, accent.g, accent.b);
    doc.text("Description", margin, y);
    doc.text("Quantity", colQtyX, y, { align: "right" });
    doc.text("Price", colUnitX, y, { align: "right" });
    doc.text("Total Price", colTotalX, y, { align: "right" });
    y += 20;
  }

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30);
  let rowY = y;
  if (!lineTotals.length) {
    doc.setFillColor(254, 242, 242);
    doc.rect(margin, rowY - 12, contentWidth, 30, "F");
    setMissingPdfStyle();
    doc.text("MISSING - ADD AT LEAST ONE PRODUCT LINE", margin + 6, rowY);
    rowY += 36;
  }
  lineTotals.forEach((line) => {
    const hasDescription = Boolean(line.description.trim());
    const quantity = safeNumber(line.quantity, 0);
    const unitPrice = safeNumber(line.unitPrice, 0);
    const descriptionLines = doc.splitTextToSize(
      hasDescription ? line.description : "MISSING ITEM DESCRIPTION",
      descWidth
    );
    const rowHeight = Math.max(30, descriptionLines.length * 14 + 12);
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, rowY - 12, contentWidth, rowHeight, "F");
    if (hasDescription) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30);
    } else {
      setMissingPdfStyle();
    }
    doc.text(descriptionLines, margin + 6, rowY);
    if (showLineItems) {
      if (quantity > 0) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30);
        doc.text(String(quantity), colQtyX, rowY, { align: "right" });
      } else {
        setMissingPdfStyle();
        doc.text("MISSING QTY", colQtyX, rowY, { align: "right" });
      }
      if (unitPrice > 0) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30);
        doc.text(formatMoney(unitPrice, draft.currency), colUnitX, rowY, { align: "right" });
      } else {
        setMissingPdfStyle();
        doc.text("MISSING PRICE", colUnitX, rowY, { align: "right" });
      }
    }
    if (quantity > 0 && unitPrice > 0) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30);
      doc.text(formatMoney(line.lineTotal, draft.currency), colTotalX, rowY, { align: "right" });
    } else {
      setMissingPdfStyle();
      doc.text("INCOMPLETE", colTotalX, rowY, { align: "right" });
    }
    rowY += rowHeight + 6;
  });

  y = rowY + 6;
  doc.setDrawColor(120);
  doc.line(margin, y, margin + contentWidth, y);
  y += 18;
  if (draft.showTotals) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50);
    if (showSubtotal) {
      doc.text("Subtotal", totalsLabelRightX, y, { align: "right" });
      doc.text(formatMoney(subtotal, draft.currency), colTotalX, y, { align: "right" });
    }
    if (deliveryFee > 0) {
      y += showSubtotal ? 16 : 0;
      doc.text("Delivery fee", totalsLabelRightX, y, { align: "right" });
      doc.text(formatMoney(deliveryFee, draft.currency), colTotalX, y, { align: "right" });
    }
    if (discount > 0) {
      y += showSubtotal || deliveryFee > 0 ? 16 : 0;
      doc.setTextColor(180, 0, 0);
      doc.text("Discount", totalsLabelRightX, y, { align: "right" });
      doc.text(formatMoney(-discount, draft.currency), colTotalX, y, { align: "right" });
      doc.setTextColor(50);
    }
    y += showSubtotal || deliveryFee > 0 || discount > 0 ? 22 : 0;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(grandTotal > 0 ? 20 : 220, grandTotal > 0 ? 20 : 38, grandTotal > 0 ? 20 : 38);
    doc.text("Grand Total", totalsLabelRightX, y, { align: "right" });
    doc.text(grandTotal > 0 ? formatMoney(grandTotal, draft.currency) : "MISSING PRICES", colTotalX, y, { align: "right" });
    doc.setFontSize(10);
  } else {
    doc.setFont("helvetica", "italic");
    doc.setTextColor(90);
    doc.text("Subtotal and grand total hidden until the client confirms the option.", pageWidth - margin, y, {
      align: "right",
    });
  }

  if (draft.documentType === "partial_receipt") {
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50);
    doc.text("Amount received", totalsLabelRightX, y, { align: "right" });
    doc.text(formatMoney(amountReceived, draft.currency), colTotalX, y, { align: "right" });
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20);
    doc.text("Balance due", totalsLabelRightX, y, { align: "right" });
    doc.text(formatMoney(balanceDue, draft.currency), colTotalX, y, { align: "right" });
    doc.setFontSize(10);
  }

  if (draft.notes.trim()) {
    y += 26;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80);
    doc.text("Notes", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60);
    const noteLines = doc.splitTextToSize(draft.notes, contentWidth - 12);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 12;
  }

  y += 32;
  doc.setFillColor(accent.r, accent.g, accent.b);
  doc.rect(margin, y, contentWidth, 18, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255);
  doc.text("TERMS AND CONDITIONS", margin + 6, y + 12);

  y += 30;
  const hasTerms = Boolean(draft.terms.trim());
  if (hasTerms) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40);
  } else {
    setMissingPdfStyle();
  }
  const splitTerms = doc.splitTextToSize(
    hasTerms ? draft.terms : "MISSING TERMS AND CONDITIONS",
    contentWidth - 12
  );
  const termsLines = Array.isArray(splitTerms) ? splitTerms : [splitTerms];
  termsLines.forEach((line: string, idx: number) => {
    doc.text(line, margin + 6, y + idx * 13);
  });

  y += termsLines.length * 13 + 18;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(accent.r, accent.g, accent.b);
  doc.text("Payment Details", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40);
  doc.text(`Payee: ${PAYMENT_DETAILS.payee}`, margin, y);
  y += 14;
  doc.text(`Bank: ${PAYMENT_DETAILS.bankName}`, margin, y);
  y += 14;
  doc.text(`Account No: ${PAYMENT_DETAILS.accountNumber}`, margin, y);

  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(`If you have any questions about this ${docTitle.toLowerCase()}, please contact`, margin, y);
  y += 16;
  doc.setTextColor(30);
  doc.text(
    `${BUSINESS_INFO.name} - ${BUSINESS_INFO.phone} - www.mo-tshirt.mu`,
    margin,
    y
  );
  y += 18;
  doc.setTextColor(0, 120, 255);
  doc.setFont("helvetica", "bold");
  doc.text("Thank You For Your Business!", margin + contentWidth / 2, y, { align: "center" });

  return doc;
}

export default function QuotationApprovalPage() {
  const { theme } = useAdminTheme();
  const isDark = theme === "dark";
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [documentAuthReady, setDocumentAuthReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");
  const [draft, setDraft] = useState<QuoteDraft | null>(null);
  const [quotationPreviewUrl, setQuotationPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [paymentVerificationSaving, setPaymentVerificationSaving] = useState(false);
  const [paymentOcrProgress, setPaymentOcrProgress] = useState<number | null>(null);
  const [paymentOcrRetryNonce, setPaymentOcrRetryNonce] = useState(0);
  const [clientStatusSaving, setClientStatusSaving] = useState(false);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [deletingQuote, setDeletingQuote] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [partnerRoutePopup, setPartnerRoutePopup] =
    useState<PartnerRoutePopup | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [movingToOrders, setMovingToOrders] = useState(false);
  const [assigningPartner, setAssigningPartner] = useState<PrintPartnerId | "both" | null>(null);
  const [productionManager, setProductionManager] =
    useState<ProductionManager>(DEFAULT_PRODUCTION_MANAGER);
  const [printPartners, setPrintPartners] = useState<PrintPartner[]>(PRINT_PARTNERS);
  const [workflowStudioOpen, setWorkflowStudioOpen] = useState(false);
  const [pendingMissingField, setPendingMissingField] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("inbox");
  const [inboxCollapsed, setInboxCollapsed] = useState(false);
  const [partnerVisibleFields, setPartnerVisibleFields] =
    useState<PartnerVisibleField[]>(DEFAULT_PARTNER_VISIBLE_FIELDS);
  const [partnerPrintPlacement, setPartnerPrintPlacement] =
    useState<PartnerPrintPlacement>("not_set");
  const [backgroundRemovalJobs, setBackgroundRemovalJobs] = useState<
    Record<string, BackgroundRemovalJob>
  >({});
  const [backgroundRemovalRetryNonce, setBackgroundRemovalRetryNonce] = useState(0);
  const [logo, setLogo] = useState<LogoAsset | null>(null);
  const [requestedQuoteId, setRequestedQuoteId] = useState<string | null>(null);
  const prevDocumentTypeRef = useRef<DocumentType | null>(null);
  const quotationPreviewUrlRef = useRef<string | null>(null);
  const designLogoSectionRef = useRef<HTMLDivElement | null>(null);
  const backgroundRemovalRunsRef = useRef(new Set<string>());
  const backgroundRemovalAttemptsRef = useRef(new Set<string>());
  const paymentOcrRunsRef = useRef(new Set<string>());
  const automaticReceiptRunsRef = useRef(new Set<string>());

  useEffect(() => {
    setRequestedQuoteId(new URLSearchParams(window.location.search).get("quoteId"));
  }, []);

  useEffect(() => {
    setInboxCollapsed(window.localStorage.getItem("quotation-inbox-collapsed") === "true");
  }, []);

  const toggleInboxCollapsed = () => {
    setInboxCollapsed((collapsed) => {
      const nextValue = !collapsed;
      window.localStorage.setItem("quotation-inbox-collapsed", String(nextValue));
      return nextValue;
    });
  };

  const openWorkflowStudioAt = (target?: string) => {
    setPendingMissingField(target || null);
    setWorkflowStudioOpen(true);
  };

  useEffect(() => {
    if (!workflowStudioOpen || !pendingMissingField) return;
    const timer = window.setTimeout(() => {
      const targets = Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-quotation-field="${pendingMissingField}"]`
        )
      );
      const target = targets.find((element) => element.getClientRects().length > 0);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
      setPendingMissingField(null);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [pendingMissingField, workflowStudioOpen]);

  useEffect(() => {
    let ignore = false;

    (async () => {
      try {
        const res = await fetch("/api/admin/partners", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(data?.partners)) return;
        if (!ignore) {
          setPrintPartners(data.partners as PrintPartner[]);
          setProductionManager(
            data?.manager && typeof data.manager === "object"
              ? (data.manager as ProductionManager)
              : DEFAULT_PRODUCTION_MANAGER
          );
        }
      } catch {
        // Keep bundled defaults available if the registry cannot be loaded.
      }
    })();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const img = new window.Image();
    img.onload = () => {
      if (!active) return;
      const targetMax = 600;
      const scale = Math.min(1, targetMax / Math.max(img.width, img.height));
      const scaledWidth = Math.max(1, Math.round(img.width * scale));
      const scaledHeight = Math.max(1, Math.round(img.height * scale));
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = scaledWidth;
      tempCanvas.height = scaledHeight;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;
      tempCtx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

      const imageData = tempCtx.getImageData(0, 0, scaledWidth, scaledHeight);
      const data = imageData.data;
      let minX = scaledWidth;
      let minY = scaledHeight;
      let maxX = 0;
      let maxY = 0;
      let found = false;

      for (let y = 0; y < scaledHeight; y += 1) {
        for (let x = 0; x < scaledWidth; x += 1) {
          const idx = (y * scaledWidth + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          const isTransparent = a < 10;
          const isNearWhite = r > 245 && g > 245 && b > 245;
          if (isTransparent || isNearWhite) continue;
          found = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }

      if (!found) {
        minX = 0;
        minY = 0;
        maxX = scaledWidth - 1;
        maxY = scaledHeight - 1;
      }

      const pad = 4;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(scaledWidth - 1, maxX + pad);
      maxY = Math.min(scaledHeight - 1, maxY + pad);
      const cropWidth = Math.max(1, maxX - minX + 1);
      const cropHeight = Math.max(1, maxY - minY + 1);

      const finalCanvas = document.createElement("canvas");
      const finalMaxWidth = 600;
      const scaleOut = Math.min(1, finalMaxWidth / cropWidth);
      const finalWidth = Math.max(1, Math.round(cropWidth * scaleOut));
      const finalHeight = Math.max(1, Math.round(cropHeight * scaleOut));
      finalCanvas.width = finalWidth;
      finalCanvas.height = finalHeight;
      const finalCtx = finalCanvas.getContext("2d");
      if (!finalCtx) return;
      finalCtx.drawImage(
        tempCanvas,
        minX,
        minY,
        cropWidth,
        cropHeight,
        0,
        0,
        finalWidth,
        finalHeight
      );
      const dataUrl = finalCanvas.toDataURL("image/png");
      const ratio = finalWidth / finalHeight;
      setLogo({ dataUrl, ratio });
    };
    img.src = "/MO T-SHIRT BUSINESS PRINTING.PNG";
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    (async () => {
      try {
        await ensureAdminFirebaseSession();
      } catch {
        // The Firestore listener below will surface a load error if auth is required.
      } finally {
        if (!ignore) setDocumentAuthReady(true);
      }
    })();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!documentAuthReady) return;
    const q = query(collection(db, "quotes"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((docSnap) => {
          const data = docSnap.data() as Partial<QuoteRecord> &
            Record<string, unknown>;
          return {
            id: docSnap.id,
            ...data,
            movedToOrdersAt: parseTimestamp(data.movedToOrdersAt),
            sentAt: parseTimestamp(data.sentAt),
            partner: parseQuotePartnerAssignment(data.partner),
            createdAt: parseTimestamp(data.createdAt),
            updatedAt: parseTimestamp(data.updatedAt),
          } as QuoteRecord;
        });
        setQuotes(next);
        setLoading(false);
        setError(null);
      },
      () => {
        setError("Failed to load quotations.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [documentAuthReady]);

  useEffect(() => {
    if (!quotes.length) {
      setSelectedId(null);
      return;
    }
    if (requestedQuoteId && quotes.find((q) => q.id === requestedQuoteId)) {
      setSelectedId(requestedQuoteId);
      return;
    }
    if (!selectedId || !quotes.find((q) => q.id === selectedId)) {
      setSelectedId(quotes[0].id);
    }
  }, [quotes, requestedQuoteId, selectedId]);

  const selected = useMemo(
    () => quotes.find((quote) => quote.id === selectedId) || null,
    [quotes, selectedId]
  );
  const printPartnerById = useMemo(
    () => new Map(printPartners.map((partner) => [partner.id, partner])),
    [printPartners]
  );
  const activePrintPartners = useMemo(
    () => printPartners.filter((partner) => partner.active),
    [printPartners]
  );
  const getPartnerDisplayName = (partnerId: PrintPartnerId) =>
    printPartnerById.get(partnerId)?.name || getPrintPartner(partnerId).name;
  const getPartnerRouteName = (partnerIds: PrintPartnerId[]) => {
    const labels = partnerIds
      .map((partnerId) => getPartnerDisplayName(partnerId))
      .filter(Boolean);
    return labels.length ? labels.join(" + ") : getPrintPartnerRouteLabel(partnerIds);
  };

  useEffect(() => {
    setWorkflowStudioOpen(false);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const frame = window.requestAnimationFrame(() => {
      designLogoSectionRef.current?.scrollIntoView({
        behavior: "auto",
        block: "start",
        inline: "nearest",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId]);
  const selectedPartnerIds =
    selected?.partner?.visibleTo?.length
      ? selected.partner.visibleTo
      : selected?.partner?.id
        ? [selected.partner.id]
        : [];
  const selectedPartnerLabel = selectedPartnerIds.length
    ? getPartnerRouteName(selectedPartnerIds)
    : "Not assigned yet";
  const lockedPartner = selected?.partner?.lockedBy
    ? printPartnerById.get(selected.partner.lockedBy) || getPrintPartner(selected.partner.lockedBy)
    : null;
  const isSharedPartnerOffer = selectedPartnerIds.length > 1 && !lockedPartner;
  const selectedPartnerResponses = selectedPartnerIds.map((partnerId) => {
    const response = selected?.partner?.responses?.find(
      (entry) => entry.partnerId === partnerId
    );
    if (response) return response;
    return {
      partnerId,
      partnerName: getPartnerDisplayName(partnerId),
      requestStatus: "pending",
      productionStatus: "not_started",
      printPlacement: "not_set",
      completionDays: null,
      price: null,
      comments: "",
      missingInformation: "",
      respondedAt: null,
      updatedAt: null,
    } satisfies QuotePartnerResponse;
  });
  const selectedPartnerResponseCount = selectedPartnerResponses.filter(
    partnerResponseHasContent
  ).length;

  const selectedDesignBrief = useMemo(
    () => parseDesignBrief(selected?.designBrief),
    [selected?.designBrief]
  );
  const selectedGarmentRows = useMemo(() => {
    if (selectedDesignBrief?.selectedSizes?.length) {
      return formatSizeRows(selectedDesignBrief.selectedSizes);
    }
    return (selected?.garments || [])
      .filter((entry) => safeNumber(entry.quantity, 0) > 0)
      .map((entry) => {
        return `${formatQuoteGarmentDescription(entry)} x ${safeNumber(entry.quantity, 0)}`;
      });
  }, [selectedDesignBrief, selected?.garments]);
  const selectedRequestedColors = useMemo(() => {
    if (selectedDesignBrief?.color?.trim()) {
      return [selectedDesignBrief.color.trim()];
    }

    return sortQuoteColors(
      (selected?.garments || [])
        .map((entry) => String(entry.color || "").trim())
        .filter(Boolean)
    );
  }, [selected, selectedDesignBrief]);
  const selectedClientNotes = useMemo(
    () => (selected ? extractClientNotes(selected, selectedDesignBrief) : ""),
    [selected, selectedDesignBrief]
  );
  const selectedDesignRows = useMemo(() => {
    if (!selectedDesignBrief) return [];
    const rows: string[] = [];
    if (selectedDesignBrief.frontText) rows.push(`Front text: ${selectedDesignBrief.frontText}`);
    if (selectedDesignBrief.backText) rows.push(`Back text: ${selectedDesignBrief.backText}`);
    if (selectedDesignBrief.frontLogo) rows.push("Front logo");
    if (selectedDesignBrief.backLogo) rows.push("Back logo");
    return rows;
  }, [selectedDesignBrief]);
  const selectedInferredPrintPlacement = useMemo(() => {
    const frontRequested = Boolean(
      selectedDesignBrief?.frontLogo || selectedDesignBrief?.frontText
    );
    const backRequested = Boolean(
      selectedDesignBrief?.backLogo || selectedDesignBrief?.backText
    );

    return inferPartnerPrintPlacementFromText(
      [
        ...selectedDesignRows,
        selectedClientNotes,
        selected?.printMethod || "",
        selected?.notes || "",
        selected?.message || "",
        ...(selected?.quote?.lines || []).map((line) => line.description || ""),
        ...(draft?.lines || []).map((line) => line.description || ""),
      ].join(" "),
      { front: frontRequested, back: backRequested }
    );
  }, [
    draft?.lines,
    selected?.message,
    selected?.notes,
    selected?.printMethod,
    selected?.quote?.lines,
    selectedClientNotes,
    selectedDesignBrief,
    selectedDesignRows,
  ]);
  const selectedTotalQty = useMemo(() => {
    if (selectedDesignBrief?.totalQty && selectedDesignBrief.totalQty > 0) {
      return selectedDesignBrief.totalQty;
    }
    return (selected?.garments || []).reduce((sum, entry) => sum + safeNumber(entry.quantity, 0), 0);
  }, [selected, selectedDesignBrief]);

  const selectedAttachments = useMemo(() => getQuoteAttachments(selected), [selected]);

  useEffect(() => {
    const evidence = selected?.paymentEvidence;
    if (!selected?.id || !evidence?.url || evidence.ocrStatus === "complete") return;

    const quoteId = selected.id;
    const runKey = `${quoteId}:${evidence.uploadId || evidence.url}:${paymentOcrRetryNonce}`;
    if (paymentOcrRunsRef.current.has(runKey)) return;
    paymentOcrRunsRef.current.add(runKey);
    setPaymentOcrProgress(0.02);

    void (async () => {
      let worker: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>> | null = null;
      try {
        await updateDoc(doc(db, "quotes", quoteId), {
          "paymentEvidence.ocrStatus": "processing",
          "paymentEvidence.ocrError": "",
          updatedAt: serverTimestamp(),
        });

        const response = await fetch(evidence.url!);
        if (!response.ok) throw new Error("The payment screenshot could not be downloaded.");
        const screenshot = await response.blob();
        const { createWorker } = await import("tesseract.js");
        worker = await createWorker("eng", 1, {
          logger: (message) => {
            if (message.status === "recognizing text") {
              setPaymentOcrProgress(Math.max(0.1, message.progress || 0));
            }
          },
        });
        const result = await worker.recognize(screenshot);
        const ocrText = (result.data.text || "").trim().slice(0, 12_000);
        const assessment = assessPaymentEvidence(ocrText);

        await updateDoc(doc(db, "quotes", quoteId), {
          "paymentEvidence.ocrStatus": "complete",
          "paymentEvidence.ocrError": "",
          "paymentEvidence.ocrText": ocrText,
          "paymentEvidence.assessment": assessment,
          "paymentEvidence.ocrCheckedAt": serverTimestamp(),
          "paymentEvidence.ocrCheckedAtIso": new Date().toISOString(),
          updatedAt: serverTimestamp(),
        });
        setPaymentOcrProgress(1);
      } catch (error) {
        const message = error instanceof Error ? error.message : "The OCR payment check failed.";
        console.error("quotes:payment-ocr", error);
        try {
          await updateDoc(doc(db, "quotes", quoteId), {
            "paymentEvidence.ocrStatus": "error",
            "paymentEvidence.ocrError": message,
            updatedAt: serverTimestamp(),
          });
        } catch (updateError) {
          console.error("quotes:payment-ocr-status", updateError);
        }
      } finally {
        await worker?.terminate();
        setPaymentOcrProgress(null);
      }
    })();
  }, [
    paymentOcrRetryNonce,
    selected?.id,
    selected?.paymentEvidence,
  ]);

  const retryPaymentOcr = async () => {
    if (!selected?.paymentEvidence) return;
    try {
      await updateDoc(doc(db, "quotes", selected.id), {
        "paymentEvidence.ocrStatus": "pending",
        "paymentEvidence.ocrError": "",
        updatedAt: serverTimestamp(),
      });
      setPaymentOcrRetryNonce((current) => current + 1);
    } catch {
      setNotice("Could not restart the OCR payment check.");
    }
  };

  useEffect(() => {
    if (!selected?.id || !selectedAttachments.length) return;
    const quoteId = selected.id;
    if (backgroundRemovalRunsRef.current.has(quoteId)) return;

    const pendingAttachments = selectedAttachments
      .map((attachment, index) => ({ attachment, index }))
      .filter(({ attachment, index }) => {
        if (!attachment.url || attachment.originalUrl) return false;
        if (
          !canAutomaticallyRemoveBackground({
            name: attachment.filename || `artwork-${index + 1}`,
            type: attachment.contentType || "",
          })
        ) {
          return false;
        }
        const key = getBackgroundRemovalJobKey(quoteId, attachment, index);
        return !backgroundRemovalAttemptsRef.current.has(key);
      });

    if (!pendingAttachments.length) return;
    backgroundRemovalRunsRef.current.add(quoteId);
    void backgroundRemovalRetryNonce;

    void (async () => {
      const workingAttachments = selectedAttachments.map((attachment) => ({ ...attachment }));

      for (const { attachment, index } of pendingAttachments) {
        const sourceUrl = attachment.url || "";
        const jobKey = getBackgroundRemovalJobKey(quoteId, attachment, index);
        backgroundRemovalAttemptsRef.current.add(jobKey);
        setBackgroundRemovalJobs((current) => ({
          ...current,
          [jobKey]: { status: "processing", progress: 0.02, label: "Starting automatic cleanup" },
        }));

        try {
          const response = await fetch(sourceUrl);
          if (!response.ok) throw new Error("The original logo could not be downloaded.");
          const sourceBlob = await response.blob();
          const sourceName = attachment.filename || `artwork-${index + 1}`;
          const sourceFile = new File([sourceBlob], sourceName, {
            type: attachment.contentType || sourceBlob.type || "image/png",
            lastModified: Date.now(),
          });
          const result = await removeBackgroundAutomatically(sourceFile, ({ progress, label }) => {
            setBackgroundRemovalJobs((current) => ({
              ...current,
              [jobKey]: { status: "processing", progress, label },
            }));
          });

          const transparentName = getTransparentArtworkName(sourceName, index);
          const safeName = transparentName.replace(/[^a-z0-9._-]/gi, "_");
          const uploadRef = ref(
            storage,
            `quotes/${quoteId}/background-removed/${Date.now()}-${index + 1}-${safeName}`
          );
          const snapshot = await uploadBytes(uploadRef, result.blob, {
            contentType: "image/png",
            customMetadata: {
              source: "automatic-background-remover",
              method: result.method,
            },
          });
          const transparentUrl = await getDownloadURL(snapshot.ref);
          workingAttachments[index] = {
            ...attachment,
            originalUrl: sourceUrl,
            originalFilename: sourceName,
            originalContentType: attachment.contentType || sourceBlob.type || "image/png",
            originalSize: attachment.size ?? sourceBlob.size,
            url: transparentUrl,
            filename: transparentName,
            contentType: "image/png",
            size: result.blob.size,
            backgroundRemovalMethod: result.method,
            backgroundRemovedAt: new Date().toISOString(),
          };
          await updateDoc(doc(db, "quotes", quoteId), {
            attachments: workingAttachments,
            attachment: workingAttachments[0] || null,
            updatedAt: serverTimestamp(),
          });
          setBackgroundRemovalJobs((current) => ({
            ...current,
            [jobKey]: { status: "done", progress: 1, label: "Transparent PNG ready" },
          }));
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : "Automatic cleanup failed.";
          console.error("quotes:automatic-background-removal", reason);
          setBackgroundRemovalJobs((current) => ({
            ...current,
            [jobKey]: {
              status: "error",
              progress: 0,
              label: "Cleanup needs another try",
              error: message,
            },
          }));
        }
      }
    })().finally(() => {
      backgroundRemovalRunsRef.current.delete(quoteId);
    });
  }, [backgroundRemovalRetryNonce, selected?.id, selectedAttachments]);

  function retryAutomaticBackgroundRemoval(attachment: QuoteAttachment, index: number) {
    if (!selected?.id) return;
    const jobKey = getBackgroundRemovalJobKey(selected.id, attachment, index);
    backgroundRemovalAttemptsRef.current.delete(jobKey);
    setBackgroundRemovalJobs((current) => {
      const next = { ...current };
      delete next[jobKey];
      return next;
    });
    setBackgroundRemovalRetryNonce((current) => current + 1);
  }

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft(buildDraftFromQuote(selected));
  }, [selected]);

  useEffect(() => {
    if (!selected || !draft) {
      if (quotationPreviewUrlRef.current) {
        URL.revokeObjectURL(quotationPreviewUrlRef.current);
        quotationPreviewUrlRef.current = null;
      }
      setQuotationPreviewUrl(null);
      return;
    }

    const timer = window.setTimeout(() => {
      const previewDoc = buildPdfDoc(selected, draft, logo);
      const nextUrl = URL.createObjectURL(previewDoc.output("blob"));
      const previousUrl = quotationPreviewUrlRef.current;
      quotationPreviewUrlRef.current = nextUrl;
      setQuotationPreviewUrl(nextUrl);
      if (previousUrl) URL.revokeObjectURL(previousUrl);
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [draft, logo, selected]);

  useEffect(() => {
    return () => {
      if (quotationPreviewUrlRef.current) {
        URL.revokeObjectURL(quotationPreviewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      setPartnerVisibleFields(DEFAULT_PARTNER_VISIBLE_FIELDS);
      return;
    }
    setPartnerVisibleFields(normalizePartnerVisibleFields(selected.partner?.visibleFields));
  }, [selected]);

  useEffect(() => {
    if (!selected) {
      setPartnerPrintPlacement("not_set");
      return;
    }
    const storedPlacement = normalizePartnerPrintPlacement(selected.partner?.printPlacement);
    setPartnerPrintPlacement(
      storedPlacement !== "not_set" ? storedPlacement : selectedInferredPrintPlacement
    );
  }, [selected, selectedInferredPrintPlacement]);

  useEffect(() => {
    if (!draft) return;
    const prevType = prevDocumentTypeRef.current;
    prevDocumentTypeRef.current = draft.documentType;
    if (!prevType || prevType === draft.documentType) return;
    const nextTerms = getDefaultTerms(draft.documentType);
    setDraft((prev) => (prev ? { ...prev, terms: nextTerms } : prev));
  }, [draft]);

  function updateDraftDocumentType(documentType: DocumentType) {
    setDraft((current) =>
      current
        ? {
            ...current,
            documentType,
            documentNumber: normalizeDocumentNumberForType(current.documentNumber, documentType),
          }
        : current
    );
  }

  const filtered = useMemo(() => {
    return quotes.filter((quote) => {
      if (statusFilter !== "all" && quote.status !== statusFilter) return false;
      if (!search) return true;
      const query = search.toLowerCase();
      return (
        quote.name?.toLowerCase().includes(query) ||
        quote.email?.toLowerCase().includes(query) ||
        quote.phone?.toLowerCase().includes(query) ||
        quote.source?.toLowerCase().includes(query)
      );
    });
  }, [quotes, search, statusFilter]);

  const stats = useMemo(() => {
    const base = { total: quotes.length, new: 0, review: 0, approved: 0, sent: 0 };
    quotes.forEach((quote) => {
      const status = quote.status || "new";
      base[status] += 1;
    });
    return base;
  }, [quotes]);

  const totals = useMemo(() => {
    if (!draft) {
      return {
        subtotal: 0,
        total: 0,
        amountReceived: 0,
        balanceDue: 0,
        lineCount: 0,
        includedLineCount: 0,
        deliveryFee: 0,
        discount: 0,
        showSubtotal: false,
        showTotals: true,
      };
    }
    const pricing = getDraftPricingSummary(draft);
    const lineCount = draft.lines.length;
    return {
      ...pricing,
      lineCount,
      showTotals: draft.showTotals,
    };
  }, [draft]);

  const quotationMissingFields = useMemo(() => {
    if (!draft) return [] as QuotationMissingField[];
    const missing: QuotationMissingField[] = [];
    const requireText = (value: string, label: string, target: string) => {
      if (!value.trim()) missing.push({ label, target });
    };
    requireText(draft.contactName, "Client contact name", "contact-name");
    requireText(draft.contactEmail, "Client email", "contact-email");
    requireText(draft.contactPhone, "Client phone", "contact-phone");
    requireText(draft.clientCompany, "Client / company name", "client-company");
    requireText(draft.documentNumber, "Quotation number", "document-number");
    requireText(draft.documentDate, "Quotation date", "document-date");
    if (draft.documentType === "quotation") {
      requireText(draft.validUntil, "Valid-until date", "valid-until");
    }
    requireText(draft.preparedBy, "Prepared by", "prepared-by");
    requireText(draft.terms, "Terms and payment details", "terms");

    if (!draft.lines.length) {
      missing.push({ label: "At least one line item", target: "add-line-item" });
    } else {
      draft.lines.forEach((line, index) => {
        const lineNumber = index + 1;
        if (!line.description.trim()) {
          missing.push({
            label: `Line ${lineNumber} description`,
            target: `line-${index}-description`,
          });
        }
        if (safeNumber(line.quantity, 0) <= 0) {
          missing.push({
            label: `Line ${lineNumber} quantity`,
            target: `line-${index}-quantity`,
          });
        }
        if (safeNumber(line.unitPrice, 0) <= 0) {
          missing.push({
            label: `Line ${lineNumber} unit price`,
            target: `line-${index}-unit-price`,
          });
        }
      });
    }
    return missing;
  }, [draft]);
  const quotationMissingCount = quotationMissingFields.length;

  const paymentStatusOptions = useMemo(() => {
    if (!draft) return [];
    if (draft.documentType === "quotation") return ["Quotation only"];
    if (draft.documentType === "receipt") return ["Paid"];
    if (draft.documentType === "partial_receipt") return ["Partially paid"];
    return ["Unpaid", "Partially paid", "Paid"];
  }, [draft]);

  const documentTypeLabel = draft ? DOC_TYPE_LABELS[draft.documentType] : "";

  const selectedStatus: QuoteStatus = (selected?.status || "new") as QuoteStatus;
  const selectedPrimaryStatus = useMemo(() => {
    if (!selected) return null;
    const persistedType = getQuoteDocumentType(selected);
    const activeType = selectedStatus === "sent" ? persistedType : draft?.documentType || persistedType;
    return getPrimaryStatusMeta(selectedStatus, activeType);
  }, [selected, selectedStatus, draft?.documentType]);
  const selectedPaymentStatus = useMemo(
    () => (selected ? getPaymentStatusMeta(selected) : null),
    [selected]
  );
  const selectedPaymentComparison = useMemo(
    () => comparePaymentAmount(selected?.paymentEvidence?.assessment?.amount, totals.total),
    [selected?.paymentEvidence?.assessment?.amount, totals.total]
  );
  const paymentReceiptDraft = useMemo(() => {
    if (!selected?.paymentReceipt) return null;
    return buildDraftFromQuote({
      ...selected,
      quote: {
        ...selected.paymentReceipt,
        documentType: "receipt",
        paymentStatus: "Paid",
      },
    });
  }, [selected]);
  const clientWorkflowStatus = useMemo(() => {
    const responseDate = parseTimestamp(selected?.clientDecisionAtIso);
    const formattedResponseDate = responseDate
      ? format(responseDate, "dd MMM yyyy, HH:mm")
      : "";
    const formattedSentDate = selected?.sentAt
      ? format(selected.sentAt, "dd MMM yyyy, HH:mm")
      : "";

    if (selected?.clientDecision === "accepted") {
      return {
        label: "Client accepted",
        detail: formattedResponseDate
          ? `Accepted on ${formattedResponseDate}.`
          : "The client accepted this quotation.",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
        state: "accepted" as const,
      };
    }
    if (selected?.clientDecision === "changes_requested") {
      return {
        label: "Changes requested",
        detail: selected.clientDecisionComment || (formattedResponseDate
          ? `Client responded on ${formattedResponseDate}.`
          : "The client asked for changes."),
        tone: "border-amber-200 bg-amber-50 text-amber-800",
        state: "changes" as const,
      };
    }
    if (selected?.clientDecision === "rejected") {
      return {
        label: "Client rejected",
        detail: selected.clientDecisionComment || (formattedResponseDate
          ? `Client responded on ${formattedResponseDate}.`
          : "The client rejected this quotation."),
        tone: "border-red-200 bg-red-50 text-red-800",
        state: "rejected" as const,
      };
    }
    if (selectedStatus === "sent") {
      return {
        label: "Sent · waiting for client",
        detail: formattedSentDate
          ? `Sent to ${draft?.contactEmail || selected?.email || "the client"} on ${formattedSentDate}.`
          : `Sent to ${draft?.contactEmail || selected?.email || "the client"}; no response yet.`,
        tone: "border-blue-200 bg-blue-50 text-blue-800",
        state: "waiting" as const,
      };
    }
    if (selectedStatus === "approved") {
      return {
        label: "Approved internally · not sent",
        detail: "The team approved this quotation, but it has not been sent to the client.",
        tone: "border-violet-200 bg-violet-50 text-violet-800",
        state: "approved" as const,
      };
    }
    return {
      label: "Not sent to client",
      detail: selectedStatus === "review"
        ? "The request was reviewed. Complete the quotation and send it when ready."
        : "This is a new request. Complete the missing information before sending.",
      tone: "border-slate-200 bg-slate-50 text-slate-700",
      state: "not_sent" as const,
    };
  }, [draft?.contactEmail, selected, selectedStatus]);

  const sendValidationError = useMemo(
    () => (draft ? validateDraftBeforeSend(draft) : "Select a quotation first."),
    [draft]
  );
  const quoteIsMarkedApproved = selectedStatus === "approved" || selectedStatus === "sent";
  const quoteHasBeenSent = selectedStatus === "sent";
  const quoteInOrders = Boolean(selected?.orderTransactionId);
  const moveToOrdersError = sendValidationError;
  const moveToOrdersTitle = moveToOrdersError
    ? moveToOrdersError
    : quoteIsMarkedApproved
      ? "Create or sync this quotation into Order Management."
      : "Complete Step 2 first (Mark approved or Send to client).";
  const simpleNextAction = !selected
    ? "Choose a quotation"
    : selected.clientDecision === "changes_requested"
      ? "Review client changes"
      : selected.clientDecision === "rejected"
        ? "Review client response"
        : selectedStatus === "sent" && !selected.clientDecision
          ? "Waiting for client"
    : selectedStatus === "new"
      ? "Read the request"
      : sendValidationError
        ? "Fix the document"
        : !quoteIsMarkedApproved
          ? "Approve or send"
          : quoteInOrders
            ? "Order is ready"
            : "Move to orders";

  const buildStoredQuotePayload = useCallback((baseDraft: QuoteDraft) => {
    const pricing = getDraftPricingSummary(baseDraft);
    return {
      documentType: baseDraft.documentType,
      documentNumber: baseDraft.documentNumber,
      documentDate: baseDraft.documentDate,
      clientCompany: baseDraft.clientCompany,
      clientAddress: baseDraft.clientAddress,
      clientBrn: baseDraft.clientBrn,
      clientVat: baseDraft.clientVat,
      paymentStatus: baseDraft.paymentStatus,
      preparedBy: baseDraft.preparedBy,
      showLineItems: baseDraft.showLineItems,
      showTotals: baseDraft.showTotals,
      currency: baseDraft.currency,
      lines: baseDraft.lines.map((line) => ({
        description: line.description,
        quantity: safeNumber(line.quantity, 0),
        unitPrice: safeNumber(line.unitPrice, 0),
        includeInTotals: true,
      })),
      deliveryFee: safeNumber(baseDraft.deliveryFee, 0),
      discount: safeNumber(baseDraft.discount, 0),
      amountReceived: safeNumber(baseDraft.amountReceived, 0),
      notes: baseDraft.notes,
      validUntil: baseDraft.validUntil,
      terms: baseDraft.terms,
      subtotal: pricing.subtotal,
      total: pricing.total,
    };
  }, []);

  const buildPaidReceiptRecord = useCallback((
    baseDraft: QuoteDraft,
    generatedAtIso: string,
    sourcePaymentEvidenceUploadId: string
  ) => {
    const receiptDraft: QuoteDraft = {
      ...baseDraft,
      documentType: "receipt",
      documentNumber: normalizeDocumentNumberForType(baseDraft.documentNumber, "receipt"),
      documentDate: format(new Date(generatedAtIso), "yyyy-MM-dd"),
      paymentStatus: "Paid",
      amountReceived: getDraftPricingSummary(baseDraft).total,
      terms: getDefaultTerms("receipt"),
    };
    return {
      receiptId: crypto.randomUUID(),
      ...buildStoredQuotePayload(receiptDraft),
      documentType: "receipt" as const,
      paymentStatus: "Paid" as const,
      generatedAtIso,
      sourcePaymentEvidenceUploadId,
    };
  }, [buildStoredQuotePayload]);

  useEffect(() => {
    if (
      !selected ||
      selected.paymentEvidence?.verificationStatus !== "confirmed" ||
      selected.paymentReceipt
    ) {
      return;
    }

    const runKey = `${selected.id}:${selected.paymentEvidence.uploadId || "confirmed-payment"}`;
    if (automaticReceiptRunsRef.current.has(runKey)) return;
    automaticReceiptRunsRef.current.add(runKey);

    const generatedAtIso = new Date().toISOString();
    const receiptRecord = buildPaidReceiptRecord(
      buildDraftFromQuote(selected),
      generatedAtIso,
      selected.paymentEvidence.uploadId || ""
    );
    let active = true;

    void updateDoc(doc(db, "quotes", selected.id), {
      paymentReceipt: receiptRecord,
      paymentReceiptHistory: arrayUnion(receiptRecord),
      updatedAt: serverTimestamp(),
    })
      .then(() => {
        if (active) setNotice("A paid receipt was generated for the confirmed payment.");
      })
      .catch(() => {
        automaticReceiptRunsRef.current.delete(runKey);
        if (active) setNotice("The payment is confirmed, but the receipt could not be generated.");
      });

    return () => {
      active = false;
    };
  }, [buildPaidReceiptRecord, selected]);

  useEffect(() => {
    if (!draft || !paymentStatusOptions.length) return;
    if (draft.paymentStatus === "Half paid" && draft.documentType === "invoice") {
      setDraft((prev) => (prev ? { ...prev, paymentStatus: "Partially paid" } : prev));
      return;
    }
    if (draft.documentType === "receipt" && draft.paymentStatus !== "Paid") {
      setDraft((prev) => (prev ? { ...prev, paymentStatus: "Paid" } : prev));
      return;
    }
    if (draft.documentType === "partial_receipt" && draft.paymentStatus !== "Partially paid") {
      setDraft((prev) => (prev ? { ...prev, paymentStatus: "Partially paid" } : prev));
      return;
    }
    if (!paymentStatusOptions.includes(draft.paymentStatus)) {
      setDraft((prev) =>
        prev ? { ...prev, paymentStatus: paymentStatusOptions[0] } : prev
      );
    }
  }, [draft, paymentStatusOptions]);

  const updateDraftLine = (index: number, patch: Partial<QuoteLine>) => {
    if (!draft) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const next = prev.lines.slice();
      if (!next[index]) return prev;
      next[index] = {
        ...next[index],
        ...patch,
      };
      return { ...prev, lines: next };
    });
  };

  const addDraftLine = (description = "Product / Size") => {
    if (!draft) return;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            lines: [...prev.lines, { description, quantity: 1, unitPrice: "", includeInTotals: true }],
          }
        : prev
    );
  };

  const removeDraftLine = (index: number) => {
    if (!draft) return;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            lines: prev.lines.filter((_, i) => i !== index),
          }
        : prev
    );
  };

  const saveDraft = async (
    nextStatus?: QuoteStatus,
    options: { showNotice?: boolean } = {}
  ) => {
    const showNotice = options.showNotice ?? true;
    if (!selected || !draft) return false;
    setSaving(true);
    if (showNotice) setNotice(null);
    try {
      const payload = buildStoredQuotePayload(draft);
      await updateDoc(doc(db, "quotes", selected.id), {
        status: nextStatus || selected.status || "review",
        name: draft.contactName.trim() || "Walk-in client",
        email: draft.contactEmail.trim(),
        phone: draft.contactPhone.trim(),
        quote: payload,
        updatedAt: serverTimestamp(),
      });
      if (showNotice) setNotice("Document saved.");
      return true;
    } catch {
      setNotice("Failed to save document.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateSelectedStatus = async (nextStatus: QuoteStatus, successNotice: string) => {
    if (!selected) return;
    setStatusSaving(true);
    setNotice(null);
    try {
      await updateDoc(doc(db, "quotes", selected.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      setNotice(successNotice);
    } catch {
      setNotice("Failed to update status.");
    } finally {
      setStatusSaving(false);
    }
  };

  const confirmSelectedPaymentEvidence = async () => {
    if (!selected?.paymentEvidence || !draft) return;
    setPaymentVerificationSaving(true);
    setNotice(null);
    try {
      const confirmedAtIso = new Date().toISOString();
      const receiptRecord = buildPaidReceiptRecord(
        draft,
        confirmedAtIso,
        selected.paymentEvidence.uploadId || ""
      );
      await updateDoc(doc(db, "quotes", selected.id), {
        "paymentEvidence.verificationStatus": "confirmed",
        "paymentEvidence.confirmedAt": serverTimestamp(),
        "paymentEvidence.confirmedAtIso": confirmedAtIso,
        paymentReceipt: receiptRecord,
        paymentReceiptHistory: arrayUnion(receiptRecord),
        updatedAt: serverTimestamp(),
      });
      setNotice("Bank payment confirmed. A paid receipt was generated automatically.");
    } catch {
      setNotice("Failed to confirm payment evidence.");
    } finally {
      setPaymentVerificationSaving(false);
    }
  };

  const updatePartnerClientStatus = async (nextStatus: PartnerClientStatus) => {
    if (!selected?.partner) return;
    setClientStatusSaving(true);
    setNotice(null);
    try {
      await updateDoc(doc(db, "quotes", selected.id), {
        "partner.clientStatus": nextStatus,
        "partner.updatedAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNotice(`Client status updated: ${PARTNER_CLIENT_STATUS_LABELS[nextStatus]}.`);
    } catch {
      setNotice("Failed to update client status.");
    } finally {
      setClientStatusSaving(false);
    }
  };

  const togglePartnerVisibleField = (field: PartnerVisibleField) => {
    setPartnerVisibleFields((current) => {
      if (current.includes(field)) {
        const next = current.filter((entry) => entry !== field);
        return next.length ? next : current;
      }
      return [...current, field];
    });
  };

  const arePartnerRoutesSame = (left: PrintPartnerId[], right: PrintPartnerId[]) => {
    return left.length === right.length && left.every((partnerId) => right.includes(partnerId));
  };

  const notifyPartnerAssignment = async (
    partnerIds: PrintPartnerId[]
  ): Promise<PartnerEmailNotificationSummary> => {
    if (!selected) {
      return { sentNames: [], skippedMessages: [], message: "" };
    }
    const res = await fetch("/api/admin/partners/order-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteId: selected.id,
        partnerIds,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || "Email notification could not be sent.");
    }

    const sent = Array.isArray(data?.sent) ? data.sent : [];
    const skipped = Array.isArray(data?.skipped) ? data.skipped : [];
    const sentNames = sent
      .map((entry: { partnerName?: unknown; emails?: unknown }) =>
        getSentPartnerLabel(entry)
      )
      .filter(Boolean);
    const skippedMessages = skipped
      .map((entry: { partnerName?: unknown; reason?: unknown }) => {
        const name = typeof entry.partnerName === "string" ? entry.partnerName : "Partner";
        const reason = typeof entry.reason === "string" ? entry.reason : "Skipped.";
        return `${name}: ${reason}`;
      })
      .filter(Boolean);

    return {
      sentNames,
      skippedMessages,
      message: buildPartnerEmailMessage(sentNames, skippedMessages),
    };
  };

  const getPartnerRoutePopupTitle = (
    partnerIds: PrintPartnerId[],
    sameRoute: boolean,
    routeLabel: string
  ) => {
    if (sameRoute) return `Updated ${routeLabel} view`;
    if (partnerIds.length > 1) return `Order sent to ${routeLabel}`;
    return `Order moved to ${routeLabel}`;
  };

  const showPartnerRoutePopup = ({
    title,
    message,
    tone,
  }: PartnerRoutePopup) => {
    setPartnerRoutePopup({ title, message, tone });
  };

  const assignToPartners = async (partnerIds: PrintPartnerId[]) => {
    if (!selected) return;
    const activePartnerIds = new Set(printPartners.filter((partner) => partner.active).map((partner) => partner.id));
    const routePartnerIds = normalizePrintPartnerIds(partnerIds).filter((partnerId) =>
      activePartnerIds.has(partnerId)
    );
    if (!routePartnerIds.length) return;
    const routeKey: PrintPartnerId | "both" =
      routePartnerIds.length > 1 ? "both" : routePartnerIds[0];
    const routeLabel = getPartnerRouteName(routePartnerIds);
    const visibleFields = normalizePartnerVisibleFields(partnerVisibleFields);
    const hasOpenableArtwork =
      visibleFields.includes("artwork") &&
      selectedAttachments.some((attachment) => attachment.url);
    const hasEmailOnlyArtwork =
      visibleFields.includes("artwork") &&
      !hasOpenableArtwork &&
      selectedAttachments.some((attachment) => !attachment.url);
    const currentPartnerIds = selected.partner?.visibleTo?.length
      ? selected.partner.visibleTo
      : selected.partner?.id
        ? [selected.partner.id]
        : [];
    const sameRoute = arePartnerRoutesSame(currentPartnerIds, routePartnerIds);
    const resetPartnerResponse = !sameRoute;
    const singlePartner =
      routePartnerIds.length === 1
        ? printPartnerById.get(routePartnerIds[0]) || getPrintPartner(routePartnerIds[0])
        : null;
    const updatePayload: Record<string, unknown> = {
      "partner.id": singlePartner?.id || null,
      "partner.name": singlePartner?.name || routeLabel,
      "partner.visibleTo": routePartnerIds,
      "partner.lockedBy": null,
      "partner.visibleFields": visibleFields,
      "partner.printPlacement": partnerPrintPlacement,
      "partner.updatedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (!sameRoute) {
      updatePayload["partner.assignedAt"] = serverTimestamp();
    }

    if (resetPartnerResponse) {
      updatePayload["partner.requestStatus"] = "pending";
      updatePayload["partner.productionStatus"] = "not_started";
      updatePayload["partner.clientStatus"] = "not_set";
      updatePayload["partner.completionDays"] = null;
      updatePayload["partner.price"] = null;
      updatePayload["partner.comments"] = "";
      updatePayload["partner.missingInformation"] = "";
      updatePayload["partner.printPlacement"] = partnerPrintPlacement;
      updatePayload["partner.respondedAt"] = null;
      updatePayload["partner.responses"] = {};
    }

    setAssigningPartner(routeKey);
    setNotice(null);
    setPartnerRoutePopup(null);
    try {
      await updateDoc(doc(db, "quotes", selected.id), updatePayload);
      const routeNotice = hasEmailOnlyArtwork
        ? `${routeLabel}'s view was updated, but at least one artwork file is email-only. Re-upload it under Artwork so the partner can open the file.`
        : sameRoute
          ? `Visible fields updated for ${routeLabel}.`
          : routePartnerIds.length > 1
            ? `Sent to ${routeLabel}. The first partner to accept will own this job.`
            : `Moved order to ${routeLabel}'s production desk.`;
      const popupTitle = getPartnerRoutePopupTitle(routePartnerIds, sameRoute, routeLabel);
      try {
        const emailSummary = await notifyPartnerAssignment(routePartnerIds);
        const finalNotice = emailSummary.message
          ? `${routeNotice} ${emailSummary.message}`
          : routeNotice;
        setNotice(finalNotice);
        showPartnerRoutePopup({
          title: popupTitle,
          message: finalNotice,
          tone:
            hasEmailOnlyArtwork ||
            !emailSummary.sentNames.length ||
            emailSummary.skippedMessages.length
              ? "warning"
              : "success",
        });
      } catch (notificationError) {
        const message =
          notificationError instanceof Error
            ? notificationError.message
            : "Email notification could not be sent.";
        const finalNotice = `${routeNotice} ${message}`;
        setNotice(finalNotice);
        showPartnerRoutePopup({
          title: popupTitle,
          message: finalNotice,
          tone: "warning",
        });
      }
    } catch {
      const finalNotice = `Failed to assign order to ${routeLabel}.`;
      setNotice(finalNotice);
      showPartnerRoutePopup({
        title: "Partner routing failed",
        message: finalNotice,
        tone: "warning",
      });
    } finally {
      setAssigningPartner(null);
    }
  };

  const handleDeleteQuote = async () => {
    if (!selected) return;
    const password = window.prompt("Enter your own administrator login password to delete this quotation.");
    if (password === null) return;
    const cleanPassword = password.trim();
    if (!cleanPassword) {
      setNotice("Password is required to delete.");
      return;
    }

    const targetName = draft?.contactName || selected.name || "this client";
    const confirmed = window.confirm(`Delete quotation for ${targetName}? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingQuote(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/quotes/${selected.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: cleanPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to delete quote.");
      }
      setNotice("Quotation deleted.");
      setSelectedId(null);
      setDraft(null);
      setMobilePanel("inbox");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete quote.";
      setNotice(message);
    } finally {
      setDeletingQuote(false);
    }
  };

  const createAdminQuote = async () => {
    setCreatingQuote(true);
    setNotice(null);
    try {
      const now = new Date();
      const documentDate = format(now, "yyyy-MM-dd");
      const initialDraft: QuoteDraft = {
        contactName: "Walk-in client",
        contactEmail: "",
        contactPhone: "",
        documentType: "quotation",
        documentNumber: `Q-${String(Date.now()).slice(-6)}`,
        documentDate,
        clientCompany: "Walk-in client",
        clientAddress: "",
        clientBrn: "",
        clientVat: "",
        paymentStatus: "Quotation only",
        preparedBy: DEFAULT_PREPARED_BY,
        showLineItems: true,
        showTotals: true,
        currency: "Rs",
        lines: [{ description: "Product / Size", quantity: 1, unitPrice: "", includeInTotals: true }],
        deliveryFee: 0,
        discount: 0,
        amountReceived: 0,
        notes: "",
        validUntil: format(addDays(now, 7), "yyyy-MM-dd"),
        terms: getDefaultTerms("quotation"),
      };

      const ref = await addDoc(collection(db, "quotes"), {
        name: initialDraft.contactName,
        email: initialDraft.contactEmail,
        phone: initialDraft.contactPhone,
        message: "Created from Mo Admin",
        garments: [{ garment: "Custom item", color: "", size: "", quantity: 1 }],
        source: "Mo Admin",
        status: "review",
        quote: {
          documentType: initialDraft.documentType,
          documentNumber: initialDraft.documentNumber,
          documentDate: initialDraft.documentDate,
          clientCompany: initialDraft.clientCompany,
          clientAddress: initialDraft.clientAddress,
          clientBrn: initialDraft.clientBrn,
          clientVat: initialDraft.clientVat,
          paymentStatus: initialDraft.paymentStatus,
          preparedBy: initialDraft.preparedBy,
          showLineItems: initialDraft.showLineItems,
          showTotals: initialDraft.showTotals,
          currency: initialDraft.currency,
          lines: initialDraft.lines,
          deliveryFee: initialDraft.deliveryFee,
          discount: initialDraft.discount,
          amountReceived: initialDraft.amountReceived,
          notes: initialDraft.notes,
          validUntil: initialDraft.validUntil,
          terms: initialDraft.terms,
          subtotal: 0,
          total: 0,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setStatusFilter("all");
      setSearch("");
      setSelectedId(ref.id);
      setMobilePanel("quote");
      setDraft(initialDraft);
      setNotice("New quotation created. Fill details, then save.");
    } catch {
      setNotice("Failed to create new quotation.");
    } finally {
      setCreatingQuote(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!selected || !draft) return;
    const doc = buildPdfDoc(selected, draft, logo);
    const filePrefix = draft.documentType.replace(/_/g, "-");
    doc.save(`${filePrefix}-${selected.id}.pdf`);
  };

  const handleViewPdf = () => {
    if (!selected || !draft) return;
    const doc = buildPdfDoc(selected, draft, logo);
    const url = doc.output("bloburl");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDownloadPaymentReceipt = () => {
    if (!selected || !paymentReceiptDraft) return;
    const receiptPdf = buildPdfDoc(selected, paymentReceiptDraft, logo);
    receiptPdf.save(`${paymentReceiptDraft.documentNumber || `receipt-${selected.id}`}.pdf`);
  };

  const handleViewPaymentReceipt = () => {
    if (!selected || !paymentReceiptDraft) return;
    const receiptPdf = buildPdfDoc(selected, paymentReceiptDraft, logo);
    const url = receiptPdf.output("bloburl");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleSend = async () => {
    if (!selected || !draft) return;
    const draftValidation = validateDraftBeforeSend(draft);
    if (draftValidation) {
      setNotice(draftValidation);
      return;
    }
    const recipientEmail = draft.contactEmail.trim();
    if (!recipientEmail) {
      setNotice("Add a client email before sending.");
      return;
    }
    setSending(true);
    setNotice(null);
    try {
      let pdfBlob: Blob;
      try {
        const pdfDoc = buildPdfDoc(selected, draft, logo);
        pdfBlob = pdfDoc.output("blob");
      } catch (error) {
        console.warn("quotes:send:pdf-logo-fallback", error);
        const fallbackPdfDoc = buildPdfDoc(selected, draft, null);
        pdfBlob = fallbackPdfDoc.output("blob");
      }
      const clientName = draft.contactName.trim() || selected.name || "there";
      const documentLabel = DOC_TYPE_LABELS[draft.documentType].toLowerCase();
      const payload = new FormData();
      payload.set("quoteId", selected.id);
      payload.set("to", recipientEmail);
      payload.set("clientName", draft.contactName.trim());
      payload.set("clientEmail", draft.contactEmail.trim());
      payload.set("clientPhone", draft.contactPhone.trim());
      payload.set("subject", `Your ${documentLabel} from MO T-SHIRT`);
      payload.set(
        "message",
        draft.notes?.trim()
          ? `Hi ${clientName},\n\nPlease find your ${documentLabel} attached.\n\n${draft.notes}\n\nBest regards,\nMo T-Shirt Team`
          : `Hi ${clientName},\n\nPlease find your ${documentLabel} attached.\n\nBest regards,\nMo T-Shirt Team`
      );
      payload.set("quote", JSON.stringify(buildStoredQuotePayload(draft)));
      payload.set("pdf", pdfBlob, `${draft.documentNumber || selected.id}.pdf`);

      const res = await fetch("/api/admin/quotes/send", {
        method: "POST",
        body: payload,
      });
      const response = await res.json().catch(() => ({})) as { error?: string; warning?: string };
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Your admin session expired. Please sign in again, then press Send.");
        }
        throw new Error(response.error || "The quotation could not be sent. Please try again.");
      }
      setNotice(response.warning || `${DOC_TYPE_LABELS[draft.documentType]} sent to ${recipientEmail}.`);
    } catch (error) {
      console.error("quotes:send:client", error);
      setNotice(error instanceof Error ? error.message : `Could not send ${DOC_TYPE_LABELS[draft.documentType].toLowerCase()}.`);
    } finally {
      setSending(false);
    }
  };

  const handleAttachmentUpload = async (files: File[]) => {
    if (!selected) return;
    if (!files.length) return;
    setUploadingAttachment(true);
    setNotice(null);
    try {
      const existingAttachments = getQuoteAttachments(selected);
      const uploadedAttachments = await Promise.all(
        files.map(async (file, index) => {
          const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_");
          const uploadRef = ref(storage, `quotes/${selected.id}/${Date.now()}-${index + 1}-${safeName}`);
          const snap = await uploadBytes(uploadRef, file);
          const url = await getDownloadURL(snap.ref);
          return {
            url,
            filename: file.name,
            contentType: file.type,
            size: file.size,
          } satisfies QuoteAttachment;
        })
      );
      const nextAttachments = [
        ...existingAttachments.filter((attachment) => attachment.url),
        ...uploadedAttachments,
      ];
      await updateDoc(doc(db, "quotes", selected.id), {
        attachments: nextAttachments,
        attachment: nextAttachments[0] || null,
        updatedAt: serverTimestamp(),
      });
      setNotice(
        uploadedAttachments.length > 1
          ? "Files uploaded. Transparent PNGs are being prepared automatically."
          : "Attachment uploaded. A transparent PNG is being prepared automatically."
      );
    } catch (error) {
      console.error("quotes:attachment-upload", error);
      setNotice(getStorageUploadErrorMessage(error));
    } finally {
      setUploadingAttachment(false);
    }
  };

  const mapPaymentMethodForOrder = (
    paymentStatus: string
  ): "Full Payment" | "Part Payment" | "Select Payment Status" => {
    const normalized = paymentStatus.toLowerCase();
    if (normalized.includes("paid") && !normalized.includes("partial")) return "Full Payment";
    if (normalized.includes("partial")) return "Part Payment";
    return "Select Payment Status";
  };

  const moveToOrders = async (options: { showNotice?: boolean } = {}) => {
    const showNotice = options.showNotice ?? true;
    if (!selected || !draft) return null;
    const draftValidation = validateDraftBeforeSend(draft);
    if (draftValidation) {
      setNotice(draftValidation);
      return null;
    }
    setMovingToOrders(true);
    if (showNotice) setNotice(null);
    try {
      const payload = buildStoredQuotePayload(draft);
      const lineItems = payload.lines
        .map((line) => {
          const quantity = safeNumber(line.quantity, 0);
          const unitPrice = safeNumber(line.unitPrice, 0);
          return {
            product: line.description.trim() || "Custom item",
            color: "",
            size: "",
            quantity,
            unitPrice,
            price: quantity * unitPrice,
          };
        })
        .filter((line) => line.quantity > 0 && line.unitPrice > 0);

      const orderPayload = {
        invoiceNumber: payload.documentNumber || `Q-${selected.id.slice(-5).toUpperCase()}`,
        customerName: draft.contactName.trim() || selected.name || "Walk-in client",
        phoneNumber: draft.contactPhone.trim() || selected.phone || "",
        email: draft.contactEmail.trim() || selected.email || "",
        address: draft.clientAddress.trim() || selected.deliveryAddress || "",
        status: "Pending",
        paymentMethod: mapPaymentMethodForOrder(payload.paymentStatus || ""),
        amount: totals.total,
        products: lineItems,
        transactionDate: serverTimestamp(),
        source: "quotation_approval",
        quoteId: selected.id,
        quoteDocumentType: payload.documentType,
        documentProfile: {
          documentType: payload.documentType,
          documentNumber: payload.documentNumber,
          documentDate: payload.documentDate,
          validUntil: payload.validUntil,
          paymentStatus: payload.paymentStatus,
          preparedBy: payload.preparedBy,
          currency: payload.currency,
          clientName: draft.contactName.trim() || selected.name || "Walk-in client",
          clientEmail: draft.contactEmail.trim() || selected.email || "",
          clientPhone: draft.contactPhone.trim() || selected.phone || "",
          clientCompany: payload.clientCompany || draft.clientCompany.trim() || selected.name || "Walk-in client",
          clientAddress: payload.clientAddress || draft.clientAddress.trim() || selected.deliveryAddress || "",
          clientBrn: payload.clientBrn || "",
          clientVat: payload.clientVat || "",
          deliveryFee: payload.deliveryFee,
          discount: payload.discount,
          amountReceived: payload.amountReceived,
          notes: payload.notes,
          terms: payload.terms,
          showLineItems: payload.showLineItems,
          showTotals: payload.showTotals,
          lines: lineItems.map((line) => ({
            description: line.product,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            color: line.color,
            size: line.size,
          })),
        },
        updatedAt: serverTimestamp(),
      };

      const existingOrder = await getDocs(
        query(collection(db, "transactions"), where("quoteId", "==", selected.id), limit(1))
      );

      let transactionId = "";
      if (!existingOrder.empty) {
        const ref = existingOrder.docs[0].ref;
        transactionId = ref.id;
        const currentDate = existingOrder.docs[0].data().transactionDate;
        await updateDoc(ref, {
          ...orderPayload,
          transactionDate: currentDate || serverTimestamp(),
        });
      } else {
        const created = await addDoc(collection(db, "transactions"), {
          ...orderPayload,
          createdAt: serverTimestamp(),
        });
        transactionId = created.id;
      }

      await updateDoc(doc(db, "quotes", selected.id), {
        status: "approved",
        name: draft.contactName.trim() || "Walk-in client",
        email: draft.contactEmail.trim(),
        phone: draft.contactPhone.trim(),
        quote: payload,
        orderTransactionId: transactionId,
        movedToOrdersAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (showNotice) setNotice(`Moved to Order Management. Order ID: ${transactionId}`);
      return transactionId;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to move to orders.";
      setNotice(message);
      return null;
    } finally {
      setMovingToOrders(false);
    }
  };

  const approveAndMoveToOrders = async () => {
    if (!selected || !draft) return;
    const saved = await saveDraft("approved", { showNotice: false });
    if (!saved) return;
    const transactionId = await moveToOrders({ showNotice: false });
    if (transactionId) {
      setNotice(`Approved and moved to Order Management. Order ID: ${transactionId}`);
    }
  };

  const surfaceClass = isDark
    ? "min-w-0 max-w-full rounded-2xl border border-white/10 bg-[#101613] shadow-[0_22px_60px_rgba(0,0,0,0.32)]"
    : "min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white shadow-[0_16px_45px_rgba(15,23,42,0.07)]";
  const softSurfaceClass = isDark
    ? "min-w-0 max-w-full rounded-2xl border border-white/10 bg-white/[0.04]"
    : "min-w-0 max-w-full rounded-2xl border border-slate-200 bg-slate-50";
  const fieldClass =
    `mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${
      isDark
        ? "border-white/10 bg-black/20 text-slate-100 placeholder:text-slate-500 focus:border-orange-400/70 focus:ring-4 focus:ring-orange-400/10"
        : "border-[#dddddd] bg-white text-[#222222] placeholder:text-[#b0b0b0] focus:border-[#ff6600] focus:ring-4 focus:ring-[#ff6600]/10"
    }`;
  const textAreaClass = `${fieldClass} min-h-[120px] resize-y`;
  const labelClass = `text-[11px] font-semibold uppercase tracking-[0.18em] ${
    isDark ? "text-white/50" : "text-[#717171]"
  }`;
  const secondaryButtonClass = `inline-flex max-w-full min-w-0 items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-center text-xs font-semibold transition disabled:cursor-not-allowed ${
    isDark
      ? "border-white/20 bg-white/10 text-slate-100 hover:bg-white/20 disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
      : "border-[#dddddd] bg-white text-[#484848] hover:border-[#c7c7c7] hover:bg-[#f7f7f7] hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)] disabled:border-[#ececec] disabled:bg-[#f7f7f7] disabled:text-[#b0b0b0]"
  }`;
  const darkButtonClass = `inline-flex max-w-full min-w-0 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-center text-xs font-semibold transition disabled:cursor-not-allowed ${
    isDark
      ? "border border-white/10 bg-white text-slate-950 hover:bg-cyan-100 disabled:bg-slate-600 disabled:text-slate-300"
      : "bg-[#222222] text-white hover:bg-black disabled:bg-[#b0b0b0]"
  }`;
  const primaryButtonClass = `inline-flex max-w-full min-w-0 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-center text-xs font-semibold transition disabled:cursor-not-allowed disabled:text-white disabled:shadow-none ${
    isDark
      ? "border border-orange-400/30 bg-orange-500 text-white shadow-[0_14px_34px_rgba(255,100,0,0.18)] hover:bg-orange-400 disabled:bg-slate-700"
      : "bg-[linear-gradient(135deg,#ff6600,#ea580c)] text-white shadow-[0_10px_24px_rgba(255,102,0,0.24)] hover:shadow-[0_14px_28px_rgba(255,102,0,0.32)] disabled:bg-[#ffd3b3]"
  }`;
  const mobilePanelButtonClass = (active: boolean) =>
    `rounded-2xl px-3 py-2.5 text-xs font-semibold transition ${
      active
        ? isDark
          ? "bg-white text-slate-950"
          : "bg-[#222222] text-white"
        : isDark
          ? "text-slate-300 hover:bg-white/10"
          : "text-[#6a6a6a] hover:bg-[#f7f7f7]"
    }`;

  return (
    <div
      className={`quotation-approval-page relative min-h-screen max-w-full overflow-x-hidden ${
        isDark ? "ceo-theme bg-[#050806] text-white" : "bg-[#f7f8fa] text-[#222222]"
      }`}
    >
      <div className="relative max-w-full overflow-x-hidden">
        <div className="relative mx-auto w-full max-w-[1500px] px-0 py-2 sm:px-6 sm:py-6 lg:px-8">
          <header className={`${surfaceClass} relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7`}>
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#ff6400] to-transparent" />
            <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p
                  className={`text-xs font-semibold uppercase tracking-[0.28em] ${
                    isDark ? "text-orange-300/80" : "text-[#717171]"
                  }`}
                >
                  Quotations
                </p>
                <h1
                  className={`mt-2 text-3xl font-semibold tracking-tight sm:text-4xl ${
                    isDark ? "text-white" : "text-slate-900"
                  }`}
                >
                  Quotes & invoices
                </h1>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
                      isDark
                        ? "border-orange-400/25 bg-orange-400/10 text-orange-200"
                        : "border-[#ffd9c2] bg-[#fff4ed] text-[#c2410c]"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-300" />
                    {stats.total} active quotes
                  </span>
                  <span
                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                      isDark
                        ? "border-blue-300/35 bg-blue-300/15 text-blue-100"
                        : "border-[#ebebeb] bg-white text-[#484848]"
                    }`}
                  >
                    {stats.new + stats.review} need action
                  </span>
                </div>
              </div>

              <div className="flex min-w-0 flex-wrap gap-2 xl:justify-end">
                <button
                  type="button"
                  onClick={createAdminQuote}
                  disabled={creatingQuote}
                  className={primaryButtonClass}
                >
                  <FiPlus className="h-4 w-4" />
                  {creatingQuote ? "Creating..." : "New quotation"}
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className={secondaryButtonClass}
                >
                  <FiRefreshCw className="h-4 w-4" />
                  Refresh
                </button>
              </div>
            </div>

          </header>

          <div className="mt-4 lg:hidden">
            <div className={`${surfaceClass} grid grid-cols-2 gap-1 p-1`}>
              <button
                type="button"
                onClick={() => setMobilePanel("inbox")}
                className={mobilePanelButtonClass(mobilePanel === "inbox")}
              >
                Inbox ({filtered.length})
              </button>
              <button
                type="button"
                onClick={() => setMobilePanel("quote")}
                disabled={!selected}
                className={`${mobilePanelButtonClass(mobilePanel === "quote")} disabled:opacity-50`}
              >
                {selected ? draft?.documentNumber || "Document" : "Document"}
              </button>
            </div>
          </div>

          <div
            className={`mt-4 grid min-w-0 gap-4 sm:mt-5 ${
              inboxCollapsed
                ? "lg:grid-cols-1"
                : "lg:grid-cols-[300px_minmax(0,1fr)]"
            }`}
          >
            <aside
              id="quotation-client-inbox"
              className={`${mobilePanel === "inbox" ? "block" : "hidden"} ${surfaceClass} h-fit min-w-0 max-w-full overflow-hidden p-3 sm:p-4 lg:sticky lg:top-24 ${
                inboxCollapsed ? "lg:hidden" : "lg:block"
              }`}
            >
              <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${isDark ? "border-white/10 bg-black/20" : "border-slate-200 bg-white"}`}>
                <FiSearch className={`h-4 w-4 ${isDark ? "text-white/35" : "text-[#717171]"}`} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`w-full bg-transparent text-sm outline-none ${isDark ? "text-white placeholder:text-white/30" : "text-[#222222] placeholder:text-[#b0b0b0]"}`}
                  placeholder="Search by name, email, phone..."
                />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 text-xs font-semibold sm:grid-cols-2">
                {([
                  { key: "all", label: "All", count: stats.total },
                  { key: "new", label: STATUS_LABELS.new, count: stats.new },
                  { key: "review", label: STATUS_LABELS.review, count: stats.review },
                  { key: "approved", label: STATUS_LABELS.approved, count: stats.approved },
                  { key: "sent", label: STATUS_LABELS.sent, count: stats.sent },
                ] as const).map((filter) => {
                  const active = statusFilter === filter.key;
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => setStatusFilter(filter.key)}
                      className={`rounded-2xl border px-3 py-2.5 text-left transition ${
                        active
                          ? isDark
                            ? "border-orange-400/30 bg-orange-400/10 text-orange-200"
                            : "border-[#ffd9c2] bg-[#fff4ed] text-[#c2410c]"
                          : isDark
                            ? "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.08]"
                            : "border-[#ebebeb] bg-[#f7f7f7] text-[#6a6a6a] hover:border-[#c7c7c7]"
                      }`}
                    >
                      <div>{filter.label}</div>
                      <div className="mt-1 text-[11px] text-inherit/80">{filter.count} items</div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                    Inbox
                  </p>
                  <p className="mt-1 text-sm text-[#6a6a6a]">
                    {filtered.length} visible quotation{filtered.length === 1 ? "" : "s"}
                  </p>
                </div>
                {loading ? <span className="text-xs text-[#717171]">Loading...</span> : null}
              </div>

              {error ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                {filtered.map((quote) => {
                  const status = quote.status || "new";
                  const docType = getQuoteDocumentType(quote);
                  const primaryStatus = getPrimaryStatusMeta(status, docType);
                  const paymentStatus = getPaymentStatusMeta(quote);
                  const selectedTone = selectedId === quote.id;
                  const totalPieces = (quote.garments || []).reduce(
                    (sum, entry) => sum + safeNumber(entry.quantity, 0),
                    0
                  );
                  const garmentPreview = (quote.garments || [])
                    .filter((entry) => safeNumber(entry.quantity, 0) > 0)
                    .slice(0, 2)
                    .map((entry) => formatQuoteGarmentDescription(entry))
                    .join(", ");
                  const initials = (quote.name || quote.email || "Q")
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase() || "")
                    .join("");

                  return (
                    <button
                      key={quote.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(quote.id);
                        setMobilePanel("quote");
                      }}
                      className={`w-full overflow-hidden rounded-[26px] border px-4 py-4 text-left transition ${
                        selectedTone
                          ? isDark
                            ? "border-orange-400/45 bg-orange-400/[0.08] shadow-[0_18px_36px_-30px_rgba(255,102,0,0.35)]"
                            : "border-[#ffb37a] bg-white shadow-[0_18px_36px_-30px_rgba(255,102,0,0.28)]"
                          : isDark
                            ? "border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.06]"
                            : "border-[#ebebeb] bg-white hover:border-[#cfcfcf] hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold ${
                            selectedTone
                              ? "bg-[#ff6600] text-white"
                              : isDark ? "bg-white/10 text-white/70" : "bg-[#f7f7f7] text-[#484848]"
                          }`}
                        >
                          {initials || "Q"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                            <div className="min-w-0">
                              <p className={`truncate text-sm font-semibold ${isDark ? "text-white" : "text-[#222222]"}`}>
                                {quote.name || "Unnamed client"}
                              </p>
                              <p className={`truncate text-xs ${isDark ? "text-white/45" : "text-[#717171]"}`}>
                                {quote.email || "No email"}
                              </p>
                            </div>
                            <span className={`self-start rounded-full border px-2.5 py-1 text-[10px] font-semibold ${primaryStatus.tone}`}>
                              {primaryStatus.label}
                            </span>
                          </div>
                          <p className={`mt-2 text-xs leading-5 ${isDark ? "text-white/55" : "text-[#6a6a6a]"}`}>
                            {garmentPreview || "No product line yet"}
                            {totalPieces > 0 ? ` • ${totalPieces} pc${totalPieces > 1 ? "s" : ""}` : ""}
                          </p>
                          <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${paymentStatus.tone}`}>
                            Payment: {paymentStatus.shortLabel}
                          </span>
                          <div className={`mt-3 flex items-center justify-between gap-3 text-[11px] ${isDark ? "text-white/35" : "text-[#717171]"}`}>
                            <span className="min-w-0 truncate">{quote.source || "Website"}</span>
                            <span>
                              {quote.createdAt
                                ? formatDistanceToNow(quote.createdAt, { addSuffix: true })
                                : "—"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {!filtered.length && !loading ? (
                  <div className="rounded-[26px] border border-dashed border-[#d9d9d9] bg-[#f7f7f7] px-5 py-10 text-center text-sm text-[#717171]">
                    No quotations match these filters.
                  </div>
                ) : null}
              </div>
            </aside>

            <section className={`${mobilePanel === "quote" ? "block" : "hidden"} min-w-0 space-y-4 lg:block`}>
              <div className="hidden lg:flex">
                <button
                  type="button"
                  onClick={toggleInboxCollapsed}
                  aria-expanded={!inboxCollapsed}
                  aria-controls="quotation-client-inbox"
                  className={secondaryButtonClass}
                >
                  {inboxCollapsed ? (
                    <FiChevronRight className="h-4 w-4" />
                  ) : (
                    <FiChevronLeft className="h-4 w-4" />
                  )}
                  {inboxCollapsed ? "Show client list" : "Hide client list"}
                </button>
              </div>
              {selected && draft ? (
                <div className="flex flex-col gap-6">
                  <button
                    type="button"
                    onClick={() => setMobilePanel("inbox")}
                    className={`${secondaryButtonClass} lg:hidden`}
                  >
                    <FiChevronLeft className="h-4 w-4" />
                    Back to inbox
                  </button>
                  <div className={`${surfaceClass} -order-2 overflow-hidden`}>
                    <div className="grid min-w-0 gap-6 px-4 py-5 sm:px-8 sm:py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                      <div className="min-w-0">
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.24em] ${isDark ? "text-white/40" : "text-[#717171]"}`}>
                          Client Overview
                        </p>
                        <h2 className={`mt-3 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl ${isDark ? "text-white" : "text-[#222222]"}`}>
                          {draft.contactName || selected.name || "Walk-in client"}
                        </h2>
                        <div className="mt-4 flex min-w-0 flex-wrap gap-2">
                          <span className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${isDark ? "border-white/10 bg-white/[0.05] text-white/65" : "border-[#ebebeb] bg-[#f7f7f7] text-[#484848]"}`}>
                            <FiMail className="h-3.5 w-3.5 text-[#ff6600]" />
                            <span className="min-w-0 truncate">{draft.contactEmail || "No email yet"}</span>
                          </span>
                          <span className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${isDark ? "border-white/10 bg-white/[0.05] text-white/65" : "border-[#ebebeb] bg-[#f7f7f7] text-[#484848]"}`}>
                            <FiPhone className="h-3.5 w-3.5 text-[#ff6600]" />
                            <span className="min-w-0 truncate">{draft.contactPhone || "No phone yet"}</span>
                          </span>
                          <span className={`max-w-full rounded-full border px-3 py-1.5 text-xs ${isDark ? "border-white/10 bg-white/[0.05] text-white/65" : "border-[#ebebeb] bg-[#f7f7f7] text-[#484848]"}`}>
                            Source: {selected.source || "Website"}
                          </span>
                          {selected.delivery ? (
                            <span className={`max-w-full rounded-full border px-3 py-1.5 text-xs ${isDark ? "border-white/10 bg-white/[0.05] text-white/65" : "border-[#ebebeb] bg-[#f7f7f7] text-[#484848]"}`}>
                              Delivery: {selected.delivery}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className={`${softSurfaceClass} p-5`}>
                        <div className="flex flex-wrap gap-2">
                          <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selectedPrimaryStatus?.tone || STATUS_TONES.new}`}>
                            {selectedPrimaryStatus?.label || STATUS_LABELS.new}
                          </span>
                          <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${DOC_TYPE_TONES[draft.documentType]}`}>
                            {DOC_TYPE_LABELS[draft.documentType]}
                          </span>
                          <span
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                              selectedStatus === "new"
                                ? "border-[#ffd9c2] bg-[#fff4ed] text-[#c2410c]"
                                : "border-[#d7f0e0] bg-[#f4fbf7] text-[#1f7a4d]"
                            }`}
                          >
                            {selectedStatus === "new" ? "Unread" : "Read"}
                          </span>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          <div className={`rounded-xl border px-4 py-3 ${isDark ? "border-white/10 bg-black/20" : "border-[#ebebeb] bg-white"}`}>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                              Quote number
                            </div>
                            <div className={`mt-1 text-sm font-semibold ${isDark ? "text-white" : "text-[#222222]"}`}>
                              {draft.documentNumber}
                            </div>
                          </div>
                          <div className={`rounded-xl border px-4 py-3 ${isDark ? "border-white/10 bg-black/20" : "border-[#ebebeb] bg-white"}`}>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                              Order sync
                            </div>
                            <div className={`mt-1 text-sm font-semibold ${isDark ? "text-white" : "text-[#222222]"}`}>
                              {selected.orderTransactionId || "Not in orders yet"}
                            </div>
                          </div>
                          <div className={`rounded-xl border px-4 py-3 sm:col-span-2 ${isDark ? "border-white/10 bg-black/20" : "border-[#ebebeb] bg-white"}`}>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                              Payment status
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${selectedPaymentStatus?.tone || "border-[#e3e3e3] bg-[#f7f7f7] text-[#666666]"}`}>
                                {selectedPaymentStatus?.label || "Payment not requested"}
                              </span>
                              {selectedPaymentComparison.detectedAmount !== null ? (
                                <span className={`text-xs font-semibold ${isDark ? "text-white/60" : "text-[#5f5f5f]"}`}>
                                  OCR amount: {formatMoney(selectedPaymentComparison.detectedAmount, draft.currency)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {selected.clientDecision ? (
                    <div className={`${surfaceClass} p-5 sm:p-6`}>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className={labelClass}>Client response</p>
                          <h3 className={`mt-2 text-xl font-semibold ${isDark ? "text-white" : "text-[#222222]"}`}>
                            {selected.clientDecision === "accepted"
                              ? "Quotation accepted"
                              : selected.clientDecision === "changes_requested"
                                ? "Changes requested"
                                : "Quotation rejected"}
                          </h3>
                          {selected.clientDecisionComment ? (
                            <p className={`mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-6 ${isDark ? "text-white/60" : "text-[#5f5f5f]"}`}>
                              {selected.clientDecisionComment}
                            </p>
                          ) : null}
                        </div>
                        <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                          selected.clientDecision === "accepted"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : selected.clientDecision === "changes_requested"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-red-200 bg-red-50 text-red-700"
                        }`}>
                          {selected.clientDecision === "accepted" ? "Accepted" : selected.clientDecision === "changes_requested" ? "Action needed" : "Rejected"}
                        </span>
                      </div>

                      {selected.clientResponseHistory?.length ? (
                        <div className={`mt-5 rounded-2xl border p-4 ${isDark ? "border-white/10 bg-white/[0.04]" : "border-[#ebebeb] bg-[#f8f8f7]"}`}>
                          <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-[#222222]"}`}>Response history</p>
                          <p className={`mt-1 text-xs ${isDark ? "text-white/50" : "text-[#717171]"}`}>
                            New client actions and payment proofs are added here without replacing previous submissions.
                          </p>
                          <div className="mt-3 space-y-2.5">
                            {[...selected.clientResponseHistory].reverse().map((entry, index) => {
                              const responseDate = parseTimestamp(entry.submittedAtIso);
                              const responseLabel = entry.action === "accept"
                                ? "Accepted quotation"
                                : entry.action === "changes"
                                  ? "Requested changes"
                                  : "Rejected quotation";
                              return (
                                <div key={entry.id || `${entry.action || "response"}-${entry.submittedAtIso || index}`} className={`rounded-xl border px-3.5 py-3 ${isDark ? "border-white/10 bg-black/15" : "border-[#e8e8e8] bg-white"}`}>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                      entry.action === "accept"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : entry.action === "changes"
                                          ? "border-amber-200 bg-amber-50 text-amber-700"
                                          : "border-red-200 bg-red-50 text-red-700"
                                    }`}>
                                      {responseLabel}
                                    </span>
                                    <span className={`text-[11px] ${isDark ? "text-white/45" : "text-[#8a8a8a]"}`}>
                                      {responseDate ? format(responseDate, "dd MMM yyyy, HH:mm") : "Previous response"}
                                    </span>
                                  </div>
                                  {entry.comment ? (
                                    <p className={`mt-2 whitespace-pre-wrap text-xs leading-5 ${isDark ? "text-white/60" : "text-[#5f5f5f]"}`}>{entry.comment}</p>
                                  ) : null}
                                  {entry.paymentEvidence?.url ? (
                                    <a href={entry.paymentEvidence.url} target="_blank" rel="noreferrer" className={`${secondaryButtonClass} mt-2.5`}>
                                      <FiFileText className="h-4 w-4" />
                                      View {entry.paymentEvidence.filename || "payment screenshot"}
                                    </a>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {selected.paymentEvidence ? (
                        <div className={`mt-5 grid gap-4 rounded-2xl border p-4 lg:grid-cols-[minmax(0,1fr)_auto] ${isDark ? "border-white/10 bg-white/[0.04]" : "border-[#ebebeb] bg-[#f8f8f7]"}`}>
                          <div>
                            <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-[#222222]"}`}>Payment screenshot check</p>
                            <div className={`mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs ${isDark ? "text-white/55" : "text-[#666666]"}`}>
                              <span>
                                OCR: {selected.paymentEvidence.ocrStatus === "complete"
                                  ? selected.paymentEvidence.assessment?.verdict === "likely_payment"
                                    ? "Payment details detected"
                                    : "Manual review needed"
                                  : selected.paymentEvidence.ocrStatus === "error"
                                    ? "Check failed"
                                    : selected.paymentEvidence.ocrStatus === "processing"
                                      ? `Checking in admin${paymentOcrProgress !== null ? ` (${Math.round(paymentOcrProgress * 100)}%)` : "…"}`
                                      : "Queued for admin check"}
                              </span>
                              {selected.paymentEvidence.ocrStatus === "complete" && typeof selected.paymentEvidence.assessment?.confidence === "number" ? <span>Confidence: {selected.paymentEvidence.assessment.confidence}%</span> : null}
                              {selected.paymentEvidence.ocrStatus === "complete" && selectedPaymentComparison.detectedAmount !== null ? <span>Detected: {formatMoney(selectedPaymentComparison.detectedAmount, draft.currency)}</span> : null}
                              {selected.paymentEvidence.ocrStatus === "complete" && selected.paymentEvidence.assessment?.reference ? <span>Ref: {selected.paymentEvidence.assessment.reference}</span> : null}
                            </div>
                            {selected.paymentEvidence.ocrStatus === "complete" ? (
                              <div className={`mt-3 rounded-xl border px-3 py-2.5 ${
                                selectedPaymentComparison.status === "match"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                  : selectedPaymentComparison.status === "unavailable"
                                    ? "border-slate-200 bg-slate-50 text-slate-700"
                                    : "border-red-200 bg-red-50 text-red-800"
                              }`}>
                                <p className="text-xs font-bold">
                                  {selectedPaymentComparison.status === "match"
                                    ? "Amount matches the quotation."
                                    : selectedPaymentComparison.status === "overpaid"
                                      ? `Amount does not match — client paid ${formatMoney(selectedPaymentComparison.difference || 0, draft.currency)} more.`
                                      : selectedPaymentComparison.status === "underpaid"
                                        ? `Amount does not match — client paid ${formatMoney(Math.abs(selectedPaymentComparison.difference || 0), draft.currency)} less.`
                                        : "Amount comparison unavailable — review the screenshot manually."}
                                </p>
                                {selectedPaymentComparison.expectedAmount !== null && selectedPaymentComparison.detectedAmount !== null ? (
                                  <p className="mt-1 text-[11px] opacity-80">
                                    Quotation: {formatMoney(selectedPaymentComparison.expectedAmount, draft.currency)} · OCR payment: {formatMoney(selectedPaymentComparison.detectedAmount, draft.currency)}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                            {selected.paymentEvidence.ocrStatus === "error" ? (
                              <p className="mt-2 text-xs text-red-600">{selected.paymentEvidence.ocrError || "The OCR check could not read this screenshot."}</p>
                            ) : null}
                            <p className={`mt-3 text-xs font-semibold ${selected.paymentEvidence.verificationStatus === "confirmed" ? "text-emerald-600" : "text-amber-600"}`}>
                              {selected.paymentEvidence.verificationStatus === "confirmed" ? "Bank payment confirmed" : "Waiting for bank confirmation"}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {selected.paymentEvidence.url ? (
                              <a href={selected.paymentEvidence.url} target="_blank" rel="noreferrer" className={secondaryButtonClass}>
                                <FiFileText className="h-4 w-4" /> View screenshot
                              </a>
                            ) : null}
                            {selected.paymentEvidence.ocrStatus === "error" ? (
                              <button type="button" onClick={retryPaymentOcr} className={secondaryButtonClass}>
                                <FiRefreshCw className="h-4 w-4" /> Retry OCR
                              </button>
                            ) : null}
                            {selected.paymentEvidence.verificationStatus !== "confirmed" ? (
                              <button type="button" onClick={confirmSelectedPaymentEvidence} disabled={paymentVerificationSaving} className={primaryButtonClass}>
                                <FiCheckCircle className="h-4 w-4" />
                                {paymentVerificationSaving ? "Confirming…" : "Confirm bank payment"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {selected.paymentEvidence?.verificationStatus === "confirmed" && paymentReceiptDraft ? (
                        <div className={`mt-5 rounded-2xl border p-4 sm:p-5 ${isDark ? "border-emerald-300/25 bg-emerald-300/10" : "border-emerald-200 bg-emerald-50"}`}>
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <p className={`text-[11px] font-bold uppercase tracking-[0.18em] ${isDark ? "text-emerald-200" : "text-emerald-700"}`}>
                                Receipt generated automatically
                              </p>
                              <h4 className={`mt-1.5 text-lg font-semibold ${isDark ? "text-white" : "text-[#222222]"}`}>
                                {paymentReceiptDraft.documentNumber || "Paid receipt"}
                              </h4>
                              <p className={`mt-1 text-xs ${isDark ? "text-white/55" : "text-[#5f6f65]"}`}>
                                {selected.paymentReceipt?.generatedAtIso
                                  ? `Generated ${format(parseTimestamp(selected.paymentReceipt.generatedAtIso) || new Date(), "dd MMM yyyy, HH:mm")}`
                                  : "Generated when the bank payment was confirmed."}
                              </p>
                            </div>
                            <span className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.12em] text-emerald-700">
                              Paid
                            </span>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" onClick={handleViewPaymentReceipt} className={secondaryButtonClass}>
                              <FiFileText className="h-4 w-4" /> View receipt
                            </button>
                            <button type="button" onClick={handleDownloadPaymentReceipt} className={secondaryButtonClass}>
                              <FiDownload className="h-4 w-4" /> Download receipt
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className={`${surfaceClass} -order-1 p-5 sm:p-6`}>
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                      <div className="min-w-0">
                        <p className={labelClass}>Do this next</p>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <h3 className={`text-2xl font-semibold tracking-[-0.02em] ${isDark ? "text-white" : "text-[#222222]"}`}>
                            {simpleNextAction}
                          </h3>
                          <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selectedPrimaryStatus?.tone || STATUS_TONES.new}`}>
                            {selectedPrimaryStatus?.label || STATUS_LABELS.new}
                          </span>
                        </div>
                        <div className={`mt-4 rounded-2xl border px-4 py-3 ${clientWorkflowStatus.tone}`}>
                          <div className="flex items-start gap-3">
                            {clientWorkflowStatus.state === "accepted" ? (
                              <FiCheckCircle className="mt-0.5 h-5 w-5 shrink-0" />
                            ) : clientWorkflowStatus.state === "rejected" ? (
                              <FiXCircle className="mt-0.5 h-5 w-5 shrink-0" />
                            ) : (
                              <FiClock className="mt-0.5 h-5 w-5 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-bold">{clientWorkflowStatus.label}</p>
                              <p className="mt-0.5 text-xs leading-5 opacity-80">
                                {clientWorkflowStatus.detail}
                              </p>
                            </div>
                          </div>
                        </div>
                        {quotationMissingCount > 0 ? (
                          <div className={`mt-3 rounded-2xl border p-4 ${
                            isDark
                              ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
                              : "border-amber-200 bg-amber-50 text-amber-900"
                          }`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-bold">
                                  {quotationMissingCount} detail{quotationMissingCount === 1 ? "" : "s"} needed
                                </p>
                                <p className="mt-0.5 text-xs opacity-75">
                                  Click a field below to open it in Document Studio.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => openWorkflowStudioAt(quotationMissingFields[0]?.target)}
                                className="inline-flex items-center gap-2 rounded-full border border-current/20 bg-white/70 px-3 py-2 text-xs font-bold transition hover:bg-white"
                              >
                                <FiEdit2 className="h-3.5 w-3.5" />
                                Fill missing info
                              </button>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {quotationMissingFields.map((field) => (
                                <button
                                  key={field.target}
                                  type="button"
                                  onClick={() => openWorkflowStudioAt(field.target)}
                                  className="rounded-full border border-current/20 bg-white/70 px-3 py-1.5 text-left text-xs font-semibold transition hover:bg-white"
                                >
                                  {field.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {notice ? (
                          <div className="mt-4 rounded-2xl border border-[#ebebeb] bg-[#f7f7f7] px-4 py-3 text-sm text-[#484848]">
                            {notice}
                          </div>
                        ) : null}
                      </div>

                      <div className={`rounded-2xl border px-5 py-4 ${isDark ? "border-orange-400/25 bg-orange-400/10" : "border-[#ffd9c2] bg-[#fff4ed]"}`}>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c2410c]">
                          Current total
                        </div>
                        <div className={`mt-2 text-3xl font-semibold tracking-[-0.03em] ${isDark ? "text-white" : "text-[#222222]"}`}>
                          {formatMoney(totals.total, draft.currency)}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-[#9a4b13]">
                          {totals.lineCount} line{totals.lineCount === 1 ? "" : "s"} in {draft.documentNumber}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openWorkflowStudioAt()}
                        className={darkButtonClass}
                      >
                        <FiFileText className="h-4 w-4" />
                        Edit quote
                      </button>
                      <button
                        type="button"
                        onClick={handleSend}
                        disabled={
                          sending ||
                          !draft.contactEmail.trim() ||
                          Boolean(sendValidationError)
                        }
                        title={
                          !draft.contactEmail.trim()
                            ? "Add client email before sending."
                            : sendValidationError || "Ready to send."
                        }
                        className={primaryButtonClass}
                      >
                        <FiSend className="h-4 w-4" />
                        {sending
                          ? "Sending..."
                          : quoteHasBeenSent || selected.clientDecision
                            ? "Resend quotation"
                            : "Send quotation"}
                      </button>
                      <button
                        type="button"
                        onClick={approveAndMoveToOrders}
                        disabled={saving || movingToOrders || quoteIsMarkedApproved}
                        className={secondaryButtonClass}
                      >
                        <FiCheckCircle className="h-4 w-4" />
                        {quoteIsMarkedApproved ? "Approved" : "Approve + order"}
                      </button>
                      <button
                        type="button"
                        onClick={handleViewPdf}
                        className={secondaryButtonClass}
                      >
                        <FiFileText className="h-4 w-4" />
                        View PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => moveToOrders()}
                        disabled={
                          movingToOrders ||
                          Boolean(moveToOrdersError) ||
                          !quoteIsMarkedApproved
                        }
                        title={moveToOrdersTitle}
                        className={secondaryButtonClass}
                      >
                        <FiCheckCircle className="h-4 w-4" />
                        {movingToOrders
                          ? "Moving..."
                          : quoteInOrders
                            ? "Sync order"
                            : "Move order"}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSelectedStatus("review", "Marked as read.")}
                        disabled={statusSaving || (selected.status || "new") !== "new"}
                        className={secondaryButtonClass}
                      >
                        <FiClock className="h-4 w-4" />
                        {statusSaving ? "Updating..." : "Mark read"}
                      </button>
                    </div>

                    <div className="mt-4 flex justify-end border-t border-red-100 pt-4">
                      <button
                        type="button"
                        onClick={handleDeleteQuote}
                        disabled={deletingQuote}
                        className={`inline-flex items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          isDark
                            ? "border-rose-300/45 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25"
                            : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        }`}
                      >
                        <FiTrash2 className="h-4 w-4" />
                        {deletingQuote ? "Deleting..." : "Delete quotation"}
                      </button>
                    </div>

                    <div className="mt-6 border-t border-[#ebebeb] pt-6">
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={labelClass}>Automatic quotation preview</p>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                              Live
                            </span>
                          </div>
                          <p className={`mt-1 text-xs ${isDark ? "text-white/50" : "text-[#717171]"}`}>
                            This preview updates instantly as you fill in the quotation.
                          </p>
                          {quotationMissingFields.length ? (
                            <div className="mt-2 max-w-2xl rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-700">
                              <span className="font-extrabold">Missing information: </span>
                              {quotationMissingFields.map((field) => field.label).join(" • ")}
                            </div>
                          ) : null}
                        </div>
                        {quotationMissingCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => openWorkflowStudioAt(quotationMissingFields[0]?.target)}
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-extrabold text-red-700 transition hover:bg-red-100"
                          >
                            <FiEdit2 className="h-3.5 w-3.5" />
                            {quotationMissingCount} missing field{quotationMissingCount === 1 ? "" : "s"} — fill now
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                            <FiCheckCircle className="h-3.5 w-3.5" />
                            Complete and ready
                          </span>
                        )}
                      </div>

                      <div className="overflow-hidden rounded-[24px] border border-[#dedede] bg-[#e9ecef] shadow-[0_24px_70px_-36px_rgba(15,23,42,0.35)]">
                        {quotationPreviewUrl ? (
                          <iframe
                            key={quotationPreviewUrl}
                            src={quotationPreviewUrl}
                            title={`Live ${DOC_TYPE_LABELS[draft.documentType]} PDF preview`}
                            className="h-[72vh] min-h-[680px] w-full bg-white sm:h-[820px]"
                          />
                        ) : (
                          <div className="grid min-h-[680px] place-items-center bg-white text-center text-[#717171]">
                            <div>
                              <FiRefreshCw className="mx-auto h-6 w-6 animate-spin text-[#ff6600]" />
                              <p className="mt-3 text-sm font-semibold">Generating existing quotation PDF…</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="hidden mx-auto overflow-hidden rounded-[24px] border border-[#dedede] bg-white text-[#222222] shadow-[0_24px_70px_-36px_rgba(15,23,42,0.35)]">
                        <div className="h-2 bg-[linear-gradient(90deg,#ff6600,#f59e0b,#ff6600)]" />
                        <div className="p-5 sm:p-7">
                          <div className="flex flex-col gap-5 border-b border-[#e8e8e8] pb-5 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xl font-black tracking-[-0.04em] text-[#191919]">MO T-SHIRT</p>
                              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#ff6600]">
                                Business printing
                              </p>
                              <p className="mt-3 text-xs leading-5 text-[#717171]">
                                {BUSINESS_INFO.addressLines.join(", ")}
                                <br />
                                {BUSINESS_INFO.phone} · BRN {BUSINESS_INFO.brn}
                              </p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="text-2xl font-light uppercase tracking-[0.16em] text-[#333333]">
                                {DOC_TYPE_LABELS[draft.documentType]}
                              </p>
                              <p className="mt-2 text-xs font-semibold text-[#717171]">
                                No. <QuotationPreviewValue value={draft.documentNumber} missingLabel="MISSING NUMBER" />
                              </p>
                              <p className="mt-1 text-xs text-[#717171]">
                                Date: <QuotationPreviewValue value={draft.documentDate} missingLabel="MISSING DATE" />
                              </p>
                              <p className="mt-1 text-xs text-[#717171]">
                                Valid until: <QuotationPreviewValue value={draft.validUntil} missingLabel="MISSING VALIDITY" />
                              </p>
                            </div>
                          </div>

                          <div className="grid gap-5 border-b border-[#e8e8e8] py-5 md:grid-cols-2">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a9a9a]">Quotation for</p>
                              <p className="mt-2 text-base font-bold">
                                <QuotationPreviewValue value={draft.clientCompany} missingLabel="MISSING COMPANY / CLIENT" />
                              </p>
                              <div className="mt-2 space-y-1 text-xs leading-5 text-[#555555]">
                                <p><QuotationPreviewValue value={draft.contactName} missingLabel="MISSING CONTACT NAME" /></p>
                                <p><QuotationPreviewValue value={draft.clientAddress} missingLabel="MISSING CLIENT ADDRESS" /></p>
                                <p>Email: <QuotationPreviewValue value={draft.contactEmail} missingLabel="MISSING EMAIL" /></p>
                                <p>Phone: <QuotationPreviewValue value={draft.contactPhone} missingLabel="MISSING PHONE" /></p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 md:text-right">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9a9a9a]">Client BRN</p>
                                <p className={`mt-1 text-xs ${draft.clientBrn.trim() ? "text-[#222222]" : "text-[#717171]"}`}>
                                  {draft.clientBrn.trim() || "Missing BRN"}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9a9a9a]">Client VAT</p>
                                <p className={`mt-1 text-xs ${draft.clientVat.trim() ? "text-[#222222]" : "text-[#717171]"}`}>
                                  {draft.clientVat.trim() || "Missing VAT"}
                                </p>
                              </div>
                              <div className="col-span-2">
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9a9a9a]">Prepared by</p>
                                <p className="mt-1 text-xs"><QuotationPreviewValue value={draft.preparedBy} missingLabel="MISSING PREPARER" /></p>
                              </div>
                            </div>
                          </div>

                          <div className="overflow-x-auto py-5">
                            <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                              <thead>
                                <tr className="border-b-2 border-[#222222]">
                                  <th className="pb-2 pr-3 font-bold uppercase tracking-[0.12em]">Description</th>
                                  <th className="w-20 px-3 pb-2 text-center font-bold uppercase tracking-[0.12em]">Qty</th>
                                  <th className="w-28 px-3 pb-2 text-right font-bold uppercase tracking-[0.12em]">Unit price</th>
                                  <th className="w-28 pb-2 pl-3 text-right font-bold uppercase tracking-[0.12em]">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {draft.lines.length ? (
                                  draft.lines.map((line, index) => {
                                    const quantity = safeNumber(line.quantity, 0);
                                    const unitPrice = safeNumber(line.unitPrice, 0);
                                    return (
                                      <tr key={`${line.description}-${index}`} className="border-b border-[#ececec] align-top">
                                        <td className="py-3 pr-3 font-semibold">
                                          <QuotationPreviewValue value={line.description} missingLabel="MISSING ITEM DESCRIPTION" />
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                          <QuotationPreviewValue value={quantity > 0 ? quantity : null} missingLabel="MISSING QTY" />
                                        </td>
                                        <td className="px-3 py-3 text-right">
                                          <QuotationPreviewValue
                                            value={unitPrice > 0 ? formatMoney(unitPrice, draft.currency) : null}
                                            missingLabel="MISSING PRICE"
                                          />
                                        </td>
                                        <td className="py-3 pl-3 text-right font-bold">
                                          <QuotationPreviewValue
                                            value={quantity > 0 && unitPrice > 0 ? formatMoney(quantity * unitPrice, draft.currency) : null}
                                            missingLabel="INCOMPLETE"
                                          />
                                        </td>
                                      </tr>
                                    );
                                  })
                                ) : (
                                  <tr>
                                    <td colSpan={4} className="py-6 text-center font-extrabold text-red-600">
                                      MISSING — ADD AT LEAST ONE PRODUCT LINE
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>

                          <div className="ml-auto w-full max-w-sm border-t-2 border-[#222222] pt-3 text-xs">
                            <div className="flex justify-between gap-4 py-1.5">
                              <span className="text-[#717171]">Subtotal</span>
                              <span className="font-semibold">{formatMoney(totals.subtotal, draft.currency)}</span>
                            </div>
                            {totals.deliveryFee > 0 ? (
                              <div className="flex justify-between gap-4 py-1.5">
                                <span className="text-[#717171]">Delivery</span>
                                <span className="font-semibold">{formatMoney(totals.deliveryFee, draft.currency)}</span>
                              </div>
                            ) : null}
                            {totals.discount > 0 ? (
                              <div className="flex justify-between gap-4 py-1.5">
                                <span className="text-[#717171]">Discount</span>
                                <span className="font-semibold">− {formatMoney(totals.discount, draft.currency)}</span>
                              </div>
                            ) : null}
                            <div className="mt-2 flex justify-between gap-4 border-t border-[#d7d7d7] py-3 text-base font-black">
                              <span>Total</span>
                              <span className={totals.total > 0 ? "text-[#222222]" : "text-red-600"}>
                                {totals.total > 0 ? formatMoney(totals.total, draft.currency) : "MISSING PRICES"}
                              </span>
                            </div>
                          </div>

                          <div className="mt-5 rounded-2xl bg-[#f7f7f7] px-4 py-3 text-[11px] leading-5 text-[#626262]">
                            <span className="font-bold text-[#333333]">Terms: </span>
                            <QuotationPreviewValue value={draft.terms} missingLabel="MISSING TERMS AND CONDITIONS" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    ref={designLogoSectionRef}
                    className="-order-3 scroll-mt-24 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]"
                  >
                    <div className={`${surfaceClass} order-2 p-5`}>
                      <p className={labelClass}>Product details</p>
                      <div className="mt-4 space-y-3 text-sm leading-6 text-[#484848]">
                        <p>
                          <span className="font-semibold text-[#222222]">Product</span>
                          <br />
                          {selectedDesignBrief?.product || selected.garments?.[0]?.garment || "n/a"}
                        </p>
                        <p>
                          <span className="font-semibold text-[#222222]">Garments</span>
                          <br />
                          {selectedGarmentRows.join(", ") || "n/a"}
                        </p>
                        <p>
                          <span className="font-semibold text-[#222222]">Print</span>
                          <br />
                          {selectedDesignBrief?.printMethod || selected.printMethod || "n/a"}
                        </p>
                        <p>
                          <span className="font-semibold text-[#222222]">Color</span>
                          <br />
                          {selectedRequestedColors.join(", ") || "n/a"}
                        </p>
                        <p>
                          <span className="font-semibold text-[#222222]">Total quantity</span>
                          <br />
                          {selectedTotalQty > 0 ? selectedTotalQty : "n/a"}
                        </p>
                        {selectedDesignRows.length ? (
                          <p>
                            <span className="font-semibold text-[#222222]">Design</span>
                            <br />
                            {selectedDesignRows.join(" • ")}
                          </p>
                        ) : null}
                        {selectedClientNotes ? (
                          <p>
                            <span className="font-semibold text-[#222222]">Notes</span>
                            <br />
                            {selectedClientNotes}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className={`${surfaceClass} order-1 p-5`}>
                      <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className={labelClass}>Design / Logo</p>
                        <label
                          className={`inline-flex w-full max-w-full items-center justify-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold transition sm:w-auto ${
                            uploadingAttachment
                              ? "border border-[#ececec] bg-[#f4f4f4] text-[#b0b0b0]"
                              : "border border-[#ebebeb] bg-white text-[#484848] hover:border-[#c7c7c7] hover:bg-[#f7f7f7]"
                          }`}
                        >
                          <FiUpload className="h-3.5 w-3.5" />
                          {uploadingAttachment ? "Uploading..." : "Add file"}
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            multiple
                            className="hidden"
                            disabled={uploadingAttachment}
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              if (files.length) handleAttachmentUpload(files);
                              e.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </div>

                      <div className="mt-4 space-y-3">
                        {selectedAttachments.length ? (
                          selectedAttachments.map((attachment, index) => {
                            const attachmentIsImage = Boolean(
                              attachment.contentType?.startsWith("image/") ||
                                attachment.originalContentType?.startsWith("image/")
                            );
                            const attachmentDownloadHref = getQuoteAttachmentDownloadHref(
                              attachment,
                              index
                            );
                            const originalAttachmentUrl = attachment.originalUrl || attachment.url || "";
                            const originalDownloadHref = getQuoteAttachmentDownloadHref(
                              {
                                ...attachment,
                                url: originalAttachmentUrl,
                                filename: attachment.originalFilename || attachment.filename,
                              },
                              index
                            );
                            const backgroundRemovalJobKey = getBackgroundRemovalJobKey(
                              selected.id,
                              attachment,
                              index
                            );
                            const backgroundRemovalJob = backgroundRemovalJobs[backgroundRemovalJobKey];
                            const hasTransparentArtwork = Boolean(attachment.originalUrl && attachment.url);
                            return (
                              <div
                                key={`${attachment.originalUrl || attachment.url || attachment.originalFilename || attachment.filename || "attachment"}-${index}`}
                                className="min-w-0 overflow-hidden rounded-[22px] border border-[#ebebeb] bg-[#f7f7f7] p-3.5"
                              >
                                <div className="grid min-w-0 gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                                      {attachment.label || `Design ${index + 1}`}
                                    </p>
                                    <p
                                      className="mt-1 max-w-full truncate text-sm font-semibold text-[#222222]"
                                      title={attachment.originalFilename || attachment.filename || "Attachment"}
                                    >
                                      {attachment.originalFilename || attachment.filename || "Attachment"}
                                    </p>
                                    {attachment.description ? (
                                      <p className="mt-1 break-words text-xs text-[#717171]">
                                        {attachment.description}
                                      </p>
                                    ) : null}
                                    {attachment.quantity ? (
                                      <p className="mt-1 text-xs text-[#717171]">
                                        Qty: {attachment.quantity}
                                      </p>
                                    ) : null}
                                  </div>
                                  {attachment.url ? (
                                    <div className="grid w-full grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-2">
                                      <a
                                        href={attachment.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`${secondaryButtonClass} whitespace-nowrap px-3`}
                                      >
                                        <FiFileText className="h-3.5 w-3.5" />
                                        {hasTransparentArtwork ? "Open transparent PNG" : "Open file"}
                                      </a>
                                      <a
                                        href={attachmentDownloadHref}
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#dddddd] bg-white text-[#484848] transition hover:border-[#c7c7c7] hover:bg-[#f7f7f7]"
                                        aria-label={`Download ${attachment.filename || "attachment"}`}
                                        title="Download file"
                                      >
                                        <FiDownload className="h-4 w-4" />
                                      </a>
                                    </div>
                                  ) : null}
                                </div>
                                {attachmentIsImage && attachment.url ? (
                                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <div className="rounded-[22px] border border-[#e7e7e7] bg-white p-2.5">
                                      <div className="flex items-center justify-between gap-2 px-1">
                                        <div>
                                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#717171]">
                                            Uploaded
                                          </p>
                                          <p className="mt-0.5 text-[11px] text-[#9a9a9a]">Source artwork</p>
                                        </div>
                                        {originalDownloadHref ? (
                                          <a
                                            href={originalDownloadHref}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#717171] transition hover:border-[#c7c7c7]"
                                            aria-label="Download original artwork"
                                            title="Download original artwork"
                                          >
                                            <FiDownload className="h-3.5 w-3.5" />
                                          </a>
                                        ) : null}
                                      </div>
                                      <QuoteAttachmentPreview
                                        src={originalAttachmentUrl}
                                        alt={`${attachment.originalFilename || attachment.filename || "Attachment"} original`}
                                      />
                                    </div>

                                    <div className="relative overflow-hidden rounded-[22px] border border-[#ccebd9] bg-[linear-gradient(145deg,#f4fbf7,#eef9f3)] p-2.5">
                                      <div className="flex items-center justify-between gap-2 px-1">
                                        <div>
                                          <div className="flex items-center gap-1.5">
                                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#1f7a4d] text-white">
                                              <FiStar className="h-3 w-3" />
                                            </span>
                                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1f7a4d]">
                                              Print-ready
                                            </p>
                                          </div>
                                          <p className="mt-0.5 text-[11px] text-[#56806a]">
                                            {hasTransparentArtwork
                                              ? "Background removed automatically"
                                              : backgroundRemovalJob?.label || "Automatic cleanup queued"}
                                          </p>
                                        </div>
                                        {hasTransparentArtwork ? (
                                          <a
                                            href={attachmentDownloadHref}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#1f7a4d] text-white shadow-sm transition hover:bg-[#17643e]"
                                            aria-label="Download transparent PNG"
                                            title="Download transparent PNG"
                                          >
                                            <FiDownload className="h-3.5 w-3.5" />
                                          </a>
                                        ) : null}
                                      </div>

                                      {hasTransparentArtwork ? (
                                        <QuoteAttachmentPreview
                                          src={attachment.url}
                                          alt={`${attachment.filename || "Artwork"} with transparent background`}
                                          transparent
                                        />
                                      ) : backgroundRemovalJob?.status === "error" ? (
                                        <div className="mt-3 grid h-40 place-items-center rounded-[18px] border border-rose-200 bg-white/85 px-4 text-center">
                                          <div>
                                            <FiXCircle className="mx-auto h-5 w-5 text-rose-500" />
                                            <p className="mt-2 text-xs font-semibold text-rose-700">
                                              {backgroundRemovalJob.error || "Automatic cleanup failed."}
                                            </p>
                                            <button
                                              type="button"
                                              onClick={() => retryAutomaticBackgroundRemoval(attachment, index)}
                                              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                                            >
                                              <FiRefreshCw className="h-3.5 w-3.5" />
                                              Try again
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="mt-3 grid h-40 place-items-center overflow-hidden rounded-[18px] border border-emerald-100 bg-white/80 px-5 text-center">
                                          <div className="w-full">
                                            <span className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-[#1f7a4d]">
                                              <FiRefreshCw className="h-5 w-5 animate-spin" />
                                            </span>
                                            <p className="mt-2 text-xs font-semibold text-[#35684c]">
                                              {backgroundRemovalJob?.label || "Preparing automatic cleanup"}
                                            </p>
                                            <div className="mx-auto mt-3 h-1.5 max-w-48 overflow-hidden rounded-full bg-emerald-100">
                                              <div
                                                className="h-full rounded-full bg-[linear-gradient(90deg,#1f7a4d,#45b979)] transition-[width] duration-300"
                                                style={{
                                                  width: `${Math.max(4, Math.round((backgroundRemovalJob?.progress || 0.03) * 100))}%`,
                                                }}
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : !attachment.url ? (
                                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-800">
                                    Email-only artwork:{" "}
                                    {attachment.filename || `Attachment ${index + 1}`}.
                                    Re-upload this file here before sharing it with a
                                    partner, so they can open the artwork.
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        ) : (
                          <div className="rounded-[22px] border border-dashed border-[#d9d9d9] bg-[#f7f7f7] px-4 py-8 text-center text-sm text-[#717171]">
                            No attachment uploaded yet.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="hidden">
                      <p className={labelClass}>Delivery</p>
                      <div className="mt-4 space-y-4 text-sm leading-6 text-[#484848]">
                        <div>
                          <p className="font-semibold text-[#222222]">Method</p>
                          <p>{selected.delivery || "n/a"}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-[#222222]">Recipient</p>
                          <p>{selected.deliveryName || "Name not provided"}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-[#222222]">Address</p>
                          <p>{selected.deliveryAddress || "Address not provided"}</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="font-semibold text-[#222222]">Post code</p>
                            <p>{selected.deliveryPostCode || "—"}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-[#222222]">Phone</p>
                            <p>{selected.deliveryPhone || "Phone not provided"}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="hidden">
                      <p className={labelClass}>Timeline</p>
                      <div className="mt-4 space-y-4">
                        <div className="rounded-2xl border border-[#ebebeb] bg-[#f7f7f7] px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                            Created
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[#222222]">
                            {selected.createdAt ? format(selected.createdAt, "dd MMM yyyy, HH:mm") : "—"}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[#ebebeb] bg-[#f7f7f7] px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                            Updated
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[#222222]">
                            {selected.updatedAt ? format(selected.updatedAt, "dd MMM yyyy, HH:mm") : "—"}
                          </div>
                        </div>
                        {safeNumber(selectedDesignBrief?.estimatedTotal, 0) > 0 ? (
                          <div className="rounded-2xl border border-[#ffd9c2] bg-[#fff4ed] px-4 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c2410c]">
                              Estimated total
                            </div>
                            <div className="mt-1 text-sm font-semibold text-[#222222]">
                              {formatMoney(safeNumber(selectedDesignBrief?.estimatedTotal, 0), "Rs")}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="hidden">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className={labelClass}>{productionManager.name} routing</p>
                        <h3 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[#222222]">
                          Move the order to the right production partner
                        </h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6a6a6a]">
                          {productionManager.name} sees every quotation here, chooses Yan,
                          Shabbanaz, or another active partner, and keeps blockers tracked
                          before print work starts. Customer name, phone, email, billing
                          address, and delivery address stay hidden from partner desks.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link href="/admin/partners" className={secondaryButtonClass}>
                          Partner settings
                        </Link>
                        {activePrintPartners.map((partner) => (
                          <Link
                            key={partner.id}
                            href={partner.path}
                            className={secondaryButtonClass}
                          >
                            Open {partner.name} page
                          </Link>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                      <div className={`${softSurfaceClass} p-4 sm:p-5`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className={labelClass}>Visible fields</p>
                            <p className="mt-1 text-sm text-[#6a6a6a]">
                              Select exactly what production partners can view for this order.
                            </p>
                          </div>
                          <span className="rounded-full border border-[#ebebeb] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#717171]">
                            {partnerVisibleFields.length} selected
                          </span>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {PARTNER_VISIBLE_FIELD_OPTIONS.map((field) => {
                            const checked = partnerVisibleFields.includes(field.key);
                            return (
                              <button
                                key={field.key}
                                type="button"
                                onClick={() => togglePartnerVisibleField(field.key)}
                                className={`rounded-2xl border px-4 py-3 text-left transition ${
                                  checked
                                    ? "border-[#222222] bg-white text-[#222222] shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
                                    : "border-[#ebebeb] bg-white text-[#6a6a6a] hover:border-[#c7c7c7]"
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <span
                                    className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                      checked
                                        ? "border-[#222222] bg-[#222222] text-white"
                                        : "border-[#d7d7d7] bg-[#f7f7f7] text-transparent"
                                    }`}
                                  >
                                    <FiCheckCircle className="h-3.5 w-3.5" />
                                  </span>
                                  <span>
                                    <span className="block text-sm font-semibold">
                                      {field.label}
                                    </span>
                                    <span className="mt-1 block text-xs leading-5 text-[#717171]">
                                      {field.description}
                                    </span>
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <label className={`mt-4 block ${labelClass}`}>
                          Print placement for production
                          <select
                            value={partnerPrintPlacement}
                            onChange={(event) =>
                              setPartnerPrintPlacement(
                                event.target.value as PartnerPrintPlacement
                              )
                            }
                            className={`${fieldClass} normal-case tracking-normal`}
                          >
                            {PARTNER_PRINT_PLACEMENT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <span className="mt-2 block text-xs normal-case tracking-normal text-[#717171]">
                            Prefilled from the client request or admin quotation when possible. The partner can confirm or change it on their desk.
                          </span>
                        </label>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {activePrintPartners.map((partner) => (
                            <button
                              key={partner.id}
                              type="button"
                              onClick={() => assignToPartners([partner.id])}
                              disabled={assigningPartner !== null}
                              className={partner.id === activePrintPartners[0]?.id ? primaryButtonClass : darkButtonClass}
                            >
                              <FiUsers className="h-4 w-4" />
                              {assigningPartner === partner.id
                                ? `Moving to ${partner.name}...`
                                : selectedPartnerIds.length === 1 && selectedPartnerIds[0] === partner.id
                                  ? `Update ${partner.name} view`
                                  : `Move order to ${partner.name}`}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => assignToPartners(activePrintPartners.map((partner) => partner.id))}
                            disabled={assigningPartner !== null || activePrintPartners.length < 2}
                            className={secondaryButtonClass}
                          >
                            <FiUsers className="h-4 w-4" />
                            {assigningPartner === "both"
                              ? "Sending to partners..."
                              : selectedPartnerIds.length > 1 && !lockedPartner
                                ? "Update partner views"
                                : "Send to all active partners"}
                          </button>
                        </div>
                      </div>

                      <div className={`${softSurfaceClass} p-4 sm:p-5`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className={labelClass}>Partner response</p>
                            <h4 className="mt-2 text-lg font-semibold text-[#222222]">
                              {lockedPartner
                                ? `${lockedPartner.name} owns this job`
                                : selectedPartnerLabel}
                            </h4>
                            {isSharedPartnerOffer ? (
                              <p className="mt-1 text-xs font-semibold text-[#717171]">
                                Compare partner responses here. The first accepted response removes it from other partner desks.
                              </p>
                            ) : null}
                          </div>
                          {isSharedPartnerOffer ? (
                            <span className="rounded-full border border-[#ebebeb] bg-white px-3 py-1.5 text-xs font-semibold text-[#717171]">
                              {selectedPartnerResponseCount}/{selectedPartnerIds.length} responded
                            </span>
                          ) : selected.partner?.requestStatus ? (
                            <span
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                                PARTNER_DECISION_TONES[selected.partner.requestStatus]
                              }`}
                            >
                              {PARTNER_DECISION_LABELS[selected.partner.requestStatus]}
                            </span>
                          ) : (
                            <span className="rounded-full border border-[#ebebeb] bg-white px-3 py-1.5 text-xs font-semibold text-[#717171]">
                              Waiting
                            </span>
                          )}
                        </div>

                        {selectedPartnerIds.length ? (
                          <div className="mt-4 rounded-2xl border border-[#ffd9c2] bg-[#fff8f1] px-4 py-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                              <label className={`${labelClass} flex-1`}>
                                {productionManager.name} client status
                                <select
                                  value={selected.partner?.clientStatus || "not_set"}
                                  onChange={(event) =>
                                    updatePartnerClientStatus(
                                      event.target.value as PartnerClientStatus
                                    )
                                  }
                                  disabled={clientStatusSaving}
                                  className={`${fieldClass} normal-case tracking-normal`}
                                >
                                  {PARTNER_CLIENT_STATUS_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <div className="rounded-xl border border-[#ffe2c7] bg-white px-3 py-2 text-xs font-semibold text-[#9a4b13] sm:w-56">
                                {clientStatusSaving
                                  ? "Saving..."
                                  : selected.partner?.clientStatus === "confirmed_half_payment"
                                    ? "Production can continue."
                                    : "Use this after dealing with the client."}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {selectedPartnerIds.length ? (
                          <div className="mt-4 space-y-3 text-sm">
                            <div className="flex flex-wrap gap-2">
                              {selectedPartnerResponses.map((response) => (
                                <span
                                  key={response.partnerId}
                                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                                    selected.partner?.lockedBy === response.partnerId
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                      : partnerResponseHasContent(response)
                                        ? PARTNER_DECISION_TONES[response.requestStatus]
                                      : "border-[#ebebeb] bg-white text-[#717171]"
                                  }`}
                                >
                                  {response.partnerName}
                                  {selected.partner?.lockedBy === response.partnerId ? " accepted" : ""}
                                </span>
                              ))}
                            </div>
                            {isSharedPartnerOffer ? (
                              <div className="space-y-3">
                                {selectedPartnerResponses.map((response) => {
                                  const hasResponse = partnerResponseHasContent(response);
                                  return (
                                  <div
                                    key={response.partnerId}
                                    className={`rounded-2xl border px-4 py-3 ${
                                      hasResponse
                                        ? "border-[#ebebeb] bg-white"
                                        : "border-dashed border-[#d9d9d9] bg-white/70"
                                    }`}
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="font-semibold text-[#222222]">
                                        {response.partnerName}
                                      </div>
                                      <span
                                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                          PARTNER_DECISION_TONES[response.requestStatus]
                                        }`}
                                      >
                                        {PARTNER_DECISION_LABELS[response.requestStatus]}
                                      </span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                      <div className="rounded-xl border border-[#ebebeb] bg-[#f7f7f7] px-3 py-2">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#717171]">
                                          Days
                                        </div>
                                        <div className="mt-1 font-semibold text-[#222222]">
                                          {response.completionDays
                                            ? `${response.completionDays}`
                                            : "-"}
                                        </div>
                                      </div>
                                      <div className="rounded-xl border border-[#ebebeb] bg-[#f7f7f7] px-3 py-2">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#717171]">
                                          Price
                                        </div>
                                        <div className="mt-1 font-semibold text-[#222222]">
                                          {response.price
                                            ? formatMoney(response.price, "Rs")
                                            : "-"}
                                        </div>
                                      </div>
                                      <div className="rounded-xl border border-[#ebebeb] bg-[#f7f7f7] px-3 py-2">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#717171]">
                                          Status
                                        </div>
                                        <div className="mt-1 line-clamp-2 font-semibold text-[#222222]">
                                          {PARTNER_PRODUCTION_STATUS_LABELS[response.productionStatus]}
                                        </div>
                                      </div>
                                      <div className="rounded-xl border border-[#ebebeb] bg-[#f7f7f7] px-3 py-2">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#717171]">
                                          Placement
                                        </div>
                                        <div className="mt-1 line-clamp-2 font-semibold text-[#222222]">
                                          {PARTNER_PRINT_PLACEMENT_LABELS[response.printPlacement]}
                                        </div>
                                      </div>
                                    </div>
                                    {response.comments ? (
                                      <p className="mt-2 whitespace-pre-wrap text-sm text-[#484848]">
                                        {response.comments}
                                      </p>
                                    ) : null}
                                    {response.missingInformation ? (
                                      <p className="mt-2 whitespace-pre-wrap rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                        {response.missingInformation}
                                      </p>
                                    ) : null}
                                    {!hasResponse ? (
                                      <p className="mt-3 rounded-xl border border-dashed border-[#d9d9d9] bg-[#f7f7f7] px-3 py-2 text-xs font-semibold text-[#717171]">
                                        Waiting for {response.partnerName} to give days, price, or a decision.
                                      </p>
                                    ) : null}
                                  </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="rounded-2xl border border-[#ebebeb] bg-white px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                                      Completion
                                    </div>
                                    <div className="mt-1 font-semibold text-[#222222]">
                                      {selected.partner?.completionDays
                                        ? `${selected.partner.completionDays} day${selected.partner.completionDays === 1 ? "" : "s"}`
                                        : "Not given"}
                                    </div>
                                  </div>
                                  <div className="rounded-2xl border border-[#ebebeb] bg-white px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                                      Partner price
                                    </div>
                                    <div className="mt-1 font-semibold text-[#222222]">
                                      {selected.partner?.price
                                        ? formatMoney(selected.partner.price, "Rs")
                                        : "Not given"}
                                    </div>
                                  </div>
                                </div>
                                <div className="rounded-2xl border border-[#ebebeb] bg-white px-4 py-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                                    Production status
                                  </div>
                                  <div className="mt-1 font-semibold text-[#222222]">
                                    {selected.partner?.productionStatus
                                      ? PARTNER_PRODUCTION_STATUS_LABELS[selected.partner.productionStatus]
                                      : "Not started"}
                                  </div>
                                </div>
                                <div className="rounded-2xl border border-[#ebebeb] bg-white px-4 py-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                                    Print placement
                                  </div>
                                  <div className="mt-1 font-semibold text-[#222222]">
                                    {PARTNER_PRINT_PLACEMENT_LABELS[
                                      selected.partner?.printPlacement || "not_set"
                                    ]}
                                  </div>
                                </div>
                                {selected.partner?.comments ? (
                                  <div className="rounded-2xl border border-[#ebebeb] bg-white px-4 py-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                                      Comments
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap text-[#484848]">
                                      {selected.partner.comments}
                                    </p>
                                  </div>
                                ) : null}
                                {selected.partner?.missingInformation ? (
                                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                                      Missing information
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap">
                                      {selected.partner.missingInformation}
                                    </p>
                                  </div>
                                ) : null}
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="mt-4 rounded-2xl border border-dashed border-[#d9d9d9] bg-white px-4 py-8 text-center text-sm text-[#717171]">
                            Select visible fields, then move this order to one or more active partners.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="hidden">
                    <div className={`${surfaceClass} p-6 sm:p-7`}>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#717171]">
                              Document Builder
                            </p>
                            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[#222222]">
                              Build the client-facing document
                            </h3>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6a6a6a]">
                              Edit the header, client details, line items, and notes in one focused workspace.
                            </p>
                          </div>
                          <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${DOC_TYPE_TONES[draft.documentType]}`}>
                            {documentTypeLabel}
                          </span>
                        </div>

                        <div className="mt-6 grid gap-5 lg:grid-cols-2">
                          <div className={`${softSurfaceClass} p-5`}>
                            <p className={labelClass}>Document setup</p>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                              <label className={labelClass}>
                                Type
                                <select
                                  value={draft.documentType}
                                  onChange={(e) =>
                                    updateDraftDocumentType(e.target.value as DocumentType)
                                  }
                                  className={fieldClass}
                                >
                                  <option value="quotation">Quotation</option>
                                  <option value="invoice">Invoice</option>
                                  <option value="partial_receipt">Partial receipt</option>
                                  <option value="receipt">Receipt</option>
                                </select>
                              </label>
                              <label className={labelClass}>
                                Number
                                <input
                                  value={draft.documentNumber}
                                  onChange={(e) =>
                                    setDraft({ ...draft, documentNumber: e.target.value })
                                  }
                                  className={fieldClass}
                                  placeholder="Q-2026-001"
                                />
                              </label>
                              <label className={`${labelClass} sm:col-span-2`}>
                                Date
                                <input
                                  type="date"
                                  value={draft.documentDate}
                                  onChange={(e) =>
                                    setDraft({ ...draft, documentDate: e.target.value })
                                  }
                                  className={fieldClass}
                                />
                              </label>
                              <label className={labelClass}>
                                {draft.documentType === "quotation" ? "Status" : "Payment status"}
                                <select
                                  value={draft.paymentStatus}
                                  onChange={(e) =>
                                    setDraft({ ...draft, paymentStatus: e.target.value })
                                  }
                                  className={fieldClass}
                                >
                                  {paymentStatusOptions.map((status) => (
                                    <option key={status} value={status}>
                                      {status}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className={labelClass}>
                                Prepared by
                                <input
                                  value={draft.preparedBy}
                                  onChange={(e) =>
                                    setDraft({ ...draft, preparedBy: e.target.value })
                                  }
                                  className={fieldClass}
                                  placeholder="Your name"
                                />
                              </label>
                            </div>

                            <div className="mt-4">
                              <p className={labelClass}>Line items visibility</p>
                              <div className="mt-2 grid gap-2 rounded-[22px] border border-[#dddddd] bg-white p-1.5 sm:grid-cols-2">
                                <button
                                  type="button"
                                  onClick={() => setDraft({ ...draft, showLineItems: true })}
                                  className={`rounded-2xl px-3 py-2.5 text-xs font-semibold transition ${
                                    draft.showLineItems
                                      ? "bg-[#222222] text-white"
                                      : "text-[#6a6a6a] hover:bg-[#f7f7f7]"
                                  }`}
                                >
                                  Detailed
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDraft({ ...draft, showLineItems: false })}
                                  className={`rounded-2xl px-3 py-2.5 text-xs font-semibold transition ${
                                    !draft.showLineItems
                                      ? "bg-[#222222] text-white"
                                      : "text-[#6a6a6a] hover:bg-[#f7f7f7]"
                                  }`}
                                >
                                  Summary only
                                </button>
                              </div>
                              <p className="mt-2 text-xs text-[#717171]">
                                Detailed shows every line and price. Summary keeps only the totals on the PDF.
                              </p>
                            </div>

                            <div className="mt-4">
                              <p className={labelClass}>Totals on PDF</p>
                              <div className="mt-2 grid gap-2 rounded-[22px] border border-[#dddddd] bg-white p-1.5 sm:grid-cols-2">
                                <button
                                  type="button"
                                  onClick={() => setDraft({ ...draft, showTotals: true })}
                                  className={`rounded-2xl px-3 py-2.5 text-xs font-semibold transition ${
                                    draft.showTotals
                                      ? "bg-[#222222] text-white"
                                      : "text-[#6a6a6a] hover:bg-[#f7f7f7]"
                                  }`}
                                >
                                  Show subtotal + grand total
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDraft({ ...draft, showTotals: false })}
                                  className={`rounded-2xl px-3 py-2.5 text-xs font-semibold transition ${
                                    !draft.showTotals
                                      ? "bg-[#222222] text-white"
                                      : "text-[#6a6a6a] hover:bg-[#f7f7f7]"
                                  }`}
                                >
                                  Hide subtotal + grand total
                                </button>
                              </div>
                              <p className="mt-2 text-xs text-[#717171]">
                                Use the hide option when the quotation is only showing different client choices and no option is confirmed yet.
                              </p>
                            </div>
                          </div>

                          <div className={`${softSurfaceClass} p-5`}>
                            <p className={labelClass}>Client details</p>
                            <div className="mt-4 grid gap-4">
                              <label className={labelClass}>
                                Client contact name
                                <AutoFitInput
                                  value={draft.contactName}
                                  onChange={(e) =>
                                    setDraft({ ...draft, contactName: e.target.value })
                                  }
                                  className={fieldClass}
                                  placeholder="Client name"
                                />
                              </label>
                              <div className="grid gap-4 sm:grid-cols-2">
                                <label className={labelClass}>
                                  Client email
                                  <AutoFitInput
                                    type="email"
                                    value={draft.contactEmail}
                                    minFontSize={9}
                                    maxFontSize={12}
                                    onChange={(e) =>
                                      setDraft({ ...draft, contactEmail: e.target.value })
                                    }
                                    className={fieldClass}
                                    placeholder="client@email.com"
                                  />
                                </label>
                                <label className={labelClass}>
                                  Phone / WhatsApp
                                  <AutoFitInput
                                    value={draft.contactPhone}
                                    onChange={(e) =>
                                      setDraft({ ...draft, contactPhone: e.target.value })
                                    }
                                    className={fieldClass}
                                    placeholder="+230 ..."
                                  />
                                </label>
                              </div>
                              <label className={labelClass}>
                                Client / Company name
                                <AutoFitInput
                                  value={draft.clientCompany}
                                  onChange={(e) =>
                                    setDraft({ ...draft, clientCompany: e.target.value })
                                  }
                                  className={fieldClass}
                                  placeholder={selected?.name || "Client or company name"}
                                />
                              </label>
                              <label className={labelClass}>
                                Billing address
                                <AutoFitInput
                                  value={draft.clientAddress}
                                  onChange={(e) =>
                                    setDraft({ ...draft, clientAddress: e.target.value })
                                  }
                                  className={fieldClass}
                                  placeholder="Street, city, postal code"
                                />
                              </label>
                              <div className="grid gap-4 sm:grid-cols-2">
                                <label className={labelClass}>
                                  BRN
                                  <AutoFitInput
                                    value={draft.clientBrn}
                                    onChange={(e) =>
                                      setDraft({ ...draft, clientBrn: e.target.value })
                                    }
                                    className={fieldClass}
                                    placeholder="Optional"
                                  />
                                </label>
                                <label className={labelClass}>
                                  VAT
                                  <AutoFitInput
                                    value={draft.clientVat}
                                    onChange={(e) =>
                                      setDraft({ ...draft, clientVat: e.target.value })
                                    }
                                    className={fieldClass}
                                    placeholder="Optional"
                                  />
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className={`${softSurfaceClass} mt-5 p-5`}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className={labelClass}>Line items</p>
                              <p className="mt-2 text-sm text-[#6a6a6a]">
                                Keep this section simple and readable for both you and the client.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => addDraftLine("Product / Size")}
                                className={secondaryButtonClass}
                              >
                                <FiPlus className="h-4 w-4" />
                                Add custom line
                              </button>
                              {QUICK_PRODUCT_LINES.map((item) => (
                                <button
                                  key={item}
                                  type="button"
                                  onClick={() => addDraftLine(`${item} (M)`)}
                                  className="inline-flex items-center gap-1 rounded-full border border-[#ebebeb] bg-white px-3 py-2 text-[11px] font-semibold text-[#484848] transition hover:border-[#c7c7c7] hover:bg-[#f7f7f7]"
                                >
                                  <FiPlus className="h-3.5 w-3.5" />
                                  {item}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="mt-5 space-y-3">
                            {draft.lines.map((line, index) => (
                              <div
                                key={`line-${index}`}
                                className="rounded-[24px] border border-[#ebebeb] bg-white p-4"
                              >
                                <div className="grid gap-3 md:grid-cols-[minmax(0,1.45fr)_92px_minmax(0,0.95fr)_112px_44px] md:items-center">
                                  <label className={`${labelClass} md:hidden`}>
                                    Description
                                    <input
                                      value={line.description}
                                      onChange={(e) =>
                                        updateDraftLine(index, { description: e.target.value })
                                      }
                                      className={fieldClass}
                                      placeholder="e.g. T-Shirt (M) with front logo"
                                    />
                                  </label>
                                  <input
                                    value={line.description}
                                    onChange={(e) =>
                                      updateDraftLine(index, { description: e.target.value })
                                    }
                                    className="hidden min-w-0 rounded-2xl border border-[#dddddd] bg-[#f7f7f7] px-4 py-3 text-sm text-[#222222] outline-none transition placeholder:text-[#b0b0b0] focus:border-[#ff6600] focus:ring-4 focus:ring-[#ff6600]/10 md:block"
                                    placeholder="e.g. T-Shirt (M) with front logo"
                                    aria-label="Line item description"
                                  />
                                  <label className={`${labelClass} md:hidden`}>
                                    Qty
                                    <input
                                      type="number"
                                      min={0}
                                      value={line.quantity}
                                      onChange={(e) =>
                                        updateDraftLine(index, {
                                          quantity: parseEditableNumber(e.target.value),
                                        })
                                      }
                                      className={fieldClass}
                                    />
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={line.quantity}
                                    onChange={(e) =>
                                      updateDraftLine(index, {
                                        quantity: parseEditableNumber(e.target.value),
                                      })
                                    }
                                    className="hidden min-w-0 rounded-2xl border border-[#dddddd] bg-[#f7f7f7] px-4 py-3 text-right text-sm text-[#222222] outline-none transition placeholder:text-[#b0b0b0] focus:border-[#ff6600] focus:ring-4 focus:ring-[#ff6600]/10 md:block"
                                    placeholder="Qty"
                                    aria-label="Quantity"
                                  />
                                  <label className={`${labelClass} md:hidden`}>
                                    Unit price
                                    <input
                                      type="number"
                                      min={0}
                                      value={line.unitPrice}
                                      onChange={(e) =>
                                        updateDraftLine(index, {
                                          unitPrice: parseEditableNumber(e.target.value),
                                        })
                                      }
                                      className={fieldClass}
                                    />
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={line.unitPrice}
                                    onChange={(e) =>
                                      updateDraftLine(index, {
                                        unitPrice: parseEditableNumber(e.target.value),
                                      })
                                    }
                                    className="hidden min-w-0 rounded-2xl border border-[#dddddd] bg-[#f7f7f7] px-4 py-3 text-right text-sm text-[#222222] outline-none transition placeholder:text-[#b0b0b0] focus:border-[#ff6600] focus:ring-4 focus:ring-[#ff6600]/10 md:block"
                                    placeholder="Unit price"
                                    aria-label="Unit price"
                                  />
                                  <div className="min-w-0 rounded-2xl border border-[#ebebeb] bg-[#f7f7f7] px-4 py-3 text-right text-sm font-semibold text-[#222222]">
                                    {formatMoney(
                                      safeNumber(line.quantity, 0) *
                                        safeNumber(line.unitPrice, 0),
                                      draft.currency
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeDraftLine(index)}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#ebebeb] bg-white text-[#717171] transition hover:border-[#ffd9c2] hover:bg-[#fff4ed] hover:text-[#c2410c] md:justify-self-end"
                                    aria-label="Remove line item"
                                  >
                                    <FiXCircle className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.9fr]">
                          <div className={`${softSurfaceClass} p-5`}>
                            <p className={labelClass}>Commercial details</p>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                              <label className={labelClass}>
                                Currency
                                <input
                                  value={draft.currency}
                                  onChange={(e) =>
                                    setDraft({ ...draft, currency: e.target.value })
                                  }
                                  className={fieldClass}
                                />
                              </label>
                              {draft.documentType === "quotation" ? (
                                <label className={labelClass}>
                                  Valid until
                                  <input
                                    type="date"
                                    value={draft.validUntil}
                                    onChange={(e) =>
                                      setDraft({ ...draft, validUntil: e.target.value })
                                    }
                                    className={fieldClass}
                                  />
                                </label>
                              ) : (
                                <div className="rounded-[24px] border border-[#ebebeb] bg-white px-4 py-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                                    Document mode
                                  </div>
                                  <div className="mt-1 text-sm font-semibold text-[#222222]">
                                    {documentTypeLabel}
                                  </div>
                                </div>
                              )}
                              <label className={labelClass}>
                                Delivery fee
                                <input
                                  type="number"
                                  min={0}
                                  value={draft.deliveryFee}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      deliveryFee: parseEditableNumber(e.target.value),
                                    })
                                  }
                                  className={fieldClass}
                                />
                              </label>
                              <label className={labelClass}>
                                Discount
                                <input
                                  type="number"
                                  min={0}
                                  value={draft.discount}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      discount: parseEditableNumber(e.target.value),
                                    })
                                  }
                                  className={fieldClass}
                                />
                              </label>
                            </div>
                          </div>

                          <div className={`${softSurfaceClass} p-5`}>
                            <p className={labelClass}>Notes and terms</p>
                            <div className="mt-4 grid gap-4">
                              <label className={labelClass}>
                                Notes to client
                                <textarea
                                  value={draft.notes}
                                  onChange={(e) =>
                                    setDraft({ ...draft, notes: e.target.value })
                                  }
                                  rows={4}
                                  className={textAreaClass}
                                  placeholder="Add any extra details, inclusions, or delivery notes..."
                                />
                              </label>
                              <label className={labelClass}>
                                Terms and payment details
                                <textarea
                                  value={draft.terms}
                                  onChange={(e) =>
                                    setDraft({ ...draft, terms: e.target.value })
                                  }
                                  rows={8}
                                  className={textAreaClass}
                                />
                              </label>
                            </div>
                          </div>
                        </div>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-3">
                      <div className={`${surfaceClass} p-5`}>
                        <p className={labelClass}>Totals</p>
                        {!draft.showTotals ? (
                          <div className="mt-5 rounded-[24px] border border-[#ebebeb] bg-[#f7f7f7] px-4 py-4 text-sm text-[#6a6a6a]">
                            Subtotal and grand total are hidden on the PDF. Use this when you are showing alternative options and the client has not confirmed a choice yet.
                          </div>
                        ) : null}
                        <div className="mt-5 space-y-3 text-sm text-[#484848]">
                          {totals.showSubtotal && (
                            <div className="flex items-center justify-between">
                              <span>Subtotal</span>
                              <span className="font-semibold text-[#222222]">
                                {formatMoney(totals.subtotal, draft.currency)}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span>Delivery</span>
                            <span className="font-semibold text-[#222222]">
                              {formatMoney(totals.deliveryFee, draft.currency)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Discount</span>
                            <span className="font-semibold text-[#222222]">
                              {totals.discount > 0
                                ? formatMoney(-totals.discount, draft.currency)
                                : formatMoney(0, draft.currency)}
                            </span>
                          </div>
                          <div className="rounded-[24px] border border-[#ffd9c2] bg-[#fff4ed] px-4 py-4">
                            <div className="flex items-center justify-between text-base font-semibold text-[#222222]">
                              <span>{draft.showTotals ? "Grand total" : "Current total"}</span>
                              <span>{formatMoney(totals.total, draft.currency)}</span>
                            </div>
                          </div>
                        </div>

                        {draft.documentType === "partial_receipt" ? (
                          <div className="mt-4 space-y-3">
                            <label className={labelClass}>
                              Amount received
                              <input
                                type="number"
                                min={0}
                                value={draft.amountReceived}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    amountReceived: parseEditableNumber(e.target.value),
                                  })
                                }
                                className={fieldClass}
                              />
                            </label>
                            <div className="rounded-[24px] border border-[#ebebeb] bg-[#f7f7f7] px-4 py-3 text-sm">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                                Balance due
                              </div>
                              <div className="mt-1 font-semibold text-[#222222]">
                                {formatMoney(totals.balanceDue, draft.currency)}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-5 grid gap-2">
                          <button
                            type="button"
                            onClick={handleDownloadPdf}
                            className={secondaryButtonClass}
                          >
                            <FiDownload className="h-4 w-4" />
                            Download PDF
                          </button>
                          <button
                            type="button"
                            onClick={handleViewPdf}
                            className={secondaryButtonClass}
                          >
                            <FiFileText className="h-4 w-4" />
                            View PDF
                          </button>
                        </div>
                      </div>

                      <div className={`${surfaceClass} p-5`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className={labelClass}>Workflow</p>
                            <p className="mt-1 text-sm text-[#6a6a6a]">
                              Move through the three operational steps.
                            </p>
                          </div>
                          <span className="rounded-full border border-[#ebebeb] bg-[#f7f7f7] px-3 py-1 text-[11px] font-semibold text-[#717171]">
                            Step by step
                          </span>
                        </div>

                        <div className="mt-4 space-y-3">
                          <div className="rounded-[24px] border border-[#ebebeb] bg-white p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className={labelClass}>Document Studio</p>
                                <p className="mt-2 text-sm text-[#6a6a6a]">
                                  Open the full editor as a popup, like Order Management.
                                </p>
                              </div>
                              <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${DOC_TYPE_TONES[draft.documentType]}`}>
                                {documentTypeLabel}
                              </span>
                            </div>

                            {sendValidationError ? (
                              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                                {sendValidationError}
                              </div>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => setWorkflowStudioOpen(true)}
                              className={`mt-4 w-full ${darkButtonClass}`}
                            >
                              <FiFileText className="h-4 w-4" />
                              Open Document Studio
                            </button>

                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <button
                                type="button"
                                onClick={handleViewPdf}
                                className={secondaryButtonClass}
                              >
                                <FiFileText className="h-4 w-4" />
                                View PDF
                              </button>
                              <button
                                type="button"
                                onClick={handleDownloadPdf}
                                className={secondaryButtonClass}
                              >
                                <FiDownload className="h-4 w-4" />
                                Download PDF
                              </button>
                            </div>
                          </div>

                          <div className="rounded-[24px] border border-[#ebebeb] bg-[#f7f7f7] p-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-[#222222]">1. Save changes</p>
                              <span className="text-[11px] text-[#717171]">Prepare</span>
                            </div>
                            <p className="mt-2 text-sm text-[#6a6a6a]">
                              Confirm the pricing and document details first.
                            </p>
                            <button
                              type="button"
                              onClick={() => saveDraft()}
                              disabled={saving}
                              className={`mt-4 w-full ${secondaryButtonClass}`}
                            >
                              <FiEdit2 className="h-4 w-4" />
                              {saving ? "Saving..." : `Save ${documentTypeLabel.toLowerCase()}`}
                            </button>
                          </div>

                          <div className="rounded-[24px] border border-[#ffd9c2] bg-[#fff4ed] p-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-[#222222]">2. Approve and send</p>
                              <span className="text-[11px] text-[#c2410c]">
                                {quoteIsMarkedApproved ? "Completed" : "Required"}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-[#6a6a6a]">
                              Mark the quote approved, then send the finished document.
                            </p>
                            <div className="mt-4 grid gap-2">
                              <button
                                type="button"
                                onClick={approveAndMoveToOrders}
                                disabled={saving || movingToOrders || quoteIsMarkedApproved}
                                className={primaryButtonClass}
                              >
                                <FiCheckCircle className="h-4 w-4" />
                                {quoteIsMarkedApproved
                                  ? "Already approved"
                                  : saving || movingToOrders
                                    ? "Approving..."
                                    : "Mark approved"}
                              </button>
                              <button
                                type="button"
                                onClick={handleSend}
                                disabled={
                                  sending ||
                                  !draft.contactEmail.trim() ||
                                  Boolean(sendValidationError)
                                }
                                title={
                                  !draft.contactEmail.trim()
                                    ? "Add client email before sending."
                                    : sendValidationError || "Ready to send."
                                }
                                className={darkButtonClass}
                              >
                                <FiSend className="h-4 w-4" />
                                {sending
                                  ? "Sending..."
                                  : quoteHasBeenSent
                                    ? "Sent to client"
                                    : `Send ${DOC_TYPE_LABELS[draft.documentType].toLowerCase()}`}
                              </button>
                            </div>
                          </div>

                          <div className="rounded-[24px] border border-[#ebebeb] bg-[#f7f7f7] p-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-[#222222]">3. Move to orders</p>
                              <span className="text-[11px] text-[#717171]">
                                {quoteInOrders ? "Synced" : "Final step"}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-[#6a6a6a]">
                              Create or sync the production order once the quote is approved.
                            </p>
                            <button
                              type="button"
                              onClick={() => moveToOrders()}
                              disabled={
                                movingToOrders ||
                                Boolean(moveToOrdersError) ||
                                !quoteIsMarkedApproved
                              }
                              title={moveToOrdersTitle}
                              className={`mt-4 w-full ${secondaryButtonClass}`}
                            >
                              <FiCheckCircle className="h-4 w-4" />
                              {movingToOrders
                                ? "Moving..."
                                : quoteInOrders
                                  ? "Sync with orders"
                                  : "Move to orders"}
                            </button>
                            {quoteInOrders ? (
                              <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                                Linked Order ID: {selected.orderTransactionId}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className={`${surfaceClass} p-5`}>
                        <p className={labelClass}>Admin actions</p>
                        <div className="mt-4 grid gap-2">
                          <button
                            type="button"
                            onClick={() => updateSelectedStatus("review", "Marked as read.")}
                            disabled={statusSaving || (selected.status || "new") !== "new"}
                            className={secondaryButtonClass}
                          >
                            <FiClock className="h-4 w-4" />
                            {statusSaving ? "Updating..." : "Mark as read"}
                          </button>
                          <Link href="/admin/orders" className={secondaryButtonClass}>
                            Open order management
                          </Link>
                        </div>

                        {sendValidationError ? (
                          <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            {sendValidationError}
                          </div>
                        ) : null}

                        {notice ? (
                          <div className="mt-4 rounded-[24px] border border-[#ebebeb] bg-[#f7f7f7] px-4 py-3 text-sm text-[#484848]">
                            {notice}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`${surfaceClass} px-6 py-16 text-center`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#717171]">
                    Nothing selected
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-[#222222]">
                    Select a quotation from the inbox
                  </h2>
                  <p className="mt-3 text-sm text-[#6a6a6a]">
                    The full request, pricing workspace, PDF tools, and approval actions will appear here.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
      {partnerRoutePopup ? (
        <div className="fixed inset-x-3 top-4 z-[80] flex justify-center sm:top-6">
          <div
            role="status"
            className={`w-full max-w-xl rounded-[24px] border px-4 py-4 shadow-[0_18px_55px_rgba(15,23,42,0.18)] backdrop-blur ${
              partnerRoutePopup.tone === "success"
                ? isDark
                  ? "border-emerald-300/35 bg-emerald-950/90 text-emerald-50"
                  : "border-emerald-200 bg-emerald-50 text-emerald-950"
                : isDark
                  ? "border-amber-300/35 bg-amber-950/90 text-amber-50"
                  : "border-amber-200 bg-amber-50 text-amber-950"
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  partnerRoutePopup.tone === "success"
                    ? isDark
                      ? "bg-emerald-300/20 text-emerald-100"
                      : "bg-emerald-600 text-white"
                    : isDark
                      ? "bg-amber-300/20 text-amber-100"
                      : "bg-amber-500 text-white"
                }`}
              >
                <FiCheckCircle className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  {partnerRoutePopup.title}
                </div>
                <p className="mt-1 text-sm leading-6">
                  {partnerRoutePopup.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPartnerRoutePopup(null)}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
                  isDark
                    ? "border-white/10 bg-white/10 hover:bg-white/15"
                    : "border-black/10 bg-white/70 hover:bg-white"
                }`}
                aria-label="Close partner notification popup"
              >
                <FiXCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {workflowStudioOpen && selected && draft ? (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-3 pb-4 pt-16 sm:px-4 sm:pt-20">
          <div
            className={`flex max-h-[calc(100vh-5rem)] w-full max-w-[1600px] flex-col overflow-hidden rounded-[28px] border shadow-2xl ${
              isDark
                ? "border-white/15 bg-slate-950 text-slate-100"
                : "border-[#ebebeb] bg-white text-[#222222]"
            }`}
          >
            <div
              className={`flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 ${
                isDark ? "border-white/10" : "border-[#ebebeb]"
              }`}
            >
              <div>
                <p className={labelClass}>Document Studio</p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em]">
                  {documentTypeLabel} {draft.documentNumber ? `#${draft.documentNumber}` : ""}
                </h3>
                <p className={`mt-1 text-sm ${isDark ? "text-slate-300" : "text-[#6a6a6a]"}`}>
                  Edit the client document, preview the PDF, then save the quotation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWorkflowStudioOpen(false)}
                className={secondaryButtonClass}
              >
                <FiXCircle className="h-4 w-4" />
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.75fr)_minmax(420px,1fr)]">
                <div className="space-y-5">
                  <div className={`${softSurfaceClass} p-5`}>
                    <p className={labelClass}>Document setup</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className={labelClass}>
                        Type
                        <select
                          value={draft.documentType}
                          onChange={(e) =>
                            updateDraftDocumentType(e.target.value as DocumentType)
                          }
                          className={fieldClass}
                        >
                          <option value="quotation">Quotation</option>
                          <option value="invoice">Invoice</option>
                          <option value="partial_receipt">Partial receipt</option>
                          <option value="receipt">Receipt</option>
                        </select>
                      </label>
                      <label className={labelClass}>
                        Number
                        <input
                          data-quotation-field="document-number"
                          value={draft.documentNumber}
                          onChange={(e) => setDraft({ ...draft, documentNumber: e.target.value })}
                          className={fieldClass}
                          placeholder="Q-2026-001"
                        />
                      </label>
                      <label className={labelClass}>
                        Date
                        <input
                          data-quotation-field="document-date"
                          type="date"
                          value={draft.documentDate}
                          onChange={(e) => setDraft({ ...draft, documentDate: e.target.value })}
                          className={fieldClass}
                        />
                      </label>
                      <label className={labelClass}>
                        {draft.documentType === "quotation" ? "Status" : "Payment status"}
                        <select
                          value={draft.paymentStatus}
                          onChange={(e) => setDraft({ ...draft, paymentStatus: e.target.value })}
                          className={fieldClass}
                        >
                          {paymentStatusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={labelClass}>
                        Prepared by
                        <input
                          data-quotation-field="prepared-by"
                          value={draft.preparedBy}
                          onChange={(e) => setDraft({ ...draft, preparedBy: e.target.value })}
                          className={fieldClass}
                          placeholder="Your name"
                        />
                      </label>
                      {draft.documentType === "quotation" ? (
                        <label className={labelClass}>
                          Valid until
                          <input
                            data-quotation-field="valid-until"
                            type="date"
                            value={draft.validUntil}
                            onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })}
                            className={fieldClass}
                          />
                        </label>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className={labelClass}>Line items visibility</p>
                        <div className="mt-2 grid gap-2 rounded-[22px] border border-[#dddddd] bg-white p-1.5 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => setDraft({ ...draft, showLineItems: true })}
                            className={`rounded-2xl px-3 py-2.5 text-xs font-semibold transition ${
                              draft.showLineItems
                                ? "bg-[#222222] text-white"
                                : "text-[#6a6a6a] hover:bg-[#f7f7f7]"
                            }`}
                          >
                            Detailed
                          </button>
                          <button
                            type="button"
                            onClick={() => setDraft({ ...draft, showLineItems: false })}
                            className={`rounded-2xl px-3 py-2.5 text-xs font-semibold transition ${
                              !draft.showLineItems
                                ? "bg-[#222222] text-white"
                                : "text-[#6a6a6a] hover:bg-[#f7f7f7]"
                            }`}
                          >
                            Summary
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className={labelClass}>Totals on PDF</p>
                        <div className="mt-2 grid gap-2 rounded-[22px] border border-[#dddddd] bg-white p-1.5 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => setDraft({ ...draft, showTotals: true })}
                            className={`rounded-2xl px-3 py-2.5 text-xs font-semibold transition ${
                              draft.showTotals
                                ? "bg-[#222222] text-white"
                                : "text-[#6a6a6a] hover:bg-[#f7f7f7]"
                            }`}
                          >
                            Show
                          </button>
                          <button
                            type="button"
                            onClick={() => setDraft({ ...draft, showTotals: false })}
                            className={`rounded-2xl px-3 py-2.5 text-xs font-semibold transition ${
                              !draft.showTotals
                                ? "bg-[#222222] text-white"
                                : "text-[#6a6a6a] hover:bg-[#f7f7f7]"
                            }`}
                          >
                            Hide
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={`${softSurfaceClass} p-5`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className={labelClass}>Line items</p>
                        <p className={`mt-2 text-sm ${isDark ? "text-slate-300" : "text-[#6a6a6a]"}`}>
                          Update quantities, pricing, and the exact document wording.
                        </p>
                      </div>
                      <button
                        type="button"
                        data-quotation-field="add-line-item"
                        onClick={() => addDraftLine("Product / Size")}
                        className={secondaryButtonClass}
                      >
                        <FiPlus className="h-4 w-4" />
                        Add line item
                      </button>
                    </div>

                    <div className="mt-5 space-y-3">
                      {draft.lines.map((line, index) => (
                        <div
                          key={`workflow-studio-line-${index}`}
                          className={`rounded-[24px] border p-4 ${
                            isDark ? "border-white/10 bg-black/20" : "border-[#ebebeb] bg-white"
                          }`}
                        >
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1.45fr)_86px_minmax(0,0.8fr)_106px_44px] md:items-center">
                            <label className={`${labelClass} md:hidden`}>
                              Description
                              <input
                                data-quotation-field={`line-${index}-description`}
                                value={line.description}
                                onChange={(e) =>
                                  updateDraftLine(index, { description: e.target.value })
                                }
                                className={fieldClass}
                                placeholder="Product / size / print"
                              />
                            </label>
                            <input
                              data-quotation-field={`line-${index}-description`}
                              value={line.description}
                              onChange={(e) =>
                                updateDraftLine(index, { description: e.target.value })
                              }
                              className="hidden min-w-0 rounded-2xl border border-[#dddddd] bg-[#f7f7f7] px-4 py-3 text-sm text-[#222222] outline-none transition placeholder:text-[#b0b0b0] focus:border-[#ff6600] focus:ring-4 focus:ring-[#ff6600]/10 md:block"
                              placeholder="Product / size / print"
                              aria-label="Line item description"
                            />
                            <label className={`${labelClass} md:hidden`}>
                              Qty
                              <input
                                data-quotation-field={`line-${index}-quantity`}
                                type="number"
                                min={0}
                                value={line.quantity}
                                onChange={(e) =>
                                  updateDraftLine(index, {
                                    quantity: parseEditableNumber(e.target.value),
                                  })
                                }
                                className={fieldClass}
                              />
                            </label>
                            <input
                              data-quotation-field={`line-${index}-quantity`}
                              type="number"
                              min={0}
                              value={line.quantity}
                              onChange={(e) =>
                                updateDraftLine(index, {
                                  quantity: parseEditableNumber(e.target.value),
                                })
                              }
                              className="hidden min-w-0 rounded-2xl border border-[#dddddd] bg-[#f7f7f7] px-4 py-3 text-right text-sm text-[#222222] outline-none transition placeholder:text-[#b0b0b0] focus:border-[#ff6600] focus:ring-4 focus:ring-[#ff6600]/10 md:block"
                              placeholder="Qty"
                              aria-label="Quantity"
                            />
                            <label className={`${labelClass} md:hidden`}>
                              Unit price
                              <input
                                data-quotation-field={`line-${index}-unit-price`}
                                type="number"
                                min={0}
                                value={line.unitPrice}
                                onChange={(e) =>
                                  updateDraftLine(index, {
                                    unitPrice: parseEditableNumber(e.target.value),
                                  })
                                }
                                className={fieldClass}
                              />
                            </label>
                            <input
                              data-quotation-field={`line-${index}-unit-price`}
                              type="number"
                              min={0}
                              value={line.unitPrice}
                              onChange={(e) =>
                                updateDraftLine(index, {
                                  unitPrice: parseEditableNumber(e.target.value),
                                })
                              }
                              className="hidden min-w-0 rounded-2xl border border-[#dddddd] bg-[#f7f7f7] px-4 py-3 text-right text-sm text-[#222222] outline-none transition placeholder:text-[#b0b0b0] focus:border-[#ff6600] focus:ring-4 focus:ring-[#ff6600]/10 md:block"
                              placeholder="Unit price"
                              aria-label="Unit price"
                            />
                            <div className="min-w-0 rounded-2xl border border-[#ebebeb] bg-[#f7f7f7] px-4 py-3 text-right text-sm font-semibold text-[#222222]">
                              {formatMoney(
                                safeNumber(line.quantity, 0) * safeNumber(line.unitPrice, 0),
                                draft.currency
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeDraftLine(index)}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#ebebeb] bg-white text-[#717171] transition hover:border-[#ffd9c2] hover:bg-[#fff4ed] hover:text-[#c2410c]"
                              aria-label="Remove line item"
                            >
                              <FiXCircle className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className={`${softSurfaceClass} p-5`}>
                    <p className={labelClass}>Client details</p>
                    <div className="mt-4 grid gap-4">
                      <label className={labelClass}>
                        Client contact name
                        <AutoFitInput
                          data-quotation-field="contact-name"
                          value={draft.contactName}
                          onChange={(e) => setDraft({ ...draft, contactName: e.target.value })}
                          className={fieldClass}
                          placeholder="Client name"
                        />
                      </label>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className={labelClass}>
                          Client email
                          <AutoFitInput
                            data-quotation-field="contact-email"
                            type="email"
                            value={draft.contactEmail}
                            minFontSize={9}
                            maxFontSize={12}
                            onChange={(e) => setDraft({ ...draft, contactEmail: e.target.value })}
                            className={fieldClass}
                            placeholder="client@email.com"
                          />
                        </label>
                        <label className={labelClass}>
                          Phone / WhatsApp
                          <AutoFitInput
                            data-quotation-field="contact-phone"
                            value={draft.contactPhone}
                            onChange={(e) => setDraft({ ...draft, contactPhone: e.target.value })}
                            className={fieldClass}
                            placeholder="+230 ..."
                          />
                        </label>
                      </div>
                      <label className={labelClass}>
                        Client / Company name
                        <AutoFitInput
                          data-quotation-field="client-company"
                          value={draft.clientCompany}
                          onChange={(e) => setDraft({ ...draft, clientCompany: e.target.value })}
                          className={fieldClass}
                          placeholder={selected.name || "Client or company name"}
                        />
                      </label>
                      <label className={labelClass}>
                        Billing address
                        <AutoFitInput
                          value={draft.clientAddress}
                          onChange={(e) => setDraft({ ...draft, clientAddress: e.target.value })}
                          className={fieldClass}
                          placeholder="Street, city, postal code"
                        />
                      </label>
                    </div>
                  </div>

                  <div className={`${softSurfaceClass} p-5`}>
                    <p className={labelClass}>Commercial details</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className={labelClass}>
                        Currency
                        <input
                          value={draft.currency}
                          onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                          className={fieldClass}
                        />
                      </label>
                      <label className={labelClass}>
                        Delivery fee
                        <input
                          type="number"
                          min={0}
                          value={draft.deliveryFee}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              deliveryFee: parseEditableNumber(e.target.value),
                            })
                          }
                          className={fieldClass}
                        />
                      </label>
                      <label className={labelClass}>
                        Discount
                        <input
                          type="number"
                          min={0}
                          value={draft.discount}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              discount: parseEditableNumber(e.target.value),
                            })
                          }
                          className={fieldClass}
                        />
                      </label>
                      <div className="rounded-[24px] border border-[#ebebeb] bg-white px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                          Grand total
                        </div>
                        <div className="mt-2 text-lg font-semibold text-[#222222]">
                          {formatMoney(totals.total, draft.currency)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={`${softSurfaceClass} p-5`}>
                    <p className={labelClass}>Notes and terms</p>
                    <div className="mt-4 grid gap-4">
                      <label className={labelClass}>
                        Notes to client
                        <textarea
                          value={draft.notes}
                          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                          rows={4}
                          className={textAreaClass}
                          placeholder="Add any extra details or delivery notes..."
                        />
                      </label>
                      <label className={labelClass}>
                        Terms and payment details
                        <textarea
                          data-quotation-field="terms"
                          value={draft.terms}
                          onChange={(e) => setDraft({ ...draft, terms: e.target.value })}
                          rows={6}
                          className={textAreaClass}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <aside className="min-w-0 xl:sticky xl:top-0 xl:self-start">
                  <div className={`${softSurfaceClass} overflow-hidden p-3`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className={labelClass}>Automatic quotation preview</p>
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                            Live
                          </span>
                        </div>
                        <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-[#717171]"}`}>
                          Updates automatically while you type.
                        </p>
                        {quotationMissingFields.length ? (
                          <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-2.5 py-2 text-[10px] leading-4 text-red-700">
                            <span className="font-extrabold">Missing information: </span>
                            {quotationMissingFields.map((field) => field.label).join(" • ")}
                          </div>
                        ) : null}
                      </div>
                      {quotationMissingCount > 0 ? (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-extrabold text-red-700">
                          {quotationMissingCount} missing
                        </span>
                      ) : (
                        <FiCheckCircle className="h-5 w-5 text-emerald-600" aria-label="Quotation complete" />
                      )}
                    </div>
                    <div className="overflow-hidden rounded-[20px] border border-[#d7d7d7] bg-[#e9ecef]">
                      {quotationPreviewUrl ? (
                        <iframe
                          key={`studio-${quotationPreviewUrl}`}
                          src={quotationPreviewUrl}
                          title={`Document Studio live ${DOC_TYPE_LABELS[draft.documentType]} PDF preview`}
                          className="h-[calc(100vh-15rem)] min-h-[620px] w-full bg-white"
                        />
                      ) : (
                        <div className="grid h-[calc(100vh-15rem)] min-h-[620px] place-items-center bg-white text-center text-[#717171]">
                          <div>
                            <FiRefreshCw className="mx-auto h-6 w-6 animate-spin text-[#ff6600]" />
                            <p className="mt-3 text-xs font-semibold">Generating live PDF…</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </aside>
              </div>
            </div>

            <div
              className={`flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 ${
                isDark ? "border-white/10 bg-slate-950" : "border-[#ebebeb] bg-white"
              }`}
            >
              <div className={`text-sm ${isDark ? "text-slate-300" : "text-[#6a6a6a]"}`}>
                Current total:{" "}
                <span className="font-semibold text-[#ff6600]">
                  {formatMoney(totals.total, draft.currency)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleViewPdf} className={secondaryButtonClass}>
                  <FiFileText className="h-4 w-4" />
                  View PDF
                </button>
                <button type="button" onClick={handleDownloadPdf} className={secondaryButtonClass}>
                  <FiDownload className="h-4 w-4" />
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => saveDraft()}
                  disabled={saving}
                  className={primaryButtonClass}
                >
                  <FiEdit2 className="h-4 w-4" />
                  {saving ? "Saving..." : `Save ${documentTypeLabel.toLowerCase()}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
