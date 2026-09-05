import { NextResponse } from "next/server";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { getAdminRequestSession } from "@/lib/admin-request";
import { hasAdminPageAccess } from "@/lib/admin-access";
import { db } from "@/lib/firebase";
import { buildWorkItems, type WorkSource } from "@/lib/admin-workbench";

export const dynamic = "force-dynamic";
export async function GET() {
  const session = await getAdminRequestSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!hasAdminPageAccess(session.allowedPages, "/admin", session)) return NextResponse.json({ error: "Workspace access required." }, { status: 403 });
  const canQuotes = hasAdminPageAccess(session.allowedPages, "/admin/quotation-approval", session);
  const canOrders = hasAdminPageAccess(session.allowedPages, "/admin/orders", session);
  const sources = [
    { name: "quotes", allowed: canQuotes, date: "createdAt" },
    { name: "transactions", allowed: canOrders, date: "transactionDate" },
  ];
  const results = await Promise.allSettled(sources.map(async (source): Promise<WorkSource[]> => {
    if (!source.allowed) return [];
    const snap = await getDocs(query(collection(db, source.name), orderBy(source.date, "desc"), limit(500)));
    return snap.docs.map((row) => ({ id: row.id, data: row.data() }));
  }));
  const warnings: string[] = [];
  const data = results.map((result, index) => {
    if (result.status === "fulfilled") { if (result.value.length === 500) warnings.push(`Showing the latest 500 ${index ? "orders" : "quotes"}. Older records remain in All tools.`); return result.value; }
    warnings.push(`${index ? "Orders" : "Quotes"} could not load. Retry to see the complete queue.`);
    return [];
  });
  return NextResponse.json({ items: buildWorkItems(data[0], data[1]), warnings, canQuotes, canOrders, updatedAt: Date.now() }, { headers: { "Cache-Control": "private, no-store" } });
}
