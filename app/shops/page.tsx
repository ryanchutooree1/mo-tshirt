import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import ShopClient from "./ShopClient";

export const metadata: Metadata = buildPageMetadata({
  title: "Shops | MO T-SHIRT Mauritius",
  description:
    "Shop plain T-shirts in Mauritius. Choose colors, sizes, and delivery options, then order fast via WhatsApp.",
  path: "/shops",
});

export default function ShopsPage() {
  return <ShopClient />;
}
