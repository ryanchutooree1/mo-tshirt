"use client";

import { useEffect } from "react";
import { trackServicePageView } from "@/lib/analytics";

type ServicePageViewTrackerProps = {
  slug: string;
  label: string;
};

export default function ServicePageViewTracker({ slug, label }: ServicePageViewTrackerProps) {
  useEffect(() => {
    trackServicePageView({
      service_slug: slug,
      service_label: label,
    });
  }, [label, slug]);

  return null;
}
