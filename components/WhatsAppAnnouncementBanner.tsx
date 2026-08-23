'use client';

import { useState, useEffect } from 'react';
import { DEFAULT_WHATSAPP_DISPLAY, whatsAppHref } from '@/lib/contact';

const STORAGE_KEY = 'rnh-whatsapp-number-banner-dismissed-0242205331';

/**
 * Sitewide bar announcing the new WhatsApp number.
 * Dismissible per-browser; number remains in header, footer, and chat button.
 */
export default function WhatsAppAnnouncementBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  if (!visible) return null;

  const href = whatsAppHref(
    DEFAULT_WHATSAPP_DISPLAY,
    'Hello RNH Imports, I have a question.',
  );

  return (
    <div className="relative z-[60] bg-[#1B2A6B] text-white">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-2.5 flex items-center justify-center gap-2 sm:gap-4">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 sm:gap-3 min-w-0 flex-1 sm:flex-none"
        >
          <span className="shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#25D366] flex items-center justify-center shadow-sm">
            <i className="ri-whatsapp-fill text-white text-base sm:text-lg" />
          </span>
          <span className="min-w-0 text-left sm:text-center">
            <span className="block text-[9px] sm:text-[10px] font-bold tracking-[0.18em] uppercase text-white/70">
              Our new WhatsApp number
            </span>
            <span className="block text-sm sm:text-base font-bold tracking-wide leading-tight">
              {DEFAULT_WHATSAPP_DISPLAY}
            </span>
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-bold px-3.5 py-1.5 rounded-full transition-colors shrink-0">
            Chat now
            <i className="ri-arrow-right-line" />
          </span>
        </a>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Dismiss WhatsApp number announcement"
        >
          <i className="ri-close-line text-lg" />
        </button>
      </div>
      <div className="h-0.5 bg-[#25D366]" />
    </div>
  );
}
