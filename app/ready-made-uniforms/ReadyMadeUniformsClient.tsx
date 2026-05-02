"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FiCheck, FiSearch } from "react-icons/fi";
import TrackedWhatsAppLink from "@/components/TrackedWhatsAppLink";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_TEL, getWhatsAppUrl } from "@/data/work";
import type { ReadyMadeUniformItem } from "@/lib/ready-made-uniforms-store";

type Props = {
  uniforms: ReadyMadeUniformItem[];
};

const TEAM_TYPES = ["All styles", "Security", "Restaurant", "Staff", "Sport", "NGO", "Corporate"];

function imagesFor(uniform: ReadyMadeUniformItem) {
  return [uniform.imageSrc, ...(uniform.imageGallery || [])].filter(Boolean);
}

function matchesTeam(uniform: ReadyMadeUniformItem, team: string) {
  if (team === "All styles") return true;
  const text = `${uniform.code} ${uniform.title} ${uniform.audience} ${uniform.description} ${uniform.features.join(" ")}`.toLowerCase();
  return text.includes(team.toLowerCase());
}

export default function ReadyMadeUniformsClient({ uniforms }: Props) {
  const [search, setSearch] = useState("");
  const [teamType, setTeamType] = useState("All styles");

  const filteredUniforms = useMemo(() => {
    const term = search.trim().toLowerCase();
    return uniforms.filter((uniform) => {
      if (!matchesTeam(uniform, teamType)) return false;
      if (!term) return true;
      const text = `${uniform.code} ${uniform.title} ${uniform.audience} ${uniform.description} ${uniform.features.join(" ")}`.toLowerCase();
      return text.includes(term);
    });
  }, [search, teamType, uniforms]);

  return (
    <div className="min-h-screen bg-[#f4f5f8] text-black">
      <header className="sticky top-0 z-40 border-b border-[#EAEAEA] bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:h-20 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-0">
          <Link href="/" className="flex items-center justify-center sm:justify-start" aria-label="MO T-SHIRT Home">
            <img src="/logo_transparent.png" alt="MO T-SHIRT logo" className="h-9 w-auto sm:h-12" />
          </Link>

          <nav className="flex w-full max-w-full items-center gap-2 overflow-x-auto text-sm font-semibold text-neutral-600 sm:w-auto sm:justify-end sm:gap-4 sm:overflow-visible">
            <Link href="/" className="shrink-0 rounded-full px-4 py-2 transition hover:bg-neutral-100 hover:text-black">Home</Link>
            <Link href="/shops" className="shrink-0 rounded-full px-4 py-2 transition hover:bg-neutral-100 hover:text-black">Plain Shops</Link>
            <a href="#collections" className="shrink-0 rounded-full bg-[#FF6600] px-5 py-2 text-white shadow-sm transition hover:bg-orange-600">Uniforms</a>
            <Link href="/#work" className="shrink-0 rounded-full px-4 py-2 transition hover:bg-neutral-100 hover:text-black">Our Work</Link>
            <TrackedWhatsAppLink
              href={getWhatsAppUrl("Hi! I want to see your ready-made uniform designs.")}
              trackingLocation="uniform_page_header"
              trackingSource="ready_made_uniforms"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-full px-4 py-2 transition hover:bg-neutral-100 hover:text-black"
            >
              WhatsApp
            </TrackedWhatsAppLink>
          </nav>
        </div>
      </header>

      <main id="collections" className="px-4 py-10 sm:px-6 sm:py-16">
        <section className="mx-auto max-w-6xl">
          <div className="rounded-[2rem] border border-black/10 bg-white p-5 shadow-[0_22px_70px_-54px_rgba(0,0,0,0.45)] sm:p-6">
            <div className="grid gap-4 lg:grid-cols-[0.8fr_1fr_0.7fr] lg:items-end">
              <div>
                <h1 className="text-2xl font-semibold text-black">Pick your uniform code</h1>
                <p className="mt-1 text-sm text-neutral-500">Choose a ready-made style, then send your logo and quantity.</p>
              </div>
              <label className="block text-sm font-semibold text-neutral-600">
                Search
                <div className="relative mt-2">
                  <FiSearch className="absolute left-4 top-3.5 h-4 w-4 text-neutral-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="SEC-01, engineer, restaurant..."
                    className="h-12 w-full rounded-full border border-neutral-200 bg-white pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                  />
                </div>
              </label>
              <label className="block text-sm font-semibold text-neutral-600">
                Team type
                <select
                  value={teamType}
                  onChange={(event) => setTeamType(event.target.value)}
                  className="mt-2 h-12 w-full rounded-full border border-neutral-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                >
                  {TEAM_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredUniforms.map((uniform) => (
              <UniformCard key={uniform.id} uniform={uniform} />
            ))}
          </div>

          {!filteredUniforms.length && (
            <div className="mt-8 rounded-[2rem] border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
              <p className="text-lg font-semibold text-black">No uniform code found</p>
              <p className="mt-2 text-sm text-neutral-500">Try another search or team type.</p>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-black/10 bg-white px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-5 text-sm font-semibold text-neutral-600">
          <Link href="/" className="transition hover:text-black">Home</Link>
          <Link href="/#contact" className="transition hover:text-black">Quote Form</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="transition hover:text-black">{CONTACT_EMAIL}</a>
          <a href={`tel:${CONTACT_TEL}`} className="transition hover:text-black">{CONTACT_PHONE_DISPLAY}</a>
        </div>
      </footer>
    </div>
  );
}

function UniformCard({ uniform }: { uniform: ReadyMadeUniformItem }) {
  const images = imagesFor(uniform);
  const [selectedImage, setSelectedImage] = useState(images[0] || uniform.imageSrc);

  return (
    <article className="overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-[0_28px_80px_-56px_rgba(0,0,0,0.55)]">
      <div className="relative aspect-[4/5] overflow-hidden bg-white">
        <img
          src={selectedImage}
          alt={`${uniform.title} ${uniform.code}`}
          className="h-full w-full object-contain"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-black px-3 py-1.5 text-xs font-bold text-white shadow-sm">{uniform.code}</span>
          <span className="rounded-full bg-white/92 px-3 py-1.5 text-xs font-bold text-black shadow-sm backdrop-blur">Ready-made</span>
        </div>
      </div>

      <div className="p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-400">{uniform.audience}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-black">{uniform.title}</h2>

        {images.length > 1 && (
          <div className="mt-4 flex gap-2">
            {images.slice(0, 4).map((image) => (
              <button
                key={image}
                type="button"
                onClick={() => setSelectedImage(image)}
                className={`h-14 w-14 overflow-hidden rounded-xl border bg-neutral-100 ${
                  selectedImage === image ? "border-black" : "border-neutral-200"
                }`}
              >
                <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        )}

        <p className="mt-4 text-sm leading-6 text-neutral-600">{uniform.description}</p>
        <div className="mt-4 grid gap-2">
          {uniform.features.slice(0, 3).map((feature) => (
            <div key={feature} className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-50 text-orange-600">
                <FiCheck className="h-3.5 w-3.5" />
              </span>
              {feature}
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <TrackedWhatsAppLink
            href={getWhatsAppUrl(uniform.message)}
            trackingLocation={`uniform_page_card_${uniform.code.toLowerCase()}`}
            trackingSource="ready_made_uniforms"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-full bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            WhatsApp {uniform.code}
          </TrackedWhatsAppLink>
          <Link
            href="/#contact"
            className="inline-flex items-center justify-center rounded-full border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 transition hover:border-black hover:text-black"
          >
            Request quote
          </Link>
        </div>
      </div>
    </article>
  );
}
