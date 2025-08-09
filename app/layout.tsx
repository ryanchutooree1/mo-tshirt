import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "MO T-SHIRT | Premium Printing",
  description: "High-quality T-shirt, polo, and cap printing in Mauritius.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans bg-white text-gray-900">
        {/* Header / Navbar */}
        <header className="fixed top-0 left-0 w-full bg-white shadow-sm z-50">
          <nav className="max-w-6xl mx-auto flex items-center justify-between p-4">
            <h1 className="text-xl font-bold">
              <Link href="/">MO T-SHIRT</Link>
            </h1>
            <div className="flex gap-6">
              <Link href="/services" className="hover:text-orange-500">Services</Link>
              <Link href="/work" className="hover:text-orange-500">Work</Link>
              <Link href="/how-it-works" className="hover:text-orange-500">How it works</Link>
              <Link href="/contact" className="hover:text-orange-500">Contact</Link>
            </div>
          </nav>
        </header>

        {/* Page Content */}
        <main className="pt-20">{children}</main>

        {/* Footer */}
        <footer className="bg-gray-900 text-white text-center py-6 mt-20">
          <p>© {new Date().getFullYear()} MO T-SHIRT. All rights reserved.</p>
        </footer>
      </body>
    </html>
  );
}
