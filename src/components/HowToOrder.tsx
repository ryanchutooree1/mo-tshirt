export default function HowToOrder() {
  const steps = [
    {
      title: "Choose your product",
      text: "T-shirt, Polo, Hoodie, or Cap.",
    },
    {
      title: "Send your logo",
      text: "Share your design on WhatsApp.",
    },
    {
      title: "Get a free quote",
      text: "Approve price and confirm order.",
    },
    {
      title: "We print and deliver",
      text: "Fast turnaround to your door.",
    },
  ];

  return (
    <section id="how-to-order" className="py-12 lg:py-20 bg-white">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">How to Order</h2>
        <p className="mt-3 text-center text-base sm:text-lg text-gray-600">Simple steps to get prints you’ll love.</p>

        {/* Horizontal connector line behind the circles (desktop/tablet) */}
        <div className="relative mt-10">
          <div className="pointer-events-none absolute inset-x-2 md:inset-x-0 top-6 hidden sm:block">
            <div className="h-0.5 bg-gray-200" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
            {steps.map((s, i) => (
              <div key={i} className="relative">
                {/* Numbered circle */}
                <div className="mx-auto h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-orange-500 text-white grid place-items-center text-base sm:text-lg font-semibold shadow">
                  {i + 1}
                </div>

                {/* Card */}
                <div className="mt-4 rounded-2xl border bg-white p-5 sm:p-6 text-center shadow-sm hover:shadow-md transition-shadow">
                  <h3 className="text-base font-semibold text-gray-900">{s.title}</h3>
                  <p className="mt-1 text-sm text-gray-600">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
