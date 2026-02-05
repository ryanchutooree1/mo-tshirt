import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Sora } from "next/font/google";
import DesignStudioClient from "@/components/DesignStudioClient";

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

const pageTitle = "Design Studio | MO T-SHIRT Mauritius";
const pageDescription =
  "Build your custom T-shirt, polo, or hoodie with MO T-SHIRT Design Studio. Live preview, instant pricing, and direct quote submission in Mauritius.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: {
    canonical: "https://www.mo-tshirt.mu/design-studio",
  },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: "https://www.mo-tshirt.mu/design-studio",
    siteName: "MO T-SHIRT",
    images: [{ url: "/all_products.jpg" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
    images: ["/all_products.jpg"],
  },
};

export default function DesignStudioPage() {
  return (
    <main className={`${sora.variable} ${plusJakartaSans.variable}`}>
      <DesignStudioClient />
    </main>
  );
}
