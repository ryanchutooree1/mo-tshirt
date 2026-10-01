import { NextResponse } from "next/server";
import { doc, getDoc } from "firebase/firestore";
import { getAdminRequestSession } from "@/lib/admin-request";
import { hasAdminPageAccess } from "@/lib/admin-access";
import { db } from "@/lib/firebase";
import { buildSavedQuotationPdf } from "@/lib/quotation-pdf";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminRequestSession();
  if (!session) return json({ error: "Please sign in again." }, 401);
  if (!hasAdminPageAccess(session.allowedPages, "/admin/quotation-approval", session)) return json({ error: "Quotation access is required." }, 403);
  const { id } = await params;
  if (!id || id.length > 180 || /[\/\\\u0000-\u001f]/.test(id)) return json({ error: "Invalid quote ID." }, 400);
  try {
    const snapshot = await getDoc(doc(db, "quotes", id));
    if (!snapshot.exists()) return json({ error: "Quotation not found." }, 404);
    const data = snapshot.data(), draft = data.quote && typeof data.quote === "object" ? data.quote as Record<string, unknown> : {};
    if (!["quotation", "invoice"].includes(typeof draft.documentType === "string" ? draft.documentType : "quotation")) return json({ error: "This view supports quotations and invoices only. Receipt generation is not part of handoff." }, 409);
    const buffer = buildSavedQuotationPdf(data), filename = `${String(draft.documentNumber || id).replace(/[^a-z0-9._-]/gi, "-")}.pdf`;
    return new NextResponse(buffer, { headers: { "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`, "Content-Length": String(buffer.byteLength), "Content-Type": "application/pdf", "X-Content-Type-Options": "nosniff" } });
  } catch { return json({ error: "The saved document could not be loaded." }, 500); }
}
