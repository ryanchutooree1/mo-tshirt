import type { Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import AnalyticsProvider from "@/components/AnalyticsProvider";
import { SITE_URL } from "@/lib/seo";
import "./globals.css";

const ICON_VERSION = "20260317";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MO T-SHIRT PRINTING 🇲🇺",
  description:
    "⭐ Mauritius’ trusted name in custom T-Shirts, Poloshirts & Hoodies✨. Worn by top restaurants, gyms, and businesses. Serving 50+ companies island-wide with fast delivery 🚀 ⭐",
  keywords: [
    "t-shirt printing Mauritius",
    "polo shirt printing",
    "custom hoodies",
    "cap printing",
    "Mauritius custom printing",
    "MO T-SHIRT",
    "business uniforms",
    "fast t-shirt printing",
  ],
  // Use canonical www host to avoid mixed-domain canonicals/sitemaps
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: SITE_URL,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  icons: {
    icon: [
      { url: `/favicon-16x16.png?v=${ICON_VERSION}`, type: "image/png", sizes: "16x16" },
      { url: `/favicon-32x32.png?v=${ICON_VERSION}`, type: "image/png", sizes: "32x32" },
      { url: `/favicon-48x48.png?v=${ICON_VERSION}`, type: "image/png", sizes: "48x48" },
      { url: `/icon.png?v=${ICON_VERSION}`, type: "image/png" },
    ],
    apple: [
      { url: `/apple-touch-icon.png?v=${ICON_VERSION}`, sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: `/site.webmanifest?v=${ICON_VERSION}`,
  openGraph: {
    title: "MO T-SHIRT PRINTING 🇲🇺",
    description:
      "⭐ Mauritius’ trusted name in custom T-Shirts, Poloshirts & Hoodies✨. Worn by top restaurants, gyms, and businesses. Serving 50+ companies island-wide with fast delivery 🚀 ⭐",
    url: SITE_URL,
    siteName: "MO T-SHIRT",
    images: [{ url: "/all_products.jpg" }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MO T-SHIRT PRINTING 🇲🇺",
    description:
      "⭐ Mauritius’ trusted name in custom T-Shirts, Poloshirts & Hoodies✨. Worn by top restaurants, gyms, and businesses. Serving 50+ companies island-wide with fast delivery 🚀 ⭐",
    images: ["/all_products.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const localBusinessLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "MO T-SHIRT",
    url: SITE_URL,
    image: `${SITE_URL}/all_products.jpg`,
    logo: `${SITE_URL}/icon.png`,
    telephone: "+23059883880",
    priceRange: "MUR 200-MUR 1500",
    address: {
      "@type": "PostalAddress",
      addressCountry: "MU",
      addressRegion: "Savanne",
      addressLocality: "Surinam",
    },
    areaServed: "Mauritius",
    sameAs: [
      "https://www.instagram.com/mo_tshirt_printing/",
      "https://www.tiktok.com/@mo_tshirt_mauritius",
      "https://wa.me/23059883880",
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        telephone: "+23059883880",
        contactType: "customer service",
        areaServed: "MU",
        availableLanguage: ["en", "fr"],
      },
    ],
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "09:00",
        closes: "17:00",
      },
    ],
  };

  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased bg-white text-black`}>
        <AnalyticsProvider measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        <Script
          id="schema-local-business"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessLd) }}
        />
        {children}
      </body>
    </html>
  );
}
