import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Sora } from "next/font/google";
import PremiumDesignStudioClient from "@/components/PremiumDesignStudioClient";

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
    <main className={`ceo-theme ${sora.variable} ${plusJakartaSans.variable}`}>
      <PremiumDesignStudioClient />
    </main>
  );
}
