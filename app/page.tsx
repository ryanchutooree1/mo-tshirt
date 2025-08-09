"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Shirt, Phone, MapPin, CheckCircle2, Clock, BadgeCheck, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";

const waNumber = "23059184930";
const waText = encodeURIComponent("Hi MO T-SHIRT, I want custom prints. Can you help?");
const whatsappLink = `https://wa.me/${waNumber}?text=${waText}`;

export default function Page() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Navbar */}
      <header className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-white/60 bg-white/80 border-b border-neutral-200">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-black grid place-items-center">
              <Shirt className="h-5 w-5 text-orange-400" />
            </div>
            <span className="font-semibold tracking-tight">MO T-SHIRT</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#services" className="hover:text-black/70">Services</a>
            <a href="#work" className="hover:text-black/70">Work</a>
            <a href="#process" className="hover:text-black/70">How it works</a>
            <a href="#contact" className="hover:text-black/70">Contact</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href={whatsappLink} target="_blank" rel="noreferrer">
              <Button className="rounded-2xl bg-orange-500 hover:bg-orange-500/90">WhatsApp</Button>
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(251,146,60,0.15),transparent_60%)]" />
        <div className="mx-auto max-w-7xl px-4 py-20 md:py-28 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-4xl md:text-5xl font-bold tracking-tight"
            >
              Premium Custom Printing for <span className="text-orange-500">T-Shirts, Polos & Caps</span>
            </motion.h1>
            <p className="mt-4 text-neutral-600 max-w-xl">
              Mauritius-based print studio specialising in DTF & Vinyl. Perfect for companies, schools, clubs and events. Pick-up in Surinam or delivery via Post.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={whatsappLink} target="_blank" rel="noreferrer">
                <Button size="lg" className="rounded-2xl bg-black hover:bg-black/90">
                  <MessageCircle className="mr-2 h-5 w-5" /> Get a Quote on WhatsApp
                </Button>
              </a>
              <a href="#work">
                <Button size="lg" variant="outline" className="rounded-2xl border-neutral-300">See Our Work</Button>
              </a>
            </div>
            <div className="mt-6 flex items-center gap-4 text-sm text-neutral-600">
              <div className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-orange-500"/> Corporate-ready</div>
              <div className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-orange-500"/> Clean, minimal, premium</div>
              <div className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-orange-500"/> Trusted by local brands</div>
            </div>
          </div>
          <div className="relative">
            <div className="grid grid-cols-2 gap-4">
              <div className="aspect-[4/5] rounded-2xl bg-neutral-100 shadow-sm" />
              <div className="aspect-[4/5] rounded-2xl bg-neutral-100 shadow-sm translate-y-6" />
              <div className="col-span-2 aspect-[16/9] rounded-2xl bg-neutral-100 shadow-sm" />
            </div>
            <p className="sr-only">Replace the grey boxes with your product photos.</p>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-10">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">What we print</h2>
          <p className="text-neutral-600 mt-2">DTF and Vinyl printing with crisp edges, rich colour and strong durability.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { title: "T-Shirts", desc: "Uniforms, events, merch and promos.", icon: <Shirt className="h-5 w-5"/> },
            { title: "Poloshirts", desc: "Smart look for staff and front-of-house.", icon: <BadgeCheck className="h-5 w-5"/> },
            { title: "Caps", desc: "Perfect add-on for brand visibility.", icon: <CheckCircle2 className="h-5 w-5"/> },
          ].map((s, i) => (
            <Card key={i} className="rounded-2xl">
              <CardHeader className="flex flex-row items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-orange-50 grid place-items-center text-orange-600">{s.icon}</div>
                <CardTitle className="tracking-tight">{s.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-neutral-600">{s.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-200">
        <div className="mx-auto max-w-7xl px-4 py-10 text-sm flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-neutral-600">
            <span>© {new Date().getFullYear()} MO T-SHIRT</span>
            <span className="hidden md:inline">•</span>
            <span>Mauritius</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:underline">Instagram</a>
            <a href="#" className="hover:underline">Google Maps</a>
            <a href="#contact" className="hover:underline">Contact</a>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp CTA */}
      <a href={whatsappLink} target="_blank" rel="noreferrer" className="fixed bottom-5 right-5">
        <Button size="lg" className="rounded-full shadow-lg bg-green-500 hover:bg-green-500/90">
          <MessageCircle className="h-5 w-5 mr-2"/> Chat
        </Button>
      </a>
    </div>
  );
}
