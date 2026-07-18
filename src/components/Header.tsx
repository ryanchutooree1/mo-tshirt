"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { getWhatsAppUrl } from "@/data/work";

const NAV = [
  { label: "Benefits", href: "#benefits" },
  { label: "How to Order", href: "#how-to-order" },
  { label: "Our Work", href: "#our-work" },
  { label: "Contact", href: "#contact" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  const onNavClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith("#")) {
      e.preventDefault();
      const el = document.getElementById(href.slice(1));
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto max-w-6xl px-4 h-16 sm:h-20 grid grid-cols-12 items-center gap-4 md:gap-6">
        {/* Logo - left */}
        <div className="col-span-6 md:col-span-3 flex items-center">
          <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="MO T-SHIRT Home">
            <Image
              src="/logo_transparent.webp"
              alt="MO T-SHIRT logo"
              width={300}
              height={90}
              sizes="(max-width: 768px) 160px, (max-width: 1024px) 200px, 240px"
              className="h-10 sm:h-12 md:h-14 w-auto"
              priority
            />
          </Link>
        </div>

        {/* Desktop Nav - center */}
        <nav className="hidden md:flex col-span-6 items-center justify-center gap-7" aria-label="Primary">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(e) => onNavClick(e, item.href)}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Desktop CTAs - right */}
        <div className="hidden md:flex col-span-3 items-center justify-end gap-3">
          <a
            href={getWhatsAppUrl()}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
            className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-gray-100 text-gray-800 hover:bg-gray-200 border"
          >
            <FaWhatsapp className="h-5 w-5" />
          </a>
          <a
            href="#contact"
            className="inline-flex items-center justify-center rounded-full bg-orange-500 px-4 py-2 text-white text-sm font-semibold shadow hover:bg-orange-600"
          >
            Get a Quote
          </a>
        </div>

        {/* Mobile Toggle - right */}
        <div className="col-span-6 md:hidden flex items-center justify-end">
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((s) => !s)}
            className="inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
              {open ? (
                <path fillRule="evenodd" d="M6.225 4.811a1 1 0 0 1 1.414 0L12 9.172l4.361-4.36a1 1 0 1 1 1.414 1.414L13.414 10.586l4.36 4.361a1 1 0 0 1-1.414 1.414L12 12l-4.361 4.361a1 1 0 0 1-1.414-1.414l4.36-4.361-4.36-4.361a1 1 0 0 1 0-1.414Z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M4.5 6.75A.75.75 0 0 1 5.25 6h13.5a.75.75 0 0 1 0 1.5H5.25A.75.75 0 0 1 4.5 6.75Zm0 5.25a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H5.25a.75.75 0 0 1-.75-.75Zm.75 4.5a.75.75 0 0 0 0 1.5h13.5a.75.75 0 0 0 0-1.5H5.25Z" clipRule="evenodd" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {open && (
        <div className="md:hidden border-t bg-white">
          <nav className="mx-auto max-w-6xl px-4 py-3 flex flex-col gap-2" aria-label="Mobile">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => onNavClick(e, item.href)}
                className="block rounded px-2 py-2 text-base font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-2 flex items-center gap-3">
              <a
                href={getWhatsAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-gray-100 text-gray-800 hover:bg-gray-200 border"
              >
                <FaWhatsapp className="h-5 w-5" />
              </a>
              <a
                href="#contact"
                onClick={(e) => onNavClick(e, "#contact")}
                className="inline-flex items-center justify-center rounded-full bg-orange-500 px-4 py-2 text-white text-sm font-semibold shadow hover:bg-orange-600"
              >
                Get a Quote
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
