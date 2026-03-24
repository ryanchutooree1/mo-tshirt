"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { trackWhatsAppClick } from "@/lib/analytics";

type TrackedWhatsAppLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  trackingLocation: string;
  trackingSource?: string;
  serviceSlug?: string;
};

export default function TrackedWhatsAppLink({
  trackingLocation,
  trackingSource,
  serviceSlug,
  onClick,
  ...props
}: TrackedWhatsAppLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;

    trackWhatsAppClick({
      location: trackingLocation,
      source: trackingSource,
      service_slug: serviceSlug,
    });
  }

  return <a {...props} onClick={handleClick} />;
}
