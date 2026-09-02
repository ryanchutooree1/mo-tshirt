"use client";

import Link from "next/link";
import { useRef } from "react";
import { ArrowUpRight } from "lucide-react";

export default function HomeMobileMenu({ className }: { className: string }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (menu.current) menu.current.open = false;
  };

  return (
    <details
      className={className}
      ref={menu}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          close();
          menu.current?.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label="Open navigation">
        <span />
        <span />
      </summary>
      <nav
        aria-label="Mobile navigation"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) close();
        }}
      >
        <a href="#what-we-print">What we print</a>
        <a href="#collection">The collection</a>
        <Link href="/design-studio">Design studio</Link>
        <a href="#our-work">Our work</a>
        <a href="#how-it-works">How to order</a>
        <a href="#contact">
          Get a quote <ArrowUpRight size={16} />
        </a>
        <Link href="/admin">Business admin</Link>
      </nav>
    </details>
  );
}
