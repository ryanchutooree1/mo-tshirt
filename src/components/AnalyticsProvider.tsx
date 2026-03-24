"use client";

import { useEffect } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/analytics";

type AnalyticsProviderProps = {
  measurementId?: string;
};

function isPublicTrackingPath(pathname: string) {
  return !pathname.startsWith("/admin") && pathname !== "/login";
}

export default function AnalyticsProvider({ measurementId }: AnalyticsProviderProps) {
  const pathname = usePathname() || "/";

  useEffect(() => {
    if (!isPublicTrackingPath(pathname) || typeof window === "undefined") return;
    trackPageView(`${pathname}${window.location.search}`);
  }, [pathname]);

  if (!isPublicTrackingPath(pathname)) {
    return null;
  }

  if (!measurementId) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${measurementId}', { send_page_view: false });
        `}
      </Script>
    </>
  );
}
