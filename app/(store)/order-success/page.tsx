'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect, useCallback } from 'react';

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 150 150%27%3E%3Crect width=%27150%27 height=%27150%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M50 95l18-22 14 16 10-12 18 18z%27 fill=%27%23d1d5db%27/%3E%3Ccircle cx=%2760%27 cy=%2758%27 r=%278%27 fill=%27%23d1d5db%27/%3E%3C/svg%3E";

const PREORDER_MIN_DAYS = 45;
const PREORDER_MAX_DAYS = 60;

const formatDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const addDays = (base: Date, days: number) => {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
};

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

async function fetchSummary(ref: string): Promise<{ state: LoadState; order?: any }> {
  try {
    const res = await fetch(`/api/storefront/orders/${encodeURIComponent(ref)}/summary`, { cache: 'no-store' });
    if (res.status === 404 || res.status === 400) return { state: 'not-found' };
    if (!res.ok) return { state: 'error' };
    const { order } = await res.json();
    return order ? { state: 'ready', order } : { state: 'not-found' };
  } catch {
    return { state: 'error' };
  }
}

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams?.get('order') || searchParams?.get('orderNumber');
  const paymentSuccess = searchParams?.get('payment_success');
  const [order, setOrder] = useState<any>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [verifying, setVerifying] = useState(false);

  // Never trust the redirect alone: if the order is not marked paid yet,
  // poll and then ask the gateway before showing a confirmation.
  const verifyPayment = useCallback(async (orderNum: string, orderEmail: string | null) => {
    setVerifying(true);
    try {
      for (const delay of [3000, 4000, 5000]) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        const refreshed = await fetchSummary(orderNum);
        if (refreshed.order?.payment_status === 'paid') {
          setOrder(refreshed.order);
          return;
        }
      }
      const res = await fetch('/api/payment/hubtel/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: orderNum, email: orderEmail || undefined }),
      });
      const result = await res.json().catch(() => null);
      if (result?.success && result.payment_status === 'paid') {
        const updated = await fetchSummary(orderNum);
        if (updated.order) setOrder(updated.order);
      }
    } catch (err) {
      console.error('Payment verification failed:', err);
    } finally {
      setVerifying(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (!orderNumber) {
      setState('not-found');
      return;
    }
    setState('loading');
    const result = await fetchSummary(orderNumber);
    setOrder(result.order || null);
    setState(result.state);
    const o = result.order;
    if (o && o.payment_status !== 'paid' && (paymentSuccess === 'true' || o.metadata?.hubtel_client_reference)) {
      verifyPayment(o.order_number || orderNumber, o.email || null);
    }
  }, [orderNumber, paymentSuccess, verifyPayment]);

  useEffect(() => {
    load();
  }, [load]);

  if (state === 'loading' || verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4" role="status" aria-live="polite">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-gray-900 animate-spin mb-4 block" aria-hidden="true"></i>
          <p className="text-gray-700 font-semibold">
            {verifying ? 'Checking your payment…' : 'Loading order details…'}
          </p>
          {verifying && (
            <p className="mt-2 text-sm text-gray-500">This can take a few seconds. Please don&apos;t close this page.</p>
          )}
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center" role="alert">
          <i className="ri-wifi-off-line text-4xl text-gray-400 mb-4 block" aria-hidden="true"></i>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Couldn&apos;t load your order</h1>
          <p className="text-gray-600 mb-6">Check your connection and try again.</p>
          <button
            type="button"
            onClick={load}
            className="bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <i className="ri-error-warning-line text-4xl text-red-500 mb-4 block" aria-hidden="true"></i>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Order Not Found</h1>
          <p className="text-gray-600 mb-6">We couldn&apos;t find that order. Check the link in your order email or track your order.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/order-tracking" className="text-gray-900 font-semibold hover:underline">
              Track an order
            </Link>
            <Link href="/shop" className="text-gray-900 font-semibold hover:underline">
              Return to Shop
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const items: any[] = order.order_items || [];
  const createdAt = new Date(order.created_at);
  const orderDate = formatDate(createdAt);
  const isPaid = order.payment_status === 'paid';
  const isClosed = ['cancelled', 'refunded'].includes(order.status) || ['refunded', 'partially_refunded'].includes(order.payment_status);
  const isPreorderItem = (item: any) => !!(item.metadata?.preorder_shipping || item.metadata?.is_preorder);
  const hasPreorder = items.some(isPreorderItem);
  const payLink = `/pay/${encodeURIComponent(order.order_number || order.id)}`;

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 md:p-12 text-center mb-8">
            {isPaid ? (
              <>
                <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 bg-gray-100 rounded-full">
                  <i className="ri-checkbox-circle-fill text-6xl text-gray-700" aria-hidden="true"></i>
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Order Confirmed</h1>
                <p className="text-lg sm:text-xl text-gray-600 mb-8">
                  {hasPreorder
                    ? 'Thank you. Your payment went through and we have started sourcing your order.'
                    : 'Thank you. Your payment went through and we are preparing your order.'}
                </p>
              </>
            ) : isClosed ? (
              <>
                <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 bg-gray-100 rounded-full">
                  <i className="ri-close-circle-line text-6xl text-gray-500" aria-hidden="true"></i>
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                  {order.status === 'cancelled' ? 'Order cancelled' : 'Order refunded'}
                </h1>
                <p className="text-lg text-gray-600 mb-8">If you have questions about this order, please contact us.</p>
              </>
            ) : (
              <>
                <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6 bg-amber-100 rounded-full">
                  <i className="ri-error-warning-fill text-6xl text-amber-600" aria-hidden="true"></i>
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Payment not completed</h1>
                <p className="text-lg sm:text-xl text-gray-600 mb-6">
                  {order.payment_status === 'failed'
                    ? 'Your payment did not go through, so we have not started on this order yet.'
                    : 'We have not received payment for this order yet. If you just paid, it can take a minute to show here.'}
                </p>
                <Link
                  href={payLink}
                  className="mb-8 inline-flex items-center justify-center rounded-lg bg-primary hover:bg-primary-dark px-8 py-4 font-semibold text-white transition-colors"
                >
                  <i className="ri-secure-payment-line mr-2" aria-hidden="true"></i>
                  Complete payment
                </Link>
              </>
            )}

            <dl className="bg-gray-50 rounded-xl p-6 mb-8 grid md:grid-cols-3 gap-6 text-center">
              <div>
                <dt className="text-sm text-gray-600 mb-1">Order Number</dt>
                <dd className="text-lg font-bold text-gray-900 break-all">{order.order_number}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-600 mb-1">Order Date</dt>
                <dd className="text-lg font-bold text-gray-900">{orderDate}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-600 mb-1">Estimated Delivery</dt>
                {hasPreorder ? (
                  <dd>
                    <p className="text-lg font-bold text-gray-900">{PREORDER_MIN_DAYS} – {PREORDER_MAX_DAYS} days</p>
                    <p className="text-xs text-gray-500 mt-1 leading-snug">
                      Preorder: around {formatDate(addDays(createdAt, PREORDER_MIN_DAYS))} – {formatDate(addDays(createdAt, PREORDER_MAX_DAYS))}
                    </p>
                  </dd>
                ) : (
                  <dd>
                    <p className="text-lg font-bold text-gray-900">1 – 3 business days</p>
                    <p className="text-xs text-gray-500 mt-1 leading-snug">in Accra after payment; longer for other areas</p>
                  </dd>
                )}
              </div>
            </dl>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <Link
                href="/account?tab=orders"
                className="bg-primary hover:bg-primary text-white px-8 py-4 rounded-lg font-semibold transition-colors inline-flex items-center justify-center whitespace-nowrap"
              >
                <i className="ri-file-list-3-line mr-2" aria-hidden="true"></i>
                View Order
              </Link>
              <Link
                href="/shop"
                className="border-2 border-gray-300 hover:border-gray-400 text-gray-700 px-8 py-4 rounded-lg font-semibold transition-colors inline-flex items-center justify-center whitespace-nowrap"
              >
                <i className="ri-shopping-bag-line mr-2" aria-hidden="true"></i>
                Continue Shopping
              </Link>
            </div>

            <p className="text-sm text-gray-500">
              Want to see your orders in one place?{' '}
              <Link href="/auth/signup" className="font-semibold text-gray-900 hover:underline">
                Create an account
              </Link>{' '}
              with the same email.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Order Items</h2>
              <ul className="space-y-4">
                {items.map((item: any) => (
                  <li key={item.id} className="flex items-center gap-4">
                    <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                      <img
                        src={item.metadata?.image || PLACEHOLDER_IMAGE}
                        alt={item.product_name}
                        className="w-full h-full object-cover object-center"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 line-clamp-2">{item.product_name}</p>
                      <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                      {item.variant_name && (
                        <p className="text-xs text-gray-500">{item.variant_name}</p>
                      )}
                      {isPreorderItem(item) && (
                        <p className="text-xs text-amber-700 bg-amber-50 inline-flex items-center gap-1 px-2 py-0.5 rounded mt-1 border border-amber-200">
                          <i className="ri-time-line" aria-hidden="true"></i> {item.metadata?.preorder_shipping || 'Preorder'}
                        </p>
                      )}
                    </div>
                    <p className="font-bold text-gray-900">GH₵{Number(item.unit_price).toFixed(2)}</p>
                  </li>
                ))}
              </ul>
              <div className="border-t border-gray-200 mt-4 pt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Subtotal</span>
                  <span>GH₵{Number(order.subtotal).toFixed(2)}</span>
                </div>
                {Number(order.discount_total) > 0 && (
                  <div className="flex justify-between text-sm text-emerald-700 mb-2">
                    <span>Discount</span>
                    <span>− GH₵{Number(order.discount_total).toFixed(2)}</span>
                  </div>
                )}
                <div className="mb-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Delivery</span>
                    <span className="text-amber-600 font-semibold">
                      {Number(order.shipping_total) > 0 ? `GH₵${Number(order.shipping_total).toFixed(2)}` : 'At a cost'}
                    </span>
                  </div>
                  {!(Number(order.shipping_total) > 0) && (
                    <p className="text-xs text-gray-500 mt-1">Our team will contact you with the delivery cost.</p>
                  )}
                </div>

                <div className="flex justify-between text-xl font-bold text-gray-900 border-t border-gray-200 pt-2">
                  <span>{isPaid ? 'Total Paid' : 'Order Total'}</span>
                  <span>GH₵{Number(order.total).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Delivery Details</h2>
              <div className="space-y-3">
                {order.shipping_address && (
                  <>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Recipient</p>
                      <p className="font-semibold text-gray-900">
                        {order.shipping_address.firstName} {order.shipping_address.lastName}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Address</p>
                      {order.shipping_address.address && <p className="text-gray-900">{order.shipping_address.address}</p>}
                      <p className="text-gray-900">
                        {[order.shipping_address.city, order.shipping_address.region].filter(Boolean).join(', ')}
                      </p>
                    </div>
                    {order.phone && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Phone</p>
                        <p className="text-gray-900">{order.phone}</p>
                      </div>
                    )}
                    {order.email && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Email</p>
                        <p className="text-gray-900 break-all">{order.email}</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-3">What&apos;s Next?</h3>
                <ul className="space-y-3">
                  {isPaid ? (
                    <>
                      <li className="flex items-start gap-3">
                        <i className="ri-mail-line text-gray-900 mt-1" aria-hidden="true"></i>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Order updates</p>
                          <p className="text-sm text-gray-600">We send updates to your email and phone.</p>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <i className="ri-box-3-line text-gray-900 mt-1" aria-hidden="true"></i>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{hasPreorder ? 'Sourcing' : 'Processing'}</p>
                          <p className="text-sm text-gray-600">
                            {hasPreorder
                              ? `Preorder items are bought abroad and shipped to Ghana, usually ${PREORDER_MIN_DAYS} – ${PREORDER_MAX_DAYS} days from your order date.`
                              : 'We prepare your order for delivery.'}
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <i className="ri-truck-line text-gray-900 mt-1" aria-hidden="true"></i>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Delivery</p>
                          <p className="text-sm text-gray-600">Our team contacts you to arrange delivery and its cost.</p>
                        </div>
                      </li>
                    </>
                  ) : (
                    <li className="flex items-start gap-3">
                      <i className="ri-secure-payment-line text-gray-900 mt-1" aria-hidden="true"></i>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Payment first</p>
                        <p className="text-sm text-gray-600">We start on your order once payment is received.</p>
                      </div>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-gray-600 mb-4">Need help with your order?</p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/contact" className="text-gray-900 hover:text-gray-900 font-semibold whitespace-nowrap">
                <i className="ri-customer-service-line mr-1" aria-hidden="true"></i>
                Contact Support
              </Link>
              <Link href="/order-tracking" className="text-gray-900 hover:text-gray-900 font-semibold whitespace-nowrap">
                <i className="ri-map-pin-line mr-1" aria-hidden="true"></i>
                Track Order
              </Link>
              <Link href="/returns" className="text-gray-900 hover:text-gray-900 font-semibold whitespace-nowrap">
                <i className="ri-arrow-left-right-line mr-1" aria-hidden="true"></i>
                Returns Policy
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" role="status">
        <div className="w-16 h-16 border-4 border-gray-900 border-t-transparent rounded-full animate-spin"></div>
        <span className="sr-only">Loading…</span>
      </div>
    }>
      <OrderSuccessContent />
    </Suspense>
  );
}
