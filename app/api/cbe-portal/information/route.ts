import { NextResponse } from "next/server";
import { getAdminRequestSession } from "@/lib/admin-request";
import { createCbeInformation } from "@/lib/cbe-portal-postgres";

export const runtime = "nodejs";

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  if (!(await getAdminRequestSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = readText(payload.title);
  const email = readText(payload.email);

  if (!title && !email) {
    return NextResponse.json(
      { error: "Add a title or email before saving." },
      { status: 400 }
    );
  }

  try {
    const entry = await createCbeInformation({
      title: title || "Untitled information",
      email,
      password: typeof payload.password === "string" ? payload.password : "",
      notes: readText(payload.notes),
    });
    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save information.",
      },
      { status: 500 }
    );
  }
}
