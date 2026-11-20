import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { isValidOrderNumber } from '@/lib/hubtel-order';

const supabase = createServerSupabase('service');

/**
 * Read-only Moolre payment check for the order-success page.
 *
 * This route NEVER marks an order paid. This repo has no Moolre status call
 * that returns the transaction state and amount (the old `embed/status` call
 * treated any `status: 1` reply as paid), so Moolre payments are confirmed
 * only by the secret-verified callback (/api/payment/moolre/callback). Here we
 * just report what is stored.
 *
 * Body: { orderNumber, fromRedirect? }
 * 200 → { success: payment_status === 'paid', status, payment_status, message }
 */
export async function POST(req: Request) {
    try {
        const rl = checkRateLimit(`payment:moolre-verify:${getClientIdentifier(req)}`, RATE_LIMITS.payment);
        if (!rl.success) {
            return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
        }

        let body: any;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
        }
        const orderNumber = body?.orderNumber;
        if (!isValidOrderNumber(orderNumber)) {
            return NextResponse.json({ success: false, message: 'Missing or invalid orderNumber' }, { status: 400 });
        }

        const { data: order, error } = await supabase
            .from('orders')
            .select('status, payment_status')
            .eq('order_number', orderNumber)
            .maybeSingle();
        if (error || !order) {
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        const paid = order.payment_status === 'paid';
        return NextResponse.json({
            success: paid,
            status: order.status,
            payment_status: order.payment_status,
            message: paid
                ? 'Order already paid'
                : body?.fromRedirect === true
                  ? 'Payment received by the provider is still being confirmed. Please refresh shortly.'
                  : 'Payment not yet confirmed',
        });
    } catch (error: any) {
        console.error('[Moolre Verify] Error:', error?.message);
        return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
    }
}
