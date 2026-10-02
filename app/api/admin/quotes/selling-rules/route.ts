import { NextResponse } from "next/server";
import { getAdminRequestSession } from "@/lib/admin-request";
import { hasAdminPageAccess } from "@/lib/admin-access";
import { validateSellingRulesConfig, validateSellingRulesRevision, type SellingRulesConfig } from "@/lib/selling-rules";
import { getStoredSellingRules, saveStoredSellingRules, SellingRulesRevisionConflictError } from "@/lib/selling-rules-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 96_000;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const source = request.headers.get("origin") || request.headers.get("referer");
  if (!source) return request.method === "GET";
  try {
    return new URL(source).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function authorizedSession(request: Request, write: boolean) {
  const session = await getAdminRequestSession();
  if (!session) return { error: json({ error: "Sign in to open selling rules." }, 401) };
  if (write ? !session.isOwner : !hasAdminPageAccess(session.allowedPages, "/admin/quotation-approval", session)) {
    return { error: json({ error: write ? "Only the owner can change selling rules." : "Selling rules access is required." }, 403) };
  }
  if (new URL(request.url).searchParams.size) return { error: json({ error: "Selling rules use one company-wide document. Query parameters are not supported." }, 400) };
  return { session };
}

class InvalidRequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

async function readLimitedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new InvalidRequestError("Send selling rules and their revision.");
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => null);
        throw new InvalidRequestError("The selling rules request is too large.", 413);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size)));
  } catch {
    throw new InvalidRequestError("Send valid JSON selling rules.");
  }
}

export async function GET(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origin not allowed." }, 403);
  try {
    const auth = await authorizedSession(request, false);
    if (auth.error) return auth.error;
    return json({ ...(await getStoredSellingRules()), canEdit: auth.session.isOwner, viewerId: auth.session.userId });
  } catch {
    // Never return database, identity, connection, or saved commercial details.
    return json({ error: "Selling rules could not be loaded. Please try again; no saved rules have been changed." }, 503);
  }
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origin not allowed." }, 403);
  let auth: Awaited<ReturnType<typeof authorizedSession>>;
  try {
    auth = await authorizedSession(request, true);
  } catch {
    return json({ error: "Your session could not be checked. Please try again." }, 503);
  }
  if (auth.error) return auth.error;
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return json({ error: "Use an application/json request." }, 415);
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || !Number.isSafeInteger(Number(contentLength)))) return json({ error: "Invalid request size." }, 400);
  if (contentLength !== null && Number(contentLength) > MAX_REQUEST_BYTES) return json({ error: "The selling rules request is too large." }, 413);

  let config: SellingRulesConfig;
  let revision: number;
  try {
    const body = await readLimitedJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new InvalidRequestError("Send selling rules and their revision.");
    const record = body as Record<string, unknown>;
    if (Object.keys(record).length !== 2 || !Object.hasOwn(record, "config") || !Object.hasOwn(record, "revision")) throw new InvalidRequestError("Only config and revision may be submitted.");
    revision = validateSellingRulesRevision(record.revision);
    config = validateSellingRulesConfig(record.config);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid selling rules." }, error instanceof InvalidRequestError ? error.status : 400);
  }

  try {
    return json({ ...(await saveStoredSellingRules(config, revision, { userId: auth.session.userId, displayName: auth.session.displayName })), canEdit: true, viewerId: auth.session.userId });
  } catch (error) {
    if (error instanceof SellingRulesRevisionConflictError) return json({ code: "REVISION_CONFLICT", error: error.message }, 409);
    return json({ error: "Selling rules could not be saved. Keep your draft open and reload the latest rules before trying again." }, 503);
  }
}
