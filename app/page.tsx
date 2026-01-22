import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getWhatsAppUrl, CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_TEL } from "@/data/work";
import { HiOutlineCheckBadge, HiOutlineBolt, HiOutlineGlobeAlt, HiOutlineSparkles } from "react-icons/hi2";
import Gallery from "@/components/Gallery";
import MapCard from "@/components/MapCard";
import QuoteForm from "@/components/QuoteForm";
import LocationJump from "@/components/LocationJump";

const pageTitle = "MO T-SHIRT PRINTING | Fastest in Mauritius";
const pageDescription =
  "T-shirt printing in Mauritius for businesses and events. Fast custom T-shirts, Poloshirts, Caps & Hoodies trusted by 80+ local businesses.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: {
    canonical: "https://www.mo-tshirt.mu/",
  },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: "https://www.mo-tshirt.mu/",
    siteName: "MO T-SHIRT",
    images: [{ url: "/all_products.jpg" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
    images: ["/all_products.jpg"],
  },
};

const navLinks = [
  { label: "Home", href: "#hero" },
  { label: "Plain Shops", href: "/shops", highlight: true },
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
    <div className="mt-8 mx-auto flex w-full max-w-md flex-wrap items-center gap-3 sm:flex-nowrap sm:justify-between">
      <a
        href={getWhatsAppUrl()}
        className="inline-flex flex-1 items-center justify-center rounded-full bg-[#FF6600] px-6 py-3 text-sm font-medium text-white transition hover:bg-orange-600"
      >
        WhatsApp
      </a>
      <a
        href="#contact"
        className="inline-flex flex-1 items-center justify-center rounded-full border border-black px-6 py-3 text-sm font-medium text-black transition hover:bg-black hover:text-white"
      >
        Get a Quote
      </a>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-black">
      <LocationJump />
      <header className="sticky top-0 z-40 border-b border-[#EAEAEA] bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-3 sm:h-20 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
          <Link href="#hero" className="flex items-center" aria-label="MO T-SHIRT Home">
            <Image src="/logo_transparent.png" alt="MO T-SHIRT logo" width={150} height={60} priority className="h-9 w-auto sm:h-12" />
          </Link>
          <nav
            aria-label="Primary"
            className="flex w-full flex-wrap items-center justify-center gap-4 text-xs font-semibold text-black/70 sm:w-auto sm:justify-end sm:gap-6 sm:text-sm sm:font-medium"
          >
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className={`whitespace-nowrap transition ${
                  link.highlight
                    ? "rounded-full bg-[#FF6600] px-3 py-1 text-white shadow-sm hover:bg-orange-600"
                    : "text-black/70 hover:text-black"
                }`}
                target={link.label === "WhatsApp" ? "_blank" : undefined}
                rel={link.label === "WhatsApp" ? "noopener noreferrer" : undefined}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
        {/* Hero */}
        <section id="hero" className="flex min-h-[80vh] items-center justify-center px-6 pt-14 pb-24 sm:pt-20 sm:pb-32">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
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

            <div className="mt-16 w-full max-w-5xl lg:max-w-6xl">
              <Image
                src="/all_products.jpg"
                alt="Custom T-shirt printing in Mauritius"
                width={1600}
                height={628}
                className="h-auto w-full rounded-[32px] border border-[#EAEAEA] object-cover shadow-sm"
                priority
              />
            </div>
          </div>
        </section>

        {/* Why Choose Us */}
        <section id="why" className="bg-[#F9F9F9] px-6 py-24">
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

        {/* Our Work */}
        <section id="our-work" className="px-6 py-24">
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
        <section id="contact" className="px-6 py-24">
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
                    <p className="text-sm text-neutral-600">Share quantities, garments, deadline, and delivery preference.</p>
                  </div>
                </div>
                <div className="mt-6">
                  <QuoteForm source="Home contact" />
                </div>
              </div>
              <div className="relative overflow-hidden rounded-[24px] border border-[#EAEAEA] bg-neutral-50 shadow-sm">
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

            <div id="location" className="mx-auto mt-12 max-w-5xl scroll-mt-24 sm:scroll-mt-28">
              <h2 className="text-center text-3xl font-semibold text-black mb-4 sm:text-4xl">Our Location</h2>
              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                <MapCard />
              </div>
              <div className="relative mt-5 overflow-hidden rounded-[28px] border border-[#EAEAEA] bg-gradient-to-br from-[#FFF3E8] via-white to-[#F6F7FB] px-5 py-5 text-center shadow-sm">
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
                      <a
                        href={getWhatsAppUrl("Hi! I have a quick question about my T-shirt print.")}
                        className="mt-3 inline-flex items-center justify-center rounded-full bg-[#FF6600] px-4 py-2 text-xs font-semibold text-white transition hover:bg-orange-600"
                      >
                        Ask on WhatsApp
                      </a>
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

      <footer className="border-t border-[#EAEAEA] bg-white px-6 py-12">
        <div className="mx-auto max-w-6xl text-center">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-neutral-600">
            <a href="#our-work" className="transition hover:text-black">Our Work</a>
            <a href="#" className="transition hover:text-black">Terms</a>
            <a href="#" className="transition hover:text-black">Privacy</a>
            <a href="https://www.instagram.com/mo_tshirt_printing/" target="_blank" rel="noopener noreferrer" className="transition hover:text-black">
              Instagram
            </a>
            <a href="https://www.tiktok.com/@mo_tshirt_mauritius" target="_blank" rel="noopener noreferrer" className="transition hover:text-black">
              TikTok
            </a>
            <a href={getWhatsAppUrl()} target="_blank" rel="noopener noreferrer" className="transition hover:text-black">
              WhatsApp
            </a>
          </div>
          <p className="mt-6 text-xs text-neutral-500">
            © MO T-SHIRT — Mauritius’ trusted name in custom printing.
            <span className="mx-2 text-neutral-400">|</span>
            <a href="https://www.mo-tshirt.mu/login" className="transition hover:text-black hover:underline">
              All Rights Reserved
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
