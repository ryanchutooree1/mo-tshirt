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
    <section className="py-12 lg:py-20 bg-white">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">How to Order</h2>
        <p className="mt-3 text-center text-base sm:text-lg text-gray-600">Simple steps to get prints you’ll love.</p>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {steps.map((s, i) => (
            <div key={i} className="rounded-2xl border bg-white p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 shrink-0 rounded-full bg-orange-500 text-white grid place-items-center font-semibold">
                  {i + 1}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{s.title}</h3>
                  <p className="mt-1 text-sm text-gray-600">{s.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

