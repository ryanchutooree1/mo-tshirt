const steps = [
  {
    emoji: "👕",
    title: "Pick your product",
    text: "Choose T-shirts, polos, hoodies or caps, then select your colours, sizes and quantities.",
  },
  {
    emoji: "🎨",
    title: "Upload your design",
    text: "Send your logo or artwork and choose the print position. We can help prepare your file if needed.",
  },
  {
    emoji: "💰",
    title: "Review your quotation",
    text: "See the mockup, print method, price and deadline, then approve when everything looks right.",
  },
  {
    emoji: "💳",
    title: "Confirm payment",
    text: "Pay the agreed deposit or full amount. Your payment is recorded and a receipt is provided.",
  },
  {
    emoji: "🚚",
    title: "Receive your order",
    text: "Collect from Surinam or choose island-wide delivery. Standard production takes 5–7 working days.",
  },
];

export default function HowToOrder() {
  return (
    <section
      id="how-to-order"
      aria-labelledby="how-to-order-heading"
      className="mt-6 w-full max-w-6xl rounded-[32px] bg-white px-5 py-12 text-left sm:px-8 sm:py-16 lg:px-10"
    >
      <div className="mx-auto max-w-3xl text-center">
        <h2
          id="how-to-order-heading"
          className="text-4xl font-semibold tracking-[-0.035em] text-[#171717] sm:text-5xl"
        >
          How Direct Ordering Works
        </h2>
        <p className="mt-4 text-base leading-7 text-neutral-600 sm:text-lg">
          From your first idea to finished printed garments in five simple steps.
        </p>
      </div>

      <ol className="mt-16 grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map(({ emoji, title, text }, index) => (
          <li key={title} className="relative flex">
            <article className="flex min-h-[390px] w-full flex-col items-center rounded-[30px] border border-[#e8e8e8] bg-white px-5 pb-8 pt-14 text-center shadow-[0_12px_30px_rgba(0,0,0,0.04)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(0,0,0,0.07)]">
              <span className="absolute left-1/2 top-0 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#ff5a00] text-xl font-semibold text-white shadow-[0_8px_18px_rgba(255,90,0,0.22)]">
                {index + 1}
              </span>
              <span
                className="flex h-20 items-center justify-center text-5xl leading-none"
                aria-hidden="true"
              >
                {emoji}
              </span>
              <h3 className="mt-5 text-xl font-semibold leading-7 text-[#1d1d1d]">{title}</h3>
              <p className="mt-5 text-base leading-7 text-[#929292]">{text}</p>
            </article>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-center text-sm text-[#8d8d8d]">
        Need it sooner? Ask us about available 48-hour rush production slots.
      </p>
    </section>
  );
}
