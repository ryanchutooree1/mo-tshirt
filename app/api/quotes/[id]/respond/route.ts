import { NextResponse } from "next/server";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
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

const MAX_PAYMENT_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type RouteContext = { params: Promise<{ id: string }> };

function cleanString(value: unknown, maxLength = 4_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
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

  return {
    clientName: cleanString(data.name, 120),
    documentNumber: cleanString(quote.documentNumber, 80),
    currency: cleanString(quote.currency, 10) || "Rs",
    total: Number.isFinite(total) ? total : null,
    amountReceived: Number.isFinite(amountReceived) ? amountReceived : 0,
    currentDecision: cleanString(data.clientDecision, 40),
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
    return NextResponse.json({ quote: publicQuoteSummary(snapshot.data()) });
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

    if (action === "changes" || action === "reject") {
      const comment = cleanString(form.get("comment"));
      if (!comment) {
        return json({ error: action === "changes" ? "Please describe the requested changes." : "Please tell us why you are rejecting the quotation." }, 400);
      }

      const decision = action === "changes" ? "changes_requested" : "rejected";
      await updateDoc(quoteRef, {
        clientDecision: decision,
        clientDecisionComment: comment,
        clientDecisionAt: serverTimestamp(),
        clientDecisionAtIso: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });

      return json({ ok: true, decision }, 200);
    }

    return await acceptWithPaymentEvidence({ form, quoteId: id, quoteRef, json });
  } catch (error) {
    console.error("quotes:respond:post", error);
    return json({ error: "Could not save your response. Please try again." }, 500);
  }
}

async function acceptWithPaymentEvidence({
  form,
  quoteId,
  quoteRef,
  json,
}: {
  form: FormData;
  quoteId: string;
  quoteRef: ReturnType<typeof doc>;
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
  await updateDoc(quoteRef, {
    status: "approved",
    clientDecision: "accepted",
    clientDecisionComment: "",
    clientDecisionAt: serverTimestamp(),
    clientDecisionAtIso: submittedAtIso,
    paymentEvidence: {
      uploadId: upload.uploadId,
      url: upload.url,
      filename: upload.filename,
      contentType: upload.contentType,
      size: upload.size,
      submittedAtIso,
      ocrStatus: "pending",
      verificationStatus: "pending_manual_confirmation",
    },
    updatedAt: serverTimestamp(),
  });

  return json({
    ok: true,
    decision: "accepted",
    message: "Your quotation was accepted and your payment screenshot was submitted. MO T-SHIRT will now check it.",
  }, 200);
}
