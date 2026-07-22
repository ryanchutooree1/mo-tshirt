import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Sora } from "next/font/google";
import PremiumDesignStudioClient from "@/components/PremiumDesignStudioClient";
import { buildPageMetadata } from "@/lib/seo";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-studio-display",
  weight: ["400", "600", "700"],
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-studio-body",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

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
    <main className={`ceo-theme ${sora.variable} ${plusJakartaSans.variable}`}>
      <PremiumDesignStudioClient
        backHref="/shops"
        backLabel="Back to shops"
        initialShopItemId={shopItem}
        requestSource="Public Design Studio"
      />
    </main>
  );
}
