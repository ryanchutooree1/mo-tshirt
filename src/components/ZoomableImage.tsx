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
