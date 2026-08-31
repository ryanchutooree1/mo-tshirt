import { NextResponse } from "next/server";
import { arrayUnion, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  isQuoteResponseAction,
  verifyQuoteResponseLink,
  type QuoteResponseAction,
} from "@/lib/quote-response-links";
import {
  CONTACT_RATE_LIMIT,
  evaluateRequestRateLimit,
  getRateLimitHeaders,
  isContentLengthWithinLimit,
  isRequestOriginAllowed,
} from "@/lib/request-safety";
import { storePublicUploadBuffer } from "@/lib/public-upload-store";
import { normalizeQuotationUploadUrl } from "@/lib/quotation-upload-paths";

const MAX_PAYMENT_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type RouteContext = { params: Promise<{ id: string }> };

function cleanString(value: unknown, maxLength = 4_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanPaymentEvidence(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const url = normalizeQuotationUploadUrl(cleanString(raw.url, 2_000));
  if (!url) return null;
  return {
    uploadId: cleanString(raw.uploadId, 200),
    url,
    filename: cleanString(raw.filename, 300) || "Payment screenshot",
    contentType: cleanString(raw.contentType, 100),
    size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : 0,
  };
}

function cleanQuotationDocument(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const url = normalizeQuotationUploadUrl(cleanString(raw.url, 2_000));
  if (!url) return null;
  return {
    url,
    filename: cleanString(raw.filename, 300) || "Quotation.pdf",
    contentType: "application/pdf",
  };
}

function getStoredResponseHistory(data: Record<string, unknown>) {
  return Array.isArray(data.clientResponseHistory)
    ? data.clientResponseHistory.filter(
        (entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry))
      )
    : [];
}

function getLegacyResponseEntry(data: Record<string, unknown>) {
  const decision = cleanString(data.clientDecision, 40);
  const action: QuoteResponseAction | null = decision === "accepted"
    ? "accept"
    : decision === "changes_requested"
      ? "changes"
      : decision === "rejected"
        ? "reject"
        : null;
  if (!action) return null;

  const submittedAtIso = cleanString(data.clientDecisionAtIso, 50);
  const paymentEvidence = action === "accept" ? cleanPaymentEvidence(data.paymentEvidence) : null;
  return {
    id: `legacy-${submittedAtIso || action}`,
    action,
    decision,
    comment: cleanString(data.clientDecisionComment),
    submittedAtIso,
    ...(paymentEvidence ? { paymentEvidence } : {}),
  };
}

function getHistoryEntriesToAppend(data: Record<string, unknown>, entry: Record<string, unknown>) {
  if (getStoredResponseHistory(data).length) return [entry];
  const legacyEntry = getLegacyResponseEntry(data);
  return legacyEntry ? [legacyEntry, entry] : [entry];
}

function publicResponseHistory(data: Record<string, unknown>) {
  const stored = getStoredResponseHistory(data);
  const entries = stored.length ? stored : [getLegacyResponseEntry(data)].filter(Boolean);

  return entries.slice(-50).flatMap((entry) => {
    if (!entry) return [];
    const action = cleanString(entry.action, 20);
    if (!isQuoteResponseAction(action)) return [];
    const paymentEvidence = action === "accept" ? cleanPaymentEvidence(entry.paymentEvidence) : null;
    return [{
      id: cleanString(entry.id, 200) || `${action}-${cleanString(entry.submittedAtIso, 50)}`,
      action,
      comment: cleanString(entry.comment),
      submittedAtIso: cleanString(entry.submittedAtIso, 50),
      ...(paymentEvidence ? { paymentEvidence } : {}),
    }];
  });
}

function isValidRequest(input: {
  quoteId: string;
  action: string;
  expires: string;
  token: string;
}) {
  try {
    return verifyQuoteResponseLink(input);
  } catch (error) {
    console.error("quotes:respond:signature", error);
    return false;
  }
}

function publicQuoteSummary(data: Record<string, unknown>) {
  const quote = data.quote && typeof data.quote === "object"
    ? data.quote as Record<string, unknown>
    : {};
  const total = Number(quote.total);
  const amountReceived = Number(quote.amountReceived);
  const quotationDocument = cleanQuotationDocument(data.quotationDocument);

  return {
    clientName: cleanString(data.name, 120),
    documentNumber: cleanString(quote.documentNumber, 80),
    currency: cleanString(quote.currency, 10) || "Rs",
    total: Number.isFinite(total) ? total : null,
    amountReceived: Number.isFinite(amountReceived) ? amountReceived : 0,
    currentDecision: cleanString(data.clientDecision, 40),
    responseHistory: publicResponseHistory(data),
    ...(quotationDocument ? { quotationDocument } : {}),
  };
}

export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  const expires = url.searchParams.get("expires") || "";
  const token = url.searchParams.get("token") || "";

  if (!isValidRequest({ quoteId: id, action, expires, token })) {
    return NextResponse.json({ error: "This quotation link is invalid or has expired." }, { status: 403 });
  }

  try {
    const snapshot = await getDoc(doc(db, "quotes", id));
    if (!snapshot.exists()) {
      return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    }
    const quote = publicQuoteSummary(snapshot.data());
    const documentParams = new URLSearchParams({ action, expires, token });
    return NextResponse.json({
      quote: {
        ...quote,
        quotationDocument: quote.quotationDocument || {
          url: `/api/quotes/${encodeURIComponent(id)}/document?${documentParams}`,
          filename: `${quote.documentNumber || "Quotation"}.pdf`,
          contentType: "application/pdf",
        },
      },
    });
  } catch (error) {
    console.error("quotes:respond:get", error);
    return NextResponse.json({ error: "Could not load this quotation." }, { status: 500 });
  }
}

export async function POST(req: Request, context: RouteContext) {
  const rateLimit = evaluateRequestRateLimit(req.headers, {
    ...CONTACT_RATE_LIMIT,
    scope: "quotation-response",
  });
  const rateHeaders = getRateLimitHeaders(rateLimit);
  const json = (body: Record<string, unknown>, status: number) =>
    NextResponse.json(body, { status, headers: rateHeaders });

  if (!rateLimit.allowed) return json({ error: "Too many attempts. Please try again later." }, 429);
  if (!isRequestOriginAllowed(req)) return json({ error: "Origin not allowed." }, 403);
  if (!isContentLengthWithinLimit(req.headers, MAX_PAYMENT_SCREENSHOT_BYTES + 200_000)) {
    return json({ error: "The payment screenshot is too large." }, 413);
  }

  const { id } = await context.params;

  try {
    const form = await req.formData();
    const action = cleanString(form.get("action"), 20);
    const expires = cleanString(form.get("expires"), 30);
    const token = cleanString(form.get("token"), 200);

    if (!isValidRequest({ quoteId: id, action, expires, token }) || !isQuoteResponseAction(action)) {
      return json({ error: "This quotation link is invalid or has expired." }, 403);
    }

    const quoteRef = doc(db, "quotes", id);
    const quoteSnapshot = await getDoc(quoteRef);
    if (!quoteSnapshot.exists()) return json({ error: "Quotation not found." }, 404);
    const quoteData = quoteSnapshot.data() as Record<string, unknown>;

    if (action === "changes" || action === "reject") {
      const comment = cleanString(form.get("comment"));
      if (!comment) {
        return json({ error: action === "changes" ? "Please describe the requested changes." : "Please tell us why you are rejecting the quotation." }, 400);
      }

      const decision = action === "changes" ? "changes_requested" : "rejected";
      const submittedAtIso = new Date().toISOString();
      const historyEntry = {
        id: crypto.randomUUID(),
        action,
        decision,
        comment,
        submittedAtIso,
      };
      await updateDoc(quoteRef, {
        clientDecision: decision,
        clientDecisionComment: comment,
        clientDecisionAt: serverTimestamp(),
        clientDecisionAtIso: submittedAtIso,
        clientResponseHistory: arrayUnion(...getHistoryEntriesToAppend(quoteData, historyEntry)),
        updatedAt: serverTimestamp(),
      });

      const updatedData = {
        ...quoteData,
        clientDecision: decision,
        clientDecisionComment: comment,
        clientDecisionAtIso: submittedAtIso,
        clientResponseHistory: [...getStoredResponseHistory(quoteData), ...getHistoryEntriesToAppend(quoteData, historyEntry)],
      };
      return json({
        ok: true,
        decision,
        message: action === "changes" ? "Your change request was sent." : "Your response was saved.",
        quote: publicQuoteSummary(updatedData),
      }, 200);
    }

    return await acceptWithPaymentEvidence({ form, quoteId: id, quoteRef, quoteData, json });
  } catch (error) {
    console.error("quotes:respond:post", error);
    return json({ error: "Could not save your response. Please try again." }, 500);
  }
}

async function acceptWithPaymentEvidence({
  form,
  quoteId,
  quoteRef,
  quoteData,
  json,
}: {
  form: FormData;
  quoteId: string;
  quoteRef: ReturnType<typeof doc>;
  quoteData: Record<string, unknown>;
  json: (body: Record<string, unknown>, status: number) => NextResponse;
}) {
  const file = form.get("paymentScreenshot");
  if (!(file instanceof File) || !file.size) {
    return json({ error: "Please upload your payment screenshot." }, 400);
  }
  if (file.size > MAX_PAYMENT_SCREENSHOT_BYTES) {
    return json({ error: "The screenshot must be 8 MB or smaller." }, 400);
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return json({ error: "Please upload a JPG, PNG or WebP screenshot." }, 400);
  }

  const upload = await storePublicUploadBuffer({
    buffer: Buffer.from(await file.arrayBuffer()),
    filename: file.name,
    contentType: file.type,
    size: file.size,
    sessionId: quoteId,
    sessionPrefix: "quote-payment",
    source: "quotation-payment-evidence",
    maxUploadBytes: MAX_PAYMENT_SCREENSHOT_BYTES,
  });

  const submittedAtIso = new Date().toISOString();
  const paymentEvidence = {
    uploadId: upload.uploadId,
    url: upload.url,
    filename: upload.filename,
    contentType: upload.contentType,
    size: upload.size,
    submittedAtIso,
    ocrStatus: "pending",
    verificationStatus: "pending_manual_confirmation",
  };
  const historyEntry = {
    id: crypto.randomUUID(),
    action: "accept",
    decision: "accepted",
    comment: "",
    submittedAtIso,
    paymentEvidence: cleanPaymentEvidence(paymentEvidence),
  };
  await updateDoc(quoteRef, {
    status: "approved",
    clientDecision: "accepted",
    clientDecisionComment: "",
    clientDecisionAt: serverTimestamp(),
    clientDecisionAtIso: submittedAtIso,
    paymentEvidence,
    clientResponseHistory: arrayUnion(...getHistoryEntriesToAppend(quoteData, historyEntry)),
    updatedAt: serverTimestamp(),
  });

  const updatedData = {
    ...quoteData,
    status: "approved",
    clientDecision: "accepted",
    clientDecisionComment: "",
    clientDecisionAtIso: submittedAtIso,
    paymentEvidence,
    clientResponseHistory: [...getStoredResponseHistory(quoteData), ...getHistoryEntriesToAppend(quoteData, historyEntry)],
  };

  return json({
    ok: true,
    decision: "accepted",
    message: "Your quotation was accepted and your payment screenshot was submitted. MO T-SHIRT will now check it.",
    quote: publicQuoteSummary(updatedData),
  }, 200);
}
