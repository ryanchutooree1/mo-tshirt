"use client";

import { useEffect, useRef, useState } from "react";
import LoadingImage from "@/components/LoadingImage";

const MAP_EMBED =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3736.8418241534987!2d57.50753460000001!3d-20.512709499999996!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x217c65c1340e173b%3A0x41a86ddefff3db6a!2sMO%20T-SHIRT%20-%20Business%20Printing%20(Mauritius)!5e0!3m2!1sen!2smu!4v1761069000215!5m2!1sen!2smu";

export default function MapCard() {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInView, setMapInView] = useState(false);
  const [showMapStatus, setShowMapStatus] = useState(false);
  const mapWrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = mapWrapperRef.current;
    if (!node || mapInView) return;

    if (typeof IntersectionObserver === "undefined") {
      setMapInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMapInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [mapInView]);

  useEffect(() => {
    if (!mapInView || mapLoaded) {
      setShowMapStatus(false);
      return;
    }

    setShowMapStatus(false);
    const showTimer = window.setTimeout(() => setShowMapStatus(true), 1200);
    const hideTimer = window.setTimeout(() => setShowMapStatus(false), 4200);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [mapInView, mapLoaded]);

  useEffect(() => {
    if (!mapInView || mapLoaded) return;
    const maxTimer = window.setTimeout(() => setMapLoaded(true), 7000);
    return () => window.clearTimeout(maxTimer);
  }, [mapInView, mapLoaded]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
      {/* Left: Map Embed */}
      <div className="rounded-2xl overflow-hidden shadow-sm border">
        <div ref={mapWrapperRef} className="relative aspect-square w-full" aria-busy={!mapLoaded}>
          {showMapStatus && !mapLoaded && (
            <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur">
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
              <span>Loading map...</span>
            </div>
          )}
          <iframe
            title="MO T-SHIRT - Business Printing (Mauritius)"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-full w-full"
            allowFullScreen
            src={MAP_EMBED}
            onLoad={() => setMapLoaded(true)}
          />
        </div>
      </div>

      {/* Right: Static Image */}
      <div className="rounded-2xl overflow-hidden shadow-sm border">
        <div className="aspect-square w-full">
          <LoadingImage
            src="/on_mauritius_map.png"
            alt="MO T-SHIRT on Mauritius map"
            className="h-full w-full object-cover"
            wrapperClassName="h-full w-full"
            statusText="Loading image..."
          />
        </div>
      </div>
    </div>
  );
}
