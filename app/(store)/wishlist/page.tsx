'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useWishlist, type WishlistItem } from '@/context/WishlistContext';
import { useCart, sellableStock, isPreorderProduct } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import PageHero from '@/components/PageHero';
import AnimatedSection from '@/components/AnimatedSection';
import { HERO_IMAGES_OTHER_PAGES } from '@/lib/hero-images';
import { usePageTitle } from '@/hooks/usePageTitle';

/** Current catalogue data for a saved item. */
type LiveInfo = {
  price: number;
  compareAt?: number;
  stock: number;
  moq: number;
  hasVariants: boolean;
  minVariantPrice?: number;
  preorder: boolean;
};

const NO_IMAGE =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23f3f4f6%27/%3E%3C/svg%3E";

async function loadLiveInfo(ids: string[]): Promise<Map<string, LiveInfo> | null> {
  if (ids.length === 0) return new Map();
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, price, compare_at_price, quantity, track_quantity, continue_selling, moq, metadata, product_variants(id, price, quantity)')
      .eq('status', 'active')
      .in('id', ids);
    if (error) return null;
    const map = new Map<string, LiveInfo>();
    for (const p of (data || []) as any[]) {
      const variants = p.product_variants || [];
      const hasVariants = variants.length > 0;
      const raw = hasVariants
        ? variants.reduce((sum: number, v: any) => sum + (Number(v.quantity) || 0), 0)
        : Number(p.quantity) || 0;
      map.set(p.id, {
        price: Number(p.price),
        compareAt: p.compare_at_price != null ? Number(p.compare_at_price) : undefined,
        stock: sellableStock(raw, p),
        moq: Math.max(1, Number(p.moq) || 1),
        hasVariants,
        minVariantPrice: hasVariants ? Math.min(...variants.map((v: any) => Number(v.price ?? p.price))) : undefined,
        preorder: isPreorderProduct(p),
      });
    }
    return map;
  } catch {
    return null;
  }
}

export default function WishlistPage() {
  usePageTitle('Wishlist');
  const { wishlist, removeFromWishlist, clearWishlist, ready } = useWishlist();
  const { addToCart } = useCart();
  const [live, setLive] = useState<Map<string, LiveInfo> | null>(null);
  const [liveFailed, setLiveFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const idsKey = wishlist.map((i) => i.id).sort().join(',');

  // Show current prices and stock, not the ones saved when the item was liked.
  useEffect(() => {
    if (!ready) return;
    let active = true;
    loadLiveInfo(wishlist.map((i) => i.id)).then((map) => {
      if (!active) return;
      setLive(map);
      setLiveFailed(map === null);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, ready, reloadKey]);

  const handleMoveToCart = async (item: WishlistItem) => {
    setBusyId(item.id);
    setMessage(null);
    // Re-read right before adding so the bag gets today's price and stock.
    const fresh = await loadLiveInfo([item.id]);
    setBusyId(null);
    if (!fresh) {
      setMessage("We couldn't check this item just now. Please try again.");
      return;
    }
    const info = fresh.get(item.id);
    if (!info || info.stock < info.moq) {
      setMessage(`${item.name} is not available right now.`);
      return;
    }
    if (info.hasVariants) return; // handled by the "Choose options" link
    addToCart({
      id: item.id,
      name: item.name,
      price: info.price,
      image: item.image,
      quantity: info.moq,
      slug: item.slug || item.id,
      maxStock: info.stock,
      moq: info.moq,
      preorder: info.preorder,
    });
    removeFromWishlist(item.id);
  };

  const handleClear = () => {
    if (window.confirm(`Remove all ${wishlist.length} item${wishlist.length === 1 ? '' : 's'} from your wishlist?`)) {
      clearWishlist();
    }
  };

  const hasItems = wishlist.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHero
        title="Your Wishlist"
        subtitle="Save items you love and move them to your cart when you're ready."
        backgroundImage={HERO_IMAGES_OTHER_PAGES[6]}
      />

      <div className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {!ready ? (
          <div className="py-20 text-center text-gray-500" role="status">
            <i className="ri-loader-4-line text-3xl animate-spin inline-block mb-2" aria-hidden="true"></i>
            <p>Loading your wishlist…</p>
          </div>
        ) : !hasItems ? (
          <AnimatedSection className="py-20">
            <div className="max-w-2xl mx-auto text-center">
              <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 bg-gray-200 rounded-full">
                <i className="ri-heart-3-line text-5xl text-gray-400" aria-hidden="true"></i>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-4">Your wishlist is empty</h1>
              <p className="text-gray-600 mb-8 text-lg">
                Start exploring our collection and add items you like to your wishlist.
              </p>
              <Link
                href="/shop"
                className="inline-block bg-primary hover:bg-primary text-white px-8 py-4 rounded-lg font-semibold transition-all hover:-translate-y-1 hover:shadow-lg whitespace-nowrap"
              >
                Browse Products
              </Link>
            </div>
          </AnimatedSection>
        ) : (
          <AnimatedSection direction="up" delay={0.05} className="py-8">
            <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Wishlist</h1>
                <p className="text-gray-600 mt-1">
                  You have <span className="font-semibold">{wishlist.length}</span> item
                  {wishlist.length > 1 ? 's' : ''} saved for later.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/cart"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-800 hover:bg-gray-100"
                >
                  Go to Cart
                </Link>
                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Clear Wishlist
                </button>
              </div>
            </div>

            {liveFailed && (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
                <span>Couldn&apos;t load current prices and stock. The prices shown are from when you saved each item.</span>
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold hover:bg-amber-100"
                >
                  Try again
                </button>
              </div>
            )}

            {message && (
              <p className="mb-6 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700" role="status">
                {message}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {wishlist.map((item) => {
                const info = live?.get(item.id);
                const missing = !!live && !info;
                const price = info ? (info.hasVariants && info.minVariantPrice != null ? info.minVariantPrice : info.price) : item.price;
                const compareAt = info ? info.compareAt : item.originalPrice;
                const available = info ? info.stock >= info.moq : missing ? false : item.inStock;
                const needsOptions = info ? info.hasVariants : !!item.hasVariants;
                const statusText = !available
                  ? 'Currently unavailable'
                  : info?.preorder
                    ? 'Preorder'
                    : 'Available';
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 flex gap-4 sm:gap-6"
                  >
                    <Link
                      href={`/product/${item.slug}`}
                      className="relative w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100"
                      aria-label={`View ${item.name}`}
                    >
                      <Image
                        src={item.image || NO_IMAGE}
                        alt={item.name}
                        fill
                        sizes="112px"
                        className="object-cover object-top"
                        unoptimized={!item.image}
                      />
                    </Link>

                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <Link
                          href={`/product/${item.slug}`}
                          className="text-base sm:text-lg font-semibold text-gray-900 hover:text-gray-900 line-clamp-2"
                        >
                          {item.name}
                        </Link>
                        <p className="mt-1 text-sm text-gray-500">{statusText}</p>
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-lg font-bold text-gray-900">
                            {needsOptions && info?.minVariantPrice != null ? 'From ' : ''}GH₵{price.toFixed(2)}
                          </span>
                          {compareAt && compareAt > price && (
                            <span className="text-sm text-gray-500 line-through">
                              GH₵{compareAt.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        {needsOptions && available ? (
                          <Link
                            href={`/product/${item.slug}`}
                            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark"
                          >
                            Choose options
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleMoveToCart(item)}
                            disabled={!available || busyId === item.id}
                            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {busyId === item.id ? 'Checking…' : 'Move to Cart'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeFromWishlist(item.id)}
                          className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-800 hover:bg-gray-100"
                          aria-label={`Remove ${item.name} from wishlist`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </AnimatedSection>
        )}
      </div>
    </div>
  );
}
