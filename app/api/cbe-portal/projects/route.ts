import { NextResponse } from "next/server";
import {
  createCbeProject,
  type CbeProjectEntry,
} from "@/lib/cbe-portal-postgres";

export const runtime = "nodejs";

const PRIORITIES = new Set(["Normal", "Important", "Urgent"]);

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readPriority(value: unknown): CbeProjectEntry["priority"] {
  return typeof value === "string" && PRIORITIES.has(value)
    ? (value as CbeProjectEntry["priority"])
    : "Normal";
}

export async function POST(req: Request) {
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
      priority: readPriority(payload.priority),
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
