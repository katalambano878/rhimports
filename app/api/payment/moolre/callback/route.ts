import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { expectedChargeAmounts, paidCoversExpected } from '../../_lib/order-charge';
import { runPaidSideEffects } from '../../_lib/after-paid';

const supabase = createServerSupabase('service');

/**
 * Moolre payment callback.
 *
 * Payload (from Moolre):
 * { "status": 1, "code": "P01", "message": "Transaction Successful",
 *   "data": { "txstatus"|"txtstatus": 1, "amount": "2", "value": "2",
 *             "transactionid": "...", "externalref": "ORD-…-R<ts>", "thirdpartyref": "..." },
 *   "secret": "…", "ts": "…" }
 *
 * Security:
 *  - MOOLRE_CALLBACK_SECRET is REQUIRED and compared in constant time; a
 *    missing or wrong secret → 401 (503 while the secret is not configured).
 *  - Paid only when the callback says success AND its amount covers the
 *    server-recorded charge for that order (400 otherwise).
 *  - A failure callback never downgrades a paid order.
 */
function secretMatches(provided: unknown, expected: string): boolean {
    if (typeof provided !== 'string' || !provided) return false;
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
    try {
        const rateLimitResult = checkRateLimit(`callback:${getClientIdentifier(req)}`, RATE_LIMITS.callback);
        if (!rateLimitResult.success) {
            return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
        }

        let body: any = {};
        const contentType = req.headers.get('content-type') || '';
        try {
            if (contentType.includes('application/json')) {
                body = await req.json();
            } else if (contentType.includes('form')) {
                body = Object.fromEntries((await req.formData()).entries());
            } else {
                const rawText = await req.text();
                try {
                    body = JSON.parse(rawText);
                } catch {
                    body = Object.fromEntries(new URLSearchParams(rawText).entries());
                }
            }
        } catch {
            return NextResponse.json({ success: false, message: 'Invalid Request Body' }, { status: 400 });
        }
        if (!body || typeof body !== 'object') body = {};
        const data = body.data && typeof body.data === 'object' ? body.data : {};

        // --- Secret first: mandatory, constant-time ---------------------------
        const expectedSecret = process.env.MOOLRE_CALLBACK_SECRET?.trim();
        if (!expectedSecret) {
            console.error('[Moolre Callback] MOOLRE_CALLBACK_SECRET not configured — rejecting all callbacks');
            return NextResponse.json({ success: false, message: 'Callback verification is not configured' }, { status: 503 });
        }
        if (!secretMatches(body.secret ?? data.secret, expectedSecret)) {
            console.error('[Moolre Callback] Missing or wrong secret — rejected');
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const rawExternalRef = String(data.externalref || data.external_reference || body.externalref || body.external_reference || '');
        const merchantOrderRef = rawExternalRef
            ? rawExternalRef.replace(/-R\d+$/, '')
            : String(data.metadata?.original_order_number || body.metadata?.original_order_number || '');
        const moolreReference = String(data.transactionid || data.thirdpartyref || body.reference || 'moolre-callback').slice(0, 120);

        if (!merchantOrderRef || !/^[A-Za-z0-9-]{1,64}$/.test(merchantOrderRef)) {
            console.error('[Moolre Callback] Missing order reference');
            return NextResponse.json({ success: false, message: 'Missing order reference' }, { status: 400 });
        }

        const apiStatus = body.status;
        const txStatus = data.txstatus ?? data.txtstatus;
        const messageStr = String(body.message || '').toLowerCase();
        const apiOk = apiStatus === 1 || apiStatus === '1';
        const txOk = txStatus === 1 || txStatus === '1';
        const txFailed = txStatus !== undefined && txStatus !== null && !txOk;
        const isSuccess = (apiOk || txOk) && !txFailed && !/fail|error|cancel|declin/.test(messageStr);

        console.log('[Moolre Callback] Order:', merchantOrderRef, '| API:', apiStatus, '| TX:', txStatus, '| Ref:', moolreReference);

        const { data: order, error: fetchError } = await supabase
            .from('orders')
            .select('id, order_number, payment_status, total, email, metadata')
            .eq('order_number', merchantOrderRef)
            .maybeSingle();
        if (fetchError || !order) {
            console.error('[Moolre Callback] Order not found:', merchantOrderRef);
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        if (order.payment_status === 'paid') {
            return NextResponse.json({ success: true, message: 'Order already processed' });
        }

        if (!isSuccess) {
            await supabase
                .from('orders')
                .update({
                    payment_status: 'failed',
                    metadata: {
                        ...(order.metadata || {}),
                        moolre_reference: moolreReference,
                        failure_reason: String(body.message || 'Payment failed').slice(0, 300),
                        failure_at: new Date().toISOString(),
                    },
                })
                .eq('id', order.id)
                .neq('payment_status', 'paid'); // never downgrade a paid order
            return NextResponse.json({ success: false, message: 'Payment not successful' });
        }

        // --- Amount must be present and cover the server charge --------------
        const rawAmount = data.amount ?? body.amount ?? data.value ?? body.value;
        const callbackAmount = rawAmount != null ? parseFloat(String(rawAmount)) : NaN;
        if (!Number.isFinite(callbackAmount)) {
            console.error('[Moolre Callback] Amount missing — rejected. Order:', merchantOrderRef);
            return NextResponse.json({ success: false, message: 'Payment amount missing from callback' }, { status: 400 });
        }
        const expected = await expectedChargeAmounts(order);
        if (!paidCoversExpected(callbackAmount, expected)) {
            console.error('[Moolre Callback] AMOUNT MISMATCH — rejected. Expected one of:', expected, 'Got:', callbackAmount, 'Order:', merchantOrderRef);
            return NextResponse.json({ success: false, message: 'Payment amount does not match order total' }, { status: 400 });
        }

        const { data: orderJson, error: updateError } = await supabase.rpc('mark_order_paid', {
            order_ref: merchantOrderRef,
            moolre_ref: moolreReference,
        });
        if (updateError) {
            console.error('[Moolre Callback] mark_order_paid failed:', updateError.message);
            return NextResponse.json({ success: false, message: 'Database update failed' }, { status: 500 });
        }
        if (!orderJson) {
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        if (!orderJson.already_paid) {
            const { error: metaErr } = await supabase
                .from('orders')
                .update({ metadata: { ...(orderJson.metadata || {}), moolre_paid_amount: callbackAmount } })
                .eq('id', orderJson.id);
            if (metaErr) console.error('[Moolre Callback] metadata update failed:', metaErr.message);
        }

        await runPaidSideEffects(orderJson, 'Moolre Callback');

        return NextResponse.json({ success: true, message: 'Payment verified and Order Updated' });
    } catch (error: any) {
        console.error('[Moolre Callback] Error:', error?.message);
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function GET() {
    return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
}
