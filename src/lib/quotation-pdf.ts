import { jsPDF } from "jspdf";
import { CONTACT_PHONE_DISPLAY } from "@/data/work";
import { formatMoney } from "@/lib/money";

type FirestoreRecord = Record<string, unknown>;

const DEFAULT_TERMS = [
  "This quotation is provided for information purposes only and is valid for a limited period.",
  "Prices are subject to change if quantities, specifications, or timelines are modified.",
  "Production will commence only after written acceptance of this quotation.",
  "Acceptance confirms agreement with MO T-SHIRT terms and conditions.",
  "MO T-SHIRT is not VAT-registered. This quotation is not subject to VAT.",
].join("\n");

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateLabel(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? raw
    : new Intl.DateTimeFormat("en-GB").format(date);
}

function quoteRecord(value: unknown): FirestoreRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as FirestoreRecord
    : {};
}

export function buildSavedQuotationPdf(data: FirestoreRecord) {
  const quote = quoteRecord(data.quote);
  const currency = stringValue(quote.currency) || "Rs";
  const lines = Array.isArray(quote.lines)
    ? quote.lines.map(quoteRecord)
    : [];
  const deliveryFee = numberValue(quote.deliveryFee);
  const discount = numberValue(quote.discount);
  const amountReceived = numberValue(quote.amountReceived);
  const subtotal = lines.reduce(
    (sum, line) => sum + numberValue(line.quantity) * numberValue(line.unitPrice),
    0
  );
  const total = Number.isFinite(Number(quote.total))
    ? Number(quote.total)
    : subtotal + deliveryFee - discount;
  const balance = Math.max(0, total - amountReceived);
  const documentNumber = stringValue(quote.documentNumber) || "Quotation";
  const clientName = stringValue(quote.clientCompany) || stringValue(data.name) || "Client";
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const orange = [250, 115, 35] as const;
  let y = 28;

  const addPageIfNeeded = (height: number) => {
    if (y + height < pageHeight - 48) return;
    doc.addPage();
    y = 48;
  };

  doc.setFillColor(...orange);
  doc.rect(margin, y, contentWidth, 5, "F");
  y = 64;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(...orange);
  doc.text("MO T-SHIRT", margin, y);
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text("BUSINESS PRINTING", margin, y + 13);
  doc.setFontSize(10);
  doc.text("School Lane, Surinam, 60907", margin, y + 34);
  doc.text(`Tel: ${CONTACT_PHONE_DISPLAY}`, margin, y + 48);
  doc.text("BRN: I20009899", margin, y + 62);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...orange);
  doc.text("Quotation", pageWidth - margin, y, { align: "right" });
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`No ${documentNumber}`, pageWidth - margin, y + 20, { align: "right" });
  doc.text(`Date ${dateLabel(quote.documentDate) || "Not specified"}`, pageWidth - margin, y + 35, { align: "right" });
  doc.text(`Valid until ${dateLabel(quote.validUntil) || "Not specified"}`, pageWidth - margin, y + 50, { align: "right" });
  doc.text(`Prepared by: ${stringValue(quote.preparedBy) || "Mo T-Shirt Team"}`, pageWidth - margin, y + 65, { align: "right" });

  y = 174;
  doc.setFontSize(10);
  doc.setTextColor(...orange);
  doc.text("Quotation for", margin, y);
  y += 22;
  doc.setFontSize(15);
  doc.setTextColor(20);
  doc.text(clientName, margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const clientLines = [
    ["Contact", stringValue(data.name)],
    ["Phone", stringValue(data.phone)],
    ["Email", stringValue(data.email)],
    ["Address", stringValue(quote.clientAddress)],
    ["BRN", stringValue(quote.clientBrn)],
    ["VAT", stringValue(quote.clientVat)],
  ].filter(([, value]) => value);
  clientLines.forEach(([label, value]) => {
    doc.text(`${label}: ${value}`, margin, y);
    y += 14;
  });

  y += 12;
  doc.setDrawColor(150);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...orange);
  doc.text("Description", margin, y);
  doc.text("Qty", pageWidth - 210, y, { align: "right" });
  doc.text("Price", pageWidth - 120, y, { align: "right" });
  doc.text("Total", pageWidth - margin, y, { align: "right" });
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(25);
  lines.forEach((line) => {
    const description = stringValue(line.description) || "Item";
    const quantity = numberValue(line.quantity);
    const unitPrice = numberValue(line.unitPrice);
    const descriptionLines = doc.splitTextToSize(description, contentWidth - 230) as string[];
    const rowHeight = Math.max(30, descriptionLines.length * 13 + 12);
    addPageIfNeeded(rowHeight + 8);
    doc.setFillColor(246, 246, 244);
    doc.rect(margin, y - 12, contentWidth, rowHeight, "F");
    doc.text(descriptionLines, margin + 6, y);
    doc.text(String(quantity), pageWidth - 210, y, { align: "right" });
    doc.text(formatMoney(unitPrice, currency), pageWidth - 120, y, { align: "right" });
    doc.text(formatMoney(quantity * unitPrice, currency), pageWidth - margin, y, { align: "right" });
    y += rowHeight + 6;
  });

  addPageIfNeeded(150);
  y += 8;
  doc.setDrawColor(150);
  doc.line(margin, y, pageWidth - margin, y);
  const totalRows: Array<[string, number]> = [
    ["Subtotal", subtotal],
    ...(deliveryFee ? [["Delivery fee", deliveryFee] as [string, number]] : []),
    ...(discount ? [["Discount", -discount] as [string, number]] : []),
  ];
  y += 20;
  doc.setTextColor(50);
  totalRows.forEach(([label, amount]) => {
    doc.text(label, pageWidth - 145, y, { align: "right" });
    doc.text(formatMoney(amount, currency), pageWidth - margin, y, { align: "right" });
    y += 16;
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20);
  doc.text("Grand Total", pageWidth - 145, y + 4, { align: "right" });
  doc.text(formatMoney(total, currency), pageWidth - margin, y + 4, { align: "right" });
  y += 24;
  if (amountReceived > 0) {
    doc.setFontSize(10);
    doc.text("Balance due", pageWidth - 145, y, { align: "right" });
    doc.text(formatMoney(balance, currency), pageWidth - margin, y, { align: "right" });
    y += 20;
  }

  const notes = stringValue(quote.notes);
  if (notes) {
    addPageIfNeeded(80);
    doc.setFontSize(10);
    doc.text("Notes", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    const noteLines = doc.splitTextToSize(notes, contentWidth) as string[];
    doc.text(noteLines, margin, y);
    y += noteLines.length * 12 + 18;
  }

  addPageIfNeeded(190);
  doc.setFillColor(...orange);
  doc.rect(margin, y, contentWidth, 18, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255);
  doc.text("TERMS AND CONDITIONS", margin + 6, y + 12);
  y += 30;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40);
  const terms = stringValue(quote.terms) || DEFAULT_TERMS;
  const termsLines = doc.splitTextToSize(terms, contentWidth - 12) as string[];
  doc.text(termsLines, margin + 6, y);
  y += termsLines.length * 12 + 20;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...orange);
  doc.text("Payment Details", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40);
  doc.text("Payee: Manavshree Chutooree", margin, y);
  doc.text("Bank: SBM BANK", margin, y + 14);
  doc.text("Account No: 50300001273751", margin, y + 28);

  return Buffer.from(doc.output("arraybuffer"));
}
