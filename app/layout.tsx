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
  title: "MO T-SHIRT",
  description: "Premium vinyl printing in Mauritius",
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
