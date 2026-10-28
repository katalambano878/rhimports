import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { hubtelCheckTransactionStatus } from '@/lib/hubtel';
import {
  amountsMatch,
  settlementAmount,
  finalizeHubtelPaidOrder,
  hubtelStatusIsPaid,
  isValidOrderNumber,
  isSameOriginRequest,
} from '@/lib/hubtel-order';

const supabase = createServerSupabase('service');

export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const clientId = getClientIdentifier(req);
    const rateLimitResult = checkRateLimit(`payment:hubtel-verify:${clientId}`, RATE_LIMITS.payment);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, message: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const { orderNumber, email } = await req.json();

    if (!orderNumber || !email) {
      return NextResponse.json({ success: false, message: 'Missing orderNumber or email' }, { status: 400 });
    }

    if (!isValidOrderNumber(orderNumber)) {
      return NextResponse.json({ success: false, message: 'Invalid order number format' }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, order_number, payment_status, status, total, email, metadata')
      .eq('order_number', orderNumber)
      .maybeSingle();

    // IDOR guard — return 404 on mismatch so we don't confirm the order exists
    if (fetchError || !order || String(order.email).trim().toLowerCase() !== normalizedEmail) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    if (order.payment_status === 'paid') {
      return NextResponse.json({
        success: true,
        status: order.status,
        payment_status: 'paid',
        message: 'Order already paid',
      });
    }

    const clientReference = order.metadata?.hubtel_client_reference;
    if (!clientReference) {
      return NextResponse.json({
        success: false,
        status: order.status,
        payment_status: order.payment_status,
        message: 'No Hubtel checkout session found for this order',
      });
    }

    console.log('[Hubtel Verify] Checking', orderNumber, '| Ref:', clientReference);

    let verified;
    try {
      verified = await hubtelCheckTransactionStatus(clientReference);
    } catch (statusError: any) {
      console.error('[Hubtel Verify] Status check failed:', statusError.message);
      return NextResponse.json({
        success: false,
        status: order.status,
        payment_status: order.payment_status,
        message: 'Payment not yet confirmed. Please refresh shortly.',
      });
    }

    if (!hubtelStatusIsPaid(verified.status)) {
      return NextResponse.json({
        success: false,
        status: order.status,
        payment_status: order.payment_status,
        message: 'Payment not yet confirmed. Please refresh shortly.',
      });
    }

    const settled = settlementAmount(verified);
    if (settled === undefined || !amountsMatch(Number(order.total), settled)) {
      console.warn('[Hubtel Verify] Amount mismatch for', orderNumber, '| Expected:', order.total, '| Settled:', settled);
      return NextResponse.json({
        success: false,
        status: order.status,
        payment_status: order.payment_status,
        message: 'Payment amount could not be verified',
      });
    }

    const hubtelRef = verified.checkoutId || clientReference;
    await finalizeHubtelPaidOrder(supabase, orderNumber, hubtelRef, {
      hubtel_client_reference: clientReference,
      hubtel_verified_status: verified.status,
      hubtel_settlement_amount: settled,
      hubtel_verified_at: new Date().toISOString(),
    });

    console.log('[Hubtel Verify] Order marked paid:', orderNumber);

    return NextResponse.json({
      success: true,
      status: 'processing',
      payment_status: 'paid',
      message: 'Payment verified and order updated',
    });
  } catch (error: any) {
    console.error('[Hubtel Verify] Error:', error.message);
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  }
}
