'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import ProductCard, { type ColorVariant, getColorHex } from '@/components/ProductCard';
import AnimatedSection, { AnimatedGrid } from '@/components/AnimatedSection';
import { usePageTitle } from '@/hooks/usePageTitle';
import { FASHION_CATEGORY_SLUG, FASHION_HERO_IMAGE } from '@/lib/fashion';

export default function FashionPage() {
  usePageTitle('Fashion');
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFashion() {
      try {
        const { data: initialCategory, error: catError } = await supabase
          .from('categories')
          .select('id, slug')
          .eq('slug', FASHION_CATEGORY_SLUG)
          .eq('status', 'active')
          .maybeSingle();

        if (catError) throw catError;

        let category = initialCategory;
        if (!category) {
          await fetch('/api/storefront/ensure-fashion-category', { method: 'POST' });
          const retry = await supabase
            .from('categories')
            .select('id, slug')
            .eq('slug', FASHION_CATEGORY_SLUG)
            .eq('status', 'active')
            .maybeSingle();
          if (!retry.data) {
            setProducts([]);
            return;
          }
          category = retry.data;
        }

        const { data: children } = await supabase
          .from('categories')
          .select('id')
          .eq('parent_id', category.id)
          .eq('status', 'active');

        const categoryIds = [category.id, ...(children || []).map((c) => c.id)];

        const { data, error } = await supabase
          .from('products')
          .select('*, product_variants(*), product_images(*)')
          .eq('status', 'active')
          .in('category_id', categoryIds)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setProducts(data || []);
      } catch (err) {
        console.error('Fashion page fetch error:', err);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }

    fetchFashion();
  }, []);

  const buildCard = (product: any) => {
    const variants = product.product_variants || [];
    const hasVariants = variants.length > 0;
    const minVariantPrice = hasVariants ? Math.min(...variants.map((v: any) => v.price || product.price)) : undefined;
    const totalStock = hasVariants ? variants.reduce((s: number, v: any) => s + (v.quantity || 0), 0) : 0;
    const effectiveStock = hasVariants ? totalStock : product.quantity;
    const colorVariants: ColorVariant[] = [];
    const seenColors = new Set<string>();
    for (const c of (product.metadata?.product_options?.color?.values || []) as string[]) {
      const [n, h] = c.split('|');
      if (n && h && !seenColors.has(n.toLowerCase().trim())) {
        seenColors.add(n.toLowerCase().trim());
        colorVariants.push({ name: n.trim(), hex: h });
      }
    }
    for (const v of variants) {
      const cn = (v as any).option2;
      if (cn && !seenColors.has(cn.toLowerCase().trim())) {
        const hex = getColorHex(cn);
        if (hex) {
          seenColors.add(cn.toLowerCase().trim());
          colorVariants.push({ name: cn.trim(), hex });
        }
      }
    }
    return (
      <ProductCard
        key={product.id}
        id={product.id}
        slug={product.slug}
        name={product.name}
        price={product.price}
        originalPrice={product.compare_at_price}
        image={product.product_images?.[0]?.url || 'https://via.placeholder.com/400x500'}
        rating={product.rating_avg || 5}
        reviewCount={product.review_count || 0}
        badge={product.featured ? 'Featured' : undefined}
        inStock={effectiveStock > 0}
        isPreorder={product.metadata?.is_preorder ?? !!product.metadata?.preorder_shipping}
        maxStock={effectiveStock || 50}
        moq={product.moq || 1}
        hasVariants={hasVariants}
        minVariantPrice={minVariantPrice}
        colorVariants={colorVariants}
        brand={product.brand || product.vendor}
      />
    );
  };

  return (
    <main className="min-h-screen bg-white">
      <section className="relative w-full min-h-[58vh] sm:min-h-[70vh] lg:min-h-[78vh] flex items-end overflow-hidden bg-neutral-900">
        <Image
          src={FASHION_HERO_IMAGE}
          alt="Streetwear Collection — tops and trousers at RNH Imports"
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent pointer-events-none" />
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 pb-10 sm:pb-14 lg:pb-16">
          <p className="text-white/70 text-[10px] font-bold tracking-[0.28em] uppercase mb-3">
            Streetwear collection
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-tight mb-3">
            Fashion
          </h1>
          <p className="text-white/80 text-sm sm:text-base max-w-xl font-light">
            Bold designs, relaxed fits, everyday style. Tops, trousers and more — imported for Ghana.
          </p>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-12">
            <span className="text-gray-400 font-bold tracking-widest uppercase text-[10px] mb-3 block">
              The drop
            </span>
            <h2 className="font-serif text-3xl md:text-5xl text-gray-900 mb-3">Shop Fashion</h2>
            <p className="text-gray-400 text-base max-w-xl mx-auto font-light">
              Everything assigned to the Fashion category appears here automatically.
            </p>
          </AnimatedSection>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-6">
              {Array(8).fill(0).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="bg-gray-100 aspect-[3/4] rounded-2xl mb-4" />
                  <div className="h-3 bg-gray-100 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : products.length > 0 ? (
            <AnimatedGrid className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-6 lg:gap-8">
              {products.map(buildCard)}
            </AnimatedGrid>
          ) : (
            <div className="text-center py-20 border-2 border-dashed border-gray-100 rounded-3xl">
              <i className="ri-t-shirt-line text-5xl text-gray-200 block mb-4" />
              <p className="text-gray-400 font-semibold mb-2">Fashion pieces coming soon</p>
              <p className="text-gray-300 text-sm mb-8 max-w-md mx-auto">
                Assign products to the Fashion category in Admin and they will show up here.
              </p>
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-[#0F1A47] transition-all"
              >
                Browse Shop <i className="ri-arrow-right-line" />
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
