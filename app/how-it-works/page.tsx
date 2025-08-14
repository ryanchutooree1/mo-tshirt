export default function HowItWorks() {
  return (
    <main className="px-6 py-12 max-w-5xl mx-auto">
      <h1 className="text-4xl font-bold mb-4">
        How <span className="text-orange-500">MO T-SHIRT</span> Works
      </h1>
      <p className="text-lg mb-8">
        From idea to delivery, our process is fast, simple, and professional. Whether you need
        T-shirts, polos, or caps for your business, school, or event — here’s how we make it happen:
      </p>

      {/* Step 1 */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-2">1. Share Your Design or Idea</h2>
        <p className="text-gray-700">
          Send us your logo, text, or design inspiration via WhatsApp at{" "}
          <a
            href="https://wa.me/23059883880"
            className="text-orange-500 font-medium"
          >
            +230 5988 3880
          </a>
          . If you don’t have a design, we can create one for you.
        </p>
      </div>

      {/* Step 2 */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-2">2. Choose Your Product</h2>
        <p className="text-gray-700">
          Select from our premium range of plain T-shirts, polos, and caps — available in multiple
          sizes and colours. We use high-quality DTF & Vinyl printing for a long-lasting finish.
        </p>
      </div>

      {/* Step 3 */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-2">3. Approve the Final Design</h2>
        <p className="text-gray-700">
          We’ll send you a mock-up for approval before printing. This ensures everything looks
          exactly how you want it.
        </p>
      </div>

      {/* Step 4 */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-2">4. Printing & Quality Check</h2>
        <p className="text-gray-700">
          Once approved, we print your order with precision and check every piece for quality.
        </p>
      </div>

      {/* Step 5 */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-2">5. Fast Delivery or Pickup</h2>
        <p className="text-gray-700">
          Get your order via Post Office delivery anywhere in Mauritius or pick it up from Surinam.
          Our turnaround is fast — so you get your items on time, every time.
        </p>
      </div>

      <div className="mt-10">
        <a
          href="https://wa.me/23059883880"
          className="px-6 py-3 bg-black text-white rounded-full"
        >
          Get a Quote on WhatsApp
        </a>
      </div>
    </main>
  );
}
