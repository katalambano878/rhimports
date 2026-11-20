import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { maskEmail, maskPhone, isPlaceholder } from '@/app/api/storefront/_lib/mask';

export const dynamic = 'force-dynamic';

const supabase = createServerSupabase('service');

const LOOKUP_RATE_LIMIT = { maxRequests: 30, windowSeconds: 60 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_NUMBER_RE = /^ORD-\d+-\d+$/;

/** Order metadata the success page shows or needs (no payment internals). */
function publicMetadata(meta: Record<string, any>) {
    return {
        first_name: meta.first_name ?? null,
        last_name: meta.last_name ?? null,
        tracking_number: meta.tracking_number ?? null,
        payment_method: meta.payment_method ?? null,
        payment_gateway: meta.payment_gateway ?? null,
        // Only used by the page as a "verify with Hubtel" flag; the verify route
        // re-reads it server-side and checks it belongs to this order.
        hubtel_client_reference: meta.hubtel_client_reference ?? null,
        payment_verified_at: meta.payment_verified_at ?? null,
        auto_removed_items: meta.auto_removed_items ?? null,
        coupon_code: meta.coupon_code ?? null,
        pos_sale: meta.pos_sale === true ? true : undefined,
    };
}

/**
 * GET /api/storefront/orders/:orderId/summary  (uuid or ORD-… number)
 * Order summary for the order-success page. The unguessable order reference
 * is the only credential, so lookups are rate-limited and email/phone are
 * masked; the address keeps only what the page displays.
 * 200 → { order: { id, order_number, status, payment_status, payment_method,
 *          shipping_method, subtotal, shipping_total, discount_total, tax_total,
 *          total, currency, created_at, email(masked), phone(masked),
 *          shipping_address{firstName,lastName,address,city,region,email*,phone*},
 *          metadata{…}, order_items[…] } }
 */
export async function GET(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
    try {
        const { orderId } = await ctx.params;
        const raw = (orderId || '').trim();

        if (!raw || (!UUID_RE.test(raw) && !ORDER_NUMBER_RE.test(raw))) {
            return NextResponse.json({ error: 'Invalid order reference' }, { status: 400 });
        }

        const rl = checkRateLimit(`order-summary:${getClientIdentifier(req)}`, LOOKUP_RATE_LIMIT);
        if (!rl.success) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const column = UUID_RE.test(raw) ? 'id' : 'order_number';
        const { data: order, error } = await supabase
            .from('orders')
            .select(`
                id, order_number, status, payment_status, payment_method, shipping_method,
                subtotal, shipping_total, discount_total, tax_total, total, currency, created_at,
                shipping_address, metadata, email, phone,
                order_items ( id, product_id, variant_id, product_name, variant_name, quantity, unit_price, total_price, metadata )
            `)
            .eq(column, raw)
            .maybeSingle();

        if (error) {
            console.error('[OrderSummary] lookup failed:', error.message);
            return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
        }
        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        const shipping = (order.shipping_address ?? {}) as Record<string, any>;
        const meta = (order.metadata ?? {}) as Record<string, any>;
        return NextResponse.json({
            order: {
                id: order.id,
                order_number: order.order_number,
                status: order.status,
                payment_status: order.payment_status,
                payment_method: order.payment_method,
                shipping_method: order.shipping_method,
                subtotal: order.subtotal,
                shipping_total: order.shipping_total,
                discount_total: order.discount_total,
                tax_total: order.tax_total,
                total: order.total,
                currency: order.currency,
                created_at: order.created_at,
                email: isPlaceholder(order.email) ? null : maskEmail(order.email),
                phone: maskPhone(order.phone),
                shipping_address: {
                    firstName: shipping.firstName ?? null,
                    lastName: shipping.lastName ?? null,
                    address: shipping.address ?? null,
                    city: shipping.city ?? null,
                    region: shipping.region ?? null,
                    email: shipping.email && !isPlaceholder(shipping.email) ? maskEmail(shipping.email) : null,
                    phone: shipping.phone ? maskPhone(shipping.phone) : null,
                },
                metadata: publicMetadata(meta),
                order_items: ((order as any).order_items || []).map((item: any) => ({
                    id: item.id,
                    product_id: item.product_id,
                    variant_id: item.variant_id,
                    product_name: item.product_name,
                    variant_name: item.variant_name,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    total_price: item.total_price,
                    metadata: {
                        image: item.metadata?.image ?? null,
                        preorder_shipping: item.metadata?.preorder_shipping ?? null,
                        is_preorder: item.metadata?.is_preorder === true || !!item.metadata?.preorder_shipping,
                    },
                })),
            },
        });
    } catch (err: any) {
        console.error('[OrderSummary] Error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
