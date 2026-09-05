import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Truck,
  UsersRound,
  Plus,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import HomeWorkCarousel from "@/components/HomeWorkCarousel";
import HomeMobileMenu from "@/components/HomeMobileMenu";
import HomeOrderWorkspace from "@/components/HomeOrderWorkspace";
import HomeSizeGuide from "@/components/HomeSizeGuide";
import HomeLocation from "@/components/HomeLocation";
import HomeParcelTracking from "@/components/HomeParcelTracking";
import TrackedWhatsAppLink from "@/components/TrackedWhatsAppLink";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_TEL, getWhatsAppUrl } from "@/data/work";
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
          <Link href="/shop">Shop</Link>
          <a href="#process">How it works</a>
          <a href="#track-parcel">
            Track your parcel
            <Truck size={20} strokeWidth={1.6} color="#ff3b22" aria-hidden="true">
              <rect x={5} y={8} width={6} height={5} rx={0.5} />
              <path d="M8 8v2" />
            </Truck>
          </a>
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
              Trying to be
              <br />
              <span className={styles.heroRank}>#1</span> in
              <br />
              Mauritius.
            </h1>
            <p className={styles.heroCopy}>
              Your idea should not stay on a screen. We turn it into a T-shirt
              people are proud to wear.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#quote-form">
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
            <a className={styles.heroTrust} href="#printed-for">
              <UsersRound size={18} aria-hidden="true" />
              <span>Trusted by <strong>80+ businesses</strong></span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
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
              <a href="#quote-form" className={editorial.textButton}>
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
            id="printed-for"
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
        <HomeOrderWorkspace />

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

        <HomeWorkCarousel />

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
        <HomeParcelTracking />
        <HomeLocation />
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerMain}>
          <div className={styles.footerBrand}>
            <Link className={styles.logo} href="#top" aria-label="MO T-Shirt home">
              <Wordmark />
            </Link>
            <p>Ideas made wearable in Mauritius.</p>
            <address className={styles.footerContact}>
              <a href={`tel:${CONTACT_TEL}`}>{CONTACT_PHONE_DISPLAY}</a>
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              <a href="#location">Surinam, Mauritius <ArrowUpRight size={14} aria-hidden="true" /></a>
            </address>
          </div>
          <nav className={styles.footerLinks} aria-label="Footer order links">
            <h2>GET STARTED</h2>
            <a href="#quote-form">Get a quote</a>
            <a href="#order">Design studio</a>
            <a href="#our-work">Our work</a>
            <a href="#track-parcel">Track your parcel</a>
          </nav>
          <nav className={styles.footerLinks} aria-label="Footer social links">
            <h2>STAY CONNECTED</h2>
            <TrackedWhatsAppLink href={getWhatsAppUrl()} trackingLocation="home_footer" trackingSource="homepage" target="_blank" rel="noopener noreferrer">
              WhatsApp <ArrowUpRight size={14} aria-hidden="true" />
            </TrackedWhatsAppLink>
            <a href="https://www.instagram.com/mo_tshirt_printing/" target="_blank" rel="noopener noreferrer">Instagram <ArrowUpRight size={14} aria-hidden="true" /></a>
            <a href="https://www.tiktok.com/@mo_tshirt_mauritius" target="_blank" rel="noopener noreferrer">TikTok <ArrowUpRight size={14} aria-hidden="true" /></a>
          </nav>
        </div>
        <div className={styles.footerBottom}>
          <p className={styles.copyright}>
            <span>© {new Date().getFullYear()} MO T-SHIRT</span>
            <span className={styles.copyrightDivider} aria-hidden="true">/</span>
            <Link href="/login" prefetch={false}>All Rights Reserved</Link>
          </p>
          <nav className={styles.footerLegal} aria-label="Footer legal links">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <a href="#top">Back to top ↑</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
