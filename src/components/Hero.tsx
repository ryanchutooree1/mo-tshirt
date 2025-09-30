import { getWhatsAppUrl } from "@/data/work";

export default function Hero() {
  return (
    <section className="relative bg-white pt-12 pb-16 sm:pt-16 sm:pb-20 lg:pt-20 lg:pb-24">
      <div className="mx-auto max-w-6xl px-4 text-center">
        {/* Heading */}
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900">
          Trying to be #1 in Mauritius.
        </h1>
        <p className="mt-4 text-base sm:text-lg text-gray-700">
          Want prints that look pro and last? ✨
        </p>
        <p className="mt-1 text-base sm:text-lg text-gray-600">
          We’ll print T‑Shirts, Poloshirts, Caps & Hoodies fast. Trusted by 80+ businesses across Mauritius and Reunion Island.
        </p>

        {/* Buttons */}
        <div className="mt-8 flex justify-center gap-3 sm:gap-4">
          <a
            href={getWhatsAppUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-green-600 px-6 py-3 text-white font-semibold shadow hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
          >
            WhatsApp
          </a>
          <a
            href="#pricing"
            className="rounded-lg bg-gray-900 px-6 py-3 text-white font-semibold shadow hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-700"
          >
            Get a Quote
          </a>
        </div>

        {/* Products Image */}
        <div className="mt-8 sm:mt-10">
          <img
            src="/all_products.png"
            alt="MO T-SHIRT Products"
            className="mx-auto block h-auto w-full max-w-5xl lg:max-w-6xl rounded-2xl shadow-sm object-contain"
          />
        </div>
      </div>
    </section>
  );
}
