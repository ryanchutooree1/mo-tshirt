import { NextResponse } from "next/server";
import { shopCollection, logShopServerError } from "@/lib/shops-server";
import {
  getQuoteColorOptionsByGarment,
  sortQuoteColors,
  type QuoteGarmentOption,
} from "@/lib/shops";

export const dynamic = "force-dynamic";

type QuoteOptionSource = {
  title: string;
  colors: string[];
};

type QuoteOptionsResponse = {
  colors: string[];
  colorsByGarment: Record<QuoteGarmentOption, string[]>;
};

export const runtime = "nodejs";

export async function GET() {
  try {
    const snap = await shopCollection().where("isActive", "==", true).get();

    const items: QuoteOptionSource[] = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        title: String(data.title ?? ""),
        colors: Array.isArray(data.colors)
          ? data.colors.map((entry) => String(entry || "").trim()).filter(Boolean)
          : [],
      };
    });

    const response: QuoteOptionsResponse = {
      colors: sortQuoteColors(items.flatMap((item) => item.colors)),
      colorsByGarment: getQuoteColorOptionsByGarment(items),
    };

    return NextResponse.json(response);
  } catch (error) {
    logShopServerError("firestore", error);
    return NextResponse.json(
      { error: "Failed to load quote options." },
      { status: 500 }
    );
  }
}
