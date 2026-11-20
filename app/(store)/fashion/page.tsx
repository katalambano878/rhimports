'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import ProductCard, { type ColorVariant, getColorHex } from '@/components/ProductCard';
import AnimatedSection, { AnimatedGrid } from '@/components/AnimatedSection';
import { usePageTitle } from '@/hooks/usePageTitle';
import { FASHION_CATEGORY_SLUG, FASHION_HERO_IMAGE } from '@/lib/fashion';
import { sellableStock, isPreorderProduct } from '@/context/CartContext';

// Explicit columns: never send cost fields to the browser.
const PRODUCT_LIST_COLUMNS =
  'id, name, slug, price, compare_at_price, quantity, track_quantity, continue_selling, moq, featured, ' +
  'rating_avg, review_count, metadata, brand, vendor, created_at, ' +
  'product_variants(id, name, price, quantity, option1, option2), product_images(url, position)';

const NO_IMAGE =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M30 65l12-15 10 12 8-9 10 12z%27 fill=%27%23d1d5db%27/%3E%3C/svg%3E";

export default function FashionPage() {
  usePageTitle('Fashion');
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function fetchFashion() {
      setLoading(true);
      setLoadError(false);
      try {
        const { data: category, error: catError } = await supabase
          .from('categories')
          .select('id, slug')
          .eq('slug', FASHION_CATEGORY_SLUG)
          .eq('status', 'active')
          .maybeSingle();

        if (catError) throw catError;
        // No Fashion category: show the empty state.
        if (!category) {
          if (active) setProducts([]);
          return;
        }

        const { data: children, error: childError } = await supabase
          .from('categories')
          .select('id')
          .eq('parent_id', category.id)
          .eq('status', 'active');
        if (childError) throw childError;

        const categoryIds = [category.id, ...(children || []).map((c: { id: string }) => c.id)];

        const { data, error } = await supabase
          .from('products')
          .select(PRODUCT_LIST_COLUMNS)
          .eq('status', 'active')
          .in('category_id', categoryIds)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (active) setProducts(data || []);
      } catch (err) {
        console.error('Fashion page fetch error:', err);
        if (active) {
          setProducts([]);
          setLoadError(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchFashion();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const buildCard = (product: any) => {
    const variants = product.product_variants || [];
    const hasVariants = variants.length > 0;
    const minVariantPrice = hasVariants ? Math.min(...variants.map((v: any) => v.price || product.price)) : undefined;
    const totalStock = hasVariants ? variants.reduce((s: number, v: any) => s + (v.quantity || 0), 0) : 0;
    const effectiveStock = sellableStock(hasVariants ? totalStock : product.quantity, product);
    const images = [...(product.product_images || [])].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
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
        originalPrice={product.compare_at_price ?? undefined}
        image={images[0]?.url || NO_IMAGE}
        rating={product.rating_avg || 0}
        reviewCount={product.review_count || 0}
        badge={product.featured ? 'Featured' : undefined}
        inStock={effectiveStock >= (product.moq || 1)}
        isPreorder={isPreorderProduct(product)}
        maxStock={effectiveStock}
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
            <p className="text-gray-500 text-base max-w-xl mx-auto font-light">
              Tops, trousers and more from our streetwear collection.
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
          ) : loadError ? (
            <div className="text-center py-20" role="alert">
              <p className="text-gray-700 font-semibold mb-2">Couldn&apos;t load fashion items</p>
              <p className="text-gray-500 text-sm mb-6">Check your connection and try again.</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-[#0F1A47] transition-all"
              >
                Try again
              </button>
            </div>
          ) : products.length > 0 ? (
            <AnimatedGrid className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-6 lg:gap-8">
              {products.map(buildCard)}
            </AnimatedGrid>
          ) : (
            <div className="text-center py-20 border-2 border-dashed border-gray-100 rounded-3xl">
              <i className="ri-t-shirt-line text-5xl text-gray-300 block mb-4" aria-hidden="true" />
              <p className="text-gray-600 font-semibold mb-2">Fashion pieces coming soon</p>
              <p className="text-gray-500 text-sm mb-8 max-w-md mx-auto">
                There are no fashion items right now. Have a look at the rest of the shop.
              </p>
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-[#0F1A47] transition-all"
              >
                Browse Shop <i className="ri-arrow-right-line" aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
