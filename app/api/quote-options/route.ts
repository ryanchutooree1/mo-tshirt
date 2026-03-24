import { NextResponse } from "next/server";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
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

export async function GET() {
  try {
    const snap = await getDocs(
      query(collection(db, "shops"), where("isActive", "==", true))
    );

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
    console.error("quote-options:get", error);
    return NextResponse.json(
      { error: "Failed to load quote options." },
      { status: 500 }
    );
  }
}
