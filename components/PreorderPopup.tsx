'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { DEFAULT_CONTACT_PHONE, whatsAppHref } from '@/lib/contact';

const STORAGE_KEY = 'rnh-preorder-notice-seen';
const COOLDOWN_HOURS = 24;

export default function PreorderPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const last = localStorage.getItem(STORAGE_KEY);
    if (!last) {
      setOpen(true);
      return;
    }
    const hoursSince = (Date.now() - Number(last)) / 36e5;
    if (hoursSince >= COOLDOWN_HOURS) setOpen(true);
  }, []);

  const dismiss = () => {
    setOpen(false);
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/65"
        onClick={dismiss}
        aria-hidden
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col sm:flex-row max-h-[92vh]">

        {/* Close */}
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center text-gray-500 hover:text-gray-900 transition-all"
        >
          <i className="ri-close-line text-lg" />
        </button>

        {/* Image */}
        <div className="relative w-full sm:w-[45%] aspect-[4/3] sm:aspect-auto sm:min-h-[460px] flex-shrink-0 bg-[#dce8f7]">
          <Image
            src="/images/home/preorder-popup.png"
            alt="RNH Imports — Preorder Notice"
            fill
            className="object-cover object-top"
            priority
          />
          {/* Bottom navy bar on image */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#1B2A6B]/80 to-transparent h-24 pointer-events-none" />
          <div className="absolute bottom-4 left-4">
            <span className="text-white text-[10px] font-bold tracking-[0.2em] uppercase opacity-80">RNH Imports</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col justify-center p-6 sm:p-8 overflow-y-auto">

          {/* Badge */}
          <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/30 text-gray-500 text-[9px] font-bold tracking-widest uppercase px-3 py-1 rounded-full w-fit mb-3">
            <i className="ri-information-line text-xs" /> Important Notice
          </span>

          <h2 className="font-serif text-xl sm:text-2xl text-gray-900 leading-tight mb-2">
            Most Items Are<br />
            <span className="text-[#1B2A6B]">on Preorder</span>
          </h2>

          <p className="text-gray-500 text-xs leading-relaxed mb-3">
            Our products are sourced directly from verified suppliers abroad and imported fresh for every order. This means most items are <strong className="text-gray-700">not held in local stock</strong>.
          </p>

          {/* Delivery callout */}
          <div className="flex items-start gap-3 bg-[#1B2A6B]/5 border border-[#1B2A6B]/15 rounded-xl p-3 mb-3">
            <i className="ri-time-line text-[#1B2A6B] text-base mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold text-gray-900 text-xs mb-0.5">Estimated Delivery Time</p>
              <p className="text-gray-600 text-xs">
                <span className="font-bold text-[#1B2A6B]">45 – 60 days</span> from order placement to delivery in Ghana.
              </p>
            </div>
          </div>

          <p className="text-gray-400 text-[11px] leading-relaxed mb-4">
            We keep you updated at every step — from sourcing to customs to your door. Have questions before ordering? Chat with us on WhatsApp.
          </p>

          {/* CTAs */}
          <button
            onClick={dismiss}
            className="w-full bg-[#1B2A6B] hover:bg-[#0F1A47] text-white font-bold py-3 rounded-full text-xs transition-all mb-2 shadow-lg shadow-[#1B2A6B]/20"
          >
            I Understand — Let Me Shop
          </button>

          <Link
            href={whatsAppHref(DEFAULT_CONTACT_PHONE, 'Hello RNH Imports, I have a question.')}
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismiss}
            className="w-full flex items-center justify-center gap-2 border border-gray-200 hover:border-[#25D366] text-gray-600 hover:text-[#25D366] font-semibold py-2.5 rounded-full text-xs transition-all"
          >
            <i className="ri-whatsapp-line text-sm" /> Ask on WhatsApp first
          </Link>
        </div>
      </div>
    </div>
  );
}
