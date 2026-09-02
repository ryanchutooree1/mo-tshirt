"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import type { Swiper as SwiperInstance } from "swiper";
import { A11y, Autoplay, FreeMode } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import TrackedWhatsAppLink from "@/components/TrackedWhatsAppLink";
import { getWhatsAppUrl, workImages } from "@/data/work";
import "swiper/css";
import "swiper/css/a11y";
import "swiper/css/free-mode";
import styles from "./HomeWorkCarousel.module.css";

const projects = [
  { title: "Le Rochester", detail: "Restaurant & Auberge", alt: "Le Rochester printed black T-shirt, white polos and caps" },
  { title: "Escale des Îles", detail: "Restaurant uniforms", alt: "Escale des Îles restaurant polos in black, white, red and green" },
  { title: "Mauricamp", detail: "Outdoor apparel", alt: "Black Mauricamp T-shirts with white camping logo prints" },
  { title: "Restaurant uniforms", detail: "Polos & chef jackets", alt: "White printed restaurant polos and a red chef jacket" },
  { title: "Machete Garage", detail: "Custom printed tees", alt: "Grey Machete Garage T-shirts with automotive graphic prints" },
  { title: "Agria Landscaping", detail: "Team workwear", alt: "Red and yellow Agria Landscaping T-shirts with chest and back prints" },
  { title: "Beauty Angel", detail: "Branded apparel", alt: "Black Beauty Angel apparel with bright pink and purple logo prints" },
  { title: "Personalised workwear", detail: "Business polos", alt: "Black business polos with a company logo and personalised name" },
  { title: "Zoza Pastry & Coffee", detail: "Tees & caps", alt: "Black Zoza Pastry and Coffee T-shirt and matching printed caps" },
];

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeToMotionPreference(onChange: () => void) {
  const preference = window.matchMedia(motionQuery);
  preference.addEventListener("change", onChange);
  return () => preference.removeEventListener("change", onChange);
}
const getReducedMotion = () => window.matchMedia(motionQuery).matches;
const getServerReducedMotion = () => false;

export default function HomeWorkCarousel() {
  const swiperRef = useRef<SwiperInstance | null>(null);
  const speedRef = useRef(9000);
  const [activeIndex, setActiveIndex] = useState(0);
  const reducedMotion = useSyncExternalStore(subscribeToMotionPreference, getReducedMotion, getServerReducedMotion);
  const shouldAutoplay = !reducedMotion;

  useEffect(() => {
    speedRef.current = reducedMotion ? 0 : 9000;
    const swiper = swiperRef.current;
    if (!swiper) return;
    swiper.params.speed = speedRef.current;
    if (shouldAutoplay && !swiper.autoplay.running) swiper.autoplay.start();
    else if (!shouldAutoplay && swiper.autoplay.running) {
      // Respect a change to the visitor's reduced-motion preference immediately.
      const position = swiper.getTranslate();
      swiper.autoplay.stop();
      swiper.setTransition(0);
      swiper.setTranslate(position);
      swiper.animating = false;
      swiper.updateActiveIndex();
      swiper.updateSlidesClasses();
    }
  }, [reducedMotion, shouldAutoplay]);

  return (
    <section
      id="our-work"
      className={styles.section}
      aria-labelledby="work-carousel-title"
      aria-roledescription="carousel"
      onKeyDown={(event) => {
        if (event.target !== swiperRef.current?.el) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          if (event.key === "ArrowLeft") swiperRef.current?.slidePrev(reducedMotion ? 0 : 450);
          else swiperRef.current?.slideNext(reducedMotion ? 0 : 450);
        }
      }}
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>OUR WORK <span>PRINTED IN MAURITIUS</span></p>
          <h2 id="work-carousel-title">Made to <span>be worn.</span></h2>
        </div>
        <div className={styles.intro}>
          <p>A closer look at the uniforms, tees and caps we print for local businesses.</p>
          <TrackedWhatsAppLink
            href={getWhatsAppUrl("Hi, I would like to discuss custom apparel for my business.")}
            trackingLocation="home_work"
            trackingSource="homepage"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.cta}
          >
            Get uniforms for your team <ArrowUpRight size={18} aria-hidden="true" />
          </TrackedWhatsAppLink>
        </div>
      </div>

      <Swiper
        id="work-carousel"
        className={styles.carousel}
        modules={[A11y, Autoplay, FreeMode]}
        speed={9000}
        autoplay={{ delay: 0, disableOnInteraction: false, reverseDirection: true, pauseOnMouseEnter: false }}
        freeMode={{ enabled: true, momentum: false }}
        slidesPerView="auto"
        spaceBetween={20}
        loop
        loopPreventsSliding={false}
        grabCursor
        tabIndex={0}
        a11y={{
          containerMessage: "Our work gallery. Use the left and right arrow keys to browse.",
          itemRoleDescriptionMessage: "slide",
          slideLabelMessage: "{{index}} of {{slidesLength}}",
        }}
        onSwiper={(swiper) => {
          swiperRef.current = swiper;
          swiper.params.speed = speedRef.current;
        }}
        onSlideChange={(swiper) => setActiveIndex(swiper.realIndex)}
      >
        {workImages.map((src, index) => {
          const project = projects[index];
          return (
            <SwiperSlide key={src} className={styles.slide}>
              <figure className={styles.card}>
                <div className={styles.photo}>
                  <Image
                    src={src}
                    alt={project?.alt ?? `Custom printing project ${index + 1}`}
                    fill
                    sizes="(max-width: 700px) 82vw, (max-width: 1100px) 43vw, 30vw"
                    className={styles.image}
                    draggable={false}
                  />
                </div>
                <figcaption className={styles.caption}>
                  <div>
                    <h3>{project?.title ?? "Custom apparel"}</h3>
                    <p>{project?.detail ?? "Printed in Mauritius"}</p>
                  </div>
                  <span className={styles.projectNumber}>{String(index + 1).padStart(2, "0")}</span>
                </figcaption>
              </figure>
            </SwiperSlide>
          );
        })}
      </Swiper>

      <div className={styles.controls}>
        <p className={styles.hint}>Swipe or drag to explore</p>
        <div className={styles.pagination} aria-label="Choose a gallery image">
          {workImages.map((src, index) => (
            <button
              key={src}
              type="button"
              aria-label={`Show image ${index + 1}: ${projects[index]?.title ?? "Custom apparel"}`}
              aria-current={activeIndex === index ? "true" : undefined}
              aria-controls="work-carousel"
              onClick={() => swiperRef.current?.slideToLoop(index, reducedMotion ? 0 : 450)}
            />
          ))}
        </div>
        <div className={styles.navigation}>
          <span className={styles.counter} aria-live={shouldAutoplay ? "off" : "polite"} aria-atomic="true">
            <strong>{String(activeIndex + 1).padStart(2, "0")}</strong> / {String(workImages.length).padStart(2, "0")}
          </span>
          <button type="button" aria-label="Previous work image" aria-controls="work-carousel" onClick={() => swiperRef.current?.slidePrev(reducedMotion ? 0 : 450)}><ArrowLeft size={20} aria-hidden="true" /></button>
          <button type="button" aria-label="Next work image" aria-controls="work-carousel" onClick={() => swiperRef.current?.slideNext(reducedMotion ? 0 : 450)}><ArrowRight size={20} aria-hidden="true" /></button>
        </div>
      </div>
    </section>
  );
}
