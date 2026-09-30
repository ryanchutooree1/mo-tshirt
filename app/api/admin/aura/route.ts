import { NextResponse } from "next/server";
import { getAdminRequestSession } from "@/lib/admin-request";
import { hasAdminPageAccess } from "@/lib/admin-access";
import { validateAuraWorkspace, type AuraWorkspace } from "@/lib/aura";
import {
  AuraRevisionConflictError,
  getStoredAuraWorkspace,
  saveStoredAuraWorkspace,
} from "@/lib/aura-store";
import { isContentLengthWithinLimit } from "@/lib/request-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 1_000_000;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const source =
    request.headers.get("origin") || request.headers.get("referer");
  if (!source) return true;
  try {
    return new URL(source).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function authorizedSession(request: Request) {
  const session = await getAdminRequestSession();
  if (!session)
    return {
      error: json({ error: "Sign in to open your Aura workspace." }, 401),
    };
  if (
    !hasAdminPageAccess(session.allowedPages, "/admin/x5-execution", {
      isOwner: session.isOwner,
    })
  ) {
    return {
      error: json({ error: "You do not have access to Aura Farming." }, 403),
    };
  }
  // There is deliberately no owner/admin exception for other people's documents.
  if (new URL(request.url).searchParams.size) {
    return {
      error: json(
        {
          error:
            "Aura workspaces always belong to the signed-in user. Query parameters are not supported.",
        },
        400,
      ),
    };
  }
  return { session };
}

async function readLimitedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("A JSON workspace is required.");
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => null);
        throw new Error("The workspace request is too large.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks, total).toString("utf8"));
  } catch {
    throw new Error("Send a valid JSON workspace.");
  }
}

export async function GET(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origin not allowed." }, 403);
  const auth = await authorizedSession(request);
  if (auth.error) return auth.error;
  try {
    return json({
      ...(await getStoredAuraWorkspace(auth.session.userId)),
      accountScope: auth.session.userId,
    });
  } catch (error) {
    console.error("aura:get", error);
    return json(
      {
        error:
          "Your workspace could not be loaded. Please try again. No saved data has been changed.",
      },
      503,
    );
  }
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origin not allowed." }, 403);
  const auth = await authorizedSession(request);
  if (auth.error) return auth.error;
  if (!isContentLengthWithinLimit(request.headers, MAX_REQUEST_BYTES)) {
    return json({ error: "The workspace request is too large." }, 400);
  }
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    return json({ error: "Use an application/json workspace request." }, 400);
  }

  let workspace: AuraWorkspace;
  let revision: number;
  try {
    const body = await readLimitedJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("Send a workspace and its revision.");
    const record = body as Record<string, unknown>;
    if (
      Object.keys(record).some(
        (key) =>
          key !== "workspace" && key !== "revision" && key !== "accountScope",
      )
    ) {
      throw new Error(
        "Only workspace, revision, and accountScope may be submitted. The signed-in user is selected automatically.",
      );
    }
    if (
      typeof record.accountScope !== "string" ||
      !record.accountScope ||
      record.accountScope.length > 254
    ) {
      throw new Error(
        "Use the account scope returned when your workspace was loaded.",
      );
    }
    // Scope is an equality guard for an already-loaded draft, never a target ID.
    // Switching the login cookie must not copy the previous user's draft into
    // the newly signed-in user's workspace, even if their revisions coincide.
    if (record.accountScope !== auth.session.userId) {
      return json(
        {
          code: "ACCOUNT_CHANGED",
          error:
            "The signed-in account changed. This draft was not saved. Close it and reload before opening the current account's workspace.",
        },
        409,
      );
    }
    if (
      typeof record.revision !== "number" ||
      !Number.isSafeInteger(record.revision) ||
      record.revision < 0 ||
      record.revision >= Number.MAX_SAFE_INTEGER
    ) {
      throw new Error(
        "Use the revision returned when your workspace was loaded.",
      );
    }
    revision = record.revision;
    workspace = validateAuraWorkspace(record.workspace);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Invalid workspace." },
      400,
    );
  }

  try {
    return json({
      ...(await saveStoredAuraWorkspace(
        auth.session.userId,
        workspace,
        revision,
      )),
      accountScope: auth.session.userId,
    });
  } catch (error) {
    if (error instanceof AuraRevisionConflictError)
      return json({ error: error.message }, 409);
    console.error("aura:put", error);
    return json(
      {
        error:
          "Your changes could not be saved. Keep this page open and retry when the connection is available.",
      },
      503,
    );
  }
}
