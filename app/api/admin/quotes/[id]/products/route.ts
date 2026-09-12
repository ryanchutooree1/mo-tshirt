import { NextResponse } from "next/server";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAdminRequestSession } from "@/lib/admin-request";
import { hasAdminPageAccess } from "@/lib/admin-access";
import { isRequestOriginAllowed } from "@/lib/request-safety";
import {
  getProductEditor,
  object,
  QuoteEditError,
} from "@/lib/quote-product-edit";
import { applyQuoteEdit } from "@/lib/quote-product-edit-store";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function actor() {
  const session = await getAdminRequestSession();
  if (!session)
    throw new QuoteEditError("Sign in to edit this quotation.", 401);
  if (
    !hasAdminPageAccess(
      session.allowedPages,
      "/admin/quotation-approval",
      session,
    )
  )
    throw new QuoteEditError("Quotation access is required.", 403);
  return {
    userId: session.userId,
    displayName: session.displayName || "Administrator",
    email: session.email,
  };
}
const failure = (error: unknown) =>
  json(
    {
      error:
        error instanceof QuoteEditError
          ? error.message
          : "Could not update quotation details. Please try again.",
    },
    error instanceof QuoteEditError ? error.status : 500,
  );
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await actor();
    const { id } = await params;
    const ref = doc(db, "quotes", id),
      snap = await getDoc(ref);
    if (!snap.exists()) return json({ error: "Quotation not found." }, 404);
    const cursor = new URL(req.url).searchParams.get("before");
    if (cursor && (!Number.isSafeInteger(Number(cursor)) || Number(cursor) < 1))
      return json({ error: "Invalid history page." }, 400);
    const history = await getDocs(
      query(
        collection(ref, "editHistory"),
        orderBy("sequence", "desc"),
        ...(cursor ? [startAfter(Number(cursor))] : []),
        limit(21),
      ),
    );
    const rows = history.docs
      .slice(0, 20)
      .map((row) => ({ id: row.id, ...row.data() }));
    return json({
      editor: getProductEditor(snap.data()),
      history: rows,
      nextCursor:
        history.docs.length > 20 ? history.docs[19].data().sequence : null,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const who = await actor();
    if (!isRequestOriginAllowed(req))
      throw new QuoteEditError("Origin not allowed.", 403);
    const raw = await req.text();
    if (raw.length > 500000)
      throw new QuoteEditError("Edit is too large.", 413);
    let body;
    try {
      body = object(JSON.parse(raw));
    } catch {
      throw new QuoteEditError("Invalid edit request.");
    }
    const { id } = await params;
    return json(await applyQuoteEdit(id, body, who));
  } catch (error) {
    return failure(error);
  }
}
