import type { Metadata } from "next";
import PremiumDesignStudioClient from "@/components/PremiumDesignStudioClient";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Design Studio | Custom T-Shirts Mauritius",
  description:
    "Design the real plain T-shirts and poloshirts available from MO T-Shirt Mauritius, using current shop colours, sizes, and garment photos.",
  path: "/design-studio",
});

type DesignStudioPageProps = {
  searchParams: Promise<{ shopItem?: string | string[] }>;
};

export default async function DesignStudioPage({ searchParams }: DesignStudioPageProps) {
  const query = await searchParams;
  const shopItem = Array.isArray(query.shopItem) ? query.shopItem[0] : query.shopItem;

  return (
    <main className="ceo-theme studio-fonts">
      <PremiumDesignStudioClient
        backHref="/shop"
        backLabel="Back to shop"
        initialShopItemId={shopItem}
        requestSource="Public Design Studio"
      />
    </main>
  );
}
