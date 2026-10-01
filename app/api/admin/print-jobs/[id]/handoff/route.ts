import { NextResponse } from "next/server";
import { getAdminRequestSession } from "@/lib/admin-request";
import { hasAdminPageAccess } from "@/lib/admin-access";
import { HandoffError, validateHandoffAction } from "@/lib/print-job-handoff";
import { readHandoffRequest } from "@/lib/print-job-handoff-request";
import { performJobHandoff, readJobHandoff } from "@/lib/print-job-handoff-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
type Context = { params: Promise<{ id: string }> };
async function session() { const user = await getAdminRequestSession(); if (!user) throw new HandoffError("Please sign in again.", 401); if (!hasAdminPageAccess(user.allowedPages, "/admin/quotation-approval", user)) throw new HandoffError("Quotation access is required.", 403); return user; }
function failure(error: unknown) { if (error instanceof HandoffError) return json({ error: error.message }, error.status); console.error("print-job-handoff:request", error instanceof Error ? error.name : "unknown"); return json({ error: "The handoff request could not be completed. Reload before trying again." }, 500); }
export async function GET(req: Request, context: Context) {
  try { const user = await session(), { id } = await context.params; return json(await readJobHandoff(id, new URL(req.url).origin, user.isOwner)); } catch (error) { return failure(error); }
}
export async function POST(req: Request, context: Context) {
  try { const user = await session(), { id } = await context.params, input = validateHandoffAction(await readHandoffRequest(req)); return json(await performJobHandoff(id, input, { userId: user.userId, displayName: user.displayName || "Team", email: user.email || "" }, new URL(req.url).origin, user.isOwner)); } catch (error) { return failure(error); }
}
