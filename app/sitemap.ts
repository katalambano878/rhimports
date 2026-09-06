import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Only include slugs that are valid for URLs (no empty, no slashes, no unsafe chars). */
function isValidSlug(slug: string | null | undefined): slug is string {
  if (typeof slug !== 'string' || !slug.trim()) return false;
  // No path separators or query chars that could break /product/[slug]
  if (slug.includes('/') || slug.includes('?')) return false;
  return true;
}

/** Safe lastModified for sitemap (Google rejects invalid dates). */
function safeLastModified(date: string | null | undefined): Date {
  if (!date) return new Date();
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://rnhimports.com').replace(/\/+$/, '');

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/shop`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.95 },
    { url: `${baseUrl}/fashion`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/categories`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/service`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.75 },
    { url: `${baseUrl}/faqs`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/shipping`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/returns`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  ];

  let productPages: MetadataRoute.Sitemap = [];
  let categoryPages: MetadataRoute.Sitemap = [];

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: products } = await supabase
      .from('products')
      .select('slug, updated_at')
      .eq('status', 'active');

    if (products?.length) {
      productPages = products
        .filter((p) => isValidSlug(p.slug))
        .map((product) => ({
          url: `${baseUrl}/product/${encodeURIComponent(product.slug!.trim())}`,
          lastModified: safeLastModified(product.updated_at),
          changeFrequency: 'weekly' as const,
          priority: 0.8,
        }));
    }

    const { data: categories } = await supabase
      .from('categories')
      .select('slug, updated_at')
      .eq('status', 'active');

    if (categories?.length) {
      categoryPages = categories
        .filter((c) => isValidSlug(c.slug))
        .map((category) => ({
          url: `${baseUrl}/shop?category=${encodeURIComponent(category.slug!.trim())}`,
          lastModified: safeLastModified(category.updated_at),
          changeFrequency: 'weekly' as const,
          priority: 0.75,
        }));
    }
  } catch (error) {
    console.error('Sitemap generation error:', error);
  }

  return [...staticPages, ...productPages, ...categoryPages];
}
