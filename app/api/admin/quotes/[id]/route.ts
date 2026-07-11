import { NextResponse } from "next/server";
import { deleteDoc, doc } from "firebase/firestore";
import { getAdminPasswordFromEnv } from "@/lib/admin-auth";
import { verifyManagedAdminCredentials } from "@/lib/admin-users";
import { getAdminRequestSession } from "@/lib/admin-request";
import { db } from "@/lib/firebase";
import { verifyProductionManagerPassword } from "@/lib/production-manager-auth";

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
