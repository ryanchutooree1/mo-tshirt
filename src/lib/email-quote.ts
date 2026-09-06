import type { InboxMessage } from "./gmail-inbox.ts";

export type EmailQuoteDraft = {
  name: string; email: string; phone: string; company: string; address: string;
  brn: string; vat: string; deadline: string; printMethod: string; delivery: string;
  notes: string; lines: { description: string; quantity: number | "" }[];
};
const clean = (value: unknown, max = 1000) => typeof value === "string" ? value.trim().slice(0, max) : "";
export function emailQuoteId(message: Pick<InboxMessage, "id" | "threadId">) {
  return `gmail-${message.threadId || message.id}`;
}
export function isWebsiteQuotationCopy(message: InboxMessage) {
  return /^(?:(?:re|fw|fwd):\s*)*new website quotation\b/i.test(message.subject);
}
export function extractEmailQuote(message: InboxMessage): EmailQuoteDraft {
  const body = message.text || message.snippet;
  // Avoid assigning contact fields from earlier quoted replies to the current sender.
  const current = body.split(/\n(?:On .+wrote:|Le .+écrit\s*:|>{1,}|-{2,}\s*(?:Original Message|Forwarded message))/i)[0];
  const field = (labels: string) => current.match(new RegExp(`^(?:${labels})\\s*[:：]\\s*(.+)$`, "im"))?.[1]?.trim() || "";
  const sender = (message.replyTo || message.from).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const senderName = message.from.replace(/<[^>]*>/g, "").replace(/["']/g, "").trim();
  const name = field("name|full name|contact name|nom|nom complet") || (senderName.includes("@") ? "" : senderName);
  const phone = field("phone|telephone|téléphone|tel|tél|mobile|whatsapp|contact number") || current.match(/(?:\+230[\s.-]*)?(?:5[\s.-]*\d{3}[\s.-]*\d{4})(?!\d)/)?.[0] || "";
  const product = /\b(t[ -]?shirts?|polos?|polo[ -]?shirts?|hoodies?|sweatshirts?|uniforms?|caps?|aprons?|sashes?|shirts?|tabliers?|casquettes?)\b/i;
  const productLines = current.split(/\n|(?<=[.!?])\s+/).map(s => s.trim()).filter(s => product.test(s) && !/^>/.test(s)).slice(0, 30);
  const labelledQuantity = field("quantity|qty|quantité|total quantity");
  const quantity = /^\d+$/.test(labelledQuantity) ? Number(labelledQuantity) : "";
  const lines = productLines.map(description => {
    const beforeProduct = description.match(/\b(\d{1,6})\s*(?:x\s*|pcs?\s+|pieces?\s+)?(?:[a-z]+\s+){0,2}(?:t[ -]?shirts?|polos?|hoodies?|uniforms?|caps?|aprons?|sashes?|shirts?)\b/i);
    const labelled = description.match(/\b(?:qty|quantity|quantité)\s*[:=]?\s*(\d{1,6})\b/i);
    return { description: clean(description, 1000), quantity: beforeProduct || labelled ? Number((beforeProduct || labelled)![1]) : productLines.length === 1 ? quantity : "" as const };
  });
  return normalizeEmailQuoteDraft({ name, email: sender, phone, company: field("company|organisation|organization|société|entreprise"), address: field("address|adresse|delivery address|adresse de livraison"), brn: field("brn|business registration number"), vat: field("vat|vat number|tva"), deadline: field("deadline|required by|delivery date|date de livraison") || current.match(/\b(?:needed by|required by|need (?:them|it) by|before|avant|pour le)\s+([^\n.!?]{3,80})/i)?.[1] || "", printMethod: field("print method|printing method|méthode d'impression") || current.match(/\b(?:embroidery|broderie|screen printing|sérigraphie|sublimation|DTF|DTG)\b/i)?.[0] || "", delivery: field("delivery|livraison|collection|pickup"), notes: `Email subject: ${message.subject}\n\n${body}`, lines: lines.length ? lines : [{ description: message.subject === "(No subject)" ? "Email enquiry — confirm product" : message.subject, quantity }] });
}
export function normalizeEmailQuoteDraft(value: unknown): EmailQuoteDraft {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const fields = ["name", "email", "phone", "company", "address", "brn", "vat", "deadline", "printMethod", "delivery"] as const;
  const result = Object.fromEntries(fields.map(k => [k, clean(raw[k], k === "address" ? 2000 : 500)])) as Omit<EmailQuoteDraft, "lines" | "notes">;
  const lines = Array.isArray(raw.lines) ? raw.lines.slice(0, 50).map(item => {
    const line = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const quantity = Number(line.quantity);
    return { description: clean(line.description), quantity: Number.isInteger(quantity) && quantity > 0 && quantity <= 100000 ? quantity : "" as const };
  }).filter(line => line.description) : [];
  return { ...result, notes: clean(raw.notes, 40000), lines };
}
export function buildEmailQuoteRecord(message: InboxMessage, draft: EmailQuoteDraft, actor: string) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: draft.name || draft.company || "Email client", email: draft.email, phone: draft.phone,
    message: draft.notes, notes: draft.notes, source: "Gmail", status: "review",
    deadline: draft.deadline, printMethod: draft.printMethod, delivery: draft.delivery,
    deliveryAddress: draft.address,
    emailImport: { messageId: message.id, threadId: message.threadId || message.id, from: message.from, to: message.to, subject: message.subject, receivedAt: message.date, originalText: (message.text || message.snippet).slice(0, 100000), attachmentNames: message.attachmentNames || [], importedBy: actor, importedAt: new Date().toISOString() },
    quote: { documentType: "quotation", documentNumber: `Q-EMAIL-${(message.threadId || message.id).toUpperCase()}`, documentDate: today, clientCompany: draft.company || draft.name, clientAddress: draft.address, clientBrn: draft.brn, clientVat: draft.vat, paymentStatus: "Quotation only", preparedBy: "Mo T-Shirt Team", currency: "Rs", showLineItems: true, showTotals: false, lines: draft.lines.map(line => ({ ...line, unitPrice: "", includeInTotals: true })), deliveryFee: 0, discount: 0, amountReceived: 0, subtotal: 0, total: 0, notes: draft.notes, terms: "", validUntil: "" },
  };
}
