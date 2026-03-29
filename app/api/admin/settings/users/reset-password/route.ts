import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-request";
import { sendAdminUserPasswordReset } from "@/lib/admin-users";

export async function POST(req: Request) {
  if (!(await isAdminRequest("/api/admin/settings/users/reset-password"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const user = await sendAdminUserPasswordReset(String(body?.email ?? ""));
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send password reset email.",
      },
      { status: 400 }
    );
  }
}
