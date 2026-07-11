import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-request";
import {
  createAdminUser,
  listAdminUsers,
  updateAdminUser,
} from "@/lib/admin-users";
import { defaultAdminProfile, normalizeAdminProfile } from "@/lib/admin-profile";
import { getStoredAdminProfiles } from "@/lib/admin-profile-store";

export async function GET() {
  if (!(await isAdminRequest("/api/admin/settings/users"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const users = await listAdminUsers();
    const profiles = await getStoredAdminProfiles(users.map((user) => user.email));
    return NextResponse.json({
      users: users.map((user) => ({
        ...user,
        profile: normalizeAdminProfile(
          profiles[user.email],
          defaultAdminProfile({ displayName: user.displayName, isOwner: false })
        ),
      })),
    });
  } catch (error) {
    console.error("admin-settings-users:get", error);
    return NextResponse.json(
      { error: "Failed to load admin users." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!(await isAdminRequest("/api/admin/settings/users"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const user = await createAdminUser({
      email: String(body?.email ?? ""),
      displayName: String(body?.displayName ?? ""),
      password: String(body?.password ?? ""),
      allowedPages: body?.allowedPages,
    });

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create admin user.",
      },
      { status: 400 }
    );
  }
}

export async function PATCH(req: Request) {
  if (!(await isAdminRequest("/api/admin/settings/users"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const user = await updateAdminUser({
      email: String(body?.email ?? ""),
      displayName:
        typeof body?.displayName === "string" ? body.displayName : undefined,
      password: typeof body?.password === "string" ? body.password : undefined,
      allowedPages: body?.allowedPages,
      isActive:
        typeof body?.isActive === "boolean" ? body.isActive : undefined,
    });

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update admin user.",
      },
      { status: 400 }
    );
  }
}
