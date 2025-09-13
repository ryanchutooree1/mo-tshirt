import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MO T-SHIRT PRINTING 🇲🇺",
  description:
    "⭐ Mauritius’ trusted name in custom T-Shirts, Poloshirts & Hoodies✨. Worn by top restaurants, gyms, and businesses. Serving 50+ companies island-wide with fast delivery 🚀 ⭐",
  metadataBase: new URL("https://mo-tshirt.mu"),
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
  },
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}

        <footer className="mt-16 border-t bg-gradient-to-t from-gray-50 to-white">
          <div className="max-w-6xl mx-auto px-4 py-10 text-center">
            <p className="text-sm sm:text-base text-gray-600">
              <span className="font-medium text-gray-900">© 2025 MO T-SHIRT</span> |
              {" "}
              <a href="/login" className="hover:text-gray-900 hover:underline">All Rights Reserved</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
