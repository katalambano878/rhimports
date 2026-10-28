import { Metadata } from 'next';
import { createServerSupabase } from '@/lib/supabase-server';
import ProductDetailClient from './ProductDetailClient';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://rnhimports.com';
const SITE_NAME = 'RNH Imports';

async function getProduct(slug: string) {
  try {
    const supabase = createServerSupabase('anon');
    const { data } = await supabase
      .from('products')
      .select('name, description, images, price, compare_at_price, category_id, metadata, sku, categories(name, slug)')
      .eq('slug', slug)
      .eq('status', 'active')
      .single();
    return data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) {
    return {
      title: `Product Not Found | ${SITE_NAME}`,
      robots: { index: false, follow: false },
    };
  }

  const productUrl = `${SITE_URL}/product/${slug}`;
  const ogImage = product.images?.[0]?.url || '/og-image.png';
  const title = `${product.name} | ${SITE_NAME}`;
  const catData = product.categories as unknown as { name: string; slug: string } | { name: string; slug: string }[] | null;
  const categoryName = Array.isArray(catData) ? catData[0]?.name || '' : catData?.name || '';
  const description = product.description
    ? product.description.slice(0, 155).trim() + (product.description.length > 155 ? '...' : '')
    : `Buy genuine ${product.name} at RNH Imports. Sourced direct from manufacturers, delivered across Ghana.`;

  return {
    title: product.name,
    description,
    openGraph: {
      title,
      description,
      url: productUrl,
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_GH',
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${product.name} — ${SITE_NAME}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: ogImage, alt: `${product.name} — ${SITE_NAME}` }],
    },
    alternates: { canonical: productUrl },
    keywords: [
      product.name,
      `buy ${product.name} Ghana`,
      `${product.name} Accra`,
      categoryName && `${categoryName} Ghana`,
      'genuine electronics Ghana',
      'RNH Imports',
    ].filter(Boolean),
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);

  const productJsonLd = product ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || `Genuine ${product.name} available at RNH Imports`,
    image: product.images?.map((img: { url: string }) => img.url) || [],
    sku: product.sku || slug,
    brand: { '@type': 'Brand', name: 'RNH Imports' },
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/product/${slug}`,
      priceCurrency: 'GHS',
      price: product.price,
      ...(product.compare_at_price && product.compare_at_price > product.price
        ? { priceValidUntil: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0] }
        : {}),
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: 'RNH Imports' },
      itemCondition: 'https://schema.org/NewCondition',
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'GH' },
      },
    },
  } : null;

  const rawCat = product?.categories as unknown as { name: string; slug: string } | { name: string; slug: string }[] | null;
  const categoryData = Array.isArray(rawCat) ? rawCat[0] || null : rawCat;

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Shop', item: `${SITE_URL}/shop` },
      ...(categoryData ? [{
        '@type': 'ListItem', position: 3,
        name: categoryData.name,
        item: `${SITE_URL}/shop?category=${categoryData.slug}`,
      }] : []),
      ...(product ? [{
        '@type': 'ListItem',
        position: categoryData ? 4 : 3,
        name: product.name,
        item: `${SITE_URL}/product/${slug}`,
      }] : []),
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {productJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      )}
      <ProductDetailClient slug={slug} />
    </>
  );
}
