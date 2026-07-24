import { NextResponse } from "next/server";
import { getAdminRequestSession } from "@/lib/admin-request";
import { runInventoryPhotoRetentionCleanup } from "@/lib/inventory-photo-retention";

export const maxDuration = 60;

export async function POST() {
  const session = await getAdminRequestSession();
  if (!session?.isOwner) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  try {
    const result = await runInventoryPhotoRetentionCleanup();
    return NextResponse.json({ result });
  } catch (error) {
    console.error("mob-settings:cleanup", error);
    return NextResponse.json(
      { error: "Failed to run photo cleanup." },
      { status: 500 }
    );
  }
}
