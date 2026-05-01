import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_TEL, getWhatsAppUrl } from "@/data/work";
import {
  READY_MADE_UNIFORMS_PATH,
  readyMadeUniformFaqs,
  readyMadeUniformHighlights,
  readyMadeUniformSteps,
  readyMadeUniforms,
} from "@/data/ready-made-uniforms";
import TrackedWhatsAppLink from "@/components/TrackedWhatsAppLink";
import { buildPageMetadata } from "@/lib/seo";
import { getReadyMadeUniformItems } from "@/lib/ready-made-uniforms-store";

const pageTitle = "Ready-Made Uniform Designs Mauritius | Corporate & Team Uniforms";
const pageDescription =
  "Ready-made uniform designs for security companies, restaurant staff, organisations, sports teams, NGOs, and syndic teams in Mauritius. Choose a proven style, add your logo, and order faster.";

export const metadata: Metadata = buildPageMetadata({
  title: pageTitle,
  description: pageDescription,
  path: READY_MADE_UNIFORMS_PATH,
  image: "/mockups/polo-front.png",
});

export const dynamic = "force-dynamic";

const pageNav = [
  { label: "Home", href: "/" },
  { label: "Collections", href: "#collections" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Get Quote", href: "/#contact", buttonTone: "orange" as const },
  { label: "WhatsApp", href: getWhatsAppUrl("Hi! I want to see your ready-made uniform designs.") },
];

const offerReasons = [
  {
    title: "Sell speed, not design delays",
    copy: "Clients do not need to wait for a full custom concept when the core layout is already tested.",
  },
  {
    title: "Look like a specialist",
    copy: "This page positions MO T-SHIRT as the expert for uniform systems, not just one-off shirt printing.",
  },
  {
    title: "Built for recurring orders",
    copy: "The same design can be reused for new hires, new teams, and future restocks without starting over.",
  },
];

async function loadUniforms() {
  try {
    return await getReadyMadeUniformItems();
  } catch (error) {
    console.error("ready-made-uniforms:page", error);
    return readyMadeUniforms;
  }
}

export default async function ReadyMadeUniformsPage() {
  const uniforms = await loadUniforms();

  return (
    <div className="min-h-screen bg-[#fcfcfb] text-black">
      <header className="sticky top-0 z-40 border-b border-[#EAEAEA] bg-white/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:h-20 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-0">
          <Link href="/" className="flex items-center justify-center sm:justify-start" aria-label="MO T-SHIRT Home">
            <Image src="/logo_transparent.png" alt="MO T-SHIRT logo" width={150} height={60} priority className="h-9 w-auto sm:h-12" />
          </Link>

          <nav
            aria-label="Ready-made uniforms navigation"
            className="flex flex-wrap items-center justify-center gap-3 text-base font-semibold text-black/70 sm:justify-end sm:gap-x-6 sm:gap-y-3 sm:text-sm sm:font-medium"
          >
            {pageNav.map((link) => (
              link.label === "WhatsApp" ? (
                <TrackedWhatsAppLink
                  key={link.label}
                  href={link.href}
                  trackingLocation="uniform_page_header"
                  trackingSource="ready_made_uniforms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full border border-[#EAEAEA] bg-white px-5 py-3 leading-none transition hover:border-black hover:text-black sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
                >
                  {link.label}
                </TrackedWhatsAppLink>
              ) : link.href.startsWith("/") ? (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full border px-5 py-3 leading-none transition ${
                    link.buttonTone === "orange"
                      ? "border-transparent bg-[#FF6600] text-white shadow-sm hover:bg-orange-600 sm:min-h-10 sm:px-5 sm:py-2 sm:text-sm"
                      : "border-[#EAEAEA] bg-white text-black/70 hover:border-black hover:text-black sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
                  }`}
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  className={`inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full border px-5 py-3 leading-none transition ${
                    link.buttonTone === "orange"
                      ? "border-transparent bg-[#FF6600] text-white shadow-sm hover:bg-orange-600 sm:min-h-10 sm:px-5 sm:py-2 sm:text-sm"
                      : "border-[#EAEAEA] bg-white text-black/70 hover:border-black hover:text-black sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
                  }`}
                >
                  {link.label}
                </a>
              )
            ))}
          </nav>
        </div>
      </header>

      <main>
        <section className="overflow-hidden px-6 pt-14 pb-16 sm:pt-20 sm:pb-20">
          <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">
                Ready-made uniform designs
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-black sm:text-5xl">
                Proven uniform offers for teams that want to order fast.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-neutral-600">
                Create one strong offer for corporates, restaurants, organisations, sports teams,
                donation campaigns, security companies, and syndic teams. Clients choose a proven
                style, send their logo, and move forward without a long design process.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {readyMadeUniformHighlights.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-700 shadow-sm"
                  >
                    {item}
                  </span>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#collections"
                  className="inline-flex items-center justify-center rounded-full bg-[#FF6600] px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
                >
                  Browse Uniform Collections
                </a>
                <Link
                  href="/#contact"
                  className="inline-flex items-center justify-center rounded-full border border-black bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
                >
                  Request a Uniform Quote
                </Link>
                <TrackedWhatsAppLink
                  href={getWhatsAppUrl("Hi! I want to see your ready-made uniform designs for my company.")}
                  trackingLocation="uniform_page_hero"
                  trackingSource="ready_made_uniforms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-6 py-3 text-sm font-semibold text-neutral-800 transition hover:border-black hover:text-black"
                >
                  WhatsApp for designs
                </TrackedWhatsAppLink>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -top-10 right-10 h-36 w-36 rounded-full bg-orange-200/50 blur-3xl" aria-hidden="true" />
              <div className="absolute -bottom-8 left-10 h-40 w-40 rounded-full bg-sky-200/45 blur-3xl" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-[32px] border border-[#EAEAEA] bg-[linear-gradient(145deg,#101010_0%,#1e293b_42%,#fb923c_100%)] p-6 shadow-[0_35px_90px_-45px_rgba(0,0,0,0.45)]">
                <div className="grid gap-4 sm:grid-cols-2">
                  {uniforms.slice(0, 4).map((uniform) => (
                    <div key={uniform.code} className="rounded-[24px] border border-white/10 bg-white/10 p-4 text-white backdrop-blur-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                          {uniform.code}
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                          Ready-made
                        </span>
                      </div>
                      <div className="mt-4 flex justify-center">
                        <img
                          src={uniform.imageSrc}
                          alt={`${uniform.title} mockup`}
                          className="h-32 w-auto object-contain drop-shadow-[0_18px_32px_rgba(0,0,0,0.28)]"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                      <h2 className="mt-4 text-base font-semibold">{uniform.title}</h2>
                      <p className="mt-1 text-sm leading-6 text-white/78">{uniform.audience}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-[24px] border border-white/10 bg-white/10 p-5 text-white backdrop-blur-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
                    Positioning line
                  </p>
                  <p className="mt-3 text-xl font-semibold leading-8">
                    Choose a style code. Add your logo. Reorder forever.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">How it works</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-black sm:text-4xl">
                Sell it as an offer, not just a gallery.
              </h2>
              <p className="mt-4 text-base leading-7 text-neutral-600">
                This page works because it helps clients make a fast buying decision. The design
                system already exists, so the conversation becomes style code, logo, quantity,
                and deadline.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {readyMadeUniformSteps.map((step, index) => (
                <article
                  key={step.title}
                  className="rounded-[28px] border border-[#EAEAEA] bg-white p-6 shadow-[0_26px_60px_-42px_rgba(0,0,0,0.28)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                    Step {index + 1}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold text-black">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-neutral-600">{step.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f7f7f4] px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-4 lg:grid-cols-3">
              {offerReasons.map((reason) => (
                <article
                  key={reason.title}
                  className="rounded-[28px] border border-white/80 bg-white p-6 shadow-[0_24px_55px_-38px_rgba(0,0,0,0.24)]"
                >
                  <h2 className="text-xl font-semibold text-black">{reason.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-neutral-600">{reason.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="collections" className="px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">Collections</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-black sm:text-4xl">
                  Uniform categories ready to customize
                </h2>
                <p className="mt-4 text-base leading-7 text-neutral-600">
                  Each design works as a reusable starting point. The client picks the category and
                  style code, then you customize it with branding and order details.
                </p>
              </div>
              <Link
                href="/#contact"
                className="inline-flex items-center justify-center rounded-full border border-black bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
              >
                Start a quote
              </Link>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {uniforms.map((uniform) => (
                <article
                  key={uniform.code}
                  className="overflow-hidden rounded-[30px] border border-[#EAEAEA] bg-white shadow-[0_32px_80px_-52px_rgba(0,0,0,0.35)]"
                >
                  <div className={`relative overflow-hidden bg-gradient-to-br ${uniform.accentClass} px-5 pt-5`}>
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${uniform.badgeClass}`}
                      >
                        {uniform.code}
                      </span>
                      <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
                        Ready-made
                      </span>
                    </div>
                    <div className="relative mt-5 flex justify-center">
                      <div className="absolute inset-x-10 bottom-2 h-10 rounded-full bg-black/20 blur-2xl" aria-hidden="true" />
                      <img
                        src={uniform.imageSrc}
                        alt={`${uniform.title} sample`}
                        className="relative h-56 w-auto object-contain drop-shadow-[0_24px_40px_rgba(0,0,0,0.22)]"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  </div>

                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                      {uniform.audience}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-black">{uniform.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-neutral-600">{uniform.description}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {uniform.features.map((feature) => (
                        <span
                          key={feature}
                          className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>

                    <div className="mt-5 flex flex-col gap-2">
                      <Link
                        href="/#contact"
                        className="inline-flex items-center justify-center rounded-full bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
                      >
                        Request This Design
                      </Link>
                      <TrackedWhatsAppLink
                        href={getWhatsAppUrl(uniform.message)}
                        trackingLocation={`uniform_page_card_${uniform.code.toLowerCase()}`}
                        trackingSource="ready_made_uniforms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 transition hover:border-black hover:text-black"
                      >
                        WhatsApp {uniform.code}
                      </TrackedWhatsAppLink>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
            <div className="rounded-[32px] border border-[#EAEAEA] bg-[linear-gradient(160deg,#fff2e2_0%,#ffffff_42%,#f4f8ff_100%)] p-8 shadow-[0_30px_80px_-54px_rgba(0,0,0,0.26)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">Offer positioning</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-black">
                Use style codes to make the sale easier
              </h2>
              <p className="mt-4 text-base leading-7 text-neutral-600">
                Instead of asking the client to explain a full concept, tell them to choose a style
                code. Example: “I want SEC-01 with my company logo.” That makes the quoting process
                faster and makes the offer feel organized.
              </p>
              <div className="mt-6 rounded-[24px] border border-white/70 bg-white/85 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                  Suggested client message
                </p>
                <p className="mt-3 text-base font-semibold leading-7 text-black">
                  Hi, I want style SEC-01 with my logo, black base, and 40 pieces.
                </p>
              </div>
            </div>

            <div className="rounded-[32px] border border-[#EAEAEA] bg-white p-8 shadow-[0_30px_80px_-54px_rgba(0,0,0,0.22)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">FAQ</p>
              <div className="mt-4 space-y-3">
                {readyMadeUniformFaqs.map((item) => (
                  <details
                    key={item.question}
                    className="group rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                  >
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-base font-semibold text-black">
                      <span>{item.question}</span>
                      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-sm leading-none text-neutral-500 transition group-open:rotate-45 sm:h-6 sm:w-6 sm:text-xs">
                        +
                      </span>
                    </summary>
                    <p className="mt-3 text-sm leading-6 text-neutral-600">{item.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-orange-200 bg-[#FF6600] px-6 py-12 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/75">
                Ready-made uniforms
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Want to turn one design into a repeatable uniform offer?
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/88">
                Send your style code, logo, quantity, and deadline. We will help you move fast from
                concept to quote.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link
                href="/#contact"
                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#FF6600] transition hover:bg-orange-50"
              >
                Request a Uniform Quote
              </Link>
              <TrackedWhatsAppLink
                href={getWhatsAppUrl("Hi! I want to order one of your ready-made uniform designs.")}
                trackingLocation="uniform_page_footer"
                trackingSource="ready_made_uniforms"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-full border border-white/35 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                WhatsApp Now
              </TrackedWhatsAppLink>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-5 text-sm text-white/88">
            <Link href="/" className="transition hover:text-white">Home</Link>
            <Link href="/#contact" className="transition hover:text-white">Quote Form</Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="transition hover:text-white">{CONTACT_EMAIL}</a>
            <a href={`tel:${CONTACT_TEL}`} className="transition hover:text-white">{CONTACT_PHONE_DISPLAY}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
