import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-request";
import { db } from "@/lib/firebase";
import { getPrintPartnerRegistry } from "@/lib/partner-registry";
import { mapTanviQuote } from "@/lib/tanvi-quotes";

export async function GET() {
  if (!(await isAdminRequest("/api/admin/tanvi/quotes"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const [registry, snap] = await Promise.all([
      getPrintPartnerRegistry({ includeInactive: true }),
      getDocs(query(collection(db, "quotes"), orderBy("createdAt", "desc"))),
    ]);

    const quotes = snap.docs.map((docSnap) =>
      mapTanviQuote(docSnap.id, docSnap.data(), registry.partners)
    );

    return NextResponse.json({
      manager: registry.manager,
      partners: registry.partners,
      quotes,
    });
  } catch (error) {
    console.error("tanvi:quotes:get", error);
    return NextResponse.json(
      { error: "Failed to load Tanvi desk." },
      { status: 500 }
    );
  }
}
