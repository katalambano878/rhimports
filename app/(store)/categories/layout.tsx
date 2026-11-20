import { Metadata } from 'next';
import { serializeJsonLd } from '@/components/SEOHead';

const SITE = 'RNH Imports';

export const metadata: Metadata = {
  title: 'All Collections — Browse by Category',
  description:
    'Browse every product category at RNH Imports: smartphones, laptops, tablets, cameras, gaming consoles, audio equipment, wearables, TVs and more. All genuine, sourced direct from China, delivered across Ghana.',
  keywords: [
    'electronics categories Ghana', 'shop by category RNH Imports',
    'smartphones Ghana', 'laptops Ghana', 'tablets Ghana', 'cameras Ghana',
    'gaming consoles Ghana', 'audio equipment Ghana', 'wearables Ghana',
    'TVs Ghana', 'electronics collections', 'RNH Imports categories',
    'buy electronics by category Accra',
  ],
  openGraph: {
    title: `All Collections | ${SITE}`,
    description: 'Browse every electronics category — phones, laptops, gaming, cameras, audio and more. Sourced direct, delivered Ghana-wide.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: `Collections — ${SITE}`, type: 'image/png' }],
    url: '/categories',
    locale: 'en_GH',
  },
  twitter: {
    card: 'summary_large_image',
    title: `All Collections | ${SITE}`,
    description: 'Browse every category — phones, laptops, gaming, cameras, audio and more. Sourced direct, delivered Ghana-wide.',
    images: [{ url: '/og-image.png', alt: `Collections — ${SITE}` }],
  },
  alternates: { canonical: '/categories' },
};

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://rnhimports.com';

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Categories', item: `${SITE_URL}/categories` },
  ],
};

export default function CategoriesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      {children}
    </>
  );
}
