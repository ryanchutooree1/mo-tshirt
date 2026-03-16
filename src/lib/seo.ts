import type { Metadata } from "next";

export const SITE_URL = "https://www.mo-tshirt.mu";
const DEFAULT_SOCIAL_IMAGE = "/all_products.jpg";

export function getCanonicalUrl(path: string) {
  return path === "/" ? SITE_URL : `${SITE_URL}${path}`;
}

type BuildPageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  image?: string;
};

export function buildPageMetadata({
  title,
  description,
  path,
  image = DEFAULT_SOCIAL_IMAGE,
}: BuildPageMetadataOptions): Metadata {
  const url = getCanonicalUrl(path);

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "MO T-SHIRT",
      images: [{ url: image }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
