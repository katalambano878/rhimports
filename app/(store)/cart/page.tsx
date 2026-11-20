'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useCart } from '@/context/CartContext';
import PageHero from '@/components/PageHero';
import { HERO_IMAGES_OTHER_PAGES } from '@/lib/hero-images';
import { usePageTitle } from '@/hooks/usePageTitle';
import AnimatedSection from '@/components/AnimatedSection';

const NO_IMAGE =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23f3f4f6%27/%3E%3C/svg%3E";

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function CartPage() {
  usePageTitle('Shopping Cart');
  const { cart: cartItems, removeFromCart, updateQuantity, ready, refreshCart } = useCart();
  const [cartChanges, setCartChanges] = useState<string[]>([]);

  // Re-read current prices and stock once the saved cart has loaded.
  useEffect(() => {
    if (!ready) return;
    let active = true;
    refreshCart().then((changes) => {
      if (active && changes && changes.length > 0) setCartChanges(changes.map((c) => c.message));
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Same sums as checkout: items only. Delivery is quoted by the team and
  // coupons are entered at checkout.
  const subtotal = round2(cartItems.reduce((sum, item) => sum + round2(item.price) * item.quantity, 0));
  const total = subtotal;
  const hasPreorder = cartItems.some((item) => item.preorder);

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHero title="Shopping Cart" backgroundImage={HERO_IMAGES_OTHER_PAGES[6]} />
      <div className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {cartChanges.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
            <p className="font-semibold">Your cart was updated</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {cartChanges.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        {!ready ? (
          <div className="flex justify-center py-24" role="status" aria-live="polite">
            <i className="ri-loader-4-line animate-spin text-4xl text-gray-500" aria-hidden="true"></i>
            <span className="sr-only">Loading your cart…</span>
          </div>
        ) : cartItems.length === 0 ? (
          <AnimatedSection className="py-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
              <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 bg-gray-200 rounded-full">
                <i className="ri-shopping-cart-line text-5xl text-gray-400" aria-hidden="true"></i>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Your cart is empty</h2>
              <p className="text-gray-600 mb-8 text-lg">Looks like you haven&apos;t added anything to your cart yet</p>
              <Link href="/shop" className="inline-block bg-primary hover:bg-primary text-white px-8 py-4 rounded-lg font-semibold transition-all hover:-translate-y-1 hover:shadow-lg whitespace-nowrap">
                Continue Shopping
              </Link>
            </div>
          </AnimatedSection>
        ) : (
          <AnimatedSection direction="up" delay={0.05} className="py-12">
            <div className="max-w-7xl mx-auto px-0 sm:px-6">
              <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 overflow-hidden hover-lift">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-bold text-gray-900">Cart Items ({cartItems.length})</h2>
                    </div>

                    <div className="space-y-6">
                      {cartItems.map((item) => {
                        const minQty = item.moq || 1;
                        const atMax = item.quantity >= item.maxStock;
                        return (
                          <div key={`${item.id}-${item.variantId || item.variant || ''}`} className="flex flex-col sm:flex-row gap-4 sm:gap-6 pb-6 border-b border-gray-200 last:border-0 last:pb-0">
                            <Link href={`/product/${item.slug || item.id}`} className="relative w-full sm:w-32 h-48 sm:h-32 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden" aria-label={`View ${item.name}`}>
                              <Image src={item.image || NO_IMAGE} alt={item.name} fill className="object-cover object-top" sizes="(max-width: 640px) 100vw, 128px" quality={70} unoptimized={!item.image} />
                            </Link>

                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between gap-2 mb-2">
                                <Link href={`/product/${item.slug || item.id}`} className="text-lg font-semibold text-gray-900 hover:text-gray-900 transition-colors line-clamp-2">
                                  {item.name}
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => removeFromCart(item.id, item.variant, item.variantId)}
                                  className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-gray-400 hover:text-red-600 transition-colors"
                                  aria-label={`Remove ${item.name} from cart`}
                                >
                                  <i className="ri-close-line text-xl" aria-hidden="true"></i>
                                </button>
                              </div>

                              <div className="text-sm text-gray-600 mb-3 space-y-1">
                                {item.variant && <p>Variant: {item.variant}</p>}
                                {item.preorder && <p className="text-amber-700 font-medium">Preorder · usually 45 – 60 days</p>}
                              </div>

                              <div className="flex items-center justify-between flex-wrap gap-4">
                                <div className="flex items-baseline space-x-3">
                                  <span className="text-xl font-bold text-gray-900">GH₵{item.price.toFixed(2)}</span>
                                </div>

                                <div className="flex flex-col">
                                  <div className="flex items-center border-2 border-gray-300 rounded-lg">
                                    <button
                                      type="button"
                                      onClick={() => updateQuantity(item.id, item.quantity - 1, item.variant, item.variantId)}
                                      className="w-10 h-10 flex items-center justify-center text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                                      aria-label={item.quantity <= minQty ? `Remove ${item.name} from cart` : `Decrease quantity of ${item.name}`}
                                    >
                                      {item.quantity <= minQty ? (
                                        <i className="ri-delete-bin-line text-red-500" aria-hidden="true"></i>
                                      ) : (
                                        <i className="ri-subtract-line" aria-hidden="true"></i>
                                      )}
                                    </button>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      value={item.quantity}
                                      onChange={(e) => {
                                        const n = parseInt(e.target.value, 10);
                                        // Typing never removes a line; use the remove button for that.
                                        updateQuantity(item.id, Number.isFinite(n) ? Math.max(n, minQty) : minQty, item.variant, item.variantId);
                                      }}
                                      className="w-12 h-10 text-center border-x-2 border-gray-300 focus:outline-none font-semibold"
                                      min={minQty}
                                      max={item.maxStock}
                                      aria-label={`Quantity of ${item.name}`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateQuantity(item.id, item.quantity + 1, item.variant, item.variantId)}
                                      disabled={atMax}
                                      className="w-10 h-10 flex items-center justify-center text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                      aria-label={`Increase quantity of ${item.name}`}
                                    >
                                      <i className="ri-add-line" aria-hidden="true"></i>
                                    </button>
                                  </div>
                                  {minQty > 1 && (
                                    <span className="text-xs text-amber-600 mt-1">
                                      Min. order: {minQty} units
                                    </span>
                                  )}
                                  {atMax && !item.preorder && (
                                    <span className="text-xs text-amber-600 mt-1">Only {item.maxStock} available</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white rounded-xl shadow-sm p-6 sticky top-24">
                    <h3 className="text-xl font-bold text-gray-900 mb-6">Order Summary</h3>

                    <div className="space-y-4 mb-6">
                      <div className="flex justify-between text-gray-700">
                        <span>Subtotal</span>
                        <span className="font-semibold">GH₵{subtotal.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between text-gray-700">
                        <span>Delivery</span>
                        <span className="font-semibold text-amber-600">At a cost</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Delivery is not included. Our team will contact you with the delivery cost. Have a coupon? Enter it at checkout.
                      </p>
                    </div>

                    <div className="border-t border-gray-200 pt-4 mb-6">
                      <div className="flex justify-between text-xl font-bold text-gray-900">
                        <span>Total</span>
                        <span>GH₵{total.toFixed(2)}</span>
                      </div>
                    </div>

                    {hasPreorder && (
                      <p className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        Preorder items are sourced abroad after you order and usually arrive 45 – 60 days after the order is placed.
                      </p>
                    )}

                    <Link
                      href="/checkout"
                      className="block w-full bg-primary hover:bg-primary text-white py-4 rounded-lg font-semibold text-center transition-colors mt-2 mb-3 whitespace-nowrap"
                    >
                      Proceed to Checkout
                    </Link>

                    <Link
                      href="/shop"
                      className="block w-full text-center text-gray-900 hover:text-gray-900 font-semibold py-2 whitespace-nowrap"
                    >
                      Continue Shopping
                    </Link>

                    <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
                      <div className="flex items-center text-sm text-gray-600">
                        <i className="ri-shield-check-line text-gray-900 mr-2" aria-hidden="true"></i>
                        <span>Secure payment with Hubtel</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <i className="ri-customer-service-line text-gray-900 mr-2" aria-hidden="true"></i>
                        <span>
                          Questions? <Link href="/contact" className="underline hover:text-gray-900">Contact us</Link>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </AnimatedSection>
        )}
      </div>
    </div>
  );
}
