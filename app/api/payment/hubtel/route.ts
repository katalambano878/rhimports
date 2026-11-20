import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import {
  hubtelInitiateCheckout,
  hubtelCredentialsConfigured,
  makeHubtelClientReference,
  normalizeGhPhone,
} from '@/lib/hubtel';
import { getPayeeName, roundMoney } from '@/lib/hubtel-order';
import { preparePaymentForOrder, safeSiteRedirect, siteBaseUrl } from '../_lib/order-charge';

const supabase = createServerSupabase('service');

/**
 * Starts a Hubtel Online Checkout session for an order.
 *
 * Body: { orderId, customerEmail? | phone? | orderUuid?, redirectUrl? }
 * plus optional `Authorization: Bearer` (order owner or staff).
 * 200 → { success, url, checkoutDirectUrl, checkoutId, externalRef, reference, amount, removedItems }
 * 403 when the caller cannot show the order is theirs.
 *
 * - The charge is the server re-price of the surviving lines (coupon
 *   re-applied); it is recorded in metadata.payment_server_amount.
 * - Out-of-stock lines are removed before the checkout link is minted.
 * - redirectUrl is honoured only when it points at this site.
 */
export async function POST(req: Request) {
  try {
    const clientId = getClientIdentifier(req);
    const rateLimitResult = checkRateLimit(`payment:hubtel:${clientId}`, RATE_LIMITS.payment);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, message: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': rateLimitResult.resetIn.toString() } }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
    }

    if (!hubtelCredentialsConfigured()) {
      console.error('[Hubtel Initiate] Missing HUBTEL_* credentials');
      return NextResponse.json(
        { success: false, message: 'Hubtel payment is not configured. Please contact the store.' },
        { status: 500 }
      );
    }

    const baseUrl = siteBaseUrl();
    if (!baseUrl.startsWith('https://')) {
      console.error('[Hubtel Initiate] NEXT_PUBLIC_APP_URL must be a public HTTPS URL');
      return NextResponse.json({ success: false, message: 'Payment gateway configuration error' }, { status: 500 });
    }

    const prepared = await preparePaymentForOrder(req, body || {}, 'Hubtel Initiate');
    if (!prepared.ok) return prepared.response;

    const { order, orderRef, removedItems, metadata } = prepared;
    const amount = roundMoney(prepared.amount);
    const clientReference = makeHubtelClientReference(orderRef);

    const defaultRedirect = `${baseUrl}/order-success?order=${encodeURIComponent(orderRef)}&payment_success=true`;
    const returnUrl = safeSiteRedirect(body?.redirectUrl, defaultRedirect);

    const payeePhone = normalizeGhPhone(order.phone || order.shipping_address?.phone);
    const payeeEmail = order.email && !/@(pos|store)\.local$/i.test(order.email) ? order.email : undefined;

    console.log('[Hubtel Initiate] Order:', orderRef, '| Server amount:', amount, '| Ref:', clientReference);

    let checkout;
    try {
      checkout = await hubtelInitiateCheckout({
        totalAmount: amount,
        description: `Order #${orderRef}`,
        callbackUrl: `${baseUrl}/api/payment/hubtel/callback`,
        returnUrl,
        cancellationUrl: `${baseUrl}/pay/${encodeURIComponent(orderRef)}?cancelled=true`,
        clientReference,
        payeeName: getPayeeName(order),
        payeeMobileNumber: payeePhone || undefined,
        payeeEmail,
      });
    } catch (hubtelError: any) {
      console.error('[Hubtel Initiate] Upstream error:', hubtelError?.message);
      return NextResponse.json(
        { success: false, message: 'Could not open the payment page. Please try again.' },
        { status: 502 }
      );
    }

    const { error: metaError } = await supabase
      .from('orders')
      .update({
        payment_status: 'pending', // a retry after a failed attempt
        payment_method: 'hubtel',
        metadata: {
          ...metadata,
          payment_gateway: 'hubtel',
          payment_method: 'hubtel',
          hubtel_client_reference: clientReference,
          hubtel_checkout_id: checkout.checkoutId || null,
          hubtel_initiated_at: new Date().toISOString(),
          payment_server_amount: amount,
        },
      })
      .eq('id', order.id)
      .neq('payment_status', 'paid');

    if (metaError) {
      console.error('[Hubtel Initiate] Failed to save payment session:', metaError.message);
      return NextResponse.json({ success: false, message: 'Could not start the payment. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      url: checkout.checkoutUrl,
      checkoutDirectUrl: (checkout.raw as any)?.data?.checkoutDirectUrl || null,
      checkoutId: checkout.checkoutId,
      externalRef: clientReference,
      reference: checkout.checkoutId || clientReference,
      amount,
      removedItems,
    });
  } catch (error: any) {
    console.error('[Hubtel Initiate] Error:', error?.message || error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}
