import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { serializeJsonLd } from '@/components/SEOHead';
import ProductDetailClient from './ProductDetailClient';

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://rnhimports.com').replace(/\/$/, '');
const SITE_NAME = 'RNH Imports';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only what the metadata and structured data need. Never cost fields.
const META_COLUMNS =
  'id, slug, name, description, short_description, seo_title, seo_description, status, price, compare_at_price, ' +
  'sku, brand, quantity, track_quantity, continue_selling, metadata, ' +
  'categories(name, slug), product_images(url, position), product_variants(price, quantity)';

type MetaProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  short_description: string | null;
  seo_title: string | null;
  seo_description: string | null;
  status: string | null;
  price: number;
  compare_at_price: number | null;
  sku: string | null;
  brand: string | null;
  quantity: number | null;
  track_quantity: boolean | null;
  continue_selling: boolean | null;
  metadata: Record<string, any> | null;
  categories?: { name: string; slug: string } | { name: string; slug: string }[] | null;
  product_images?: { url: string; position: number | null }[] | null;
  product_variants?: { price: number | null; quantity: number | null }[] | null;
};

/**
 * Server lookup shared by generateMetadata and the page (deduplicated per
 * request). Returns the product when it exists and is active, null when it
 * does not exist or is hidden, and 'error' when the database could not be
 * reached (the page then still renders and the browser can retry).
 */
const loadProduct = cache(async (rawSlug: string): Promise<MetaProduct | null | 'error'> => {
  let slug = rawSlug;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    slug = rawSlug;
  }
  try {
    const supabase = createServerSupabase('anon');
    let query = supabase.from('products').select(META_COLUMNS);
    query = UUID_RE.test(slug) ? query.eq('id', slug) : query.eq('slug', slug);
    const { data, error } = await query.maybeSingle();
    if (error) return 'error';
    if (!data) return null;
    const product = data as MetaProduct;
    return (product.status || '').toLowerCase() === 'active' ? product : null;
  } catch {
    return 'error';
  }
});

function plainText(value: string | null | undefined, max = 160): string {
  const text = (value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

function sortedImages(product: MetaProduct): string[] {
  return [...(product.product_images || [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((img) => img.url)
    .filter(Boolean);
}

function isPreorder(product: MetaProduct): boolean {
  return product.metadata?.is_preorder ?? !!product.metadata?.preorder_shipping;
}

function availability(product: MetaProduct): string {
  if (isPreorder(product)) return 'https://schema.org/PreOrder';
  if (product.track_quantity === false || product.continue_selling === true) return 'https://schema.org/InStock';
  const variants = product.product_variants || [];
  const stock = variants.length > 0
    ? variants.reduce((sum, v) => sum + (Number(v.quantity) || 0), 0)
    : Number(product.quantity) || 0;
  return stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
}

function category(product: MetaProduct) {
  const raw = product.categories;
  return Array.isArray(raw) ? raw[0] || null : raw || null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product || product === 'error') {
    return { title: product === 'error' ? 'Product' : 'Product not found' };
  }

  const title = product.seo_title?.trim() || product.name;
  const description =
    plainText(product.seo_description) ||
    plainText(product.short_description) ||
    plainText(product.description) ||
    `Buy ${product.name} at ${SITE_NAME}, delivered across Ghana.`;
  const image = sortedImages(product)[0];
  const path = `/product/${product.slug}`;

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: {
      type: 'website',
      url: `${SITE_URL}${path}`,
      title,
      description,
      siteName: SITE_NAME,
      locale: 'en_GH',
      images: image ? [{ url: image, alt: product.name }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (product === null) notFound();

  // Structured data only when the product really loaded; it is built from
  // database values (never the raw URL) and serialized with `<` escaped.
  let jsonLd: string[] = [];
  if (product !== 'error') {
    const url = `${SITE_URL}/product/${product.slug}`;
    const variants = product.product_variants || [];
    const prices = variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n) && n > 0);
    const price = prices.length > 0 ? Math.min(...prices) : Number(product.price);
    const cat = category(product);
    const productJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      ...(plainText(product.description, 5000) ? { description: plainText(product.description, 5000) } : {}),
      image: sortedImages(product),
      ...(product.sku ? { sku: product.sku } : {}),
      ...(product.brand?.trim() ? { brand: { '@type': 'Brand', name: product.brand.trim() } } : {}),
      ...(cat ? { category: cat.name } : {}),
      offers: {
        '@type': 'Offer',
        url,
        priceCurrency: 'GHS',
        price,
        availability: availability(product),
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@type': 'Organization', name: SITE_NAME },
        shippingDetails: {
          '@type': 'OfferShippingDetails',
          shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'GH' },
        },
      },
    };
    const breadcrumbJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Shop', item: `${SITE_URL}/shop` },
        ...(cat ? [{ '@type': 'ListItem', position: 3, name: cat.name, item: `${SITE_URL}/shop?category=${encodeURIComponent(cat.slug)}` }] : []),
        { '@type': 'ListItem', position: cat ? 4 : 3, name: product.name, item: url },
      ],
    };
    jsonLd = [serializeJsonLd(breadcrumbJsonLd), serializeJsonLd(productJsonLd)];
  }

  return (
    <>
      {jsonLd.map((json, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
      ))}
      <ProductDetailClient slug={slug} />
    </>
  );
}
