import { NextResponse } from "next/server";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { verifyQuoteResponseLink } from "@/lib/quote-response-links";
import { buildSavedQuotationPdf } from "@/lib/quotation-pdf";

type RouteContext = { params: Promise<{ id: string }> };

function cleanFilename(value: unknown) {
  const filename = typeof value === "string" ? value.trim() : "";
  return (filename || "quotation").replace(/[^a-z0-9._-]/gi, "-");
}

export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  const expires = url.searchParams.get("expires") || "";
  const token = url.searchParams.get("token") || "";

  try {
    if (!verifyQuoteResponseLink({ quoteId: id, action, expires, token })) {
      return NextResponse.json({ error: "This quotation link is invalid or has expired." }, { status: 403 });
    }

    const snapshot = await getDoc(doc(db, "quotes", id));
    if (!snapshot.exists()) {
      return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    }

    const data = snapshot.data() as Record<string, unknown>;
    const quote = data.quote && typeof data.quote === "object" && !Array.isArray(data.quote)
      ? data.quote as Record<string, unknown>
      : {};
    const buffer = buildSavedQuotationPdf(data);
    const filename = `${cleanFilename(quote.documentNumber || id)}.pdf`;

    return new NextResponse(buffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(buffer.byteLength),
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    console.error("quotes:document:get", error);
    return NextResponse.json({ error: "Could not load this quotation PDF." }, { status: 500 });
  }
}
