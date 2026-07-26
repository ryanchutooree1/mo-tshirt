import {
  HiOutlineCheckBadge,
  HiOutlineClipboardDocumentList,
  HiOutlineGlobeAlt,
  HiOutlineShoppingBag,
  HiOutlineSparkles,
} from "react-icons/hi2";

const steps = [
  {
    icon: HiOutlineShoppingBag,
    title: "Choose your garments",
    text: "Select T-shirts, polos, hoodies or caps, then tell us the colours, sizes and quantities you need.",
    detail: "Product · colour · size",
  },
  {
    icon: HiOutlineSparkles,
    title: "Send your design",
    text: "Upload your logo or artwork and show us where it should be printed. We can help prepare the file if needed.",
    detail: "Artwork · print position",
  },
  {
    icon: HiOutlineClipboardDocumentList,
    title: "Review your quotation",
    text: "We confirm the print method, mockup, price and deadline. Approve the quotation when everything looks right.",
    detail: "Mockup · price · approval",
  },
  {
    icon: HiOutlineCheckBadge,
    title: "Confirm payment",
    text: "Pay the agreed deposit or full amount. Your payment is recorded and a receipt is provided.",
    detail: "Deposit or full payment",
  },
  {
    icon: HiOutlineGlobeAlt,
    title: "Receive your order",
    text: "Collect from Surinam or choose island-wide delivery. Standard production normally takes 5–7 working days.",
    detail: "Pickup · Mauritius Post",
  },
];

export default function HowToOrder() {
  return (
    <section
      id="how-to-order"
      aria-labelledby="how-to-order-heading"
      className="mt-6 w-full max-w-6xl overflow-hidden rounded-[32px] border border-[#e8e8e5] bg-[#fafaf8] px-5 py-10 text-left shadow-sm sm:px-8 sm:py-14 lg:px-10"
    >
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e94f08]">
          Clear from start to finish
        </p>
        <h2
          id="how-to-order-heading"
          className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#171715] sm:text-4xl"
        >
          How ordering works
        </h2>
        <p className="mt-4 text-base leading-7 text-neutral-600 sm:text-lg">
          From your first idea to finished printed garments in five simple steps.
        </p>
      </div>

      <ol className="relative mt-12 grid gap-8 before:absolute before:left-[10%] before:right-[10%] before:top-0 before:hidden before:h-px before:bg-gradient-to-r before:from-transparent before:via-orange-200 before:to-transparent before:content-[''] sm:grid-cols-2 lg:grid-cols-5 lg:gap-4 lg:before:block">
        {steps.map(({ icon: Icon, title, text, detail }, index) => (
          <li key={title} className="relative flex">
            <article className="group flex w-full flex-col rounded-[26px] border border-[#e7e6e1] bg-white px-5 pb-6 pt-10 text-center shadow-[0_14px_40px_rgba(26,24,20,0.05)] transition duration-200 hover:-translate-y-1 hover:border-orange-200 hover:shadow-[0_18px_44px_rgba(234,88,12,0.10)]">
              <span className="absolute left-1/2 top-0 z-10 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-[#fafaf8] bg-[#ff5a0a] text-lg font-bold text-white shadow-[0_8px_20px_rgba(255,90,10,0.25)]">
                {index + 1}
              </span>
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-[#e94f08] transition group-hover:bg-[#ff5a0a] group-hover:text-white">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-semibold leading-6 text-[#1d1d1b]">{title}</h3>
              <p className="mt-3 flex-1 text-sm leading-6 text-neutral-600">{text}</p>
              <p className="mt-5 border-t border-[#efeee9] pt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-[#a34a20]">
                {detail}
              </p>
            </article>
          </li>
        ))}
      </ol>

      <div className="mt-9 flex flex-col items-center justify-center gap-2 text-center sm:flex-row sm:gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-[#eaf8f0] px-4 py-2 text-xs font-semibold text-[#087b45]">
          <HiOutlineCheckBadge className="h-4 w-4" aria-hidden="true" />
          Quotation before production
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-4 py-2 text-xs font-semibold text-[#b94710]">
          <HiOutlineGlobeAlt className="h-4 w-4" aria-hidden="true" />
          Pickup or island-wide delivery
        </span>
      </div>
    </section>
  );
}
