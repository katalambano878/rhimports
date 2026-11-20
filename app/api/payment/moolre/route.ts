import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { createServerSupabase } from '@/lib/supabase-server';
import { preparePaymentForOrder, siteBaseUrl } from '../_lib/order-charge';

const supabase = createServerSupabase('service');

/**
 * Moolre Mobile Money payment link (checkout option and the till's MoMo sale).
 *
 * Body: { orderId, customerEmail? | phone? | orderUuid? } (+ optional bearer:
 * order owner or staff). Any client `amount` is IGNORED: the charge is the
 * server re-price of the order (coupon re-applied), recorded in
 * metadata.payment_server_amount, and the callback must cover it.
 * 200 → { success, url, reference, amount, removedItems }
 */
export async function POST(req: Request) {
    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`payment:${clientId}`, RATE_LIMITS.payment);
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

        if (!process.env.MOOLRE_API_USER || !process.env.MOOLRE_API_PUBKEY || !process.env.MOOLRE_ACCOUNT_NUMBER) {
            console.error('[Moolre Init] Missing Moolre credentials');
            return NextResponse.json({ success: false, message: 'Mobile Money is not configured. Please contact the store.' }, { status: 500 });
        }

        const baseUrl = siteBaseUrl(new URL(req.url).origin);

        const prepared = await preparePaymentForOrder(req, body || {}, 'Moolre Init');
        if (!prepared.ok) return prepared.response;

        const { order, orderRef, amount, removedItems, metadata } = prepared;

        // Retry suffix so a re-payment does not clash with an earlier attempt.
        const uniqueRef = `${orderRef}-R${Date.now()}`;

        const payload = {
            type: 1,
            amount: amount.toFixed(2),
            email: process.env.MOOLRE_MERCHANT_EMAIL || 'admin@example.com',
            externalref: uniqueRef,
            callback: `${baseUrl}/api/payment/moolre/callback`,
            redirect: `${baseUrl}/order-success?order=${encodeURIComponent(orderRef)}&payment_success=true`,
            reusable: '0',
            currency: 'GHS',
            accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER,
            metadata: {
                customer_email: order.email,
                original_order_number: orderRef,
            },
        };

        console.log('[Moolre Init] Order:', orderRef, '| Server amount:', amount);

        let result: any = null;
        try {
            const response = await fetch('https://api.moolre.com/embed/link', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-USER': process.env.MOOLRE_API_USER,
                    'X-API-PUBKEY': process.env.MOOLRE_API_PUBKEY,
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(20000),
            });
            result = await response.json().catch(() => null);
        } catch (e: any) {
            console.error('[Moolre Init] Upstream error:', e?.message || e);
        }

        if (!(result?.status === 1 && result?.data?.authorization_url)) {
            console.error('[Moolre Init] Moolre rejected link request:', result?.message);
            return NextResponse.json({ success: false, message: 'Failed to generate payment link' }, { status: 502 });
        }

        const { error: metaError } = await supabase
            .from('orders')
            .update({
                payment_status: 'pending', // a retry after a failed attempt
                metadata: {
                    ...metadata,
                    payment_method: 'moolre',
                    payment_gateway: 'moolre',
                    moolre_externalref: uniqueRef,
                    moolre_link_reference: result.data.reference || null,
                    payment_attempted_at: new Date().toISOString(),
                    payment_server_amount: amount,
                },
            })
            .eq('id', order.id)
            .neq('payment_status', 'paid');
        if (metaError) {
            console.error('[Moolre Init] Failed to store payment attempt:', metaError.message);
            return NextResponse.json({ success: false, message: 'Could not start the payment. Please try again.' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            url: result.data.authorization_url,
            reference: result.data.reference,
            amount,
            removedItems,
        });
    } catch (error: any) {
        console.error('[Moolre Init] Error:', error?.message || error);
        return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
    }
}
