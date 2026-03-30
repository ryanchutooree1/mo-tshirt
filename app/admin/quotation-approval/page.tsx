"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase";
import {
  addDoc,
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
import { addDays, format, formatDistanceToNow } from "date-fns";
import { jsPDF } from "jspdf";
import {
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
  FiTrash2,
  FiXCircle,
  FiUpload,
} from "react-icons/fi";
import { CONTACT_PHONE_DISPLAY } from "@/data/work";
import {
  formatQuoteGarmentDescription,
  sortQuoteColors,
  type QuoteGarmentLine as QuoteGarmentRequestLine,
} from "@/lib/shops";

type QuoteStatus = "new" | "review" | "approved" | "sent";

type QuoteLine = {
  description: string;
  quantity: number | "";
  unitPrice: number | "";
};

type DocumentType = "quotation" | "invoice" | "receipt" | "partial_receipt";

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
  currency: string;
  lines: QuoteLine[];
  deliveryFee: number;
  discount: number;
  amountReceived: number;
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
};

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
  orderTransactionId?: string;
  movedToOrdersAt?: Date | null;
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

function QuoteAttachmentPreview({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retryNonce, setRetryNonce] = useState(0);
  const retryAttemptsRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    retryAttemptsRef.current = 0;
    setRetryNonce(0);
    setStatus("loading");
    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, [src]);

  function clearRetryTimer() {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  function handleError() {
    const nextAttempt = retryAttemptsRef.current + 1;
    if (nextAttempt > ATTACHMENT_PREVIEW_RETRY_LIMIT) {
      clearRetryTimer();
      setStatus("error");
      return;
    }

    retryAttemptsRef.current = nextAttempt;
    setStatus("loading");
    clearRetryTimer();
    retryTimerRef.current = window.setTimeout(() => {
      setRetryNonce((current) => current + 1);
    }, ATTACHMENT_PREVIEW_RETRY_DELAY_MS * nextAttempt);
  }

  return (
    <div className="relative mt-3 overflow-hidden rounded-[24px] border border-[#ebebeb] bg-white p-2.5 shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
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
        key={`${src}-${retryNonce}`}
        src={src}
        alt={alt}
        className={`h-40 w-full rounded-xl object-contain transition-opacity duration-200 ${
          status === "ready" ? "opacity-100" : "opacity-0"
        }`}
        loading="lazy"
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
  new: "border-[#ffd2dc] bg-[#fff5f7] text-[#d12f5f]",
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

const DOC_TYPE_TONES: Record<DocumentType, string> = {
  quotation: "border-[#ffd2dc] bg-[#fff5f7] text-[#d12f5f]",
  invoice: "border-[#ebebeb] bg-[#f7f7f7] text-[#484848]",
  partial_receipt: "border-[#ffe2b8] bg-[#fff8eb] text-[#b76a12]",
  receipt: "border-[#d7f0e0] bg-[#f4fbf7] text-[#1f7a4d]",
};

const QUICK_PRODUCT_LINES = ["T-Shirt", "Poloshirt", "Hoodie", "Cap"];

const getQuoteDocumentType = (quote: QuoteRecord): DocumentType => quote.quote?.documentType || "quotation";

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

const safeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getPopulatedQuoteLineCount = (lines: QuoteLine[]) =>
  lines.filter((line) => {
    return (
      String(line.description || "").trim().length > 0 ||
      safeNumber(line.quantity, 0) > 0 ||
      safeNumber(line.unitPrice, 0) > 0
    );
  }).length;

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
  if (Array.isArray(quote.attachments) && quote.attachments.length) {
    return quote.attachments.filter(
      (entry) => Boolean(entry?.filename || entry?.url || entry?.label || entry?.description || entry?.quantity)
    );
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
    }));
    const fallbackLines: QuoteLine[] =
      quote.garments?.map((entry) => {
        return {
          description: formatQuoteGarmentDescription(entry),
          quantity: safeNumber(entry.quantity, 0),
          unitPrice: "",
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
      };
    }) || [];

  const lines: QuoteLine[] = fromGarments.length
    ? fromGarments
    : [
      {
        description: "Custom item",
        quantity: safeNumber(quote.quantity, 1),
        unitPrice: "",
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

  const lineTotals = draft.lines.map((line) => ({
    ...line,
    lineTotal: safeNumber(line.quantity, 0) * safeNumber(line.unitPrice, 0),
  }));
  const subtotal = lineTotals.reduce((acc, line) => acc + line.lineTotal, 0);
  const deliveryFee = safeNumber(draft.deliveryFee, 0);
  const discount = safeNumber(draft.discount, 0);
  const amountReceived = safeNumber(draft.amountReceived, 0);
  const grandTotal = subtotal + deliveryFee - discount;
  const balanceDue = Math.max(0, grandTotal - amountReceived);
  const showSubtotal = getPopulatedQuoteLineCount(draft.lines) > 1;

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
  doc.text(`No ${draft.documentNumber || quote.id}`, pageWidth - margin, rightInfoY, {
    align: "right",
  });
  rightInfoY += rightLine;
  doc.text(`Date ${format(parsedDate, "dd/MM/yyyy")}`, pageWidth - margin, rightInfoY, {
    align: "right",
  });
  rightInfoY += rightLine;
  if (draft.documentType === "quotation") {
    doc.text(`Valid until ${format(validUntilSafe, "dd/MM/yyyy")}`, pageWidth - margin, rightInfoY, {
      align: "right",
    });
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
  doc.text(`Prepared by: ${draft.preparedBy || DEFAULT_PREPARED_BY}`, pageWidth - margin, rightInfoY, {
    align: "right",
  });

  // Client section
  let y = 176;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(accent.r, accent.g, accent.b);
  doc.text(`${docTitle} for`, margin, y);
  y += 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(20);
  doc.text(draft.clientCompany || quote.name || "Client", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const clientAddress = (draft.clientAddress || "").trim();
  if (clientAddress) {
    doc.setFont("helvetica", "bold");
    doc.text("Address:", margin, y);
    doc.setFont("helvetica", "normal");
    const addressLines = doc.splitTextToSize(clientAddress, contentWidth - 140);
    doc.text(addressLines, margin + 55, y);
    y += addressLines.length * 14;
  }
  if (draft.clientBrn) {
    doc.setFont("helvetica", "bold");
    doc.text("BRN:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(draft.clientBrn, margin + 35, y);
    y += 16;
  }
  if (draft.clientVat) {
    doc.setFont("helvetica", "bold");
    doc.text("VAT:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(draft.clientVat, margin + 35, y);
    y += 16;
  }

  y += 10;
  doc.setDrawColor(120);
  doc.line(margin, y, margin + contentWidth, y);
  y += 22;

  const descWidth = showLineItems ? pageWidth - margin * 2 - 220 : pageWidth - margin * 2 - 120;
  const colQtyX = pageWidth - margin - 180;
  const colUnitX = pageWidth - margin - 95;
  const colTotalX = pageWidth - margin;
  const totalsLabelX = pageWidth - margin - 175;

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
  lineTotals.forEach((line) => {
    const descriptionLines = doc.splitTextToSize(line.description || "Item", descWidth);
    const rowHeight = Math.max(30, descriptionLines.length * 14 + 12);
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, rowY - 12, contentWidth, rowHeight, "F");
    doc.text(descriptionLines, margin + 6, rowY);
    if (showLineItems) {
      doc.text(String(safeNumber(line.quantity, 0)), colQtyX, rowY, { align: "right" });
      doc.text(formatMoney(safeNumber(line.unitPrice, 0), draft.currency), colUnitX, rowY, { align: "right" });
    }
    doc.text(formatMoney(line.lineTotal, draft.currency), colTotalX, rowY, { align: "right" });
    rowY += rowHeight + 6;
  });

  y = rowY + 6;
  doc.setDrawColor(120);
  doc.line(margin, y, margin + contentWidth, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(50);
  if (showSubtotal) {
    doc.text("Subtotal", totalsLabelX, y, { align: "left" });
    doc.text(formatMoney(subtotal, draft.currency), colTotalX, y, { align: "right" });
    y += 16;
  }
  if (deliveryFee > 0) {
    doc.text("Delivery fee", totalsLabelX, y, { align: "left" });
    doc.text(formatMoney(deliveryFee, draft.currency), colTotalX, y, { align: "right" });
    y += 16;
  }
  if (discount > 0) {
    doc.setTextColor(180, 0, 0);
    doc.text("Discount", totalsLabelX, y, { align: "left" });
    doc.text(formatMoney(-discount, draft.currency), colTotalX, y, { align: "right" });
    doc.setTextColor(50);
    y += 16;
  }
  y += 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20);
  doc.text("Grand Total", totalsLabelX, y, { align: "left" });
  doc.text(formatMoney(grandTotal, draft.currency), colTotalX, y, { align: "right" });
  doc.setFontSize(10);

  if (draft.documentType === "partial_receipt") {
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50);
    doc.text("Amount received", totalsLabelX, y, { align: "left" });
    doc.text(formatMoney(amountReceived, draft.currency), colTotalX, y, { align: "right" });
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20);
    doc.text("Balance due", totalsLabelX, y, { align: "left" });
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
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40);
  const splitTerms = doc.splitTextToSize(draft.terms || getDefaultTerms(draft.documentType), contentWidth - 12);
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
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");
  const [draft, setDraft] = useState<QuoteDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [deletingQuote, setDeletingQuote] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [movingToOrders, setMovingToOrders] = useState(false);
  const [logo, setLogo] = useState<LogoAsset | null>(null);
  const prevDocumentTypeRef = useRef<DocumentType | null>(null);

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
  }, []);

  useEffect(() => {
    if (!quotes.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !quotes.find((q) => q.id === selectedId)) {
      setSelectedId(quotes[0].id);
    }
  }, [quotes, selectedId]);

  const selected = useMemo(
    () => quotes.find((quote) => quote.id === selectedId) || null,
    [quotes, selectedId]
  );

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
  const selectedTotalQty = useMemo(() => {
    if (selectedDesignBrief?.totalQty && selectedDesignBrief.totalQty > 0) {
      return selectedDesignBrief.totalQty;
    }
    return (selected?.garments || []).reduce((sum, entry) => sum + safeNumber(entry.quantity, 0), 0);
  }, [selected, selectedDesignBrief]);

  const selectedAttachments = useMemo(() => getQuoteAttachments(selected), [selected]);

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft(buildDraftFromQuote(selected));
  }, [selected]);

  useEffect(() => {
    if (!draft) return;
    const prevType = prevDocumentTypeRef.current;
    prevDocumentTypeRef.current = draft.documentType;
    if (!prevType || prevType === draft.documentType) return;
    const nextTerms = getDefaultTerms(draft.documentType);
    setDraft((prev) => (prev ? { ...prev, terms: nextTerms } : prev));
  }, [draft]);

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
    if (!draft) return { subtotal: 0, total: 0, amountReceived: 0, balanceDue: 0, lineCount: 0 };
    const subtotal = draft.lines.reduce(
      (acc, line) => acc + safeNumber(line.quantity, 0) * safeNumber(line.unitPrice, 0),
      0
    );
    const total = subtotal + draft.deliveryFee - draft.discount;
    const amountReceived = safeNumber(draft.amountReceived, 0);
    const balanceDue = Math.max(0, total - amountReceived);
    const lineCount = getPopulatedQuoteLineCount(draft.lines);
    return { subtotal, total, amountReceived, balanceDue, lineCount };
  }, [draft]);

  const paymentStatusOptions = useMemo(() => {
    if (!draft) return [];
    if (draft.documentType === "quotation") return ["Quotation only"];
    if (draft.documentType === "receipt") return ["Paid"];
    if (draft.documentType === "partial_receipt") return ["Partially paid"];
    return ["Unpaid", "Partially paid", "Paid"];
  }, [draft]);

  const documentTypeLabel = useMemo(() => {
    if (!draft) return "";
    if (draft.documentType === "quotation") return "Quotation";
    if (draft.documentType === "invoice") return "Invoice";
    if (draft.documentType === "receipt") return "Receipt";
    return "Partial receipt";
  }, [draft]);

  const selectedStatus: QuoteStatus = (selected?.status || "new") as QuoteStatus;
  const selectedPrimaryStatus = useMemo(() => {
    if (!selected) return null;
    const persistedType = getQuoteDocumentType(selected);
    const activeType = selectedStatus === "sent" ? persistedType : draft?.documentType || persistedType;
    return getPrimaryStatusMeta(selectedStatus, activeType);
  }, [selected, selectedStatus, draft?.documentType]);

  const sendValidationError = useMemo(
    () => (draft ? validateDraftBeforeSend(draft) : "Select a quotation first."),
    [draft]
  );
  const quoteIsMarkedApproved = selectedStatus === "approved" || selectedStatus === "sent";
  const quoteHasBeenSent = selectedStatus === "sent";
  const quoteInOrders = Boolean(selected?.orderTransactionId);
  const moveToOrdersTitle = sendValidationError
    ? sendValidationError
    : quoteIsMarkedApproved
      ? "Create or sync this quotation into Order Management."
      : "Complete Step 2 first (Mark approved or Send to client).";

  const buildStoredQuotePayload = (baseDraft: QuoteDraft) => ({
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
    currency: baseDraft.currency,
    lines: baseDraft.lines.map((line) => ({
      description: line.description,
      quantity: safeNumber(line.quantity, 0),
      unitPrice: safeNumber(line.unitPrice, 0),
    })),
    deliveryFee: baseDraft.deliveryFee,
    discount: baseDraft.discount,
    amountReceived: baseDraft.amountReceived,
    notes: baseDraft.notes,
    validUntil: baseDraft.validUntil,
    terms: baseDraft.terms,
    subtotal: totals.subtotal,
    total: totals.total,
  });

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
            lines: [...prev.lines, { description, quantity: 1, unitPrice: "" }],
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

  const saveDraft = async (nextStatus?: QuoteStatus) => {
    if (!selected || !draft) return;
    setSaving(true);
    setNotice(null);
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
      setNotice("Document saved.");
    } catch {
      setNotice("Failed to save document.");
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

  const handleDeleteQuote = async () => {
    if (!selected) return;
    const password = window.prompt("Enter your admin login password to delete this quotation.");
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
        currency: "Rs",
        lines: [{ description: "Product / Size", quantity: 1, unitPrice: "" }],
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
      const pdfDoc = buildPdfDoc(selected, draft, logo);
      const pdfDataUri = pdfDoc.output("datauristring");
      const clientName = draft.contactName.trim() || selected.name || "there";
      const documentLabel = DOC_TYPE_LABELS[draft.documentType].toLowerCase();
      const payload = {
        quoteId: selected.id,
        to: recipientEmail,
        clientName: draft.contactName.trim(),
        clientEmail: draft.contactEmail.trim(),
        clientPhone: draft.contactPhone.trim(),
        subject: `Your ${documentLabel} from MO T-SHIRT`,
        message: draft.notes?.trim()
          ? `Hi ${clientName},\n\nPlease find your ${documentLabel} attached.\n\n${draft.notes}\n\nBest regards,\nMo T-Shirt Team`
          : `Hi ${clientName},\n\nPlease find your ${documentLabel} attached.\n\nBest regards,\nMo T-Shirt Team`,
        pdfBase64: pdfDataUri,
        quote: buildStoredQuotePayload(draft),
      };

      const res = await fetch("/api/admin/quotes/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error("Failed to send");
      }
      setNotice(`${DOC_TYPE_LABELS[draft.documentType]} sent to client.`);
    } catch {
      setNotice(`Could not send ${DOC_TYPE_LABELS[draft.documentType].toLowerCase()}.`);
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
      const nextAttachments = [...existingAttachments, ...uploadedAttachments];
      await updateDoc(doc(db, "quotes", selected.id), {
        attachments: nextAttachments,
        attachment: nextAttachments[0] || null,
        updatedAt: serverTimestamp(),
      });
      setNotice(uploadedAttachments.length > 1 ? "Files uploaded." : "Attachment uploaded.");
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

  const moveToOrders = async () => {
    if (!selected || !draft) return;
    const draftValidation = validateDraftBeforeSend(draft);
    if (draftValidation) {
      setNotice(draftValidation);
      return;
    }

    setMovingToOrders(true);
    setNotice(null);
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

      setNotice(`Moved to Order Management. Order ID: ${transactionId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to move to orders.";
      setNotice(message);
    } finally {
      setMovingToOrders(false);
    }
  };

  const surfaceClass =
    "rounded-[32px] border border-[#ebebeb] bg-white shadow-[0_8px_28px_rgba(0,0,0,0.08)]";
  const softSurfaceClass = "rounded-[28px] border border-[#ebebeb] bg-[#f7f7f7]";
  const fieldClass =
    "mt-2 w-full rounded-2xl border border-[#dddddd] bg-white px-4 py-3 text-sm text-[#222222] outline-none transition placeholder:text-[#b0b0b0] focus:border-[#ff385c] focus:ring-4 focus:ring-[#ff385c]/10";
  const textAreaClass = `${fieldClass} min-h-[120px] resize-y`;
  const labelClass = "text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]";
  const secondaryButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-full border border-[#dddddd] bg-white px-4 py-2.5 text-xs font-semibold text-[#484848] transition hover:border-[#c7c7c7] hover:bg-[#f7f7f7] hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)] disabled:cursor-not-allowed disabled:border-[#ececec] disabled:bg-[#f7f7f7] disabled:text-[#b0b0b0]";
  const darkButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-full bg-[#222222] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#b0b0b0]";
  const primaryButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#ff385c,#e61e4d)] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(255,56,92,0.24)] transition hover:shadow-[0_14px_28px_rgba(255,56,92,0.32)] disabled:cursor-not-allowed disabled:bg-[#f4b8c5] disabled:text-white disabled:shadow-none";

  return (
    <div className="quotation-approval-page min-h-screen bg-white text-[#222222]">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(255,255,255,0.96),rgba(255,255,255,0))]" />
        <div className="pointer-events-none absolute -left-16 top-10 h-56 w-56 rounded-full bg-[#f7f7f7] blur-3xl" />
        <div className="pointer-events-none absolute right-[-3rem] top-16 h-64 w-64 rounded-full bg-[#ffe3ea]/80 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-4rem] left-1/2 h-52 w-52 -translate-x-1/2 rounded-full bg-[#f3f4f6] blur-3xl" />

        <div className="relative mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
          <header className={`${surfaceClass} relative overflow-hidden px-6 py-7 sm:px-8`}>
            <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,56,92,0.08),transparent_68%)] lg:block" />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#717171]">
                  Quotation Workbench
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[#222222] sm:text-4xl">
                  Client quotes, priced with less noise
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6a6a6a]">
                  A lighter admin flow for reviewing requests, building the PDF, and moving approved work straight into production.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#ffd2dc] bg-[#fff5f7] px-3 py-1.5 text-[11px] font-semibold text-[#d12f5f]">
                    <span className="h-2 w-2 rounded-full bg-[#ff385c]" />
                    Live inbox
                  </span>
                  <span className="rounded-full border border-[#ebebeb] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#6a6a6a]">
                    Save anytime
                  </span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Inbox", value: stats.total, note: "active requests" },
                  { label: "Needs attention", value: stats.new + stats.review, note: "new or in review" },
                  { label: "Sent", value: stats.sent, note: "already delivered" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-[24px] border border-[#ebebeb] bg-[#f7f7f7] px-4 py-4"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#717171]">
                      {stat.label}
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#222222]">
                      {stat.value}
                    </div>
                    <div className="text-xs text-[#717171]">{stat.note}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mt-6 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <div className={`${softSurfaceClass} p-4 sm:p-5`}>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#6a6a6a]">
                  <span className="rounded-full border border-[#ebebeb] bg-white px-3 py-1">1. Review request</span>
                  <span className="rounded-full border border-[#ebebeb] bg-white px-3 py-1">2. Build document</span>
                  <span className="rounded-full border border-[#ebebeb] bg-white px-3 py-1">3. Approve and send</span>
                  <span className="rounded-full border border-[#ebebeb] bg-white px-3 py-1">4. Move to orders</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
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
                  Refresh inbox
                </button>
              </div>
            </div>
          </header>

          <div className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className={`${surfaceClass} h-fit p-4 lg:sticky lg:top-24`}>
              <div className="flex items-center gap-3 rounded-[24px] border border-[#ebebeb] bg-white px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <FiSearch className="h-4 w-4 text-[#717171]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent text-sm text-[#222222] outline-none placeholder:text-[#b0b0b0]"
                  placeholder="Search by name, email, phone..."
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-semibold">
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
                          ? "border-[#ffd2dc] bg-[#fff5f7] text-[#d12f5f]"
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
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                {filtered.map((quote) => {
                  const status = quote.status || "new";
                  const docType = getQuoteDocumentType(quote);
                  const primaryStatus = getPrimaryStatusMeta(status, docType);
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
                      onClick={() => setSelectedId(quote.id)}
                      className={`w-full rounded-[26px] border px-4 py-4 text-left transition ${
                        selectedTone
                          ? "border-[#ffc7d3] bg-white shadow-[0_18px_36px_-30px_rgba(255,56,92,0.28)]"
                          : "border-[#ebebeb] bg-white hover:border-[#cfcfcf] hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold ${
                            selectedTone
                              ? "bg-[#ff385c] text-white"
                              : "bg-[#f7f7f7] text-[#484848]"
                          }`}
                        >
                          {initials || "Q"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#222222]">
                                {quote.name || "Unnamed client"}
                              </p>
                              <p className="truncate text-xs text-[#717171]">
                                {quote.email || "No email"}
                              </p>
                            </div>
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${primaryStatus.tone}`}>
                              {primaryStatus.label}
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-[#6a6a6a]">
                            {garmentPreview || "No product line yet"}
                            {totalPieces > 0 ? ` • ${totalPieces} pc${totalPieces > 1 ? "s" : ""}` : ""}
                          </p>
                          <div className="mt-3 flex items-center justify-between text-[11px] text-[#717171]">
                            <span>{quote.source || "Website"}</span>
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

            <section className="space-y-6">
              {selected && draft ? (
                <>
                  <div className={`${surfaceClass} overflow-hidden`}>
                    <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#717171]">
                          Client Overview
                        </p>
                        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[#222222]">
                          {draft.contactName || selected.name || "Walk-in client"}
                        </h2>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-2 rounded-full border border-[#ebebeb] bg-[#f7f7f7] px-3 py-1.5 text-xs text-[#484848]">
                            <FiMail className="h-3.5 w-3.5 text-[#ff385c]" />
                            {draft.contactEmail || "No email yet"}
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full border border-[#ebebeb] bg-[#f7f7f7] px-3 py-1.5 text-xs text-[#484848]">
                            <FiPhone className="h-3.5 w-3.5 text-[#ff385c]" />
                            {draft.contactPhone || "No phone yet"}
                          </span>
                          <span className="rounded-full border border-[#ebebeb] bg-[#f7f7f7] px-3 py-1.5 text-xs text-[#484848]">
                            Source: {selected.source || "Website"}
                          </span>
                          {selected.delivery ? (
                            <span className="rounded-full border border-[#ebebeb] bg-[#f7f7f7] px-3 py-1.5 text-xs text-[#484848]">
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
                                ? "border-[#ffd2dc] bg-[#fff5f7] text-[#d12f5f]"
                                : "border-[#d7f0e0] bg-[#f4fbf7] text-[#1f7a4d]"
                            }`}
                          >
                            {selectedStatus === "new" ? "Unread" : "Read"}
                          </span>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-[#ebebeb] bg-white px-4 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                              Quote number
                            </div>
                            <div className="mt-1 text-sm font-semibold text-[#222222]">
                              {draft.documentNumber}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-[#ebebeb] bg-white px-4 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                              Order sync
                            </div>
                            <div className="mt-1 text-sm font-semibold text-[#222222]">
                              {selected.orderTransactionId || "Not in orders yet"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-4">
                    <div className={`${surfaceClass} p-5 xl:col-span-1`}>
                      <p className={labelClass}>Request</p>
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

                    <div className={`${surfaceClass} p-5 xl:col-span-1`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className={labelClass}>Artwork</p>
                        <label
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
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
                              attachment.contentType?.startsWith("image/")
                            );
                            const attachmentDownloadHref = getQuoteAttachmentDownloadHref(
                              attachment,
                              index
                            );
                            return (
                              <div
                                key={`${attachment.url || attachment.filename || "attachment"}-${index}`}
                                className="rounded-[22px] border border-[#ebebeb] bg-[#f7f7f7] p-3.5"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#717171]">
                                      {attachment.label || `Design ${index + 1}`}
                                    </p>
                                    <p className="mt-1 truncate text-sm font-semibold text-[#222222]">
                                      {attachment.filename || "Attachment"}
                                    </p>
                                    {attachment.description ? (
                                      <p className="mt-1 text-xs text-[#717171]">
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
                                    <div className="flex items-center gap-2">
                                      <a
                                        href={attachment.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={secondaryButtonClass}
                                      >
                                        <FiFileText className="h-3.5 w-3.5" />
                                        Open file
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
                                  <QuoteAttachmentPreview
                                    src={attachment.url}
                                    alt={attachment.filename || "Attachment"}
                                  />
                                ) : !attachment.url ? (
                                  <div className="mt-3 rounded-2xl border border-dashed border-[#d9d9d9] bg-white px-3 py-3 text-xs text-[#717171]">
                                    Attachment received via email:{" "}
                                    {attachment.filename || `Attachment ${index + 1}`}
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

                    <div className={`${surfaceClass} p-5 xl:col-span-1`}>
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

                    <div className={`${surfaceClass} p-5 xl:col-span-1`}>
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
                          <div className="rounded-2xl border border-[#ffd2dc] bg-[#fff5f7] px-4 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d12f5f]">
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

                  <div className="space-y-5">
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
                                    setDraft({ ...draft, documentType: e.target.value as DocumentType })
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
                              <div className="mt-2 grid grid-cols-2 gap-2 rounded-[22px] border border-[#dddddd] bg-white p-1.5">
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
                          </div>

                          <div className={`${softSurfaceClass} p-5`}>
                            <p className={labelClass}>Client details</p>
                            <div className="mt-4 grid gap-4">
                              <label className={labelClass}>
                                Client contact name
                                <input
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
                                  <input
                                    type="email"
                                    value={draft.contactEmail}
                                    onChange={(e) =>
                                      setDraft({ ...draft, contactEmail: e.target.value })
                                    }
                                    className={fieldClass}
                                    placeholder="client@email.com"
                                  />
                                </label>
                                <label className={labelClass}>
                                  Phone / WhatsApp
                                  <input
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
                                <input
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
                                <input
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
                                  <input
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
                                  <input
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
                                className="grid gap-3 rounded-[24px] border border-[#ebebeb] bg-white p-4 md:grid-cols-[minmax(0,1.45fr)_92px_minmax(0,0.95fr)_112px_44px] md:items-center"
                              >
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
                                  className="hidden min-w-0 rounded-2xl border border-[#dddddd] bg-[#f7f7f7] px-4 py-3 text-sm text-[#222222] outline-none transition placeholder:text-[#b0b0b0] focus:border-[#ff385c] focus:ring-4 focus:ring-[#ff385c]/10 md:block"
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
                                        quantity:
                                          e.target.value === ""
                                            ? ""
                                            : safeNumber(e.target.value, 0),
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
                                      quantity:
                                        e.target.value === ""
                                          ? ""
                                          : safeNumber(e.target.value, 0),
                                    })
                                  }
                                  className="hidden min-w-0 rounded-2xl border border-[#dddddd] bg-[#f7f7f7] px-4 py-3 text-right text-sm text-[#222222] outline-none transition placeholder:text-[#b0b0b0] focus:border-[#ff385c] focus:ring-4 focus:ring-[#ff385c]/10 md:block"
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
                                        unitPrice:
                                          e.target.value === ""
                                            ? ""
                                            : safeNumber(e.target.value, 0),
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
                                      unitPrice:
                                        e.target.value === ""
                                          ? ""
                                          : safeNumber(e.target.value, 0),
                                    })
                                  }
                                  className="hidden min-w-0 rounded-2xl border border-[#dddddd] bg-[#f7f7f7] px-4 py-3 text-right text-sm text-[#222222] outline-none transition placeholder:text-[#b0b0b0] focus:border-[#ff385c] focus:ring-4 focus:ring-[#ff385c]/10 md:block"
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
                                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#ebebeb] bg-white text-[#717171] transition hover:border-[#ffd2dc] hover:bg-[#fff5f7] hover:text-[#d12f5f] md:justify-self-end"
                                  aria-label="Remove line item"
                                >
                                  <FiXCircle className="h-4 w-4" />
                                </button>
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
                                      deliveryFee: safeNumber(e.target.value, 0),
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
                                      discount: safeNumber(e.target.value, 0),
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
                        <div className="mt-5 space-y-3 text-sm text-[#484848]">
                          {totals.lineCount > 1 && (
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
                              {formatMoney(draft.deliveryFee, draft.currency)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Discount</span>
                            <span className="font-semibold text-[#222222]">
                              {draft.discount > 0
                                ? formatMoney(-draft.discount, draft.currency)
                                : formatMoney(0, draft.currency)}
                            </span>
                          </div>
                          <div className="rounded-[24px] border border-[#ffd2dc] bg-[#fff5f7] px-4 py-4">
                            <div className="flex items-center justify-between text-base font-semibold text-[#222222]">
                              <span>Total</span>
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
                                    amountReceived: safeNumber(e.target.value, 0),
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
                              {saving ? "Saving..." : "Save quotation"}
                            </button>
                          </div>

                          <div className="rounded-[24px] border border-[#ffd2dc] bg-[#fff5f7] p-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-[#222222]">2. Approve and send</p>
                              <span className="text-[11px] text-[#d12f5f]">
                                {quoteIsMarkedApproved ? "Completed" : "Required"}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-[#6a6a6a]">
                              Mark the quote approved, then send the finished document.
                            </p>
                            <div className="mt-4 grid gap-2">
                              <button
                                type="button"
                                onClick={() => saveDraft("approved")}
                                disabled={saving || quoteIsMarkedApproved}
                                className={primaryButtonClass}
                              >
                                <FiCheckCircle className="h-4 w-4" />
                                {quoteIsMarkedApproved
                                  ? "Already approved"
                                  : saving
                                    ? "Saving..."
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
                              onClick={moveToOrders}
                              disabled={
                                movingToOrders ||
                                Boolean(sendValidationError) ||
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
                          <button
                            type="button"
                            onClick={handleDeleteQuote}
                            disabled={deletingQuote}
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-[#ffd2dc] bg-[#fff5f7] px-4 py-2.5 text-xs font-semibold text-[#d12f5f] transition hover:bg-[#ffe9ef] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <FiTrash2 className="h-4 w-4" />
                            {deletingQuote ? "Deleting..." : "Delete quotation"}
                          </button>
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
                </>
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
    </div>
  );
}
