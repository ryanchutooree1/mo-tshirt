import { NextResponse } from "next/server";
import {
  arrayUnion,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getAdminPasswordFromEnv } from "@/lib/admin-auth";
import { verifyManagedAdminCredentials } from "@/lib/admin-users";
import { getAdminRequestSession } from "@/lib/admin-request";
import { db } from "@/lib/firebase";
import { verifyProductionManagerPassword } from "@/lib/production-manager-auth";
import {
  isContentLengthWithinLimit,
  isRequestOriginAllowed,
} from "@/lib/request-safety";

const MAX_DECISION_REQUEST_BYTES = 16 * 1024;

function cleanString(value: unknown, maxLength = 1_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function verifyCurrentAdminPassword(
  session: NonNullable<Awaited<ReturnType<typeof getAdminRequestSession>>>,
  password: string
) {
  if (session.isOwner) {
    const expected = getAdminPasswordFromEnv();
    if (!expected) {
      throw new Error("Server is missing ADMIN_PASSWORD env.");
    }
    return password === expected;
  }

  if (session.userId === "production-manager") {
    return verifyProductionManagerPassword(password);
  }

  const managedAdmin = await verifyManagedAdminCredentials(
    session.email,
    password
  );
  return Boolean(managedAdmin);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminRequestSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }
  if (!isRequestOriginAllowed(req)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }
  if (!isContentLengthWithinLimit(req.headers, MAX_DECISION_REQUEST_BYTES)) {
    return NextResponse.json({ error: "Decision note is too large." }, { status: 413 });
  }

  const body = await req.json().catch(() => ({}));
  if (body?.action !== "record-client-decision") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  const decision = cleanString(body.decision, 30);
  const note = cleanString(body.note);
  if (decision !== "accepted" && decision !== "rejected") {
    return NextResponse.json({ error: "Choose accepted or rejected." }, { status: 400 });
  }
  if (decision === "rejected" && !note) {
    return NextResponse.json({ error: "Add the client’s rejection reason." }, { status: 400 });
  }

  try {
    const quoteRef = doc(db, "quotes", id);
    const quoteSnap = await getDoc(quoteRef);
    if (!quoteSnap.exists()) {
      return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    }

    const quoteData = quoteSnap.data() as Record<string, unknown>;
    const storedQuote =
      quoteData.quote && typeof quoteData.quote === "object" && !Array.isArray(quoteData.quote)
        ? quoteData.quote as Record<string, unknown>
        : {};
    const documentType = cleanString(storedQuote.documentType, 30) || "quotation";
    if (documentType !== "quotation") {
      return NextResponse.json(
        { error: "Client decisions can only be recorded for quotations." },
        { status: 400 }
      );
    }

    const submittedAtIso = new Date().toISOString();
    const recordedBy = {
      userId: session.userId,
      displayName: session.displayName || "Administrator",
      email: session.email,
    };
    const comment =
      note ||
      "Client confirmed acceptance on WhatsApp.";
    const historyEntry = {
      id: crypto.randomUUID(),
      action: decision === "accepted" ? "accept" : "reject",
      decision,
      comment,
      submittedAtIso,
      responseChannel: "whatsapp",
      recordedByStaff: true,
      recordedBy,
    };
    await updateDoc(quoteRef, {
      status: decision === "accepted" ? "approved" : "review",
      clientDecision: decision,
      clientDecisionComment: comment,
      clientDecisionAt: serverTimestamp(),
      clientDecisionAtIso: submittedAtIso,
      clientDecisionSource: "staff_whatsapp",
      clientDecisionRecordedBy: recordedBy,
      clientResponseHistory: arrayUnion(historyEntry),
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      decision,
      message:
        decision === "accepted"
          ? "Client acceptance recorded from WhatsApp."
          : "Client rejection recorded from WhatsApp.",
    });
  } catch (error) {
    console.error("quotes:admin:record-client-decision", error);
    return NextResponse.json(
      { error: "Failed to record the client decision." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminRequestSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const password = String(body?.password ?? "");
  if (!password) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  if (password.length > 256) {
    return NextResponse.json({ error: "Invalid password." }, { status: 400 });
  }

  try {
    if (!(await verifyCurrentAdminPassword(session, password))) {
      return NextResponse.json({ error: "Invalid administrator password." }, { status: 401 });
    }
  } catch (error) {
    console.error("quotes:admin:verify-delete", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.includes("ADMIN_PASSWORD")
            ? error.message
            : "Could not verify administrator password.",
      },
      { status: 500 }
    );
  }

  try {
    await deleteDoc(doc(db, "quotes", id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("quotes:admin:delete", error);
    return NextResponse.json({ error: "Failed to delete quote." }, { status: 500 });
  }
}
