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
    "Custom T-shirts, polo shirts and hoodies for businesses, events and teams in Mauritius. Thoughtful apparel, clean printing and personal service. Start your project.",
  path: "/",
});

const services = [
  {
    title: "Business uniforms",
    description:
      "Make your team look like one. Clean prints for daily workwear, activations and client-facing teams.",
  },
  {
    title: "Events & teams",
    description:
      "From one-day events to full team kits. Easy sizing, considered details and a finish people keep wearing.",
  },
  {
    title: "Clothing brands",
    description:
      "Start with your idea. Explore the garment, print and finish before bringing your collection to life.",
  },
];
const collection = [
  {
    number: "01",
    name: "T-shirts",
    image: "/design-studio/tshirt-realistic.png",
    description: "Your everyday canvas.",
    detail: "FOR TEAMS, EVENTS & EVERYDAY",
  },
  {
    number: "02",
    name: "Polo shirts",
    image: "/design-studio/polo-realistic.png",
    description: "A sharper way to show up.",
    detail: "FOR BUSINESS, HOSPITALITY & CLUBS",
  },
  {
    number: "03",
    name: "Hoodies",
    image: "/design-studio/hoodie-realistic.png",
    description: "Comfort with a point of view.",
    detail: "FOR BRANDS, CREATORS & COMMUNITIES",
  },
];
const process = [
  {
    title: "Tell us the idea.",
    copy: "Your garment, quantity, artwork and deadline. Share what you have in mind or explore it in our design studio.",
  },
  {
    title: "Get the details right.",
    copy: "We prepare your quote, confirm the specifications and review your artwork with you before printing.",
  },
  {
    title: "Make your impression.",
    copy: "We print and prepare your order. Collect in Surinam or arrange delivery across Mauritius.",
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
          <a href="#how-it-works">Our process</a>
        </nav>
        <a href="#contact" className={styles.headerCta}>
          Start a project <ArrowUpRight size={17} />
        </a>
        <HomeMobileMenu className={styles.mobileMenu} />
      </header>
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              CUSTOM APPAREL. MADE PERSONAL. <span>↗</span>
            </p>
            <h1 id="hero-title">
              Your brand.
              <br />
              Worn well.
            </h1>
            <p className={styles.heroDescription}>
              For the people building something.
              <br />
              Thoughtful apparel, clean printing and a lasting impression. Right
              here in Mauritius.
            </p>
            <div className={styles.heroActions}>
              <a href="#contact" className={styles.primaryButton}>
                Let’s make it yours <ArrowUpRight size={19} />
              </a>
              <Link href="/design-studio" className={styles.textButton}>
                Open design studio <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className={styles.heroBottom}>
              <span>
                SURINAM, MAURITIUS
                <br />
                <strong>Personal service. Island-wide delivery.</strong>
              </span>
              <a href="#what-we-print" aria-label="Discover what we print">
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
              A BLANK CANVAS. ENDLESS POSSIBILITIES.
            </span>
            <span className={styles.imageIndex}>MO / 01</span>
          </div>
        </section>
        <section
          className={styles.brandStrip}
          aria-label="A few of the businesses we have printed for"
        >
          <p>IN GOOD COMPANY</p>
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
            <span>GOOD GARMENTS. CONSIDERED PRINTING. YOUR IDENTITY.</span>
            <Link href="/design-studio">
              Bring your idea to the studio <ArrowUpRight size={15} />
            </Link>
          </div>
        </section>

        <section id="collection" className={styles.collection}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>THE COLLECTION</p>
            <div>
              <h2>
                The essentials.
                <br />
                <span>Made yours.</span>
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
                    <p>{product.description}</p>
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
            <p className={styles.eyebrow}>REAL PEOPLE. REAL WORK.</p>
            <h2>
              Good company.
              <br />
              <span>Great impressions.</span>
            </h2>
            <p>
              A restaurant opening its doors. A team finding its identity. A
              business taking its next step.
            </p>
            <p>
              We work with the people behind the brand to create apparel that
              feels right for what they do.
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
              Let’s talk about your brand <ArrowUpRight size={17} />
            </TrackedWhatsAppLink>
            <div className={styles.workSignature}>
              <span>PRINTED IN MAURITIUS</span>
              <span>WORN WITH PURPOSE ↗</span>
            </div>
          </div>
        </section>

        <section id="how-it-works" className={styles.process}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>THE PROCESS</p>
            <h2>
              Good work.
              <br />
              <span>No guesswork.</span>
            </h2>
          </div>
          <div className={styles.processGrid}>
            {process.map((step, index) => (
              <article key={step.title}>
                <span className={styles.processNumber}>
                  0{index + 1}
                  <ArrowUpRight size={21} />
                </span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.faqSection}>
          <div>
            <p className={styles.eyebrow}>BEFORE WE BEGIN</p>
            <h2>
              A little
              <br />
              clarity.
            </h2>
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
          <p className={styles.eyebrow}>YOUR NEXT GOOD IDEA STARTS HERE</p>
          <div className={styles.contactHeading}>
            <h2>
              Make your
              <br />
              next impression.
            </h2>
            <ArrowUpRight className={styles.contactArrow} aria-hidden="true" />
          </div>
          <div className={styles.contactActions}>
            <p>
              Tell us what you have in mind.
              <br />
              We’ll help you put it into print.
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
              Start on WhatsApp <ArrowUpRight size={19} />
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
            Considered apparel.
            <br />
            Confident brands.
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
