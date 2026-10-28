import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import {
  hubtelInitiateCheckout,
  hubtelCredentialsConfigured,
  makeHubtelClientReference,
  normalizeGhPhone,
} from '@/lib/hubtel';
import {
  findOrderByRef,
  prepareOrderForHubtelPayment,
  getPayeeName,
  roundMoney,
} from '@/lib/hubtel-order';

const supabase = createServerSupabase('service');

export async function POST(req: Request) {
  try {
    const clientId = getClientIdentifier(req);
    const rateLimitResult = checkRateLimit(`payment:hubtel:${clientId}`, RATE_LIMITS.payment);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, message: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    if (!hubtelCredentialsConfigured()) {
      console.error('[Hubtel Initiate] Missing HUBTEL_* credentials');
      return NextResponse.json(
        { success: false, message: 'Hubtel payment is not configured. Please contact the store.' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { orderId, customerEmail, redirectUrl } = body;

    if (!orderId) {
      return NextResponse.json({ success: false, message: 'Missing orderId' }, { status: 400 });
    }

    const { data: order, error: orderError } = await findOrderByRef(supabase, orderId);
    if (orderError || !order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    if (order.payment_status === 'paid') {
      return NextResponse.json({ success: false, message: 'This order is already paid.' }, { status: 400 });
    }

    let prepared;
    try {
      prepared = await prepareOrderForHubtelPayment(supabase, order);
    } catch (prepError: any) {
      if (prepError.allOutOfStock) {
        return NextResponse.json(
          { success: false, message: 'All items in this order are out of stock.', all_out_of_stock: true },
          { status: 409 }
        );
      }
      throw prepError;
    }

    const orderNumber = prepared.order.order_number;
    const amount = roundMoney(prepared.amount);

    if (amount <= 0) {
      return NextResponse.json({ success: false, message: 'Invalid order amount' }, { status: 400 });
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
    if (!baseUrl.startsWith('https://')) {
      return NextResponse.json(
        { success: false, message: 'NEXT_PUBLIC_APP_URL must be a public HTTPS URL for Hubtel payments.' },
        { status: 500 }
      );
    }

    const clientReference = makeHubtelClientReference(orderNumber);
    const defaultRedirect = `${baseUrl}/order-success?order=${encodeURIComponent(orderNumber)}&payment_success=true`;
    // Only honor a caller-supplied redirect if it points back to our own
    // origin. This prevents an open-redirect to an attacker/phishing site
    // after a successful payment.
    let safeRedirect = defaultRedirect;
    if (typeof redirectUrl === 'string' && redirectUrl) {
      try {
        if (new URL(redirectUrl).origin === new URL(baseUrl).origin) {
          safeRedirect = redirectUrl;
        }
      } catch {
        // Malformed URL — fall back to the default success URL.
      }
    }

    const payeeName = getPayeeName(prepared.order);
    const payeePhone = normalizeGhPhone(prepared.order.phone || prepared.order.shipping_address?.phone);
    const payeeEmail = customerEmail || prepared.order.email;

    console.log('[Hubtel Initiate] Order:', orderNumber, '| Amount:', amount, '| Ref:', clientReference);

    let checkout;
    try {
      checkout = await hubtelInitiateCheckout({
        totalAmount: amount,
        description: `Order #${orderNumber}`,
        callbackUrl: `${baseUrl}/api/payment/hubtel/callback`,
        returnUrl: safeRedirect,
        cancellationUrl: `${baseUrl}/pay/${encodeURIComponent(orderNumber)}?cancelled=true`,
        clientReference,
        payeeName,
        payeeMobileNumber: payeePhone || undefined,
        payeeEmail: payeeEmail || undefined,
      });
    } catch (hubtelError: any) {
      console.error('[Hubtel Initiate] Upstream error:', hubtelError.message);
      return NextResponse.json(
        { success: false, message: hubtelError.message || 'Failed to start Hubtel checkout' },
        { status: 502 }
      );
    }

    const mergedMetadata = {
      ...(prepared.order.metadata || {}),
      payment_gateway: 'hubtel',
      payment_method: 'hubtel',
      hubtel_client_reference: clientReference,
      hubtel_checkout_id: checkout.checkoutId || null,
      hubtel_initiated_at: new Date().toISOString(),
    };

    const { error: metaError } = await supabase
      .from('orders')
      .update({
        payment_status: 'pending',
        payment_method: 'hubtel',
        metadata: mergedMetadata,
      })
      .eq('id', prepared.order.id);

    if (metaError) {
      return NextResponse.json(
        { success: false, message: `Failed to save payment session: ${metaError.message}` },
        { status: 500 }
      );
    }

    console.log('[Hubtel Initiate] Checkout URL ready for', orderNumber);

    return NextResponse.json({
      success: true,
      url: checkout.checkoutUrl,
      checkoutId: checkout.checkoutId,
      externalRef: clientReference,
      amount,
      removedItems: prepared.removedItems,
      repriced: prepared.repriced,
    });
  } catch (error: any) {
    console.error('[Hubtel Initiate] Error:', error.message);
    return NextResponse.json({ success: false, message: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
