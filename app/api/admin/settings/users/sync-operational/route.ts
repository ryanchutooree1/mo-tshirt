import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-request";
import { ensureFirebaseAdminUser } from "@/lib/admin-users";
import { getPrintPartnerRegistry } from "@/lib/partner-registry";

export async function POST() {
  if (!(await isAdminRequest("/api/admin/settings/users/sync-operational"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { manager, partners } = await getPrintPartnerRegistry({ includeInactive: true });
    const synced = [];
    const skipped = [];

    if (manager.email.trim()) {
      synced.push(await ensureFirebaseAdminUser({
        email: manager.email,
        username: "tanvi",
        displayName: manager.name,
        allowedPages: ["/admin/tanvi", "/admin/quotation-approval", "/admin/couple-goals"],
        isActive: true,
      }));
    } else {
      skipped.push(manager.name);
    }

    for (const partner of partners) {
      if (!partner.email.trim()) {
        skipped.push(partner.name);
        continue;
      }
      synced.push(await ensureFirebaseAdminUser({
        email: partner.email,
        username: partner.id,
        displayName: partner.name,
        allowedPages: ["/admin/tanvi"],
        isActive: partner.active,
      }));
    }

    return NextResponse.json({ synced, skipped });
  } catch (error) {
    console.error("admin-users:sync-operational", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to sync Firebase users." }, { status: 400 });
  }
}
