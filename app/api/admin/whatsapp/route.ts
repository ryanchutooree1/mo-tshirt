import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestSession } from "@/lib/admin-request";
import { buildWhatsAppInsights, PRODUCT_RULES } from "@/lib/whatsapp-insights";
import { loadWhatsAppArchive } from "@/lib/whatsapp-archive-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}
export async function GET(request: NextRequest) {
  const session = await getAdminRequestSession();
  if (!session) return json({ error: "Sign in to view WhatsApp insights." }, 401);
  if (!session.isOwner) return json({ error: "WhatsApp insights are available to the owner only." }, 403);
  const params = request.nextUrl.searchParams;
  const start = params.get("start") || undefined;
  const end = params.get("end") || undefined;
  const product = params.get("product") || "all";
  if ((start && !validDate(start)) || (end && !validDate(end)) || (start && end && start > end) ||
      !["all", ...PRODUCT_RULES.map(rule => rule.id)].includes(product)) return json({ error: "Invalid dashboard filters." }, 400);
  try {
    const saved = await loadWhatsAppArchive();
    if (!saved) return json({ empty: true });
    const result = buildWhatsAppInsights(saved.archive, { start, end, product });
    // The browser receives aggregate metrics only. Raw chats and source IDs stay on the server.
    const { cohorts, ...summary } = result;
    void cohorts;
    if (params.get("download") === "metrics") return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...headers, "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="whatsapp-insights.json"' },
    });
    return json(summary);
  } catch {
    return json({ error: "WhatsApp insights could not be loaded. Please try again or check the server configuration." }, 503);
  }
}
