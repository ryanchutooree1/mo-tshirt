import type { Metadata } from "next";
import PremiumDesignStudioClient from "@/components/PremiumDesignStudioClient";

const pageTitle = "Design Studio | MO Admin";
const pageDescription = "Internal MO admin testing workspace for Design Studio.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminDesignStudioPage() {
  return (
    <main className="ceo-theme studio-fonts">
      <PremiumDesignStudioClient />
    </main>
  );
}
