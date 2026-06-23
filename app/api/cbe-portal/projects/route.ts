import { NextResponse } from "next/server";
import { getAdminRequestSession } from "@/lib/admin-request";
import {
  createCbeProject,
  type CbeProjectEntry,
} from "@/lib/cbe-portal-postgres";

export const runtime = "nodejs";

const STATUSES = new Set(["Planning", "In progress", "Waiting", "Done"]);

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStatus(value: unknown): CbeProjectEntry["status"] {
  return typeof value === "string" && STATUSES.has(value)
    ? (value as CbeProjectEntry["status"])
    : "Planning";
}

export async function POST(req: Request) {
  if (!(await getAdminRequestSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = readText(payload.name);

  if (!name) {
    return NextResponse.json(
      { error: "Add a project name before saving." },
      { status: 400 }
    );
  }

  try {
    const project = await createCbeProject({
      name,
      owner: readText(payload.owner) || "Unassigned",
      status: readStatus(payload.status),
      dueDate: readText(payload.dueDate),
      notes: readText(payload.notes),
    });
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save project.",
      },
      { status: 500 }
    );
  }
}
