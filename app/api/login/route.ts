import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const password = String(body?.password ?? "");
    const expected = process.env.ADMIN_PASSWORD || process.env.NEXT_ADMIN_PASSWORD || "";

    if (!expected) {
      return NextResponse.json(
        { error: "Server is missing ADMIN_PASSWORD env." },
        { status: 500 }
      );
    }

    if (password !== expected) {
      return NextResponse.json({ error: "Invalid password." }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    // Set a short-lived auth cookie; adjust maxAge as needed
    res.cookies.set("admin-auth", "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8, // 8 hours
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
}
