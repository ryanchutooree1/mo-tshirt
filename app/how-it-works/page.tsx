import Link from "next/link";

export const metadata = {
  title: "How It Works | MO T-SHIRT",
  description: "Step-by-step process for getting your T-shirt, polo, and cap printing done with MO T-SHIRT.",
};

export default function HowItWorksPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-20">
      {/* Page Title */}
      <h1 className="text-4xl font-bold text-center mb-6">How It Works</h1>
      <p className="text-center text-lg text-gray-600 mb-12">
        Getting your custom-printed apparel has never been easier. Here’s how our simple 4-step process works.
      </p>

      {/* Steps */}
      <div className="grid md:grid-cols-2 gap-10">
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-2">1. Contact Us</h2>
          <p className="text-gray-700">
            Reach out via our contact form, WhatsApp, or phone. Let us know your product type, quantity, and design requirements.
          </p>
        </div>
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-2">2. Approve Your Design</h2>
          <p className="text-gray-700">
            Our team will prepare a digital mockup of your design. Once you approve it, we proceed with production.
          </p>
        </div>
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-2">3. Printing & Quality Check</h2>
          <p className="text-gray-700">
            We use high-quality DTF and vinyl printing for vibrant colors and long-lasting results. Every item is checked before delivery.
          </p>
        </div>
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-2">4. Delivery or Pickup</h2>
          <p className="text-gray-700">
            Get your order delivered to your location or collect it from our pickup point in Surinam.
          </p>
        </div>
      </div>

      {/* Back Button */}
      <div className="text-center mt-12">
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
