import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import {
  hubtelCheckTransactionStatus,
  stripHubtelReferenceSuffix,
  isHubtelFailure,
} from '@/lib/hubtel';
import {
  amountsMatch,
  settlementAmount,
  finalizeHubtelPaidOrder,
  hubtelStatusIsPaid,
} from '@/lib/hubtel-order';

const supabase = createServerSupabase('service');

async function parseCallbackBody(req: Request): Promise<Record<string, unknown>> {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await req.json().catch(() => ({}))) as Record<string, unknown>;
  }
  if (contentType.includes('form')) {
    const formData = await req.formData();
    return Object.fromEntries(formData.entries()) as Record<string, unknown>;
  }
  const rawText = await req.text();
  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    try {
      return Object.fromEntries(new URLSearchParams(rawText).entries()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}

function extractClientReference(body: Record<string, unknown>): string {
  const data = (body.Data ?? body.data) as Record<string, unknown> | undefined;
  const fromData = data?.ClientReference ?? data?.clientReference;
  const fromTop = body.ClientReference ?? body.clientReference;
  return String(fromData ?? fromTop ?? '').trim();
}

function extractCallbackStatus(body: Record<string, unknown>): string {
  const data = (body.Data ?? body.data) as Record<string, unknown> | undefined;
  const dataArr = Array.isArray(body.Data ?? body.data) ? (body.Data ?? body.data) as unknown[] : null;
  const row = dataArr?.[0] as Record<string, unknown> | undefined;
  return String(
    row?.TransactionStatus ??
    row?.Status ??
    data?.TransactionStatus ??
    data?.Status ??
    body.Status ??
    body.status ??
    ''
  ).trim();
}

export async function POST(req: Request) {
  console.log('[Hubtel Callback] POST received at', new Date().toISOString());

  try {
    const clientId = getClientIdentifier(req);
    const rateLimitResult = checkRateLimit(`callback:hubtel:${clientId}`, RATE_LIMITS.callback);
    if (!rateLimitResult.success) {
      return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
    }

    const body = await parseCallbackBody(req);
    const responseCode = String(body.ResponseCode ?? body.responseCode ?? '').trim();
    const clientReference = extractClientReference(body);
    const callbackStatus = extractCallbackStatus(body);

    if (!clientReference) {
      console.error('[Hubtel Callback] Missing ClientReference');
      return NextResponse.json({ success: false, message: 'Missing client reference' }, { status: 400 });
    }

    const orderRef = stripHubtelReferenceSuffix(clientReference);
    console.log('[Hubtel Callback] Order:', orderRef, '| Ref:', clientReference, '| Status:', callbackStatus, '| Code:', responseCode);

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, order_number, payment_status, total, metadata')
      .eq('order_number', orderRef)
      .maybeSingle();

    if (fetchError || !order) {
      console.error('[Hubtel Callback] Order not found:', orderRef);
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    if (order.payment_status === 'paid') {
      console.log('[Hubtel Callback] Already paid:', orderRef);
      return NextResponse.json({ success: true, message: 'Order already processed' });
    }

    // Never trust callback body alone — always re-query RMSC status API
    let verified;
    try {
      verified = await hubtelCheckTransactionStatus(clientReference);
    } catch (statusError: any) {
      console.error('[Hubtel Callback] Status check failed:', statusError.message);
      return NextResponse.json({ success: false, message: 'Could not verify payment status' }, { status: 502 });
    }

    console.log('[Hubtel Callback] Verified status:', verified.status, '| Amount:', verified.amount, '| Settled:', verified.amountAfterCharges);

    const paid = hubtelStatusIsPaid(verified.status, responseCode);
    const failed = isHubtelFailure(verified.status, responseCode) || isHubtelFailure(callbackStatus, responseCode);

    if (!paid) {
      if (failed || isHubtelFailure(callbackStatus, responseCode)) {
        const mergedMetadata = {
          ...(order.metadata || {}),
          hubtel_checkout_id: verified.checkoutId || order.metadata?.hubtel_checkout_id,
          hubtel_failure_reason: verified.status || callbackStatus || 'Payment not successful',
          hubtel_callback_at: new Date().toISOString(),
        };
        await supabase
          .from('orders')
          .update({ payment_status: 'failed', metadata: mergedMetadata })
          .eq('order_number', orderRef);
      }

      console.log('[Hubtel Callback] Payment not confirmed for', orderRef);
      return NextResponse.json({ success: false, message: 'Payment not successful' });
    }

    const settled = settlementAmount(verified);
    if (settled === undefined || !amountsMatch(Number(order.total), settled)) {
      console.warn('[Hubtel Callback] Amount mismatch for', orderRef, '| Expected:', order.total, '| Settled:', settled);
      return NextResponse.json({ success: false, message: 'Payment amount mismatch' }, { status: 400 });
    }

    const hubtelRef = verified.checkoutId || clientReference;
    await finalizeHubtelPaidOrder(supabase, orderRef, hubtelRef, {
      hubtel_client_reference: clientReference,
      hubtel_verified_status: verified.status,
      hubtel_settlement_amount: settled,
      hubtel_callback_at: new Date().toISOString(),
    });

    console.log('[Hubtel Callback] Order marked paid:', orderRef);
    return NextResponse.json({ success: true, message: 'Payment verified and order updated' });
  } catch (error: any) {
    console.error('[Hubtel Callback] Error:', error.message);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Method not allowed' }, { status: 405 });
}
