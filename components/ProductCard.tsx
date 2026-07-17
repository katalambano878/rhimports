'use client';

import { useState } from 'react';
import Link from 'next/link';
import LazyImage from './LazyImage';
import { useCart } from '@/context/CartContext';
import { useCMS } from '@/context/CMSContext';
import { useWishlist } from '@/context/WishlistContext';
import { formatPrice as formatCurrency } from '@/lib/formatCurrency';

const COLOR_MAP: Record<string, string> = {
  black: '#000000', white: '#FFFFFF', red: '#EF4444', blue: '#3B82F6',
  navy: '#1E3A5F', green: '#22C55E', yellow: '#EAB308', orange: '#F97316',
  pink: '#EC4899', purple: '#A855F7', brown: '#92400E', beige: '#D4C5A9',
  grey: '#6B7280', gray: '#6B7280', cream: '#FFFDD0', teal: '#14B8A6',
  maroon: '#800000', coral: '#FF7F50', burgundy: '#800020', olive: '#808000',
  tan: '#D2B48C', khaki: '#C3B091', charcoal: '#36454F', ivory: '#FFFFF0',
  gold: '#FFD700', silver: '#C0C0C0', rose: '#FF007F', lavender: '#E6E6FA',
  mint: '#98FB98', peach: '#FFDAB9', wine: '#722F37', denim: '#1560BD',
  nude: '#E3BC9A', camel: '#C19A6B', sage: '#BCB88A', rust: '#B7410E',
  mustard: '#FFDB58', plum: '#8E4585', lilac: '#C8A2C8', stone: '#928E85',
  sand: '#C2B280', taupe: '#483C32', mauve: '#E0B0FF', sky: '#87CEEB',
  forest: '#228B22', cobalt: '#0047AB', emerald: '#50C878', scarlet: '#FF2400',
  aqua: '#00FFFF', turquoise: '#40E0D0', indigo: '#4B0082', crimson: '#DC143C',
  magenta: '#FF00FF', cyan: '#00FFFF', chocolate: '#7B3F00', coffee: '#6F4E37',
};

export function getColorHex(colorName: string): string | null {
  const lower = colorName.toLowerCase().trim();
  if (COLOR_MAP[lower]) return COLOR_MAP[lower];
  for (const [key, val] of Object.entries(COLOR_MAP)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

export interface ColorVariant {
  name: string;
  hex: string;
}

interface ProductCardProps {
  id: string;
  slug: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  rating?: number;
  reviewCount?: number;
  badge?: string;
  inStock?: boolean;
  isPreorder?: boolean;
  maxStock?: number;
  moq?: number;
  hasVariants?: boolean;
  minVariantPrice?: number;
  colorVariants?: ColorVariant[];
  brand?: string;
  /** Shop mobile 2-column grid: tighter spacing & type */
  density?: 'default' | 'compact';
}

export default function ProductCard({
  id,
  slug,
  name,
  price,
  originalPrice,
  image,
  rating = 0,
  reviewCount = 0,
  badge,
  inStock = true,
  isPreorder = false,
  maxStock = 50,
  moq = 1,
  hasVariants = false,
  minVariantPrice,
  colorVariants = [],
  brand,
  density = 'default',
}: ProductCardProps) {
  const compact = density === 'compact';
  const { addToCart } = useCart();
  const { getSetting } = useCMS();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const currencySymbol = getSetting('currency_symbol') || '$';

  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  const displayPrice = hasVariants && minVariantPrice ? minVariantPrice : price;
  const hasDiscount = !!(originalPrice && originalPrice > displayPrice);
  const discountPct = hasDiscount ? Math.round((1 - displayPrice / (originalPrice || 1)) * 100) : 0;
  const savings = hasDiscount ? (originalPrice! - displayPrice) : 0;
  const inWishlist = isInWishlist(id);
  const lowStock = inStock && maxStock > 0 && maxStock <= 5;
  const MAX_SWATCHES = 5;

  const formatPrice = (val: number) => formatCurrency(val, currencySymbol);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!inStock) return;
    addToCart({ id, name, price: displayPrice, image, quantity: moq, slug, maxStock, moq });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1400);
  };

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (inWishlist) {
      removeFromWishlist(id);
    } else {
      addToWishlist({
        id,
        name,
        price: displayPrice,
        originalPrice,
        image,
        rating,
        reviewCount,
        badge,
        inStock,
        slug,
      });
    }
  };

  return (
    <article
      className={`group relative h-full flex flex-col bg-white transition-all duration-500 hover:-translate-y-1 min-w-0 ${compact ? 'max-sm:hover:translate-y-0' : ''}`}
    >
      {/* ── Image Frame ─────────────────────────────────────────── */}
      <Link
        href={`/product/${slug}`}
        className={`relative block overflow-hidden bg-[radial-gradient(ellipse_at_center,_#fafafa_0%,_#f0f0f0_100%)] rounded-lg sm:rounded-xl ring-1 ring-black/5 transition-shadow duration-500 group-hover:ring-black/10 group-hover:shadow-[0_18px_40px_-18px_rgba(15,26,71,0.25)] ${compact ? 'aspect-[4/5]' : 'aspect-[5/4]'}`}
        aria-label={`View ${name}`}
      >
        <LazyImage
          src={image}
          alt={name}
          className={`w-full h-full object-contain transition-transform duration-700 ease-out group-hover:scale-110 ${compact ? 'p-1.5 sm:p-3' : 'p-3 sm:p-4'}`}
        />

        {/* Badges — top-left, vertical stack so they never overlap.
            Kept extra small on mobile so they don't cover the photo. */}
        <div
          className={`absolute flex flex-col items-start pointer-events-none ${compact ? 'top-1.5 left-1.5 gap-0.5 sm:gap-1' : 'top-1.5 left-1.5 gap-0.5 sm:top-3 sm:left-3 sm:gap-1.5'}`}
        >
          <span
            className={`inline-flex items-center gap-0.5 sm:gap-1 font-bold uppercase tracking-[0.12em] rounded-full shadow-sm text-white ${isPreorder ? 'bg-amber-500' : 'bg-emerald-500'} text-[7px] px-1.5 py-[3px] sm:text-[10px] sm:px-2.5 sm:py-1`}
          >
            <i className={`${isPreorder ? 'ri-time-line' : 'ri-checkbox-circle-line'} text-[8px] sm:text-[11px]`} />
            {isPreorder ? 'Preorder' : 'Available'}
          </span>
          {badge && (
            <span
              className="inline-flex items-center gap-0.5 bg-black/85 backdrop-blur-md text-white font-bold uppercase tracking-[0.12em] rounded-full shadow-sm text-[7px] px-1.5 py-[3px] sm:text-[10px] sm:px-2.5 sm:py-1"
            >
              <span className="rounded-full bg-amber-400 w-0.5 h-0.5 sm:w-1 sm:h-1" />
              {badge}
            </span>
          )}
          {hasDiscount && (
            <span
              className="inline-flex items-center bg-red-500 text-white font-bold uppercase tracking-[0.12em] rounded-full shadow-sm text-[7px] px-1.5 py-[3px] sm:text-[10px] sm:px-2.5 sm:py-1"
            >
              −{discountPct}%
            </span>
          )}
        </div>

        {/* Wishlist heart — top-right, glassmorphic */}
        <button
          type="button"
          onClick={handleWishlist}
          aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
          aria-pressed={inWishlist}
          className={`rounded-full backdrop-blur-md flex items-center justify-center transition-all duration-300 shadow-sm hover:scale-110 active:scale-95 ${
            compact
              ? `absolute top-1.5 right-1.5 w-7 h-7 sm:w-9 sm:h-9 sm:top-3 sm:right-3 max-sm:opacity-100 max-sm:translate-y-0 ${inWishlist ? 'bg-red-500 text-white' : 'bg-white/80 text-gray-700 hover:bg-white hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 sm:translate-y-1 sm:group-hover:translate-y-0'}`
              : `absolute top-3 right-3 w-9 h-9 ${inWishlist ? 'bg-red-500 text-white' : 'bg-white/80 text-gray-700 hover:bg-white hover:text-red-500 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0'}`
          }`}
        >
          <i className={`${inWishlist ? 'ri-heart-fill' : 'ri-heart-line'} ${compact ? 'text-xs sm:text-base' : 'text-base'}`} />
        </button>

        {/* Stock indicator — bottom-right */}
        {inStock && lowStock && (
          <span
            className={`absolute inline-flex items-center gap-0.5 bg-amber-50 text-amber-700 font-bold uppercase ring-amber-200 rounded-full ring-1 ${compact ? 'bottom-1.5 right-1.5 text-[8px] px-1.5 py-0.5 sm:bottom-3 sm:right-3 sm:text-[10px] sm:px-2.5 tracking-wide' : 'bottom-3 right-3 text-[10px] tracking-wider px-2.5 py-1'}`}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
            </span>
            Only {maxStock} left
          </span>
        )}

        {/* Quick view — bottom-left; hidden on compact mobile */}
        {inStock && (
          <span
            className={`absolute bg-white/95 backdrop-blur-md text-gray-900 font-semibold rounded-full shadow-sm opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 items-center ${compact ? 'hidden sm:inline-flex bottom-3 left-3 gap-1.5 text-[11px] px-3 py-1.5' : 'bottom-3 left-3 inline-flex gap-1.5 text-[11px] px-3 py-1.5'}`}
          >
            <i className="ri-eye-line text-sm" />
            Quick view
          </span>
        )}

        {/* Out of stock overlay */}
        {!inStock && (
          <div className="absolute inset-0 bg-white/75 backdrop-blur-[2px] flex items-center justify-center">
            <span className="bg-gray-900 text-white text-[11px] font-bold uppercase tracking-[0.2em] px-4 py-2 rounded-full">
              Sold Out
            </span>
          </div>
        )}
      </Link>

      {/* ── Info ────────────────────────────────────────────────── */}
      <div className={`flex flex-col flex-grow ${compact ? 'pt-1.5 sm:pt-2.5 px-0' : 'pt-2.5 px-0.5'}`}>
        {/* Brand + rating on one line */}
        {(brand || rating > 0) && (
          <div className={`flex items-center justify-between gap-1 ${compact ? 'mb-0.5' : 'mb-1'}`}>
            {brand ? (
              <p
                className={`font-bold uppercase text-gray-400 truncate ${compact ? 'text-[8px] sm:text-[10px] tracking-[0.12em] sm:tracking-[0.16em]' : 'text-[10px] tracking-[0.16em]'}`}
              >
                {brand}
              </p>
            ) : <span />}
            {rating > 0 && (
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <i className={`ri-star-fill text-amber-400 ${compact ? 'text-[9px] sm:text-[11px]' : 'text-[11px]'}`} />
                <span className={`text-gray-500 font-medium ${compact ? 'text-[9px] sm:text-[11px]' : 'text-[11px]'}`}>
                  {rating.toFixed(1)}{reviewCount > 0 ? ` (${reviewCount})` : ''}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Name */}
        <Link href={`/product/${slug}`} className={compact ? 'mb-1 sm:mb-1.5' : 'mb-1.5'}>
          <h3
            className={`font-serif leading-snug text-gray-900 line-clamp-2 transition-colors group-hover:text-primary ${compact ? 'text-[11px] sm:text-[15px]' : 'text-sm sm:text-[15px]'}`}
          >
            {name}
          </h3>
        </Link>

        {/* Color swatches */}
        {colorVariants.length > 0 && (
          <div className={`flex items-center ${compact ? 'gap-1 mb-1' : 'gap-1.5 mb-1.5'}`}>
            {colorVariants.slice(0, MAX_SWATCHES).map((color) => (
              <button
                key={color.name}
                title={color.name}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveColor(activeColor === color.name ? null : color.name);
                }}
                className={`relative rounded-full transition-all duration-200 flex-shrink-0 ${compact ? 'w-3 h-3 sm:w-4 sm:h-4' : 'w-4 h-4'} ${
                  activeColor === color.name
                    ? 'ring-2 ring-offset-1 ring-gray-900 scale-110'
                    : 'ring-1 ring-black/10 hover:scale-110 hover:ring-gray-400'
                }`}
                style={{ backgroundColor: color.hex }}
                aria-label={`Color: ${color.name}`}
              />
            ))}
            {colorVariants.length > MAX_SWATCHES && (
              <span className={`text-gray-400 ml-0.5 font-medium ${compact ? 'text-[8px] sm:text-[10px]' : 'text-[10px]'}`}>
                +{colorVariants.length - MAX_SWATCHES}
              </span>
            )}
          </div>
        )}

        {/* Price block */}
        <div className={`mt-auto ${compact ? 'mb-1 sm:mb-2' : 'mb-2'}`}>
          <div
            className={`flex flex-wrap ${compact ? 'flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2' : 'items-baseline gap-2'}`}
          >
            <span
              className={`font-sans font-bold text-gray-900 tracking-tight leading-none ${compact ? 'text-xs sm:text-lg' : 'text-base sm:text-lg'}`}
            >
              {hasVariants && minVariantPrice != null ? `From ${formatPrice(minVariantPrice)}` : formatPrice(displayPrice)}
            </span>
            {hasDiscount && (
              <span className={`text-gray-400 line-through font-medium ${compact ? 'text-[10px] sm:text-xs' : 'text-xs'}`}>
                {formatPrice(originalPrice!)}
              </span>
            )}
            {hasDiscount && (
              <span
                className={`font-semibold text-emerald-600 tracking-wide ${compact ? 'text-[9px] sm:text-[10px] sm:ml-auto' : 'text-[10px] ml-auto'}`}
              >
                Save {formatPrice(savings)}
              </span>
            )}
          </div>
        </div>

        {/* CTA */}
        {hasVariants ? (
          <Link
            href={`/product/${slug}`}
            className={`group/btn relative w-full flex items-center justify-center bg-white border border-gray-900 text-gray-900 font-semibold rounded-full overflow-hidden transition-colors hover:bg-gray-900 hover:text-white ${compact ? 'gap-1 py-1.5 px-2 text-[10px] sm:gap-2 sm:py-2 sm:px-3 sm:text-xs' : 'gap-2 py-2 px-3 text-xs'}`}
          >
            <i className={`ri-settings-3-line transition-transform group-hover/btn:rotate-90 ${compact ? 'text-sm sm:text-base' : 'text-base'}`} />
            <span className={compact ? 'truncate' : ''}>Select Options</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!inStock}
            className={`group/btn relative w-full flex items-center justify-center font-semibold rounded-full overflow-hidden transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${
              justAdded
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-900 text-white hover:bg-primary'
            } ${compact ? 'gap-1 py-1.5 px-2 text-[10px] sm:gap-2 sm:py-2 sm:px-3 sm:text-xs' : 'gap-2 py-2 px-3 text-xs'}`}
          >
            {justAdded ? (
              <>
                <i className={`ri-check-line ${compact ? 'text-sm sm:text-base' : 'text-base'}`} />
                <span>Added</span>
              </>
            ) : (
              <>
                <i className={`ri-shopping-bag-line transition-transform group-hover/btn:-translate-y-0.5 ${compact ? 'text-sm sm:text-base' : 'text-base'}`} />
                <span>Add to cart</span>
                <i className={`ri-arrow-right-line opacity-0 -ml-2 transition-all duration-300 group-hover/btn:opacity-100 group-hover/btn:ml-0 ${compact ? 'hidden sm:inline text-base' : 'text-base'}`} />
              </>
            )}
          </button>
        )}
      </div>
    </article>
  );
}
