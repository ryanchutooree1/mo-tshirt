import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Gallery from "@/components/Gallery";
import Problems from "@/components/Problems";
import MapCard from "@/components/MapCard";
import { getWhatsAppUrl, CONTACT_EMAIL, CONTACT_TEL, CONTACT_PHONE_DISPLAY } from "@/data/work";
import HowToOrder from "@/components/HowToOrder";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900">
      <Header />

      <main className="flex-1">
        <Hero />

        {/* Pricing anchor section */}
        <section id="pricing" className="py-12 lg:py-20 bg-gray-50">
          <div className="mx-auto max-w-6xl px-4 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Clear & Fair Pricing</h2>
            <p className="mt-3 text-base sm:text-lg text-gray-600">
              Pricing depends on size, colors, and quantity. Send us your logo for a quick quote.
            </p>
            <div className="mt-6">
              <a href="#contact" className="text-sm font-semibold text-gray-700 hover:text-gray-900">
                See contact options →
              </a>
            </div>
          </div>
        </section>

        {/* How to Order */}
        <HowToOrder />

        {/* Our Work */}
        <section id="our-work" className="py-12 lg:py-20 bg-white border-t border-gray-200">
          <div className="mx-auto max-w-6xl px-4 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Our Work</h2>
            <p className="mt-3 text-base sm:text-lg text-gray-600">
              Recent prints for local teams, events, and businesses.
            </p>
            <div className="mt-8">
              <Gallery />
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section id="benefits" className="py-12 lg:py-20 bg-gray-50 border-t border-gray-200">
          <div className="mx-auto max-w-6xl px-4">
            <Problems />
          </div>
        </section>

        {/* Map Section */}
        <section className="py-12 lg:py-20 bg-white border-t border-gray-200">
          <div className="mx-auto max-w-6xl px-4 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Find Us in the South</h2>
            <p className="mt-3 text-base sm:text-lg text-gray-600">
              We proudly serve all of Mauritius, with our workshop based in Surinam.
            </p>
            <div className="mt-8">
              <MapCard />
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section id="contact" className="py-12 lg:py-20 bg-gray-50 border-t border-gray-200">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center rounded-2xl border bg-white p-6 sm:p-8 shadow-sm">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">Contact MO T-SHIRT</h2>
              <p className="mt-3 text-base sm:text-lg text-gray-600">
                Fast replies. Professional support for your next print job.
              </p>

              <div className="mt-6 flex justify-center">
                <a
                  href={getWhatsAppUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-green-600 px-6 py-3 text-white font-semibold shadow hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                >
                  WhatsApp Us
                </a>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                <div className="rounded-xl border bg-gray-50 p-4">
                  <div className="text-xs uppercase tracking-wide text-gray-500">Phone / WhatsApp</div>
                  <a href={`tel:${CONTACT_TEL}`} className="mt-1 block text-base font-semibold text-gray-900 hover:underline">
                    {CONTACT_PHONE_DISPLAY}
                  </a>
                </div>
                <div className="rounded-xl border bg-gray-50 p-4">
                  <div className="text-xs uppercase tracking-wide text-gray-500">Email</div>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="mt-1 block text-base font-semibold text-gray-900 break-all hover:underline">
                    {CONTACT_EMAIL}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
