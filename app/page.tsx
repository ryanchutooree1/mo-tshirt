export default function Home() {
  return (
    <main className="px-6 py-12 max-w-5xl mx-auto">
      {/* Hero Section */}
      <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
        Premium <span className="text-orange-500">Custom Printing</span> for
        <br />
        T-Shirts, Polos & Caps
      </h1>

      <p className="text-lg text-gray-700 mb-6">
        At <span className="font-semibold">MO T-SHIRT</span>, we deliver high-quality{" "}
        <span className="font-medium">DTF & Vinyl printing</span> for your brand, event,
        or team. Perfect for <strong>companies</strong>, <strong>schools</strong>,{" "}
        <strong>clubs</strong>, and <strong>special occasions</strong>.
        <br />
        Pick-up in <strong>Surinam</strong> or get it delivered anywhere in Mauritius via Post.
      </p>

      {/* Call-to-Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4">
        <a
          href="https://wa.me/23059883880"
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-3 bg-orange-500 text-white font-medium rounded-full shadow hover:bg-orange-600 transition"
        >
          📲 Contact on WhatsApp
        </a>
        <a
          href="/work"
          className="px-6 py-3 border border-orange-500 text-orange-500 font-medium rounded-full hover:bg-orange-50 transition"
        >
          See Our Work
        </a>
      </div>

      {/* Quick Selling Points */}
      <div className="grid md:grid-cols-3 gap-6 mt-12">
        <div className="p-6 border rounded-lg shadow-sm hover:shadow-md transition">
          <h3 className="font-semibold text-lg mb-2">🎯 Premium Quality</h3>
          <p className="text-gray-600">Vibrant, long-lasting prints on the finest fabrics.</p>
        </div>
        <div className="p-6 border rounded-lg shadow-sm hover:shadow-md transition">
          <h3 className="font-semibold text-lg mb-2">⚡ Fast Turnaround</h3>
          <p className="text-gray-600">Get your order ready in record time without compromises.</p>
        </div>
        <div className="p-6 border rounded-lg shadow-sm hover:shadow-md transition">
          <h3 className="font-semibold text-lg mb-2">📦 Nationwide Delivery</h3>
          <p className="text-gray-600">From our studio in Surinam straight to your doorstep.</p>
        </div>
      </div>
    </main>
  );
}
