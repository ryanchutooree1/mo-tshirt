import { activeEditLock, documentContentVersion } from "@/lib/quote-product-edit";
import { NextResponse } from "next/server";
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { getAdminRequestSession } from "@/lib/admin-request";
import { hasAdminPageAccess } from "@/lib/admin-access";
import { db } from "@/lib/firebase";
import { buildQuoteResponseUrl } from "@/lib/quote-response-links";
import { storePublicUploadBuffer } from "@/lib/public-upload-store";
import { buildQuotationWhatsAppUrl, normalizeWhatsAppPhone } from "@/lib/quotation-whatsapp";
import { buildSavedQuotationPdf } from "@/lib/quotation-pdf";
import { isContentLengthWithinLimit, isRequestOriginAllowed } from "@/lib/request-safety";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_JSON_BYTES = 16 * 1024;
const clean = (value: unknown, limit = 160) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const validQuote = (quote: Record<string, unknown>) => quote.documentType === "quotation" && Array.isArray(quote.lines) && quote.lines.length > 0 && !quote.lines.some((line) => {
  if (!line || typeof line !== "object" || Array.isArray(line)) return true;
  const item = line as Record<string, unknown>;
  return !clean(item.description, 4000) || !(Number(item.quantity) > 0) || !(Number(item.unitPrice) > 0);
});

async function prepareWhatsApp({
  id, phone, name, quote, pdfBuffer, existingData,
}: {
  id: string;
  phone: string;
  name: string;
  quote: Record<string, unknown>;
  pdfBuffer: Buffer;
  existingData: Record<string, unknown>;
}) {
  if (!normalizeWhatsAppPhone(phone)) return json({ error: "Enter a valid client WhatsApp number before sending." }, 400);
  if (!validQuote(quote)) return json({ error: "Complete the quotation items and prices first." }, 400);
  if (!pdfBuffer.length || pdfBuffer.length > MAX_PDF_BYTES) return json({ error: "A quotation PDF up to 10 MB is required." }, 400);
  if (activeEditLock(existingData, Date.now()) || documentContentVersion(existingData.quote) !== documentContentVersion(quote)) return json({ error: "The quotation changed or is being edited. Save the latest document before sharing." }, 409);

  const ref = doc(db, "quotes", id);
  const quotationUrl = new URL(buildQuoteResponseUrl(id, "accept"));
  quotationUrl.searchParams.set("preview", "1");
  const reference = clean(quote.documentNumber) || id;
  const whatsappUrl = buildQuotationWhatsAppUrl(phone, name || clean(existingData.name) || "Customer", reference, quotationUrl.toString());
  const quotationDocument = await storePublicUploadBuffer({
    buffer: pdfBuffer,
    filename: `${reference}.pdf`,
    contentType: "application/pdf",
    size: pdfBuffer.length,
    sessionId: id,
    sessionPrefix: "quotation-document",
    source: "quotation-whatsapp-document",
    maxUploadBytes: MAX_PDF_BYTES,
  });
  const attached = await runTransaction(db, async transaction => {
    const latest = await transaction.get(ref);
    if (!latest.exists() || activeEditLock(latest.data(), Date.now()) || documentContentVersion(latest.data().quote) !== documentContentVersion(quote)) return false;
    transaction.update(ref, { quotationDocument, whatsappPreparedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return true;
  });
  if (!attached) return json({ error: "The quotation changed while preparing the PDF. Save the latest document and try again." }, 409);
  // Opening WhatsApp prepares a message; only the admin can press Send.
  return json({ whatsappUrl });
}

export async function POST(request: Request) {
  const session = await getAdminRequestSession();
  if (!session || !hasAdminPageAccess(session.allowedPages, "/admin/quotation-approval", session)) return json({ error: "Quotation access is required." }, 403);
  if (!isRequestOriginAllowed(request)) return json({ error: "Origin not allowed." }, 403);
  try {
    const contentType = request.headers.get("content-type")?.toLowerCase() || "";
    if (contentType.startsWith("application/json")) {
      if (!isContentLengthWithinLimit(request.headers, MAX_JSON_BYTES)) return json({ error: "Request is too large." }, 413);
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      const id = clean(body.quoteId);
      if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) return json({ error: "Select a quotation first." }, 400);
      const existing = await getDoc(doc(db, "quotes", id));
      if (!existing.exists()) return json({ error: "Quotation not found." }, 404);
      const existingData = existing.data() as Record<string, unknown>;
      const quote = existingData.quote && typeof existingData.quote === "object" && !Array.isArray(existingData.quote)
        ? existingData.quote as Record<string, unknown>
        : {};
      const pdfBuffer = buildSavedQuotationPdf(existingData);
      return prepareWhatsApp({ id, phone: clean(existingData.phone, 80), name: clean(existingData.name) || "Customer", quote, pdfBuffer, existingData });
    }

    if (!isContentLengthWithinLimit(request.headers, MAX_PDF_BYTES + 200_000)) return json({ error: "Quotation PDF is too large." }, 413);
    const form = await request.formData();
    const id = clean(form.get("quoteId"));
    const phone = clean(form.get("clientPhone"), 80);
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id) || !normalizeWhatsAppPhone(phone)) return json({ error: "Select a quotation and enter a valid client WhatsApp number." }, 400);
    const pdf = form.get("pdf");
    if (!(pdf instanceof File) || !pdf.size || pdf.size > MAX_PDF_BYTES || pdf.type !== "application/pdf") return json({ error: "A quotation PDF up to 10 MB is required." }, 400);
    const quote = JSON.parse(clean(form.get("quote"), 150_000));
    if (!quote || Array.isArray(quote) || typeof quote !== "object" || !validQuote(quote)) return json({ error: "Complete the quotation items and prices first." }, 400);
    const ref = doc(db, "quotes", id);
    const existing = await getDoc(ref);
    if (!existing.exists()) return json({ error: "Quotation not found." }, 404);
    return prepareWhatsApp({
      id,
      phone,
      name: clean(form.get("clientName")) || clean(existing.data().name) || "Customer",
      quote,
      pdfBuffer: Buffer.from(await pdf.arrayBuffer()),
      existingData: existing.data() as Record<string, unknown>,
    });
  } catch (error) {
    console.error("quotes:whatsapp:prepare", error);
    return json({ error: "Could not prepare the WhatsApp quotation. Please try again." }, 500);
  }
}
