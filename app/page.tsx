import Link from "next/link";

export default function HomePage() {
  return (
    <main className="px-6 md:px-8 py-14 mx-auto max-w-7xl">
      <header className="mb-12 grid md:grid-cols-2 gap-8 items-center">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">Custom T‑Shirts, Hoodies & Workwear</h1>
          <p className="text-gray-600 mt-3">Screen printing, embroidery, and DTF with fast turnaround in Mauritius. We handle sourcing, design, and delivery—so you look professional every day.</p>
          <div className="mt-5 flex gap-3">
            <Link href="/contact" className="px-5 py-3 rounded-full bg-orange-500 text-white hover:bg-orange-600">Get a Quote</Link>
            <Link href="/work" className="px-5 py-3 rounded-full border hover:bg-gray-50">View Work</Link>
          </div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-orange-100 to-amber-100 border p-8 text-center">
          <div className="text-6xl">👕</div>
          <div className="mt-3 font-semibold">On-brand merch for teams and events</div>
          <div className="text-sm text-gray-600">No minimums for DTF. Bulk pricing for screen printing.</div>
        </div>
      </header>

      <section className="mb-12">
        <h2 className="text-2xl font-bold">Services</h2>
        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[ 
            { title: "Screen Printing", desc: "Vibrant, durable prints for bulk orders." },
            { title: "Embroidery", desc: "Premium stitched logos for polos & caps." },
            { title: "DTF Transfers", desc: "No-minimum prints, full color detail." },
            { title: "Apparel Sourcing", desc: "Quality blanks from trusted suppliers." },
            { title: "Design Support", desc: "Artwork cleanup and brand templates." },
            { title: "Island-wide Delivery", desc: "Pickup in Surinam or courier delivery." },
          ].map((s, i) => (
            <div key={i} className="rounded-2xl border bg-white p-5">
              <div className="font-semibold">{s.title}</div>
              <p className="text-sm text-gray-600 mt-1">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold">How It Works</h2>
        <ol className="mt-4 grid md:grid-cols-4 gap-4 list-decimal list-inside">
          <li className="rounded-2xl border bg-white p-4"><span className="font-semibold">Brief:</span> Tell us quantities, sizes, and deadline.</li>
          <li className="rounded-2xl border bg-white p-4"><span className="font-semibold">Mockup:</span> We prepare your design for approval.</li>
          <li className="rounded-2xl border bg-white p-4"><span className="font-semibold">Production:</span> We print, stitch, and quality check.</li>
          <li className="rounded-2xl border bg-white p-4"><span className="font-semibold">Delivery:</span> Pickup or courier delivery island‑wide.</li>
        </ol>
      </section>

      <section className="rounded-2xl border bg-white p-6 text-center">
        <h3 className="text-xl font-semibold">Ready to start?</h3>
        <p className="text-gray-600 mt-1">We reply quickly on WhatsApp and email.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <a href="https://wa.me/23059883880" target="_blank" rel="noreferrer" className="px-5 py-2 rounded-full border border-green-600 text-green-700 hover:bg-green-50">WhatsApp</a>
          <Link href="/contact" className="px-5 py-2 rounded-full bg-orange-500 text-white hover:bg-orange-600">Contact Form</Link>
        </div>
      </section>
    </main>
  );
}
