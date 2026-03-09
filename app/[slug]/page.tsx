import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ServiceLandingPage from "@/components/ServiceLandingPage";
import { getServicePageBySlug, servicePageSlugs } from "@/data/service-pages";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return servicePageSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getServicePageBySlug(slug);

  if (!page) {
    return {};
  }

  return {
    title: page.title,
    description: page.description,
    alternates: {
      canonical: `https://www.mo-tshirt.mu/${page.slug}`,
    },
    openGraph: {
      title: page.title,
      description: page.description,
      url: `https://www.mo-tshirt.mu/${page.slug}`,
      siteName: "MO T-SHIRT",
      images: [{ url: page.heroImage }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [page.heroImage],
    },
  };
}

export default async function ServiceSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getServicePageBySlug(slug);

  if (!page) {
    notFound();
  }

  return <ServiceLandingPage page={page} />;
}
