'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function PaymentPage() {
  usePageTitle('Complete Payment');
  const params = useParams<{ orderId?: string }>() as { orderId?: string } | null;
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = params?.orderId ?? '';
  const wasCanceled = searchParams?.get('cancelled') === 'true' || searchParams?.get('canceled') === '1';
  const initFailed = searchParams?.get('init') === 'failed';
  const stockEmpty = searchParams?.get('stock') === 'empty';

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod] = useState<'hubtel'>('hubtel');
  const [error, setError] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('RNH Imports');
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // Fetch store name
    supabase.from('store_settings').select('value').eq('key', 'site_name').single()
      .then(({ data }) => { if (data?.value) setStoreName(typeof data.value === 'string' ? data.value : String(data.value)); });

    async function fetchOrder() {
      setLoading(true);
      setLoadFailed(false);
      setError(null);
      try {
        // Guests cannot read orders from the browser; the server returns
        // only what this page needs.
        const res = await fetch(`/api/storefront/orders/${encodeURIComponent(orderId)}/payment-summary`, { cache: 'no-store' });
        if (res.status === 404 || res.status === 400) {
          setError('Order not found. Please check your link and try again.');
          return;
        }
        if (!res.ok) {
          setLoadFailed(true);
          return;
        }
        const { order: data } = await res.json();
        if (!data) {
          setError('Order not found. Please check your link and try again.');
          return;
        }

        setOrder(data);

        // If already paid, go to the confirmation page
        if (data.payment_status === 'paid') {
          router.push(`/order-success?order=${encodeURIComponent(data.order_number)}`);
          return;
        }
      } catch (err) {
        console.error('Error fetching order:', err);
        setLoadFailed(true);
      } finally {
        setLoading(false);
      }
    }

    if (orderId) {
      fetchOrder();
    } else {
      setLoading(false);
      setError('Order not found. Please check your link and try again.');
    }
  }, [orderId, router, reloadKey]);

  useEffect(() => {
    if (!order) return;
    if (stockEmpty) setError('Every item in this order is now out of stock, so it cannot be paid. Please contact us.');
    else if (initFailed) setError('We could not start the payment. Your order is saved; please try again below.');
    else if (wasCanceled) setError('Payment was cancelled. You can retry below when ready.');
  }, [order, wasCanceled, initFailed, stockEmpty]);

  const status = String(order?.status || '');
  const paymentStatus = String(order?.payment_status || '');
  const isClosed = ['cancelled', 'refunded'].includes(status) || ['refunded', 'partially_refunded', 'paid'].includes(paymentStatus);
  const canPay = !!order && !isClosed && !stockEmpty && (paymentStatus === 'pending' || paymentStatus === 'failed');

  const handlePayNow = async () => {
    if (!order || !canPay) return;

    setProcessing(true);
    setError(null);

    const url = '/api/payment/hubtel';
    try {
      const paymentRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The server works out the amount; the order id proves which order.
        body: JSON.stringify({
          orderId: order.order_number,
          orderUuid: order.id,
        }),
      });

      let paymentResult: {
        success?: boolean;
        message?: string;
        url?: string;
        removedItems?: { name?: string; variant?: string; product_name?: string; variant_name?: string; quantity: number }[];
        all_out_of_stock?: boolean;
      };
      try {
        paymentResult = await paymentRes.json();
      } catch {
        throw new Error(paymentRes.ok ? 'Invalid response from payment server.' : `Payment error (${paymentRes.status}). Please try again or contact support.`);
      }

      if (!paymentResult.success) {
        if (paymentResult.all_out_of_stock) {
          throw new Error('All items in this order are out of stock. Please contact support.');
        }
        throw new Error(paymentResult.message || 'Payment initialization failed');
      }

      if (!paymentResult.url) {
        throw new Error('No payment link received. Please try again or contact support.');
      }

      if (paymentResult.removedItems && paymentResult.removedItems.length > 0) {
        const removedNames = paymentResult.removedItems
          .map((item) => {
            const name = item.name || item.product_name || 'Item';
            const variant = item.variant || item.variant_name;
            return `${name}${variant ? ` (${variant})` : ''}`;
          })
          .join(', ');
        setError(`Some items were out of stock and removed: ${removedNames}. Proceeding with the updated total.`);
      }

      window.location.href = paymentResult.url;
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err?.message || 'Failed to initialize payment. Please try again or contact support.');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center" role="status" aria-live="polite">
          <div className="w-16 h-16 border-4 border-gray-200 border-t-gray-700 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading order details...</p>
        </div>
      </main>
    );
  }

  if (loadFailed && !order) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md" role="alert">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Couldn&apos;t load this order</h1>
          <p className="text-gray-600 mb-6">Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition-colors"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 bg-red-50 rounded-full flex items-center justify-center">
            <i className="ri-error-warning-line text-4xl text-red-500"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Order Not Found</h1>
          <p className="text-gray-600 mb-6">{error || 'Order not found. Please check your link and try again.'}</p>
          <Link
            href="/"
            className="inline-flex items-center px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition-colors"
          >
            <i className="ri-home-line mr-2"></i>
            Go to Homepage
          </Link>
        </div>
      </main>
    );
  }

  const shippingAddress = order?.shipping_address || {};
  const customerName = order?.metadata?.first_name || shippingAddress.firstName || 'Customer';

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6">
            <span className="text-2xl font-bold text-gray-700">{storeName}</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Complete Your Payment</h1>
          <p className="text-gray-600 mt-2">
            {canPay ? `Hi ${customerName}, your order is waiting for payment.` : `Hi ${customerName}, this order cannot be paid online.`}
          </p>
        </div>

        {/* Order Summary Card */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
            <span className="text-sm text-gray-500">Order Number</span>
            <span className="font-semibold text-gray-900">{order?.order_number}</span>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-gray-900">GH₵ {Number(order.subtotal).toFixed(2)}</span>
            </div>
            {Number(order.discount_total) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Discount</span>
                <span className="text-emerald-700">− GH₵ {Number(order.discount_total).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Delivery</span>
              <span className="text-amber-600 font-semibold">
                {Number(order.shipping_total) > 0 ? `GH₵ ${Number(order.shipping_total).toFixed(2)}` : 'At a cost'}
              </span>
            </div>
            {!(Number(order.shipping_total) > 0) && (
              <p className="text-xs text-gray-500">Delivery is not included. Our team will contact you with the delivery cost.</p>
            )}
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <span className="text-lg font-semibold text-gray-900">Total</span>
            <span className="text-2xl font-bold text-gray-700">GH₵ {Number(order.total).toFixed(2)}</span>
          </div>
        </div>

        {/* Payment Status */}
        {isClosed && (
          <div className="bg-gray-100 border border-gray-200 rounded-lg p-4 mb-6" role="status">
            <p className="text-sm font-semibold text-gray-900">
              {status === 'cancelled' ? 'This order was cancelled.' : paymentStatus === 'paid' ? 'This order is already paid.' : 'This order was refunded.'}
            </p>
            <p className="text-sm text-gray-700 mt-1">
              If you think this is a mistake, please <Link href="/contact" className="underline">contact us</Link>.
            </p>
          </div>
        )}

        {canPay && paymentStatus === 'pending' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <i className="ri-time-line text-xl text-yellow-600 mt-0.5"></i>
              <div>
                <p className="text-sm font-semibold text-yellow-800">Payment Pending</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Complete your payment to confirm your order.
                </p>
              </div>
            </div>
          </div>
        )}

        {canPay && paymentStatus === 'failed' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <i className="ri-error-warning-line text-xl text-red-600 mt-0.5"></i>
              <div>
                <p className="text-sm font-semibold text-red-800">Payment Failed</p>
                <p className="text-sm text-red-700 mt-1">
                  Your previous payment attempt was unsuccessful. Please try again.
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6" role="alert">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {canPay && (<>
        {/* Payment method - Hubtel hosted checkout */}
        <div className="mb-6 bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">Payment method</h2>
          <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-900 bg-gray-50">
            <i className="ri-secure-payment-line text-2xl text-gray-700 flex-shrink-0"></i>
            <div>
              <span className="font-semibold text-gray-900 block">Hubtel Online Checkout</span>
              <span className="text-xs text-gray-600">Mobile Money, card &amp; more</span>
            </div>
          </div>
        </div>

        {/* Pay Button */}
        <button
          type="button"
          onClick={handlePayNow}
          disabled={processing}
          className="w-full bg-primary hover:bg-primary-dark text-white py-4 rounded-xl font-semibold text-lg transition-colors disabled:opacity-70 flex items-center justify-center cursor-pointer"
        >
          {processing ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </>
          ) : (
            <>
              <i className="ri-secure-payment-line mr-2"></i>
              {paymentStatus === 'failed'
                ? `Retry Payment (GH₵ ${Number(order.total).toFixed(2)})`
                : `Pay GH₵ ${Number(order.total).toFixed(2)} with Hubtel`}
            </>
          )}
        </button>
        </>)}

        {/* Security Note */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 flex items-center justify-center">
            <i className="ri-lock-line mr-1"></i>
            Secure payment · Hubtel
          </p>
        </div>

        {/* Help Link */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600">
            Having issues? <Link href="/contact" className="text-gray-700 hover:underline">Contact Support</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
