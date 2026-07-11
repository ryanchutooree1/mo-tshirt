"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  LockKeyhole,
  MessageCircle,
  PackageCheck,
  Plus,
  Printer,
  RefreshCw,
  Route,
  Save,
  Search,
  Send,
  TimerReset,
  Trash2,
  Users,
  X,
  ZoomIn,
} from "lucide-react";
import { differenceInCalendarDays, format, formatDistanceToNow } from "date-fns";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import {
  PARTNER_CLIENT_STATUS_LABELS,
  PARTNER_CLIENT_STATUS_OPTIONS,
  PARTNER_DECISION_LABELS,
  PARTNER_PRINT_PLACEMENT_LABELS,
  PARTNER_PRODUCTION_STATUS_LABELS,
  PARTNER_VISIBLE_FIELD_OPTIONS,
  type PartnerClientStatus,
  type PartnerPrintPlacement,
  type PartnerVisibleField,
  type PrintPartner,
  type ProductionManager,
} from "@/lib/partners";
import type {
  TanviArtworkAttachment,
  TanviQuoteSummary,
  TanviStepKey,
} from "@/lib/tanvi-quotes";

type DeskPayload = {
  manager: ProductionManager;
  partners: PrintPartner[];
  quotes: TanviQuoteSummary[];
};

type QueueFilter = "all" | "unrouted" | "waiting" | "blocked" | "ready" | "active";
type WorkflowTone = "success" | "warning" | "danger" | "info" | "neutral";
type WhatsappPrintPlacement = "front" | "back" | "front_back";
type WhatsappLogoSlot = "front" | "back";

type WhatsappOrderLine = {
  id: string;
  product: string;
  color: string;
  size: string;
  quantity: string;
  printPlacement: WhatsappPrintPlacement;
  frontLogoDescription: string;
  backLogoDescription: string;
};

type WhatsappOrderDraft = {
  clientName: string;
  phone: string;
  email: string;
  deadline: string;
  total: string;
  notes: string;
  lineItems: WhatsappOrderLine[];
};

type WhatsappDraftTextField = Exclude<keyof WhatsappOrderDraft, "lineItems">;
type TanviDocumentType = "quotation" | "invoice" | "partial_receipt" | "receipt";

type DocumentStudioLine = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  includeInTotals: boolean;
};

type DocumentStudioDraft = {
  documentType: TanviDocumentType;
  documentNumber: string;
  documentDate: string;
  validUntil: string;
  clientCompany: string;
  clientAddress: string;
  clientBrn: string;
  clientVat: string;
  paymentStatus: string;
  preparedBy: string;
  currency: string;
  deliveryFee: string;
  discount: string;
  amountReceived: string;
  notes: string;
  terms: string;
  showLineItems: boolean;
  showTotals: boolean;
  lines: DocumentStudioLine[];
};

type DocumentStudioField = Exclude<keyof DocumentStudioDraft, "lines" | "showLineItems" | "showTotals">;

const TANVI_STEPS: { key: TanviStepKey; label: string }[] = [
  { key: "client_onboarding", label: "Client onboarding" },
  { key: "artwork", label: "Artwork / logo" },
  { key: "route_prices", label: "Route, placement, partner prices" },
  { key: "client_approval", label: "Client approval" },
  { key: "partner_answer", label: "Partner answer" },
  { key: "print_start", label: "Print start" },
];

const YAN_PRINT_PRICE_OPTIONS: {
  value: PartnerPrintPlacement;
  label: string;
  price: number;
}[] = [
  { value: "small_front_only", label: "DTF Small Front Printing only", price: 150 },
  { value: "small_back_only", label: "DTF Small Back Printing only", price: 150 },
  { value: "large_front_only", label: "DTF Large Front Printing only", price: 200 },
  { value: "back_only", label: "DTF Large Back Printing only", price: 200 },
  { value: "small_front_back", label: "DTF Small Front and Small Back Printing", price: 200 },
  { value: "small_front_large_back", label: "DTF Small Front and Large Back Printing", price: 250 },
  { value: "large_front_small_back", label: "DTF Large Front and Small Back Printing", price: 250 },
  { value: "front_back", label: "DTF Large Front and Large Back Printing", price: 300 },
];

const SHABBANAZ_PRINT_PRICE_OPTIONS: typeof YAN_PRINT_PRICE_OPTIONS = [
  { value: "small_front_only", label: "DTF Small Front Printing only", price: 50 },
  { value: "small_back_only", label: "DTF Small Back Printing only", price: 50 },
  { value: "large_front_only", label: "DTF Large Front Printing only", price: 80 },
  { value: "back_only", label: "DTF Large Back Printing only", price: 80 },
  { value: "small_front_back", label: "DTF Small Front and Small Back Printing", price: 100 },
  { value: "small_front_large_back", label: "DTF Small Front and Large Back Printing", price: 100 },
  { value: "large_front_small_back", label: "DTF Large Front and Small Back Printing", price: 100 },
  { value: "front_back", label: "DTF Large Front and Large Back Printing", price: 150 },
  { value: "small_front_only", label: "SP Small Front Printing only", price: 50 },
  { value: "small_back_only", label: "SP Small Back Printing only", price: 50 },
  { value: "large_front_only", label: "SP Large Front Printing only", price: 80 },
  { value: "back_only", label: "SP Large Back Printing only", price: 80 },
  { value: "small_front_back", label: "SP Small Front and Small Back Printing", price: 100 },
  { value: "small_front_large_back", label: "SP Small Front and Large Back Printing", price: 100 },
  { value: "large_front_small_back", label: "SP Large Front and Small Back Printing", price: 100 },
  { value: "front_back", label: "SP Large Front and Large Back Printing", price: 150 },
];

const WHATSAPP_LOGO_ACCEPT =
  "image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/heic,image/heif,application/pdf";
const DOCUMENT_TYPE_LABELS: Record<TanviDocumentType, string> = {
  quotation: "Quotation",
  invoice: "Invoice",
  partial_receipt: "Partial receipt",
  receipt: "Receipt",
};
const DOCUMENT_TYPE_PREFIXES: Record<TanviDocumentType, string> = {
  quotation: "Q",
  invoice: "INV",
  partial_receipt: "PR",
  receipt: "R",
};
const DOCUMENT_TYPE_OPTIONS: TanviDocumentType[] = [
  "quotation",
  "invoice",
  "partial_receipt",
  "receipt",
];

const defaultManager: ProductionManager = {
  name: "Tanvi",
  email: "",
};

function createDocumentLine(index = 1): DocumentStudioLine {
  return {
    id: `doc-line-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    description: "",
    quantity: "1",
    unitPrice: "",
    includeInTotals: true,
  };
}

function createWhatsappOrderLine(index = 1): WhatsappOrderLine {
  return {
    id: `line-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    product: "",
    color: "",
    size: "",
    quantity: "",
    printPlacement: "front",
    frontLogoDescription: "",
    backLogoDescription: "",
  };
}

function getWhatsappLogoSlots(printPlacement: WhatsappPrintPlacement): WhatsappLogoSlot[] {
  return printPlacement === "front_back" ? ["front", "back"] : [printPlacement];
}

function getWhatsappLogoKey(lineId: string, slot: WhatsappLogoSlot) {
  return `${lineId}:${slot}`;
}

function getWhatsappLogoSlotLabel(slot: WhatsappLogoSlot) {
  return slot === "front" ? "Front logo" : "Back logo";
}

function getWhatsappLogoDescriptionField(
  slot: WhatsappLogoSlot
): "frontLogoDescription" | "backLogoDescription" {
  return slot === "front" ? "frontLogoDescription" : "backLogoDescription";
}

const emptyWhatsappDraft: WhatsappOrderDraft = {
  clientName: "",
  phone: "",
  email: "",
  deadline: "",
  total: "",
  notes: "",
  lineItems: [{ ...createWhatsappOrderLine(1), id: "line-1" }],
};

function getDefaultTerms(documentType: TanviDocumentType) {
  if (documentType === "invoice") {
    return "Orders are processed after receipt of the required advance payment.";
  }
  if (documentType === "receipt") {
    return "This receipt confirms payment received by MO T-SHIRT.";
  }
  if (documentType === "partial_receipt") {
    return "This receipt confirms partial payment received by MO T-SHIRT.";
  }
  return "This quotation is valid for a limited period and production starts after approval.";
}

function normalizeDocumentType(value: string): TanviDocumentType {
  return DOCUMENT_TYPE_OPTIONS.includes(value as TanviDocumentType)
    ? (value as TanviDocumentType)
    : "quotation";
}

function getDefaultPaymentStatus(documentType: TanviDocumentType) {
  if (documentType === "invoice") return "Unpaid";
  if (documentType === "receipt") return "Paid";
  if (documentType === "partial_receipt") return "Partially paid";
  return "Quotation only";
}

function normalizeDocumentNumberForType(value: string, documentType: TanviDocumentType) {
  const cleanValue = value.trim();
  const baseNumber = cleanValue.replace(/^(Q|INV|PR|R)-/i, "") || cleanValue;
  return `${DOCUMENT_TYPE_PREFIXES[documentType]}-${baseNumber}`;
}

function buildDocumentDraftFromQuote(quote: TanviQuoteSummary): DocumentStudioDraft {
  const documentType = normalizeDocumentType(quote.document.documentType);
  const lines = quote.document.lines.length
    ? quote.document.lines.map((line, index) => ({
        id: `doc-line-${index + 1}`,
        description: line.description,
        quantity: line.quantity ? String(line.quantity) : "",
        unitPrice: line.unitPrice ? String(line.unitPrice) : "",
        includeInTotals: line.includeInTotals,
      }))
    : [
        {
          ...createDocumentLine(1),
          id: "doc-line-1",
          description: quote.product === "Not set" ? "" : quote.product,
          quantity: quote.pieces ? String(quote.pieces) : "1",
        },
      ];

  return {
    documentType,
    documentNumber: quote.document.documentNumber || quote.code,
    documentDate: quote.document.documentDate || format(new Date(), "yyyy-MM-dd"),
    validUntil: quote.document.validUntil,
    clientCompany: quote.document.clientCompany || quote.clientCompany || quote.clientName,
    clientAddress: quote.document.clientAddress,
    clientBrn: quote.document.clientBrn,
    clientVat: quote.document.clientVat,
    paymentStatus: quote.document.paymentStatus || getDefaultPaymentStatus(documentType),
    preparedBy: quote.document.preparedBy || "Tanvi",
    currency: quote.document.currency || quote.currency || "Rs",
    deliveryFee: quote.document.deliveryFee ? String(quote.document.deliveryFee) : "",
    discount: quote.document.discount ? String(quote.document.discount) : "",
    amountReceived: quote.document.amountReceived ? String(quote.document.amountReceived) : "",
    notes: quote.document.notes || quote.notes,
    terms: quote.document.terms || getDefaultTerms(documentType),
    showLineItems: quote.document.showLineItems,
    showTotals: quote.document.showTotals,
    lines,
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return format(date, "dd MMM yyyy, HH:mm");
}

function formatRelative(value: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return `${formatDistanceToNow(date, { addSuffix: true })}`;
}

function formatMoney(value: number | null, currency: string) {
  if (!value) return "Not set";
  return `${currency || "Rs"} ${value.toLocaleString("en-MU")}`;
}

function formatFileSize(value: number | null) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function parseDeadlineDate(value: string) {
  const cleanValue = value.trim();
  if (!cleanValue || cleanValue.toLowerCase() === "no deadline") return null;

  const directDate = new Date(cleanValue);
  if (!Number.isNaN(directDate.getTime())) return directDate;

  const numericDate = cleanValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!numericDate) return null;

  const day = Number(numericDate[1]);
  const month = Number(numericDate[2]) - 1;
  const year = Number(numericDate[3].length === 2 ? `20${numericDate[3]}` : numericDate[3]);
  const parsed = new Date(year, month, day);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDeadlineInsight(value: string) {
  const deadlineDate = parseDeadlineDate(value);
  if (!deadlineDate) {
    return {
      label: value && value !== "No deadline" ? value : "No deadline shared",
      helper: "No countdown available until Ryan or the client gives a date.",
      tone: "neutral" as WorkflowTone,
      daysLeft: null as number | null,
      progress: 0,
    };
  }

  const daysLeft = differenceInCalendarDays(deadlineDate, new Date());
  if (daysLeft < 0) {
    return {
      label: `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} late`,
      helper: format(deadlineDate, "dd MMM yyyy"),
      tone: "danger" as WorkflowTone,
      daysLeft,
      progress: 100,
    };
  }

  if (daysLeft === 0) {
    return {
      label: "Due today",
      helper: format(deadlineDate, "dd MMM yyyy"),
      tone: "warning" as WorkflowTone,
      daysLeft,
      progress: 92,
    };
  }

  return {
    label: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
    helper: format(deadlineDate, "dd MMM yyyy"),
    tone: daysLeft <= 2 ? "warning" as WorkflowTone : "success" as WorkflowTone,
    daysLeft,
    progress: Math.max(10, Math.min(88, 100 - daysLeft * 8)),
  };
}

function getProductionStageInsight(status: TanviQuoteSummary["partner"]["productionStatus"]) {
  if (status === "waiting_for_tshirts_from_ryan") {
    return {
      supply: "Waiting for Ryan to supply the t-shirts",
      printing: "Printing cannot start yet",
      helper: "Keep this open until Ryan confirms the garments are with the partner.",
      tone: "warning" as WorkflowTone,
      progress: 25,
    };
  }

  if (status === "in_progress") {
    return {
      supply: "Ryan has already supplied the t-shirts",
      printing: "Printing in progress",
      helper: "Track deadline pressure and partner updates daily.",
      tone: "info" as WorkflowTone,
      progress: 62,
    };
  }

  if (status === "completed" || status === "ryan_to_collect" || status === "will_post_tomorrow") {
    return {
      supply: "Ryan has already supplied the t-shirts",
      printing: PARTNER_PRODUCTION_STATUS_LABELS[status],
      helper: "Move attention to collection, delivery, and client handoff.",
      tone: "success" as WorkflowTone,
      progress: status === "completed" ? 100 : 84,
    };
  }

  return {
    supply: "T-shirt supply not confirmed yet",
    printing: "Printing not started",
    helper: "Start only after Tanvi confirms approval, payment readiness, and partner ownership.",
    tone: "neutral" as WorkflowTone,
    progress: 8,
  };
}

function quoteNeedsRouting(quote: TanviQuoteSummary) {
  return !quote.partner.visibleTo.length;
}

function quoteHasBlocker(quote: TanviQuoteSummary) {
  return (
    quote.partner.requestStatus === "needs_info" ||
    Boolean(quote.partner.missingInformation)
  );
}

function quoteIsReady(quote: TanviQuoteSummary) {
  return (
    quote.partner.clientStatus === "confirmed_half_payment" &&
    quote.partner.requestStatus === "accepted"
  );
}

function quoteIsActive(quote: TanviQuoteSummary) {
  return (
    quote.partner.productionStatus === "in_progress" ||
    quote.partner.productionStatus === "waiting_for_tshirts_from_ryan"
  );
}

function filterQuote(quote: TanviQuoteSummary, filter: QueueFilter) {
  if (filter === "unrouted") return quoteNeedsRouting(quote);
  if (filter === "waiting") return quote.partner.requestStatus === "pending";
  if (filter === "blocked") return quoteHasBlocker(quote);
  if (filter === "ready") return quoteIsReady(quote);
  if (filter === "active") return quoteIsActive(quote);
  return true;
}

function searchQuote(quote: TanviQuoteSummary, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [
    quote.code,
    quote.clientName,
    quote.clientCompany,
    quote.phone,
    quote.email,
    quote.product,
    quote.printMethod,
    quote.partner.visibleLabel,
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function statusTone(value: string) {
  if (value === "accepted" || value === "confirmed_half_payment" || value === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (value === "needs_info" || value === "changes_needed") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (value === "rejected") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function quoteQueueCardTone(quote: TanviQuoteSummary, active: boolean, isDark: boolean) {
  if (quote.partner.requestStatus === "accepted") {
    return isDark
      ? "border-emerald-400 bg-emerald-900/70 text-emerald-50 shadow-sm"
      : "border-emerald-500 bg-emerald-600 text-white shadow-sm";
  }
  if (quote.partner.requestStatus === "rejected") {
    return isDark
      ? "border-rose-400 bg-rose-900/70 text-rose-50 shadow-sm"
      : "border-rose-500 bg-rose-600 text-white shadow-sm";
  }
  if (active) {
    return "border-cyan-500 bg-cyan-50 text-slate-950 shadow-sm";
  }
  return isDark
    ? "border-white/10 bg-slate-950/50 text-slate-100 hover:bg-slate-900"
    : "border-slate-200 bg-white text-slate-950 hover:border-slate-300";
}

function quoteQueueMetaTone(quote: TanviQuoteSummary, active: boolean, isDark: boolean) {
  if (quote.partner.requestStatus === "accepted" || quote.partner.requestStatus === "rejected") {
    return "text-white/85";
  }
  if (active) return "text-slate-600";
  return isDark ? "text-slate-400" : "text-slate-500";
}

function quoteQueueCodeTone(quote: TanviQuoteSummary, isDark: boolean) {
  if (quote.partner.requestStatus === "accepted" || quote.partner.requestStatus === "rejected") {
    return "text-white";
  }
  return isDark ? "text-cyan-300" : "text-cyan-700";
}

function quoteQueueStatusTone(quote: TanviQuoteSummary) {
  if (quote.partner.requestStatus === "accepted") {
    return "border-white/25 bg-white/95 text-emerald-800";
  }
  if (quote.partner.requestStatus === "rejected") {
    return "border-white/25 bg-white/95 text-rose-800";
  }
  return statusTone(quote.partner.requestStatus);
}

function getArtworkDownloadHref(attachment: TanviArtworkAttachment, index: number) {
  if (!attachment.url) return "";

  const params = new URLSearchParams({
    url: attachment.url,
    name: attachment.filename || attachment.label || `artwork-${index + 1}`,
  });

  return `/api/shops/download?${params.toString()}`;
}

function isArtworkImage(attachment: TanviArtworkAttachment) {
  const contentType = attachment.contentType.toLowerCase();
  const filename = attachment.filename.toLowerCase();
  return Boolean(
    attachment.url &&
      (contentType.startsWith("image/") ||
        [".png", ".jpg", ".jpeg", ".webp", ".gif"].some((suffix) =>
          filename.endsWith(suffix)
        ))
  );
}

function isArtworkPdf(attachment: TanviArtworkAttachment) {
  const contentType = attachment.contentType.toLowerCase();
  const filename = attachment.filename.toLowerCase();
  return Boolean(
    attachment.url &&
      (contentType === "application/pdf" ||
        contentType.includes("pdf") ||
        filename.endsWith(".pdf"))
  );
}

function ArtworkImagePreview({
  src,
  alt,
  className,
  isDark,
}: {
  src: string;
  alt: string;
  className: string;
  isDark: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative">
      {!loaded && !failed ? (
        <div
          className={`absolute inset-0 z-10 grid place-items-center rounded-2xl border ${
            isDark
              ? "border-white/10 bg-slate-950 text-slate-200"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span className="text-sm font-semibold">Loading logo...</span>
            <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Large files can take a few seconds.
            </span>
          </div>
        </div>
      ) : null}
      {failed ? (
        <div
          className={`grid place-items-center text-center ${className} ${
            isDark ? "text-slate-300" : "text-slate-600"
          }`}
        >
          <div className="px-4">
            <AlertTriangle className="mx-auto h-7 w-7 text-amber-500" />
            <p className="mt-3 text-sm font-semibold">Preview could not load</p>
            <p className="mt-1 text-xs">Use Open to view or download this artwork.</p>
          </div>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className={`${className} transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function WhatsappLogoFilePreview({
  file,
  isDark,
}: {
  file: File;
  isDark: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";

  useEffect(() => {
    if (!isImage) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  if (isImage && previewUrl) {
    return (
      <div className={`overflow-hidden rounded-2xl border ${isDark ? "border-white/10 bg-slate-950" : "border-slate-200 bg-white"}`}>
        <img
          src={previewUrl}
          alt={file.name}
          className="h-52 w-full object-contain p-3 sm:h-64"
        />
      </div>
    );
  }

  return (
    <div className={`grid min-h-40 place-items-center rounded-2xl border p-5 text-center ${isDark ? "border-white/10 bg-slate-950 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`}>
      <div>
        <FileText className="mx-auto h-8 w-8 text-emerald-600" />
        <p className="mt-3 text-sm font-semibold">
          {isPdf ? "PDF logo selected" : "Logo file selected"}
        </p>
        <p className={`mt-1 break-all text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          {file.name}
        </p>
      </div>
    </div>
  );
}

export default function TanviDeskPage() {
  const { theme, setTheme, ready: themeReady } = useAdminTheme();
  const isDark = theme === "dark";
  const [manager, setManager] = useState<ProductionManager>(defaultManager);
  const [partners, setPartners] = useState<PrintPartner[]>([]);
  const [quotes, setQuotes] = useState<TanviQuoteSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [search, setSearch] = useState("");
  const [visibleFields, setVisibleFields] = useState<PartnerVisibleField[]>([]);
  const [printPlacement, setPrintPlacement] = useState<PartnerPrintPlacement>("not_set");
  const [partnerPriceDrafts, setPartnerPriceDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showQueue, setShowQueue] = useState(true);
  const [showWhatsappIntake, setShowWhatsappIntake] = useState(false);
  const [whatsappDraft, setWhatsappDraft] = useState<WhatsappOrderDraft>(emptyWhatsappDraft);
  const [whatsappLogoFiles, setWhatsappLogoFiles] = useState<Record<string, File | null>>({});
  const [creatingWhatsappOrder, setCreatingWhatsappOrder] = useState(false);
  const [zoomArtwork, setZoomArtwork] = useState<TanviArtworkAttachment | null>(null);
  const [partnerReplyDrafts, setPartnerReplyDrafts] = useState<Record<string, string>>({});
  const [sendingPartnerReply, setSendingPartnerReply] = useState<string | null>(null);
  const [artworkDescriptionDrafts, setArtworkDescriptionDrafts] = useState<Record<string, string>>({});
  const [documentStudioOpen, setDocumentStudioOpen] = useState(true);
  const [documentDraft, setDocumentDraft] = useState<DocumentStudioDraft | null>(null);

  useEffect(() => {
    if (!themeReady || theme === "light") return;
    setTheme("light");
  }, [setTheme, theme, themeReady]);

  const activePartners = useMemo(
    () => partners.filter((partner) => partner.active),
    [partners]
  );
  const selected = useMemo(
    () => quotes.find((quote) => quote.id === selectedId) || quotes[0] || null,
    [quotes, selectedId]
  );

  const filteredQuotes = useMemo(
    () => quotes.filter((quote) => filterQuote(quote, filter) && searchQuote(quote, search)),
    [filter, quotes, search]
  );

  const metrics = useMemo(
    () => ({
      total: quotes.length,
      unrouted: quotes.filter(quoteNeedsRouting).length,
      blockers: quotes.filter(quoteHasBlocker).length,
      ready: quotes.filter(quoteIsReady).length,
      active: quotes.filter(quoteIsActive).length,
    }),
    [quotes]
  );

  const partnerLoads = useMemo(
    () =>
      activePartners.map((partner) => ({
        partner,
        count: quotes.filter((quote) => quote.partner.visibleTo.includes(partner.id)).length,
        accepted: quotes.filter(
          (quote) =>
            quote.partner.lockedBy === partner.id &&
            quote.partner.requestStatus === "accepted"
        ).length,
      })),
    [activePartners, quotes]
  );

  async function loadDesk() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tanvi/quotes", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as Partial<DeskPayload> & {
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.quotes)) {
        throw new Error(data.error || "Failed to load Tanvi desk.");
      }
      setManager(data.manager || defaultManager);
      setPartners(Array.isArray(data.partners) ? data.partners : []);
      setQuotes(data.quotes);
      setSelectedId((current) =>
        current && data.quotes?.some((quote) => quote.id === current)
          ? current
          : data.quotes?.[0]?.id || null
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load Tanvi desk.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDesk();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setVisibleFields(selected.partner.visibleFields);
    setPrintPlacement(selected.partner.printPlacement);
    setDocumentDraft(buildDocumentDraftFromQuote(selected));
    setPartnerPriceDrafts(
      activePartners.reduce<Record<string, string>>((drafts, partner) => {
        const response = selected.partner.responses.find(
          (entry) => entry.partnerId === partner.id
        );
        drafts[partner.id] = response?.price ? String(response.price) : "";
        return drafts;
      }, {})
    );
  }, [activePartners, selected]);

  function replaceQuote(quote: TanviQuoteSummary) {
    setQuotes((current) =>
      current.map((entry) => (entry.id === quote.id ? quote : entry))
    );
    setSelectedId(quote.id);
  }

  async function updateQuote(
    quote: TanviQuoteSummary,
    payload: {
      partnerIds?: string[];
      visibleFields?: PartnerVisibleField[];
      printPlacement?: PartnerPrintPlacement;
      clientStatus?: PartnerClientStatus;
      partnerPrices?: Record<string, { price: number | null }>;
      tanviStepChecks?: Partial<Record<TanviStepKey, boolean>>;
      whatsappDetails?: WhatsappOrderDraft;
      artworkDescriptions?: { index: number; description: string }[];
    },
    label: string
  ) {
    setSaving(label);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tanvi/quotes/${encodeURIComponent(quote.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.quote) {
        throw new Error(data?.error || "Could not update quote.");
      }
      replaceQuote(data.quote as TanviQuoteSummary);
      setNotice(`${quote.code} updated.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update quote.");
    } finally {
      setSaving(null);
    }
  }

  async function sendPartnerReply(quote: TanviQuoteSummary) {
    const partnerId = quote.partner.id;
    const draft = partnerReplyDrafts[quote.id]?.trim() || "";
    if (!partnerId) {
      setError("Select a partner before sending a reply.");
      return;
    }
    if (!draft) {
      setError("Write a reply before sending.");
      return;
    }

    setSendingPartnerReply(quote.id);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tanvi/quotes/${encodeURIComponent(quote.id)}/partner-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId,
          message: draft,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Could not send reply to partner.");
      }
      setPartnerReplyDrafts((current) => ({
        ...current,
        [quote.id]: "",
      }));
      setNotice(`Reply sent to ${data?.sent?.partnerName || quote.partner.name || "partner"}.`);
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : "Could not send reply to partner.");
    } finally {
      setSendingPartnerReply(null);
    }
  }

  function getArtworkDescriptionDraft(quote: TanviQuoteSummary, index: number, attachment: TanviArtworkAttachment) {
    const key = `${quote.id}:${index}`;
    return artworkDescriptionDrafts[key] ?? attachment.description ?? "";
  }

  function updateArtworkDescriptionDraft(quoteId: string, index: number, description: string) {
    const key = `${quoteId}:${index}`;
    setArtworkDescriptionDrafts((current) => ({
      ...current,
      [key]: description,
    }));
  }

  function saveArtworkDescription(quote: TanviQuoteSummary, index: number, attachment: TanviArtworkAttachment) {
    const description = getArtworkDescriptionDraft(quote, index, attachment);
    void updateQuote(
      quote,
      {
        artworkDescriptions: [{ index, description }],
      },
      `artwork-description-${index}`
    );
  }

  function toggleVisibleField(field: PartnerVisibleField) {
    setVisibleFields((current) => {
      if (current.includes(field)) {
        const next = current.filter((entry) => entry !== field);
        return next.length ? next : current;
      }
      return [...current, field];
    });
  }

  function getPartnerPriceOptions(partnerId: string) {
    if (partnerId === "yan") return YAN_PRINT_PRICE_OPTIONS;
    if (partnerId === "shabanaz") return SHABBANAZ_PRINT_PRICE_OPTIONS;
    return YAN_PRINT_PRICE_OPTIONS;
  }

  function applyPartnerPricePreset(partnerId: string, presetIndex: number) {
    const preset = getPartnerPriceOptions(partnerId)[presetIndex];
    if (!preset) return;

    setPrintPlacement(preset.value);
    setPartnerPriceDrafts((current) => ({
      ...current,
      [partnerId]: String(preset.price),
    }));
  }

  function toggleTanviStep(stepKey: TanviStepKey, checked: boolean) {
    if (!selected) return;
    void updateQuote(
      selected,
      { tanviStepChecks: { [stepKey]: checked } },
      `step-${stepKey}`
    );
  }

  function updateWhatsappDraft(field: WhatsappDraftTextField, value: string) {
    setWhatsappDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateDocumentDraft(field: DocumentStudioField, value: string) {
    setDocumentDraft((current) => {
      if (!current) return current;
      if (field === "documentType") {
        const documentType = normalizeDocumentType(value);
        return {
          ...current,
          documentType,
          documentNumber: normalizeDocumentNumberForType(current.documentNumber, documentType),
          paymentStatus: getDefaultPaymentStatus(documentType),
          terms: current.terms || getDefaultTerms(documentType),
        };
      }
      return {
        ...current,
        [field]: value,
      };
    });
  }

  function updateDocumentLine(lineId: string, field: keyof DocumentStudioLine, value: string | boolean) {
    setDocumentDraft((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line) =>
              line.id === lineId ? { ...line, [field]: value } : line
            ),
          }
        : current
    );
  }

  function addDocumentLine() {
    setDocumentDraft((current) =>
      current
        ? {
            ...current,
            lines: [...current.lines, createDocumentLine(current.lines.length + 1)],
          }
        : current
    );
  }

  function removeDocumentLine(lineId: string) {
    setDocumentDraft((current) =>
      current
        ? {
            ...current,
            lines:
              current.lines.length > 1
                ? current.lines.filter((line) => line.id !== lineId)
                : current.lines,
          }
        : current
    );
  }

  function updateWhatsappLine(
    lineId: string,
    field: keyof WhatsappOrderLine,
    value: string
  ) {
    setWhatsappDraft((current) => ({
      ...current,
      lineItems: current.lineItems.map((line) =>
        line.id === lineId ? { ...line, [field]: value } : line
      ),
    }));
  }

  function addWhatsappLine() {
    setWhatsappDraft((current) => ({
      ...current,
      lineItems: [...current.lineItems, createWhatsappOrderLine(current.lineItems.length + 1)],
    }));
  }

  function removeWhatsappLine(lineId: string) {
    setWhatsappDraft((current) => {
      const nextLines = current.lineItems.filter((line) => line.id !== lineId);
      return {
        ...current,
        lineItems: nextLines.length ? nextLines : current.lineItems,
      };
    });
    setWhatsappLogoFiles((current) => {
      const next = { ...current };
      getWhatsappLogoSlots("front_back").forEach((slot) => {
        delete next[getWhatsappLogoKey(lineId, slot)];
      });
      return next;
    });
  }

  function updateWhatsappLogoFile(lineId: string, slot: WhatsappLogoSlot, file: File | null) {
    setWhatsappLogoFiles((current) => ({
      ...current,
      [getWhatsappLogoKey(lineId, slot)]: file,
    }));
  }

  function resetWhatsappIntake() {
    setWhatsappDraft(emptyWhatsappDraft);
    setWhatsappLogoFiles({});
  }

  function buildWhatsappRequestBody() {
    const logoEntries = whatsappDraft.lineItems
      .flatMap((line, index) =>
        getWhatsappLogoSlots(line.printPlacement).map((slot) => ({
          line,
          index,
          slot,
          file: whatsappLogoFiles[getWhatsappLogoKey(line.id, slot)],
        }))
      )
      .filter((entry) => entry.file);

    if (!logoEntries.length) {
      return {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappDetails: whatsappDraft }),
      };
    }

    const formData = new FormData();
    formData.append("whatsappDetails", JSON.stringify(whatsappDraft));
    formData.append(
      "attachments",
      JSON.stringify(
        logoEntries.map((entry) => ({
          label: `${getWhatsappLogoSlotLabel(entry.slot)} ${entry.index + 1}`,
          description: entry.line[getWhatsappLogoDescriptionField(entry.slot)].trim(),
          quantity: entry.line.quantity,
          lineId: entry.line.id,
          product: entry.line.product,
          color: entry.line.color,
          size: entry.line.size,
          printPlacement: entry.slot,
        }))
      )
    );
    logoEntries.forEach((entry) => {
      if (entry.file) formData.append("files", entry.file);
    });

    return { body: formData };
  }

  function loadSelectedIntoWhatsappDraft() {
    if (!selected) return;
    setWhatsappDraft({
      clientName: selected.clientName === "Client not set" ? "" : selected.clientName,
      phone: selected.phone,
      email: selected.email,
      deadline: selected.deadline === "No deadline" ? "" : selected.deadline,
      total: selected.total ? String(selected.total) : "",
      notes: selected.notes,
      lineItems: [
        {
          ...createWhatsappOrderLine(1),
          id: "line-1",
          product: selected.product === "Not set" ? "" : selected.product,
          color: selected.colors.join(", "),
          size: "",
          quantity: selected.pieces ? String(selected.pieces) : "",
          printPlacement: "front",
          frontLogoDescription: selected.artwork[0]?.description || "",
          backLogoDescription: "",
        },
      ],
    });
    setWhatsappLogoFiles({});
    setShowWhatsappIntake(true);
  }

  async function createWhatsappOrder() {
    setCreatingWhatsappOrder(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/tanvi/quotes", {
        method: "POST",
        ...buildWhatsappRequestBody(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.quote) {
        throw new Error(data?.error || "Could not create WhatsApp order.");
      }
      const quote = data.quote as TanviQuoteSummary;
      setQuotes((current) => [quote, ...current]);
      setSelectedId(quote.id);
      resetWhatsappIntake();
      setShowWhatsappIntake(false);
      setNotice(`${quote.code} WhatsApp order created.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create WhatsApp order.");
    } finally {
      setCreatingWhatsappOrder(false);
    }
  }

  function saveWhatsappDetailsToSelected() {
    if (!selected) return;
    const quote = selected;
    setSaving("whatsapp-details");
    setNotice(null);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/tanvi/quotes/${encodeURIComponent(quote.id)}`, {
          method: "PATCH",
          ...buildWhatsappRequestBody(),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.quote) {
          throw new Error(data?.error || "Could not update quote.");
        }
        replaceQuote(data.quote as TanviQuoteSummary);
        setWhatsappLogoFiles({ front: null, back: null });
        setNotice(`${quote.code} updated.`);
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : "Could not update quote.");
      } finally {
        setSaving(null);
      }
    })();
  }

  async function saveDocumentStudio() {
    if (!selected || !documentDraft) return;
    setSaving("document-studio");
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tanvi/quotes/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentDetails: documentDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.quote) {
        throw new Error(data?.error || "Could not save document.");
      }
      replaceQuote(data.quote as TanviQuoteSummary);
      setNotice(`${DOCUMENT_TYPE_LABELS[documentDraft.documentType]} saved for ${selected.clientName}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save document.");
    } finally {
      setSaving(null);
    }
  }

  const pageClass = isDark
    ? "min-h-screen bg-slate-950 text-slate-100"
    : "min-h-screen bg-[#f5f7fb] text-slate-950";
  const panelClass = isDark
    ? "rounded-[24px] border border-white/10 bg-slate-900/80 shadow-[0_20px_60px_rgba(0,0,0,0.28)]"
    : "rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_46px_rgba(15,23,42,0.08)]";
  const mutedClass = isDark ? "text-slate-400" : "text-slate-500";
  const dividerClass = isDark ? "border-white/10" : "border-slate-200/70";
  const strongTextClass = isDark ? "text-slate-100" : "text-slate-950";
  const subtleCardClass = isDark
    ? "rounded-2xl border border-white/10 bg-slate-950/60"
    : "rounded-2xl border border-slate-200 bg-slate-50";
  const elevatedCardClass = isDark
    ? "rounded-2xl border border-white/10 bg-slate-950/50"
    : "rounded-2xl border border-slate-200 bg-white";
  const neutralBadgeClass = isDark
    ? "rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200"
    : "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700";
  const fieldClass = isDark
    ? "rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-300/10"
    : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-700 focus:ring-4 focus:ring-orange-700/10";
  const quietButtonClass = isDark
    ? "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/15 disabled:opacity-50"
    : "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";
  const darkButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50";
  const accentButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-50";
  const whatsappButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50";
  const heroClass = isDark
    ? "overflow-hidden rounded-[20px] border border-white/10 bg-slate-950 text-white shadow-[0_18px_46px_rgba(2,6,23,0.2)]"
    : "overflow-hidden rounded-[20px] border border-slate-200 bg-white text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.06)]";
  const heroPrimaryButtonClass = isDark
    ? "inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50 disabled:opacity-60"
    : "inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60";
  const heroSecondaryButtonClass = isDark
    ? "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
    : "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";
  const sentButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 disabled:opacity-100";
  const workflowToneClass: Record<WorkflowTone, string> = {
    success: isDark
      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
      : "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: isDark
      ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
      : "border-amber-200 bg-amber-50 text-amber-900",
    danger: isDark
      ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
      : "border-rose-200 bg-rose-50 text-rose-900",
    info: isDark
      ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
      : "border-cyan-200 bg-cyan-50 text-cyan-900",
    neutral: isDark
      ? "border-white/10 bg-slate-950/60 text-slate-200"
      : "border-slate-200 bg-slate-50 text-slate-800",
  };
  const completedStepClass = isDark
    ? [
        "border-violet-300/25 bg-violet-300/10 text-violet-100",
        "border-violet-300/25 bg-violet-300/10 text-violet-100",
        "border-violet-300/25 bg-violet-300/10 text-violet-100",
        "border-amber-300/25 bg-amber-300/10 text-amber-100",
        "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
        "border-slate-300/25 bg-slate-300/10 text-slate-100",
      ]
    : [
        "border-violet-200 bg-violet-50 text-violet-950",
        "border-violet-200 bg-violet-50 text-violet-950",
        "border-violet-200 bg-violet-50 text-violet-950",
        "border-amber-200 bg-amber-50 text-amber-950",
        "border-emerald-200 bg-emerald-50 text-emerald-950",
        "border-slate-200 bg-slate-50 text-slate-900",
      ];
  const completedStepIconClass = isDark
    ? [
        "bg-violet-300/15 text-violet-100",
        "bg-violet-300/15 text-violet-100",
        "bg-violet-300/15 text-violet-100",
        "bg-amber-300/15 text-amber-100",
        "bg-emerald-300/15 text-emerald-100",
        "bg-slate-300/15 text-slate-100",
      ]
    : [
        "bg-white text-violet-700",
        "bg-white text-violet-700",
        "bg-white text-violet-700",
        "bg-white text-amber-700",
        "bg-white text-emerald-700",
        "bg-white text-slate-700",
      ];
  const summaryCards = [
    {
      label: "All quotes",
      value: metrics.total,
      icon: FileText,
      card: isDark ? "border-cyan-300/20 bg-cyan-300/10" : "border-cyan-100 bg-cyan-50",
      iconClass: isDark ? "text-cyan-200" : "text-cyan-700",
    },
    {
      label: "Need routing",
      value: metrics.unrouted,
      icon: Route,
      card: isDark ? "border-orange-300/20 bg-orange-300/10" : "border-orange-100 bg-orange-50",
      iconClass: isDark ? "text-orange-200" : "text-orange-700",
    },
    {
      label: "Blockers",
      value: metrics.blockers,
      icon: AlertTriangle,
      card: isDark ? "border-rose-300/20 bg-rose-300/10" : "border-rose-100 bg-rose-50",
      iconClass: isDark ? "text-rose-200" : "text-rose-700",
    },
    {
      label: "Ready to print",
      value: metrics.ready,
      icon: CheckCircle2,
      card: isDark ? "border-emerald-300/20 bg-emerald-300/10" : "border-emerald-100 bg-emerald-50",
      iconClass: isDark ? "text-emerald-200" : "text-emerald-700",
    },
  ];
  const selectedHasArtwork = Boolean(selected?.artwork.length);
  const selectedHasOpenArtwork = Boolean(selected?.hasOpenArtwork);
  const selectedHasOffer = Boolean(selected?.partner.completionDays && selected.partner.price);
  const selectedCanPrint = Boolean(
    selected?.partner.requestStatus === "accepted" &&
      selected.partner.clientStatus === "confirmed_half_payment"
  );
  const selectedWorkflow: Array<{
    title: string;
    value: string;
    helper: string;
    icon: typeof ImageIcon;
    tone: WorkflowTone;
  }> = selected
    ? [
        {
          title: "Client onboarding",
          value: selected.phone || selected.email ? "Contact ready" : "Contact missing",
          helper: "Confirm client, product, quantity, deadline, and contact details.",
          icon: ClipboardCheck,
          tone: selected.phone || selected.email ? "success" : "warning",
        },
        {
          title: "Artwork",
          value: selectedHasOpenArtwork
            ? "Open and judge"
            : selectedHasArtwork
              ? "Email-only"
              : "Missing",
          helper: selectedHasOpenArtwork
            ? "Review logo quality before routing."
            : selectedHasArtwork
              ? "Ask Ryan to re-upload so partners can open it."
              : "Ask for logo before assigning production.",
          icon: ImageIcon,
          tone: selectedHasOpenArtwork
            ? "success"
            : selectedHasArtwork
              ? "warning"
              : "danger",
        },
        {
          title: "Route + prices",
          value: selectedHasOffer
            ? formatMoney(selected.partner.price, selected.currency)
            : selected.partner.visibleTo.length
              ? selected.partner.visibleLabel
              : "Choose partner",
          helper: "Compare partner prices, set placement, then move the order.",
          icon: CircleDollarSign,
          tone: selected.partner.visibleTo.length || selectedHasOffer ? "success" : "warning",
        },
        {
          title: "Client approval",
          value: PARTNER_CLIENT_STATUS_LABELS[selected.partner.clientStatus],
          helper: "Tanvi keeps approval and half payment visible.",
          icon: Clock3,
          tone:
            selected.partner.clientStatus === "confirmed_half_payment"
              ? "success"
              : selected.partner.clientStatus === "changes_needed"
                ? "warning"
                : "neutral",
        },
        {
          title: "Partner answer",
          value: PARTNER_DECISION_LABELS[selected.partner.requestStatus],
          helper:
            selected.partner.requestStatus === "needs_info"
              ? "Clear the blocker before print."
              : "Review days, price, and partner comments.",
          icon: CheckCircle2,
          tone:
            selected.partner.requestStatus === "accepted"
              ? "success"
              : selected.partner.requestStatus === "needs_info"
                ? "warning"
                : selected.partner.requestStatus === "rejected"
                  ? "danger"
                  : "neutral",
        },
        {
          title: "Print start",
          value: selectedCanPrint ? "Tanvi gate" : "Do not print",
          helper: "Ask Tanvi before any print work starts.",
          icon: LockKeyhole,
          tone: selectedCanPrint ? "info" : "neutral",
        },
      ]
    : [];
  const firstOpenStepIndex = selected
    ? TANVI_STEPS.findIndex((step) => !selected.tanviStepChecks[step.key])
    : -1;
  const currentStepIndex =
    firstOpenStepIndex === -1 && selected ? TANVI_STEPS.length - 1 : firstOpenStepIndex;
  const checkedStepCount = selected
    ? TANVI_STEPS.filter((step) => selected.tanviStepChecks[step.key]).length
    : 0;
  const progressPercent = Math.round((checkedStepCount / TANVI_STEPS.length) * 100);
  const allActivePartnersRouted = Boolean(
    selected &&
      activePartners.length >= 2 &&
      activePartners.every((partner) => selected.partner.visibleTo.includes(partner.id))
  );
  const routePricesChecked = Boolean(selected?.tanviStepChecks.route_prices);
  const routePricesSurfaceClass = getStepSurfaceClass("route_prices", subtleCardClass);
  const routePricesCardClass = getStepSurfaceClass("route_prices", elevatedCardClass);
  const routePricesTextClass = getStepTextClass("route_prices", strongTextClass);
  const routePricesMutedClass = getStepMutedClass("route_prices");
  const acceptedPartnerIds = selected
    ? new Set(
        selected.partner.responses
          .filter((response) => response.requestStatus === "accepted")
          .map((response) => response.partnerId)
      )
    : new Set<string>();
  const visibleRoutePartners = acceptedPartnerIds.size
    ? activePartners.filter((partner) => acceptedPartnerIds.has(partner.id))
    : activePartners;
  const selectedDeadlineInsight = selected ? getDeadlineInsight(selected.deadline) : null;
  const selectedProductionInsight = selected
    ? getProductionStageInsight(selected.partner.productionStatus)
    : null;
  const partnerInsightMax = Math.max(
    1,
    ...partnerLoads.flatMap(({ count, accepted }) => [count, accepted])
  );
  const partnerVisibleTotal = partnerLoads.reduce((total, { count }) => total + count, 0);
  const partnerAcceptedTotal = partnerLoads.reduce((total, { accepted }) => total + accepted, 0);
  const partnerAcceptedPercent = partnerVisibleTotal
    ? Math.round((partnerAcceptedTotal / partnerVisibleTotal) * 100)
    : 0;
  const documentTotals = useMemo(() => {
    if (!documentDraft) {
      return { subtotal: 0, deliveryFee: 0, discount: 0, total: 0, amountReceived: 0, balance: 0 };
    }
    const subtotal = documentDraft.lines.reduce((sum, line) => {
      if (!line.includeInTotals) return sum;
      const quantity = Number(line.quantity) || 0;
      const unitPrice = Number(line.unitPrice) || 0;
      return sum + quantity * unitPrice;
    }, 0);
    const deliveryFee = Number(documentDraft.deliveryFee) || 0;
    const discount = Number(documentDraft.discount) || 0;
    const amountReceived = Number(documentDraft.amountReceived) || 0;
    const total = Math.max(0, subtotal + deliveryFee - discount);
    return {
      subtotal,
      deliveryFee,
      discount,
      total,
      amountReceived,
      balance: Math.max(0, total - amountReceived),
    };
  }, [documentDraft]);

  function getStepState(stepKey: TanviStepKey) {
    const index = TANVI_STEPS.findIndex((step) => step.key === stepKey);
    const checked = Boolean(selected?.tanviStepChecks[stepKey]);
    const current = Boolean(selected && index === currentStepIndex && !checked);
    return { checked, current, upcoming: Boolean(selected && index > currentStepIndex && !checked) };
  }

  function getStepPanelClass(stepKey: TanviStepKey) {
    const state = getStepState(stepKey);
    const base =
      "overflow-hidden rounded-2xl border transition-all duration-200 sm:rounded-[26px]";
    if (state.checked) {
      return `${base} ${
        isDark
          ? "border-violet-300/20 bg-violet-950/65 text-violet-50 shadow-none"
          : "border-violet-300 bg-violet-950/90 text-white shadow-[0_18px_42px_rgba(76,29,149,0.18)]"
      }`;
    }
    if (state.current) {
      return `${base} ${
        isDark
          ? "border-orange-300/50 bg-slate-900 shadow-[0_0_0_4px_rgba(249,115,22,0.16),0_22px_60px_rgba(0,0,0,0.28)]"
          : "border-orange-300 bg-white shadow-[0_0_0_5px_rgba(249,115,22,0.14),0_20px_55px_rgba(15,23,42,0.1)]"
      }`;
    }
    return `${base} ${
      isDark
        ? "border-white/10 bg-slate-900/70"
        : "border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
    }`;
  }

  function getStepSurfaceClass(stepKey: TanviStepKey, fallback: string) {
    if (!getStepState(stepKey).checked) return fallback;
    return isDark
      ? "rounded-2xl border border-violet-300/15 bg-violet-900/35 text-violet-50"
      : "rounded-2xl border border-violet-300/25 bg-violet-900/35 text-violet-50";
  }

  function getStepTextClass(stepKey: TanviStepKey, fallback: string) {
    if (!getStepState(stepKey).checked) return fallback;
    return "text-violet-50";
  }

  function getStepMutedClass(stepKey: TanviStepKey) {
    if (!getStepState(stepKey).checked) return mutedClass;
    return "text-violet-200/70";
  }

  function renderStepHeader({
    stepKey,
    stepNumber,
    title,
    badge,
  }: {
    stepKey: TanviStepKey;
    stepNumber: number;
    title: string;
    description: string;
    badge?: ReactNode;
  }) {
    const state = getStepState(stepKey);
    const headerTextClass = state.checked ? "text-violet-50" : strongTextClass;
    return (
      <div
        className={`flex items-start justify-between gap-2 border-b p-3 sm:gap-4 sm:p-5 ${
          state.checked
            ? isDark
              ? "border-violet-300/15 bg-violet-950/25"
              : "border-violet-300/20 bg-violet-950/20"
            : dividerClass
        }`}
      >
        <div className="flex min-w-0 gap-2.5 sm:gap-4">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-semibold sm:h-12 sm:w-12 sm:rounded-2xl ${
              state.checked
                ? isDark
                  ? "bg-violet-300/15 text-violet-50"
                  : "bg-violet-800 text-white"
                : state.current
                  ? "bg-orange-500 text-white"
                  : isDark
                    ? "bg-slate-950 text-slate-300"
                    : "bg-slate-100 text-slate-600"
            }`}
          >
            {stepNumber}
          </span>
          <div className="min-w-0">
            <p
              className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-xs sm:tracking-[0.16em] ${
                state.checked ? "text-violet-200/70" : "text-cyan-700"
              }`}
            >
              Step {stepNumber}
            </p>
            <h3 className={`mt-0.5 text-base font-semibold tracking-tight sm:mt-1 sm:text-xl ${headerTextClass}`}>
              {title}
            </h3>
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-2 sm:gap-3">
          <span className="hidden sm:inline-flex">{badge}</span>
          <label
            className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2 sm:text-xs ${
              state.checked
                ? isDark
                  ? "border-violet-300/20 bg-violet-300/10 text-violet-50"
                  : "border-violet-300/30 bg-violet-900/45 text-violet-50"
                : state.current
                  ? "border-orange-300 bg-orange-50 text-orange-900"
                  : isDark
                    ? "border-white/10 bg-slate-950/60 text-slate-300"
                    : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            <input
              type="checkbox"
              checked={state.checked}
              disabled={saving === `step-${stepKey}`}
              onChange={(event) => toggleTanviStep(stepKey, event.target.checked)}
              className="h-3.5 w-3.5 rounded border-violet-300 accent-violet-500 sm:h-4 sm:w-4"
            />
            {state.checked ? "Checked" : state.current ? "Current" : "Mark done"}
          </label>
        </div>
      </div>
    );
  }

  return (
    <>
    <main className={`${pageClass} max-w-full overflow-x-hidden`}>
      <div className="mx-auto flex w-full max-w-[1680px] min-w-0 flex-col gap-3 overflow-x-hidden px-2 py-3 sm:gap-5 sm:px-6 sm:py-4 lg:px-8">
        <section className={heroClass}>
          <div className="grid gap-3 p-3 sm:p-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(24rem,1fr)] lg:p-5">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
                Production Workspace · Manager access
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                Orders, routing and follow-up
              </h1>
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetWhatsappIntake();
                    setShowWhatsappIntake((current) => !current);
                  }}
                  className={`${whatsappButtonClass} w-full py-3`}
                >
                  <MessageCircle className="h-4 w-4" />
                  New WhatsApp order
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowQueue((current) => !current)}
                    className={heroSecondaryButtonClass}
                  >
                    {showQueue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {showQueue ? "Hide list" : "Show list"}
                  </button>
                  <button
                    type="button"
                    onClick={loadDesk}
                    disabled={loading}
                    className={heroPrimaryButtonClass}
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-2 sm:gap-2">
              {summaryCards.map(({ label, value, icon: Icon, card, iconClass }) => (
                <div key={label} className={`rounded-lg border px-1.5 py-1.5 text-center sm:rounded-xl sm:p-3 sm:text-left ${card}`}>
                  <div className="flex items-center justify-center gap-1 sm:justify-between sm:gap-2">
                    <p className={`min-w-0 truncate text-[8px] font-semibold uppercase tracking-0 sm:text-[10px] sm:tracking-[0.08em] ${mutedClass}`}>
                      {label}
                    </p>
                    <Icon className={`hidden h-3.5 w-3.5 sm:block ${iconClass}`} />
                  </div>
                  <div className="text-base font-semibold leading-tight sm:mt-1 sm:text-2xl">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {notice ? (
          <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            {notice}
          </div>
        ) : null}

        {error ? (
          <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        ) : null}

        {showWhatsappIntake ? (
          <section className={`${panelClass} max-w-full overflow-hidden`}>
            <div className={`flex flex-wrap items-center justify-between gap-3 border-b p-4 ${dividerClass}`}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  WhatsApp order
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">
                  Add or update the details Tanvi receives in chat
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected ? (
                  <button type="button" onClick={loadSelectedIntoWhatsappDraft} className={quietButtonClass}>
                    <ClipboardCheck className="h-4 w-4" />
                    Use selected
                  </button>
                ) : null}
                <button type="button" onClick={() => setShowWhatsappIntake(false)} className={quietButtonClass}>
                  <EyeOff className="h-4 w-4" />
                  Hide
                </button>
              </div>
            </div>
            <div className="grid min-w-0 max-w-full grid-cols-1 gap-3 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-4">
              {([
                ["clientName", "Client name", "Name from WhatsApp"],
                ["phone", "Phone", "+230..."],
                ["email", "Email", "Optional"],
                ["deadline", "Deadline", "Date or urgent note"],
                ["total", "Total", "Optional amount"],
              ] as Array<[WhatsappDraftTextField, string, string]>).map(([field, label, placeholder]) => (
                <label key={field} className={`min-w-0 text-xs font-semibold uppercase tracking-[0.08em] sm:tracking-[0.14em] ${mutedClass}`}>
                  {label}
                  <input
                    value={whatsappDraft[field]}
                    onChange={(event) =>
                      updateWhatsappDraft(field, event.target.value)
                    }
                    placeholder={placeholder}
                    className={`mt-2 w-full normal-case tracking-normal ${fieldClass}`}
                  />
                </label>
              ))}

              <div className="min-w-0 md:col-span-2 xl:col-span-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                      Order items
                    </p>
                    <p className={`mt-1 text-xs ${mutedClass}`}>
                      Add one row per product, size, logo, or print side.
                    </p>
                  </div>
                  <button type="button" onClick={addWhatsappLine} className={quietButtonClass}>
                    <Plus className="h-4 w-4" />
                    Add item
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  {whatsappDraft.lineItems.map((line, index) => {
                    const logoSlots = getWhatsappLogoSlots(line.printPlacement);
                    return (
                      <article key={line.id} className={`${subtleCardClass} min-w-0 max-w-full p-3`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className={`text-sm font-semibold ${strongTextClass}`}>
                            Item {index + 1}
                          </p>
                          {whatsappDraft.lineItems.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => removeWhatsappLine(line.id)}
                              className="text-xs font-semibold text-rose-600 transition hover:text-rose-700"
                            >
                              Remove item
                            </button>
                          ) : null}
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                          {[
                            ["product", "Product", "T-shirt / polo / hoodie"],
                            ["color", "Colour", "Navy blue"],
                            ["size", "Size", "S / M / 2XL"],
                            ["quantity", "Qty", "2"],
                          ].map(([field, label, placeholder]) => (
                            <label key={field} className={`min-w-0 text-xs font-semibold uppercase tracking-[0.08em] ${mutedClass}`}>
                              {label}
                              <input
                                value={line[field as keyof WhatsappOrderLine]}
                                onChange={(event) =>
                                  updateWhatsappLine(line.id, field as keyof WhatsappOrderLine, event.target.value)
                                }
                                placeholder={placeholder}
                                className={`mt-2 w-full normal-case tracking-normal ${fieldClass}`}
                              />
                            </label>
                          ))}
                          <label className={`min-w-0 text-xs font-semibold uppercase tracking-[0.08em] ${mutedClass}`}>
                            Print side
                            <select
                              value={line.printPlacement}
                              onChange={(event) =>
                                updateWhatsappLine(
                                  line.id,
                                  "printPlacement",
                                  event.target.value as WhatsappPrintPlacement
                                )
                              }
                              className={`mt-2 w-full normal-case tracking-normal ${fieldClass}`}
                            >
                              <option value="front">Front only</option>
                              <option value="back">Back only</option>
                              <option value="front_back">Front and back</option>
                            </select>
                          </label>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {logoSlots.map((slot) => {
                            const file = whatsappLogoFiles[getWhatsappLogoKey(line.id, slot)] || null;
                            const slotLabel = getWhatsappLogoSlotLabel(slot);
                            const descriptionField = getWhatsappLogoDescriptionField(slot);
                            return (
                              <div
                                key={slot}
                                className={`min-w-0 rounded-2xl border p-3 ${
                                  isDark ? "border-white/10 bg-white/[0.03]" : "border-black/10 bg-white"
                                }`}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className={`text-sm font-semibold ${strongTextClass}`}>
                                      {slotLabel}
                                    </p>
                                    <p className={`mt-1 text-xs ${mutedClass}`}>
                                      {line.printPlacement === "front_back"
                                        ? "Required for front and back printing."
                                        : "Required for selected print side."}
                                    </p>
                                  </div>
                                  {file ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <label className={quietButtonClass}>
                                        <input
                                          type="file"
                                          accept={WHATSAPP_LOGO_ACCEPT}
                                          onClick={(event) => {
                                            event.currentTarget.value = "";
                                          }}
                                          onChange={(event) =>
                                            updateWhatsappLogoFile(line.id, slot, event.target.files?.[0] || null)
                                          }
                                          className="sr-only"
                                        />
                                        <ImageIcon className="h-4 w-4" />
                                        Change
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => updateWhatsappLogoFile(line.id, slot, null)}
                                        className="text-xs font-semibold text-rose-600 transition hover:text-rose-700"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ) : null}
                                </div>

                                {!file ? (
                                  <label
                                    className={`mt-3 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-3 py-4 text-center transition ${
                                      isDark
                                        ? "border-white/15 bg-black/20 hover:border-emerald-300/60"
                                        : "border-black/10 bg-slate-50 hover:border-emerald-500/60"
                                    }`}
                                  >
                                    <input
                                      type="file"
                                      accept={WHATSAPP_LOGO_ACCEPT}
                                      onClick={(event) => {
                                        event.currentTarget.value = "";
                                      }}
                                      onChange={(event) =>
                                        updateWhatsappLogoFile(line.id, slot, event.target.files?.[0] || null)
                                      }
                                      className="sr-only"
                                    />
                                    <ImageIcon className="h-5 w-5 text-emerald-600" />
                                    <span className={`mt-2 text-sm font-semibold ${strongTextClass}`}>
                                      Choose {slotLabel.toLowerCase()}
                                    </span>
                                    <span className={`mt-1 max-w-52 text-xs ${mutedClass}`}>
                                      PNG, JPG, WEBP, SVG, HEIC, or PDF. Max 5MB.
                                    </span>
                                  </label>
                                ) : (
                                  <div className="mt-3">
                                    <WhatsappLogoFilePreview file={file} isDark={isDark} />
                                    <p className={`mt-2 truncate text-xs ${mutedClass}`}>
                                      Selected: {file.name}
                                    </p>
                                  </div>
                                )}
                                <label className={`mt-3 block text-xs font-semibold uppercase tracking-[0.06em] ${mutedClass}`}>
                                  Description below {slotLabel.toLowerCase()}
                                  <textarea
                                    value={line[descriptionField]}
                                    onChange={(event) =>
                                      updateWhatsappLine(line.id, descriptionField, event.target.value)
                                    }
                                    placeholder={
                                      slot === "front"
                                        ? "Example: print small on left chest."
                                        : "Example: print large centered on back."
                                    }
                                    rows={2}
                                    className={`mt-2 w-full resize-none normal-case tracking-normal ${fieldClass}`}
                                  />
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>

              <label className={`min-w-0 text-xs font-semibold uppercase tracking-[0.08em] sm:tracking-[0.14em] md:col-span-2 xl:col-span-4 ${mutedClass}`}>
                Notes from WhatsApp
                <textarea
                  value={whatsappDraft.notes}
                  onChange={(event) => updateWhatsappDraft("notes", event.target.value)}
                  placeholder="Paste the client request, delivery note, artwork reminder, or price discussion."
                  rows={3}
                  className={`mt-2 w-full resize-none normal-case tracking-normal ${fieldClass}`}
                />
              </label>
            </div>
            <div className={`flex flex-col gap-2 border-t p-4 sm:flex-row sm:justify-end ${dividerClass}`}>
              {selected ? (
                <button
                  type="button"
                  disabled={Boolean(saving) || creatingWhatsappOrder}
                  onClick={saveWhatsappDetailsToSelected}
                  className={quietButtonClass}
                >
                  <Save className="h-4 w-4" />
                  {saving === "whatsapp-details" ? "Saving..." : `Update ${selected.code}`}
                </button>
              ) : null}
              <button
                type="button"
                disabled={creatingWhatsappOrder || Boolean(saving)}
                onClick={createWhatsappOrder}
                className={whatsappButtonClass}
              >
                <Plus className="h-4 w-4" />
                {creatingWhatsappOrder ? "Creating..." : "Create WhatsApp order"}
              </button>
            </div>
          </section>
        ) : null}

        <section className={showQueue ? "grid gap-5 xl:grid-cols-[25rem_minmax(0,1fr)]" : "grid gap-5"}>
          {showQueue ? (
            <aside className={`${panelClass} overflow-hidden`}>
              <div className={`flex items-center justify-between gap-3 border-b p-4 ${dividerClass}`}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
                    Quote queue
                  </p>
                  <p className={`mt-1 text-sm ${mutedClass}`}>
                    {filteredQuotes.length} in this view
                  </p>
                </div>
                <button type="button" onClick={() => setShowQueue(false)} className={quietButtonClass}>
                  <EyeOff className="h-4 w-4" />
                  Focus
                </button>
              </div>
              <div className={`border-b p-4 ${dividerClass}`}>
              <label
                className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${
                  isDark
                    ? "border-white/10 bg-slate-950 text-slate-300"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                <Search className="h-4 w-4" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search quote, client, product"
                  className={`min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 ${
                    isDark ? "text-slate-100" : "text-slate-950"
                  }`}
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["all", "All", metrics.total],
                  ["unrouted", "Route", metrics.unrouted],
                  ["waiting", "Waiting", quotes.filter((quote) => quote.partner.requestStatus === "pending").length],
                  ["blocked", "Blocked", metrics.blockers],
                  ["ready", "Ready", metrics.ready],
                  ["active", "Active", metrics.active],
                ].map(([key, label, count]) => (
                  <button
                    key={String(key)}
                    type="button"
                    onClick={() => setFilter(key as QueueFilter)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      filter === key
                        ? "border-cyan-700 bg-cyan-700 text-white"
                        : isDark
                          ? "border-white/10 bg-white/10 text-slate-200 hover:bg-white/15"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                    }`}
                  >
                    <span className="uppercase tracking-[0.12em]">{label as string}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        filter === key
                          ? "bg-white/20 text-white"
                          : isDark
                            ? "bg-slate-950 text-slate-200"
                            : "bg-white text-slate-700"
                      }`}
                    >
                      {String(count)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[calc(100vh-18rem)] overflow-y-auto p-3">
              {filteredQuotes.length ? (
                <div className="space-y-2">
                  {filteredQuotes.map((quote) => {
                    const active = selected?.id === quote.id;
                    return (
                      <button
                        key={quote.id}
                        type="button"
                        onClick={() => setSelectedId(quote.id)}
                        className={`w-full rounded-2xl border p-3 text-left transition ${quoteQueueCardTone(quote, active, isDark)}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={`font-mono text-xs font-semibold ${quoteQueueCodeTone(quote, isDark)}`}>
                              {quote.code}
                            </p>
                            <p className="mt-1 truncate text-sm font-semibold">
                              {quote.clientName}
                            </p>
                          </div>
                          <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${quoteQueueStatusTone(quote)}`}>
                            {PARTNER_DECISION_LABELS[quote.partner.requestStatus]}
                          </span>
                        </div>
                        <div className={`mt-3 grid grid-cols-2 gap-2 text-xs ${quoteQueueMetaTone(quote, active, isDark)}`}>
                          <span className="truncate">{quote.product}</span>
                          <span className="truncate text-right">{quote.partner.visibleLabel}</span>
                          <span>{quote.pieces ? `${quote.pieces} pcs` : "Qty n/a"}</span>
                          <span className="text-right">{formatRelative(quote.createdAt)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className={`rounded-2xl border border-dashed p-8 text-center text-sm ${mutedClass}`}>
                  No quotations match this view.
                </div>
              )}
            </div>
          </aside>
          ) : null}

          {selected ? (
            <section className="grid gap-5">
              <div className={`${panelClass} p-4 sm:p-5`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
                      {selected.code}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                      {selected.clientName}
                    </h2>
                    <div className={`mt-3 flex flex-wrap gap-2 text-xs font-semibold ${mutedClass}`}>
                      <span>{selected.phone || "No phone"}</span>
                      <span>{selected.email || "No email"}</span>
                      <span>{formatDateTime(selected.createdAt)}</span>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:min-w-[24rem] sm:grid-cols-2">
                    <span className={`rounded-xl border px-3 py-2 text-xs font-semibold ${statusTone(selected.partner.requestStatus)}`}>
                      Partner: {PARTNER_DECISION_LABELS[selected.partner.requestStatus]}
                    </span>
                    <span className={`rounded-xl border px-3 py-2 text-xs font-semibold ${statusTone(selected.partner.clientStatus)}`}>
                      Client: {PARTNER_CLIENT_STATUS_LABELS[selected.partner.clientStatus]}
                    </span>
                    <span className={neutralBadgeClass}>
                      Production: {PARTNER_PRODUCTION_STATUS_LABELS[selected.partner.productionStatus]}
                    </span>
                    <span className={neutralBadgeClass}>
                      Total: {formatMoney(selected.total, selected.currency)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 md:grid-cols-4">
                  {[
                    ["Product", selected.product],
                    ["Quantity", selected.pieces ? `${selected.pieces} pcs` : "Not set"],
                    ["Print", selected.printMethod],
                    ["Deadline", selected.deadline],
                    ["Placement", PARTNER_PRINT_PLACEMENT_LABELS[selected.partner.printPlacement]],
                    ["Artwork", selected.artworkCount ? `${selected.artworkCount} file(s)` : "No artwork"],
                    ["Route", selected.partner.visibleLabel],
                    ["Updated", formatRelative(selected.updatedAt)],
                  ].map(([label, value]) => (
                    <div key={label} className={`${subtleCardClass} px-3 py-2.5 sm:py-3`}>
                      <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-[11px] sm:tracking-[0.14em] ${mutedClass}`}>
                        {label}
                      </p>
                      <p className={`mt-1 truncate text-sm font-semibold ${strongTextClass}`}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`${panelClass} overflow-hidden`}>
                <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:p-5 ${dividerClass}`}>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-700 sm:text-xs sm:tracking-[0.16em]">
                      Document Builder
                    </p>
                    <h3 className="mt-1 text-lg font-semibold tracking-tight sm:text-2xl">
                      {documentDraft ? DOCUMENT_TYPE_LABELS[documentDraft.documentType] : "Document"} for {selected.clientName}
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setDocumentStudioOpen((current) => !current)}
                      className={quietButtonClass}
                    >
                      {documentStudioOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {documentStudioOpen ? "Hide builder" : "Show builder"}
                    </button>
                    <a
                      href={`/admin/quotation-approval?quoteId=${encodeURIComponent(selected.id)}`}
                      className={accentButtonClass}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open Document Studio
                    </a>
                  </div>
                </div>

                {documentStudioOpen && documentDraft ? (
                  <div className="grid gap-4 p-3 sm:p-5">
                    <section className={`${elevatedCardClass} p-4`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                            Document setup
                          </p>
                          <p className={`mt-1 text-sm ${mutedClass}`}>
                            Choose quotation, invoice, partial receipt, or receipt.
                          </p>
                        </div>
                        <select
                          value={documentDraft.documentType}
                          onChange={(event) => updateDocumentDraft("documentType", event.target.value)}
                          className={`${fieldClass} w-full sm:w-56`}
                        >
                          {DOCUMENT_TYPE_OPTIONS.map((type) => (
                            <option key={type} value={type}>
                              {DOCUMENT_TYPE_LABELS[type]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </section>

                    <section className={`${elevatedCardClass} p-4`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                            Line items
                          </p>
                          <p className={`mt-1 text-sm ${mutedClass}`}>
                            Add products, quantities, and selling prices.
                          </p>
                        </div>
                        <button type="button" onClick={addDocumentLine} className={quietButtonClass}>
                          <Plus className="h-4 w-4" />
                          Add item
                        </button>
                      </div>
                      <div className="mt-4 space-y-3">
                        {documentDraft.lines.map((line, index) => (
                          <div key={line.id} className={`${subtleCardClass} grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_7rem_8rem_2.5rem]`}>
                            <label className={`text-xs font-semibold uppercase tracking-[0.08em] ${mutedClass}`}>
                              Item {index + 1}
                              <input
                                value={line.description}
                                onChange={(event) => updateDocumentLine(line.id, "description", event.target.value)}
                                placeholder="Product, size, colour, or print detail"
                                className={`mt-2 w-full normal-case tracking-normal ${fieldClass}`}
                              />
                            </label>
                            <label className={`text-xs font-semibold uppercase tracking-[0.08em] ${mutedClass}`}>
                              Qty
                              <input
                                value={line.quantity}
                                onChange={(event) => updateDocumentLine(line.id, "quantity", event.target.value)}
                                inputMode="decimal"
                                className={`mt-2 w-full normal-case tracking-normal ${fieldClass}`}
                              />
                            </label>
                            <label className={`text-xs font-semibold uppercase tracking-[0.08em] ${mutedClass}`}>
                              Unit price
                              <input
                                value={line.unitPrice}
                                onChange={(event) => updateDocumentLine(line.id, "unitPrice", event.target.value)}
                                inputMode="decimal"
                                className={`mt-2 w-full normal-case tracking-normal ${fieldClass}`}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => removeDocumentLine(line.id)}
                              disabled={documentDraft.lines.length === 1}
                              className={`${quietButtonClass} self-end px-2`}
                              aria-label="Remove item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className={`${elevatedCardClass} p-4`}>
                      <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                        Commercial details
                      </p>
                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {([
                          ["documentNumber", "Document number"],
                          ["documentDate", "Document date"],
                          ["validUntil", "Valid until"],
                          ["paymentStatus", "Payment status"],
                          ["clientCompany", "Client company"],
                          ["clientAddress", "Client address"],
                          ["clientBrn", "Client BRN"],
                          ["clientVat", "Client VAT"],
                        ] as Array<[DocumentStudioField, string]>).map(([field, label]) => (
                          <label key={field} className={`text-xs font-semibold uppercase tracking-[0.08em] ${mutedClass}`}>
                            {label}
                            <input
                              value={documentDraft[field]}
                              onChange={(event) => updateDocumentDraft(field, event.target.value)}
                              type={field === "documentDate" || field === "validUntil" ? "date" : "text"}
                              className={`mt-2 w-full normal-case tracking-normal ${fieldClass}`}
                            />
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className={`${elevatedCardClass} p-4`}>
                      <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                        Notes and terms
                      </p>
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        <label className={`text-xs font-semibold uppercase tracking-[0.08em] ${mutedClass}`}>
                          Notes to client
                          <textarea
                            value={documentDraft.notes}
                            onChange={(event) => updateDocumentDraft("notes", event.target.value)}
                            rows={4}
                            className={`mt-2 w-full resize-none normal-case tracking-normal ${fieldClass}`}
                          />
                        </label>
                        <label className={`text-xs font-semibold uppercase tracking-[0.08em] ${mutedClass}`}>
                          Terms
                          <textarea
                            value={documentDraft.terms}
                            onChange={(event) => updateDocumentDraft("terms", event.target.value)}
                            rows={4}
                            className={`mt-2 w-full resize-none normal-case tracking-normal ${fieldClass}`}
                          />
                        </label>
                      </div>
                    </section>

                    <section className={`${elevatedCardClass} p-4`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                          Totals
                        </p>
                        <div className="flex flex-wrap gap-3 text-xs font-semibold">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={documentDraft.showLineItems}
                              onChange={(event) =>
                                setDocumentDraft((current) =>
                                  current ? { ...current, showLineItems: event.target.checked } : current
                                )
                              }
                              className="h-4 w-4 rounded border-slate-300 accent-orange-600"
                            />
                            Show items
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={documentDraft.showTotals}
                              onChange={(event) =>
                                setDocumentDraft((current) =>
                                  current ? { ...current, showTotals: event.target.checked } : current
                                )
                              }
                              className="h-4 w-4 rounded border-slate-300 accent-orange-600"
                            />
                            Show totals
                          </label>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        {([
                          ["deliveryFee", "Delivery fee"],
                          ["discount", "Discount"],
                          ["amountReceived", "Amount received"],
                        ] as Array<[DocumentStudioField, string]>).map(([field, label]) => (
                          <label key={field} className={`text-xs font-semibold uppercase tracking-[0.08em] ${mutedClass}`}>
                            {label}
                            <input
                              value={documentDraft[field]}
                              onChange={(event) => updateDocumentDraft(field, event.target.value)}
                              inputMode="decimal"
                              className={`mt-2 w-full normal-case tracking-normal ${fieldClass}`}
                            />
                          </label>
                        ))}
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-4">
                        {[
                          ["Subtotal", documentTotals.subtotal],
                          ["Total", documentTotals.total],
                          ["Received", documentTotals.amountReceived],
                          ["Balance", documentTotals.balance],
                        ].map(([label, value]) => (
                          <div key={label} className={`${subtleCardClass} p-3`}>
                            <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${mutedClass}`}>
                              {label}
                            </p>
                            <p className={`mt-1 text-lg font-semibold ${strongTextClass}`}>
                              {formatMoney(value as number, documentDraft.currency)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className={`${elevatedCardClass} p-4`}>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                            Workflow
                          </p>
                          <p className={`mt-1 text-sm ${mutedClass}`}>
                            Save the document here, then use the full studio for PDF preview, download, send, and approval.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={saveDocumentStudio}
                            disabled={saving === "document-studio"}
                            className={darkButtonClass}
                          >
                            <Save className="h-4 w-4" />
                            {saving === "document-studio" ? "Saving..." : `Save ${DOCUMENT_TYPE_LABELS[documentDraft.documentType].toLowerCase()}`}
                          </button>
                          <a
                            href={`/admin/quotation-approval?quoteId=${encodeURIComponent(selected.id)}`}
                            className={accentButtonClass}
                          >
                            <ExternalLink className="h-4 w-4" />
                            Open Document Studio
                          </a>
                        </div>
                      </div>
                    </section>
                  </div>
                ) : null}
              </div>

              <div className={`${panelClass} overflow-hidden`}>
                <div className={`flex items-start justify-between gap-3 border-b px-4 py-3 sm:p-5 ${dividerClass}`}>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 sm:text-xs sm:tracking-[0.16em]">
                      Tanvi progress
                    </p>
                    <h3 className="mt-1 text-base font-semibold tracking-tight sm:text-xl">
                      {checkedStepCount}/{TANVI_STEPS.length} complete
                    </h3>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:px-3 sm:py-1.5 sm:text-xs ${
                      selectedCanPrint
                        ? workflowToneClass.info
                        : selectedHasOpenArtwork && selected.partner.visibleTo.length
                          ? workflowToneClass.success
                          : workflowToneClass.warning
                    }`}
                  >
                    {selectedCanPrint
                      ? "Tanvi print gate"
                      : selectedHasOpenArtwork && selected.partner.visibleTo.length
                        ? "Moving"
                        : "Needs decision"}
                  </span>
                </div>
                <div className="p-3 sm:p-4">
                  <div className={`h-2 overflow-hidden rounded-full sm:h-3 ${isDark ? "bg-slate-950" : "bg-slate-100"}`}>
                    <div
                      className="h-full rounded-full bg-cyan-600 transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="mt-3 grid gap-2 sm:mt-4 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-6">
                    {selectedWorkflow.map((step, index) => {
                      const StepIcon = step.icon;
                      const stepMeta = TANVI_STEPS[index];
                      const checked = stepMeta ? selected.tanviStepChecks[stepMeta.key] : false;
                      const completedClass = completedStepClass[index] || completedStepClass[0];
                      const completedIconClass = completedStepIconClass[index] || completedStepIconClass[0];
                      return (
                        <div
                          key={step.title}
                          className={`rounded-xl border px-3 py-2.5 sm:rounded-2xl sm:p-4 ${
                            checked ? completedClass : workflowToneClass[step.tone]
                          }`}
                        >
                          <div className="flex items-center gap-2.5 sm:items-start sm:gap-3">
                            <span
                              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl ${
                                checked ? completedIconClass : "bg-white/70 text-current"
                              }`}
                            >
                              <StepIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-start justify-between gap-2 sm:block">
                                <div className="min-w-0">
                                  <p className="text-[9px] font-semibold uppercase tracking-[0.1em] opacity-75 sm:text-[10px] sm:tracking-[0.12em]">
                                    Step {index + 1}
                                  </p>
                                  <h4 className="truncate text-sm font-semibold text-current sm:mt-1">
                                    {step.title}
                                  </h4>
                                </div>
                                <p className="max-w-[44%] shrink-0 truncate text-right text-xs font-semibold sm:mt-2 sm:max-w-none sm:text-left sm:text-sm">
                                  {step.value}
                                </p>
                              </div>
                              <p className="mt-2 hidden text-xs leading-5 opacity-75 sm:block">
                                {step.helper}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className={getStepPanelClass("client_onboarding")}>
                {renderStepHeader({
                  stepKey: "client_onboarding",
                  stepNumber: 1,
                  title: "Client onboarding",
                  description:
                    "Tanvi checks the client, contact details, garment, quantity, deadline, and notes before touching production.",
                  badge: (
                    <span
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        selected.phone || selected.email
                          ? workflowToneClass.success
                          : workflowToneClass.warning
                      }`}
                    >
                      {selected.phone || selected.email ? "Client reachable" : "Need contact"}
                    </span>
                  ),
                })}
                <div className="grid gap-2.5 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
                  <div className="grid gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
                    {[
                      ["Client", selected.clientName],
                      ["Company", selected.clientCompany || "Not set"],
                      ["Phone", selected.phone || "Not set"],
                      ["Email", selected.email || "Not set"],
                      ["Source", selected.source],
                      ["Created", formatDateTime(selected.createdAt)],
                      ["Product", selected.product],
                      ["Garments", selected.garmentSummary],
                      ["Quantity", selected.pieces ? `${selected.pieces} pcs` : "Not set"],
                      ["Colours", selected.colors.length ? selected.colors.join(", ") : "Not set"],
                      ["Print method", selected.printMethod],
                      ["Deadline", selected.deadline],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className={`${getStepSurfaceClass("client_onboarding", subtleCardClass)} px-3 py-2.5 sm:py-3`}
                      >
                        <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-[11px] sm:tracking-[0.14em] ${getStepMutedClass("client_onboarding")}`}>
                          {label}
                        </p>
                        <p className={`mt-1 break-words text-sm font-semibold leading-5 ${getStepTextClass("client_onboarding", strongTextClass)}`}>
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className={`${getStepSurfaceClass("client_onboarding", subtleCardClass)} p-3 sm:p-4`}>
                    <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-[11px] sm:tracking-[0.14em] ${getStepMutedClass("client_onboarding")}`}>
                      Client notes
                    </p>
                    <p className={`mt-2 whitespace-pre-wrap text-sm font-medium leading-5 sm:mt-3 sm:leading-6 ${getStepTextClass("client_onboarding", strongTextClass)}`}>
                      {selected.notes || "No client notes shared."}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4">
                      <span className={`${getStepSurfaceClass("client_onboarding", neutralBadgeClass)} px-3 py-2 text-xs font-semibold`}>
                        Quote total: {formatMoney(selected.total, selected.currency)}
                      </span>
                      <span className={`${getStepSurfaceClass("client_onboarding", neutralBadgeClass)} px-3 py-2 text-xs font-semibold`}>
                        Route: {selected.partner.visibleLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={getStepPanelClass("artwork")}>
                {renderStepHeader({
                  stepKey: "artwork",
                  stepNumber: 2,
                  title: "Artwork / logo",
                  description:
                    "Tanvi can open the files, inspect the logo size and detail, then send the order to the best production desk.",
                  badge: (
                    <span className={neutralBadgeClass}>
                      {selected.artworkCount ? `${selected.artworkCount} file(s)` : "No file"}
                    </span>
                  ),
                })}

                {selected.artwork.length ? (
                  <div className="grid gap-2.5 p-3 sm:gap-4 sm:p-4 lg:grid-cols-2">
                    {selected.artwork.map((attachment, index) => {
                      const isImage = isArtworkImage(attachment);
                      const isPdf = isArtworkPdf(attachment);
                      const downloadHref = getArtworkDownloadHref(attachment, index);
                      const artworkChecked = getStepState("artwork").checked;
                      const artworkSurfaceClass = getStepSurfaceClass("artwork", elevatedCardClass);
                      const artworkMutedClass = getStepMutedClass("artwork");
                      const artworkTextClass = getStepTextClass("artwork", strongTextClass);
                      const artworkDividerClass = artworkChecked
                        ? isDark
                          ? "border-white/10"
                          : "border-slate-800"
                        : dividerClass;
                      const artworkPreviewShellClass = artworkChecked
                        ? isDark
                          ? "bg-black p-2.5 sm:p-3"
                          : "bg-slate-950 p-2.5 sm:p-3"
                        : "bg-white p-2.5 sm:p-3";
                      const artworkPreviewClass = artworkChecked
                        ? "h-48 w-full rounded-xl border border-slate-800 bg-black object-contain sm:h-80 sm:rounded-2xl"
                        : "h-48 w-full rounded-xl border border-slate-200 bg-white object-contain sm:h-80 sm:rounded-2xl";
                      const lowerArtworkLabel = `${attachment.label} ${attachment.description}`.toLowerCase();
                      const artworkDescriptionLabel =
                        lowerArtworkLabel.includes("back") && !lowerArtworkLabel.includes("front")
                          ? "Description below back logo"
                          : lowerArtworkLabel.includes("front") && lowerArtworkLabel.includes("back")
                            ? "Description below front and back logo"
                            : "Description below front logo";
                      return (
                        <article
                          key={`${attachment.url || attachment.filename}-${index}`}
                          className={`${artworkSurfaceClass} w-full overflow-hidden`}
                        >
                          <div className={`border-b p-3 sm:p-4 ${artworkDividerClass}`}>
                            <div className="min-w-0">
                              <p className={`truncate text-sm font-semibold sm:text-base ${artworkTextClass}`}>
                                {attachment.filename}
                              </p>
                              <p className={`mt-1 text-xs ${artworkMutedClass}`}>
                                {attachment.label}
                                {attachment.quantity ? ` - Qty ${attachment.quantity}` : ""}
                                {formatFileSize(attachment.size) ? ` - ${formatFileSize(attachment.size)}` : ""}
                              </p>
                            </div>
                            {attachment.url ? (
                              <div className="mt-2 flex items-center gap-2">
                                <a
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:h-10"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  Open
                                </a>
                                <a
                                  href={downloadHref}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 sm:h-10 sm:w-10"
                                  aria-label={`Download ${attachment.filename || "artwork"}`}
                                  title="Download artwork"
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => setZoomArtwork(attachment)}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 sm:h-10 sm:w-10"
                                  aria-label={`Zoom ${attachment.filename || "artwork"}`}
                                  title="Zoom artwork"
                                >
                                  <ZoomIn className="h-4 w-4" />
                                </button>
                              </div>
                            ) : null}
                          </div>

                          {isImage ? (
                            <div className={artworkPreviewShellClass}>
                              <ArtworkImagePreview
                                src={attachment.url}
                                alt={attachment.filename}
                                className={artworkPreviewClass}
                                isDark={isDark}
                              />
                            </div>
                          ) : isPdf ? (
                            <div className={artworkPreviewShellClass}>
                              <iframe
                                src={attachment.url}
                                title={`Preview ${attachment.filename || "PDF artwork"}`}
                                className={
                                  artworkChecked
                                    ? "h-52 w-full rounded-xl border border-slate-800 bg-black sm:h-80 sm:rounded-2xl"
                                    : "h-52 w-full rounded-xl border border-slate-200 bg-white sm:h-80 sm:rounded-2xl"
                                }
                              />
                            </div>
                          ) : attachment.url ? (
                            <div className="p-3 sm:p-4">
                              <div className={`grid min-h-36 place-items-center text-center sm:min-h-48 ${getStepSurfaceClass("artwork", subtleCardClass)} p-4 sm:p-6`}>
                                <div>
                                  <FileText className="mx-auto h-8 w-8 text-cyan-700" />
                                  <p className={`mt-3 text-sm font-semibold ${artworkTextClass}`}>
                                    Preview unavailable
                                  </p>
                                  <p className={`mt-1 text-xs ${artworkMutedClass}`}>
                                    Open the file to inspect this artwork.
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 sm:p-4">
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900 sm:p-4">
                                Email-only artwork. Ask Ryan to re-upload it in Quotation Approval so Tanvi and the partner can open it here.
                              </div>
                            </div>
                          )}
                          <div className={`border-t px-3 py-2.5 sm:px-4 ${
                            artworkChecked
                              ? "border-violet-300/15"
                              : isDark
                                ? "border-white/10"
                                : "border-slate-200"
                          }`}>
                            <label className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${artworkMutedClass}`}>
                              {artworkDescriptionLabel}
                              <textarea
                                value={getArtworkDescriptionDraft(selected, index, attachment)}
                                onChange={(event) =>
                                  updateArtworkDescriptionDraft(selected.id, index, event.target.value)
                                }
                                rows={2}
                                placeholder="Write placement, size, colour, or printing instruction."
                                className={`mt-2 w-full resize-none normal-case tracking-normal ${fieldClass}`}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => saveArtworkDescription(selected, index, attachment)}
                              disabled={
                                Boolean(saving) ||
                                getArtworkDescriptionDraft(selected, index, attachment).trim() === (attachment.description || "").trim()
                              }
                              className={`mt-2 w-full ${quietButtonClass}`}
                            >
                              <Save className="h-4 w-4" />
                              {saving === `artwork-description-${index}` ? "Saving..." : "Save description"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 sm:p-4">
                    <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-5 text-center text-sm font-semibold text-amber-900 sm:px-5 sm:py-8">
                      No artwork shared yet. Tanvi should not move this to print until Ryan gets the logo from the client.
                    </div>
                  </div>
                )}
              </div>

              <div className={getStepPanelClass("route_prices")}>
                {renderStepHeader({
                  stepKey: "route_prices",
                  stepNumber: 3,
                  title: "Route, placement, partner prices",
                  description:
                    "Compare each partner, set the print placement, edit the partner price, then move the order to the right desk.",
                  badge: <Route className="h-5 w-5 text-cyan-700" />,
                })}
                <div className="p-3 sm:p-5">

                  <div className="grid gap-3 sm:gap-4">
                    <label className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-xs sm:tracking-[0.14em] ${routePricesMutedClass}`}>
                      Current route and selected placement
                      <div className={`mt-2 flex min-h-[42px] items-center rounded-xl px-3 py-2 normal-case tracking-normal ${routePricesSurfaceClass}`}>
                        <span className={`text-sm font-semibold ${routePricesTextClass}`}>
                          {selected.partner.visibleLabel} / {PARTNER_PRINT_PLACEMENT_LABELS[printPlacement]}
                        </span>
                      </div>
                    </label>
                  </div>

                  <div className="mt-3 grid gap-2.5 sm:mt-5 sm:gap-3 xl:grid-cols-2">
                    {visibleRoutePartners.map((partner) => {
                      const response = selected.partner.responses.find(
                        (entry) => entry.partnerId === partner.id
                      );
                      const isRouted = selected.partner.visibleTo.includes(partner.id);
                      const priceDraft = partnerPriceDrafts[partner.id] || "";
                      const priceValue = Number(priceDraft);
                      const partnerPresetOptions = getPartnerPriceOptions(partner.id);
                      const nextPrice =
                        priceDraft.trim() && Number.isFinite(priceValue) && priceValue > 0
                          ? priceValue
                          : null;

                      return (
                        <article key={partner.id} className={`${routePricesCardClass} p-3 sm:p-4`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className={`text-base font-semibold ${routePricesTextClass}`}>
                                {partner.name}
                              </p>
                              <p className={`mt-1 text-xs ${routePricesMutedClass}`}>
                                {isRouted ? "Currently seeing this order" : "Available partner"}
                              </p>
                            </div>
                            <span
                              className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                                response?.requestStatus
                                  ? statusTone(response.requestStatus)
                                  : workflowToneClass.neutral
                              }`}
                            >
                              {response?.requestStatus
                                ? PARTNER_DECISION_LABELS[response.requestStatus]
                                : "No reply"}
                            </span>
                          </div>

                          <label className={`mt-3 block text-[10px] font-semibold uppercase tracking-[0.12em] sm:mt-4 sm:text-xs sm:tracking-[0.14em] ${routePricesMutedClass}`}>
                            Price preset
                            <select
                              defaultValue=""
                              onChange={(event) => {
                                const presetIndex = Number(event.target.value);
                                if (Number.isInteger(presetIndex)) {
                                  applyPartnerPricePreset(partner.id, presetIndex);
                                }
                              }}
                              className={`mt-2 w-full normal-case tracking-normal ${fieldClass}`}
                            >
                              <option value="">Select placement and preset price</option>
                              {partnerPresetOptions.map((option, index) => (
                                <option key={`${partner.id}-${option.label}-${option.price}`} value={index}>
                                  {option.label} Rs {option.price}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="mt-3 grid gap-2.5 sm:mt-4 sm:gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <label className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-xs sm:tracking-[0.14em] ${routePricesMutedClass}`}>
                              Partner price
                              <div className="mt-2 flex items-center gap-2">
                                <span className={`inline-flex min-w-12 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-semibold leading-none ${
                                  routePricesChecked
                                    ? "border-violet-300/25 bg-violet-950/25 text-violet-50"
                                    : isDark
                                      ? "border-white/10 bg-slate-950 text-slate-300"
                                      : "border-slate-200 bg-slate-50 text-slate-600"
                                }`}>
                                  {selected.currency}
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  value={priceDraft}
                                  onChange={(event) =>
                                    setPartnerPriceDrafts((current) => ({
                                      ...current,
                                      [partner.id]: event.target.value,
                                    }))
                                  }
                                  className={`w-full normal-case tracking-normal ${fieldClass}`}
                                  placeholder="0"
                                />
                              </div>
                            </label>
                            <button
                              type="button"
                              disabled={Boolean(saving)}
                              onClick={() =>
                                updateQuote(
                                  selected,
                                  {
                                    printPlacement,
                                    partnerPrices: {
                                      [partner.id]: { price: nextPrice },
                                    },
                                  },
                                  `price-${partner.id}`
                                )
                              }
                              className={quietButtonClass}
                            >
                              <Save className="h-4 w-4" />
                              {saving === `price-${partner.id}` ? "Saving..." : "Save price"}
                            </button>
                          </div>

                          <div className="mt-3 grid gap-2 sm:mt-4 sm:grid-cols-2">
                            <div className={`${routePricesSurfaceClass} px-3 py-2`}>
                              <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${routePricesMutedClass}`}>
                                Last saved
                              </p>
                              <p className={`mt-1 text-sm font-semibold ${routePricesTextClass}`}>
                                {formatMoney(response?.price || null, selected.currency)}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={Boolean(saving) || isRouted}
                              onClick={() =>
                                updateQuote(
                                  selected,
                                  {
                                    partnerIds: [partner.id],
                                    visibleFields,
                                    printPlacement,
                                  },
                                  partner.id
                                )
                              }
                              className={
                                isRouted
                                  ? sentButtonClass
                                  : partner.id === activePartners[0]?.id
                                    ? accentButtonClass
                                    : darkButtonClass
                              }
                            >
                              {isRouted ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                              {isRouted
                                ? `Already sent to ${partner.name}`
                                : saving === partner.id
                                  ? "Moving..."
                                  : `Move to ${partner.name}`}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={Boolean(saving) || activePartners.length < 2 || allActivePartnersRouted}
                    onClick={() =>
                      updateQuote(
                        selected,
                        {
                          partnerIds: activePartners.map((partner) => partner.id),
                          visibleFields,
                          printPlacement,
                        },
                        "all"
                      )
                    }
                    className={`mt-2.5 w-full sm:mt-3 ${allActivePartnersRouted ? sentButtonClass : quietButtonClass}`}
                  >
                    {allActivePartnersRouted ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Users className="h-4 w-4" />
                    )}
                    {allActivePartnersRouted
                      ? "Already sent to all active partners"
                      : saving === "all"
                        ? "Sending..."
                        : "Send to all active partners"}
                  </button>

                  <div className="mt-4 sm:mt-5">
                    <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-xs sm:tracking-[0.14em] ${routePricesMutedClass}`}>
                      Fields shared with partners
                    </p>
                    <div className="mt-2 grid gap-2 sm:mt-3 sm:grid-cols-2">
                      {PARTNER_VISIBLE_FIELD_OPTIONS.map((field) => (
                        <label
                          key={field.key}
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2 text-sm transition ${
                            visibleFields.includes(field.key)
                              ? routePricesChecked
                                ? "border-violet-300/35 bg-violet-300/10 text-violet-50"
                                : isDark
                                  ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                                  : "border-cyan-300 bg-cyan-50 text-cyan-950"
                              : routePricesChecked
                                ? "border-violet-300/20 bg-violet-950/20 text-violet-100"
                                : isDark
                                  ? "border-white/10 bg-slate-950 text-slate-200"
                                  : "border-slate-200 bg-white text-slate-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={visibleFields.includes(field.key)}
                            onChange={() => toggleVisibleField(field.key)}
                            className="mt-1"
                          />
                          <span>
                            <span className="block font-semibold">{field.label}</span>
                            <span className="mt-0.5 block text-xs opacity-75">{field.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className={getStepPanelClass("client_approval")}>
                {renderStepHeader({
                  stepKey: "client_approval",
                  stepNumber: 4,
                  title: "Client approval",
                  description:
                    "Track quotation approval, payment readiness, missing information, and client-facing notes before print starts.",
                  badge: <Clock3 className="h-5 w-5 text-amber-600" />,
                })}
                <div className="p-3 sm:p-5">

                  <div>
                    <label className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-xs sm:tracking-[0.14em] ${getStepMutedClass("client_approval")}`}>
                      Client status
                      <select
                        value={selected.partner.clientStatus}
                        onChange={(event) =>
                          updateQuote(
                            selected,
                            { clientStatus: event.target.value as PartnerClientStatus },
                            "client-status"
                          )
                        }
                        disabled={Boolean(saving)}
                        className={`mt-2 w-full normal-case tracking-normal ${fieldClass}`}
                      >
                        {PARTNER_CLIENT_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-3 space-y-2.5 sm:mt-5 sm:space-y-3">
                    <div className={`${getStepSurfaceClass("client_approval", subtleCardClass)} p-3`}>
                      <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-xs sm:tracking-[0.14em] ${getStepMutedClass("client_approval")}`}>
                        Missing information
                      </p>
                      <p className={`mt-2 whitespace-pre-wrap text-sm font-medium ${getStepTextClass("client_approval", strongTextClass)}`}>
                        {selected.partner.missingInformation || "No blocker from partner."}
                      </p>
                    </div>
                    <div className={`${getStepSurfaceClass("client_approval", subtleCardClass)} p-3`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-xs sm:tracking-[0.14em] ${getStepMutedClass("client_approval")}`}>
                          Partner comments
                        </p>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            isDark
                              ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                              : "border-emerald-200 bg-emerald-50 text-emerald-800"
                          }`}
                        >
                          {selected.partner.name || selected.partner.visibleLabel || "Partner"}
                        </span>
                      </div>
                      <p className={`mt-2 whitespace-pre-wrap text-sm font-medium ${getStepTextClass("client_approval", strongTextClass)}`}>
                        {selected.partner.comments || "No comments yet."}
                      </p>
                      <div className="mt-3 border-t border-current/10 pt-3">
                        <label className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-xs sm:tracking-[0.14em] ${getStepMutedClass("client_approval")}`}>
                          Reply to partner
                          <textarea
                            value={partnerReplyDrafts[selected.id] || ""}
                            onChange={(event) =>
                              setPartnerReplyDrafts((current) => ({
                                ...current,
                                [selected.id]: event.target.value,
                              }))
                            }
                            rows={3}
                            placeholder="Write Tanvi's reply here. The partner will receive it by email."
                            className={`mt-2 w-full resize-none normal-case tracking-normal ${fieldClass}`}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void sendPartnerReply(selected)}
                          disabled={
                            sendingPartnerReply === selected.id ||
                            !selected.partner.id ||
                            !(partnerReplyDrafts[selected.id] || "").trim()
                          }
                          className={`mt-2 w-full ${whatsappButtonClass}`}
                        >
                          <Send className="h-4 w-4" />
                          {sendingPartnerReply === selected.id ? "Sending..." : "Send reply by email"}
                        </button>
                      </div>
                    </div>
                    {selected.notes ? (
                      <div className={`${getStepSurfaceClass("client_approval", subtleCardClass)} p-3`}>
                        <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-xs sm:tracking-[0.14em] ${getStepMutedClass("client_approval")}`}>
                          Client notes
                        </p>
                        <p className={`mt-2 whitespace-pre-wrap text-sm font-medium ${getStepTextClass("client_approval", strongTextClass)}`}>
                          {selected.notes}
                        </p>
                      </div>
                    ) : null}
                  </div>

                </div>
              </div>

              <div className={getStepPanelClass("partner_answer")}>
                {renderStepHeader({
                  stepKey: "partner_answer",
                  stepNumber: 5,
                  title: "Partner answer",
                  description:
                    "Review each partner reply, completion days, price, blockers, and production comments in one clean place.",
                  badge: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
                })}
                <div className="space-y-2 p-3 sm:p-5">
                  {selected.partner.responses.length ? (
                    selected.partner.responses.map((response) => (
                      <div key={response.partnerId} className={`${getStepSurfaceClass("partner_answer", elevatedCardClass)} p-3`}>
                        <div className="flex items-center justify-between gap-3">
                          <p className={`font-semibold ${getStepTextClass("partner_answer", strongTextClass)}`}>{response.partnerName}</p>
                          <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${statusTone(response.requestStatus)}`}>
                            {PARTNER_DECISION_LABELS[response.requestStatus]}
                          </span>
                        </div>
                        <div className={`mt-2 grid grid-cols-3 gap-2 text-xs sm:mt-3 ${getStepMutedClass("partner_answer")}`}>
                          <span>{response.completionDays ? `${response.completionDays} days` : "Days n/a"}</span>
                          <span>{response.price ? `Rs ${response.price}` : "Price n/a"}</span>
                          <span>{formatRelative(response.updatedAt)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className={`rounded-2xl border border-dashed p-4 text-center text-sm sm:p-5 ${getStepMutedClass("partner_answer")}`}>
                      Waiting for partner response.
                    </div>
                  )}
                </div>
              </div>

              <div className={getStepPanelClass("print_start")}>
                {renderStepHeader({
                  stepKey: "print_start",
                  stepNumber: 6,
                  title: "Print start",
                  description:
                    "Final gate: Ryan supply, printing movement, deadline pressure, and Tanvi's print-start decision.",
                  badge: (
                    <span className={selectedCanPrint ? workflowToneClass.info : neutralBadgeClass}>
                      {selectedCanPrint ? "Ready for Tanvi gate" : "Do not print yet"}
                    </span>
                  ),
                })}
                <div className="grid gap-3 p-3 sm:gap-4 sm:p-5">
                  <div className="grid gap-3 sm:gap-4">
                    <div className={`${getStepSurfaceClass("print_start", elevatedCardClass)} overflow-hidden`}>
                      <div className={`border-b p-3 sm:p-4 ${getStepState("print_start").checked ? "border-violet-300/15" : dividerClass}`}>
                        <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-[11px] sm:tracking-[0.14em] ${getStepMutedClass("print_start")}`}>
                          Current production movement
                        </p>
                        <h4 className={`mt-1.5 text-base font-semibold sm:mt-2 sm:text-xl ${getStepTextClass("print_start", strongTextClass)}`}>
                          {selectedProductionInsight?.printing || "Printing not started"}
                        </h4>
                      </div>
                      <div className="grid gap-2.5 p-3 sm:gap-3 sm:p-4 md:grid-cols-3">
                        <div className={`${getStepSurfaceClass("print_start", subtleCardClass)} p-3 sm:p-4`}>
                          <PackageCheck className="h-5 w-5 text-orange-600" />
                          <p className={`mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] sm:mt-3 sm:text-[11px] sm:tracking-[0.14em] ${getStepMutedClass("print_start")}`}>
                            Ryan supply
                          </p>
                          <p className={`mt-1.5 text-sm font-semibold leading-5 sm:mt-2 ${getStepTextClass("print_start", strongTextClass)}`}>
                            {selectedProductionInsight?.supply || "T-shirt supply not confirmed yet"}
                          </p>
                        </div>
                        <div className={`${getStepSurfaceClass("print_start", subtleCardClass)} p-3 sm:p-4`}>
                          <Printer className="h-5 w-5 text-cyan-700" />
                          <p className={`mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] sm:mt-3 sm:text-[11px] sm:tracking-[0.14em] ${getStepMutedClass("print_start")}`}>
                            Print status
                          </p>
                          <p className={`mt-1.5 text-sm font-semibold leading-5 sm:mt-2 ${getStepTextClass("print_start", strongTextClass)}`}>
                            {PARTNER_PRODUCTION_STATUS_LABELS[selected.partner.productionStatus]}
                          </p>
                        </div>
                        <div className={`${getStepSurfaceClass("print_start", subtleCardClass)} p-3 sm:p-4`}>
                          <TimerReset className="h-5 w-5 text-amber-600" />
                          <p className={`mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] sm:mt-3 sm:text-[11px] sm:tracking-[0.14em] ${getStepMutedClass("print_start")}`}>
                            Deadline
                          </p>
                          <p className={`mt-1.5 text-sm font-semibold leading-5 sm:mt-2 ${getStepTextClass("print_start", strongTextClass)}`}>
                            {selectedDeadlineInsight?.label || "No deadline shared"}
                          </p>
                          <p className={`mt-1 text-xs ${getStepMutedClass("print_start")}`}>
                            {selectedDeadlineInsight?.helper || "No countdown available."}
                          </p>
                        </div>
                      </div>
                      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                        <div className="grid gap-2.5 sm:gap-3 md:grid-cols-[minmax(0,1fr)_11rem]">
                          <div className={`${getStepSurfaceClass("print_start", subtleCardClass)} p-3 sm:p-4`}>
                            <div className="flex items-center justify-between gap-3">
                              <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-[11px] sm:tracking-[0.14em] ${getStepMutedClass("print_start")}`}>
                                Production progress
                              </p>
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${workflowToneClass[selectedProductionInsight?.tone || "neutral"]}`}>
                                {selectedProductionInsight?.progress || 0}%
                              </span>
                            </div>
                            <div className={`mt-3 h-3 overflow-hidden rounded-full ${isDark ? "bg-slate-950" : "bg-slate-100"}`}>
                              <div
                                className="h-full rounded-full bg-orange-500 transition-all"
                                style={{ width: `${selectedProductionInsight?.progress || 0}%` }}
                              />
                            </div>
                            <p className={`mt-2 text-sm leading-5 sm:mt-3 sm:leading-6 ${getStepMutedClass("print_start")}`}>
                              {selectedProductionInsight?.helper}
                            </p>
                          </div>
                          <div className={`rounded-2xl border p-4 ${selectedCanPrint ? workflowToneClass.info : workflowToneClass.warning}`}>
                            <LockKeyhole className="h-5 w-5" />
                            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em]">
                              Tanvi gate
                            </p>
                            <p className="mt-2 text-sm font-semibold leading-5">
                              Ask Tanvi before any print work starts.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={`${elevatedCardClass} p-4`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedClass}`}>
                            Deadline pressure
                          </p>
                          <p className={`mt-1 text-sm font-semibold ${strongTextClass}`}>
                            {selectedDeadlineInsight?.daysLeft === null
                              ? "No dated promise to count down."
                              : selectedDeadlineInsight?.label}
                          </p>
                        </div>
                        <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${workflowToneClass[selectedDeadlineInsight?.tone || "neutral"]}`}>
                          {selected.deadline || "No deadline"}
                        </span>
                      </div>
                      <div className={`mt-4 h-4 overflow-hidden rounded-full ${isDark ? "bg-slate-950" : "bg-slate-100"}`}>
                        <div
                          className={`h-full rounded-full transition-all ${
                            selectedDeadlineInsight?.tone === "danger"
                              ? "bg-rose-500"
                              : selectedDeadlineInsight?.tone === "warning"
                                ? "bg-amber-400"
                                : "bg-emerald-500"
                          }`}
                          style={{ width: `${selectedDeadlineInsight?.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              <div className={`${panelClass} p-5`}>
                <div className={`${elevatedCardClass} p-4`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700">
                          General insight
                        </p>
                        <h4 className={`mt-1 text-lg font-semibold ${strongTextClass}`}>
                          Partner workload
                        </h4>
                      </div>
                      <BarChart3 className="h-5 w-5 text-orange-600" />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className={`${subtleCardClass} p-3`}>
                        <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${mutedClass}`}>
                          Visible
                        </p>
                        <p className={`mt-1 text-2xl font-semibold ${strongTextClass}`}>
                          {partnerVisibleTotal}
                        </p>
                      </div>
                      <div className={`${subtleCardClass} p-3`}>
                        <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${mutedClass}`}>
                          Accepted
                        </p>
                        <p className={`mt-1 text-2xl font-semibold ${strongTextClass}`}>
                          {partnerAcceptedTotal}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      {partnerLoads.map(({ partner, count, accepted }) => (
                        <div key={partner.id}>
                          <div className="flex items-center justify-between gap-3">
                            <p className={`text-sm font-semibold ${strongTextClass}`}>
                              {partner.name}
                            </p>
                            <p className={`text-xs ${mutedClass}`}>
                              {accepted}/{count} accepted
                            </p>
                          </div>
                          <div className="mt-2 grid gap-1.5">
                            <div className={`h-2 overflow-hidden rounded-full ${isDark ? "bg-slate-950" : "bg-slate-100"}`}>
                              <div
                                className="h-full rounded-full bg-cyan-500"
                                style={{ width: `${Math.round((count / partnerInsightMax) * 100)}%` }}
                              />
                            </div>
                            <div className={`h-2 overflow-hidden rounded-full ${isDark ? "bg-slate-950" : "bg-slate-100"}`}>
                              <div
                                className="h-full rounded-full bg-emerald-500"
                                style={{ width: `${Math.round((accepted / partnerInsightMax) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-950">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">
                        Acceptance rate
                      </p>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <span className="text-3xl font-semibold">{partnerAcceptedPercent}%</span>
                        <span className="text-xs font-semibold text-orange-800">
                          {partnerAcceptedTotal} accepted from {partnerVisibleTotal} visible jobs
                        </span>
                      </div>
                    </div>
                </div>
              </div>
            </section>
          ) : (
            <section className={`${panelClass} grid min-h-[28rem] place-items-center p-8 text-center`}>
              <div>
                <FileText className="mx-auto h-10 w-10 text-slate-400" />
                <h2 className="mt-4 text-xl font-semibold">No quotations loaded</h2>
                <p className={`mt-2 text-sm ${mutedClass}`}>
                  {loading ? "Loading Tanvi desk..." : "No quotation records are available."}
                </p>
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
    {zoomArtwork ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3"
        role="dialog"
        aria-modal="true"
        aria-label="Artwork zoom preview"
        onClick={() => setZoomArtwork(null)}
      >
        <div
          className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">
                {zoomArtwork.filename || "Artwork preview"}
              </p>
              <p className="text-xs text-slate-500">
                {zoomArtwork.label}
                {formatFileSize(zoomArtwork.size) ? ` - ${formatFileSize(zoomArtwork.size)}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setZoomArtwork(null)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
              aria-label="Close artwork preview"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 bg-slate-950 p-2">
            {isArtworkImage(zoomArtwork) ? (
              <ArtworkImagePreview
                src={zoomArtwork.url}
                alt={zoomArtwork.filename}
                className="h-[78vh] w-full rounded-xl bg-black object-contain"
                isDark
              />
            ) : isArtworkPdf(zoomArtwork) ? (
              <iframe
                src={zoomArtwork.url}
                title={`Preview ${zoomArtwork.filename || "PDF artwork"}`}
                className="h-[78vh] w-full rounded-xl bg-white"
              />
            ) : (
              <div className="grid min-h-[50vh] place-items-center rounded-xl bg-white p-6 text-center">
                <div>
                  <FileText className="mx-auto h-8 w-8 text-cyan-700" />
                  <p className="mt-3 text-sm font-semibold text-slate-950">
                    Preview unavailable
                  </p>
                  <a
                    href={zoomArtwork.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open file
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
