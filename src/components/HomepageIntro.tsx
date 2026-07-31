import Image from "next/image";
import {
  HiOutlineArrowRight,
  HiOutlineBolt,
  HiOutlineCheckBadge,
  HiOutlineClock,
  HiOutlineCube,
  HiOutlinePencilSquare,
  HiOutlinePrinter,
  HiOutlineShoppingBag,
  HiOutlineTruck,
  HiOutlineUserGroup,
} from "react-icons/hi2";
import { FaWhatsapp } from "react-icons/fa";
import { getWhatsAppUrl } from "@/data/work";
import TrackedWhatsAppLink from "@/components/TrackedWhatsAppLink";

const trustedBrands = [
  {
    name: "Zoza Pastry & Coffee",
    logo: "/trusted-brands/zoza-pastry-and-coffee-logo.webp",
    alt: "Zoza Pastry & Coffee logo",
    imageClassName: "scale-[1.12]",
  },
  {
    name: "Le Rochester Restaurant & Auberge",
    logo: "/trusted-brands/le-rochester-restaurant-and-auberge-logo.webp",
    alt: "Le Rochester Restaurant & Auberge logo",
    imageClassName: "scale-[1.1]",
  },
  {
    name: "Shanti Ghar",
    logo: "/trusted-brands/shanti-ghar-illuminated-logo.png",
    alt: "Shanti Ghar logo",
    imageClassName: "scale-[1.3]",
  },
  {
    name: "Escale des iles Restaurant & Lodging",
    logo: "/trusted-brands/escale-des-iles-restaurant-and-lodging-logo.webp",
    alt: "Escale des iles Restaurant & Lodging logo",
    imageClassName: "scale-[1.1]",
  },
];

const processSteps = [
  {
    icon: HiOutlineShoppingBag,
    title: "Choose Product",
    copy: "Pick your garment, colour and style.",
  },
  {
    icon: HiOutlinePencilSquare,
    title: "Upload Design",
    copy: "Send us your logo or artwork.",
  },
  {
    icon: HiOutlinePrinter,
    title: "We Print",
    copy: "High-quality printing with care.",
  },
  {
    icon: HiOutlineCube,
    title: "Fast Delivery",
    copy: "Pickup or delivery across Mauritius.",
  },
];

const stats = [
  {
    icon: HiOutlineUserGroup,
    value: "80+",
    label: "Happy Businesses",
  },
  {
    icon: HiOutlineShoppingBag,
    value: "50,000+",
    label: "Products Printed",
  },
  {
    icon: HiOutlineClock,
    value: "24h",
    label: "Fastest Turnaround",
  },
  {
    icon: HiOutlineTruck,
    value: "Islandwide",
    label: "Delivery",
  },
];

export default function HomepageIntro() {
  return (
    <>
      <section
        id="hero"
        className="relative overflow-hidden bg-[linear-gradient(115deg,#fffdfb_0%,#fff9f4_46%,#fff1e4_100%)]"
      >
        <div className="mx-auto grid min-h-[520px] w-full max-w-[1400px] lg:grid-cols-[0.92fr_1.08fr] 2xl:min-h-[620px]">
          <div className="relative z-10 flex flex-col justify-center px-5 py-14 sm:px-8 lg:px-10 lg:py-8 2xl:py-16">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-black/10 bg-white/80 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-600 shadow-sm backdrop-blur">
              Proudly Mauritian
              <span className="text-base leading-none" aria-hidden="true">
                🇲🇺
              </span>
            </div>

            <h1 className="mt-7 max-w-[650px] text-5xl font-extrabold leading-[0.98] tracking-[-0.055em] text-[#111111] sm:text-6xl lg:text-[68px]">
              Trying to be
              <br />
              <span className="text-[#ff5a00]">#1</span> in Mauritius.
            </h1>
            <p className="mt-6 max-w-[630px] text-base leading-7 text-neutral-600 sm:text-lg">
              We print T-Shirts, Poloshirts, Caps &amp; Hoodies fast.
              <br className="hidden sm:block" /> Trusted by 80+ businesses across Mauritius and Reunion Island.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <TrackedWhatsAppLink
                href={getWhatsAppUrl()}
                trackingLocation="home_hero"
                trackingSource="homepage"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#ff5a00] px-7 text-sm font-semibold text-white shadow-[0_14px_30px_-16px_rgba(255,90,0,0.9)] transition hover:bg-[#e95000]"
              >
                <FaWhatsapp className="h-5 w-5" aria-hidden="true" />
                Chat on WhatsApp
              </TrackedWhatsAppLink>
              <a
                href="#contact"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white px-7 text-sm font-semibold text-[#202020] shadow-sm transition hover:border-orange-200 hover:text-[#e95000]"
              >
                <HiOutlineShoppingBag className="h-5 w-5" aria-hidden="true" />
                Get pricing in hours
              </a>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
              <HeroBenefit icon={HiOutlineBolt} title="Fast Turnaround" copy="As fast as 24h" />
              <HeroBenefit icon={HiOutlineCheckBadge} title="Premium Quality" copy="Durable & reliable" />
              <HeroBenefit icon={HiOutlineUserGroup} title="Trusted by 80+" copy="Businesses" />
              <HeroBenefit icon={HiOutlineTruck} title="Islandwide Delivery" copy="Mauritius & Réunion" />
            </div>
          </div>

          <div className="relative min-h-[430px] overflow-hidden lg:min-h-[520px] 2xl:min-h-[620px]">
            <div
              className="pointer-events-none absolute -left-16 top-[-12%] h-[115%] w-[80%] rounded-full bg-orange-200/45 blur-2xl"
              aria-hidden="true"
            />
            <Image
              src="/homepage-hero-products-v1.png"
              alt="Orange polo, black T-shirt, black cap and cream hoodie ready for custom printing"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 54vw"
              className="relative object-cover object-center"
            />
          </div>
        </div>
      </section>

      <section
        className="relative z-10 mt-3 px-4 sm:mt-4 sm:px-6"
        aria-label="Trusted clients"
      >
        <div className="mx-auto max-w-[1360px] rounded-[22px] border border-black/[0.04] bg-white/95 px-5 py-3 shadow-[0_18px_55px_rgba(44,35,25,0.08)] backdrop-blur-sm sm:flex sm:items-center sm:gap-8 sm:px-9 sm:py-3">
          <p className="shrink-0 text-[11px] font-semibold uppercase leading-[1.45] tracking-[0.12em] text-[#96999f] sm:w-36">
            Trusted by
            <br />
            amazing brands
          </p>
          <div className="hidden h-10 w-px shrink-0 bg-neutral-200/80 sm:block" aria-hidden="true" />
          <ul
            className="mt-4 grid w-full grid-cols-2 items-center gap-x-7 gap-y-7 sm:mt-0 sm:max-w-[610px] sm:flex-1 sm:grid-cols-4 sm:gap-8"
            aria-label="Brands that trust MO T-SHIRT"
          >
            {trustedBrands.map((brand) => (
              <li
                key={brand.name}
                className="relative h-20 w-28 scale-[1.3] justify-self-center sm:h-[88px] sm:w-[120px]"
              >
                <Image
                  src={brand.logo}
                  alt={brand.alt}
                  fill
                  sizes="(max-width: 640px) 112px, 120px"
                  className={`object-contain ${brand.imageClassName}`}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="how-to-order" className="px-5 pb-12 pt-16 sm:px-6 sm:pb-14 sm:pt-20">
        <div className="mx-auto grid max-w-[1400px] gap-10 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#ff5a00]">Our process</p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-[#151515] sm:text-4xl">
              Simple. Fast. Reliable.
            </h2>
            <p className="mt-4 max-w-xs text-base leading-7 text-neutral-600">
              From your idea to the final product, we make custom printing easy.
            </p>
            <a
              href="#contact"
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#ff5a00] px-6 text-sm font-semibold text-[#ed5100] transition hover:bg-[#ff5a00] hover:text-white"
            >
              Start your quote
              <HiOutlineArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          <ol className="relative grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {processSteps.map(({ icon: Icon, title, copy }, index) => (
              <li key={title} className="relative z-10">
                <article className="flex min-h-[210px] flex-col rounded-[26px] border border-neutral-200 bg-white p-6 shadow-[0_12px_34px_rgba(0,0,0,0.035)]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-500">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Icon className="mt-3 h-10 w-10 text-[#ff5a00]" aria-hidden="true" />
                  <h3 className="mt-4 text-base font-semibold text-[#181818]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">{copy}</p>
                </article>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 pb-0 sm:px-6">
        <div className="mx-auto grid max-w-[1400px] overflow-hidden rounded-[24px] bg-[linear-gradient(100deg,#ff5a00_0%,#ff6500_100%)] px-4 py-7 text-white shadow-[0_18px_38px_rgba(255,90,0,0.18)] sm:grid-cols-2 sm:px-7 lg:grid-cols-4">
          {stats.map(({ icon: Icon, value, label }, index) => (
            <div
              key={label}
              className={`flex items-center justify-center gap-4 px-4 py-4 text-left ${
                index > 0 ? "border-white/25 sm:border-l" : ""
              } ${index === 2 ? "sm:border-l-0 lg:border-l" : ""}`}
            >
              <Icon className="h-10 w-10 shrink-0" aria-hidden="true" />
              <p>
                <span className="block text-2xl font-bold leading-none">{value}</span>
                <span className="mt-2 block text-xs font-medium text-white/85">{label}</span>
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function HeroBenefit({
  icon: Icon,
  title,
  copy,
}: {
  icon: typeof HiOutlineBolt;
  title: string;
  copy: string;
}) {
  return (
    <div className="flex items-start gap-2.5 text-left">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#ff5a00]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="min-w-0 pt-0.5">
        <span className="block text-[11px] font-bold leading-4 text-[#222]">{title}</span>
        <span className="mt-0.5 block text-[10px] leading-4 text-neutral-500">{copy}</span>
      </p>
    </div>
  );
}
