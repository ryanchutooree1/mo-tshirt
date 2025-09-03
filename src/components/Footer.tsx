import Link from "next/link";
import { getWhatsAppUrl } from "@/data/work";

export default function Footer() {
  return (
    <footer className="border-t bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">MO T-SHIRT</div>
            <p className="text-sm text-gray-600">Premium vinyl printing in Mauritius.</p>
          </div>
          <nav className="flex items-center gap-4" aria-label="Footer">
            <a href="#our-work" className="text-sm text-gray-700 hover:text-gray-900">Our Work</a>
            <a href="#pricing" className="text-sm text-gray-700 hover:text-gray-900">Pricing</a>
            <a href="#contact" className="text-sm text-gray-700 hover:text-gray-900">Contact</a>
          </nav>
          <Link
            href={getWhatsAppUrl()}
            target="_blank"
            aria-label="WhatsApp"
            className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-white text-sm font-semibold shadow hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
          >
            WhatsApp
          </Link>
        </div>
        <p className="mt-6 text-xs text-gray-500">© {new Date().getFullYear()} MO T-SHIRT</p>
      </div>
    </footer>
  );
}

