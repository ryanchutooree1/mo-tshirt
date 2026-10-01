import { HandoffError } from "./print-job-handoff";
import { isContentLengthWithinLimit, isRequestOriginAllowed } from "./request-safety";
export async function readHandoffRequest(req: Request) {
  if (!isRequestOriginAllowed(req)) throw new HandoffError("Origin not allowed.", 403);
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new HandoffError("Use a JSON request.", 415);
  const max = 16 * 1024;
  if (!isContentLengthWithinLimit(req.headers, max)) throw new HandoffError("Request too large.", 413);
  if (!req.body) throw new HandoffError("Provide a request body.");
  const reader = req.body.getReader(), decoder = new TextDecoder();
  let size = 0, value = "";
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > max) { await reader.cancel(); throw new HandoffError("Request too large.", 413); } value += decoder.decode(chunk.value, { stream: true }); }
    value += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(value) as unknown; } catch { throw new HandoffError("Invalid JSON request."); }
}
