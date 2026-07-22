import type { Metadata } from "next";
import ShopClient from "../shops/ShopClient";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Shop | MO T-SHIRT Mauritius",
  description:
    "Shop plain T-shirts in Mauritius. Choose colors, sizes, and delivery options, then order fast via WhatsApp.",
  path: "/shop",
});

export default function ShopPage() {
  return <ShopClient />;
}
