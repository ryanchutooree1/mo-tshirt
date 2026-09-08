import { NextResponse } from "next/server";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getAdminRequestSession } from "@/lib/admin-request";
import { hasAdminPageAccess } from "@/lib/admin-access";
import { db } from "@/lib/firebase";
import { buildQuoteResponseUrl } from "@/lib/quote-response-links";
import { storePublicUploadBuffer } from "@/lib/public-upload-store";
import { buildQuotationWhatsAppUrl, normalizeWhatsAppPhone } from "@/lib/quotation-whatsapp";
import { isContentLengthWithinLimit, isRequestOriginAllowed } from "@/lib/request-safety";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const clean = (value: unknown, limit = 160) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  const session = await getAdminRequestSession();
  if (!session || !hasAdminPageAccess(session.allowedPages, "/admin/quotation-approval", session)) return json({ error: "Quotation access is required." }, 403);
  if (!isRequestOriginAllowed(request)) return json({ error: "Origin not allowed." }, 403);
  if (!isContentLengthWithinLimit(request.headers, MAX_PDF_BYTES + 200_000)) return json({ error: "Quotation PDF is too large." }, 413);
  try {
    const form = await request.formData();
    const id = clean(form.get("quoteId"));
    const phone = clean(form.get("clientPhone"), 80);
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id) || !normalizeWhatsAppPhone(phone)) return json({ error: "Select a quotation and enter a valid client WhatsApp number." }, 400);
    const pdf = form.get("pdf");
    if (!(pdf instanceof File) || !pdf.size || pdf.size > MAX_PDF_BYTES || pdf.type !== "application/pdf") return json({ error: "A quotation PDF up to 10 MB is required." }, 400);
    const quote = JSON.parse(clean(form.get("quote"), 150_000));
    if (!quote || Array.isArray(quote) || quote.documentType !== "quotation" || !Array.isArray(quote.lines) || !quote.lines.length || quote.lines.some((line: Record<string, unknown>) => !line || !clean(line.description, 4000) || !(Number(line.quantity) > 0) || !(Number(line.unitPrice) > 0))) return json({ error: "Complete the quotation items and prices first." }, 400);
    const ref = doc(db, "quotes", id);
    const existing = await getDoc(ref);
    if (!existing.exists()) return json({ error: "Quotation not found." }, 404);
    const quotationUrl = new URL(buildQuoteResponseUrl(id, "accept"));
    quotationUrl.searchParams.set("preview", "1");
    const name = clean(form.get("clientName")) || clean(existing.data().name);
    const whatsappUrl = buildQuotationWhatsAppUrl(phone, name, clean(quote.documentNumber) || id, quotationUrl.toString());
    const quotationDocument = await storePublicUploadBuffer({ buffer: Buffer.from(await pdf.arrayBuffer()), filename: `${clean(quote.documentNumber) || id}.pdf`, contentType: "application/pdf", size: pdf.size, sessionId: id, sessionPrefix: "quotation-document", source: "quotation-whatsapp-document", maxUploadBytes: MAX_PDF_BYTES });
    await updateDoc(ref, {
      quote, quotationDocument, phone,
      ...(name ? { name } : {}),
      ...(clean(form.get("clientEmail"), 254) ? { email: clean(form.get("clientEmail"), 254) } : {}),
      whatsappPreparedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    // Opening WhatsApp prepares a message; only the admin can confirm sending it.
    return json({ whatsappUrl });
  } catch (error) {
    console.error("quotes:whatsapp:prepare", error);
    return json({ error: "Could not prepare the WhatsApp quotation. Please try again." }, 500);
  }
}
