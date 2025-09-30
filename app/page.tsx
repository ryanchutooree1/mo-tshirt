import Image from "next/image";
import Link from "next/link";
import { getWhatsAppUrl, CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_TEL } from "@/data/work";
import { HiOutlineCheckBadge, HiOutlineBolt, HiOutlineGlobeAlt, HiOutlineSparkles } from "react-icons/hi2";
import Gallery from "@/components/Gallery";

const navLinks = [
  { label: "Home", href: "#hero" },
  { label: "Our Work", href: "#our-work" },
  { label: "Contact", href: "#contact" },
  { label: "WhatsApp", href: getWhatsAppUrl() },
];

const benefits = [
  {
    icon: HiOutlineCheckBadge,
    title: "High-quality materials",
    copy: "Soft, durable garments sourced with care.",
  },
  {
    icon: HiOutlineBolt,
    title: "Fast printing & delivery",
    copy: "Turnarounds tuned for launches and deadlines.",
  },
  {
    icon: HiOutlineSparkles,
    title: "Trusted by top brands",
    copy: "Worn by Mauritius’ events, gyms, and teams.",
  },
  {
    icon: HiOutlineGlobeAlt,
    title: "Made in Mauritius",
    copy: "Local craft, island-wide service and support.",
  },
];

function ActionButtons() {
  return (
    <div className="mt-8 mx-auto flex w-full max-w-md flex-wrap items-center gap-3 sm:flex-nowrap sm:justify-between">
      <a
        href={getWhatsAppUrl("Hi, I need printing. What's your price for this?")}
        className="inline-flex flex-1 items-center justify-center rounded-full bg-green-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-green-700"
      >
        WhatsApp
      </a>
      <a
        href="#contact"
        className="inline-flex flex-1 items-center justify-center rounded-full bg-[#FF6600] px-6 py-3 text-sm font-medium text-white transition hover:bg-orange-600"
      >
        Get a Quote
      </a>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-black">
      <header className="sticky top-0 z-40 border-b border-[#EAEAEA] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
          <Link href="#hero" className="flex items-center" aria-label="MO T-SHIRT Home">
            <Image src="/logo_transparent.png" alt="MO T-SHIRT logo" width={150} height={60} priority className="h-12 w-auto" />
          </Link>
          <nav aria-label="Primary" className="flex flex-wrap items-center justify-end gap-6 text-sm font-medium text-black/70">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="transition hover:text-black"
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
        {/* Hero */}
        <section id="hero" className="flex min-h-[80vh] items-center justify-center px-6 pt-14 pb-24 sm:pt-20 sm:pb-32">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-black sm:text-5xl">
              Trying to be #1 in Mauritius.
            </h1>
            <p className="mt-4 text-lg text-neutral-600">
              We’ll print T‑Shirts, Poloshirts, Caps & Hoodies fast. Trusted by 80+ businesses across Mauritius and Reunion Island.
            </p>

            <ActionButtons />

            <div className="mt-16 w-full max-w-5xl lg:max-w-6xl">
              <Image
                src="/all_products.png"
                alt="Custom T-shirt flat lay"
                width={1536}
                height={1024}
                className="h-[360px] w-full rounded-[32px] border border-[#EAEAEA] object-cover shadow-sm sm:h-[460px] lg:h-[560px]"
                priority
              />
            </div>
          </div>
        </section>

        {/* Our Work */}
        <section id="our-work" className="px-6 py-24">
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Our Work</h2>
            <p className="mt-4 text-base text-neutral-600">
              Recent prints for local teams, events, and businesses.
            </p>
            <div className="mt-12">
              <Gallery />
            </div>
          </div>
        </section>

        {/* Why Choose Us */}
        <section id="why" className="bg-[#F9F9F9] px-6 py-24">
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Why choose MO T-SHIRT</h2>
            <p className="mt-4 text-base text-neutral-600">
              Craftsmanship, precision, and support from a Mauritius-born team.
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

        {/* Contact */}
        <section id="contact" className="px-6 py-24">
          <div className="mx-auto max-w-4xl rounded-[32px] border border-[#EAEAEA] bg-white p-12 text-center shadow-sm">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Let’s start your order.</h2>
            <p className="mt-4 text-base text-neutral-600">
              Share your artwork or idea and we’ll reply with clear pricing and timelines.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <a
                href={`tel:${CONTACT_TEL}`}
                className="inline-flex items-center justify-center rounded-full border border-black px-6 py-3 text-sm font-medium text-black transition hover:bg-black hover:text-white"
              >
                Call {CONTACT_PHONE_DISPLAY}
              </a>
              <a
                href={getWhatsAppUrl("Hi MO T-SHIRT, I’d like to start a custom print order.")}
                className="inline-flex items-center justify-center rounded-full bg-[#FF6600] px-6 py-3 text-sm font-medium text-white transition hover:bg-orange-600"
              >
                WhatsApp us
              </a>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="inline-flex items-center justify-center rounded-full border border-black px-6 py-3 text-sm font-medium text-black transition hover:bg-black hover:text-white"
              >
                Email us
              </a>
            </div>
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
