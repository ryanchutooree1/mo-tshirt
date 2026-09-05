"use client";

import Link from "next/link";

import { useRef } from "react";
import { Menu, Truck } from "lucide-react";

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
      <summary aria-label="Open menu">
        <Menu size={24} aria-hidden="true" />
      </summary>
      <nav
        aria-label="Mobile navigation"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) close();
        }}
      >
        <a href="#services">What we print</a>
          <Link href="/shop">Shop</Link>
        <a href="#process">How it works</a>
        <a href="#track-parcel">
          Track your parcel
          <Truck size={20} strokeWidth={1.6} color="#ff3b22" aria-hidden="true">
            <rect x={5} y={8} width={6} height={5} rx={0.5} />
            <path d="M8 8v2" />
          </Truck>
        </a>
        <a href="#order">Start an order</a>
      </nav>
    </details>
  );
}
