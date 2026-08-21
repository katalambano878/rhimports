/** Default store phone when CMS / env not set. Replace via Admin → Settings or env. */
export const DEFAULT_CONTACT_PHONE = '0594 162 758';

/** Display form of the current WhatsApp number (matches customer-facing flyer). */
export const DEFAULT_WHATSAPP_DISPLAY = '0594 162 758';

/** Ghana E.164 digits for wa.me (no +). */
export const DEFAULT_WHATSAPP_E164 = '233594162758';

const LEGACY_PHONE_DIGITS = new Set([
  '0502300319',
  '502300319',
  '233502300319',
  '555600371',
  '0555600371',
  '233555600371',
]);

/** Default store location when CMS not set. Replace via Admin → Settings or env. */
export const DEFAULT_CONTACT_ADDRESS = 'Amasaman Achiaman, Annosel Junction';

/** Google Maps search for the store. Replace with your location query. */
export const DEFAULT_CONTACT_MAP_LINK =
  'https://www.google.com/maps/search/?api=1&query=Amasaman+Achiaman+Annosel+Junction+Ghana';

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Apply default contact values only when a field is missing or still an old number. */
export function applyCanonicalContact(s: Record<string, string>): void {
  const phoneDigits = digitsOnly(s['contact_phone'] || '');
  if (!s['contact_phone']?.trim() || LEGACY_PHONE_DIGITS.has(phoneDigits)) {
    s['contact_phone'] = DEFAULT_CONTACT_PHONE;
  }

  const waDigits = digitsOnly(s['social_whatsapp'] || '');
  if (!s['social_whatsapp']?.trim() || LEGACY_PHONE_DIGITS.has(waDigits)) {
    s['social_whatsapp'] = DEFAULT_WHATSAPP_E164;
  }

  if (!s['contact_address']?.trim()) s['contact_address'] = DEFAULT_CONTACT_ADDRESS;
  if (!s['contact_map_link']?.trim()) s['contact_map_link'] = DEFAULT_CONTACT_MAP_LINK;
}

/**
 * Format phone for WhatsApp wa.me link (digits only, with Ghana country code).
 */
export function toWhatsAppNumber(phone: string): string {
  if (!phone) return '';
  const digits = digitsOnly(phone);
  if (!digits) return '';
  if (digits.startsWith('233')) return digits;
  if (digits.startsWith('0')) return `233${digits.slice(1)}`;
  return `233${digits}`;
}

export function whatsAppHref(phone: string, text?: string): string {
  const num = toWhatsAppNumber(phone);
  if (!num) return '#';
  const base = `https://wa.me/${num}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
