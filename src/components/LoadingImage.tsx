"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes, type SyntheticEvent } from "react";

type LoadingImageStatus = "loading" | "loaded" | "error";

type LoadingImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  wrapperClassName?: string;
  statusText?: string;
  errorText?: string;
  fallbackSrc?: string;
  delayMs?: number;
  inViewRootMargin?: string;
};

export default function LoadingImage({
  wrapperClassName,
  statusText = "Loading image...",
  errorText = "Image unavailable",
  fallbackSrc,
  delayMs = 600,
  inViewRootMargin = "200px",
  className,
  onLoad,
  onError,
  ...props
}: LoadingImageProps) {
  const [status, setStatus] = useState<LoadingImageStatus>("loading");
  const [showStatus, setShowStatus] = useState(false);
  const [inView, setInView] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node || inView) return;

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: inViewRootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, inViewRootMargin]);

  useEffect(() => {
    const node = imgRef.current;
    if (node && node.complete && node.naturalWidth > 0) {
      setStatus("loaded");
    }
  }, []);

  useEffect(() => {
    if (status === "error") {
      setShowStatus(true);
      return;
    }

    if (status !== "loading" || !inView) {
      setShowStatus(false);
      return;
    }

    setShowStatus(false);
    const timer = window.setTimeout(() => setShowStatus(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [status, inView, delayMs]);

  const handleLoad = (event: SyntheticEvent<HTMLImageElement, Event>) => {
    setStatus("loaded");
    onLoad?.(event);
  };

  const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
    const target = event.currentTarget;
    if (fallbackSrc && !target.dataset.fallbackApplied && target.src !== fallbackSrc) {
      target.dataset.fallbackApplied = "true";
      target.src = fallbackSrc;
      setStatus("loading");
    } else {
      setStatus("error");
    }
    onError?.(event);
  };

  return (
    <div ref={wrapperRef} className={`relative ${wrapperClassName || ""}`} aria-busy={status === "loading"}>
      {showStatus && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-100/85 text-slate-600 text-sm">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
          <span>{status === "error" ? errorText : statusText}</span>
        </div>
      )}
      <img ref={imgRef} {...props} className={className} onLoad={handleLoad} onError={handleError} />
    </div>
  );
}
