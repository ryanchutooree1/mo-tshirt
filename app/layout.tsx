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
  title: "MO T‑Shirt Admin",
  description: "Admin dashboard for MO T‑Shirt",
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
        <footer className="mt-16 border-t bg-white/70 backdrop-blur">
          <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between text-sm text-gray-600">
            <div>© 2025 MO T‑Shirt</div>
            <div>
              <a href="/login" className="px-3 py-1 border rounded-lg hover:bg-gray-50">Login</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
