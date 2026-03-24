import Image from "next/image";
import Link from "next/link";
import Gallery from "@/components/Gallery";
import QuoteForm from "@/components/QuoteForm";
import ServicePageViewTracker from "@/components/ServicePageViewTracker";
import TrackedWhatsAppLink from "@/components/TrackedWhatsAppLink";
import type { ServicePageContent } from "@/data/service-pages";
import { getServicePageBySlug } from "@/data/service-pages";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_TEL, getWhatsAppUrl } from "@/data/work";

type ServiceLandingPageProps = {
  page: ServicePageContent;
};

export default function ServiceLandingPage({ page }: ServiceLandingPageProps) {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  const serviceLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: page.label,
    serviceType: page.label,
    provider: {
      "@type": "LocalBusiness",
      name: "MO T-SHIRT",
      telephone: CONTACT_TEL,
      email: CONTACT_EMAIL,
      areaServed: "Mauritius",
    },
    areaServed: "Mauritius",
    description: page.description,
    url: `https://www.mo-tshirt.mu/${page.slug}`,
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://www.mo-tshirt.mu/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: page.label,
        item: `https://www.mo-tshirt.mu/${page.slug}`,
      },
    ],
  };

  const relatedPages = page.relatedSlugs
    .map((slug) => getServicePageBySlug(slug))
    .filter((item): item is ServicePageContent => Boolean(item));

  return (
    <div className="min-h-screen bg-white text-black">
      <header className="sticky top-0 z-40 border-b border-[#EAEAEA] bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-3 sm:h-20 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
          <Link href="/" className="flex items-center gap-3" aria-label="MO T-SHIRT Home">
            <Image
              src="/logo_transparent.png"
              alt="MO T-SHIRT logo"
              width={150}
              height={60}
              className="h-9 w-auto sm:h-12"
              priority
            />
            <span className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400 sm:inline">
              Mauritius printing
            </span>
          </Link>
          <nav
            aria-label="Service page"
            className="flex w-full flex-wrap items-center justify-center gap-4 text-xs font-semibold text-black/70 sm:w-auto sm:justify-end sm:gap-6 sm:text-sm sm:font-medium"
          >
            <Link href="/" className="transition hover:text-black">
              Home
            </Link>
            <Link href="/shops" className="transition hover:text-black">
              Plain T-Shirts
            </Link>
            <a href="#quote" className="transition hover:text-black">
              Get Quote
            </a>
            <TrackedWhatsAppLink
              href={getWhatsAppUrl(`Hi! I need help with ${page.label.toLowerCase()} in Mauritius.`)}
              trackingLocation="service_header"
              trackingSource="service_page"
              serviceSlug={page.slug}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-[#FF6600] px-3 py-1 text-white shadow-sm transition hover:bg-orange-600"
            >
              WhatsApp
            </TrackedWhatsAppLink>
          </nav>
        </div>
      </header>

      <main>
        <ServicePageViewTracker slug={page.slug} label={page.label} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

        <section className="px-6 pt-14 pb-16 sm:pt-20 sm:pb-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">{page.eyebrow}</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-black sm:text-5xl">
                {page.heroTitle}
              </h1>
              <p className="mt-5 max-w-2xl text-lg text-neutral-600">{page.heroBody}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {page.badges.map((badge) => (
                  <span
                    key={badge}
                    className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-orange-700"
                  >
                    {badge}
                  </span>
                ))}
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#quote"
                  className="inline-flex items-center justify-center rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  Get a quote
                </a>
                <TrackedWhatsAppLink
                  href={getWhatsAppUrl(`Hi! I need a quote for ${page.label.toLowerCase()}.`)}
                  trackingLocation="service_hero"
                  trackingSource="service_page"
                  serviceSlug={page.slug}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-full bg-[#FF6600] px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
                >
                  WhatsApp now
                </TrackedWhatsAppLink>
                {page.extraAction ? (
                  <Link
                    href={page.extraAction.href}
                    className="inline-flex items-center justify-center rounded-full border border-neutral-300 px-6 py-3 text-sm font-semibold text-black transition hover:border-black"
                  >
                    {page.extraAction.label}
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="overflow-hidden rounded-[32px] border border-[#EAEAEA] bg-white shadow-sm">
              <Image
                src={page.heroImage}
                alt={page.label}
                width={1400}
                height={1040}
                className="h-full w-full object-cover"
                sizes="(max-width: 1024px) 100vw, 52vw"
                priority
              />
            </div>
          </div>
        </section>

        <section className="bg-[#F9F9F9] px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">Why this page exists</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight text-black sm:text-4xl">
                    What to expect from {page.label.toLowerCase()}.
                  </h2>
                </div>
                {page.intro.map((paragraph) => (
                  <p key={paragraph} className="text-base text-neutral-600">
                    {paragraph}
                  </p>
                ))}
                <div className="rounded-[28px] border border-orange-100 bg-white p-6 shadow-sm">
                  <p className="text-sm font-semibold uppercase tracking-[0.12em] text-orange-500">Best fit</p>
                  <ul className="mt-4 space-y-3 text-sm text-neutral-700">
                    {page.bestFor.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-[#FF6600]" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {page.highlights.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-[28px] border border-[#EAEAEA] bg-white p-6 shadow-sm sm:min-h-[200px]"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">Highlight</p>
                    <h3 className="mt-3 text-xl font-semibold text-black">{item.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-neutral-600">{item.copy}</p>
                  </div>
                ))}
                <div className="rounded-[28px] border border-[#EAEAEA] bg-black p-6 text-white shadow-sm sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">Need a fast answer?</p>
                  <h3 className="mt-3 text-2xl font-semibold">Talk through the job before production starts.</h3>
                  <p className="mt-3 max-w-2xl text-sm text-white/80">
                    Share the garment, quantity, deadline, and artwork. We will point you toward the print method that actually suits the order.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <TrackedWhatsAppLink
                      href={getWhatsAppUrl(`Hi! I want advice on ${page.label.toLowerCase()}.`)}
                      trackingLocation="service_callout"
                      trackingSource="service_page"
                      serviceSlug={page.slug}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-full bg-[#FF6600] px-5 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
                    >
                      Ask on WhatsApp
                    </TrackedWhatsAppLink>
                    <a
                      href={`tel:${CONTACT_TEL}`}
                      className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:border-white/50"
                    >
                      Call {CONTACT_PHONE_DISPLAY}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-4 text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">Local proof</p>
              <h2 className="text-3xl font-semibold tracking-tight text-black sm:text-4xl">
                Recent work printed in Mauritius.
              </h2>
              <p className="max-w-3xl text-base text-neutral-600">
                Real jobs build trust faster than generic promises. This gallery shows the kind of work we produce for local teams, businesses, and events.
              </p>
            </div>
            <div className="mt-10">
              <Gallery />
            </div>
          </div>
        </section>

        <section id="quote" className="bg-[#F9F9F9] px-6 py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[28px] border border-[#EAEAEA] bg-white p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">Get pricing</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-black">Tell us about your order.</h2>
              <p className="mt-4 text-base text-neutral-600">
                Share the product, size mix, quantity, and deadline. We will confirm the best route and quote the job properly.
              </p>
              <div className="mt-6">
                <QuoteForm source={`${page.label} landing page`} />
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[28px] border border-[#EAEAEA] bg-white p-8 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">FAQ</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-black">Questions buyers usually ask.</h2>
                <div className="mt-6 space-y-3">
                  {page.faqs.map((item) => (
                    <details
                      key={item.question}
                      className="group rounded-2xl border border-neutral-200 bg-neutral-50 p-5 transition hover:border-neutral-300"
                    >
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-base font-semibold text-black">
                        <span>{item.question}</span>
                        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-sm leading-none text-neutral-500 transition group-open:rotate-45">
                          +
                        </span>
                      </summary>
                      <p className="mt-3 text-sm text-neutral-600">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-[#EAEAEA] bg-white p-8 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">Contact</p>
                <h3 className="mt-3 text-2xl font-semibold text-black">Need a direct answer?</h3>
                <div className="mt-5 space-y-3 text-sm text-neutral-700">
                  <p>
                    Email:{" "}
                    <a className="font-semibold text-black underline decoration-orange-400 underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
                      {CONTACT_EMAIL}
                    </a>
                  </p>
                  <p>
                    Phone:{" "}
                    <a className="font-semibold text-black underline decoration-orange-400 underline-offset-4" href={`tel:${CONTACT_TEL}`}>
                      {CONTACT_PHONE_DISPLAY}
                    </a>
                  </p>
                  <p>Pickup in Surinam, Mauritius. Delivery available island-wide.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {relatedPages.length ? (
          <section className="px-6 py-16 sm:py-20">
            <div className="mx-auto max-w-6xl">
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">Related pages</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-black sm:text-4xl">
                  Explore the service that fits your order best.
                </h2>
              </div>
              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {relatedPages.map((related) => (
                  <Link
                    key={related.slug}
                    href={`/${related.slug}`}
                    className="group rounded-[28px] border border-[#EAEAEA] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-black"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">Related</p>
                    <h3 className="mt-3 text-xl font-semibold text-black">{related.label}</h3>
                    <p className="mt-3 text-sm leading-6 text-neutral-600">{related.summary}</p>
                    <span className="mt-5 inline-flex items-center text-sm font-semibold text-black">
                      View page
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-orange-200 bg-[#FF6600] px-6 py-12 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-white/90">
            <Link href="/" className="transition hover:text-white">
              Home
            </Link>
            <Link href="/shops" className="transition hover:text-white">
              Plain T-Shirts
            </Link>
            <Link href="/contact" className="transition hover:text-white">
              Contact
            </Link>
            <TrackedWhatsAppLink
              href={getWhatsAppUrl()}
              trackingLocation="service_footer"
              trackingSource="service_page"
              serviceSlug={page.slug}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-white"
            >
              WhatsApp
            </TrackedWhatsAppLink>
          </div>
          <p className="mt-6 text-center text-xs text-white/80">
            © MO T-SHIRT - Local apparel printing for Mauritius businesses, events, and teams.
          </p>
        </div>
      </footer>
    </div>
  );
}
