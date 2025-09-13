import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { FaFacebookF, FaInstagram, FaWhatsapp } from "react-icons/fa";
import { SiTiktok } from "react-icons/si";
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

            {/* Social links */}
            <div className="mt-4 flex items-center justify-center gap-3">
              <a
                href="https://www.facebook.com/profile.php?id=61558438146375"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="h-10 w-10 grid place-items-center rounded-full border bg-white text-gray-700 hover:bg-gray-100"
              >
                <FaFacebookF className="h-4 w-4" />
              </a>
              <a
                href="https://www.instagram.com/mo_tshirt_printing/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="h-10 w-10 grid place-items-center rounded-full border bg-white text-gray-700 hover:bg-gray-100"
              >
                <FaInstagram className="h-5 w-5" />
              </a>
              <a
                href="https://www.tiktok.com/@mo_tshirt_mauritius"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok"
                className="h-10 w-10 grid place-items-center rounded-full border bg-white text-gray-700 hover:bg-gray-100"
              >
                <SiTiktok className="h-5 w-5" />
              </a>
              <a
                href="https://wa.me/23059883880"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="h-10 w-10 grid place-items-center rounded-full border bg-white text-gray-700 hover:bg-gray-100"
              >
                <FaWhatsapp className="h-5 w-5" />
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
