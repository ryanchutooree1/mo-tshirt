"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  doc,
  getDoc,
  runTransaction,
  updateDoc,
  deleteDoc,
  Query,
  QueryDocumentSnapshot,
  DocumentData,
  Timestamp,
  QueryConstraint,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  FiSearch,
  FiPrinter,
  FiCheckCircle,
  FiTrash2,
  FiRefreshCw,
  FiDollarSign,
  FiClock,
  FiUsers,
  FiTrendingUp,
  FiShield,
  FiFileText,
  FiSend,
  FiChevronRight,
  FiPlus,
} from "react-icons/fi";
import jsPDF from "jspdf";

type ProductLine = {
  product: string;
  color?: string;
  size?: string;
  quantity: number;
  unitPrice?: number;
  price?: number;
};

type OrderDocumentType = "quotation" | "invoice" | "partial_receipt" | "receipt";

type OrderDocumentLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  color?: string;
  size?: string;
};

type OrderDocumentProfile = {
  documentType: OrderDocumentType;
  documentNumber: string;
  documentDate: string;
  validUntil: string;
  paymentStatus: string;
  preparedBy: string;
  currency: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientCompany: string;
  clientAddress: string;
  clientBrn: string;
  clientVat: string;
  deliveryFee: number;
  discount: number;
  amountReceived: number;
  notes: string;
  terms: string;
  showLineItems: boolean;
  lines: OrderDocumentLine[];
};

type Txn = {
  invoiceNumber?: string;
  customerName?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  transactionDate?: Timestamp;
  status?: "In Process" | "Urgent" | "Completed" | "Pending" | string;
  paymentMethod?: "Full Payment" | "Part Payment" | string;
  products?: ProductLine[];
  amount?: number;
  quoteId?: string;
  source?: string;
  documentProfile?: Partial<OrderDocumentProfile>;
};

const PAGE_SIZE = 20;
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin";
const DEFAULT_PREPARED_BY = "Mo T-Shirt Team";
const ORDER_WORKFLOW = ["Pending", "In Process", "Completed", "Delivered"] as const;
const ORDER_WORKFLOW_VISUAL = ["In Process", "Completed", "Delivered"] as const;
const ORDER_DOC_FLOW: OrderDocumentType[] = ["quotation", "invoice", "partial_receipt", "receipt"];
const ORDER_STATUS_OPTIONS = [
  "Select Status",
  "Pending",
  "In Process",
  "Urgent",
  "Completed",
  "Delivered",
  "Cancelled",
];
const ORDER_PAYMENT_OPTIONS = ["Select Payment Status", "Full Payment", "Part Payment", "Unpaid"];

const BUSINESS_INFO = {
  name: "MO T-SHIRT",
  addressLines: ["School Lane", "Surinam, 60907"],
  phone: "+230 5988 3880",
  brn: "I20009899",
};

const PAYMENT_DETAILS = {
  payee: "Manavshree Chutooree",
  bankName: "SBM BANK",
  accountNumber: "50300001273751",
};

const ORDER_DOC_LABELS: Record<OrderDocumentType, string> = {
  quotation: "Quotation",
  invoice: "Invoice",
  partial_receipt: "Partial Receipt",
  receipt: "Receipt",
};

const ORDER_DOC_PREFIX: Record<OrderDocumentType, string> = {
  quotation: "Q",
  invoice: "INV",
  partial_receipt: "PR",
  receipt: "RCPT",
};

const ORDER_DOC_TERMS: Record<OrderDocumentType, string> = {
  quotation: [
    "This quotation is provided for information purposes only and is valid for a limited period.",
    "Prices may change if quantities, specifications, or deadlines are modified.",
    "Production starts after written client approval of this quotation.",
    "MO T-SHIRT is not VAT-registered. This quotation is not subject to VAT.",
  ].join("\n"),
  invoice: [
    "A 50% advance payment is required to start production.",
    "Remaining balance is due before delivery or collection.",
    "Late payments may delay production and dispatch.",
    "MO T-SHIRT is not VAT-registered. This invoice is not subject to VAT.",
  ].join("\n"),
  partial_receipt: [
    "This receipt confirms partial payment received by MO T-SHIRT.",
    "Remaining balance must be settled before delivery or collection.",
    "This receipt is proof of advance payment only.",
  ].join("\n"),
  receipt: [
    "This receipt confirms full payment received by MO T-SHIRT.",
    "No outstanding balance remains for this order.",
    "This receipt serves as official proof of payment.",
  ].join("\n"),
};

const safeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toIsoDate = (date: Date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDaysIso = (isoDate: string, days: number) => {
  const start = new Date(isoDate);
  if (Number.isNaN(start.getTime())) return toIsoDate(new Date());
  start.setDate(start.getDate() + days);
  return toIsoDate(start);
};

const formatMoney = (value: number, currency = "Rs") => {
  const amount = safeNumber(value, 0);
  const sign = amount < 0 ? "-" : "";
  return `${sign}${currency} ${Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const getDefaultPaymentStatus = (docType: OrderDocumentType) => {
  if (docType === "quotation") return "Quotation only";
  if (docType === "invoice") return "Unpaid";
  if (docType === "partial_receipt") return "Partially paid";
  return "Paid";
};

const isOrderDocumentType = (value: unknown): value is OrderDocumentType =>
  value === "quotation" || value === "invoice" || value === "partial_receipt" || value === "receipt";

const isCompletedLikeStatus = (status: string) => status === "Completed" || status === "Delivered";

const getNextWorkflowStatus = (status: string) => {
  const index = ORDER_WORKFLOW.findIndex((item) => item === status);
  if (index === -1) return ORDER_WORKFLOW[0];
  return ORDER_WORKFLOW[Math.min(index + 1, ORDER_WORKFLOW.length - 1)];
};

const getWorkflowVisualIndex = (status: string) => {
  if (status === "Delivered") return 2;
  if (status === "Completed") return 1;
  if (status === "In Process" || status === "Urgent") return 0;
  return -1;
};

const getFlowStepState = (
  currentIndex: number,
  stepIndex: number
): "done" | "active" | "upcoming" => {
  if (currentIndex < 0) return "upcoming";
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "active";
  return "upcoming";
};

const withDocumentTypeDefaults = (
  base: OrderDocumentProfile,
  nextType: OrderDocumentType
): OrderDocumentProfile => {
  if (base.documentType === nextType) return base;
  const suffix = base.documentNumber.split("-").slice(1).join("-") || "00001";
  return {
    ...base,
    documentType: nextType,
    documentNumber: `${ORDER_DOC_PREFIX[nextType]}-${suffix}`,
    paymentStatus: getDefaultPaymentStatus(nextType),
    terms: ORDER_DOC_TERMS[nextType],
  };
};

const normalizeDocumentLines = (
  lines: OrderDocumentLine[] | undefined,
  fallbackProducts: ProductLine[] | undefined
) => {
  if (Array.isArray(lines) && lines.length) {
    return lines.map((line) => ({
      description: line.description || "Custom item",
      quantity: Math.max(1, safeNumber(line.quantity, 1)),
      unitPrice: Math.max(0, safeNumber(line.unitPrice, 0)),
      color: line.color || "",
      size: line.size || "",
    }));
  }

  return (fallbackProducts || []).map((product) => {
    const quantity = Math.max(1, safeNumber(product.quantity, 1));
    const unitPrice = product.unitPrice != null
      ? Math.max(0, safeNumber(product.unitPrice, 0))
      : quantity > 0
        ? Math.max(0, safeNumber(product.price, 0) / quantity)
        : 0;
    return {
      description: product.product || "Custom item",
      quantity,
      unitPrice,
      color: product.color || "",
      size: product.size || "",
    };
  });
};

const buildOrderDocumentDraft = (txnId: string, txn: Txn): OrderDocumentProfile => {
  const createdAt = txn.transactionDate?.toDate?.() || new Date();
  const baseDate = toIsoDate(createdAt);
  const profile = txn.documentProfile || {};
  const documentType = isOrderDocumentType(profile.documentType) ? profile.documentType : "invoice";
  const fallbackNumber = txn.invoiceNumber?.trim() || `${ORDER_DOC_PREFIX[documentType]}-${txnId.slice(-5).toUpperCase()}`;
  const lines = normalizeDocumentLines(profile.lines as OrderDocumentLine[] | undefined, txn.products);
  const paymentStatusFromPaymentMethod =
    txn.paymentMethod === "Full Payment"
      ? "Paid"
      : txn.paymentMethod === "Part Payment"
        ? "Partially paid"
        : getDefaultPaymentStatus(documentType);
  const documentDate = typeof profile.documentDate === "string" && profile.documentDate ? profile.documentDate : baseDate;

  return {
    documentType,
    documentNumber: typeof profile.documentNumber === "string" && profile.documentNumber ? profile.documentNumber : fallbackNumber,
    documentDate,
    validUntil:
      typeof profile.validUntil === "string" && profile.validUntil
        ? profile.validUntil
        : addDaysIso(documentDate, 7),
    paymentStatus:
      typeof profile.paymentStatus === "string" && profile.paymentStatus
        ? profile.paymentStatus
        : paymentStatusFromPaymentMethod,
    preparedBy:
      typeof profile.preparedBy === "string" && profile.preparedBy
        ? profile.preparedBy
        : DEFAULT_PREPARED_BY,
    currency:
      typeof profile.currency === "string" && profile.currency ? profile.currency : "Rs",
    clientName:
      typeof profile.clientName === "string" && profile.clientName
        ? profile.clientName
        : txn.customerName || "",
    clientEmail:
      typeof profile.clientEmail === "string" && profile.clientEmail
        ? profile.clientEmail
        : txn.email || "",
    clientPhone:
      typeof profile.clientPhone === "string" && profile.clientPhone
        ? profile.clientPhone
        : txn.phoneNumber || "",
    clientCompany:
      typeof profile.clientCompany === "string" && profile.clientCompany
        ? profile.clientCompany
        : txn.customerName || "",
    clientAddress:
      typeof profile.clientAddress === "string" && profile.clientAddress
        ? profile.clientAddress
        : txn.address || "",
    clientBrn: typeof profile.clientBrn === "string" ? profile.clientBrn : "",
    clientVat: typeof profile.clientVat === "string" ? profile.clientVat : "",
    deliveryFee: safeNumber(profile.deliveryFee, 0),
    discount: safeNumber(profile.discount, 0),
    amountReceived: safeNumber(profile.amountReceived, 0),
    notes: typeof profile.notes === "string" ? profile.notes : "",
    terms:
      typeof profile.terms === "string" && profile.terms
        ? profile.terms
        : ORDER_DOC_TERMS[documentType],
    showLineItems:
      typeof profile.showLineItems === "boolean" ? profile.showLineItems : true,
    lines,
  };
};

function buildOrderDocumentPdf(txnId: string, draft: OrderDocumentProfile) {
  const docPdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = docPdf.internal.pageSize.getWidth();
  const pageHeight = docPdf.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const accent = { r: 250, g: 115, b: 35 };
  const docTitle = ORDER_DOC_LABELS[draft.documentType];
  const dateRaw = new Date(draft.documentDate);
  const docDate = Number.isNaN(dateRaw.getTime()) ? new Date() : dateRaw;
  const validUntilRaw = new Date(draft.validUntil);
  const validUntil = Number.isNaN(validUntilRaw.getTime()) ? new Date(docDate.getTime() + 7 * 86400000) : validUntilRaw;

  const lineTotals = draft.lines.map((line) => ({
    ...line,
    lineTotal: safeNumber(line.quantity, 0) * safeNumber(line.unitPrice, 0),
  }));
  const subtotal = lineTotals.reduce((sum, line) => sum + line.lineTotal, 0);
  const deliveryFee = safeNumber(draft.deliveryFee, 0);
  const discount = safeNumber(draft.discount, 0);
  const amountReceived = safeNumber(draft.amountReceived, 0);
  const grandTotal = subtotal + deliveryFee - discount;
  const balanceDue = Math.max(0, grandTotal - amountReceived);

  docPdf.setFillColor(accent.r, accent.g, accent.b);
  docPdf.rect(margin, 24, contentWidth, 4, "F");

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(20);
  docPdf.setTextColor(accent.r, accent.g, accent.b);
  docPdf.text(BUSINESS_INFO.name, margin, 64);

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(10);
  docPdf.setTextColor(70);
  BUSINESS_INFO.addressLines.forEach((line, index) => {
    docPdf.text(line, margin, 82 + index * 13);
  });
  docPdf.text(`Tel: ${BUSINESS_INFO.phone}`, margin, 108);
  docPdf.text(`BRN: ${BUSINESS_INFO.brn}`, margin, 122);

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(22);
  docPdf.setTextColor(accent.r, accent.g, accent.b);
  docPdf.text(docTitle, pageWidth - margin, 66, { align: "right" });
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(10);
  docPdf.setTextColor(95);
  docPdf.text(`No ${draft.documentNumber || txnId}`, pageWidth - margin, 84, { align: "right" });
  docPdf.text(`Date ${docDate.toLocaleDateString("en-GB")}`, pageWidth - margin, 98, { align: "right" });
  if (draft.documentType === "quotation") {
    docPdf.text(`Valid until ${validUntil.toLocaleDateString("en-GB")}`, pageWidth - margin, 112, { align: "right" });
  }
  docPdf.text(`Status: ${draft.paymentStatus || getDefaultPaymentStatus(draft.documentType)}`, pageWidth - margin, 126, {
    align: "right",
  });
  docPdf.text(`Prepared by: ${draft.preparedBy || DEFAULT_PREPARED_BY}`, pageWidth - margin, 140, { align: "right" });

  let y = 178;
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(11);
  docPdf.setTextColor(accent.r, accent.g, accent.b);
  docPdf.text(`${docTitle} for`, margin, y);
  y += 21;

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(14);
  docPdf.setTextColor(20);
  docPdf.text(draft.clientCompany || draft.clientName || "Client", margin, y);
  y += 18;

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(10);
  docPdf.setTextColor(70);
  if (draft.clientName) {
    docPdf.text(`Contact: ${draft.clientName}`, margin, y);
    y += 14;
  }
  if (draft.clientEmail) {
    docPdf.text(`Email: ${draft.clientEmail}`, margin, y);
    y += 14;
  }
  if (draft.clientPhone) {
    docPdf.text(`Phone: ${draft.clientPhone}`, margin, y);
    y += 14;
  }
  if (draft.clientAddress) {
    const addressLines = docPdf.splitTextToSize(`Address: ${draft.clientAddress}`, contentWidth - 10);
    docPdf.text(addressLines, margin, y);
    y += addressLines.length * 13;
  }
  if (draft.clientBrn) {
    docPdf.text(`BRN: ${draft.clientBrn}`, margin, y);
    y += 14;
  }
  if (draft.clientVat) {
    docPdf.text(`VAT: ${draft.clientVat}`, margin, y);
    y += 14;
  }

  y += 8;
  docPdf.setDrawColor(145);
  docPdf.line(margin, y, pageWidth - margin, y);
  y += 20;

  const descWidth = draft.showLineItems ? contentWidth - 220 : contentWidth - 100;
  const colQtyX = pageWidth - margin - 180;
  const colUnitX = pageWidth - margin - 92;
  const colTotalX = pageWidth - margin;

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(10);
  docPdf.setTextColor(accent.r, accent.g, accent.b);
  docPdf.text("Description", margin, y);
  if (draft.showLineItems) {
    docPdf.text("Qty", colQtyX, y, { align: "right" });
    docPdf.text("Unit", colUnitX, y, { align: "right" });
  }
  docPdf.text("Total", colTotalX, y, { align: "right" });
  y += 16;

  docPdf.setFont("helvetica", "normal");
  docPdf.setTextColor(30);
  const rowPadding = 5;
  for (const line of lineTotals) {
    const label = `${line.description}${line.color || line.size ? ` (${[line.color, line.size].filter(Boolean).join("/")})` : ""}`;
    const wrapped = docPdf.splitTextToSize(label, descWidth);
    const rowHeight = Math.max(26, wrapped.length * 13 + rowPadding * 2);
    if (y + rowHeight > pageHeight - 170) {
      docPdf.addPage();
      y = 40;
    }
    docPdf.setFillColor(246, 247, 249);
    docPdf.rect(margin, y - rowPadding - 3, contentWidth, rowHeight, "F");
    docPdf.text(wrapped, margin + 6, y + 6);
    if (draft.showLineItems) {
      docPdf.text(String(line.quantity), colQtyX, y + 6, { align: "right" });
      docPdf.text(formatMoney(line.unitPrice, draft.currency), colUnitX, y + 6, { align: "right" });
    }
    docPdf.text(formatMoney(line.lineTotal, draft.currency), colTotalX, y + 6, { align: "right" });
    y += rowHeight + 6;
  }

  y += 2;
  if (y > pageHeight - 190) {
    docPdf.addPage();
    y = 40;
  }
  docPdf.setDrawColor(150);
  docPdf.line(margin, y, pageWidth - margin, y);
  y += 18;
  docPdf.setFont("helvetica", "normal");
  docPdf.setTextColor(50);
  docPdf.text("Subtotal", pageWidth - margin - 150, y);
  docPdf.text(formatMoney(subtotal, draft.currency), colTotalX, y, { align: "right" });
  if (deliveryFee > 0) {
    y += 16;
    docPdf.text("Delivery fee", pageWidth - margin - 150, y);
    docPdf.text(formatMoney(deliveryFee, draft.currency), colTotalX, y, { align: "right" });
  }
  if (discount > 0) {
    y += 16;
    docPdf.setTextColor(170, 25, 25);
    docPdf.text("Discount", pageWidth - margin - 150, y);
    docPdf.text(formatMoney(-discount, draft.currency), colTotalX, y, { align: "right" });
    docPdf.setTextColor(50);
  }
  y += 20;
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(12);
  docPdf.setTextColor(20);
  docPdf.text("Grand Total", pageWidth - margin - 150, y);
  docPdf.text(formatMoney(grandTotal, draft.currency), colTotalX, y, { align: "right" });

  if (draft.documentType === "partial_receipt") {
    y += 18;
    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(10);
    docPdf.text("Amount received", pageWidth - margin - 150, y);
    docPdf.text(formatMoney(amountReceived, draft.currency), colTotalX, y, { align: "right" });
    y += 14;
    docPdf.setFont("helvetica", "bold");
    docPdf.text("Balance due", pageWidth - margin - 150, y);
    docPdf.text(formatMoney(balanceDue, draft.currency), colTotalX, y, { align: "right" });
  }

  y += 24;
  if (y > pageHeight - 130) {
    docPdf.addPage();
    y = 44;
  }
  docPdf.setFillColor(accent.r, accent.g, accent.b);
  docPdf.rect(margin, y, contentWidth, 17, "F");
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(10);
  docPdf.setTextColor(255);
  docPdf.text("TERMS AND CONDITIONS", margin + 6, y + 12);
  y += 28;

  docPdf.setFont("helvetica", "normal");
  docPdf.setTextColor(35);
  const termLines = docPdf.splitTextToSize(draft.terms || ORDER_DOC_TERMS[draft.documentType], contentWidth - 10);
  docPdf.text(termLines, margin + 4, y);
  y += termLines.length * 13 + 16;

  docPdf.setFont("helvetica", "bold");
  docPdf.setTextColor(accent.r, accent.g, accent.b);
  docPdf.text("Payment Details", margin, y);
  y += 14;
  docPdf.setFont("helvetica", "normal");
  docPdf.setTextColor(50);
  docPdf.text(`Payee: ${PAYMENT_DETAILS.payee}`, margin, y);
  y += 13;
  docPdf.text(`Bank: ${PAYMENT_DETAILS.bankName}`, margin, y);
  y += 13;
  docPdf.text(`Account No: ${PAYMENT_DETAILS.accountNumber}`, margin, y);

  return docPdf;
}

function OrdersPageInner() {
  const searchParams = useSearchParams();
  // filters / ui
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [paymentFilter, setPaymentFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>(""); // yyyy-mm-dd
  const [dateTo, setDateTo] = useState<string>(""); // yyyy-mm-dd
  const [activeTab, setActiveTab] = useState<"all" | "completed">("all");

  // list + paging
  const [rows, setRows] = useState<QueryDocumentSnapshot<DocumentData>[]>([]);
  const [lastDocSnap, setLastDocSnap] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // summary
  const [summary, setSummary] = useState({
    todayRevenue: 0,
    pendingOrders: 0,
    deliveredToday: 0,
    repeatClients: 0,
    efficiencyValue: 0,
  });

  // local UI overrides (e.g., status/payment changed without refetch)
  const [overrides, setOverrides] = useState<Record<string, Partial<Txn>>>({});

  // per-row expand state
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editTxnId, setEditTxnId] = useState<string | null>(null);
  const [editIndex, setEditIndex] = useState<number>(-1);
  const [editValue, setEditValue] = useState<ProductLine | null>(null);

  // document studio
  const [docStudioOpen, setDocStudioOpen] = useState(false);
  const [docTxnId, setDocTxnId] = useState<string | null>(null);
  const [docDraft, setDocDraft] = useState<OrderDocumentProfile | null>(null);
  const [docSaving, setDocSaving] = useState(false);

  // toast
  const [toast, setToast] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(t: { type: "ok" | "err"; text: string }) {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current!);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  // debounce search
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim().toLowerCase()), 350);
    return () => clearTimeout(id);
  }, [search]);

  const formatIsoDate = (date: Date) => date.toISOString().slice(0, 10);
  const applyQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    if (days > 0) start.setDate(end.getDate() - (days - 1));
    setDateFrom(formatIsoDate(start));
    setDateTo(formatIsoDate(end));
  };

  const activeFilters = useMemo(() => {
    const list: string[] = [];
    if (search.trim()) list.push(`Search: ${search.trim()}`);
    if (statusFilter) list.push(`Status: ${statusFilter}`);
    if (paymentFilter) list.push(`Payment: ${paymentFilter}`);
    if (dateFrom || dateTo) {
      const from = dateFrom || "Any";
      const to = dateTo || "Any";
      list.push(`Dates: ${from} → ${to}`);
    }
    if (activeTab === "completed") list.push("Tab: Completed");
    return list;
  }, [search, statusFilter, paymentFilter, dateFrom, dateTo, activeTab]);

  // initialize filters from URL (status, range)
  useEffect(() => {
    const s = searchParams?.get("status");
    const range = searchParams?.get("range");
    if (s) setStatusFilter(s);
    if (range === "today") {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const iso = `${yyyy}-${mm}-${dd}`;
      setDateFrom(iso);
      setDateTo(iso);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // initial + whenever filters change
  useEffect(() => {
    (async () => {
      setLoading(true);
      setRows([]);
      setLastDocSnap(null);
      setHasMore(true);
      await loadMore(true);
      setLoading(false);
      fetchSummaryApprox();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, statusFilter, paymentFilter, dateFrom, dateTo, activeTab]);

  async function loadMore(reset = false) {
    if (!hasMore && !reset) return;
    setLoadingMore(true);
    try {
      const q = buildQuery(reset);
      const snap = await getDocs(q);
      const docs = snap.docs;

      if (reset) {
        setRows(docs);
      } else {
        setRows((prev) => [...prev, ...docs]);
      }

      if (docs.length < PAGE_SIZE) setHasMore(false);
      setLastDocSnap(docs.length ? docs[docs.length - 1] : null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Load failed";
      showToast({ type: "err", text: msg });
    } finally {
      setLoadingMore(false);
    }
  }

  function buildQuery(reset: boolean): Query<DocumentData> {
    const col = collection(db, "transactions");
    const parts: QueryConstraint[] = [orderBy("transactionDate", "desc")];

    // server-side filters possible for status / payment
    if (statusFilter) parts.push(where("status", "==", statusFilter));
    if (paymentFilter) parts.push(where("paymentMethod", "==", paymentFilter));

    // date range (if set)
    if (dateFrom) {
      parts.push(
        where("transactionDate", ">=", Timestamp.fromDate(new Date(dateFrom)))
      );
    }
    if (dateTo) {
      // include end day
      const end = new Date(dateTo);
      end.setDate(end.getDate() + 1);
      parts.push(where("transactionDate", "<", Timestamp.fromDate(end)));
    }

    // base query with limit
    if (!reset && lastDocSnap) {
      return query(col, ...parts, startAfter(lastDocSnap), limit(PAGE_SIZE));
    }
    return query(col, ...parts, limit(PAGE_SIZE));
  }

  // client-side filter for search + tab
  const visibleRows = useMemo(() => {
    const filtered = rows.filter((d) => {
      const m = d.data() as Txn;
      const matchesTab = activeTab === "all" ? true : isCompletedLikeStatus(m.status || "");
      if (!matchesTab) return false;
      if (!debounced) return true;
      const bag = `${m.customerName ?? ""} ${m.phoneNumber ?? ""} ${
        m.email ?? ""
      }`.toLowerCase();
      return bag.includes(debounced);
    });
    return filtered;
  }, [rows, debounced, activeTab]);

  // summary (approx: last 100 docs)
  async function fetchSummaryApprox() {
    try {
      const snap = await getDocs(
        query(
          collection(db, "transactions"),
          orderBy("transactionDate", "desc"),
          limit(100)
        )
      );
      let rev = 0,
        pending = 0,
        deliveredToday = 0,
        completed = 0,
        total = 0;
      const clients = new Set<string>();
      const todayStr = new Date().toISOString().slice(0, 10);

      snap.forEach((d) => {
        const m = d.data() as Txn;
        const amount =
          typeof m.amount === "number"
            ? m.amount
            : Array.isArray(m.products)
            ? m.products.reduce((s: number, p: ProductLine) => s + (p.price || 0), 0)
            : 0;
        rev += amount;

        if (m.status === "Pending" || m.status === "In Process" || m.status === "Urgent") pending++;
        if (isCompletedLikeStatus(m.status || "")) completed++;

        const date = (m.transactionDate?.toDate?.() as Date) || new Date();
        const ds = date.toISOString().slice(0, 10);
        if (isCompletedLikeStatus(m.status || "") && ds === todayStr) deliveredToday++;

        const who = m.customerName || m.phoneNumber || m.email;
        if (who) clients.add(String(who));
        total++;
      });

      setSummary({
        todayRevenue: rev,
        pendingOrders: pending,
        deliveredToday,
        repeatClients: clients.size,
        efficiencyValue: total ? Math.round((completed / total) * 100) : 0,
      });
    } catch {
      /* ignore */
    }
  }

  // helpers
  function currency(n: number) {
    return `Rs ${n.toFixed(2)}`;
  }

  async function confirmPassword(): Promise<boolean> {
    // quick inline prompt; replace with a fancy modal if you like
    const pw = window.prompt("Enter admin password to confirm");
    return (pw || "") === ADMIN_PASSWORD;
  }

  // actions: delete (txn + account)
  async function deleteTxn(id: string) {
    const ok = await confirmPassword();
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "transactions", id));
      await deleteDoc(doc(db, "account", id));
      setRows((prev) => prev.filter((d) => d.id !== id));
      showToast({ type: "ok", text: "Transaction deleted" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      showToast({ type: "err", text: msg });
    }
  }

  // actions: update status/payment on both collections if account doc exists
  async function updateStatus(id: string, status: string) {
    if (!status || status === "Select Status") return;
    try {
      await updateDoc(doc(db, "transactions", id), { status });
      const accRef = doc(db, "account", id);
      const acc = await getDoc(accRef);
      if (acc.exists()) await updateDoc(accRef, { status });
      showToast({ type: "ok", text: "Status updated" });
      setOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), status } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Update failed";
      showToast({ type: "err", text: msg });
    }
  }

  async function updatePayment(id: string, paymentMethod: string) {
    if (!paymentMethod || paymentMethod === "Select Payment Status") return;
    try {
      await updateDoc(doc(db, "transactions", id), { paymentMethod });
      const accRef = doc(db, "account", id);
      const acc = await getDoc(accRef);
      if (acc.exists()) await updateDoc(accRef, { paymentMethod });
      showToast({ type: "ok", text: "Payment updated" });
      setOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), paymentMethod } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Update failed";
      showToast({ type: "err", text: msg });
    }
  }

  async function advanceWorkflowStatus(id: string, currentStatus: string) {
    const nextStatus = getNextWorkflowStatus(currentStatus || "Pending");
    if (nextStatus === currentStatus) {
      showToast({ type: "ok", text: "Order is already at the last workflow stage." });
      return;
    }
    await updateStatus(id, nextStatus);
  }

  function openDocumentStudio(txnId: string, txn: Txn) {
    setDocTxnId(txnId);
    setDocDraft(buildOrderDocumentDraft(txnId, txn));
    setDocStudioOpen(true);
  }

  function openDocumentStudioWithType(txnId: string, txn: Txn, docType: OrderDocumentType) {
    const base = buildOrderDocumentDraft(txnId, txn);
    setDocTxnId(txnId);
    setDocDraft(withDocumentTypeDefaults(base, docType));
    setDocStudioOpen(true);
  }

  function updateDocLine(index: number, patch: Partial<OrderDocumentLine>) {
    setDocDraft((prev) => {
      if (!prev) return prev;
      const nextLines = prev.lines.slice();
      if (!nextLines[index]) return prev;
      nextLines[index] = { ...nextLines[index], ...patch };
      return { ...prev, lines: nextLines };
    });
  }

  function addDocLine() {
    setDocDraft((prev) =>
      prev
        ? {
            ...prev,
            lines: [...prev.lines, { description: "Custom item", quantity: 1, unitPrice: 0, color: "", size: "" }],
          }
        : prev
    );
  }

  function removeDocLine(index: number) {
    setDocDraft((prev) =>
      prev
        ? {
            ...prev,
            lines: prev.lines.filter((_, i) => i !== index),
          }
        : prev
    );
  }

  function setDocType(nextType: OrderDocumentType) {
    setDocDraft((prev) => {
      if (!prev) return prev;
      return withDocumentTypeDefaults(prev, nextType);
    });
  }

  const docTotals = useMemo(() => {
    if (!docDraft) return { subtotal: 0, total: 0, balanceDue: 0 };
    const subtotal = docDraft.lines.reduce(
      (sum, line) => sum + safeNumber(line.quantity, 0) * safeNumber(line.unitPrice, 0),
      0
    );
    const total = subtotal + safeNumber(docDraft.deliveryFee, 0) - safeNumber(docDraft.discount, 0);
    const balanceDue = Math.max(0, total - safeNumber(docDraft.amountReceived, 0));
    return { subtotal, total, balanceDue };
  }, [docDraft]);

  function openDocumentPreview() {
    if (!docDraft || !docTxnId) return;
    const pdf = buildOrderDocumentPdf(docTxnId, docDraft);
    const url = pdf.output("bloburl");
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function downloadDocumentPdf() {
    if (!docDraft || !docTxnId) return;
    const pdf = buildOrderDocumentPdf(docTxnId, docDraft);
    pdf.save(`${docDraft.documentType.replace(/_/g, "-")}-${docDraft.documentNumber || docTxnId}.pdf`);
  }

  async function saveDocumentProfile() {
    if (!docDraft || !docTxnId) return;
    setDocSaving(true);
    try {
      await updateDoc(doc(db, "transactions", docTxnId), {
        documentProfile: {
          ...docDraft,
          updatedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });
      setOverrides((prev) => ({
        ...prev,
        [docTxnId]: {
          ...(prev[docTxnId] || {}),
          documentProfile: docDraft,
        },
      }));
      showToast({ type: "ok", text: "Document profile saved to order." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save document profile.";
      showToast({ type: "err", text: msg });
    } finally {
      setDocSaving(false);
    }
  }

  // actions: mark completed & adjust inventory (supports simple qty OR colors->sizes)
  async function markCompletedAndAdjust(id: string) {
    try {
      await runTransaction(db, async (t) => {
        const txnRef = doc(db, "transactions", id);
        const txSnap = await t.get(txnRef);
        if (!txSnap.exists()) throw new Error("Transaction missing");
        const data = txSnap.data() as Txn;
        const products = data.products || [];

        for (const p of products) {
          const { product, color, size, quantity } = p;
          if (!product || !quantity) continue;
          const prodRef = doc(db, "products", product);
          const prodSnap = await t.get(prodRef);
          if (!prodSnap.exists()) continue;
          const prod = prodSnap.data() as DocumentData;

          if (Array.isArray(prod.colors)) {
            const idx = prod.colors.findIndex((c: { color: string }) => c.color === color);
            if (idx === -1)
              throw new Error(`Color ${color} not found for ${product}`);
            const sizes = { ...(prod.colors[idx].sizes || {}) } as Record<string, number>;
            if (!(size! in sizes))
              throw new Error(`Size ${size} not found for ${product}`);
            const current = Number(sizes[size!]) || 0;
            if (current < quantity)
              throw new Error(
                `Insufficient stock for ${product} ${color}/${size}`
              );
            sizes[size!] = current - quantity;
            prod.colors[idx] = { ...prod.colors[idx], sizes };
            t.update(prodRef, { colors: prod.colors });
          } else if (typeof prod.qty === "number") {
            const current = Number(prod.qty) || 0;
            if (current < quantity)
              throw new Error(`Insufficient stock for ${product}`);
            t.update(prodRef, { qty: current - quantity });
          }
        }

        t.update(txnRef, { status: "Completed" });
        const accRef = doc(db, "account", id);
        const acc = await t.get(accRef);
        if (acc.exists()) t.update(accRef, { status: "Completed" });
      });

      showToast({ type: "ok", text: "Marked completed & inventory adjusted" });
      setOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), status: "Completed" } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not complete";
      showToast({ type: "err", text: msg });
    }
  }

  // edit product line modal
  function openEditLine(txnId: string, index: number, line: ProductLine) {
    setEditTxnId(txnId);
    setEditIndex(index);
    setEditValue({
      ...line,
      unitPrice:
        line.unitPrice ??
        (line.price && line.quantity ? line.price / line.quantity : 0),
    });
    setEditOpen(true);
  }

  async function saveEditLine() {
    if (!editTxnId || editIndex < 0 || !editValue) return;
    const updated = {
      ...editValue,
      price: (editValue.unitPrice || 0) * (editValue.quantity || 0),
    };
    try {
      await runTransaction(db, async (t) => {
        const txnRef = doc(db, "transactions", editTxnId);
        const txSnap = await t.get(txnRef);
        if (!txSnap.exists()) throw new Error("Transaction missing");
        const tx = txSnap.data() as Partial<Txn>;
        const products: ProductLine[] = Array.isArray(tx.products)
          ? [...tx.products]
          : [];
        const old = products[editIndex];
        const oldQty = old?.quantity || 0;
        const newQty = updated.quantity || 0;
        const diff = newQty - oldQty; // +diff means we need to take more stock

        // adjust inventory for the (possibly new) product document
        if (updated.product) {
          const prodRef = doc(db, "products", updated.product);
          const prodSnap = await t.get(prodRef);
          if (prodSnap.exists()) {
            const prod = prodSnap.data() as DocumentData;
            if (Array.isArray(prod.colors)) {
              const idx = prod.colors.findIndex(
                (c: { color: string }) => c.color === updated.color
              );
              if (idx === -1) throw new Error("Color not found");
              const sizes = { ...(prod.colors[idx].sizes || {}) } as Record<string, number>;
              if (!(updated.size! in sizes)) throw new Error("Size not found");
              const current = Number(sizes[updated.size!]) || 0;
              const newStock = current - diff; // subtract positive diff, add back negative
              if (newStock < 0) throw new Error("Insufficient stock for edit");
              sizes[updated.size!] = newStock;
              prod.colors[idx] = { ...prod.colors[idx], sizes };
              t.update(prodRef, { colors: prod.colors });
            } else if (typeof prod.qty === "number") {
              const current = Number(prod.qty) || 0;
              const newStock = current - diff;
              if (newStock < 0) throw new Error("Insufficient stock for edit");
              t.update(prodRef, { qty: newStock });
            }
          }
        }

        products[editIndex] = updated;
        t.update(txnRef, { products });
      });

      showToast({ type: "ok", text: "Product updated" });
      setEditOpen(false);
      setEditTxnId(null);
      setEditIndex(-1);
      setEditValue(null);
      // refresh just that doc in UI
      setRows((prev) => prev.map((d) => (d.id === editTxnId ? d : d)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Update failed";
      showToast({ type: "err", text: msg });
    }
  }

  function quickPreviewInvoice(txnId: string, txn: Txn) {
    const fallback = buildOrderDocumentDraft(txnId, txn);
    const draft: OrderDocumentProfile = {
      ...fallback,
      documentType: "invoice",
      documentNumber: txn.invoiceNumber || fallback.documentNumber,
      paymentStatus:
        fallback.paymentStatus && fallback.paymentStatus !== "Quotation only"
          ? fallback.paymentStatus
          : getDefaultPaymentStatus("invoice"),
      terms: ORDER_DOC_TERMS.invoice,
    };
    const pdf = buildOrderDocumentPdf(txnId, draft);
    pdf.output("dataurlnewwindow");
  }

  // bulk actions
  async function bulkDelete() {
    const ok = await confirmPassword();
    if (!ok) return;
    for (const id of Array.from(selectedIds)) {
      try {
        await deleteDoc(doc(db, "transactions", id));
        await deleteDoc(doc(db, "account", id));
      } catch {
        /* continue */
      }
    }
    setRows((prev) => prev.filter((d) => !selectedIds.has(d.id)));
    setSelectedIds(new Set());
    setSelectMode(false);
    showToast({ type: "ok", text: "Bulk delete done" });
  }

  async function bulkComplete() {
    for (const id of Array.from(selectedIds)) {
      try {
        await markCompletedAndAdjust(id);
      } catch {
        /* continue */
      }
    }
    setSelectedIds(new Set());
    setSelectMode(false);
  }

  function exportVisibleToCSV() {
    const headers = [
      "invoiceNumber",
      "customer",
      "amount",
      "status",
      "payment",
      "date",
    ];
    const rowsCsv = visibleRows.map((d) => {
      const m = d.data() as Txn;
      const dt = (m.transactionDate?.toDate?.() as Date | undefined)?.toISOString?.()?.slice(0, 10) || "";
      const customer = m.customerName || m.phoneNumber || m.email || "";
      const amount = (typeof m.amount === "number"
        ? m.amount
        : Array.isArray(m.products)
        ? m.products.reduce((s, p) => s + (p.price || 0), 0)
        : 0
      ).toFixed(2);
      const vals = [
        m.invoiceNumber || "",
        customer,
        amount,
        m.status || "",
        m.paymentMethod || "",
        dt,
      ];
      return vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const csv = [headers.join(","), ...rowsCsv].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders_visible_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-12rem] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_top,rgba(255,115,0,0.35),transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10rem] top-40 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_top,rgba(14,116,144,0.25),transparent_70%)] blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl space-y-6">
        {/* Header & quick nav */}
        <section
          className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm backdrop-blur"
          style={{ animation: "fadeUp 0.6s ease-out both" }}
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,115,0,0.08),transparent_60%)]"
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-600">
                Order Management
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">
                Order Command Center
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Track, update, and fulfill orders with inventory-safe workflows and clean client handoffs.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-orange-100/70 px-3 py-1 text-xs font-semibold text-orange-700">
                  <FiShield className="h-4 w-4" /> Inventory-safe fulfillment
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  Live status updates
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Clean invoice exports
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/pos"
                className="inline-flex items-center justify-center rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600"
              >
                Open POS
              </Link>
              <Link
                href="/admin/dms"
                className="inline-flex items-center justify-center rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
              >
                DMS
              </Link>
              <button
                onClick={exportVisibleToCSV}
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                Export CSV
              </button>
            </div>
          </div>
        </section>

        {/* Summary Cards */}
        <section
          className="grid grid-cols-2 gap-4 md:grid-cols-5"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.08s" }}
        >
          <Stat label="Today Revenue" value={currency(summary.todayRevenue)} tone="amber" icon={<FiDollarSign className="h-4 w-4" />} />
          <Stat label="Pending Orders" value={summary.pendingOrders} tone="sky" icon={<FiClock className="h-4 w-4" />} />
          <Stat label="Delivered Today" value={summary.deliveredToday} tone="emerald" icon={<FiCheckCircle className="h-4 w-4" />} />
          <Stat label="Repeat Clients" value={summary.repeatClients} tone="violet" icon={<FiUsers className="h-4 w-4" />} />
          <Stat label="Efficiency" value={`${summary.efficiencyValue}%`} tone="slate" icon={<FiTrendingUp className="h-4 w-4" />} />
        </section>

        {/* Filters */}
        <section
          className="sticky top-20 z-10 rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm backdrop-blur"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.14s" }}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <FiSearch className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  placeholder="Search customer, phone, or invoice..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Quick range</span>
                <button
                  onClick={() => applyQuickRange(1)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Today
                </button>
                <button
                  onClick={() => applyQuickRange(7)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  7 days
                </button>
                <button
                  onClick={() => applyQuickRange(30)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  30 days
                </button>
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setSearch("");
                    setDateFrom("");
                    setDateTo("");
                    setStatusFilter("");
                    setPaymentFilter("");
                    setActiveTab("all");
                  }}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                  title="Reset filters"
                >
                  Reset
                </button>
                <button
                  onClick={() => {
                    setActiveTab("all");
                  }}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold shadow-sm transition ${
                    activeTab === "all"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => {
                    setActiveTab("completed");
                  }}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold shadow-sm transition ${
                    activeTab === "completed"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  Completed
                </button>
                <button
                  onClick={() => {
                    setSelectMode((s) => !s);
                    if (selectMode) setSelectedIds(new Set());
                  }}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold shadow-sm transition ${
                    selectMode
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {selectMode ? "Cancel Select" : "Select"}
                </button>
                {selectMode && (
                  <>
                    <button
                      onClick={() => setSelectedIds(new Set(visibleRows.map((d) => d.id)))}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500">From</label>
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500">To</label>
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500">Status</label>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All</option>
                  {ORDER_STATUS_OPTIONS.filter((value) => value !== "Select Status").map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500">Payment</label>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                >
                  <option value="">All</option>
                  {ORDER_PAYMENT_OPTIONS.filter((value) => value !== "Select Payment Status").map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                Showing {visibleRows.length} of {rows.length} loaded
                {hasMore && " • more available"}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeFilters.length === 0 ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                    No filters active
                  </span>
                ) : (
                  activeFilters.map((filter) => (
                    <span key={filter} className="rounded-full border border-slate-200 bg-white px-3 py-1">
                      {filter}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Toast */}
        {toast && (
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-sm ${
              toast.type === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {toast.text}
          </div>
        )}

        {/* List */}
        <div
          className="rounded-3xl border border-slate-200/70 bg-white/90 shadow-sm backdrop-blur"
          style={{ animation: "fadeUp 0.6s ease-out both", animationDelay: "0.2s" }}
        >
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                  <div className="mt-2 h-3 bg-slate-100 rounded w-1/4" />
                </div>
              ))}
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <FiSearch className="h-5 w-5" />
              </div>
              <div className="mt-3 text-base font-semibold text-slate-700">No transactions found.</div>
              <p className="mt-1 text-sm text-slate-500">Try adjusting filters or create a new order.</p>
              <div className="mt-4">
                <Link
                  href="/admin/pos"
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Create a new order in POS
                </Link>
              </div>
            </div>
          ) : (
            <ul className="space-y-3 p-3">
              {visibleRows.map((d) => {
                const base = d.data() as Txn;
                const m = { ...base, ...(overrides[d.id] || {}) } as Txn;
                const id = d.id;
                const dt = m.transactionDate?.toDate?.() as Date | undefined;
                const when = dt
                  ? `${dt.toLocaleDateString()} • ${dt.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : "";
                const total =
                  typeof m.amount === "number"
                    ? m.amount
                    : Array.isArray(m.products)
                    ? m.products.reduce((s, p) => s + (p.price || 0), 0)
                    : 0;
                const currentStatus = m.status || "Pending";
                const nextStatus = getNextWorkflowStatus(currentStatus);
                const workflowVisualIndex = getWorkflowVisualIndex(currentStatus);
                const docProfile = m.documentProfile;
                const docTypeLabel =
                  docProfile && isOrderDocumentType(docProfile.documentType)
                    ? ORDER_DOC_LABELS[docProfile.documentType]
                    : null;
                const activeDocType: OrderDocumentType | null =
                  docProfile && isOrderDocumentType(docProfile.documentType)
                    ? docProfile.documentType
                    : m.quoteId
                      ? "quotation"
                      : "invoice";
                const activeDocFlowIndex = activeDocType ? ORDER_DOC_FLOW.findIndex((item) => item === activeDocType) : -1;

                return (
                  <li
                    key={id}
                    className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 p-4 shadow-sm transition hover:border-orange-200 hover:shadow-md"
                    data-row-id={id}
                    data-row={JSON.stringify({
                      invoiceNumber: m.invoiceNumber,
                      customer: m.customerName || m.phoneNumber || m.email || "",
                      amount: (typeof m.amount === "number"
                        ? m.amount
                        : Array.isArray(m.products)
                        ? m.products.reduce((s, p) => s + (p.price || 0), 0)
                        : 0
                      ).toFixed(2),
                      status: m.status,
                      paymentMethod: m.paymentMethod,
                      date: when,
                    })}
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.18),transparent_70%)]"
                    />
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex items-start gap-4">
                        {selectMode && (
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-200"
                            checked={selectedIds.has(id)}
                            onChange={(e) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(id); else next.delete(id);
                                return next;
                              });
                            }}
                          />
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">
                              Invoice #{m.invoiceNumber || ""}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Order {id.slice(-6).toUpperCase()}
                            </span>
                            <span className="text-xs text-slate-400">{when}</span>
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {m.customerName || m.phoneNumber || m.email || "Unknown Customer"}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {StatusBadge(m.status || "")}
                            {PaymentBadge(m.paymentMethod || "")}
                            <span className="text-xs text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full bg-slate-50">
                              Items: {Array.isArray(m.products) ? m.products.length : 0}
                            </span>
                            {m.quoteId && (
                              <span className="text-xs text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full bg-violet-50">
                                From quotation
                              </span>
                            )}
                            {docTypeLabel && (
                              <span className="text-xs text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full bg-orange-50">
                                Doc profile: {docTypeLabel}
                              </span>
                            )}
                          </div>
                          <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                                Workflow
                              </span>
                              <span className="text-[11px] font-semibold text-slate-600">
                                {workflowVisualIndex >= 0 ? `Next: ${nextStatus}` : "Queue pending"}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              {ORDER_WORKFLOW_VISUAL.map((step, index) => {
                                const state = getFlowStepState(workflowVisualIndex, index);
                                const className =
                                  state === "done"
                                    ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                                    : state === "active"
                                      ? "border-slate-800 bg-slate-900 text-white"
                                      : "border-slate-200 bg-white text-slate-500";
                                return (
                                  <React.Fragment key={`${id}-workflow-${step}`}>
                                    <span className={`rounded-full border px-2.5 py-1 font-semibold ${className}`}>
                                      {step}
                                    </span>
                                    {index < ORDER_WORKFLOW_VISUAL.length - 1 && <FiChevronRight className="text-slate-400" />}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          </div>

                          <div className="mt-2 space-y-2 rounded-xl border border-violet-200/70 bg-violet-50/60 px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-700">
                                Document Flow
                              </span>
                              <span className="text-[11px] font-semibold text-violet-700">
                                {activeDocType ? ORDER_DOC_LABELS[activeDocType] : "Not set"}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              {ORDER_DOC_FLOW.map((docType, index) => {
                                const state = getFlowStepState(activeDocFlowIndex, index);
                                const className =
                                  state === "done"
                                    ? "border-violet-200 bg-violet-100 text-violet-700"
                                    : state === "active"
                                      ? "border-orange-200 bg-orange-100 text-orange-700"
                                      : "border-slate-200 bg-white text-slate-500";
                                return (
                                  <React.Fragment key={`${id}-docflow-${docType}`}>
                                    <span className={`rounded-full border px-2.5 py-1 font-semibold ${className}`}>
                                      {ORDER_DOC_LABELS[docType]}
                                    </span>
                                    {index < ORDER_DOC_FLOW.length - 1 && <FiChevronRight className="text-slate-400" />}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {ORDER_DOC_FLOW.map((docType) => (
                                <button
                                  key={`${id}-docopen-${docType}`}
                                  type="button"
                                  onClick={() => openDocumentStudioWithType(id, m, docType)}
                                  className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700 transition hover:bg-violet-100"
                                >
                                  {ORDER_DOC_LABELS[docType]}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">
                          {currency(total)}
                        </span>
                        <select
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                          value={m.status || "Select Status"}
                          onChange={(e) => updateStatus(id, e.target.value)}
                        >
                          {ORDER_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <select
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                          value={m.paymentMethod || "Select Payment Status"}
                          onChange={(e) => updatePayment(id, e.target.value)}
                        >
                          {ORDER_PAYMENT_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>

                        <button
                          title={nextStatus === currentStatus ? "Order is already at final stage." : "Advance order to next workflow stage"}
                          onClick={() => advanceWorkflowStatus(id, currentStatus)}
                          disabled={nextStatus === currentStatus}
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <FiCheckCircle />
                          Next Stage
                        </button>
                        <button
                          title="Open Document Studio"
                          onClick={() => openDocumentStudio(id, m)}
                          className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-700 shadow-sm transition hover:border-orange-300 hover:bg-orange-100"
                        >
                          <FiFileText />
                          Document Studio
                        </button>
                        <button
                          title="Quick invoice preview"
                          onClick={() => quickPreviewInvoice(id, m)}
                          className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          <FiPrinter />
                        </button>
                        <button
                          title={expanded.has(id) ? "Hide items" : "Show items"}
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return next;
                            })
                          }
                          className={`rounded-full border px-3 py-1.5 text-sm font-semibold shadow-sm transition ${
                            expanded.has(id)
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          {expanded.has(id) ? "Hide" : "Items"}
                        </button>
                        <button
                          title="Mark Completed & adjust stock"
                          onClick={() => markCompletedAndAdjust(id)}
                          className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100"
                        >
                          <FiCheckCircle />
                        </button>
                        <button
                          title="Delete"
                          onClick={() => deleteTxn(id)}
                          className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 p-2 text-rose-600 shadow-sm transition hover:border-rose-300 hover:bg-rose-100"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>

                    {/* order details */}
                    {expanded.has(id) && (
                      <div className="mt-4 space-y-3">
                        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Phone</p>
                            <p className="mt-1 font-medium text-slate-800">{m.phoneNumber || "Not set"}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Email</p>
                            <p className="mt-1 font-medium text-slate-800">{m.email || "Not set"}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Address</p>
                            <p className="mt-1 font-medium text-slate-800">{m.address || "Not set"}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Source</p>
                            <p className="mt-1 font-medium text-slate-800">{m.source || "Order Management"}</p>
                          </div>
                        </div>

                        {Array.isArray(m.products) && m.products.length > 0 ? (
                          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <tr>
                                  <th className="text-left px-3 py-2">Product</th>
                                  <th className="text-left px-3 py-2">Color/Size</th>
                                  <th className="text-left px-3 py-2">Qty</th>
                                  <th className="text-left px-3 py-2">Unit</th>
                                  <th className="text-left px-3 py-2">Total</th>
                                  <th className="text-right px-3 py-2">Edit</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {m.products.map((p, idx) => {
                                  const qty = p.quantity || 0;
                                  const unit =
                                    p.unitPrice != null
                                      ? p.unitPrice!
                                      : p.price && qty
                                        ? p.price / qty
                                        : 0;
                                  const tot = p.price != null ? p.price! : unit * qty;
                                  return (
                                    <tr key={idx} className="text-slate-700">
                                      <td className="px-3 py-2">
                                        {p.product || "Item"}
                                      </td>
                                      <td className="px-3 py-2">
                                        {[p.color, p.size]
                                          .filter(Boolean)
                                          .join(" / ")}
                                      </td>
                                      <td className="px-3 py-2">{qty}</td>
                                      <td className="px-3 py-2">
                                        Rs {unit.toFixed(2)}
                                      </td>
                                      <td className="px-3 py-2">
                                        Rs {tot.toFixed(2)}
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        <button
                                          onClick={() => openEditLine(id, idx, p)}
                                          className="text-sky-600 font-semibold hover:underline"
                                        >
                                          Edit
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                            No line items on this order yet.
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Load more */}
        {(hasMore || loadingMore) && !loading && (
          <div className="py-6 text-center">
            <button
              onClick={() => loadMore(false)}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FiRefreshCw /> {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        )}

        {/* Bulk bar */}
        {selectMode && (
          <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-slate-200 bg-white/90 px-4 py-2 shadow-lg backdrop-blur">
            <span className="text-sm font-semibold text-slate-700">{selectedIds.size} selected</span>
            <button
              onClick={bulkDelete}
              className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700"
            >
              Delete
            </button>
            <button
              onClick={bulkComplete}
              className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              Mark Completed
            </button>
          </div>
        )}

        {/* Edit modal */}
        {editOpen && editValue && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-base font-semibold text-slate-900">Edit Product Line</div>
                <button
                  onClick={() => {
                    setEditOpen(false);
                  }}
                  className="rounded-full border border-slate-200 px-2 py-1 text-slate-500 hover:bg-slate-50"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-slate-600">
                  Product
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    value={editValue.product}
                    onChange={(e) =>
                      setEditValue((v) => ({ ...v!, product: e.target.value }))
                    }
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Color
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    value={editValue.color || ""}
                    onChange={(e) =>
                      setEditValue((v) => ({ ...v!, color: e.target.value }))
                    }
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Size
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    value={editValue.size || ""}
                    onChange={(e) =>
                      setEditValue((v) => ({ ...v!, size: e.target.value }))
                    }
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Quantity
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    value={editValue.quantity}
                    onChange={(e) =>
                      setEditValue((v) => ({
                        ...v!,
                        quantity: Math.max(1, parseInt(e.target.value || "1")),
                      }))
                    }
                  />
                </label>
                <label className="col-span-2 text-sm text-slate-600">
                  Unit Price (Rs)
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    value={editValue.unitPrice ?? 0}
                    onChange={(e) =>
                      setEditValue((v) => ({
                        ...v!,
                        unitPrice: parseFloat(e.target.value || "0"),
                      }))
                    }
                  />
                </label>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  onClick={() => setEditOpen(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEditLine}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
        {docStudioOpen && docDraft && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4">
            <div className="max-h-[95vh] w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-600">
                    Order Document Studio
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900">
                    {ORDER_DOC_LABELS[docDraft.documentType]} for Order {docTxnId ? `#${docTxnId.slice(-6).toUpperCase()}` : ""}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Step 1 Configure document • Step 2 Preview/Download • Step 3 Save profile to this order
                  </p>
                </div>
                <button
                  onClick={() => setDocStudioOpen(false)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Close
                </button>
              </div>

              <div className="max-h-[75vh] overflow-y-auto p-5">
                <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Document Setup</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="text-xs font-semibold text-slate-600">
                          Type
                          <select
                            value={docDraft.documentType}
                            onChange={(e) => setDocType(e.target.value as OrderDocumentType)}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            {Object.entries(ORDER_DOC_LABELS).map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Number
                          <input
                            value={docDraft.documentNumber}
                            onChange={(e) =>
                              setDocDraft((prev) => (prev ? { ...prev, documentNumber: e.target.value } : prev))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Date
                          <input
                            type="date"
                            value={docDraft.documentDate}
                            onChange={(e) =>
                              setDocDraft((prev) => (prev ? { ...prev, documentDate: e.target.value } : prev))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        {docDraft.documentType === "quotation" && (
                          <label className="text-xs font-semibold text-slate-600">
                            Valid Until
                            <input
                              type="date"
                              value={docDraft.validUntil}
                              onChange={(e) =>
                                setDocDraft((prev) => (prev ? { ...prev, validUntil: e.target.value } : prev))
                              }
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                          </label>
                        )}
                        <label className="text-xs font-semibold text-slate-600">
                          Payment Status
                          <input
                            value={docDraft.paymentStatus}
                            onChange={(e) =>
                              setDocDraft((prev) => (prev ? { ...prev, paymentStatus: e.target.value } : prev))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Prepared By
                          <input
                            value={docDraft.preparedBy}
                            onChange={(e) =>
                              setDocDraft((prev) => (prev ? { ...prev, preparedBy: e.target.value } : prev))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Currency
                          <input
                            value={docDraft.currency}
                            onChange={(e) =>
                              setDocDraft((prev) => (prev ? { ...prev, currency: e.target.value } : prev))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 sm:pt-6">
                          <input
                            type="checkbox"
                            checked={docDraft.showLineItems}
                            onChange={(e) =>
                              setDocDraft((prev) => (prev ? { ...prev, showLineItems: e.target.checked } : prev))
                            }
                            className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-200"
                          />
                          Show quantity + unit price columns
                        </label>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Client Info</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="text-xs font-semibold text-slate-600">
                          Contact Name
                          <input
                            value={docDraft.clientName}
                            onChange={(e) =>
                              setDocDraft((prev) => (prev ? { ...prev, clientName: e.target.value } : prev))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Company Name
                          <input
                            value={docDraft.clientCompany}
                            onChange={(e) =>
                              setDocDraft((prev) => (prev ? { ...prev, clientCompany: e.target.value } : prev))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Email
                          <input
                            value={docDraft.clientEmail}
                            onChange={(e) =>
                              setDocDraft((prev) => (prev ? { ...prev, clientEmail: e.target.value } : prev))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Phone
                          <input
                            value={docDraft.clientPhone}
                            onChange={(e) =>
                              setDocDraft((prev) => (prev ? { ...prev, clientPhone: e.target.value } : prev))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                          Address
                          <input
                            value={docDraft.clientAddress}
                            onChange={(e) =>
                              setDocDraft((prev) => (prev ? { ...prev, clientAddress: e.target.value } : prev))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          BRN (optional)
                          <input
                            value={docDraft.clientBrn}
                            onChange={(e) =>
                              setDocDraft((prev) => (prev ? { ...prev, clientBrn: e.target.value } : prev))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          VAT (optional)
                          <input
                            value={docDraft.clientVat}
                            onChange={(e) =>
                              setDocDraft((prev) => (prev ? { ...prev, clientVat: e.target.value } : prev))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Line Items</p>
                        <button
                          onClick={addDocLine}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          <FiPlus /> Add line
                        </button>
                      </div>

                      <div className="mt-3 space-y-2">
                        {docDraft.lines.map((line, index) => (
                          <div key={`${line.description}-${index}`} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 md:grid-cols-[1.4fr_0.65fr_0.75fr_40px]">
                            <input
                              value={line.description}
                              onChange={(e) => updateDocLine(index, { description: e.target.value })}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                              placeholder="Description"
                            />
                            <input
                              type="number"
                              min={1}
                              value={line.quantity}
                              onChange={(e) =>
                                updateDocLine(index, { quantity: Math.max(1, safeNumber(e.target.value, 1)) })
                              }
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                              placeholder="Qty"
                            />
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={line.unitPrice}
                              onChange={(e) => updateDocLine(index, { unitPrice: Math.max(0, safeNumber(e.target.value, 0)) })}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                              placeholder="Unit Price"
                            />
                            <button
                              onClick={() => removeDocLine(index)}
                              className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                              title="Remove line"
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Totals</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="text-xs font-semibold text-slate-600">
                          Delivery fee
                          <input
                            type="number"
                            min={0}
                            value={docDraft.deliveryFee}
                            onChange={(e) =>
                              setDocDraft((prev) => (prev ? { ...prev, deliveryFee: Math.max(0, safeNumber(e.target.value, 0)) } : prev))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Discount
                          <input
                            type="number"
                            min={0}
                            value={docDraft.discount}
                            onChange={(e) =>
                              setDocDraft((prev) => (prev ? { ...prev, discount: Math.max(0, safeNumber(e.target.value, 0)) } : prev))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Amount received
                          <input
                            type="number"
                            min={0}
                            value={docDraft.amountReceived}
                            onChange={(e) =>
                              setDocDraft((prev) => (prev ? { ...prev, amountReceived: Math.max(0, safeNumber(e.target.value, 0)) } : prev))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          <div className="flex items-center justify-between">
                            <span>Subtotal</span>
                            <strong>{formatMoney(docTotals.subtotal, docDraft.currency)}</strong>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <span>Grand total</span>
                            <strong>{formatMoney(docTotals.total, docDraft.currency)}</strong>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <span>Balance due</span>
                            <strong>{formatMoney(docTotals.balanceDue, docDraft.currency)}</strong>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <label className="text-xs font-semibold text-slate-600">
                        Notes
                        <textarea
                          rows={3}
                          value={docDraft.notes}
                          onChange={(e) =>
                            setDocDraft((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="mt-3 block text-xs font-semibold text-slate-600">
                        Terms
                        <textarea
                          rows={5}
                          value={docDraft.terms}
                          onChange={(e) =>
                            setDocDraft((prev) => (prev ? { ...prev, terms: e.target.value } : prev))
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={openDocumentPreview}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <FiPrinter /> Preview PDF
                  </button>
                  <button
                    onClick={downloadDocumentPdf}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <FiFileText /> Download PDF
                  </button>
                  <button
                    onClick={() => {
                      if (!docDraft.clientEmail.trim()) {
                        showToast({ type: "err", text: "Add a client email before using quick send." });
                        return;
                      }
                      const subject = encodeURIComponent(`${ORDER_DOC_LABELS[docDraft.documentType]} from MO T-SHIRT`);
                      const body = encodeURIComponent(
                        `Hi ${docDraft.clientName || "there"},\n\nPlease find your ${ORDER_DOC_LABELS[docDraft.documentType].toLowerCase()} attached.\n\nBest regards,\nMO T-SHIRT`
                      );
                      window.location.href = `mailto:${encodeURIComponent(docDraft.clientEmail)}?subject=${subject}&body=${body}`;
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    <FiSend /> Quick send
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setDocStudioOpen(false)}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Close
                  </button>
                  <button
                    onClick={saveDocumentProfile}
                    disabled={docSaving}
                    className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {docSaving ? "Saving..." : "Save Profile to Order"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <style jsx>{`
          @keyframes fadeUp {
            from {
              opacity: 0;
              transform: translateY(14px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    </main>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center text-sm text-slate-500">Loading…</main>}>
      <OrdersPageInner />
    </Suspense>
  );
}

function Stat({
  label,
  value,
  tone = "slate",
  icon,
}: {
  label: string;
  value: string | number;
  tone?: "amber" | "sky" | "emerald" | "violet" | "slate";
  icon?: React.ReactNode;
}) {
  const tones = {
    amber: {
      border: "border-amber-100",
      bg: "from-amber-50 via-white to-white",
      accent: "bg-amber-100 text-amber-700",
      glow: "bg-amber-200/40",
      value: "text-slate-900",
    },
    sky: {
      border: "border-sky-100",
      bg: "from-sky-50 via-white to-white",
      accent: "bg-sky-100 text-sky-700",
      glow: "bg-sky-200/40",
      value: "text-slate-900",
    },
    emerald: {
      border: "border-emerald-100",
      bg: "from-emerald-50 via-white to-white",
      accent: "bg-emerald-100 text-emerald-700",
      glow: "bg-emerald-200/40",
      value: "text-slate-900",
    },
    violet: {
      border: "border-violet-100",
      bg: "from-violet-50 via-white to-white",
      accent: "bg-violet-100 text-violet-700",
      glow: "bg-violet-200/40",
      value: "text-slate-900",
    },
    slate: {
      border: "border-slate-200",
      bg: "from-slate-50 via-white to-white",
      accent: "bg-slate-100 text-slate-700",
      glow: "bg-slate-200/40",
      value: "text-slate-900",
    },
  } as const;
  const theme = tones[tone] ?? tones.slate;
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${theme.border} bg-gradient-to-br ${theme.bg} p-4 shadow-sm`}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </div>
        {icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${theme.accent}`}>
            {icon}
          </span>
        )}
      </div>
      <div className={`mt-3 text-2xl font-semibold ${theme.value}`}>{value}</div>
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full blur-2xl ${theme.glow}`}
      />
    </div>
  );
}

// UI helpers
function StatusBadge(status: string) {
  const map: Record<string, string> = {
    Pending: "bg-amber-50 text-amber-700 border-amber-200",
    "In Process": "bg-sky-50 text-sky-700 border-sky-200",
    Urgent: "bg-rose-50 text-rose-700 border-rose-200",
    Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Delivered: "bg-teal-50 text-teal-700 border-teal-200",
    Cancelled: "bg-slate-100 text-slate-600 border-slate-300",
  };
  const cls = map[status] || "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${cls}`}>{status || "—"}</span>
  );
}

function PaymentBadge(method: string) {
  const map: Record<string, string> = {
    "Full Payment": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Part Payment": "bg-violet-50 text-violet-700 border-violet-200",
    Unpaid: "bg-amber-50 text-amber-700 border-amber-200",
  };
  const cls = map[method] || "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${cls}`}>{method || "—"}</span>
  );
}
