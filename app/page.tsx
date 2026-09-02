import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import HomeMobileMenu from "@/components/HomeMobileMenu";
import HomeSizeGuide from "@/components/HomeSizeGuide";
import HomeOrderForm from "@/components/HomeOrderForm";
import TrackedWhatsAppLink from "@/components/TrackedWhatsAppLink";
import { getWhatsAppUrl } from "@/data/work";
import { buildPageMetadata } from "@/lib/seo";
import styles from "./founder-home.module.css";
import editorial from "./home.module.css";

export const metadata: Metadata = buildPageMetadata({
  title: "MO T-SHIRT | Custom T-Shirt Printing Mauritius",
  description:
    "Custom T-shirts for businesses, events, brands and bold ideas. Printed in Mauritius with speed and care.",
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
      "From one-day events to full team kits. Easy sizing, reliable production and a finish people keep wearing.",
  },
  {
    title: "Clothing brands",
    description:
      "Start with samples. Test the print, fit and finish before you commit to your first collection.",
  },
  {
    title: "One bold idea",
    description:
      "A gift, a statement or a single custom piece. If it can be printed well, we will help you make it real.",
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

function Wordmark() {
  return (
    <>
      MO <span>T-SHIRT</span>
    </>
  );
}

export default function HomePage() {
  return (
    <div className={styles.site}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>
      <div className={styles.announcement}>
        <span className={styles.madeInMauritius}>
          MADE IN MAURITIUS
          <span className={styles.mauritiusFlag} aria-hidden="true" />
        </span>
        <span className={styles.announcementCenter}>
          ONE PIECE OR A FULL RUN
        </span>
        <span>FAST. CLEAN. RELIABLE.</span>
      </div>
      <header className={styles.siteHeader}>
        <Link className={styles.logo} href="#top" aria-label="MO T-Shirt home">
          <Wordmark />
        </Link>
        <nav className={styles.desktopNav} aria-label="Main navigation">
          <a href="#services">What we print</a>
          <a href="#process">How it works</a>
        </nav>
        <a className={styles.headerCta} href="#order">
          Start an order{" "}
          <ArrowDownRight size={18} strokeWidth={2.4} aria-hidden="true" />
        </a>
        <HomeMobileMenu className={styles.mobileMenu} />
      </header>

      <main id="main-content">
        <section className={styles.hero} id="top" aria-labelledby="hero-title">
          <Image
            className={styles.heroImage}
            src="/editorial/hero-founder.png"
            alt="Black T-shirt with MO T-SHIRT chest print"
            fill
            priority
            sizes="100vw"
          />
          <div className={styles.heroShade} />
          <div className={styles.heroContent}>
            <p className={styles.eyebrow}>CUSTOM T-SHIRT PRINTING</p>
            <h1 id="hero-title">
              MAKE
              <br />
              IT
              <br />
              <em>HAPPEN.</em>
            </h1>
            <p className={styles.heroCopy}>
              Your idea should not stay on a screen. We turn it into a T-shirt
              people are proud to wear.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#order">
                Get your price <ArrowRight size={20} aria-hidden="true" />
              </a>
              <TrackedWhatsAppLink
                className={styles.whatsappButton}
                href={getWhatsAppUrl()}
                trackingLocation="home_hero"
                trackingSource="homepage"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaWhatsapp size={22} aria-hidden="true" />
                <span>Chat on WhatsApp</span>
                <ArrowUpRight size={22} className={styles.whatsappArrow} aria-hidden="true" />
              </TrackedWhatsAppLink>
            </div>
          </div>
          <div className={styles.heroNote}>
            <span>PRINTED LOCALLY</span>
            <span>BUILT TO BE WORN</span>
          </div>
        </section>

        <section className={styles.ticker} aria-label="MO T-Shirt promise">
          <span>ONE SHIRT OR 1,000</span>
          <Plus size={26} aria-hidden="true" />
          <span>SAME STANDARD</span>
          <Plus size={26} aria-hidden="true" />
          <span>ZERO GUESSWORK</span>
        </section>

        <div id="process" className={`${editorial.site} ${styles.highlights}`}>
          <section
            id="how-it-works"
            className={editorial.process}
            aria-labelledby="process-title"
          >
            <div className={editorial.processHeading}>
              <div>
                <p className={editorial.eyebrow}>HOW TO ORDER</p>
                <h2 id="process-title">Order in 4 steps.</h2>
              </div>
              <a href="#order" className={editorial.textButton}>
                Get a quote <ArrowUpRight size={17} />
              </a>
            </div>
            <Image
              src="/editorial/buying-flow-v2.png"
              alt="A custom T-shirt and design tablet, quotation clipboard, payment terminal and delivery box connected by orange arrows."
              width={1983}
              height={793}
              sizes="(max-width: 760px) 100vw, 90vw"
              className={editorial.processImage}
            />
            <ol className={editorial.processSteps}>
              {process.map((step, index) => (
                <li key={step.title}>
                  <h3 className={editorial.stepLabel}>
                    <span>0{index + 1}</span> {step.title}
                  </h3>
                  <p>{step.copy}</p>
                </li>
              ))}
            </ol>
          </section>

          <section
            className={editorial.brandStrip}
            aria-label="A few of the businesses we have printed for"
          >
            <p>PRINTED FOR</p>
            <div
              className={editorial.brandViewport}
              tabIndex={0}
              role="group"
              aria-label="Client logos. Hover or focus to pause scrolling."
            >
              <div className={editorial.brandTrack}>
                {[0, 1].map((copy) => (
                  <div className={editorial.brandGroup} key={copy} aria-hidden={copy === 1 ? true : undefined}>
                    <span>Le Rochester</span>
                    <span className={editorial.spacedBrand}>SHANTI GHAR</span>
                    <span className={editorial.zozaBrand}>
                      zoza<small>PASTRY & COFFEE</small>
                    </span>
                    <span>Escale des Îles</span>
                    <span className={editorial.beautyBrand}>Beauty Angel</span>
                    <span className={editorial.chezBrand}>CHEZ YOH</span>
                    <span className={`${editorial.brandWordmark} ${editorial.razzBrand}`}>
                      RAZZ<small>GRILL</small>
                    </span>
                    <span className={`${editorial.brandWordmark} ${editorial.pritBrand}`}>
                      Prit Fitness<small>THE WORLD FOR LADIES</small>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <HomeSizeGuide />

        <section className={styles.services} id="services">
          <div className={styles.sectionHeading}>
            <p className={`${styles.sectionKicker} ${styles.light}`}>
              WHAT WE PRINT
            </p>
            <h2>
              Built for the
              <br />
              work you do.
            </h2>
          </div>
          <div className={styles.serviceList}>
            {services.map((service, index) => (
              <article key={service.title} className={styles.serviceCard}>
                <span>0{index + 1}</span>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <ArrowDownRight
                  className={styles.serviceArrow}
                  size={28}
                  aria-hidden="true"
                />
              </article>
            ))}
          </div>
        </section>

        <div className={`${editorial.site} ${styles.highlights}`}>
          <section id="our-work" className={editorial.work}>
            <div className={editorial.workPhoto}>
              <Image
                src="/work/work-01.webp"
                alt="Custom printed team apparel for Le Rochester Restaurant & Auberge, Mauritius"
                fill
                sizes="(max-width: 760px) 100vw, 45vw"
              />
              <span>LE ROCHESTER — RESTAURANT & AUBERGE</span>
            </div>
            <div className={editorial.workCopy}>
              <p className={editorial.eyebrow}>OUR WORK</p>
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
                className={editorial.textButton}
              >
                Get uniforms for your team <ArrowUpRight size={17} />
              </TrackedWhatsAppLink>
              <div className={editorial.workSignature}>
                <span>PRINTED IN MAURITIUS</span>
                <span>CUSTOM TEAM APPAREL ↗</span>
              </div>
            </div>
          </section>
        </div>

        <section className={styles.statement}>
          <p>THE RULE IS SIMPLE</p>
          <h2>
            NO EXCUSES.
            <br />
            JUST A CLEAN PRINT,
            <br />
            <em>DELIVERED.</em>
          </h2>
        </section>

        <section
          className={styles.order}
          id="order"
          aria-labelledby="order-title"
        >
          <div className={styles.orderCopy}>
            <p className={`${styles.sectionKicker} ${styles.light}`}>
              START HERE
            </p>
            <h2 id="order-title">
              Tell us what
              <br />
              you need.
            </h2>
            <p>
              Send the basics. We will review the job and come back with the
              right next step.
            </p>
            <div className={styles.orderMeta}>
              <span>MAURITIUS</span>
              <span>BUSINESS • EVENT • BRAND • PERSONAL</span>
            </div>
          </div>
          <HomeOrderForm />
        </section>
      </main>

      <footer className={styles.footer}>
        <Link className={styles.logo} href="#top">
          <Wordmark />
        </Link>
        <p>Ideas made wearable in Mauritius.</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </div>
  );
}
