"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type ZoomableImageProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  wrapperClassName?: string;
  imageClassName?: string;
  sizes?: string;
};

export default function ZoomableImage({
  src,
  alt,
  width,
  height,
  wrapperClassName,
  imageClassName,
  sizes,
}: ZoomableImageProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${wrapperClassName || ""}`}
        aria-label={`Zoom ${alt}`}
      >
        <span className="pointer-events-none absolute right-4 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-white/92 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-700 shadow-[0_10px_24px_rgba(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur transition group-hover:scale-105">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className="h-4 w-4"
          >
            <path
              d="M8.333 3.333a5 5 0 1 0 0 10a5 5 0 0 0 0-10Z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M11.875 11.875L16.667 16.667M8.333 6.25v4.167M6.25 8.333h4.167"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Zoom
        </span>
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes={sizes}
          className={`h-auto w-full object-contain transition group-hover:opacity-95 ${imageClassName || ""}`}
        />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60"
            aria-label="Close zoom"
          />
          <div className="relative w-full max-w-5xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -top-10 right-0 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-neutral-700 shadow"
            >
              Close
            </button>
            <div className="overflow-hidden rounded-[28px] bg-white p-4 shadow-2xl">
              <Image
                src={src}
                alt={alt}
                width={width}
                height={height}
                sizes="(max-width: 1024px) 95vw, 900px"
                className="h-auto w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
