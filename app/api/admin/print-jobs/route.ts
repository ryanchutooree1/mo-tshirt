import { NextResponse } from "next/server";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { getAdminRequestSession } from "@/lib/admin-request";
import { hasAdminPageAccess } from "@/lib/admin-access";
import { db } from "@/lib/firebase";
import { buildPrintJobs, buildPendingEmailJobs, type PrintJobSource } from "@/lib/print-job-workflow";

import { listEmailIntake } from "@/lib/email-intake";

export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const session = await getAdminRequestSession();
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401, headers });
  const canQuotes = hasAdminPageAccess(session.allowedPages, "/admin/quotation-approval", session);
  const canOrders = hasAdminPageAccess(session.allowedPages, "/admin/orders", session);
  if (!canQuotes && !canOrders) return NextResponse.json({ error: "Quote or order access required." }, { status: 403, headers });
  const canInbox = canQuotes && hasAdminPageAccess(session.allowedPages, "/admin/inbox", session);
  const emailResult = canInbox ? listEmailIntake().then((value) => ({ value, failed: false })).catch(() => ({ value: { enquiries: [], lastSyncAt: null, error: "" }, failed: true })) : Promise.resolve({ value: { enquiries: [], lastSyncAt: null, error: "" }, failed: false });
  const sources = [
    { name: "quotes", allowed: canQuotes, date: "createdAt", label: "quotes" },
    { name: "transactions", allowed: canOrders, date: "transactionDate", label: "orders" },
  ];
  const results = await Promise.allSettled(sources.map(async (source): Promise<PrintJobSource[]> => {
    if (!source.allowed) return [];
    const snapshot = await getDocs(query(collection(db, source.name), orderBy(source.date, "desc"), limit(500)));
    return snapshot.docs.map((row) => ({ id: row.id, data: row.data() }));
  }));
  const warnings: string[] = [];
  const data = results.map((result, index) => {
    if (result.status === "fulfilled") {
      if (result.value.length === 500) warnings.push(`Showing the latest 500 ${sources[index].label}. Older records remain in the existing tools.`);
      return result.value;
    }
    warnings.push(`${index ? "Orders" : "Quotes"} could not load. Retry to see the complete workspace.`);
    return [];
  });
  const email = await emailResult;
  if (email.failed) warnings.push("Email enquiries could not load. Retry to see all requests.");
  if (email.value.error) warnings.push(`Email sync: ${email.value.error}`);
  if (email.value.enquiries.length >= 200) warnings.push("Showing up to 200 email enquiries. More may remain in the inbox.");
  const items = [...buildPrintJobs(data[0], data[1]), ...buildPendingEmailJobs(email.value.enquiries, data[0].map((entry) => entry.id))].sort((a, b) => Number(b.urgent) - Number(a.urgent) || Number(b.overdue) - Number(a.overdue) || Number(b.attention) - Number(a.attention) || b.lastActivity - a.lastActivity);
  return NextResponse.json({ items, warnings, canQuotes, canOrders, canInbox, enquiries: email.value.enquiries, lastEmailSync: email.value.lastSyncAt, updatedAt: Date.now() }, { headers });
}
