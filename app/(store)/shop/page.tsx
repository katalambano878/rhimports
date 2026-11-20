'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';
import ProductCard, { type ColorVariant } from '@/components/ProductCard';
import { getColorHex } from '@/components/ProductCard';
import { supabase } from '@/lib/supabase';
import { cachedQuery } from '@/lib/query-cache';
import { sellableStock, isPreorderProduct } from '@/context/CartContext';
import PageHero from '@/components/PageHero';
import AnimatedSection from '@/components/AnimatedSection';
import { HERO_IMAGES_OTHER_PAGES } from '@/lib/hero-images';

const PRODUCTS_PER_PAGE = 9;
const MAX_PRICE = 5000;
const SORTS = ['popular', 'new', 'price-low', 'price-high', 'rating'] as const;
type Sort = (typeof SORTS)[number];

// Explicit columns: never send cost fields to the browser.
const LIST_COLUMNS = `
  id, name, slug, price, compare_at_price, quantity, track_quantity, continue_selling, moq,
  rating_avg, review_count, metadata, brand, vendor, category_id, created_at,
  categories(name, slug),
  product_images!product_id(url, position),
  product_variants(id, name, price, quantity, option1, option2, image_url)
`;

const NO_IMAGE =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M30 65l12-15 10 12 8-9 10 12z%27 fill=%27%23d1d5db%27/%3E%3C/svg%3E";

function normaliseSort(value: string | null | undefined): Sort {
  if (value === 'newest' || value === 'latest') return 'new';
  if (value === 'price-asc' || value === 'price_low') return 'price-low';
  if (value === 'price-desc' || value === 'price_high') return 'price-high';
  return (SORTS as readonly string[]).includes(value || '') ? (value as Sort) : 'popular';
}

function ShopContent() {
  usePageTitle('Shop All Products');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Filters live in the URL so they survive reloads, sharing and Back.
  const selectedCategory = searchParams?.get('category') || 'all';
  const sortBy = normaliseSort(searchParams?.get('sort'));
  const search = (searchParams?.get('search') || '').trim();
  const maxParam = parseInt(searchParams?.get('max') || '', 10);
  const maxPrice = Number.isFinite(maxParam) && maxParam >= 0 && maxParam < MAX_PRICE ? maxParam : MAX_PRICE;
  const ratingParam = parseInt(searchParams?.get('rating') || '', 10);
  const selectedRating = Number.isFinite(ratingParam) && ratingParam >= 1 && ratingParam <= 4 ? ratingParam : 0;
  const pageParam = parseInt(searchParams?.get('page') || '', 10);
  const page = Number.isFinite(pageParam) && pageParam > 1 ? pageParam : 1;

  // State
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  // The slider moves freely; the URL is updated when it is released.
  const [draftMax, setDraftMax] = useState(maxPrice);
  useEffect(() => setDraftMax(maxPrice), [maxPrice]);

  const setFilters = useCallback((changes: Record<string, string | number | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams?.toString() || '');
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '' || value === 'all' || (key === 'sort' && value === 'popular') || (key === 'max' && Number(value) >= MAX_PRICE) || (key === 'rating' && Number(value) === 0) || (key === 'page' && Number(value) <= 1)) {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    }
    if (resetPage && !('page' in changes)) next.delete('page');
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname || '/shop', { scroll: false });
  }, [router, pathname, searchParams]);

  // Fetch categories from the cached API
  useEffect(() => {
    let active = true;
    async function fetchCategories() {
      try {
        const res = await fetch('/api/storefront/categories');
        const data = res.ok ? await res.json() : null;
        if (active && Array.isArray(data)) setCategories(data);
      } catch (err) {
        console.error('Error fetching categories:', err);
      } finally {
        if (active) setCategoriesLoaded(true);
      }
    }
    fetchCategories();
    return () => {
      active = false;
    };
  }, []);

  // Fetch products
  useEffect(() => {
    // A category filter needs the category list to know the child categories.
    if (selectedCategory !== 'all' && !categoriesLoaded) return;
    let active = true;

    async function fetchProducts() {
      setLoading(true);
      setLoadError(false);
      try {
        let categoryIds: string[] | null = null;
        if (selectedCategory !== 'all') {
          const categoryObj = categories.find((c) => c.slug === selectedCategory);
          if (!categoryObj) {
            categoryIds = [];
          } else {
            // The category and every category below it.
            const ids = new Set<string>([categoryObj.id]);
            let grew = true;
            while (grew) {
              grew = false;
              for (const c of categories) {
                if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) {
                  ids.add(c.id);
                  grew = true;
                }
              }
            }
            categoryIds = [...ids];
          }
        }

        if (categoryIds && categoryIds.length === 0) {
          if (!active) return;
          setProducts([]);
          setTotalProducts(0);
          return;
        }

        // The cache key covers every filter, including which categories matched.
        const cacheKey = `shop:v3:${selectedCategory}:${(categoryIds || []).join(',')}:${search}:${maxPrice}:${selectedRating}:${sortBy}:${page}`;

        const { data, count, error } = await cachedQuery<{ data: any; count: any; error: any }>(
          cacheKey,
          async () => {
            let query = supabase
              .from('products')
              .select(LIST_COLUMNS, { count: 'exact' })
              .eq('status', 'active')
              .order('position', { foreignTable: 'product_images', ascending: true });

            if (search) {
              const escaped = search.replace(/[%_\\]/g, (m) => `\\${m}`);
              query = query.ilike('name', `%${escaped}%`);
            }
            if (categoryIds) query = query.in('category_id', categoryIds);
            if (maxPrice < MAX_PRICE) query = query.lte('price', maxPrice);
            if (selectedRating > 0) query = query.gte('rating_avg', selectedRating);

            switch (sortBy) {
              case 'price-low':
                query = query.order('price', { ascending: true });
                break;
              case 'price-high':
                query = query.order('price', { ascending: false });
                break;
              case 'rating':
                query = query.order('rating_avg', { ascending: false });
                break;
              case 'new':
              case 'popular':
              default:
                query = query.order('created_at', { ascending: false });
                break;
            }

            const from = (page - 1) * PRODUCTS_PER_PAGE;
            query = query.range(from, from + PRODUCTS_PER_PAGE - 1);
            return query as any;
          },
          2 * 60 * 1000 // Cache for 2 minutes (failures are never cached)
        );

        if (error) throw error;
        if (!active) return;

        // Past the last page (e.g. after a filter change): go back to page 1.
        if ((data || []).length === 0 && page > 1 && (count || 0) > 0) {
          setFilters({ page: null }, false);
          return;
        }

        const formattedProducts = (data || []).map((p: any) => {
          const variants = p.product_variants || [];
          const hasVariants = variants.length > 0;
          const minVariantPrice = hasVariants ? Math.min(...variants.map((v: any) => v.price || p.price)) : undefined;
          const totalVariantStock = hasVariants ? variants.reduce((sum: number, v: any) => sum + (v.quantity || 0), 0) : 0;
          const effectiveStock = sellableStock(hasVariants ? totalVariantStock : p.quantity, p);
          const colorVariants: ColorVariant[] = [];
          const seenColors = new Set<string>();
          // Pull colors from metadata.product_options.color (new system)
          const metaColors = (p.metadata?.product_options?.color?.values || []) as string[];
          for (const c of metaColors) {
            const [cName, cHex] = c.split('|');
            if (cName && cHex && !seenColors.has(cName.toLowerCase().trim())) {
              seenColors.add(cName.toLowerCase().trim());
              colorVariants.push({ name: cName.trim(), hex: cHex });
            }
          }
          // Fallback: legacy colors from variant option2
          for (const v of variants) {
            const colorName = v.option2;
            if (colorName && !seenColors.has(colorName.toLowerCase().trim())) {
              const hex = getColorHex(colorName);
              if (hex) {
                seenColors.add(colorName.toLowerCase().trim());
                colorVariants.push({ name: colorName.trim(), hex });
              }
            }
          }
          const images = [...(p.product_images || [])].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));

          return {
            id: p.id,
            slug: p.slug,
            name: p.name,
            price: p.price,
            originalPrice: p.compare_at_price ?? undefined,
            image: images[0]?.url || NO_IMAGE,
            rating: p.rating_avg || 0,
            reviewCount: p.review_count || 0,
            badge: p.compare_at_price > p.price ? 'Sale' : undefined,
            inStock: effectiveStock >= (p.moq || 1),
            isPreorder: isPreorderProduct(p),
            maxStock: effectiveStock,
            moq: p.moq || 1,
            hasVariants,
            minVariantPrice,
            colorVariants,
            brand: p.brand || p.vendor || undefined,
          };
        });
        setProducts(formattedProducts);
        setTotalProducts(count || 0);
      } catch (err) {
        console.error('Error fetching products:', err);
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchProducts();
    return () => {
      active = false;
    };
  }, [selectedCategory, maxPrice, selectedRating, sortBy, page, search, categories, categoriesLoaded, reloadKey, setFilters]);

  const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE);

  return (
    <main className="min-h-screen bg-white">
      <PageHero
        title={search ? `Results for "${search}"` : 'Shop All Products'}
        subtitle="Discover our curated collection of premium goods"
        backgroundImage={HERO_IMAGES_OTHER_PAGES[5]}
      />

      {/* Mobile Filter Toggle */}
      <div className="lg:hidden bg-white border-b border-gray-200 py-3 px-4 sticky top-14 z-20 shadow-sm">
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            aria-expanded={isFilterOpen}
            className="flex items-center space-x-2 text-gray-900 font-medium"
          >
            <i className="ri-filter-3-line text-xl" aria-hidden="true"></i>
            <span>Filters & Sort</span>
          </button>
          <span className="text-sm text-gray-500">{totalProducts} Products</span>
        </div>
      </div>

      <AnimatedSection direction="up" className="py-12">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-6">
          <div className="flex gap-8">
            <aside className={`${isFilterOpen ? 'fixed inset-0 z-50 bg-white overflow-y-auto' : 'hidden'} lg:block lg:w-64 lg:flex-shrink-0`}>
              <div className="lg:sticky lg:top-24">
                <div className="bg-white lg:bg-transparent p-6 lg:p-0">
                  <div className="flex items-center justify-between mb-6 lg:hidden">
                    <h2 className="text-xl font-bold text-gray-900">Filters</h2>
                    <button
                      type="button"
                      onClick={() => setIsFilterOpen(false)}
                      aria-label="Close filters"
                      className="w-10 h-10 flex items-center justify-center text-gray-700"
                    >
                      <i className="ri-close-line text-2xl" aria-hidden="true"></i>
                    </button>
                  </div>

                  <div className="space-y-8">
                    {/* Categories */}
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-4">Categories</h3>
                      <div className="space-y-1">
                        <button
                          type="button"
                          aria-pressed={selectedCategory === 'all'}
                          onClick={() => {
                            setFilters({ category: null });
                            setIsFilterOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${selectedCategory === 'all'
                            ? 'bg-gray-100 text-gray-900 font-medium'
                            : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                          All Products
                        </button>

                        {/* Parent Categories */}
                        {!categoriesLoaded && (
                          <p className="px-4 py-2 text-sm text-gray-500" role="status">Loading categories…</p>
                        )}
                        {categories.filter(c => !c.parent_id).map(parent => {
                          const subcategories = categories.filter(c => c.parent_id === parent.id);
                          const isSelected = selectedCategory === parent.slug;
                          const isChildSelected = subcategories.some(sub => sub.slug === selectedCategory);
                          const isOpen = isSelected || isChildSelected; // Auto-expand if selected

                          return (
                            <div key={parent.id} className="space-y-1">
                              <button
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => {
                                  setFilters({ category: parent.slug });
                                  // Don't close filter immediately if exploring hierarchy
                                }}
                                className={`w-full text-left px-4 py-2 rounded-lg transition-colors flex justify-between items-center ${isSelected
                                  ? 'bg-gray-50 text-gray-900 font-medium'
                                  : 'text-gray-700 hover:bg-gray-100'
                                  }`}
                              >
                                <span>{parent.name}</span>
                              </button>

                              {/* Subcategories */}
                              {subcategories.length > 0 && (
                                <div className="ml-4 border-l-2 border-gray-100 pl-2 space-y-1">
                                  {subcategories.map(child => (
                                    <button
                                      key={child.id}
                                      type="button"
                                      aria-pressed={selectedCategory === child.slug}
                                      onClick={() => {
                                        setFilters({ category: child.slug });
                                        setIsFilterOpen(false);
                                      }}
                                      className={`w-full text-left px-4 py-1.5 rounded-lg text-sm transition-colors ${selectedCategory === child.slug
                                        ? 'text-gray-900 font-medium bg-gray-50'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                        }`}
                                    >
                                      {child.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Price Range */}
                    <div className="border-t border-gray-200 pt-8">
                      <label htmlFor="shop-max-price" className="block font-semibold text-gray-900 mb-4">
                        Max Price: {draftMax >= MAX_PRICE ? 'Any' : `GH₵${draftMax}`}
                      </label>
                      <div className="space-y-4">
                        <input
                          id="shop-max-price"
                          type="range"
                          min="0"
                          max={MAX_PRICE}
                          step="50"
                          value={draftMax}
                          aria-valuetext={draftMax >= MAX_PRICE ? 'Any price' : `GH₵${draftMax}`}
                          onChange={(e) => setDraftMax(parseInt(e.target.value, 10))}
                          onPointerUp={() => draftMax !== maxPrice && setFilters({ max: draftMax })}
                          onKeyUp={() => draftMax !== maxPrice && setFilters({ max: draftMax })}
                          onBlur={() => draftMax !== maxPrice && setFilters({ max: draftMax })}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900"
                        />
                        <div className="flex items-center justify-between text-sm text-gray-600">
                          <span>GH₵0</span>
                          <span>GH₵5000+</span>
                        </div>
                      </div>
                    </div>

                    {/* Rating */}
                    <div className="border-t border-gray-200 pt-8">
                      <h3 className="font-semibold text-gray-900 mb-4">Rating</h3>
                      <div className="space-y-2">
                        {[4, 3, 2, 1].map(rating => (
                          <button
                            key={rating}
                            type="button"
                            aria-pressed={selectedRating === rating}
                            aria-label={`${rating} stars and up`}
                            onClick={() => setFilters({ rating: rating === selectedRating ? 0 : rating })}
                            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${selectedRating === rating
                              ? 'bg-gray-100 text-gray-900'
                              : 'text-gray-700 hover:bg-gray-100'
                              }`}
                          >
                            <div className="flex items-center space-x-2">
                              {[1, 2, 3, 4, 5].map(star => (
                                <i
                                  key={star}
                                  aria-hidden="true"
                                  className={`${star <= rating ? 'ri-star-fill text-amber-400' : 'ri-star-line text-gray-300'} text-sm`}
                                ></i>
                              ))}
                              <span className="text-sm">& Up</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        // Results update as filters change; this closes the panel on phones.
                        setIsFilterOpen(false);
                      }}
                      className="w-full bg-primary hover:bg-primary text-white py-3 rounded-lg font-medium transition-colors whitespace-nowrap"
                    >
                      Show Results
                    </button>
                  </div>
                </div>
              </div>
            </aside>

            <div className="flex-1">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
                <p className="text-gray-600">
                  Showing <span className="font-semibold text-gray-900">{products.length}</span> of <span className="font-semibold text-gray-900">{totalProducts}</span> products
                </p>

                <div className="flex items-center space-x-3">
                  <label htmlFor="shop-sort" className="text-sm text-gray-600 whitespace-nowrap">Sort by:</label>
                  <select
                    id="shop-sort"
                    value={sortBy}
                    onChange={(e) => setFilters({ sort: e.target.value })}
                    className="px-4 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 text-sm bg-white cursor-pointer"
                  >
                    <option value="popular">Most Popular</option>
                    <option value="new">Newest</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="rating">Highest Rated</option>
                  </select>
                </div>
              </div>

              {loadError ? (
                <div className="text-center py-20" role="alert">
                  <div className="w-20 h-20 flex items-center justify-center mx-auto mb-6 bg-gray-100 rounded-full">
                    <i className="ri-wifi-off-line text-4xl text-gray-400" aria-hidden="true"></i>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Couldn&apos;t load products</h3>
                  <p className="text-gray-600 mb-8">Check your connection and try again.</p>
                  <button
                    type="button"
                    onClick={() => setReloadKey((k) => k + 1)}
                    className="inline-flex items-center bg-primary hover:bg-primary text-white px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap"
                  >
                    Try again
                  </button>
                </div>
              ) : loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 lg:gap-8">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-gray-100 rounded-lg sm:rounded-xl aspect-[4/5] animate-pulse" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 lg:gap-8" data-product-shop>
                    {products.map(product => (
                      <ProductCard key={product.id} {...product} density="compact" />
                    ))}
                  </div>

                  {products.length === 0 && (
                    <div className="text-center py-20">
                      <div className="w-20 h-20 flex items-center justify-center mx-auto mb-6 bg-gray-100 rounded-full">
                        <i className="ri-inbox-line text-4xl text-gray-400"></i>
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">No Products Found</h3>
                      <p className="text-gray-600 mb-8">Try adjusting your filters to find what you're looking for</p>
                      <button
                        type="button"
                        onClick={() => setFilters({ category: null, max: null, rating: null, search: null, sort: null })}
                        className="inline-flex items-center bg-primary hover:bg-primary text-white px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap"
                      >
                        Clear All Filters
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-16 flex justify-center">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setFilters({ page: Math.max(1, page - 1) }, false)}
                      disabled={page === 1}
                      aria-label="Previous page"
                      className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <i className="ri-arrow-left-s-line text-xl text-gray-700"></i>
                    </button>

                    {/* Simple page numbers - condensed for brevity */}
                    <span className="px-4 font-medium text-gray-700">
                      Page {page} of {totalPages}
                    </span>

                    <button
                      type="button"
                      onClick={() => setFilters({ page: Math.min(totalPages, page + 1) }, false)}
                      disabled={page >= totalPages}
                      aria-label="Next page"
                      className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <i className="ri-arrow-right-s-line text-xl text-gray-700"></i>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </AnimatedSection>
    </main>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-4 border-gray-900 border-t-transparent rounded-full animate-spin"></div></div>}>
      <ShopContent />
    </Suspense>
  );
}