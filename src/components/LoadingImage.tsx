"use client";

import { useState, type ImgHTMLAttributes, type SyntheticEvent } from "react";

type LoadingImageStatus = "loading" | "loaded" | "error";

type LoadingImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  wrapperClassName?: string;
  statusText?: string;
  errorText?: string;
  fallbackSrc?: string;
};

export default function LoadingImage({
  wrapperClassName,
  statusText = "Loading image...",
  errorText = "Image unavailable",
  fallbackSrc,
  className,
  onLoad,
  onError,
  ...props
}: LoadingImageProps) {
  const [status, setStatus] = useState<LoadingImageStatus>("loading");

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
    <div className={`relative ${wrapperClassName || ""}`} aria-busy={status === "loading"}>
      {status !== "loaded" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-100/85 text-slate-600 text-sm">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
          <span>{status === "error" ? errorText : statusText}</span>
        </div>
      )}
      <img {...props} className={className} onLoad={handleLoad} onError={handleError} />
    </div>
  );
}
