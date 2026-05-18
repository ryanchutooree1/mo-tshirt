import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getWhatsAppUrl, CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_TEL } from "@/data/work";
import { READY_MADE_UNIFORMS_PATH } from "@/data/ready-made-uniforms";
import { buildPageMetadata } from "@/lib/seo";
import { HiOutlineCheckBadge, HiOutlineBolt, HiOutlineGlobeAlt, HiOutlineSparkles } from "react-icons/hi2";
import Gallery from "@/components/Gallery";
import HomeAiOrder from "@/components/HomeAiOrder";
import MapCard from "@/components/MapCard";
import QuoteForm from "@/components/QuoteForm";
import ZoomableImage from "@/components/ZoomableImage";
import LocationJump from "@/components/LocationJump";
import TrackedWhatsAppLink from "@/components/TrackedWhatsAppLink";

const pageTitle = "MO T-SHIRT PRINTING | Fastest in Mauritius";
const pageDescription =
  "T-shirt printing in Mauritius for businesses and events. Fast custom T-shirts, Poloshirts, Caps & Hoodies trusted by 80+ local businesses.";

export const metadata: Metadata = buildPageMetadata({
  title: pageTitle,
  description: pageDescription,
  path: "/",
});

const navLinks = [
  { label: "Home", href: "#top" },
  { label: "Uniform Designs", href: READY_MADE_UNIFORMS_PATH },
  { label: "Quote Form", href: "#contact", buttonTone: "orange" as const },
  { label: "MO AI Order", href: "#mo-ai-order", buttonTone: "rainbow" as const },
  { label: "Plain Shops", href: "/shops" },
  { label: "Our Work", href: "#our-work" },
  { label: "Contact", href: "#contact" },
  { label: "WhatsApp", href: getWhatsAppUrl() },
];

const benefits = [
  {
    icon: HiOutlineCheckBadge,
    title: "Quality T-shirts",
    copy: "Soft, durable tees and polos that print cleanly.",
  },
  {
    icon: HiOutlineBolt,
    title: "Fast turnaround",
    copy: "Standard 5-7 days, with 48-hour rush slots.",
  },
  {
    icon: HiOutlineSparkles,
    title: "Built for business",
    copy: "Uniforms, events, and brand launches.",
  },
  {
    icon: HiOutlineGlobeAlt,
    title: "Made in Mauritius",
    copy: "Local production with island-wide delivery.",
  },
];

const faqItems = [
  {
    question: "What is the turnaround time for custom T-shirt printing?",
    answer:
      "Standard turnaround is 5-7 working days across Mauritius. 48-hour rush is possible when slots are open.",
  },
  {
    question: "What is your minimum order?",
    answer: "We can print small batches, but best pricing starts at 50+ units.",
  },
  {
    question: "Do you offer delivery or collection?",
    answer: "Pickup is available in Surinam, Mauritius. We deliver island-wide via Mauritius Post.",
  },
  {
    question: "Which print method should I choose: Vinyl or DTF?",
    answer: "Vinyl is best for simple logos and 1-3 colors. DTF works best for full-color artwork and photos.",
  },
  {
    question: "Which file formats do you accept?",
    answer: "Send AI, EPS, or PDF files when possible. High-resolution PNG or JPG also works.",
  },
  {
    question: "Do you print polos for teams and uniforms?",
    answer: "Yes. We do polo shirt printing in Mauritius and can recommend the best fabric and finish.",
  },
];

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

function ActionButtons() {
  return (
    <div className="mt-8 mx-auto flex w-full max-w-2xl flex-wrap items-center justify-center gap-3">
      <a
        href={READY_MADE_UNIFORMS_PATH}
        className="inline-flex items-center justify-center rounded-full border border-black bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-black hover:text-white"
      >
        Ready-Made Uniform Designs
      </a>
      <TrackedWhatsAppLink
        href={getWhatsAppUrl()}
        trackingLocation="home_hero"
        trackingSource="homepage"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center rounded-full bg-[#FF6600] px-6 py-3 text-sm font-medium text-white transition hover:bg-orange-600"
      >
        WhatsApp
      </TrackedWhatsAppLink>
      <a
        href="#contact"
        className="inline-flex items-center justify-center rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
      >
        Get pricing in hours
      </a>
    </div>
  );
}

export default function HomePage() {
  return (
    <div id="top" className="min-h-screen bg-white text-black">
      <LocationJump />
      <header className="sticky top-0 z-40 border-b border-[#EAEAEA] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:h-20 sm:gap-4 sm:px-6">
          <Link href="#top" className="flex shrink-0 items-center" aria-label="MO T-SHIRT Home">
            <Image src="/logo_transparent.png" alt="MO T-SHIRT logo" width={150} height={60} priority className="h-8 w-auto sm:h-12" />
          </Link>

          <details className="group relative sm:hidden">
            <summary className="flex list-none items-center gap-2 rounded-full border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-semibold text-black/75 shadow-sm marker:hidden">
              Menu
              <span className="flex h-4 w-4 flex-col justify-center gap-1" aria-hidden="true">
                <span className="h-0.5 w-4 rounded-full bg-current transition group-open:translate-y-1.5 group-open:rotate-45" />
                <span className="h-0.5 w-4 rounded-full bg-current transition group-open:opacity-0" />
                <span className="h-0.5 w-4 rounded-full bg-current transition group-open:-translate-y-1.5 group-open:-rotate-45" />
              </span>
            </summary>
            <nav
              aria-label="Mobile primary"
              className="absolute right-0 top-[calc(100%+0.75rem)] grid w-[min(86vw,320px)] gap-2 rounded-[24px] border border-[#EAEAEA] bg-white p-3 text-sm font-semibold text-black/75 shadow-[0_20px_55px_rgba(0,0,0,0.14)]"
            >
              {navLinks.map((link) =>
                link.label === "WhatsApp" ? (
                  <TrackedWhatsAppLink
                    key={link.label}
                    href={link.href}
                    trackingLocation="home_header_mobile"
                    trackingSource="homepage"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-2xl px-4 py-3 transition hover:bg-neutral-50 hover:text-black"
                  >
                    {link.label}
                  </TrackedWhatsAppLink>
                ) : (
                  <a
                    key={link.label}
                    href={link.href}
                    className={`rounded-2xl px-4 py-3 transition ${
                      link.buttonTone === "orange"
                        ? "bg-[#FF6600] text-white shadow-sm hover:bg-orange-600"
                        : link.buttonTone === "rainbow"
                          ? "bg-[linear-gradient(135deg,#22d3ee_0%,#8b5cf6_52%,#ec4899_100%)] text-white shadow-[0_14px_28px_-16px_rgba(124,58,237,0.75)] hover:brightness-110"
                          : "hover:bg-neutral-50 hover:text-black"
                    }`}
                  >
                    {link.label}
                  </a>
                )
              )}
            </nav>
          </details>

          <div className="hidden sm:mx-0 sm:block sm:px-0">
            <nav
              aria-label="Primary"
              className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3 text-sm font-medium text-black/70"
            >
              {navLinks.map((link) => (
                link.label === "WhatsApp" ? (
                  <TrackedWhatsAppLink
                    key={link.label}
                    href={link.href}
                    trackingLocation="home_header"
                    trackingSource="homepage"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-full leading-none transition hover:border-black hover:text-black"
                  >
                    {link.label}
                  </TrackedWhatsAppLink>
                ) : (
                  <a
                    key={link.label}
                    href={link.href}
                    className={`inline-flex items-center justify-center whitespace-nowrap rounded-full leading-none transition ${
                      link.buttonTone === "orange"
                        ? "min-h-10 border-transparent bg-[#FF6600] px-5 py-2 text-sm text-white shadow-sm hover:bg-orange-600"
                        : link.buttonTone === "rainbow"
                          ? "min-h-10 border-transparent bg-[linear-gradient(135deg,#22d3ee_0%,#8b5cf6_52%,#ec4899_100%)] px-5 py-2 text-sm font-semibold text-white shadow-[0_14px_28px_-16px_rgba(124,58,237,0.75)] hover:brightness-110"
                          : "text-black/70 hover:text-black"
                    }`}
                  >
                    {link.label}
                  </a>
                )
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
        {/* Hero */}
        <section id="hero" className="flex min-h-[80vh] items-center justify-center px-6 pt-14 pb-12 sm:pt-20 sm:pb-20">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
            <a
              href={READY_MADE_UNIFORMS_PATH}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-700 transition hover:border-black hover:bg-white hover:text-black"
            >
              Ready-Made Uniform Designs
              <span aria-hidden="true">↓</span>
            </a>
            <h1 className="text-4xl font-semibold tracking-tight text-black sm:text-5xl">
              Trying to be #1 in Mauritius.
            </h1>
            <p className="mt-4 text-lg text-neutral-600">
              We print T‑Shirts, Poloshirts, Caps & Hoodies fast. Trusted by 80+ businesses across Mauritius and Reunion Island.
            </p>

            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">
              For businesses and events
            </div>

            <ActionButtons />

            <div className="mt-[49px] w-full max-w-5xl lg:max-w-6xl">
              <Image
                src="/all_products.jpg"
                alt="Custom T-shirt printing in Mauritius"
                width={1600}
                height={628}
                className="h-auto w-full rounded-[32px] border border-[#EAEAEA] object-cover shadow-sm"
                priority
              />
            </div>
            <div className="mt-6 w-full max-w-5xl">
              <div className="grid gap-6 sm:grid-cols-2">
                <ZoomableImage
                  src="/T-Shirt%20Measurement.png"
                  alt="T-shirt measurement guide"
                  width={1400}
                  height={900}
                  sizes="(max-width: 640px) 100vw, 50vw"
                  wrapperClassName="rounded-[28px] border border-[#EAEAEA] bg-white shadow-sm"
                  imageClassName="cursor-zoom-in"
                />
                <ZoomableImage
                  src="/Kids%20T-Shirt%20Measurement.png"
                  alt="Kids T-shirt measurement guide"
                  width={1400}
                  height={900}
                  sizes="(max-width: 640px) 100vw, 50vw"
                  wrapperClassName="rounded-[28px] border border-[#EAEAEA] bg-white shadow-sm"
                  imageClassName="cursor-zoom-in"
                />
              </div>
            </div>
            <div className="mt-6 w-full max-w-5xl lg:max-w-6xl">
              <Image
                src="/how_to_order.png"
                alt="How to order custom printed products"
                width={1600}
                height={628}
                className="h-auto w-full rounded-[32px] border border-[#EAEAEA] object-cover shadow-sm"
              />
            </div>
          </div>
        </section>

        {/* Why Choose Us */}
        <section id="why" className="bg-[#F9F9F9] px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Why choose MO T-SHIRT</h2>
            <p className="mt-4 text-base text-neutral-600">
              Craftsmanship, precision, and support for Mauritius businesses.
            </p>

            <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              {benefits.map(({ icon: Icon, title, copy }) => (
                <div key={title} className="flex flex-col items-center gap-4 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full border border-black/10 bg-white">
                    <Icon className="h-7 w-7 text-black" />
                  </span>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-black">{title}</h3>
                    <p className="text-sm text-neutral-600">{copy}</p>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </section>

        <section className="px-6 py-16 sm:py-20">
          <div className="mx-auto flex max-w-6xl justify-center">
            <div className="relative w-full max-w-3xl rounded-[28px] border border-[#EAEAEA] bg-white px-6 py-6 text-left shadow-sm">
              <div className="absolute right-5 top-5">
                <Image
                  src="/Postofficelogo.png"
                  alt="Mauritius Post logo"
                  width={104}
                  height={104}
                  className="h-16 w-16 object-contain"
                />
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex-shrink-0">
                  <Image
                    src="/Postman.png"
                    alt="Mauritius Post delivery"
                    width={384}
                    height={384}
                    className="h-80 w-80 object-contain"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-orange-500">Track & Trace</p>
                  <h3 className="mt-2 text-2xl font-semibold text-black">Track your Mauritius Post parcel</h3>
                  <p className="mt-2 text-sm text-neutral-600">
                    Enter your tracking code. Results open on the official Mauritius Post website.
                  </p>
                  <form
                    action="https://www.mauritiuspost.mu/track-trace/"
                    method="get"
                    target="_blank"
                    className="mt-4 flex flex-col gap-3 sm:flex-row"
                  >
                    <input
                      name="tracking_code"
                      placeholder="Tracking Code e.g HH123456785MU"
                      className="w-full flex-1 rounded-full border border-neutral-200 px-4 py-2 text-sm focus:border-black focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center rounded-full bg-[#FDD901] px-5 py-2 text-sm font-semibold text-black transition hover:brightness-95"
                    >
                      Track parcel
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Our Work */}
        <section id="our-work" className="px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Our Work</h2>
            <p className="mt-4 text-base text-neutral-600">
              Recent T-shirt printing for local teams, events, and businesses in Mauritius.
            </p>
            <div className="mt-12">
              <Gallery />
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Let’s start your order.</h2>
              <p className="mt-4 text-base text-neutral-600">
                Tell us what you need and get a fast quote. WhatsApp for rush jobs.
              </p>
            </div>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.75fr)] lg:items-stretch">
              <div className="rounded-[24px] border border-[#EAEAEA] bg-white p-8 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.08em] text-orange-500">Quote form</p>
                    <h3 className="text-2xl font-semibold text-black">Get pricing in hours</h3>
                  </div>
                </div>
                <div className="mt-6">
                  <QuoteForm source="Website Quotation" />
                </div>
              </div>
              <div className="relative overflow-hidden rounded-[24px] border border-[#EAEAEA] bg-neutral-50 shadow-sm">
                <div className="px-8 pt-5 text-sm text-neutral-500">
                </div>
                <div className="mt-4 px-6 pb-6">
                  <Image
                    src="/boss_imagine.png"
                    alt="MO T-SHIRT team"
                    width={1024}
                    height={1536}
                    className="block h-auto w-full object-contain"
                    sizes="(max-width: 1024px) 100vw, 40vw"
                  />
                </div>
              </div>
            </div>

            <div id="mo-ai-order" className="mx-auto mt-12 max-w-6xl scroll-mt-24 sm:scroll-mt-28">
              <HomeAiOrder />
            </div>

            <div id="location" className="mx-auto mt-12 max-w-5xl scroll-mt-24 sm:scroll-mt-28">
              <div className="space-y-6 sm:space-y-7">
                <h2 id="location-title" className="scroll-mt-28 text-center text-3xl font-semibold text-black sm:scroll-mt-32 sm:text-4xl">
                  Our Location 📍
                </h2>
                <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
                  <MapCard />
                </div>
                <div className="flex justify-center">
                  <a
                    href="https://maps.app.goo.gl/dBwPF4mC2xnPYtP2A"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#4285F4_0%,#34A853_34%,#FBBC05_68%,#EA4335_100%)] px-5 py-2 text-sm font-semibold text-white shadow-[0_18px_30px_-18px_rgba(66,133,244,0.75)] transition hover:brightness-95"
                  >
                    Open Google Maps
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4 shrink-0"
                      fill="currentColor"
                    >
                      <path d="M6.28 19.14 4.86 17.72 14.59 8H7V6h11v11h-2V9.41l-9.72 9.73Z" />
                    </svg>
                  </a>
                </div>
              </div>
              <div className="relative mt-8 overflow-hidden rounded-[28px] border border-[#EAEAEA] bg-gradient-to-br from-[#FFF3E8] via-white to-[#F6F7FB] px-5 py-5 text-center shadow-sm">
                <div className="pointer-events-none absolute -top-10 right-6 h-24 w-24 rounded-full bg-orange-100/70 blur-2xl" aria-hidden="true" />
                <div className="pointer-events-none absolute -bottom-10 left-6 h-24 w-24 rounded-full bg-orange-100/60 blur-2xl" aria-hidden="true" />
                <div className="relative flex flex-col items-center justify-center gap-4 text-sm font-semibold text-neutral-700 sm:flex-row sm:gap-8 sm:text-base">
                  <div className="text-center">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-400">Email</p>
                    <a
                      className="mt-1 inline-block text-base font-semibold text-black underline decoration-orange-400 underline-offset-4 hover:text-black sm:text-lg"
                      href={`mailto:${CONTACT_EMAIL}`}
                    >
                      {CONTACT_EMAIL}
                    </a>
                  </div>
                  <span className="hidden h-8 w-px bg-neutral-200 sm:inline-block" aria-hidden="true" />
                  <div className="text-center">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-400">Phone</p>
                    <a
                      className="mt-1 inline-block text-base font-semibold text-black underline decoration-orange-400 underline-offset-4 hover:text-black sm:text-lg"
                      href={`tel:${CONTACT_TEL}`}
                    >
                      {CONTACT_PHONE_DISPLAY}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <section id="faqs" className="mx-auto mt-12 max-w-6xl">
              <div className="relative overflow-hidden rounded-[32px] border border-[#EAEAEA] bg-gradient-to-br from-[#FFF3E8] via-white to-[#F6F7FB] p-8 shadow-sm">
                <div className="pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full bg-orange-100/70 blur-3xl" aria-hidden="true" />
                <div className="pointer-events-none absolute -bottom-16 left-4 h-40 w-40 rounded-full bg-orange-100/60 blur-3xl" aria-hidden="true" />

                <div className="relative grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
                  <div>
                    <p className="text-xs uppercase tracking-[0.08em] text-orange-500">FAQ</p>
                    <h2 className="mt-3 text-3xl font-semibold tracking-tight text-black sm:text-4xl">
                      Fast answers for T-shirt printing in Mauritius
                    </h2>
                    <p className="mt-4 text-base text-neutral-600">
                      Everything you need to decide quickly, from rush timelines to print method choices.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-700 shadow-sm">
                        5-7 day standard
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-700 shadow-sm">
                        48h rush slots
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-700 shadow-sm">
                        Island-wide delivery
                      </span>
                    </div>
                    <div className="mt-6 rounded-2xl border border-orange-100 bg-white/80 p-4">
                      <p className="text-sm font-semibold text-black">Want a fast answer?</p>
                      <p className="mt-1 text-sm text-neutral-600">
                        Message us on WhatsApp and we’ll recommend the right print method for your logo.
                      </p>
                      <TrackedWhatsAppLink
                        href={getWhatsAppUrl("Hi! I have a quick question about my T-shirt print.")}
                        trackingLocation="home_faq"
                        trackingSource="homepage"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center justify-center rounded-full bg-[#FF6600] px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-600"
                      >
                        Ask on WhatsApp
                      </TrackedWhatsAppLink>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {faqItems.map((item) => (
                      <details
                        key={item.question}
                        className="group rounded-2xl border border-neutral-200 bg-white/90 p-5 shadow-sm transition hover:shadow-md"
                      >
                        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-base font-semibold text-black">
                          <span>{item.question}</span>
                          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-sm leading-none text-neutral-500 transition group-open:rotate-45 sm:h-6 sm:w-6 sm:text-xs">
                            +
                          </span>
                        </summary>
                        <p className="mt-3 text-sm text-neutral-600">{item.answer}</p>
                      </details>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      </main>

      <footer className="border-t border-orange-200 bg-[#FF6600] px-6 py-12 text-white">
        <div className="mx-auto max-w-6xl text-center">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-white/90">
            <a href="#contact" className="transition hover:text-white">Quote Form</a>
            <a href="#our-work" className="transition hover:text-white">Our Work</a>
            <Link href="/terms" className="transition hover:text-white">Terms</Link>
            <Link href="/privacy" className="transition hover:text-white">Privacy</Link>
            <a href="https://www.instagram.com/mo_tshirt_printing/" target="_blank" rel="noopener noreferrer" className="transition hover:text-white">
              Instagram
            </a>
            <a href="https://www.tiktok.com/@mo_tshirt_mauritius" target="_blank" rel="noopener noreferrer" className="transition hover:text-white">
              TikTok
            </a>
            <TrackedWhatsAppLink
              href={getWhatsAppUrl()}
              trackingLocation="home_footer"
              trackingSource="homepage"
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-white"
            >
              WhatsApp
            </TrackedWhatsAppLink>
          </div>
          <p className="mt-6 text-xs text-white/80">
            © 2026 MO T-SHIRT — Mauritius’ trusted name in custom printing.
            <span className="mx-2 text-white/70">|</span>
            <Link href="/login" className="transition hover:text-white hover:underline">
              All Rights Reserved
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
