import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const supabase = createServerSupabase('service');

const LOOKUP_RATE_LIMIT = { maxRequests: 30, windowSeconds: 60 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_NUMBER_RE = /^ORD-\d+-\d+$/;

/**
 * GET /api/storefront/orders/:orderId/payment-summary  (uuid or ORD-… number)
 * Minimal payment summary for the /pay/[orderId] page: amounts, status and
 * the first name only. The page then calls /api/payment/hubtel with
 * { orderId: order_number, orderUuid: id } as its proof of ownership.
 */
export async function GET(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
    try {
        const { orderId } = await ctx.params;
        const raw = (orderId || '').trim();

        if (!raw || (!UUID_RE.test(raw) && !ORDER_NUMBER_RE.test(raw))) {
            return NextResponse.json({ error: 'Invalid order reference' }, { status: 400 });
        }

        const rl = checkRateLimit(`pay-summary:${getClientIdentifier(req)}`, LOOKUP_RATE_LIMIT);
        if (!rl.success) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const column = UUID_RE.test(raw) ? 'id' : 'order_number';
        const { data: order, error } = await supabase
            .from('orders')
            .select('id, order_number, status, payment_status, subtotal, shipping_total, shipping_method, discount_total, total, metadata, shipping_address')
            .eq(column, raw)
            .maybeSingle();

        if (error) {
            console.error('[PaymentSummary] lookup failed:', error.message);
            return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
        }
        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        const meta = (order.metadata ?? {}) as Record<string, any>;
        const shipping = (order.shipping_address ?? {}) as Record<string, any>;

        return NextResponse.json({
            order: {
                id: order.id,
                order_number: order.order_number,
                status: order.status,
                payment_status: order.payment_status,
                subtotal: order.subtotal,
                shipping_total: order.shipping_total,
                shipping_method: order.shipping_method,
                discount_total: order.discount_total,
                total: order.total,
                metadata: {
                    first_name: meta.first_name ?? shipping.firstName ?? null,
                    moolre_externalref: meta.moolre_externalref ?? null,
                    auto_removed_items: meta.auto_removed_items ?? null,
                },
                shipping_address: {
                    firstName: shipping.firstName ?? null,
                },
            },
        });
    } catch (err: any) {
        console.error('[PaymentSummary] Error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
