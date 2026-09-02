import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import HomeQuoteRequest from "@/components/HomeQuoteRequest";
import HomeMobileMenu from "@/components/HomeMobileMenu";
import TrackedWhatsAppLink from "@/components/TrackedWhatsAppLink";
import {
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  CONTACT_TEL,
  getWhatsAppUrl,
} from "@/data/work";
import { buildPageMetadata } from "@/lib/seo";
import styles from "./home.module.css";

export const metadata: Metadata = buildPageMetadata({
  title: "MO T-SHIRT | Your brand. Worn well.",
  description:
    "Custom T-shirts, polos and hoodies printed in Mauritius. Send your design, get a quote and arrange island-wide delivery.",
  path: "/",
});

const services = [
  {
    title: "Business uniforms",
    description:
      "Branded workwear for your staff, restaurant or business.",
  },
  {
    title: "Events & teams",
    description:
      "Custom apparel for your event, club or team.",
  },
  {
    title: "Clothing brands",
    description:
      "Your designs, printed on T-shirts, polos and hoodies.",
  },
];
const collection = [
  {
    number: "01",
    name: "T-shirts",
    image: "/design-studio/tshirt-realistic.png",
    detail: "FOR TEAMS, EVENTS & EVERYDAY",
  },
  {
    number: "02",
    name: "Polo shirts",
    image: "/design-studio/polo-realistic.png",
    detail: "FOR BUSINESS, HOSPITALITY & CLUBS",
  },
  {
    number: "03",
    name: "Hoodies",
    image: "/design-studio/hoodie-realistic.png",
    detail: "FOR BRANDS, CREATORS & COMMUNITIES",
  },
];
const process = [
  {
    title: "Design",
    copy: "Send your logo, quantity and sizes.",
  },
  {
    title: "Quotation",
    copy: "Confirm your price and artwork.",
  },
  {
    title: "Payment",
    copy: "Pay the agreed deposit to start printing.",
  },
  {
    title: "Delivery",
    copy: "Collect in Surinam or get it delivered.",
  },
];
const faqs = [
  {
    question: "How long will my order take?",
    answer:
      "Standard production takes 5–7 working days. Tell us your deadline when you enquire. Rush slots may be available and are confirmed with your quote.",
  },
  {
    question: "Can I order a small quantity?",
    answer:
      "Yes, we print small batches. Pricing depends on the garment, quantity and artwork, with better unit pricing typically available from 50 pieces.",
  },
  {
    question: "Do I need a finished design?",
    answer:
      "Send your logo or idea and we will help you choose a print method. AI, EPS or PDF artwork is ideal; high-resolution PNG and JPG files also work. You can explore your idea in our online design studio.",
  },
  {
    question: "Do you deliver across Mauritius?",
    answer:
      "Yes. Choose collection in Surinam or island-wide delivery via Mauritius Post. We confirm delivery arrangements with your order.",
  },
];
function Wordmark() {
  return (
    <span className={styles.wordmark}>
      mo<span>.</span>
      <span className={styles.wordmarkLabel}>
        T-SHIRT
        <br />
        MAURITIUS
      </span>
    </span>
  );
}

export default function HomePage() {
  return (
    <div id="top" className={styles.site}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.header}>
        <Link href="/" aria-label="MO T-SHIRT home">
          <Wordmark />
        </Link>
        <nav className={styles.desktopNav} aria-label="Main navigation">
          <a href="#what-we-print">What we print</a>
          <a href="#collection">The collection</a>
          <a href="#how-it-works">How to order</a>
        </nav>
        <a href="#contact" className={styles.headerCta}>
          Get a quote <ArrowUpRight size={17} />
        </a>
        <HomeMobileMenu className={styles.mobileMenu} />
      </header>
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              CUSTOM APPAREL · MAURITIUS <span>↗</span>
            </p>
            <h1 id="hero-title">
              Your brand.
              <br />
              Worn well.
            </h1>
            <p className={styles.heroDescription}>
              Custom T-shirts, polos and hoodies.
              <br />
              Your logo. Our printing. Island-wide delivery.
            </p>
            <div className={styles.heroActions}>
              <a href="#contact" className={styles.primaryButton}>
                Get a quote <ArrowUpRight size={19} />
              </a>
              <Link href="/design-studio" className={styles.textButton}>
                Create your design <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className={styles.heroBottom}>
              <span>
                SURINAM, MAURITIUS
                <br />
                <strong>Collection or island-wide delivery.</strong>
              </span>
              <a href="#how-it-works" aria-label="See how to order">
                <ArrowDown size={23} />
              </a>
            </div>
          </div>
          <div className={styles.heroVisual}>
            <Image
              src="/editorial/navy-studio.png"
              alt="Midnight navy T-shirt and neatly folded polos in a minimal architectural studio"
              fill
              priority
              sizes="(max-width: 760px) 100vw, 48vw"
              className={styles.heroImage}
            />
            <span className={styles.imageLabel}>
              T-SHIRTS / POLOS / HOODIES
            </span>
            <span className={styles.imageIndex}>MO / 01</span>
          </div>
        </section>
        <section
          id="how-it-works"
          className={styles.process}
          aria-labelledby="process-title"
        >
          <div className={styles.processHeading}>
            <div>
              <p className={styles.eyebrow}>HOW TO ORDER</p>
              <h2 id="process-title">Order in 4 steps.</h2>
            </div>
            <a href="#contact" className={styles.textButton}>
              Get a quote <ArrowUpRight size={17} />
            </a>
          </div>
          <Image
            src="/editorial/buying-flow-v2.png"
            alt="A custom T-shirt and design tablet, quotation clipboard, payment terminal and delivery box connected by orange arrows."
            width={1983}
            height={793}
            sizes="(max-width: 760px) 100vw, 90vw"
            className={styles.processImage}
          />
          <ol className={styles.processSteps}>
            {process.map((step, index) => (
              <li key={step.title}>
                <h3 className={styles.stepLabel}>
                  <span>0{index + 1}</span> {step.title}
                </h3>
                <p>{step.copy}</p>
              </li>
            ))}
          </ol>
        </section>
        <section
          className={styles.brandStrip}
          aria-label="A few of the businesses we have printed for"
        >
          <p>PRINTED FOR</p>
          <div>
            <span>Le Rochester</span>
            <span className={styles.spacedBrand}>SHANTI GHAR</span>
            <span className={styles.zozaBrand}>
              zoza<small>PASTRY & COFFEE</small>
            </span>
            <span>Escale des Îles</span>
          </div>
        </section>

        <section
          id="what-we-print"
          className={styles.services}
          aria-labelledby="services-title"
        >
          <div className={styles.editorialHeading}>
            <p className={styles.eyebrow}>WHAT WE PRINT</p>
            <h2 id="services-title">
              Built for the
              <br />
              work you do.
            </h2>
          </div>
          <div className={styles.serviceList}>
            {services.map((service, index) => (
              <a
                href="#contact"
                key={service.title}
                className={styles.serviceRow}
              >
                <span className={styles.rowNumber}>0{index + 1}</span>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <ArrowDownRight size={29} />
              </a>
            ))}
          </div>
          <div className={styles.serviceFootnote}>
            <span>PRINTED IN MAURITIUS.</span>
            <Link href="/design-studio">
              Create your design <ArrowUpRight size={15} />
            </Link>
          </div>
        </section>

        <section id="collection" className={styles.collection}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>THE COLLECTION</p>
            <div>
              <h2>
                Choose your
                <br />
                <span>apparel.</span>
              </h2>
              <Link href="/shop" className={styles.textButton}>
                Explore all apparel <ArrowUpRight size={17} />
              </Link>
            </div>
          </div>
          <div className={styles.productGrid}>
            {collection.map((product) => (
              <article key={product.number} className={styles.productCard}>
                <Link
                  href="/shop"
                  className={styles.productVisual}
                  aria-label={`Shop ${product.name.toLowerCase()}`}
                >
                  <span className={styles.productNumber}>
                    MO / {product.number}
                  </span>
                  <Image
                    src={product.image}
                    alt={`Plain black ${product.name.toLowerCase()} ready for custom printing`}
                    fill
                    sizes="(max-width: 760px) 90vw, 30vw"
                  />
                  <ArrowUpRight className={styles.productArrow} size={24} />
                </Link>
                <div className={styles.productInfo}>
                  <span>{product.detail}</span>
                  <div>
                    <h3>{product.name}</h3>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="our-work" className={styles.work}>
          <div className={styles.workPhoto}>
            <Image
              src="/work/work-01.webp"
              alt="Custom printed team apparel for Le Rochester Restaurant & Auberge, Mauritius"
              fill
              sizes="(max-width: 760px) 100vw, 45vw"
            />
            <span>LE ROCHESTER — RESTAURANT & AUBERGE</span>
          </div>
          <div className={styles.workCopy}>
            <p className={styles.eyebrow}>OUR WORK</p>
            <h2>
              Made for
              <br />
              <span>Le Rochester.</span>
            </h2>
            <p>
              Custom printed apparel for Le Rochester Restaurant & Auberge.
            </p>
            <TrackedWhatsAppLink
              href={getWhatsAppUrl(
                "Hi, I would like to discuss custom apparel for my business.",
              )}
              trackingLocation="home_work"
              trackingSource="homepage"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.textButton}
            >
              Get uniforms for your team <ArrowUpRight size={17} />
            </TrackedWhatsAppLink>
            <div className={styles.workSignature}>
              <span>PRINTED IN MAURITIUS</span>
              <span>CUSTOM TEAM APPAREL ↗</span>
            </div>
          </div>
        </section>

        <section className={styles.faqSection}>
          <div>
            <p className={styles.eyebrow}>QUICK ANSWERS</p>
            <h2>Questions?</h2>
          </div>
          <div className={styles.faqList}>
            {faqs.map((faq) => (
              <details key={faq.question}>
                <summary>
                  {faq.question}
                  <Plus size={20} />
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="contact" className={styles.contact}>
          <p className={styles.eyebrow}>LET’S PRINT</p>
          <div className={styles.contactHeading}>
            <h2>
              Get your
              <br />
              quote.
            </h2>
            <ArrowUpRight className={styles.contactArrow} aria-hidden="true" />
          </div>
          <div className={styles.contactActions}>
            <p>
              Send your logo, quantity and deadline.
              <br />
              We’ll confirm the price and next steps.
            </p>
            <TrackedWhatsAppLink
              href={getWhatsAppUrl(
                "Hi, I would like a quote for custom apparel.",
              )}
              trackingLocation="home_contact"
              trackingSource="homepage"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.lightButton}
            >
              Get a quote on WhatsApp <ArrowUpRight size={19} />
            </TrackedWhatsAppLink>
            <a href={`mailto:${CONTACT_EMAIL}`} className={styles.textButton}>
              Send us an email <ArrowRight size={17} />
            </a>
          </div>
          <HomeQuoteRequest
            className={styles.quoteDisclosure}
            formClassName={styles.quoteForm}
          />
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerMain}>
          <Link href="/" aria-label="MO T-SHIRT home">
            <Wordmark />
          </Link>
          <p>
            Custom apparel.
            <br />
            Printed in Mauritius.
          </p>
          <div>
            <span>GET IN TOUCH</span>
            <a href={`tel:${CONTACT_TEL}`}>{CONTACT_PHONE_DISPLAY}</a>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </div>
          <div>
            <span>FIND US</span>
            <p>
              Surinam, Mauritius
              <br />
              Monday–Friday · 9am–5pm
            </p>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>© {new Date().getFullYear()} MO T-SHIRT</span>
          <div>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/admin">
              Business admin <ArrowUpRight size={12} />
            </Link>
          </div>
          <span>YOUR BRAND. WORN WELL.</span>
        </div>
      </footer>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: { "@type": "Answer", text: faq.answer },
            })),
          }),
        }}
      />
    </div>
  );
}
