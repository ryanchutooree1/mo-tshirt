"use client";

import { useMemo } from "react";
import { workImages } from "@/data/work";
import LoadingImage from "@/components/LoadingImage";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";
import "swiper/css";

export default function Gallery() {
  const images = useMemo(() => workImages, []);
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
            <LoadingImage
              src={src}
              alt={`T-shirt printing in Mauritius example ${idx + 1}`}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
              wrapperClassName="h-full w-full"
              fallbackSrc={fallbackSrc}
              statusText="Loading image..."
            />
          </div>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}
