import type { Metadata } from "next";
import ContactClient from "./ContactClient";

export const metadata: Metadata = {
  title: "Contact MO T-SHIRT | Custom T-Shirt Printing Mauritius",
  description:
    "Get a fast quote for custom t-shirts, polos, and hoodies in Mauritius. Message us or WhatsApp +230 5988 3880 for quick support and pickup details.",
  alternates: {
    canonical: "https://www.mo-tshirt.mu/contact",
  },
};

export default function ContactPage() {
  return <ContactClient />;
}
