import { Metadata } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://rnhimports.com';
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'RNH Imports';
const DEFAULT_OG = '/opengraph-image';

const BASE_KEYWORDS = [
  'online store',
  'e-commerce',
  'shop online',
];

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string[];
  ogImage?: string;
  ogImageAlt?: string;
  ogType?: 'website' | 'product' | 'article';
  price?: number;
  currency?: string;
  availability?: string;
  category?: string;
  publishedTime?: string;
  author?: string;
  noindex?: boolean;
  canonical?: string;
}

export function generateMetadata({
  title,
  description = `${SITE_NAME}: electronics and gadgets imported for customers in Ghana.`,
  keywords = [],
  ogImage = DEFAULT_OG,
  ogImageAlt,
  ogType = 'website',
  noindex = false,
  canonical,
}: SEOProps): Metadata {
  const pageTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const allKeywords = [...new Set([...keywords, ...BASE_KEYWORDS])];
  const canonicalUrl = canonical || SITE_URL;

  return {
    title: pageTitle,
    description,
    keywords: allKeywords.join(', '),
    openGraph: {
      title: pageTitle,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: ogImageAlt || pageTitle, type: 'image/png' }],
      type: ogType as any,
      siteName: SITE_NAME,
      locale: 'en_GH',
      url: canonicalUrl,
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description,
      images: [{ url: ogImage, alt: ogImageAlt || pageTitle }],
      creator: '',
      site: '',
    },
    robots: noindex
      ? { index: false, follow: false }
      : { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
    alternates: { canonical: canonicalUrl },
  };
}

/** Product JSON-LD schema */
export function generateProductSchema(product: {
  name: string;
  description: string;
  image: string;
  price: number;
  currency?: string;
  sku: string;
  rating?: number;
  reviewCount?: number;
  availability?: string;
  brand?: string;
  category?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.image,
    sku: product.sku,
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: product.currency || 'GHS',
      availability:
        product.availability === 'preorder'
          ? 'https://schema.org/PreOrder'
          : product.availability === 'in_stock'
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
      url: typeof window !== 'undefined' ? window.location.href : SITE_URL,
      seller: { '@type': 'Organization', name: SITE_NAME },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'GH' },
      },
    },
    ...(product.rating && product.reviewCount ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: product.rating,
        reviewCount: product.reviewCount,
        bestRating: 5,
        worstRating: 1,
      },
    } : {}),
    ...(product.category ? { category: product.category } : {}),
  };
}

/** Breadcrumb JSON-LD schema */
export function generateBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** FAQPage JSON-LD schema */
export function generateFAQSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

/** ItemList schema for category/collection pages */
export function generateItemListSchema(items: { name: string; url: string; image?: string; position: number }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Products — ${SITE_NAME}`,
    itemListElement: items.map((item) => ({
      '@type': 'ListItem',
      position: item.position,
      name: item.name,
      url: item.url,
      ...(item.image ? { image: item.image } : {}),
    })),
  };
}

/**
 * Serialize data for a <script type="application/ld+json"> tag.
 * `<` is escaped so text such as "</script>" in a product name or URL can
 * never close the tag and run as HTML.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Inline JSON-LD script component */
export function StructuredData({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
