import { NextResponse } from "next/server";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAdminRequestSession } from "@/lib/admin-request";
import { getMobInventorySettings } from "@/lib/inventory-photo-retention";
import {
  MOB_INVENTORY_SETTINGS_ID,
  MOB_SETTINGS_COLLECTION,
  mapMobInventorySettings,
  parseMobInventorySettings,
} from "@/lib/mob-inventory";

export const dynamic = "force-dynamic";

async function isOwner() {
  return Boolean((await getAdminRequestSession())?.isOwner);
}

export async function GET() {
  if (!(await isOwner())) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  try {
    return NextResponse.json(
      { settings: await getMobInventorySettings() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("mob-settings:get", error);
    return NextResponse.json(
      { error: "Failed to load mobile shop settings." },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  try {
    const parsed = parseMobInventorySettings(
      await req.json().catch(() => ({}))
    );
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const updatedAtIso = new Date().toISOString();
    await setDoc(
      doc(db, MOB_SETTINGS_COLLECTION, MOB_INVENTORY_SETTINGS_ID),
      {
        ...parsed.data,
        updatedAt: serverTimestamp(),
        updatedAtIso,
      },
      { merge: true }
    );

    return NextResponse.json({
      settings: mapMobInventorySettings({
        ...parsed.data,
        updatedAtIso,
      }),
    });
  } catch (error) {
    console.error("mob-settings:update", error);
    return NextResponse.json(
      { error: "Failed to save mobile shop settings." },
      { status: 500 }
    );
  }
}
