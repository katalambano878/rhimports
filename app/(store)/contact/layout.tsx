import { Metadata } from 'next';

const SITE = 'RNH Imports';

export const metadata: Metadata = {
  title: 'Contact Us',
  description:
    'Get in touch with RNH Imports. Reach us on WhatsApp at 0594 162 758, email info@rnhimports.com, or visit us in Amasaman, Accra. We respond Monday to Saturday.',
  keywords: [
    'contact RNH Imports', 'RNH Imports phone number', 'RNH Imports WhatsApp',
    'electronics store Accra contact', 'RNH Imports email', 'Amasaman electronics store',
    'import enquiry Ghana', 'bulk order electronics Ghana',
  ],
  openGraph: {
    title: `Contact Us | ${SITE}`,
    description: 'WhatsApp, email, or visit us in Amasaman, Accra. We\'re ready to help with your electronics import needs.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: `Contact — ${SITE}`, type: 'image/png' }],
    url: '/contact',
    locale: 'en_GH',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Contact Us | ${SITE}`,
    description: 'Reach RNH Imports on WhatsApp, email, or visit our store in Accra.',
    images: [{ url: '/og-image.png', alt: `Contact — ${SITE}` }],
  },
  alternates: { canonical: '/contact' },
};

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://rnhimports.com';

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Contact Us', item: `${SITE_URL}/contact` },
  ],
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {children}
    </>
  );
}
