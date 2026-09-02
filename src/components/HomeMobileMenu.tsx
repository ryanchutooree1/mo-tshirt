"use client";

import { useRef } from "react";
import { Menu } from "lucide-react";

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
        <a href="#process">How it works</a>
        <a href="#order">Start an order</a>
      </nav>
    </details>
  );
}
