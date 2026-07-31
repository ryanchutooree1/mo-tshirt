"use client";

import { useRef, useState } from "react";
import ZoomableImage from "@/components/ZoomableImage";

const measurementGuides = [
  {
    label: "T-Shirt",
    src: "/T-Shirt%20Measurement.webp",
    alt: "T-shirt measurement guide for adult sizes XS to 4XL",
  },
  {
    label: "Polo Shirt",
    src: "/Polo-Shirt-Measurement.webp",
    alt: "Polo shirt measurement guide for adult sizes XS to 4XL",
  },
] as const;

const SWIPE_THRESHOLD = 45;

export default function MeasurementCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const showPrevious = () => {
    setActiveIndex((current) =>
      current === 0 ? measurementGuides.length - 1 : current - 1,
    );
  };

  const showNext = () => {
    setActiveIndex((current) => (current + 1) % measurementGuides.length);
  };

  const activeGuide = measurementGuides[activeIndex];

  return (
    <section
      aria-label="Garment measurement guides"
      aria-roledescription="carousel"
      className="w-full"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") showPrevious();
        if (event.key === "ArrowRight") showNext();
      }}
    >
      <div
        className="relative touch-pan-y"
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          if (touchStartX.current === null) return;

          const distance =
            touchStartX.current -
            (event.changedTouches[0]?.clientX ?? touchStartX.current);
          touchStartX.current = null;

          if (Math.abs(distance) < SWIPE_THRESHOLD) return;
          event.preventDefault();
          if (distance > 0) showNext();
          else showPrevious();
        }}
      >
        <ZoomableImage
          key={activeGuide.src}
          src={activeGuide.src}
          alt={activeGuide.alt}
          width={1536}
          height={1024}
          sizes="(max-width: 640px) 100vw, 50vw"
          wrapperClassName="rounded-[28px] border border-[#EAEAEA] bg-white shadow-sm"
          imageClassName="cursor-zoom-in"
        />

        <button
          type="button"
          onClick={showPrevious}
          aria-label="Show previous measurement guide"
          className="absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/95 text-neutral-700 shadow-lg transition hover:scale-105 hover:text-[#ff5a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 sm:left-4 sm:h-12 sm:w-12"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path
              d="m15 18-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <button
          type="button"
          onClick={showNext}
          aria-label="Show next measurement guide"
          className="absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/95 text-neutral-700 shadow-lg transition hover:scale-105 hover:text-[#ff5a00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 sm:right-4 sm:h-12 sm:w-12"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path
              d="m9 18 6-6-6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div
        className="mt-4 flex items-center justify-center gap-2"
        role="group"
        aria-label="Choose a measurement guide"
      >
        {measurementGuides.map((guide, index) => {
          const isActive = index === activeIndex;

          return (
            <button
              key={guide.src}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Show ${guide.label} measurement guide`}
              aria-current={isActive ? "true" : undefined}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 sm:text-sm ${
                isActive
                  ? "border-[#ff5a00] bg-[#ff5a00] text-white shadow-sm"
                  : "border-[#E2E2E2] bg-white text-neutral-600 hover:border-orange-300 hover:text-[#ff5a00]"
              }`}
            >
              {guide.label}
            </button>
          );
        })}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Showing {activeGuide.label} measurement guide, slide {activeIndex + 1} of{" "}
        {measurementGuides.length}
      </p>
    </section>
  );
}
