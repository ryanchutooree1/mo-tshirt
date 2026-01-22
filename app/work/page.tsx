import Link from "next/link";
import Gallery from "@/components/Gallery";
import QuoteForm from "@/components/QuoteForm";
import { CONTACT_PHONE_DISPLAY, CONTACT_TEL, getWhatsAppUrl } from "@/data/work";

export default function WorkIndexPage() {
  return (
    <main className="px-6 md:px-8 py-20 mx-auto max-w-6xl space-y-16">
      <section className="space-y-4 text-center">
        <p className="text-xs uppercase tracking-[0.08em] text-orange-500">Portfolio</p>
        <h1 className="text-3xl md:text-4xl font-extrabold">Recent work for Mauritius teams & brands</h1>
        <p className="mx-auto max-w-3xl text-neutral-700">
          Uniforms, merch, launch drops, and event tees. Tell us what you need—we’ll recommend the best print method and deliver fast.
        </p>
        <p className="mx-auto max-w-3xl text-sm text-neutral-600">
          Looking for{" "}
          <Link href="/" className="underline decoration-orange-400 underline-offset-4 hover:text-black">
            T-shirt printing in Mauritius
          </Link>
          ? Start on our homepage for pricing, print options, and FAQs.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href={getWhatsAppUrl("Hi! I saw your work. Can you quote me?")}
            className="inline-flex items-center justify-center rounded-full bg-[#FF6600] px-5 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            WhatsApp us
          </a>
          <a
            href="#quote"
            className="inline-flex items-center justify-center rounded-full border border-black px-5 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
          >
            Get a quote
          </a>
        </div>
      </section>

      <section aria-labelledby="gallery-heading" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-orange-500">Proof</p>
            <h2 id="gallery-heading" className="text-2xl font-semibold text-black">
              Work we’ve shipped
            </h2>
            <p className="text-sm text-neutral-600">Trusted by gyms, events, and businesses island-wide.</p>
          </div>
          <span className="hidden rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700 sm:inline-block">
            80+ Mauritius clients
          </span>
        </div>
        <Gallery />
      </section>

      <section id="quote" className="grid gap-8 lg:grid-cols-2">
        <div className="rounded-[24px] border border-neutral-200 bg-white p-8 shadow-sm">
          <p className="text-xs uppercase tracking-[0.08em] text-orange-500">Quote form</p>
          <h2 className="text-2xl font-semibold text-black">Tell us about your order</h2>
          <p className="text-sm text-neutral-700">
            Share garments, quantity, and deadline. We’ll send pricing and confirm delivery or pickup.
          </p>
          <div className="mt-6">
            <QuoteForm source="Work page" />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
            <h3 className="text-lg font-semibold text-black">Need advice?</h3>
            <p className="mt-2 text-sm text-neutral-700">
              Call {CONTACT_PHONE_DISPLAY} for fabric, sizing, or branding recommendations. Rush jobs (48h) available when slots are open.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={`tel:${CONTACT_TEL}`}
                className="inline-flex items-center justify-center rounded-full border border-black px-4 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
              >
                Call us
              </a>
              <a
                href={getWhatsAppUrl("Can you advise the best print method for my order?")}
                className="inline-flex items-center justify-center rounded-full bg-[#FF6600] px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                WhatsApp
              </a>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-neutral-600">
              <li>• Screen print for bulk, DTF for small batches, vinyl for polos.</li>
              <li>• Delivery nationwide via Mauritius Post or pickup Surinam.</li>
              <li>• Bulk discounts above 50 units.</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
