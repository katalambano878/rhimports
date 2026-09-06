'use client';

import Image from 'next/image';
import Link from 'next/link';
import { FASHION_HERO_IMAGE, FASHION_PAGE_PATH } from '@/lib/fashion';

export default function FashionPopup({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onDismiss}
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-4xl bg-white rounded-2xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
        <button
          onClick={onDismiss}
          aria-label="Close"
          className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center text-gray-600 hover:text-gray-900 transition-all"
        >
          <i className="ri-close-line text-xl" />
        </button>

        <Link
          href={FASHION_PAGE_PATH}
          onClick={onDismiss}
          className="relative block w-full aspect-[16/9] sm:aspect-[21/9] bg-neutral-200"
        >
          <Image
            src={FASHION_HERO_IMAGE}
            alt="Streetwear Collection — tops and trousers. Shop Fashion at RNH Imports."
            fill
            className="object-cover object-center"
            sizes="(max-width: 896px) 100vw, 896px"
            priority
          />
        </Link>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 bg-white">
          <div className="text-center sm:text-left">
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400">New collection</p>
            <p className="font-serif text-lg sm:text-xl text-gray-900">Streetwear is here</p>
          </div>
          <Link
            href={FASHION_PAGE_PATH}
            onClick={onDismiss}
            className="inline-flex items-center justify-center gap-2 bg-[#1B2A6B] hover:bg-[#0F1A47] text-white font-bold px-6 py-3 rounded-full text-sm transition-colors w-full sm:w-auto"
          >
            Shop Fashion
            <i className="ri-arrow-right-line" />
          </Link>
        </div>
      </div>
    </div>
  );
}
