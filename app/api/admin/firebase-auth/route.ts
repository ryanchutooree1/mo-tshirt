import { NextResponse } from "next/server";
import { canUseSharedStorageAuth } from "@/lib/admin-access";
import { getAdminRequestSession } from "@/lib/admin-request";

export async function GET() {
  const session = await getAdminRequestSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (
    !canUseSharedStorageAuth(session.allowedPages, {
      isOwner: session.isOwner,
    })
  ) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const email =
    process.env.NEXT_PUBLIC_FIREBASE_ADMIN_EMAIL?.trim() ||
    "motshirtmauritius@gmail.com";

  return NextResponse.json({
    configured: Boolean(email),
    email,
  });
}
