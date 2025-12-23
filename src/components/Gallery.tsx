"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { workImages } from "@/data/work";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";
import "swiper/css";

export default function Gallery() {
  const images = useMemo(() => workImages, []);
  const [errors, setErrors] = useState<Set<number>>(new Set());
  const fallbackSrc = "/all_products.jpg";

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
            {errors.has(idx) ? (
              <Image
                src={fallbackSrc}
                alt="Custom T-shirt printing in Mauritius"
                fill
                sizes="(max-width: 768px) 90vw, (max-width: 1024px) 45vw, 30vw"
                className="object-cover"
              />
            ) : (
              <Image
                src={src}
                alt={`T-shirt printing in Mauritius example ${idx + 1}`}
                fill
                sizes="(max-width: 768px) 90vw, (max-width: 1024px) 45vw, 30vw"
                className="object-cover"
                onError={() => setErrors((prev) => new Set(prev).add(idx))}
              />
            )}
          </div>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}
