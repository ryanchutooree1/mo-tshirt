"use client";

import { useState } from "react";

export default function HomePage() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* NAVBAR */}
      <nav className="fixed inset-x-0 top-0 z-50 bg-white/90 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <a href="#" className="text-lg font-bold tracking-tight">
            MO T-SHIRT
          </a>
          <div className="hidden sm:flex items-center gap-6">
            <section id="services" className="scroll-mt-28">
              ...
            </section>
            <section id="work" className="scroll-mt-28">
              ...
            </section>
            <section id="how-it-works" className="scroll-mt-28">
              ...
            </section>
            <section id="contact" className="scroll-mt-28">
              ...
            </section>
          </div>
          <a
            href="https://wa.me/23059184930?text=Hi%20MO%20T-SHIRT,%20I%20want%20custom%20prints.%20Can%20you%20help?"
            className="hidden sm:inline-flex rounded-2xl bg-orange-500 px-4 py-2 text-white font-medium hover:bg-orange-500/90"
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
        </div>
      </nav>

      {/* spacer for fixed nav */}
      <div className="h-16" />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(251,146,60,0.15),transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-28 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              Premium Custom Printing for{" "}
              <span className="text-orange-600">T-Shirts, Polos & Caps</span>
            </h1>
            <p className="mt-4 text-neutral-600 max-w-xl">
              Mauritius-based print studio specializing in DTF & Vinyl. Ideal
              for companies, schools, clubs, and events. Pick-up in Surinam or
              delivery via Post.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="https://wa.me/23059184930?text=Hi%20MO%20T-SHIRT,%20I%20want%20custom%20prints.%20Can%20you%20help?"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-2xl bg-black px-5 py-3 text-white font-medium hover:bg-black/90"
              >
                Get a Quote on WhatsApp
              </a>
              <a
                href="#work"
                className="inline-flex items-center rounded-2xl border border-neutral-300 px-5 py-3 font-medium hover:bg-neutral-50"
              >
                See Our Work
              </a>
            </div>
            <div className="mt-6 flex items-center gap-4 text-sm text-neutral-600">
              <span className="inline-flex items-center gap-2">
                ✅ Corporate-ready
              </span>
              <span className="inline-flex items-center gap-2">
                ✅ Clean & premium
              </span>
              <span className="inline-flex items-center gap-2">
                ✅ Trusted locally
              </span>
            </div>
          </div>

          {/* simple image placeholders you can replace later */}
          <div className="grid grid-cols-2 gap-4">
            <div className="aspect-[4/5] rounded-2xl bg-neutral-100 shadow-sm" />
            <div className="aspect-[4/5] rounded-2xl bg-neutral-100 shadow-sm translate-y-6" />
            <div className="col-span-2 aspect-[16/9] rounded-2xl bg-neutral-100 shadow-sm" />
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section
        id="services"
        className="scroll-mt-24 mx-auto max-w-6xl px-4 py-16"
      >
        <div className="mb-10">
          <h2 className="text-3xl font-semibold tracking-tight">
            What we print
          </h2>
          <p className="text-neutral-600 mt-2">
            DTF and Vinyl printing with crisp edges, rich colour, and strong
            durability.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { t: "T-Shirts", d: "Uniforms, events, merch and promos." },
            { t: "Poloshirts", d: "Smart look for staff and front-of-house." },
            { t: "Caps", d: "Perfect add-on for brand visibility." },
          ].map((s, i) => (
            <div
              key={i}
              className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-orange-50 grid place-items-center text-orange-600">
                  🧢
                </div>
                <h3 className="font-semibold tracking-tight">{s.t}</h3>
              </div>
              <p className="text-neutral-600 mt-3">{s.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid md:grid-cols-3 gap-6">
          {[
            { k: "Min Qty", v: "1+ (no heavy minimums)" },
            { k: "Artwork", v: "We accept PNG, SVG, AI, PDF" },
            { k: "Delivery", v: "Post Office or pick-up Surinam" },
          ].map((f, i) => (
            <div
              key={i}
              className="rounded-2xl border border-neutral-200 p-4 flex items-center justify-between"
            >
              <span className="text-neutral-500">{f.k}</span>
              <span className="font-medium">{f.v}</span>
            </div>
          ))}
        </div>
      </section>

      {/* WORK */}
      <section
        id="work"
        className="scroll-mt-24 bg-neutral-50 border-y border-neutral-200"
      >
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">
                Recent work
              </h2>
              <p className="text-neutral-600 mt-2">
                Swap these placeholders with your actual client photos and
                mockups.
              </p>
            </div>
            <a
              href="https://wa.me/23059184930?text=Hi%20MO%20T-SHIRT,%20I%20want%20custom%20prints.%20Can%20you%20help?"
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl bg-orange-500 px-4 py-2 text-white font-medium hover:bg-orange-500/90"
            >
              Start your order
            </a>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-2xl bg-white border border-neutral-200 shadow-sm"
              />
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section
        id="how-it-works"
        className="scroll-mt-24 mx-auto max-w-6xl px-4 py-16"
      >
        <div className="mb-10">
          <h2 className="text-3xl font-semibold tracking-tight">
            How it works
          </h2>
          <p className="text-neutral-600 mt-2">
            Simple path from idea to delivery.
          </p>
        </div>
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { n: "1", t: "Chat", d: "Tell us what you need on WhatsApp." },
            {
              n: "2",
              t: "Design",
              d: "Send your logo. We prep print-ready art.",
            },
            { n: "3", t: "Approve", d: "You confirm the mockup before print." },
            {
              n: "4",
              t: "Print & Ship",
              d: "We print and deliver or arrange pick-up.",
            },
          ].map((step, i) => (
            <div
              key={i}
              className="rounded-2xl border border-neutral-200 p-5 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 rounded-full bg-orange-500 text-white grid place-items-center text-sm font-semibold">
                  {step.n}
                </span>
                <h3 className="font-semibold tracking-tight">{step.t}</h3>
              </div>
              <p className="text-neutral-600 mt-3">{step.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CONTACT */}
      <section
        id="contact"
        className="scroll-mt-24 mx-auto max-w-6xl px-4 py-16"
      >
        <div className="grid md:grid-cols-2 gap-10 items-start">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Contact</h2>
            <p className="text-neutral-600 mt-2">
              Let’s talk about your print job. Quick replies on WhatsApp.
            </p>
            <div className="mt-6 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                📞
                <a
                  href="https://wa.me/23059184930?text=Hi%20MO%20T-SHIRT,%20I%20want%20custom%20prints.%20Can%20you%20help?"
                  className="hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  +230 5918 4930
                </a>
              </div>
              <div className="flex items-center gap-2">
                📍 Surinam, Mauritius
              </div>
              <div className="flex items-center gap-2">
                🕘 Mon–Sat 9:00–18:00
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <a
                href="https://wa.me/23059184930?text=Hi%20MO%20T-SHIRT,%20I%20want%20custom%20prints.%20Can%20you%20help?"
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl bg-orange-500 px-4 py-2 text-white font-medium hover:bg-orange-500/90"
              >
                Message on WhatsApp
              </a>
              <a
                href="#services"
                className="rounded-2xl border border-neutral-300 px-4 py-2 font-medium hover:bg-neutral-50"
              >
                View services
              </a>
            </div>
          </div>

          {/* Quick Quote (mailto for now) */}
          <div className="rounded-2xl border border-neutral-200 p-6 shadow-sm">
            <h3 className="font-semibold tracking-tight">Quick Quote</h3>
            <form
              action="mailto:orders@mo-tshirt.mu"
              method="post"
              encType="text/plain"
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                // Let mailto handle it, but give quick UX feedback
                alert("Opening your email app to send the quote request…");
              }}
            >
              <input
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm shadow-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                placeholder="Your name"
                required
              />
              <input
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm shadow-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                placeholder="Phone or email"
                required
              />
              <input
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm shadow-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                placeholder="Item (T-Shirt, Polo, Cap)"
              />
              <input
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm shadow-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                placeholder="Quantity"
              />
              <textarea
                className="w-full min-h-[120px] rounded-xl border border-neutral-300 px-3 py-2 text-sm shadow-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                placeholder="Tell us about your print (logo, sizes, colours)"
              />
              <button
                type="submit"
                className="w-full rounded-2xl bg-black px-4 py-2 text-white font-medium hover:bg-black/90"
              >
                Send
              </button>
              <p className="text-xs text-neutral-500">
                Or message us directly on WhatsApp for the fastest response.
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-neutral-200">
        <div className="mx-auto max-w-6xl px-4 py-10 text-sm flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-neutral-600">
            <span>© {new Date().getFullYear()} MO T-SHIRT</span>
            <span className="hidden md:inline">•</span>
            <span>Mauritius</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:underline">
              Instagram
            </a>
            <a href="#" className="hover:underline">
              Google Maps
            </a>
            <a href="#contact" className="hover:underline">
              Contact
            </a>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp Button */}
      <a
        href="https://wa.me/23059184930?text=Hi%20MO%20T-SHIRT,%20I%20want%20custom%20prints.%20Can%20you%20help?"
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-5 right-5 inline-flex items-center rounded-full bg-green-500 px-5 py-3 text-white font-medium shadow-lg hover:bg-green-500/90"
      >
        💬 Chat
      </a>
    </div>
  );
}
