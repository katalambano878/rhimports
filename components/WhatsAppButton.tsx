'use client';

import { useCMS } from '@/context/CMSContext';
import { DEFAULT_CONTACT_PHONE } from '@/lib/contact';

/**
 * Floating WhatsApp click-to-chat button shown on every storefront page.
 * Opens a direct chat with the store's WhatsApp (the admin contact number
 * configured in Admin → Settings). Positioned bottom-right, lifted above the
 * mobile bottom navigation on small screens.
 */
export default function WhatsAppButton() {
  const { getSetting } = useCMS();

  const contactPhone =
    getSetting('social_whatsapp') || getSetting('contact_phone') || DEFAULT_CONTACT_PHONE;
  if (!contactPhone) return null;

  // Normalize a local GH number (e.g. 0594 162 758) to wa.me format (233594162758).
  const digits = contactPhone.replace(/\D/g, '');
  const waNumber = digits.startsWith('233')
    ? digits
    : `233${digits.replace(/^0/, '')}`;

  const siteName = getSetting('site_name') || 'RNH Imports';
  const prefilled = encodeURIComponent(`Hello ${siteName}, I have a question.`);
  const href = `https://wa.me/${waNumber}?text=${prefilled}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      title="Chat with us on WhatsApp"
      className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 hover:scale-110 active:scale-95 transition-transform"
    >
      <span className="absolute inset-0 rounded-full bg-[#25D366] opacity-60 animate-ping"></span>
      <i className="ri-whatsapp-fill text-3xl relative"></i>
    </a>
  );
}
