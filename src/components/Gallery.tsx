"use client";

import { useMemo } from "react";
import Image from "next/image";
import { workImages } from "@/data/work";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";
import "swiper/css";

export default function Gallery() {
  const images = useMemo(() => workImages, []);

  return (
    <Swiper
      modules={[Autoplay]}
      loop
      speed={600}
      autoplay={{ delay: 2500, disableOnInteraction: false }}
      spaceBetween={16}
      slidesPerView={1}
      slidesPerGroup={1}
      breakpoints={{
        768: { slidesPerView: 2, slidesPerGroup: 2 },
        1024: { slidesPerView: 3, slidesPerGroup: 3 },
      }}
      className="w-full"
    >
      {images.map((src, idx) => (
        <SwiperSlide key={idx} className="px-1 sm:px-0">
          <div className="relative h-[620px] sm:h-[680px] lg:h-[740px] w-full overflow-hidden rounded-3xl border border-[#EAEAEA] bg-white shadow-sm">
            <Image
              src={src}
              alt={`T-shirt printing in Mauritius example ${idx + 1}`}
              fill
              sizes="(max-width: 767px) calc(100vw - 56px), (max-width: 1023px) calc(50vw - 48px), 370px"
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}
