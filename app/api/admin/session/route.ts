import { NextResponse } from "next/server";
import { getAdminRequestSession } from "@/lib/admin-request";

export async function GET() {
  const session = await getAdminRequestSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json({
    session: {
      userId: session.userId,
      displayName: session.displayName,
      email: session.email,
      allowedPages: session.allowedPages,
      isOwner: session.isOwner,
    },
  });
}
