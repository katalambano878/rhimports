import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { hubtelCheckTransactionStatus, hubtelCredentialsConfigured, isHubtelPaid } from '@/lib/hubtel';
import { hubtelCustomerPaidAmount, hubtelReferenceMatchesOrder, isValidOrderNumber } from '@/lib/hubtel-order';
import { expectedChargeAmounts, paidCoversExpected, UUID_RE } from '../../_lib/order-charge';
import { runPaidSideEffects } from '../../_lib/after-paid';

const supabase = createServerSupabase('service');

/**
 * Server-side Hubtel verification, called from /order-success after the
 * customer returns from the hosted checkout.
 *
 * Body: { orderNumber } — the ORD-… number or the order uuid (`orderUuid` also accepted); an `email` field is accepted and ignored: the order is
 * only marked paid when Hubtel itself confirms it, and the success page only
 * has a masked email).
 * 200 → { success, status, payment_status, message }
 *
 * The order is marked paid only when Hubtel's status API reports "Paid" for a
 * client reference that belongs to THIS order AND the customer-paid amount
 * covers the server charge.
 */
export async function POST(req: Request) {
  try {
    const rateLimitResult = checkRateLimit(`payment:hubtel-verify:${getClientIdentifier(req)}`, RATE_LIMITS.payment);
    if (!rateLimitResult.success) {
      return NextResponse.json({ success: false, message: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    // Same-origin only (browsers always send Origin on a cross-site POST).
    const origin = req.headers.get('origin') || '';
    const host = req.headers.get('host') || '';
    const allowedOrigins = [
      (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, ''),
      host ? `https://${host}` : '',
      host ? `http://${host}` : '',
    ].filter(Boolean);
    if (origin && !allowedOrigins.includes(origin)) {
      return NextResponse.json({ success: false, message: 'Cross-origin requests not allowed' }, { status: 403 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
    }
    const ref = typeof body?.orderNumber === 'string' ? body.orderNumber.trim() : typeof body?.orderUuid === 'string' ? body.orderUuid.trim() : '';
    const isUuid = UUID_RE.test(ref);
    if (!isUuid && !isValidOrderNumber(ref)) {
      return NextResponse.json({ success: false, message: 'Missing or invalid orderNumber' }, { status: 400 });
    }

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, order_number, payment_status, status, total, email, metadata')
      .eq(isUuid ? 'id' : 'order_number', ref)
      .maybeSingle();
    const orderNumber: string = order?.order_number || ref;
    if (fetchError || !order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    if (order.payment_status === 'paid') {
      return NextResponse.json({ success: true, status: order.status, payment_status: 'paid', message: 'Order already paid' });
    }

    const notConfirmed = (message = 'Payment not yet confirmed. Please refresh shortly.') =>
      NextResponse.json({ success: false, status: order.status, payment_status: order.payment_status, message });

    // The reference must belong to THIS order (metadata could be stale or foreign on old rows).
    const clientReference = order.metadata?.hubtel_client_reference as string | undefined;
    if (!clientReference || !hubtelReferenceMatchesOrder(clientReference, order.order_number)) {
      return notConfirmed('No Hubtel checkout session found for this order');
    }

    if (!hubtelCredentialsConfigured()) {
      return NextResponse.json(
        { success: false, status: order.status, payment_status: order.payment_status, message: 'Payment verification unavailable' },
        { status: 503 }
      );
    }

    let verified;
    try {
      verified = await hubtelCheckTransactionStatus(clientReference);
    } catch (statusError: any) {
      console.error('[Hubtel Verify] Status check failed:', statusError?.message);
      return notConfirmed();
    }

    if (!isHubtelPaid(verified.status)) return notConfirmed();

    if (verified.clientReference && !hubtelReferenceMatchesOrder(verified.clientReference, order.order_number)) {
      console.error('[Hubtel Verify] Hubtel returned a different client reference:', verified.clientReference, 'for', orderNumber);
      return notConfirmed();
    }

    const paid = hubtelCustomerPaidAmount(verified);
    const expected = await expectedChargeAmounts(order);
    if (!paidCoversExpected(paid, expected)) {
      console.error('[Hubtel Verify] AMOUNT MISMATCH for', orderNumber, '| paid:', paid, '| expected one of:', expected);
      return notConfirmed('Payment amount does not match this order. Please contact support.');
    }

    const hubtelRef = verified.checkoutId || clientReference;
    const { data: orderJson, error: updateError } = await supabase.rpc('mark_order_paid', {
      order_ref: orderNumber,
      moolre_ref: hubtelRef,
    });
    if (updateError) {
      console.error('[Hubtel Verify] mark_order_paid failed:', updateError.message);
      return NextResponse.json({ success: false, message: 'Failed to update order' }, { status: 500 });
    }
    if (!orderJson) return notConfirmed();

    if (!orderJson.already_paid) {
      const { error: metaErr } = await supabase
        .from('orders')
        .update({
          payment_method: 'hubtel',
          metadata: {
            ...(orderJson.metadata || {}),
            payment_gateway: 'hubtel',
            hubtel_reference: hubtelRef,
            hubtel_paid_at: new Date().toISOString(),
            hubtel_verified_status: verified.status,
            hubtel_customer_paid: paid,
            hubtel_settlement_amount: verified.amountAfterCharges ?? null,
          },
        })
        .eq('id', orderJson.id);
      if (metaErr) console.error('[Hubtel Verify] metadata update failed:', metaErr.message);
    }

    await runPaidSideEffects(orderJson, 'Hubtel Verify');

    return NextResponse.json({
      success: true,
      status: orderJson.status || 'processing',
      payment_status: 'paid',
      message: 'Payment verified and order updated',
    });
  } catch (error: any) {
    console.error('[Hubtel Verify] Error:', error?.message);
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  }
}
