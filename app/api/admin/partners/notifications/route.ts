import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-request";
import {
  getPartnerNotificationSettings,
  parsePartnerNotificationSettings,
  savePartnerNotificationSettings,
} from "@/lib/partner-notification-settings";

export async function GET() {
  if (!(await isAdminRequest("/api/admin/partners/notifications"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const partners = await getPartnerNotificationSettings();
    return NextResponse.json({ partners });
  } catch (error) {
    console.error("partner-notifications:get", error);
    return NextResponse.json(
      { error: "Failed to load partner notification settings." },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  if (!(await isAdminRequest("/api/admin/partners/notifications"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = parsePartnerNotificationSettings(body?.partners);

    if (parsed.invalidEntries.length) {
      return NextResponse.json(
        { error: `Invalid email address: ${parsed.invalidEntries.join(", ")}` },
        { status: 400 }
      );
    }

    if (parsed.missingEmailEntries.length) {
      return NextResponse.json(
        { error: `Add an email for: ${parsed.missingEmailEntries.join(", ")}` },
        { status: 400 }
      );
    }

    const partners = await savePartnerNotificationSettings(parsed.settings);
    return NextResponse.json({ partners });
  } catch (error) {
    console.error("partner-notifications:put", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save partner notification settings.",
      },
      { status: 500 }
    );
  }
}
