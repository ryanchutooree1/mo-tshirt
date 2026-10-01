import { NextResponse } from "next/server";
import { getAdminRequestSession } from "@/lib/admin-request";
import { HandoffError } from "@/lib/print-job-handoff";
import { readHandoffRequest } from "@/lib/print-job-handoff-request";
import { readHandoffSettings, writeHandoffSettings } from "@/lib/print-job-handoff-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function owner() { const user = await getAdminRequestSession(); if (!user) throw new HandoffError("Please sign in again.", 401); if (!user.isOwner) throw new HandoffError("Only the owner can manage handoff recipients and delivery policy.", 403); return user; }
function failure(error: unknown) { if (error instanceof HandoffError) return json({ error: error.message }, error.status); console.error("print-job-handoff:settings", error instanceof Error ? error.name : "unknown"); return json({ error: "Handoff settings could not be loaded or saved." }, 500); }
export async function GET() { try { await owner(); return json(await readHandoffSettings()); } catch (error) { return failure(error); } }
export async function PUT(req: Request) { try { const user = await owner(); return json(await writeHandoffSettings(await readHandoffRequest(req), { userId: user.userId, displayName: user.displayName || "Owner", email: user.email || "" })); } catch (error) { return failure(error); } }
