"use client";

import { useEffect, useState } from "react";
import { HiOutlineArrowDownCircle } from "react-icons/hi2";

export default function LocationJump() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const target = document.getElementById("location");
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHidden(entry.isIntersecting),
      { threshold: 0.25 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <a
      href="#location"
      className={`fixed right-4 bottom-20 z-40 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-black shadow-lg transition hover:border-black hover:shadow-xl ${
        hidden ? "pointer-events-none opacity-0 translate-y-2" : "opacity-100"
      }`}
      aria-label="Jump to Location"
    >
      <HiOutlineArrowDownCircle className="h-5 w-5 text-orange-500" />
      <span className="hidden sm:inline">Jump to Location 📍</span>
      <span className="sm:hidden">Location 📍</span>
    </a>
  );
}
