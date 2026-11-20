'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CheckoutSteps from '@/components/CheckoutSteps';
import OrderSummary from '@/components/OrderSummary';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useRecaptcha } from '@/hooks/useRecaptcha';

/** Ghana number: 0XXXXXXXXX or +233XXXXXXXXX (spaces and dashes allowed). */
const GH_PHONE_RE = /^(0\d{9}|\+233\d{9})$/;
const cleanPhone = (value: string) => value.replace(/[\s-]/g, '');

const round2 = (n: number) => Math.round(n * 100) / 100;

type AppliedCoupon = {
  code: string;
  discount: number;
  message: string;
};

type PriceUpdate = {
  orderNumber: string;
  orderUuid: string;
  subtotal: number;
  discount: number;
  total: number;
};

// Ghana's 16 administrative regions
const REGIONS = [
  'Ahafo',
  'Ashanti',
  'Bono',
  'Bono East',
  'Central',
  'Eastern',
  'Greater Accra',
  'North East',
  'Northern',
  'Oti',
  'Savannah',
  'Upper East',
  'Upper West',
  'Volta',
  'Western',
  'Western North',
];

export default function CheckoutPage() {
  usePageTitle('Checkout');
  const router = useRouter();
  const { cart, clearCart, ready: cartReady, refreshCart } = useCart();

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { getToken, verifying } = useRecaptcha();

  // Live price / stock check of the bag when checkout opens.
  const [cartChecked, setCartChecked] = useState(false);
  const [cartChanges, setCartChanges] = useState<string[]>([]);

  // Coupon
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  // Set when the server re-priced the order and the total differs.
  const [priceUpdate, setPriceUpdate] = useState<PriceUpdate | null>(null);
  const [orderError, setOrderError] = useState('');

  const [shippingData, setShippingData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    region: ''
  });

  const deliveryMethod = 'doorstep';
  const paymentMethod = 'hubtel';
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Check auth once
  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        setShippingData(prev => ({ ...prev, email: session.user.email || '' }));
      }
    }
    checkUser();
  }, []);

  // Once the saved bag has loaded, re-read current prices and stock.
  useEffect(() => {
    if (!cartReady) return;
    let active = true;
    refreshCart().then((changes) => {
      if (!active) return;
      if (changes && changes.length > 0) setCartChanges(changes.map((c) => c.message));
      setCartChecked(true);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartReady]);

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  // Totals. Delivery is not priced online: the team contacts the customer
  // with the delivery cost. No tax is charged. The server re-prices the
  // order itself; these figures are what the shopper sees.
  const subtotal = round2(cart.reduce((sum, item) => sum + round2(item.price) * item.quantity, 0));
  const shippingCost = 0;
  const tax = 0;
  const discount = coupon ? round2(Math.min(coupon.discount, subtotal)) : 0;
  const total = round2(Math.max(0, subtotal - discount));

  const applyCoupon = async (code: string, quiet = false) => {
    const trimmed = code.trim();
    if (!trimmed) {
      setCouponError('Enter a coupon code.');
      return;
    }
    setCouponLoading(true);
    setCouponError('');
    try {
      const res = await fetch('/api/storefront/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed, subtotal }),
      });
      const result = await res.json().catch(() => null);
      if (result?.valid) {
        setCoupon({
          code: result.code || trimmed.toUpperCase(),
          discount: Number(result.discount) || 0,
          message: result.message || '',
        });
        setCouponInput('');
      } else {
        setCoupon(null);
        setCouponError(result?.message || (quiet ? 'Your coupon no longer applies to this order.' : 'This coupon code is not valid.'));
      }
    } catch {
      setCouponError('Could not check this coupon right now. Please try again.');
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setCoupon(null);
    setCouponError('');
  };

  // Re-check the coupon when the cart total changes (minimum spend, % off).
  useEffect(() => {
    if (!coupon) return;
    const t = setTimeout(() => applyCoupon(coupon.code, true), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  const validateShipping = () => {
    const newErrors: Record<string, string> = {};
    if (!shippingData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!shippingData.lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!shippingData.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shippingData.email.trim())) newErrors.email = 'Enter a valid email address';
    if (!shippingData.phone.trim()) newErrors.phone = 'Phone is required';
    else if (!GH_PHONE_RE.test(cleanPhone(shippingData.phone))) {
      newErrors.phone = 'Enter a Ghana number like 0241234567 or +233241234567';
    }
    if (!shippingData.address.trim()) newErrors.address = 'Address is required';
    if (!shippingData.city.trim()) newErrors.city = 'City is required';
    if (!shippingData.region) newErrors.region = 'Region is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinueToDelivery = () => {
    if (validateShipping()) {
      setCurrentStep(2);
    }
  };

  /** Insert or update the shopper's saved address (row-level security: own rows only). */
  const saveAddressToAccount = async (userId: string) => {
    const row = {
      user_id: userId,
      type: 'shipping' as const,
      full_name: `${shippingData.firstName} ${shippingData.lastName}`.trim(),
      phone: cleanPhone(shippingData.phone),
      address_line1: shippingData.address.trim(),
      city: shippingData.city.trim(),
      state: shippingData.region,
      postal_code: '',
      country: 'Ghana',
    };
    const { data: existing, error: readError } = await supabase
      .from('addresses')
      .select('id, address_line1, city')
      .eq('user_id', userId);
    if (readError) throw readError;
    const rows = existing || [];
    const same = rows.find(
      (a: any) =>
        (a.address_line1 || '').trim().toLowerCase() === row.address_line1.toLowerCase() &&
        (a.city || '').trim().toLowerCase() === row.city.toLowerCase()
    );
    if (same) {
      const { error } = await supabase.from('addresses').update(row).eq('id', same.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('addresses').insert([{ ...row, is_default: rows.length === 0 }]);
      if (error) throw error;
    }
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    setOrderError('');
    setIsLoading(true);

    // reCAPTCHA verification
    const isHuman = await getToken('checkout');
    if (!isHuman) {
      setOrderError('Security check failed. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // The server creates the order and its items and prices them itself.
      // Signed-in shoppers prove who they are with their session token.
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const phone = cleanPhone(shippingData.phone);
      const cleanShipping = {
        firstName: shippingData.firstName.trim(),
        lastName: shippingData.lastName.trim(),
        email: shippingData.email.trim(),
        phone,
        address: shippingData.address.trim(),
        city: shippingData.city.trim(),
        region: shippingData.region,
      };
      const createRes = await fetch('/api/storefront/orders/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          orderNumber,
          email: cleanShipping.email,
          phone,
          shippingData: cleanShipping,
          couponCode: coupon?.code || undefined,
          deliveryMethod,
          paymentMethod,
          currency: 'GHS',
          subtotal,
          tax,
          shippingCost,
          total,
          items: cart.map((item) => ({
            id: item.id,
            name: item.name,
            variant: item.variant,
            variantId: item.variantId,
            quantity: item.quantity,
            price: item.price,
            image: item.image,
            slug: item.slug,
          })),
        }),
      });

      let created: {
        id?: string;
        order_number?: string;
        subtotal?: number;
        discount_total?: number;
        total?: number;
        priceChanged?: boolean;
        error?: string;
      } = {};
      try {
        created = await createRes.json();
      } catch {
        throw new Error(`The checkout server returned an invalid response (${createRes.status}).`);
      }

      if (!createRes.ok || !created.id) {
        throw new Error(created.error || 'We could not place your order. Please try again.');
      }

      const order = { id: created.id, order_number: created.order_number || orderNumber };

      // Save the address for next time (signed-in shoppers who ticked the box).
      if (user && saveAddress) {
        await saveAddressToAccount(user.id).catch((err) => console.error('Save address failed:', err));
      }

      // The server prices the order itself. If that differs from what the
      // shopper saw, stop and show the new total before taking payment.
      if (created.priceChanged) {
        setPriceUpdate({
          orderNumber: order.order_number,
          orderUuid: order.id,
          subtotal: Number(created.subtotal ?? subtotal),
          discount: Number(created.discount_total ?? 0),
          total: Number(created.total ?? total),
        });
        return;
      }

      await continueToPayment(order.order_number, order.id);
    } catch (err: any) {
      console.error('Checkout error:', err);
      setOrderError(err?.message || 'We could not place your order. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  /** Start Hubtel payment for a created order. The server works out the amount. */
  const continueToPayment = async (orderNumber: string, orderUuid: string) => {
    setIsLoading(true);
    try {
      const paymentRes = await fetch('/api/payment/hubtel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: orderNumber,
          orderUuid,
          customerEmail: shippingData.email.trim(),
        }),
      });

      let paymentResult: any = null;
      try {
        paymentResult = await paymentRes.json();
      } catch {
        throw new Error(`Payment gateway returned an invalid response (${paymentRes.status})`);
      }

      // Every item went out of stock between cart and payment.
      if (paymentResult?.all_out_of_stock) {
        clearCart();
        router.push(`/pay/${encodeURIComponent(orderNumber)}?stock=empty`);
        return;
      }

      if (!paymentRes.ok || !paymentResult?.success || !paymentResult?.url) {
        throw new Error(paymentResult?.message || 'Payment initialization failed');
      }

      if (Array.isArray(paymentResult.removedItems) && paymentResult.removedItems.length > 0) {
        const lines = paymentResult.removedItems
          .map((it: { name?: string; product_name?: string; variant?: string; variant_name?: string }) => {
            const name = it.name || it.product_name || 'Item';
            const variant = it.variant || it.variant_name;
            return `• ${name}${variant ? ` (${variant})` : ''}`;
          })
          .join('\n');
        const newTotal = typeof paymentResult.amount === 'number'
          ? `GH₵ ${paymentResult.amount.toFixed(2)}`
          : 'the updated amount';
        alert(
          `Some items went out of stock and were removed from your order:\n\n${lines}\n\n` +
          `You'll be charged ${newTotal} for the remaining items.`
        );
      }

      clearCart();
      window.location.href = paymentResult.url;
    } catch (paymentErr) {
      console.error('Payment Error:', paymentErr);
      // The order exists; send the shopper to the retry page for it.
      clearCart();
      router.push(`/pay/${encodeURIComponent(orderNumber)}?init=failed`);
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = (hasError?: string) =>
    `w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 ${hasError ? 'border-red-500' : 'border-gray-300'}`;
  const labelClass = 'block text-sm font-semibold text-gray-900 mb-2';
  const errorText = (field: string) =>
    errors[field] ? (
      <p id={`checkout-${field}-error`} className="text-sm text-red-600 mt-1">{errors[field]}</p>
    ) : null;
  const errorProps = (field: string) => ({
    'aria-invalid': !!errors[field],
    'aria-describedby': errors[field] ? `checkout-${field}-error` : undefined,
  });

  if (priceUpdate) {
    return (
      <main className="min-h-screen bg-gray-50 py-20">
        <div className="max-w-md mx-auto text-center px-4">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
            <i className="ri-price-tag-3-line text-4xl text-amber-600" aria-hidden="true"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Prices were updated</h1>
          <p className="text-gray-600">
            Some prices changed since you added items to your cart. Your order{' '}
            <span className="font-semibold">{priceUpdate.orderNumber}</span> has been saved with today&apos;s prices.
          </p>
          <dl className="mt-6 space-y-2 rounded-xl bg-white shadow-sm p-5 text-left text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">Subtotal</dt>
              <dd className="font-semibold text-gray-900">GH₵ {priceUpdate.subtotal.toFixed(2)}</dd>
            </div>
            {priceUpdate.discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-gray-600">Discount</dt>
                <dd className="font-semibold text-emerald-700">− GH₵ {priceUpdate.discount.toFixed(2)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-2 text-base">
              <dt className="font-bold text-gray-900">New total</dt>
              <dd className="font-bold text-gray-900">GH₵ {priceUpdate.total.toFixed(2)}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => continueToPayment(priceUpdate.orderNumber, priceUpdate.orderUuid)}
            disabled={isLoading}
            className="mt-8 w-full bg-primary hover:bg-primary-dark text-white py-4 rounded-lg font-semibold transition-colors disabled:opacity-70"
          >
            {isLoading ? 'Processing…' : `Continue to payment (GH₵ ${priceUpdate.total.toFixed(2)})`}
          </button>
          <Link href="/cart" className="mt-4 inline-block text-sm font-medium text-gray-600 hover:text-gray-900">
            Back to your cart
          </Link>
        </div>
      </main>
    );
  }

  if (!cartReady || (!cartChecked && cart.length > 0)) {
    return (
      <main className="min-h-screen bg-gray-50 py-28">
        <div className="flex justify-center" role="status" aria-live="polite">
          <i className="ri-loader-4-line animate-spin text-4xl text-gray-500" aria-hidden="true"></i>
          <span className="sr-only">Loading your cart…</span>
        </div>
      </main>
    );
  }

  if (cart.length === 0 && !isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 py-20">
        <div className="max-w-md mx-auto text-center px-4">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
            <i className="ri-shopping-cart-line text-4xl text-gray-300" aria-hidden="true"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Your cart is empty</h1>
          <p className="text-gray-600 mb-8">Add some items to start the checkout process.</p>
          {cartChanges.length > 0 && (
            <ul className="mb-8 space-y-1 text-sm text-amber-800" role="status">
              {cartChanges.map((msg) => <li key={msg}>{msg}</li>)}
            </ul>
          )}
          <Link href="/shop" className="inline-block bg-primary text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary transition-colors">
            Return to Shop
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link href="/cart" className="text-gray-600 hover:text-gray-900 font-medium inline-flex items-center whitespace-nowrap">
            <i className="ri-arrow-left-line mr-2" aria-hidden="true"></i>
            Back to Cart
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-8">Checkout</h1>

        {cartChanges.length > 0 && (
          <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
            <p className="font-semibold">Your cart was updated with current prices and stock</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {cartChanges.map((msg) => <li key={msg}>{msg}</li>)}
            </ul>
          </div>
        )}

        {currentStep === 1 && (
          <div className="mb-8 bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Checkout As</h2>
            {user ? (
              <div className="p-6 rounded-xl border-2 border-gray-900 bg-gray-50 flex items-center gap-4">
                <i className="ri-account-circle-line text-3xl text-gray-900" aria-hidden="true"></i>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-gray-900">My Account</h3>
                  <p className="text-sm text-gray-600 break-words">Signed in as {user.email}. This order will show in your account.</p>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-6 rounded-xl border-2 border-gray-900 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <i className="ri-user-line text-3xl text-gray-900" aria-hidden="true"></i>
                    <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center border-gray-900 bg-primary">
                      <i className="ri-check-line text-white text-sm" aria-hidden="true"></i>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Guest Checkout</h3>
                  <p className="text-sm text-gray-600">Check out without an account. We&apos;ll send order updates to your email and phone.</p>
                </div>

                <Link
                  href="/auth/signup?redirect=/checkout"
                  className="block p-6 rounded-xl border-2 border-gray-200 hover:border-gray-300 transition-all text-left"
                >
                  <div className="flex items-center justify-between mb-3">
                    <i className="ri-account-circle-line text-3xl text-gray-900" aria-hidden="true"></i>
                    <i className="ri-arrow-right-line text-xl text-gray-400" aria-hidden="true"></i>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Create an Account</h3>
                  <p className="text-sm text-gray-600">See your orders and saved addresses in one place. Your cart stays saved.</p>
                </Link>
              </div>
            )}
          </div>
        )}

        <CheckoutSteps currentStep={currentStep} />

        <div className="grid lg:grid-cols-3 gap-8 mt-8">
          <div className="lg:col-span-2">
            {currentStep === 1 && (
              <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Shipping Information</h2>

                <form
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleContinueToDelivery();
                  }}
                >
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="checkout-firstName" className={labelClass}>First Name *</label>
                        <input
                          id="checkout-firstName"
                          type="text"
                          autoComplete="given-name"
                          value={shippingData.firstName}
                          onChange={(e) => setShippingData({ ...shippingData, firstName: e.target.value })}
                          className={inputClass(errors.firstName)}
                          placeholder="John"
                          {...errorProps('firstName')}
                        />
                        {errorText('firstName')}
                      </div>
                      <div>
                        <label htmlFor="checkout-lastName" className={labelClass}>Last Name *</label>
                        <input
                          id="checkout-lastName"
                          type="text"
                          autoComplete="family-name"
                          value={shippingData.lastName}
                          onChange={(e) => setShippingData({ ...shippingData, lastName: e.target.value })}
                          className={inputClass(errors.lastName)}
                          placeholder="Doe"
                          {...errorProps('lastName')}
                        />
                        {errorText('lastName')}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="checkout-email" className={labelClass}>Email Address *</label>
                      <input
                        id="checkout-email"
                        type="email"
                        autoComplete="email"
                        value={shippingData.email}
                        readOnly={!!user}
                        onChange={(e) => setShippingData({ ...shippingData, email: e.target.value })}
                        className={`${inputClass(errors.email)} ${user ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        placeholder="you@example.com"
                        {...errorProps('email')}
                      />
                      {errorText('email')}
                    </div>

                    <div>
                      <label htmlFor="checkout-phone" className={labelClass}>Phone Number *</label>
                      <input
                        id="checkout-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={shippingData.phone}
                        onChange={(e) => setShippingData({ ...shippingData, phone: e.target.value })}
                        className={inputClass(errors.phone)}
                        placeholder="024 123 4567"
                        aria-invalid={!!errors.phone}
                        aria-describedby={errors.phone ? 'checkout-phone-error' : 'checkout-phone-help'}
                      />
                      {errors.phone ? (
                        errorText('phone')
                      ) : (
                        <p id="checkout-phone-help" className="text-xs text-gray-500 mt-1">A Ghana number, e.g. 0241234567 or +233241234567.</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="checkout-address" className={labelClass}>Street Address *</label>
                      <input
                        id="checkout-address"
                        type="text"
                        autoComplete="street-address"
                        value={shippingData.address}
                        onChange={(e) => setShippingData({ ...shippingData, address: e.target.value })}
                        className={inputClass(errors.address)}
                        placeholder="House number and street name"
                        {...errorProps('address')}
                      />
                      {errorText('address')}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="checkout-city" className={labelClass}>City *</label>
                        <input
                          id="checkout-city"
                          type="text"
                          autoComplete="address-level2"
                          value={shippingData.city}
                          onChange={(e) => setShippingData({ ...shippingData, city: e.target.value })}
                          className={inputClass(errors.city)}
                          placeholder="Your city"
                          {...errorProps('city')}
                        />
                        {errorText('city')}
                      </div>
                      <div>
                        <label htmlFor="checkout-region" className={labelClass}>Region *</label>
                        <select
                          id="checkout-region"
                          autoComplete="address-level1"
                          value={shippingData.region}
                          onChange={(e) => setShippingData({ ...shippingData, region: e.target.value })}
                          className={`${inputClass(errors.region)} bg-white`}
                          {...errorProps('region')}
                        >
                          <option value="">Select Region</option>
                          {REGIONS.map((region) => (
                            <option key={region} value={region}>{region}</option>
                          ))}
                        </select>
                        {errorText('region')}
                      </div>
                    </div>

                    {user && (
                      <div className="flex items-center gap-3">
                        <input
                          id="checkout-save-address"
                          type="checkbox"
                          checked={saveAddress}
                          onChange={(e) => setSaveAddress(e.target.checked)}
                          className="w-5 h-5 text-gray-900 rounded border-gray-300 focus:ring-gray-600"
                        />
                        <label htmlFor="checkout-save-address" className="text-sm text-gray-700 cursor-pointer">
                          Save this address to my account
                        </label>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-6 bg-primary hover:bg-primary text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Continue to Delivery
                  </button>
                </form>
              </div>
            )}

            {currentStep === 2 && (
              <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Delivery Method</h2>
                <div className="flex items-center justify-between gap-4 p-4 border-2 rounded-lg border-gray-900 bg-gray-50">
                  <div className="flex items-center gap-4">
                    <i className="ri-truck-line text-xl text-gray-700" aria-hidden="true"></i>
                    <div>
                      <p className="font-semibold text-gray-900">Doorstep Delivery</p>
                      <p className="text-sm text-gray-600">We will contact you with the delivery cost</p>
                    </div>
                  </div>
                  <p className="font-semibold text-amber-600 text-sm whitespace-nowrap">At a Cost</p>
                </div>

                <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">Payment Method</h2>
                <p className="text-sm text-gray-600 mb-4">You&apos;ll be redirected to Hubtel&apos;s secure checkout page to pay.</p>
                <div className="flex items-center gap-3 p-4 border-2 rounded-xl border-gray-900 bg-gray-50">
                  <i className="ri-secure-payment-line text-xl text-gray-600 flex-shrink-0" aria-hidden="true"></i>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">Hubtel Online Checkout</p>
                    <p className="text-xs text-gray-600">Mobile Money, card &amp; more</p>
                  </div>
                </div>

                {orderError && (
                  <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                    {orderError}
                  </p>
                )}

                <div className="flex flex-col-reverse md:flex-row gap-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    disabled={isLoading}
                    className="flex-1 border-2 border-gray-300 hover:border-gray-400 text-gray-700 py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handlePlaceOrder}
                    disabled={isLoading || verifying || couponLoading}
                    className="flex-1 bg-primary hover:bg-primary text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-70 flex items-center justify-center"
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing...
                      </>
                    ) : (
                      `Pay GH₵ ${total.toFixed(2)} with Hubtel`
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1 space-y-4">
            <OrderSummary
              items={cart}
              subtotal={subtotal}
              shipping={shippingCost}
              tax={tax}
              total={total}
              discount={discount}
              couponCode={coupon?.code}
            />

            <div className="bg-white rounded-xl shadow-sm p-5">
              {coupon ? (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0" role="status">
                    <p className="text-sm font-semibold text-gray-900">
                      Coupon <span className="font-mono">{coupon.code}</span> applied
                    </p>
                    <p className="mt-0.5 text-sm text-emerald-700">
                      {coupon.message || `You save GH₵ ${discount.toFixed(2)}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={removeCoupon}
                    disabled={isLoading}
                    className="text-sm font-medium text-gray-600 underline hover:text-gray-900 disabled:opacity-50"
                    aria-label={`Remove coupon ${coupon.code}`}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    applyCoupon(couponInput);
                  }}
                >
                  <label htmlFor="checkout-coupon" className="mb-2 block text-sm font-semibold text-gray-900">
                    Coupon code <span className="font-normal text-gray-500">(optional)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="checkout-coupon"
                      type="text"
                      value={couponInput}
                      onChange={(e) => {
                        setCouponInput(e.target.value);
                        if (couponError) setCouponError('');
                      }}
                      autoComplete="off"
                      autoCapitalize="characters"
                      aria-invalid={!!couponError}
                      aria-describedby={couponError ? 'checkout-coupon-error' : undefined}
                      className={`min-w-0 flex-1 px-3 py-2.5 border-2 rounded-lg uppercase focus:ring-2 focus:ring-gray-600 focus:border-gray-600 ${couponError ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="Enter code"
                    />
                    <button
                      type="submit"
                      disabled={couponLoading || !couponInput.trim()}
                      className="px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
                    >
                      {couponLoading ? 'Checking…' : 'Apply'}
                    </button>
                  </div>
                  {couponError && (
                    <p id="checkout-coupon-error" className="mt-2 text-sm text-red-600" role="alert">{couponError}</p>
                  )}
                </form>
              )}
              {coupon && couponError && (
                <p className="mt-2 text-sm text-red-600" role="alert">{couponError}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
