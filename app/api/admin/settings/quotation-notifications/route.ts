import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-request";
import {
  getQuotationNotificationRecipients,
  parseQuotationNotificationRecipients,
  saveQuotationNotificationRecipients,
} from "@/lib/quotation-notification-settings";

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const recipients = await getQuotationNotificationRecipients();
    return NextResponse.json({ recipients });
  } catch (error) {
    console.error("quotation-notifications:get", error);
    return NextResponse.json(
      { error: "Failed to load quotation notification emails." },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = parseQuotationNotificationRecipients(body?.recipients);

    if (parsed.invalidEntries.length) {
      return NextResponse.json(
        {
          error: `Invalid email address${parsed.invalidEntries.length > 1 ? "es" : ""}: ${parsed.invalidEntries.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (!parsed.recipients.length) {
      return NextResponse.json(
        { error: "Add at least one email recipient." },
        { status: 400 }
      );
    }

    const recipients = await saveQuotationNotificationRecipients(parsed.recipients);
    return NextResponse.json({ recipients });
  } catch (error) {
    console.error("quotation-notifications:put", error);
    return NextResponse.json(
      { error: "Failed to save quotation notification emails." },
      { status: 500 }
    );
  }
}
