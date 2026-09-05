"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes, type SyntheticEvent } from "react";
import styles from "./LoadingImage.module.css";

type LoadingImageStatus = "loading" | "loaded" | "error";

type LoadingImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  wrapperClassName?: string;
  statusText?: string;
  errorText?: string;
  fallbackSrc?: string;
  delayMs?: number;
  inViewRootMargin?: string;
  pollMs?: number;
  compactStatus?: boolean;
  statusVariant?: "badge" | "progress";
};

export default function LoadingImage({
  wrapperClassName,
  statusText = "Loading image...",
  errorText = "Image unavailable",
  fallbackSrc,
  delayMs = 1200,
  inViewRootMargin = "200px",
  pollMs = 300,
  compactStatus = false,
  statusVariant = "badge",
  src,
  alt,
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
    setStatus("loading");
  }, [src]);

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
    if (status !== "loading") return;
    const node = imgRef.current;
    if (!node) return;

    let stopped = false;
    const check = () => {
      if (stopped) return;
      if (node.complete) {
        if (node.naturalWidth > 0) {
          setStatus("loaded");
          return;
        }
        setStatus("error");
        return;
      }
      window.setTimeout(check, pollMs);
    };

    check();
    return () => {
      stopped = true;
    };
  }, [status, pollMs]);

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

  const statusTextLabel = status === "error" ? errorText : statusText;

  return (
    <div ref={wrapperRef} className={`relative ${wrapperClassName || ""}`} aria-busy={status === "loading"}>
      {showStatus && statusVariant === "progress" && (
        <div className={styles.progressPanel}>
          <span className={styles.progressLabel} role="status">{statusTextLabel}</span>
          {status === "loading" && (
            <div className={styles.progressTrack} role="progressbar" aria-label={statusText}>
              <span className={styles.progressFill} />
            </div>
          )}
        </div>
      )}
      {showStatus && statusVariant === "badge" && compactStatus && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/75 backdrop-blur-[2px]">
          {status === "loading" ? (
            <span className="inline-flex h-7 w-7 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#ff5a0a]" />
          ) : (
            <span className="px-2 text-center text-[10px] font-medium text-slate-500">{errorText}</span>
          )}
          <span className="sr-only">{statusTextLabel}</span>
        </div>
      )}
      {showStatus && statusVariant === "badge" && !compactStatus && (
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur">
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
          <span>{statusTextLabel}</span>
        </div>
      )}
      <img
        ref={imgRef}
        src={src}
        alt={typeof alt === "string" ? alt : ""}
        {...props}
        className={className}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}
