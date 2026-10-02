import { NextResponse } from "next/server";
import { getAdminRequestSession } from "@/lib/admin-request";
import { hasAdminPageAccess } from "@/lib/admin-access";
import { HandoffError } from "@/lib/print-job-handoff";
import { isContentLengthWithinLimit, isRequestOriginAllowed } from "@/lib/request-safety";
import { addProductionArtwork, MAX_PRODUCTION_ARTWORK_REQUEST_BYTES } from "@/lib/production-artwork-upload-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function boundedForm(req: Request) {
  if (!isRequestOriginAllowed(req) || req.headers.get("sec-fetch-site") === "cross-site") throw new HandoffError("Origin not allowed.", 403);
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) throw new HandoffError("Choose a print file using the upload form.", 415);
  if (!isContentLengthWithinLimit(req.headers, MAX_PRODUCTION_ARTWORK_REQUEST_BYTES)) throw new HandoffError("Upload request is too large.", 413);
  if (!req.body) throw new HandoffError("Choose a print file.");
  const reader = req.body.getReader(), chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_PRODUCTION_ARTWORK_REQUEST_BYTES) { await reader.cancel(); throw new HandoffError("Upload request is too large.", 413); }
      chunks.push(Buffer.from(chunk.value));
    }
  } finally { reader.releaseLock(); }
  try { return await new Response(Buffer.concat(chunks), { headers: { "content-type": req.headers.get("content-type")! } }).formData(); }
  catch { throw new HandoffError("The upload form could not be read."); }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAdminRequestSession();
    if (!user) throw new HandoffError("Please sign in again.", 401);
    if (!hasAdminPageAccess(user.allowedPages, "/admin/quotation-approval", user)) throw new HandoffError("Quote workspace access is required.", 403);
    const { id } = await params, form = await boundedForm(req);
    const keys = ["file", "role", "expectedVersion", "packetFingerprint", "requestId"];
    if ([...form.keys()].some(key => !keys.includes(key)) || keys.some(key => form.getAll(key).length !== 1)) throw new HandoffError("Provide one print file and its current job details.");
    const file = form.get("file"), role = form.get("role"), expectedVersion = form.get("expectedVersion"), packetFingerprint = form.get("packetFingerprint"), requestId = form.get("requestId");
    if (!(file instanceof File) || role !== "print-artwork" || typeof expectedVersion !== "string" || !/^\d{1,15}$/.test(expectedVersion) || typeof packetFingerprint !== "string" || typeof requestId !== "string") throw new HandoffError("Choose a file and explicitly confirm it is print artwork.");
    return json(await addProductionArtwork(id, { buffer: Buffer.from(await file.arrayBuffer()), filename: file.name, contentType: file.type, role, expectedVersion: Number(expectedVersion), packetFingerprint, requestId }, { userId: user.userId, displayName: user.displayName || "Team", email: user.email || "" }));
  } catch (error) {
    if (error instanceof HandoffError) return json({ error: error.message }, error.status);
    console.error("production-artwork:upload-unconfirmed", error instanceof Error ? error.name : "unknown");
    return json({ error: "The upload could not be confirmed. Retry with the same selected file and check the job before starting another upload." }, 500);
  }
}
