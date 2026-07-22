import type { Metadata } from "next";
import ShopClient from "../shops/ShopClient";
import { readyMadeUniforms } from "@/data/ready-made-uniforms";
import {
  getReadyMadeUniformItems,
  mapReadyMadeUniformDoc,
} from "@/lib/ready-made-uniforms-store";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Shop Plain Apparel & Uniform Designs | MO T-SHIRT Mauritius",
  description:
    "Shop plain T-shirts, polos, caps, and ready-made uniform designs in Mauritius, with fast ordering and customization from MO T-SHIRT.",
  path: "/shop",
});

export const dynamic = "force-dynamic";

async function loadUniforms() {
  try {
    return await getReadyMadeUniformItems();
  } catch (error) {
    console.error("shop:ready-made-uniforms", error);
    return readyMadeUniforms.map((uniform, index) =>
      mapReadyMadeUniformDoc(uniform.code, {
        ...uniform,
        isActive: true,
        position: (readyMadeUniforms.length - index) * 1000,
      })
    );
  }
}

export default async function ShopPage() {
  const uniforms = await loadUniforms();

  return <ShopClient uniforms={uniforms} />;
}
