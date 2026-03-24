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
    <div className="relative mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2">
      {status !== "ready" && (
        <div className="absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-white/85 text-slate-500 backdrop-blur-sm">
          {status === "loading" ? (
            <>
              <FiRefreshCw className="h-4 w-4 animate-spin" />
              <p className="text-xs font-medium text-slate-600">Loading preview...</p>
            </>
          ) : (
            <p className="text-xs font-medium text-slate-600">Preview unavailable</p>
          )}
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
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
  new: "border-amber-200 bg-amber-50 text-amber-700",
  review: "border-blue-200 bg-blue-50 text-blue-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  sent: "border-cyan-200 bg-cyan-50 text-cyan-700",
};

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  quotation: "Quotation",
  invoice: "Invoice",
  partial_receipt: "Partial receipt",
  receipt: "Receipt",
};

const DOC_TYPE_TONES: Record<DocumentType, string> = {
  quotation: "border-orange-200 bg-orange-50 text-orange-700",
  invoice: "border-sky-200 bg-sky-50 text-sky-700",
  partial_receipt: "border-amber-200 bg-amber-50 text-amber-700",
  receipt: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const QUICK_PRODUCT_LINES = ["T-Shirt", "Polo Shirt", "Hoodie", "Cap"];

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
      (entry) => Boolean(entry?.filename || entry?.url || entry?.label || entry?.quantity)
    );
  }
  if (quote.attachment) return [quote.attachment];
  return [] as QuoteAttachment[];
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
  const amount = Number(value || 0);
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  return `${sign}${currency}\u00A0${abs.toLocaleString()}`;
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
  doc.text("Subtotal", pageWidth - margin - 140, y, { align: "left" });
  doc.text(formatMoney(subtotal, draft.currency), colTotalX, y, { align: "right" });
  if (deliveryFee > 0) {
    y += 16;
    doc.text("Delivery fee", pageWidth - margin - 140, y, { align: "left" });
    doc.text(formatMoney(deliveryFee, draft.currency), colTotalX, y, { align: "right" });
  }
  if (discount > 0) {
    y += 16;
    doc.setTextColor(180, 0, 0);
    doc.text("Discount", pageWidth - margin - 140, y, { align: "left" });
    doc.text(formatMoney(-discount, draft.currency), colTotalX, y, { align: "right" });
    doc.setTextColor(50);
  }
  y += 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20);
  doc.text("Grand Total", pageWidth - margin - 140, y, { align: "left" });
  doc.text(formatMoney(grandTotal, draft.currency), colTotalX, y, { align: "right" });
  doc.setFontSize(10);

  if (draft.documentType === "partial_receipt") {
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50);
    doc.text("Amount received", pageWidth - margin - 140, y, { align: "left" });
    doc.text(formatMoney(amountReceived, draft.currency), colTotalX, y, { align: "right" });
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20);
    doc.text("Balance due", pageWidth - margin - 140, y, { align: "left" });
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
    if (!draft) return { subtotal: 0, total: 0, amountReceived: 0, balanceDue: 0 };
    const subtotal = draft.lines.reduce(
      (acc, line) => acc + safeNumber(line.quantity, 0) * safeNumber(line.unitPrice, 0),
      0
    );
    const total = subtotal + draft.deliveryFee - draft.discount;
    const amountReceived = safeNumber(draft.amountReceived, 0);
    const balanceDue = Math.max(0, total - amountReceived);
    return { subtotal, total, amountReceived, balanceDue };
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
    } catch {
      setNotice("Failed to upload file.");
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

  return (
    <div className="ceo-theme quotation-approval-page min-h-screen bg-[#f7f7fb] text-slate-900">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-28 top-[-10rem] h-64 w-64 rounded-full bg-slate-200/70 blur-3xl" />
        <div className="pointer-events-none absolute right-[-6rem] top-8 h-80 w-80 rounded-full bg-zinc-200/60 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-8rem] left-1/2 h-60 w-60 -translate-x-1/2 rounded-full bg-slate-100/70 blur-3xl" />

        <div className="relative mx-auto w-full max-w-6xl px-6 py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500">MO Admin</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Quotation Approval
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Approve quotes fast, generate PDFs, and send them straight to clients.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live updates
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">
                  Save and edit any time
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={createAdminQuote}
                disabled={creatingQuote}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
              >
                <FiPlus className="h-4 w-4" /> {creatingQuote ? "Creating..." : "New quotation"}
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <FiRefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {[
              {
                title: "Quotation PDF",
                icon: FiFileText,
                tone: "bg-orange-50 text-orange-600 ring-orange-200/70",
                intro: "Use this before any work starts.",
                purpose: "Purpose: to inform the client of prices and terms.",
                status: "Status: not a legal payment document.",
                uses: [
                  "Client asks \"how much will it cost?\"",
                  "You want client approval before production",
                  "No money received yet",
                ],
                key: "Key point: a quotation can expire and can be changed.",
              },
              {
                title: "Invoice PDF",
                icon: FiSend,
                tone: "bg-sky-50 text-sky-600 ring-sky-200/70",
                intro: "Use this when you are asking for money.",
                purpose: "Purpose: to request payment.",
                status: "Status: official billing document.",
                uses: [
                  "Client has accepted the quotation",
                  "You request 50% advance or full payment",
                  "Work is about to start or completed",
                ],
                key: "Key point: an invoice creates a payment obligation.",
              },
              {
                title: "Receipt PDF",
                icon: FiCheckCircle,
                tone: "bg-emerald-50 text-emerald-600 ring-emerald-200/70",
                intro: "Use this after money is received.",
                purpose: "Purpose: to confirm payment received.",
                status: "Status: proof of payment.",
                uses: [
                  "Client pays the advance",
                  "Client pays the balance",
                  "Client asks for proof of payment",
                ],
                key: "Key point: a receipt always comes after payment, never before.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="group rounded-[24px] border border-slate-200 bg-white/90 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ring-1 ${card.tone}`}>
                    <card.icon className="h-5 w-5" />
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    PDF
                  </span>
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-800">{card.title}</p>
                <p className="mt-2 text-sm text-slate-600">{card.intro}</p>
                <p className="mt-2 text-sm text-slate-600">{card.purpose}</p>
                <p className="mt-2 text-sm text-slate-600">{card.status}</p>
                <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-400">Use when</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-600">
                  {card.uses.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="mt-3 text-sm font-medium text-slate-700">{card.key}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-900 px-5 py-4 text-white shadow-sm">
            <p className="text-xs uppercase tracking-[0.35em] text-white/60">MO T-SHIRT flow</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-white/80">
              {[
                "Quotation",
                "Invoice (50% advance)",
                "Partial receipt",
                "Production",
                "Invoice (balance)",
                "Receipt (final payment)",
              ].map((step) => (
                <span
                  key={step}
                  className="rounded-full border border-white/15 bg-white/10 px-3 py-1"
                >
                  {step}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "Total", value: stats.total, icon: FiFileText, tone: "bg-slate-900 text-white ring-slate-200" },
              { label: "New", value: stats.new, icon: FiClock, tone: "bg-orange-50 text-orange-600 ring-orange-200/70" },
              { label: "In review", value: stats.review, icon: FiEdit2, tone: "bg-sky-50 text-sky-600 ring-sky-200/70" },
              { label: "Approved", value: stats.approved, icon: FiCheckCircle, tone: "bg-emerald-50 text-emerald-600 ring-emerald-200/70" },
              { label: "Sent", value: stats.sent, icon: FiSend, tone: "bg-cyan-50 text-cyan-600 ring-cyan-200/70" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-[24px] border border-slate-200 bg-white/90 p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{stat.label}</p>
                  <div className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl ring-1 ${stat.tone}`}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
            <aside className="space-y-4 rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm lg:sticky lg:top-24 h-fit">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <FiSearch className="h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                  placeholder="Search name, email, phone..."
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                {([
                  {
                    key: "all",
                    label: "All",
                    count: stats.total,
                    tone: "border-slate-200 bg-slate-100 text-slate-700 hover:border-slate-300",
                  },
                  {
                    key: "new",
                    label: STATUS_LABELS.new,
                    count: stats.new,
                    tone: "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300",
                  },
                  {
                    key: "review",
                    label: STATUS_LABELS.review,
                    count: stats.review,
                    tone: "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300",
                  },
                  {
                    key: "approved",
                    label: STATUS_LABELS.approved,
                    count: stats.approved,
                    tone: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300",
                  },
                  {
                    key: "sent",
                    label: STATUS_LABELS.sent,
                    count: stats.sent,
                    tone: "border-cyan-200 bg-cyan-50 text-cyan-700 hover:border-cyan-300",
                  },
                ] as const).map((filter) => {
                  const active = statusFilter === filter.key;
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => setStatusFilter(filter.key)}
                      className={`inline-flex items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                        active ? "border-slate-900 bg-slate-900 text-white" : filter.tone
                      }`}
                    >
                      <span>{filter.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          active ? "bg-white/20 text-white" : "bg-white/90 text-slate-700"
                        }`}
                      >
                        {filter.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {loading && <p className="text-xs text-slate-500">Loading quotations...</p>}
              {error && <p className="text-xs text-red-500">{error}</p>}

              <div className="space-y-3">
                {filtered.map((quote) => {
                  const createdAt = quote.createdAt ? formatDistanceToNow(quote.createdAt, { addSuffix: true }) : "—";
                  const status = quote.status || "new";
                  const docType = getQuoteDocumentType(quote);
                  const primaryStatus = getPrimaryStatusMeta(status, docType);
                  const readLabel = status === "new" ? "Unread" : "Read";
                  const selectedTone = selectedId === quote.id;
                  const stageLabel = status === "sent" ? `${DOC_TYPE_LABELS[docType]} sent` : DOC_TYPE_LABELS[docType];
                  const garmentPreview = (quote.garments || [])
                    .filter((entry) => safeNumber(entry.quantity, 0) > 0)
                    .slice(0, 2)
                    .map((entry) => `${formatQuoteGarmentDescription(entry)} x ${safeNumber(entry.quantity, 0)}`)
                    .join(", ");
                  const totalPieces = (quote.garments || []).reduce(
                    (sum, entry) => sum + safeNumber(entry.quantity, 0),
                    0
                  );
                  return (
                    <button
                      key={quote.id}
                      type="button"
                      onClick={() => setSelectedId(quote.id)}
                      className={`w-full rounded-[22px] border px-4 py-3 text-left shadow-sm transition ${
                        selectedTone
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{quote.name || "Unnamed client"}</p>
                          <p className={`truncate text-xs ${selectedTone ? "text-slate-200" : "text-slate-500"}`}>
                            {quote.email}
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                            selectedTone ? "border-white/30 bg-white/10 text-white" : primaryStatus.tone
                          }`}
                        >
                          {primaryStatus.label}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                            selectedTone ? "border-white/30 bg-white/10 text-white" : DOC_TYPE_TONES[docType]
                          }`}
                        >
                          {stageLabel}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                            selectedTone
                              ? "border-white/30 bg-white/10 text-white"
                              : status === "new"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {readLabel}
                        </span>
                      </div>
                      <div className={`mt-2 text-[11px] ${selectedTone ? "text-slate-300" : "text-slate-500"}`}>
                        {totalPieces > 0 ? `${totalPieces} pcs${garmentPreview ? ` • ${garmentPreview}` : ""}` : "No quantity yet"}
                      </div>
                      <div className={`mt-3 flex items-center justify-between text-xs ${selectedTone ? "text-slate-200" : "text-slate-400"}`}>
                        <span>{createdAt}</span>
                        <span>{quote.source || "Website"}</span>
                      </div>
                    </button>
                  );
                })}
                {!filtered.length && !loading && (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500">
                    No quotations match those filters.
                  </div>
                )}
              </div>
            </aside>

            <section className="space-y-6">
              {selected && draft ? (
                <>
                  <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Client</p>
                        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                          {draft.contactName || selected.name || "Walk-in client"}
                        </h2>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1"><FiMail /> {draft.contactEmail || "No email yet"}</span>
                          <span className="inline-flex items-center gap-1"><FiPhone /> {draft.contactPhone || "No phone yet"}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Source: {selected.source || "Website"}</span>
                          {selected.delivery && (
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                              Delivery: {selected.delivery}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${selectedPrimaryStatus?.tone || STATUS_TONES.new}`}>
                          {selectedPrimaryStatus?.label || STATUS_LABELS.new}
                        </span>
                        {selectedStatus !== "sent" && (
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${DOC_TYPE_TONES[draft.documentType]}`}>
                            {DOC_TYPE_LABELS[draft.documentType]}
                          </span>
                        )}
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            selectedStatus === "new"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {selectedStatus === "new" ? "Unread" : "Read"}
                        </span>
                        {selectedAttachments.length > 0 && (
                          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                            <FiFileText /> {selectedAttachments.length} file{selectedAttachments.length > 1 ? "s" : ""}
                          </span>
                        )}
                        {selected.orderTransactionId && (
                          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            <FiCheckCircle /> In orders: {selected.orderTransactionId}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Request</p>
                        <p className="mt-3 text-sm text-slate-700">
                          <span className="font-semibold">Product:</span>{" "}
                          {selectedDesignBrief?.product || selected.garments?.[0]?.garment || "n/a"}
                        </p>
                        <p className="mt-2 text-sm text-slate-700">
                          <span className="font-semibold">Selected garments:</span> {selectedGarmentRows.join(", ") || "n/a"}
                        </p>
                        <p className="mt-2 text-sm text-slate-700">
                          <span className="font-semibold">Total qty:</span> {selectedTotalQty > 0 ? selectedTotalQty : "n/a"}
                        </p>
                        <p className="mt-2 text-sm text-slate-700">
                          <span className="font-semibold">Print:</span> {selectedDesignBrief?.printMethod || selected.printMethod || "n/a"}
                        </p>
                        <p className="mt-2 text-sm text-slate-700">
                          <span className="font-semibold">Color:</span> {selectedRequestedColors.join(", ") || "n/a"}
                        </p>
                        {selectedDesignRows.length > 0 && (
                          <p className="mt-2 text-sm text-slate-700">
                            <span className="font-semibold">Design selected:</span> {selectedDesignRows.join(" | ")}
                          </p>
                        )}
                        {safeNumber(selectedDesignBrief?.estimatedTotal, 0) > 0 && (
                          <p className="mt-2 text-sm text-slate-700">
                            <span className="font-semibold">Estimated total:</span> {formatMoney(safeNumber(selectedDesignBrief?.estimatedTotal, 0), "Rs")}
                          </p>
                        )}
                        <p className="mt-2 text-sm text-slate-700">
                          <span className="font-semibold">Rush:</span>{" "}
                          {selectedDesignBrief ? (selectedDesignBrief.rush ? "Yes" : "No") : "n/a"}
                        </p>
                        <p className="mt-2 text-sm text-slate-700">
                          <span className="font-semibold">Deadline:</span> {selectedDesignBrief?.deadline || selected.deadline || "n/a"}
                        </p>
                        {selectedClientNotes && (
                          <p className="mt-2 text-sm text-slate-700">
                            <span className="font-semibold">Notes:</span> {selectedClientNotes}
                          </p>
                        )}
                        <div className="mt-4 space-y-2">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Artwork Files</p>
                          {selectedAttachments.length ? (
                            <div className="grid gap-3">
                              {selectedAttachments.map((attachment, index) => {
                                const attachmentIsImage = Boolean(attachment.contentType?.startsWith("image/"));
                                return (
                                  <div
                                    key={`${attachment.url || attachment.filename || "attachment"}-${index}`}
                                    className="rounded-2xl border border-slate-200 bg-white p-3"
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="space-y-1 text-xs text-slate-500">
                                        <p className="font-semibold uppercase tracking-[0.18em] text-slate-400">
                                          {attachment.label || `Design ${index + 1}`}
                                        </p>
                                        <p className="text-sm font-medium text-slate-700">
                                          {attachment.filename || "Attachment"}
                                        </p>
                                        {attachment.quantity ? <p>Qty: {attachment.quantity}</p> : null}
                                      </div>
                                      {attachment.url ? (
                                        <a
                                          href={attachment.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                                        >
                                          <FiFileText /> Open file
                                        </a>
                                      ) : null}
                                    </div>
                                    {attachmentIsImage && attachment.url ? (
                                      <QuoteAttachmentPreview
                                        src={attachment.url}
                                        alt={attachment.filename || "Attachment"}
                                      />
                                    ) : !attachment.url ? (
                                      <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                                        Attachment received via email: {attachment.filename || `Attachment ${index + 1}`}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-3 text-xs text-slate-500">
                              No attachment uploaded yet.
                            </div>
                          )}
                          <label
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                              uploadingAttachment
                                ? "border-slate-200 bg-slate-100 text-slate-400"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            <FiUpload /> {uploadingAttachment ? "Uploading..." : "Add file"}
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
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Delivery</p>
                        <div className="mt-3 space-y-2 text-sm text-slate-700">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Method</p>
                            <p className="font-medium">{selected.delivery || "n/a"}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Recipient</p>
                            <p>{selected.deliveryName || "Name not provided"}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Address</p>
                            <p>{selected.deliveryAddress || "Address not provided"}</p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Post Code</p>
                              <p>{selected.deliveryPostCode || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Phone</p>
                              <p>{selected.deliveryPhone || "Phone not provided"}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Timeline</p>
                        <p className="mt-3 text-sm text-slate-700">
                          Created {selected.createdAt ? format(selected.createdAt, "dd MMM yyyy") : "—"}
                        </p>
                        <p className="mt-2 text-sm text-slate-700">
                          Updated {selected.updatedAt ? format(selected.updatedAt, "dd MMM yyyy") : "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm">
                    <div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Quotation / Invoice Draft</p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-900">
                          Price, approve, and send in minutes
                        </h3>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Document setup</p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              These details appear on the PDF header.
                            </p>
                          </div>
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                            {documentTypeLabel}
                          </span>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-medium text-slate-600">
                            Type
                            <select
                              value={draft.documentType}
                              onChange={(e) =>
                                setDraft({ ...draft, documentType: e.target.value as DocumentType })
                              }
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            >
                              <option value="quotation">Quotation</option>
                              <option value="invoice">Invoice</option>
                              <option value="partial_receipt">Partial receipt</option>
                              <option value="receipt">Receipt</option>
                            </select>
                          </label>
                          <label className="text-xs font-medium text-slate-600">
                            Number
                            <input
                              value={draft.documentNumber}
                              onChange={(e) => setDraft({ ...draft, documentNumber: e.target.value })}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                              placeholder="Q-2026-001"
                            />
                          </label>
                          <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                            Date
                            <input
                              type="date"
                              value={draft.documentDate}
                              onChange={(e) => setDraft({ ...draft, documentDate: e.target.value })}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="text-xs font-medium text-slate-600">
                            {draft.documentType === "quotation" ? "Status" : "Payment status"}
                            <select
                              value={draft.paymentStatus}
                              onChange={(e) => setDraft({ ...draft, paymentStatus: e.target.value })}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            >
                              {paymentStatusOptions.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs font-medium text-slate-600">
                            Prepared by
                            <input
                              value={draft.preparedBy}
                              onChange={(e) => setDraft({ ...draft, preparedBy: e.target.value })}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                              placeholder="Your name"
                            />
                          </label>
                          <div className="sm:col-span-2">
                            <p className="text-xs font-medium text-slate-600">Line items visibility</p>
                            <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold">
                              <button
                                type="button"
                                onClick={() => setDraft({ ...draft, showLineItems: true })}
                                className={`rounded-lg px-3 py-2 transition ${
                                  draft.showLineItems
                                    ? "bg-slate-900 text-white"
                                    : "text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                Detailed line items
                              </button>
                              <button
                                type="button"
                                onClick={() => setDraft({ ...draft, showLineItems: false })}
                                className={`rounded-lg px-3 py-2 transition ${
                                  !draft.showLineItems
                                    ? "bg-slate-900 text-white"
                                    : "text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                Summary only
                              </button>
                            </div>
                            <p className="mt-2 text-[11px] text-slate-500">
                              Detailed shows each item and price. Summary hides lines and shows totals only.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          {draft.documentType === "invoice"
                            ? "Invoice for"
                            : draft.documentType === "receipt"
                              ? "Receipt for"
                              : draft.documentType === "partial_receipt"
                                ? "Partial receipt for"
                              : "Quotation for"}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">Shown on the client section of the PDF.</p>
                        <div className="mt-3 grid gap-3">
                          <label className="text-xs font-medium text-slate-600">
                            Client contact name
                            <input
                              value={draft.contactName}
                              onChange={(e) => setDraft({ ...draft, contactName: e.target.value })}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                              placeholder="Client name"
                            />
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-xs font-medium text-slate-600">
                              Client email
                              <input
                                type="email"
                                value={draft.contactEmail}
                                onChange={(e) => setDraft({ ...draft, contactEmail: e.target.value })}
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                placeholder="client@email.com"
                              />
                            </label>
                            <label className="text-xs font-medium text-slate-600">
                              Phone / WhatsApp
                              <input
                                value={draft.contactPhone}
                                onChange={(e) => setDraft({ ...draft, contactPhone: e.target.value })}
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                placeholder="+230 ..."
                              />
                            </label>
                          </div>
                          <label className="text-xs font-medium text-slate-600">
                            Client / Company name
                            <input
                              value={draft.clientCompany}
                              onChange={(e) => setDraft({ ...draft, clientCompany: e.target.value })}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                              placeholder={selected?.name || "Client or company name"}
                            />
                          </label>
                          <label className="text-xs font-medium text-slate-600">
                            Billing address
                            <input
                              value={draft.clientAddress}
                              onChange={(e) => setDraft({ ...draft, clientAddress: e.target.value })}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                              placeholder="Street, city, postal code"
                            />
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-xs font-medium text-slate-600">
                              BRN (Business Reg. No.)
                              <input
                                value={draft.clientBrn}
                                onChange={(e) => setDraft({ ...draft, clientBrn: e.target.value })}
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                placeholder="Optional"
                              />
                            </label>
                            <label className="text-xs font-medium text-slate-600">
                              VAT (if applicable)
                              <input
                                value={draft.clientVat}
                                onChange={(e) => setDraft({ ...draft, clientVat: e.target.value })}
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                placeholder="Optional"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {draft.lines.length > 0 && (
                        <div className="hidden sm:grid sm:grid-cols-[1fr_110px_120px_120px_auto] gap-3 px-3 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                          <span>Description</span>
                          <span className="text-right">Qty</span>
                          <span className="text-right">Unit price</span>
                          <span className="text-right">Line total</span>
                          <span className="text-right">Remove</span>
                        </div>
                      )}
                      {draft.lines.map((line, index) => (
                        <div
                          key={`line-${index}`}
                          className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-[1fr_110px_120px_120px_auto] sm:items-center"
                        >
                          <input
                            value={line.description}
                            onChange={(e) => updateDraftLine(index, { description: e.target.value })}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            placeholder="e.g., T-Shirt (M) with Logo Black"
                            aria-label="Line item description"
                          />
                          <input
                            type="number"
                            min={0}
                            value={line.quantity}
                            onChange={(e) =>
                              updateDraftLine(index, {
                                quantity: e.target.value === "" ? "" : safeNumber(e.target.value, 0),
                              })
                            }
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right"
                            placeholder="Qty"
                            aria-label="Quantity"
                          />
                          <input
                            type="number"
                            min={0}
                            value={line.unitPrice}
                            onChange={(e) =>
                              updateDraftLine(index, {
                                unitPrice: e.target.value === "" ? "" : safeNumber(e.target.value, 0),
                              })
                            }
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right"
                            placeholder="Unit price"
                            aria-label="Unit price"
                          />
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right font-semibold text-slate-800">
                            {formatMoney(
                              safeNumber(line.quantity, 0) * safeNumber(line.unitPrice, 0),
                              draft.currency
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDraftLine(index)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                            aria-label="Remove line item"
                          >
                            <FiXCircle className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Add more product</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => addDraftLine("Product / Size")}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                        >
                          <FiPlus className="h-4 w-4" /> Add custom line
                        </button>
                        {QUICK_PRODUCT_LINES.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => addDraftLine(`${item} (M)`)}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                          >
                            <FiPlus className="h-3.5 w-3.5" /> {item}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-slate-500">
                        Example: <span className="font-semibold">T-Shirt (M) with Logo Samsung</span>.
                      </p>
                    </div>

                    <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-medium text-slate-600">
                            Currency
                            <input
                              value={draft.currency}
                              onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                          {draft.documentType === "quotation" && (
                            <label className="text-xs font-medium text-slate-600">
                              Valid until
                              <input
                                type="date"
                                value={draft.validUntil}
                                onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })}
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                              />
                            </label>
                          )}
                          <label className="text-xs font-medium text-slate-600">
                            Delivery fee
                            <input
                              type="number"
                              min={0}
                              value={draft.deliveryFee}
                              onChange={(e) => setDraft({ ...draft, deliveryFee: safeNumber(e.target.value, 0) })}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="text-xs font-medium text-slate-600">
                            Discount
                            <input
                              type="number"
                              min={0}
                              value={draft.discount}
                              onChange={(e) => setDraft({ ...draft, discount: safeNumber(e.target.value, 0) })}
                              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                        </div>
                        <label className="text-xs font-medium text-slate-600">
                          Notes to client
                          <textarea
                            value={draft.notes}
                            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                            rows={4}
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            placeholder="Add any extra details or inclusions..."
                          />
                        </label>
                        <label className="text-xs font-medium text-slate-600">
                          Terms & payment details
                          <textarea
                            value={draft.terms}
                            onChange={(e) => setDraft({ ...draft, terms: e.target.value })}
                            rows={6}
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                      </div>

                      <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Totals</p>
                        <div className="mt-4 space-y-2 text-sm text-slate-700">
                          <div className="flex items-center justify-between">
                            <span>Subtotal</span>
                            <span className="font-semibold">{formatMoney(totals.subtotal, draft.currency)}</span>
                          </div>
                          {draft.deliveryFee > 0 && (
                            <div className="flex items-center justify-between">
                              <span>Delivery</span>
                              <span className="font-semibold">{formatMoney(draft.deliveryFee, draft.currency)}</span>
                            </div>
                          )}
                          {draft.discount > 0 && (
                            <div className="flex items-center justify-between text-rose-600">
                              <span>Discount</span>
                              <span className="font-semibold">{formatMoney(-draft.discount, draft.currency)}</span>
                            </div>
                          )}
                          <div className="mt-4 flex items-center justify-between text-base font-semibold text-slate-900">
                            <span>Total</span>
                            <span>{formatMoney(totals.total, draft.currency)}</span>
                          </div>
                        </div>
                        {draft.documentType === "partial_receipt" && (
                          <div className="mt-4 space-y-3 text-sm text-slate-700">
                            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                              Amount received
                              <input
                                type="number"
                                min={0}
                                value={draft.amountReceived}
                                onChange={(e) =>
                                  setDraft({ ...draft, amountReceived: safeNumber(e.target.value, 0) })
                                }
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                              />
                            </label>
                            <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                              <span>Balance due</span>
                              <span>{formatMoney(totals.balanceDue, draft.currency)}</span>
                            </div>
                          </div>
                        )}
                        <div className="mt-5 grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={handleDownloadPdf}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                          >
                            <FiDownload /> Download PDF
                          </button>
                          <button
                            type="button"
                            onClick={handleViewPdf}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                          >
                            <FiFileText /> View PDF
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-[24px] border border-slate-200 bg-white/95 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                          Approval Workflow
                        </p>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                          Follow Step 1 → Step 2 → Step 3
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 lg:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                              Step 1
                            </p>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                              Prepare
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-slate-900">Save quotation changes</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Confirm prices, quantities, delivery, and notes.
                          </p>
                          <button
                            type="button"
                            onClick={() => saveDraft()}
                            disabled={saving}
                            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                          >
                            <FiEdit2 /> {saving ? "Saving..." : "Save changes"}
                          </button>
                        </div>

                        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                              Step 2
                            </p>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                quoteIsMarkedApproved
                                  ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                                  : "border-amber-300 bg-amber-50 text-amber-700"
                              }`}
                            >
                              {quoteIsMarkedApproved ? "Done" : "Required"}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-slate-900">Approve quotation</p>
                          <p className="mt-1 text-xs text-slate-600">
                            Mark approved first, then optionally send the document by email.
                          </p>
                          <div className="mt-3 grid gap-2">
                            <button
                              type="button"
                              onClick={() => saveDraft("approved")}
                              disabled={saving || quoteIsMarkedApproved}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                            >
                              <FiCheckCircle />{" "}
                              {quoteIsMarkedApproved ? "Approved" : saving ? "Saving..." : "Mark approved"}
                            </button>
                            <button
                              type="button"
                              onClick={handleSend}
                              disabled={sending || !draft.contactEmail.trim() || Boolean(sendValidationError)}
                              title={
                                !draft.contactEmail.trim()
                                  ? "Add client email before sending."
                                  : sendValidationError || "Ready to send."
                              }
                              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                            >
                              <FiSend />{" "}
                              {sending
                                ? "Sending..."
                                : quoteHasBeenSent
                                  ? "Sent to client"
                                  : `Approve & send ${DOC_TYPE_LABELS[draft.documentType].toLowerCase()}`}
                            </button>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-violet-200/70 bg-violet-50/60 p-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-700">
                              Step 3
                            </p>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                quoteInOrders
                                  ? "border-violet-300 bg-violet-100 text-violet-700"
                                  : "border-slate-200 bg-white text-slate-500"
                              }`}
                            >
                              {quoteInOrders ? "Done" : "Final step"}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-slate-900">Move to Order Management</p>
                          <p className="mt-1 text-xs text-slate-600">
                            This creates or syncs the production order.
                          </p>
                          <button
                            type="button"
                            onClick={moveToOrders}
                            disabled={movingToOrders || Boolean(sendValidationError) || !quoteIsMarkedApproved}
                            title={moveToOrdersTitle}
                            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-violet-200 bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
                          >
                            <FiCheckCircle />{" "}
                            {movingToOrders ? "Moving..." : quoteInOrders ? "Sync with Orders" : "Move to Orders"}
                          </button>
                          {quoteInOrders && (
                            <p className="mt-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-[11px] font-medium text-violet-700">
                              Linked Order ID: {selected.orderTransactionId}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => updateSelectedStatus("review", "Marked as read.")}
                        disabled={statusSaving || (selected.status || "new") !== "new"}
                        className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <FiClock /> {statusSaving ? "Updating..." : "Mark as read"}
                      </button>
                      <Link
                        href="/admin/orders"
                        className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700 shadow-sm transition hover:bg-sky-100"
                      >
                        Open Order Management
                      </Link>
                      <button
                        type="button"
                        onClick={handleDeleteQuote}
                        disabled={deletingQuote}
                        className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:opacity-60"
                      >
                        <FiTrash2 /> {deletingQuote ? "Deleting..." : "Delete quotation"}
                      </button>
                      {sendValidationError && (
                        <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                          <FiClock /> {sendValidationError}
                        </span>
                      )}
                      {notice && (
                        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                          <FiClock /> {notice}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 px-6 py-12 text-center text-sm text-slate-500">
                  Select a quote to begin approval.
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
