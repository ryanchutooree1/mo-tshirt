import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_TEL } from "@/data/work";

export const metadata: Metadata = {
  title: "Privacy Policy | MO T-SHIRT Mauritius",
  description:
    "Privacy policy for MO T-SHIRT in Mauritius. Learn what data we collect, how we use it, and your rights.",
  alternates: {
    canonical: "https://www.mo-tshirt.mu/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <main className="px-6 md:px-8 py-20 mx-auto max-w-3xl space-y-10">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
        >
          ← Back to Home
        </Link>
      </div>

      <header className="space-y-3">
        <h1 className="text-3xl md:text-4xl font-extrabold">Privacy Policy</h1>
        <p className="text-sm text-neutral-600">Last updated: February 2026</p>
        <p className="text-neutral-700">
          MO T-SHIRT respects your privacy. This policy explains how we collect and use your data.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Information We Collect</h2>
        <p className="text-neutral-700">We may collect:</p>
        <ul className="list-disc pl-5 text-neutral-700">
          <li>Name</li>
          <li>Phone number</li>
          <li>Email address</li>
          <li>Delivery address</li>
          <li>Order details and messages</li>
        </ul>
        <p className="text-neutral-700">Information is collected when you:</p>
        <ul className="list-disc pl-5 text-neutral-700">
          <li>Contact us</li>
          <li>Place an order</li>
          <li>Use our website or WhatsApp</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">How We Use Your Information</h2>
        <p className="text-neutral-700">Your data is used to:</p>
        <ul className="list-disc pl-5 text-neutral-700">
          <li>Process and manage orders</li>
          <li>Communicate with you</li>
          <li>Arrange delivery or collection</li>
          <li>Improve our services</li>
        </ul>
        <p className="text-neutral-700">We do not sell or rent your data.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Data Sharing</h2>
        <p className="text-neutral-700">Your data may be shared only with:</p>
        <ul className="list-disc pl-5 text-neutral-700">
          <li>Delivery services</li>
          <li>Payment or operational partners</li>
        </ul>
        <p className="text-neutral-700">Only when necessary to complete your order.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Data Security</h2>
        <p className="text-neutral-700">
          We take reasonable steps to protect your information. However, no online system is 100% secure.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Cookies</h2>
        <p className="text-neutral-700">
          Our website may use essential cookies to provide core functionality and improve user experience. You can
          disable cookies in your browser settings.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your Rights</h2>
        <p className="text-neutral-700">You have the right to:</p>
        <ul className="list-disc pl-5 text-neutral-700">
          <li>Request access to your data</li>
          <li>Request correction of your data</li>
          <li>Request deletion of your data</li>
        </ul>
        <p className="text-neutral-700">Requests can be made by contacting us directly.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Third-Party Links</h2>
        <p className="text-neutral-700">
          Our website may contain links to external platforms such as WhatsApp or social media. We are not responsible
          for their privacy practices.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Policy Changes</h2>
        <p className="text-neutral-700">
          This policy may be updated at any time. Continued use of the website means acceptance of the updated policy.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p className="text-neutral-700">MO T-SHIRT, Mauritius</p>
        <ul className="list-disc pl-5 text-neutral-700">
          <li>
            Website: <a className="underline" href="https://mo-tshirt.mu">https://mo-tshirt.mu</a>
          </li>
          <li>
            Email: <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </li>
          <li>
            Phone: <a className="underline" href={`tel:${CONTACT_TEL}`}>{CONTACT_PHONE_DISPLAY}</a>
          </li>
        </ul>
      </section>
    </main>
  );
}
