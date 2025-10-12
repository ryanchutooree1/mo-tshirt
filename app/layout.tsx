import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

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
  metadataBase: new URL("https://mo-tshirt.mu"),
  icons: {
    icon: [
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-48x48.png", type: "image/png", sizes: "48x48" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "MO T-SHIRT PRINTING 🇲🇺",
    description:
      "⭐ Mauritius’ trusted name in custom T-Shirts, Poloshirts & Hoodies✨. Worn by top restaurants, gyms, and businesses. Serving 50+ companies island-wide with fast delivery 🚀 ⭐",
    url: "https://mo-tshirt.mu",
    siteName: "MO T-SHIRT",
    images: [{ url: "/all_products.png" }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MO T-SHIRT PRINTING 🇲🇺",
    description:
      "⭐ Mauritius’ trusted name in custom T-Shirts, Poloshirts & Hoodies✨. Worn by top restaurants, gyms, and businesses. Serving 50+ companies island-wide with fast delivery 🚀 ⭐",
    images: ["/all_products.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased bg-white text-black`}>
        {children}
      </body>
    </html>
  );
}
