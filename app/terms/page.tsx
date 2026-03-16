import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_TEL } from "@/data/work";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Terms & Conditions | MO T-SHIRT Mauritius",
  description:
    "Terms and conditions for MO T-SHIRT in Mauritius. Read about orders, pricing, payments, delivery, and returns.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <main className="min-h-screen">
      <div className="px-6 md:px-8 pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500 transition hover:text-black"
        >
          ← Back to Home
        </Link>
      </div>

      <div className="px-6 md:px-8 py-14 mx-auto max-w-3xl space-y-10">
        <header className="space-y-4">
          <h1 className="text-3xl md:text-4xl font-extrabold">Terms and Conditions</h1>
          <p className="text-sm text-neutral-600">Last updated: February 2026</p>
          <p className="text-neutral-700">
            Welcome to MO T-SHIRT. By accessing or ordering from mo-tshirt.mu, you agree to these terms. If you do not
            agree, please do not use our website or services.
          </p>
        </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">About the Business</h2>
        <p className="text-neutral-700">MO T-SHIRT is a Mauritius-based business providing:</p>
        <ul className="list-disc pl-5 text-neutral-700">
          <li>Plain T-shirts, polo shirts, and caps</li>
          <li>Custom printing services (Vinyl, DTF, Screen Printing)</li>
          <li>Branding items and related products</li>
        </ul>
        <p className="text-neutral-700">All products are produced or sourced after order confirmation.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Orders</h2>
        <ul className="list-disc pl-5 text-neutral-700">
          <li>Orders are confirmed only after written approval via WhatsApp, email, or message.</li>
          <li>Mockups, sizes, colors, and quantities must be validated by the client before production.</li>
          <li>Once production starts, changes are not possible.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Pricing</h2>
        <ul className="list-disc pl-5 text-neutral-700">
          <li>All prices are in Mauritian Rupees (MUR).</li>
          <li>Prices may change without prior notice.</li>
          <li>Quoted prices are valid for a limited time only.</li>
          <li>Errors in pricing or descriptions may be corrected at any time.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Payments</h2>
        <ul className="list-disc pl-5 text-neutral-700">
          <li>A 50% advance payment is required to start production unless stated otherwise in writing.</li>
          <li>The remaining balance must be paid before delivery or collection.</li>
          <li>Payments made confirm acceptance of the order and its details.</li>
        </ul>
        <p className="text-neutral-700">No production will start without payment confirmation.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Production and Delivery</h2>
        <ul className="list-disc pl-5 text-neutral-700">
          <li>Production timelines are estimates and may vary depending on workload and materials.</li>
          <li>Delivery is done via Mauritius Post or client collection at the agreed location.</li>
          <li>Delivery delays caused by third parties are not our responsibility.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Returns and Refunds</h2>
        <p className="text-neutral-700">Because our products are customized:</p>
        <ul className="list-disc pl-5 text-neutral-700">
          <li>No refunds or returns are accepted once production has started.</li>
          <li>Minor variations in color, placement, or size may occur and are not considered defects.</li>
        </ul>
        <p className="text-neutral-700">
          If there is a clear production error from our side, we will assess and propose a solution.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Client Responsibility</h2>
        <ul className="list-disc pl-5 text-neutral-700">
          <li>Provide correct logos, text, sizes, and instructions.</li>
          <li>Verify spelling and design approval before production.</li>
        </ul>
        <p className="text-neutral-700">MO T-SHIRT is not responsible for errors approved by the client.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Intellectual Property</h2>
        <ul className="list-disc pl-5 text-neutral-700">
          <li>All designs, images, and content on this website belong to MO T-SHIRT unless stated otherwise.</li>
          <li>Client logos remain the property of their respective owners.</li>
          <li>We may showcase completed work for portfolio and marketing purposes unless requested otherwise.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Limitation of Liability</h2>
        <ul className="list-disc pl-5 text-neutral-700">
          <li>MO T-SHIRT will not be liable for indirect or consequential losses.</li>
          <li>We are not responsible for business interruption or loss caused by misuse of products.</li>
          <li>Our liability is limited to the value of the order.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Governing Law</h2>
        <p className="text-neutral-700">These terms are governed by the laws of Mauritius.</p>
      </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="text-neutral-700">MO T-SHIRT, Mauritius</p>
          <ul className="list-disc pl-5 text-neutral-700">
            <li>
              Website: <a className="underline" href="https://www.mo-tshirt.mu">https://www.mo-tshirt.mu</a>
            </li>
            <li>
              Email: <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </li>
            <li>
              Phone: <a className="underline" href={`tel:${CONTACT_TEL}`}>{CONTACT_PHONE_DISPLAY}</a>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
