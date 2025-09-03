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
          <div className="h-[700px] w-full overflow-hidden rounded-xl border bg-gray-100 shadow-sm">
            {errors.has(idx) ? (
              <div className="h-full w-full grid place-items-center text-gray-400 text-xs">Image placeholder</div>
            ) : (
              <Image
                src={src}
                alt={`Our work ${idx + 1}`}
                fill
                sizes="(max-width: 768px) 90vw, (max-width: 1024px) 45vw, 30vw"
                className="h-[500px] w-full object-cover rounded-xl border"
                onError={() => setErrors((prev) => new Set(prev).add(idx))}
              />
            )}
          </div>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}
