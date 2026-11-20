'use client';

import Link from 'next/link';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 150 150%27%3E%3Crect width=%27150%27 height=%27150%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M50 95l18-22 14 16 10-12 18 18z%27 fill=%27%23d1d5db%27/%3E%3C/svg%3E";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Order received', color: 'bg-amber-100 text-amber-800' },
  awaiting_payment: { label: 'Awaiting payment', color: 'bg-amber-100 text-amber-800' },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-800' },
  shipped: { label: 'On the way', color: 'bg-purple-100 text-purple-800' },
  delivered: { label: 'Delivered', color: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  refunded: { label: 'Refunded', color: 'bg-gray-200 text-gray-800' },
};

const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Not paid yet',
  paid: 'Paid',
  failed: 'Payment failed',
  refunded: 'Refunded',
  partially_refunded: 'Partly refunded',
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function OrderTrackingContent() {
  usePageTitle('Track Order');
  const searchParams = useSearchParams();
  // Pre-fill the order number from the URL, but never search without a second detail.
  const [orderNumber, setOrderNumber] = useState(searchParams?.get('order') || '');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    const orderNum = orderNumber.trim();
    const emailVal = email.trim();
    const phoneVal = phone.replace(/[\s-]/g, '');

    if (!orderNum) {
      setError('Enter your order number.');
      return;
    }
    if (!emailVal && !phoneVal) {
      setError('Also enter the email or phone number you used at checkout.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/storefront/orders/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: orderNum,
          email: emailVal || undefined,
          phone: phoneVal || undefined,
        }),
      });

      if (res.status === 429) {
        setError('Too many searches. Please wait a moment and try again.');
        return;
      }
      if (res.status === 404) {
        setError('No order found. Check the order number and the email or phone, then try again.');
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Couldn't search right now. Please try again.");
        return;
      }
      const found = Array.isArray(body.orders) ? body.orders[0] : body.order;
      if (!found) {
        setError('No order found. Check the order number and the email or phone, then try again.');
        return;
      }
      setOrder(found);
    } catch {
      setError("Couldn't search right now. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetSearch = () => {
    setOrder(null);
    setError('');
  };

  if (!order) {
    return (
      <main className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Track Your Order</h1>
            <p className="text-gray-600">Enter your order number and the email or phone you used at checkout.</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8">
            <form onSubmit={handleTrack} className="space-y-6" noValidate>
              <div>
                <label htmlFor="track-order-number" className="block text-sm font-semibold text-gray-900 mb-2">
                  Order number *
                </label>
                <input
                  id="track-order-number"
                  type="text"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  required
                  aria-describedby="track-order-number-help"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                  placeholder="e.g. ORD-1770328211911-915"
                />
                <p id="track-order-number-help" className="mt-1 text-xs text-gray-500">
                  It is in the email or SMS we sent when you placed your order.
                </p>
              </div>

              <fieldset>
                <legend className="block text-sm font-semibold text-gray-900 mb-1">Email or phone number *</legend>
                <p className="mb-3 text-xs text-gray-500">Fill in at least one, the same as you used at checkout.</p>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="track-email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <input
                      id="track-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="track-phone" className="block text-sm font-medium text-gray-700 mb-2">Phone number</label>
                    <input
                      id="track-phone"
                      type="tel"
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                      placeholder="e.g. 0241234567"
                    />
                  </div>
                </div>
              </fieldset>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg" role="alert">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary hover:bg-primary-dark text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <i className="ri-loader-4-line animate-spin mr-2" aria-hidden="true"></i>
                    Searching...
                  </span>
                ) : 'Track Order'}
              </button>
            </form>

            <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-start gap-3">
                <i className="ri-information-line text-xl text-gray-700 mt-0.5" aria-hidden="true"></i>
                <p className="text-sm text-gray-700">
                  Can&apos;t find your order number? <Link href="/contact" className="font-semibold underline">Contact us</Link>.
                  {' '}If you ordered while signed in, your orders are also under{' '}
                  <Link href="/account?tab=orders" className="font-semibold underline">My Account</Link>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const status = String(order.status || 'pending');
  const paymentStatus = String(order.payment_status || 'pending');
  const badge = STATUS_LABELS[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
  const items: any[] = order.order_items || [];
  const hasPreorder = items.some((item) => item.metadata?.preorder_shipping || item.metadata?.is_preorder);
  const isClosed = status === 'cancelled' || status === 'refunded';
  const canPay = !isClosed && (paymentStatus === 'pending' || paymentStatus === 'failed');

  const flow = ['processing', 'shipped', 'delivered'];
  const reached = flow.indexOf(status);
  const steps = [
    { title: 'Order placed', detail: formatDateTime(order.created_at), done: true },
    { title: 'Payment', detail: PAYMENT_LABELS[paymentStatus] || paymentStatus, done: paymentStatus === 'paid' },
    {
      title: hasPreorder ? 'Sourcing and processing' : 'Processing',
      detail: hasPreorder ? 'Preorder items usually arrive 45 – 60 days after the order date' : 'We prepare your order',
      done: reached >= 0,
    },
    { title: 'On the way', detail: 'Our team contacts you to arrange delivery', done: reached >= 1 },
    { title: 'Delivered', detail: '', done: reached >= 2 },
  ];
  const address = order.shipping_address || {};

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <button
          type="button"
          onClick={resetSearch}
          className="text-gray-600 hover:text-gray-900 font-medium inline-flex items-center whitespace-nowrap cursor-pointer mb-6"
        >
          <i className="ri-arrow-left-line mr-2" aria-hidden="true"></i>
          New search
        </button>

        <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div className="min-w-0">
              <p className="text-sm text-gray-600">Order number</p>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-all">{order.order_number}</h1>
              <p className="text-sm text-gray-600 mt-1">Placed {formatDateTime(order.created_at)}</p>
            </div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${badge.color}`}>
              {badge.label}
            </span>
          </div>

          {isClosed ? (
            <p className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-gray-700">
              This order was {status}. If you have questions, please <Link href="/contact" className="underline">contact us</Link>.
            </p>
          ) : (
            <ol className="space-y-4" aria-label="Order progress">
              {steps.map((step) => (
                <li key={step.title} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${step.done ? 'bg-primary text-white' : 'bg-gray-200 text-gray-400'}`}
                    aria-hidden="true"
                  >
                    <i className={step.done ? 'ri-check-line text-sm' : 'ri-circle-line text-xs'}></i>
                  </span>
                  <div>
                    <p className={`font-semibold ${step.done ? 'text-gray-900' : 'text-gray-500'}`}>
                      {step.title}
                      <span className="sr-only">{step.done ? ' (done)' : ' (not yet)'}</span>
                    </p>
                    {step.detail && <p className="text-sm text-gray-600">{step.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {canPay && (
            <Link
              href={`/pay/${encodeURIComponent(order.order_number || order.id)}`}
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary hover:bg-primary-dark px-6 py-3 font-semibold text-white transition-colors"
            >
              <i className="ri-secure-payment-line mr-2" aria-hidden="true"></i>
              Complete payment
            </Link>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Items</h2>
          <ul className="space-y-4">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                  <img src={item.metadata?.image || PLACEHOLDER_IMAGE} alt={item.product_name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 line-clamp-2">{item.product_name}</p>
                  {item.variant_name && <p className="text-xs text-gray-500">{item.variant_name}</p>}
                  <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                </div>
                <p className="font-bold text-gray-900">GH₵{Number(item.unit_price).toFixed(2)}</p>
              </li>
            ))}
          </ul>
          <div className="border-t border-gray-200 mt-4 pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>GH₵{Number(order.subtotal).toFixed(2)}</span>
            </div>
            {Number(order.discount_total) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount</span>
                <span>− GH₵{Number(order.discount_total).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Total</span>
              <span>GH₵{Number(order.total).toFixed(2)}</span>
            </div>
            <p className="text-xs text-gray-500">Delivery cost is arranged separately with our team.</p>
          </div>
        </div>

        {(address.firstName || address.city || address.region) && (
          <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Delivery</h2>
            {address.firstName && <p className="font-semibold text-gray-900">{address.firstName}</p>}
            <p className="text-gray-700">{[address.city, address.region].filter(Boolean).join(', ')}</p>
            {order.phone && <p className="text-sm text-gray-600 mt-1">Phone: {order.phone}</p>}
          </div>
        )}
      </div>
    </main>
  );
}

export default function OrderTrackingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" role="status">
          <i className="ri-loader-4-line animate-spin text-4xl text-gray-500" aria-hidden="true"></i>
          <span className="sr-only">Loading…</span>
        </div>
      }
    >
      <OrderTrackingContent />
    </Suspense>
  );
}
