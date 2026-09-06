'use client';

import Link from 'next/link';
import Image from 'next/image';
import { FASHION_HERO_IMAGE, FASHION_PAGE_PATH } from '@/lib/fashion';

export default function FashionHomeBanner() {
  return (
    <section className="bg-white pt-8 sm:pt-10 pb-2 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <Link
          href={FASHION_PAGE_PATH}
          className="group relative block overflow-hidden rounded-3xl shadow-[0_18px_50px_-20px_rgba(15,26,71,0.45)] ring-1 ring-black/5"
          aria-label="Shop the Fashion streetwear collection"
        >
          <div className="relative h-[240px] sm:h-[300px] lg:h-[380px]">
            <Image
              src={FASHION_HERO_IMAGE}
              alt="Streetwear Collection — tops and trousers. Shop Fashion at RNH Imports."
              fill
              className="object-cover object-center transition-transform duration-700 group-hover:scale-[1.03]"
              sizes="(max-width: 1280px) 100vw, 1280px"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-black/10 sm:via-black/25" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

            <div className="absolute inset-0 flex items-end sm:items-center">
              <div className="w-full sm:w-auto px-5 py-6 sm:px-10 sm:py-0 max-w-md">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 px-3 py-1 text-[10px] font-bold tracking-[0.22em] uppercase text-white mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E11D48] animate-pulse" />
                  Just dropped
                </span>
                <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-white leading-tight mb-2">
                  Streetwear is here
                </h2>
                <p className="text-white/80 text-sm sm:text-base font-light mb-5 max-w-sm">
                  Bold tops, relaxed trousers, everyday fits. See what just landed.
                </p>
                <span className="inline-flex items-center gap-2 bg-white text-[#1B2A6B] group-hover:bg-[#1B2A6B] group-hover:text-white font-bold text-sm px-6 py-3 rounded-full transition-colors shadow-lg">
                  Explore Fashion
                  <i className="ri-arrow-right-line text-base transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
}
