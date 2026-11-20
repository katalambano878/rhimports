import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import {
  hubtelCheckTransactionStatus,
  stripHubtelReferenceSuffix,
  isHubtelPaid,
  isHubtelFailure,
  type HubtelTransactionStatus,
} from '@/lib/hubtel';
import { hubtelCustomerPaidAmount, hubtelReferenceMatchesOrder } from '@/lib/hubtel-order';
import { expectedChargeAmounts, paidCoversExpected } from '../../_lib/order-charge';
import { runPaidSideEffects } from '../../_lib/after-paid';

const supabase = createServerSupabase('service');

/**
 * Hubtel Online Checkout callback. Hubtel does not sign callbacks, so the body
 * only tells us which order to look at: every callback is re-checked against
 * Hubtel's status API. The order is marked paid only if Hubtel says "Paid" for
 * a reference that belongs to THIS order AND the customer-paid amount covers
 * the server charge; a failure is recorded only when Hubtel itself says the
 * payment failed, and never over a paid order.
 */
async function parseCallbackBody(req: Request): Promise<Record<string, any>> {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await req.json().catch(() => ({}))) as Record<string, any>;
  }
  if (contentType.includes('form')) {
    const formData = await req.formData();
    return Object.fromEntries(formData.entries()) as Record<string, any>;
  }
  const rawText = await req.text();
  try {
    return JSON.parse(rawText) as Record<string, any>;
  } catch {
    return Object.fromEntries(new URLSearchParams(rawText).entries()) as Record<string, any>;
  }
}

export async function POST(req: Request) {
  try {
    const clientId = getClientIdentifier(req);
    const rateLimitResult = checkRateLimit(`callback:hubtel:${clientId}`, RATE_LIMITS.callback);
    if (!rateLimitResult.success) {
      return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
    }

    let body: Record<string, any>;
    try {
      body = await parseCallbackBody(req);
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
    }
    const responseCode = String(body.ResponseCode ?? body.responseCode ?? '').trim();
    const dataRaw = body.Data ?? body.data;
    const data: Record<string, any> = Array.isArray(dataRaw) ? dataRaw[0] || {} : dataRaw || {};
    const rawClientReference = String(data.ClientReference ?? data.clientReference ?? body.ClientReference ?? body.clientReference ?? '').trim();
    const orderRef = stripHubtelReferenceSuffix(rawClientReference);
    const checkoutId = String(data.CheckoutId ?? data.checkoutId ?? '').trim();
    const innerStatus = String(data.Status ?? data.TransactionStatus ?? body.Status ?? body.status ?? '').trim();

    if (!orderRef || !/^[A-Za-z0-9-]{1,64}$/.test(orderRef)) {
      console.error('[Hubtel Callback] Missing or invalid ClientReference');
      return NextResponse.json({ success: false, message: 'Missing client reference' }, { status: 400 });
    }

    console.log('[Hubtel Callback] Order:', orderRef, '| Ref:', rawClientReference, '| Status:', innerStatus, '| Code:', responseCode);

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, order_number, payment_status, total, email, metadata')
      .eq('order_number', orderRef)
      .maybeSingle();

    if (fetchError || !order) {
      console.error('[Hubtel Callback] Order not found:', orderRef);
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    if (order.payment_status === 'paid') {
      return NextResponse.json({ success: true, message: 'Order already processed' });
    }

    // Callbacks are unsigned: whatever the body claims, ask Hubtel.
    let verified: HubtelTransactionStatus | null = null;
    try {
      verified = await hubtelCheckTransactionStatus(rawClientReference || orderRef);
    } catch (statusError: any) {
      console.error('[Hubtel Callback] Status check failed:', statusError?.message);
      return NextResponse.json({ success: false, message: 'Could not verify payment status' }, { status: 502 });
    }

    console.log('[Hubtel Callback] Verified status:', verified.status, '| Amount:', verified.amount, '| Settled:', verified.amountAfterCharges);

    if (verified.clientReference && !hubtelReferenceMatchesOrder(verified.clientReference, order.order_number)) {
      console.error('[Hubtel Callback] Status API returned another order\'s reference:', verified.clientReference);
      return NextResponse.json({ success: false, message: 'Reference mismatch' }, { status: 400 });
    }

    if (!isHubtelPaid(verified.status)) {
      // Record a failure only when Hubtel itself says the payment failed.
      if (isHubtelFailure(verified.status, null)) {
        await supabase
          .from('orders')
          .update({
            payment_status: 'failed',
            metadata: {
              ...(order.metadata || {}),
              hubtel_checkout_id: verified.checkoutId || checkoutId || order.metadata?.hubtel_checkout_id || null,
              hubtel_failure_reason: String(verified.status || 'Payment not successful').slice(0, 200),
              hubtel_callback_at: new Date().toISOString(),
            },
          })
          .eq('id', order.id)
          .neq('payment_status', 'paid');
        return NextResponse.json({ success: false, message: 'Payment not successful' });
      }
      const looksSuccessful = isHubtelPaid(innerStatus);
      console.warn('[Hubtel Callback] Hubtel has not confirmed payment for', orderRef, '(callback said:', innerStatus, ')');
      return NextResponse.json(
        { success: false, message: 'Payment not confirmed by gateway' },
        { status: looksSuccessful ? 400 : 200 }
      );
    }

    const paid = hubtelCustomerPaidAmount(verified);
    const expected = await expectedChargeAmounts(order);
    if (!paidCoversExpected(paid, expected)) {
      console.error('[Hubtel Callback] AMOUNT MISMATCH for', orderRef, '| expected one of:', expected, '| paid:', paid);
      return NextResponse.json({ success: false, message: 'Payment amount mismatch' }, { status: 400 });
    }

    const hubtelRef = verified.checkoutId || checkoutId || rawClientReference;
    const { data: orderJson, error: updateError } = await supabase.rpc('mark_order_paid', {
      order_ref: orderRef,
      moolre_ref: hubtelRef,
    });
    if (updateError) {
      console.error('[Hubtel Callback] mark_order_paid failed:', updateError.message);
      return NextResponse.json({ success: false, message: 'Database update failed' }, { status: 500 });
    }
    if (!orderJson) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

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
      if (metaErr) console.error('[Hubtel Callback] metadata update failed:', metaErr.message);
    }

    await runPaidSideEffects(orderJson, 'Hubtel Callback');

    return NextResponse.json({ success: true, message: 'Payment verified and order updated' });
  } catch (error: any) {
    console.error('[Hubtel Callback] Error:', error?.message);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
}
