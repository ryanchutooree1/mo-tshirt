import type { Metadata } from "next";
import ShopClient from "./ShopClient";

export const metadata: Metadata = {
  title: "Shops | MO T-SHIRT Mauritius",
  description:
    "Shop plain T-shirts in Mauritius. Choose colors, sizes, and delivery options, then order fast via WhatsApp.",
  alternates: {
    canonical: "https://www.mo-tshirt.mu/shops",
  },
};

export default function ShopsPage() {
  return <ShopClient />;
}
