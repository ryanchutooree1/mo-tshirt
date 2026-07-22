import type { Metadata } from "next";
import ShopClient from "../shops/ShopClient";
import { readyMadeUniforms } from "@/data/ready-made-uniforms";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Shop Plain Apparel & Uniform Designs | MO T-SHIRT Mauritius",
  description:
    "Shop plain T-shirts, polos, caps, and ready-made uniform designs in Mauritius, with fast ordering and customization from MO T-SHIRT.",
  path: "/shop",
});

export default function ShopPage() {
  return <ShopClient uniformDesignCount={readyMadeUniforms.length} />;
}
