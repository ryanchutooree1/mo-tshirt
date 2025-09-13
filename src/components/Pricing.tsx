import { getWhatsAppUrl } from "@/data/work";

export default function Pricing() {
  const examples = [
    {
      title: "Small chest logo",
      lines: ["Single position", "Clean, single or two colors", "Fastest turnaround"],
    },
    {
      title: "Front + back print",
      lines: ["Two positions", "More area or detail", "Most popular"],
    },
    {
      title: "Team / bulk 20+",
      lines: ["Mixed sizes ok", "Bulk discounts available", "Great for clubs & companies"],
    },
  ];

  return (
    <section id="pricing" className="py-12 lg:py-20 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Clear, Fair Pricing</h2>
          <p className="mt-3 text-base sm:text-lg text-gray-600">
            Share your logo and quantity. We’ll reply with a quick quote.
          </p>
        </div>

        {/* Factors */}
        <div className="mt-8 mx-auto max-w-3xl">
          <div className="rounded-2xl border bg-white p-5 sm:p-6 shadow-sm">
            <div className="text-sm font-semibold text-gray-900">What affects price</div>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-700">
              <li className="flex items-start gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-orange-500"/>Print size and positions</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-orange-500"/>Number of colors</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-orange-500"/>Garment type (T‑shirt, polo, hoodie, cap)</li>
              <li className="flex items-start gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-orange-500"/>Quantity (bulk discounts)</li>
            </ul>
          </div>
        </div>

        {/* Example cards */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {examples.map((ex) => (
            <div key={ex.title} className="rounded-2xl border bg-white p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="text-base font-semibold text-gray-900">{ex.title}</div>
              <ul className="mt-3 space-y-1 text-sm text-gray-600">
                {ex.lines.map((l, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 rounded-full bg-gray-300" />{l}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={getWhatsAppUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-green-600 px-5 py-2.5 text-white text-sm font-semibold shadow hover:bg-green-700"
          >
            WhatsApp a Logo for Quote
          </a>
          <a
            href="#contact"
            className="rounded-full bg-gray-900 px-5 py-2.5 text-white text-sm font-semibold shadow hover:bg-gray-800"
          >
            Get a Quote
          </a>
        </div>

        <p className="mt-4 text-center text-xs text-gray-500">No obligation. Quick response during business hours.</p>
      </div>
    </section>
  );
}

