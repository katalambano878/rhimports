import { Metadata } from 'next';
import { serializeJsonLd } from '@/components/SEOHead';

const SITE = 'RNH Imports';

export const metadata: Metadata = {
  title: 'Shop All Products',
  description:
    'Browse genuine laptops, smartphones, tablets, cameras, gaming consoles, audio gear and more at RNH Imports. Sourced direct from China, delivered across Ghana with the best prices.',
  keywords: [
    'buy electronics Ghana', 'online electronics store Ghana', 'laptops Accra',
    'iPhones Ghana', 'Samsung phones Ghana', 'iPads Ghana', 'MacBook Ghana',
    'Sony cameras Ghana', 'Beats headphones Ghana', 'Xbox Ghana', 'PlayStation Ghana',
    'gaming consoles Ghana', 'smart watches Ghana', 'genuine electronics Ghana',
    'affordable tech Ghana', 'RNH Imports shop',
  ],
  openGraph: {
    title: `Shop All Products | ${SITE}`,
    description: 'Genuine electronics sourced directly and delivered Ghana-wide. Laptops, phones, tablets, cameras, gaming and more.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: `Shop — ${SITE}`, type: 'image/png' }],
    url: '/shop',
    type: 'website',
    locale: 'en_GH',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Shop All Products | ${SITE}`,
    description: 'Browse genuine electronics at the best prices. Laptops, phones, cameras and more — delivered across Ghana.',
    images: [{ url: '/og-image.png', alt: `Shop — ${SITE}` }],
  },
  alternates: { canonical: '/shop' },
};

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://rnhimports.com';

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Shop', item: `${SITE_URL}/shop` },
  ],
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      {children}
    </>
  );
}
